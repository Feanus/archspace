from __future__ import annotations

import copy
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from scripts.build_feature_tree import (
    BuildError,
    DEFAULT_FEATURES_DIR,
    DEFAULT_OUTPUT,
    LEGACY_SYNTHETIC_IDS,
    LOCKED_PARENT_BY_ID,
    build_document,
    expected_projection_bytes,
    projection_is_current,
    write_projection,
)


REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = REPO_ROOT / "schema" / "feature-tree.schema.json"
BUILDER_PATH = REPO_ROOT / "scripts" / "build_feature_tree.py"


class FeatureTreeBuilderTests(unittest.TestCase):
    def copy_sources(self, root: Path) -> Path:
        target = root / "features"
        shutil.copytree(DEFAULT_FEATURES_DIR, target)
        return target

    @staticmethod
    def load(path: Path) -> dict:
        return json.loads(path.read_text(encoding="utf-8"))

    @staticmethod
    def write(path: Path, value: dict) -> None:
        path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    def test_eleven_source_files_build_the_checked_in_projection(self) -> None:
        files = sorted(DEFAULT_FEATURES_DIR.glob("*.json"))
        self.assertEqual(11, len(files))
        self.assertEqual(expected_projection_bytes(), DEFAULT_OUTPUT.read_bytes())
        document = build_document(DEFAULT_FEATURES_DIR, SCHEMA_PATH)
        self.assertEqual(11, len(document["features"]))

    def test_filename_equals_feature_id_for_every_source(self) -> None:
        for path in DEFAULT_FEATURES_DIR.glob("*.json"):
            self.assertEqual(f"{self.load(path)['id']}.json", path.name)

    def test_exact_locked_ids_and_parents_are_present(self) -> None:
        document = build_document(DEFAULT_FEATURES_DIR, SCHEMA_PATH)
        actual = {feature["id"]: feature["parent_id"] for feature in document["features"]}
        self.assertEqual(LOCKED_PARENT_BY_ID, actual)
        self.assertTrue(set(actual).isdisjoint(LEGACY_SYNTHETIC_IDS))

    def test_build_is_deterministic_and_parent_precedes_child(self) -> None:
        first = expected_projection_bytes()
        second = expected_projection_bytes()
        self.assertEqual(first, second)
        document = json.loads(first)
        positions = {feature["id"]: index for index, feature in enumerate(document["features"])}
        for feature_id, parent_id in LOCKED_PARENT_BY_ID.items():
            if parent_id is not None:
                self.assertLess(positions[parent_id], positions[feature_id])

    def test_checked_in_projection_is_current_and_cli_check_passes(self) -> None:
        self.assertTrue(projection_is_current())
        result = subprocess.run(
            [sys.executable, str(BUILDER_PATH), "--check"],
            cwd=REPO_ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertIn("CURRENT", result.stdout)

    def test_stale_projection_is_detected_without_writing(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            sources = self.copy_sources(root)
            output = root / "feature-tree.json"
            write_projection(sources, output, SCHEMA_PATH)
            original = output.read_bytes()
            output.write_bytes(original + b" ")
            stale = output.read_bytes()
            self.assertFalse(projection_is_current(sources, output, SCHEMA_PATH))
            self.assertEqual(stale, output.read_bytes())

    def test_cli_check_reports_stale_projection_without_rewriting_it(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            sources = self.copy_sources(root)
            output = root / "feature-tree.json"
            write_projection(sources, output, SCHEMA_PATH)
            output.write_bytes(output.read_bytes() + b" ")
            stale = output.read_bytes()
            result = subprocess.run(
                [
                    sys.executable,
                    str(BUILDER_PATH),
                    "--features-dir",
                    str(sources),
                    "--output",
                    str(output),
                    "--schema",
                    str(SCHEMA_PATH),
                    "--check",
                ],
                cwd=REPO_ROOT,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(1, result.returncode)
            self.assertIn("STALE", result.stderr)
            self.assertEqual(stale, output.read_bytes())

    def test_atomic_write_leaves_no_temporary_projection(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            sources = self.copy_sources(root)
            output = root / "data" / "feature-tree.json"
            write_projection(sources, output, SCHEMA_PATH)
            self.assertEqual(expected_projection_bytes(sources, SCHEMA_PATH), output.read_bytes())
            self.assertEqual([], list(output.parent.glob(f".{output.name}.*.tmp")))

    def test_missing_reviewed_feature_file_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            sources = self.copy_sources(Path(directory))
            (sources / "feat-concept-product-vq.json").unlink()
            with self.assertRaisesRegex(BuildError, "required reviewed Feature file is missing"):
                build_document(sources, SCHEMA_PATH)

    def test_duplicate_id_is_rejected_even_across_two_files(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            sources = self.copy_sources(Path(directory))
            duplicate = self.load(sources / "feat-concept-product-vq.json")
            self.write(sources / "feat-duplicate-copy.json", duplicate)
            with self.assertRaisesRegex(BuildError, "duplicate Feature ID"):
                build_document(sources, SCHEMA_PATH)

    def test_locked_parent_change_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            sources = self.copy_sources(Path(directory))
            path = sources / "feat-concept-product-vq.json"
            feature = self.load(path)
            feature["parent_id"] = "feat-olmo3-standard"
            self.write(path, feature)
            with self.assertRaisesRegex(BuildError, "locked parent mismatch"):
                build_document(sources, SCHEMA_PATH)

    def test_second_root_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            sources = self.copy_sources(Path(directory))
            root = copy.deepcopy(self.load(sources / "feat-olmo3-standard.json"))
            root["id"] = "feat-extra-root"
            self.write(sources / "feat-extra-root.json", root)
            with self.assertRaisesRegex(BuildError, "ROOT_SET"):
                build_document(sources, SCHEMA_PATH)

    def test_cycle_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            sources = self.copy_sources(Path(directory))
            path = sources / "feat-concept-segmented-topology.json"
            feature = self.load(path)
            feature["parent_id"] = "feat-concept-hlm-predictor"
            self.write(path, feature)
            with self.assertRaisesRegex(BuildError, "CYCLE"):
                build_document(sources, SCHEMA_PATH)

    def test_synthetic_id_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            sources = self.copy_sources(Path(directory))
            feature = copy.deepcopy(self.load(sources / "feat-concept-product-vq.json"))
            feature["id"] = "feat-synthetic-branch"
            feature["parent_id"] = "feat-olmo3-standard"
            self.write(sources / "feat-synthetic-branch.json", feature)
            with self.assertRaisesRegex(BuildError, "synthetic/example Feature ID"):
                build_document(sources, SCHEMA_PATH)


if __name__ == "__main__":
    unittest.main()
