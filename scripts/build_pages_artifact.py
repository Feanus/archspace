#!/usr/bin/env python3
"""Build and validate the public GitHub Pages artifact with an explicit whitelist."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
import tempfile
from html.parser import HTMLParser
from pathlib import Path, PurePosixPath
from typing import Iterable, Sequence
from urllib.parse import urlsplit

try:
    from scripts.validate_experiments import DEFAULT_SCHEMA as DEFAULT_EXPERIMENT_SCHEMA
    from scripts.validate_experiments import validate_files as validate_experiment_files
except ModuleNotFoundError:  # pragma: no cover - direct script execution fallback
    from validate_experiments import DEFAULT_SCHEMA as DEFAULT_EXPERIMENT_SCHEMA
    from validate_experiments import validate_files as validate_experiment_files


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = Path(tempfile.gettempdir()) / "internspace-pages"
PROJECT_BASE = "/InternSpace/"

FIXED_RUNTIME_FILES = (
    Path(".nojekyll"),
    Path("index.html"),
    Path("web/index.html"),
    Path("web/styles.css"),
    Path("data/feature-tree.json"),
    Path("data/experiments.json"),
    Path("data/template-test-data.json"),
)
BLOCKED_DIRECTORY_NAMES = {
    ".git",
    ".github",
    "docs",
    "evaluation",
    "features",
    "ingest",
    "node_modules",
    "schema",
    "scripts",
    "sources",
    "test-results",
    "tests",
}
TOKEN_PATTERNS = (
    re.compile(r"github_pat_[A-Za-z0-9_]{10,}"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b"),
    re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b"),
    re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._-]{12,}"),
    re.compile(
        r"(?i)\b(?:access[_-]?token|api[_-]?key|client[_-]?secret|private[_-]?token)"
        r"\s*[:=]\s*['\"]?[A-Za-z0-9._-]{8,}"
    ),
)
INTERNAL_PATH_PATTERNS = (
    re.compile(r"(?<![A-Za-z0-9])/(?:home|root|mnt|private|Users)/[^\s'\"<>]+"),
    re.compile(r"[A-Za-z]:\\Users\\[^\s'\"<>]+"),
)
SIMULATED_TELEMETRY_KEY = re.compile(
    r"(?i)(?:(?:demo|mock|simulat)[a-z_-]*(?:telemetry|loss|throughput|progress)|"
    r"(?:telemetry|loss|throughput|progress)[a-z_-]*(?:demo|mock|simulat))"
)
SIMULATED_TELEMETRY_VALUE = re.compile(
    r"(?i)\b(?:demo|mock|simulated|simulation)\s+(?:telemetry|loss|throughput|progress)\b"
)
JS_IMPORT = re.compile(
    r"(?:^|\n)\s*(?:import|export)\s+(?:[^'\";]+?\s+from\s+)?['\"]([^'\"]+)['\"]",
    re.MULTILINE,
)
DEFAULT_DATA_URL = re.compile(
    r"loadFeatureTree\s*\(\s*url\s*=\s*['\"]([^'\"]+feature-tree\.json)['\"]"
)
DEFAULT_MODEL_DATA_URL = re.compile(
    r"loadModelGraph\s*\(\s*url\s*=\s*['\"]([^'\"]+template-test-data\.json)['\"]"
)


class ArtifactError(ValueError):
    """The selected public artifact is unsafe or internally inconsistent."""


class _HtmlLinks(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.references: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        for name in ("href", "src"):
            value = values.get(name)
            if value:
                self.references.append(value)
        if tag.lower() == "meta" and values.get("http-equiv", "").lower() == "refresh":
            match = re.search(r"(?i)\burl\s*=\s*([^;]+)", values.get("content", ""))
            if match:
                self.references.append(match.group(1).strip(" '\""))


def runtime_paths(repo_root: Path = REPO_ROOT) -> tuple[Path, ...]:
    source_modules = sorted(
        path.relative_to(repo_root)
        for path in (repo_root / "web" / "src").rglob("*.js")
        if path.is_file()
    )
    return tuple(sorted((*FIXED_RUNTIME_FILES, *source_modules), key=lambda path: path.as_posix()))


def _walk_json(value: object, path: tuple[object, ...] = ()) -> Iterable[tuple[tuple[object, ...], object]]:
    yield path, value
    if isinstance(value, dict):
        for key, child in value.items():
            yield from _walk_json(child, (*path, key))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from _walk_json(child, (*path, index))


def reject_demo_telemetry_in_canonical(data_path: Path) -> None:
    try:
        document = json.loads(data_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ArtifactError(f"cannot inspect canonical JSON {data_path}: {error}") from error
    for path, value in _walk_json(document):
        if path and isinstance(path[-1], str) and SIMULATED_TELEMETRY_KEY.search(path[-1]):
            raise ArtifactError(f"simulated DEMO telemetry key is forbidden in canonical JSON: {path}")
        if isinstance(value, str) and SIMULATED_TELEMETRY_VALUE.search(value):
            raise ArtifactError(f"simulated DEMO telemetry value is forbidden in canonical JSON: {path}")


def _scan_public_text(path: Path, text: str) -> None:
    for pattern in TOKEN_PATTERNS:
        if pattern.search(text):
            raise ArtifactError(f"token-like value found in public artifact: {path}")
    for pattern in INTERNAL_PATH_PATTERNS:
        if pattern.search(text):
            raise ArtifactError(f"internal absolute path found in public artifact: {path}")


def _resolve_reference(base_file: Path, reference: str) -> Path | None:
    parsed = urlsplit(reference)
    if parsed.scheme or parsed.netloc or reference.startswith(("#", "mailto:", "tel:", "data:")):
        return None
    path = parsed.path
    if not path:
        return None
    if path.startswith(PROJECT_BASE):
        path = path[len(PROJECT_BASE) :]
        target = PurePosixPath(path)
    elif path.startswith("/"):
        raise ArtifactError(
            f"root-absolute URL {reference!r} is incompatible with project Pages base {PROJECT_BASE}"
        )
    else:
        target = PurePosixPath(base_file.parent.as_posix()) / path
    normalized = PurePosixPath(*[part for part in target.parts if part not in ("", ".")])
    if ".." in normalized.parts:
        parts: list[str] = []
        for part in normalized.parts:
            if part == "..":
                if not parts:
                    raise ArtifactError(f"reference escapes artifact root: {reference!r} from {base_file}")
                parts.pop()
            else:
                parts.append(part)
        normalized = PurePosixPath(*parts)
    result = Path(normalized.as_posix())
    if path.endswith("/") or result.suffix == "":
        result /= "index.html"
    return result


def check_static_links(artifact_root: Path) -> tuple[Path, ...]:
    files = {
        path.relative_to(artifact_root)
        for path in artifact_root.rglob("*")
        if path.is_file()
    }
    checked: set[Path] = set()
    for html_path in sorted(path for path in files if path.suffix == ".html"):
        parser = _HtmlLinks()
        parser.feed((artifact_root / html_path).read_text(encoding="utf-8"))
        for reference in parser.references:
            target = _resolve_reference(html_path, reference)
            if target is not None:
                checked.add(target)
                if target not in files:
                    raise ArtifactError(f"broken static link {reference!r} in {html_path}: missing {target}")

    for module_path in sorted(path for path in files if path.suffix == ".js"):
        source = (artifact_root / module_path).read_text(encoding="utf-8")
        for reference in JS_IMPORT.findall(source):
            if not reference.startswith("."):
                continue
            target = _resolve_reference(module_path, reference)
            if target is not None:
                checked.add(target)
                if target not in files:
                    raise ArtifactError(f"broken JavaScript import {reference!r} in {module_path}")

    adapter_path = Path("web/src/data-adapter.js")
    adapter_source = (artifact_root / adapter_path).read_text(encoding="utf-8")
    match = DEFAULT_DATA_URL.search(adapter_source)
    if not match:
        raise ArtifactError("cannot locate the default Feature Tree data URL in web/src/data-adapter.js")
    data_target = _resolve_reference(Path("web/index.html"), match.group(1))
    if data_target is None or data_target not in files:
        raise ArtifactError(f"default Feature Tree data URL does not resolve in artifact: {match.group(1)!r}")
    checked.add(data_target)
    experiments_target = Path("data/experiments.json")
    if experiments_target not in files:
        raise ArtifactError("default Experiment Index data URL does not resolve in artifact: 'data/experiments.json'")
    checked.add(experiments_target)

    model_adapter_path = Path("web/src/model-data-adapter.js")
    model_adapter_source = (artifact_root / model_adapter_path).read_text(encoding="utf-8")
    model_match = DEFAULT_MODEL_DATA_URL.search(model_adapter_source)
    if not model_match:
        raise ArtifactError("cannot locate the default offline model data URL in web/src/model-data-adapter.js")
    model_data_target = _resolve_reference(Path("web/index.html"), model_match.group(1))
    if model_data_target is None or model_data_target not in files:
        raise ArtifactError(
            f"default offline model data URL does not resolve in artifact: {model_match.group(1)!r}"
        )
    checked.add(model_data_target)

    required = {
        Path("index.html"),
        Path("web/index.html"),
        Path("web/styles.css"),
        Path("web/src/app.js"),
        Path("web/src/model-app.js"),
        Path("web/src/model-data-adapter.js"),
        Path("web/src/model-detail-view.js"),
        Path("data/feature-tree.json"),
        Path("data/experiments.json"),
        Path("data/template-test-data.json"),
    }
    missing = sorted(required - files)
    if missing:
        raise ArtifactError(f"required Pages routes are missing: {[path.as_posix() for path in missing]}")
    return tuple(sorted(checked, key=lambda path: path.as_posix()))


def validate_artifact(artifact_root: Path, repo_root: Path = REPO_ROOT) -> tuple[Path, ...]:
    expected = set(runtime_paths(repo_root))
    actual = {
        path.relative_to(artifact_root)
        for path in artifact_root.rglob("*")
        if path.is_file()
    }
    if actual != expected:
        unexpected = sorted(actual - expected)
        missing = sorted(expected - actual)
        raise ArtifactError(
            "artifact whitelist mismatch: "
            f"unexpected={[path.as_posix() for path in unexpected]}, "
            f"missing={[path.as_posix() for path in missing]}"
        )
    for relative in actual:
        if BLOCKED_DIRECTORY_NAMES.intersection(relative.parts):
            raise ArtifactError(f"non-public directory entered Pages artifact: {relative}")
        path = artifact_root / relative
        if path.is_symlink():
            raise ArtifactError(f"symlinks are forbidden in Pages artifact: {relative}")
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError as error:
            raise ArtifactError(f"unexpected binary file in Pages artifact: {relative}") from error
        _scan_public_text(relative, text)
    return check_static_links(artifact_root)


def build_artifact(output: Path, repo_root: Path = REPO_ROOT) -> tuple[Path, ...]:
    repo_root = repo_root.resolve()
    output = output.resolve()
    if output == repo_root or output in repo_root.parents:
        raise ArtifactError("artifact output may not replace the repository or one of its parents")

    sources = runtime_paths(repo_root)
    for relative in sources:
        source = repo_root / relative
        if not source.is_file() or source.is_symlink():
            raise ArtifactError(f"missing or unsafe runtime source: {relative}")
    reject_demo_telemetry_in_canonical(repo_root / "data" / "feature-tree.json")
    experiment_issues = validate_experiment_files(
        data_path=repo_root / "data" / "experiments.json",
        schema_path=DEFAULT_EXPERIMENT_SCHEMA,
        feature_tree_path=repo_root / "data" / "feature-tree.json",
    )
    if experiment_issues:
        first = experiment_issues[0]
        raise ArtifactError(f"experiment index invalid: {first.code} {first.path}: {first.message}")

    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="internspace-pages-stage-", dir=output.parent) as stage_name:
        stage = Path(stage_name)
        for relative in sources:
            destination = stage / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(repo_root / relative, destination)
        validate_artifact(stage, repo_root)
        if output.exists():
            if output.is_dir():
                shutil.rmtree(output)
            else:
                output.unlink()
        shutil.copytree(stage, output)
    return validate_artifact(output, repo_root)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        checked_links = build_artifact(args.output)
        files = runtime_paths()
        print(f"ARTIFACT_OK {args.output} ({len(files)} files)")
        for path in files:
            print(path.as_posix())
        print(f"LINKS_OK {len(checked_links)} local targets under {PROJECT_BASE}")
        return 0
    except ArtifactError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
