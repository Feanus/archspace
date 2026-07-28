from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from pathlib import Path

from scripts.build_pages_artifact import (
    ArtifactError,
    BLOCKED_DIRECTORY_NAMES,
    PROJECT_BASE,
    REPO_ROOT,
    build_artifact,
    runtime_paths,
    validate_artifact,
)


WORKFLOW = REPO_ROOT / ".github" / "workflows" / "pages.yml"


class PagesArtifactTests(unittest.TestCase):
    def copy_public_sources(self, destination: Path) -> Path:
        for relative in runtime_paths(REPO_ROOT):
            target = destination / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(REPO_ROOT / relative, target)
        return destination

    def test_artifact_contains_only_the_public_runtime_whitelist(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "site"
            build_artifact(output)
            actual = {
                path.relative_to(output)
                for path in output.rglob("*")
                if path.is_file()
            }
            self.assertEqual(set(runtime_paths(REPO_ROOT)), actual)
            self.assertFalse(any(BLOCKED_DIRECTORY_NAMES.intersection(path.parts) for path in actual))
            self.assertNotIn(Path("web/package.json"), actual)
            self.assertNotIn(Path("web/package-lock.json"), actual)

    def test_static_links_resolve_for_project_pages_and_local_web_entry(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "site"
            checked = set(build_artifact(output))
            self.assertEqual("/archspace/", PROJECT_BASE)
            self.assertIn(Path("web/index.html"), checked)
            self.assertIn(Path("web/styles.css"), checked)
            self.assertIn(Path("web/src/model-app.js"), checked)
            self.assertIn(Path("web/src/model-data-adapter.js"), checked)
            self.assertIn(Path("data/feature-tree.json"), checked)
            self.assertIn(Path("data/experiments.json"), checked)
            self.assertIn(Path("data/template-test-data.json"), checked)

    def test_root_page_discloses_experiment_cursor_policy_before_entering_web_app(self) -> None:
        text = (REPO_ROOT / "index.html").read_text(encoding="utf-8")
        self.assertIn("Experiment cursors", text)
        self.assertIn("不会补写假 loss", text)
        self.assertIn('href="./web/"', text)
        self.assertIn("url=./web/", text)

    def test_token_like_value_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = self.copy_public_sources(Path(directory) / "repo")
            path = root / "index.html"
            path.write_text(
                path.read_text(encoding="utf-8") + "github_pat_abcdefghijklmnopqrstuvwxyz0123456789",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ArtifactError, "token-like"):
                build_artifact(Path(directory) / "site", root)

    def test_internal_absolute_path_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = self.copy_public_sources(Path(directory) / "repo")
            path = root / "web" / "styles.css"
            path.write_text(path.read_text(encoding="utf-8") + "\n/* /mnt/private/run.log */\n", encoding="utf-8")
            with self.assertRaisesRegex(ArtifactError, "internal absolute path"):
                build_artifact(Path(directory) / "site", root)

    def test_demo_telemetry_cannot_be_written_into_canonical_json(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = self.copy_public_sources(Path(directory) / "repo")
            path = root / "data" / "feature-tree.json"
            document = json.loads(path.read_text(encoding="utf-8"))
            document["features"][0]["simulated_loss"] = 1.234
            path.write_text(json.dumps(document, ensure_ascii=False), encoding="utf-8")
            with self.assertRaisesRegex(ArtifactError, "DEMO telemetry"):
                build_artifact(Path(directory) / "site", root)

    def test_invalid_experiment_index_is_rejected_before_publish(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = self.copy_public_sources(Path(directory) / "repo")
            path = root / "data" / "experiments.json"
            document = json.loads(path.read_text(encoding="utf-8"))
            document["experiments"][0]["covered_feature_ids"] = ["feat-not-merged"]
            path.write_text(json.dumps(document, ensure_ascii=False), encoding="utf-8")
            with self.assertRaisesRegex(ArtifactError, "experiment index invalid"):
                build_artifact(Path(directory) / "site", root)

    def test_broken_runtime_link_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = self.copy_public_sources(Path(directory) / "repo")
            path = root / "web" / "index.html"
            path.write_text(
                path.read_text(encoding="utf-8").replace("./styles.css", "./missing.css"),
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ArtifactError, "broken static link"):
                build_artifact(Path(directory) / "site", root)

    def test_whitelist_validator_rejects_an_extra_file(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "site"
            build_artifact(output)
            extra = output / "evaluation" / "private-report.json"
            extra.parent.mkdir(parents=True)
            extra.write_text("{}", encoding="utf-8")
            with self.assertRaisesRegex(ArtifactError, "whitelist mismatch"):
                validate_artifact(output)

    def test_workflow_uses_exact_commit_official_pages_actions_and_minimum_permissions(self) -> None:
        text = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("ref: ${{ github.sha }}", text)
        self.assertIn("persist-credentials: false", text)
        self.assertIn("contents: read", text)
        self.assertIn("pages: write", text)
        self.assertIn("id-token: write", text)
        self.assertIn("actions/upload-pages-artifact@v3", text)
        self.assertIn("actions/deploy-pages@v4", text)
        self.assertIn("scripts/build_feature_tree.py --check", text)
        self.assertIn("scripts/validate_feature_tree.py", text)
        self.assertIn("scripts/validate_experiments.py", text)
        self.assertIn("npm test --prefix web", text)
        self.assertIn("if: github.event_name != 'repository_dispatch'", text)
        self.assertIn("if: github.event_name == 'repository_dispatch'", text)
        self.assertIn("node --test web/tests/unit/model-data-adapter.test.mjs", text)
        self.assertIn("web/scripts/verify-refreshed-snapshot.mjs", text)
        self.assertIn('cmp \\', text)
        self.assertIn('"$RUNNER_TEMP/internspace-pages/data/template-test-data.json"', text)
        self.assertIn("RmZeta2718/arch-test", text)
        self.assertIn("RmZeta2718 arch-test", text)
        self.assertIn('normalized_source="${SOURCE_REPOSITORY%/}"', text)
        self.assertNotIn("JT-Ushio/template-test", text)
        self.assertNotIn("concept_olmo", text)
        self.assertNotIn("secrets.", text)
        self.assertNotIn("github_pat_", text)


if __name__ == "__main__":
    unittest.main()
