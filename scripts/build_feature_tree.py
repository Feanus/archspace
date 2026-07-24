#!/usr/bin/env python3
"""Build the canonical Feature Tree projection from one-Feature JSON files."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
from collections import defaultdict
from pathlib import Path
from typing import Any, Mapping, Sequence

from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError

try:
    from scripts.validate_feature_tree import ROOT_ID, validate_document
except ModuleNotFoundError:  # Direct execution puts scripts/, not repo root, on sys.path.
    from validate_feature_tree import ROOT_ID, validate_document


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FEATURES_DIR = REPO_ROOT / "features"
DEFAULT_OUTPUT = REPO_ROOT / "data" / "feature-tree.json"
DEFAULT_SCHEMA = REPO_ROOT / "schema" / "feature-tree.schema.json"

# These reviewed identities and structural parents are immutable. Future Features
# may be added, but these records may not disappear or move without an explicit
# migration contract.
LOCKED_PARENT_BY_ID: dict[str, str | None] = {
    "feat-olmo3-standard": None,
    "feat-concept-segmented-topology": "feat-olmo3-standard",
    "feat-concept-hlm-predictor": "feat-concept-segmented-topology",
    "feat-concept-hlm-backbone-window": "feat-concept-hlm-predictor",
    "feat-concept-hlm-olmo3-layer-reuse": "feat-concept-hlm-predictor",
    "feat-concept-chunk-representation": "feat-olmo3-standard",
    "feat-concept-product-vq": "feat-concept-chunk-representation",
    "feat-concept-self-dd": "feat-olmo3-standard",
    "feat-concept-cumsum-self-dd": "feat-concept-self-dd",
    "feat-concept-cross-module-residual-read": "feat-olmo3-standard",
    "feat-concept-cross-module-cumsum-routes": "feat-concept-cross-module-residual-read",
}

LEGACY_SYNTHETIC_IDS = {
    "feat-context-prediction-objective",
    "feat-context-retrieval-cache",
    "feat-data-quality-gate",
    "feat-evaluation-harness",
    "feat-long-context-window",
    "feat-noise-curriculum",
    "feat-semantic-dedup-filter",
}
SYNTHETIC_ID_MARKER = re.compile(r"(?:^|-)(?:example|fixture|synthetic)(?:-|$)")


class BuildError(ValueError):
    """The source Feature files cannot produce a valid canonical projection."""


def _load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except OSError as error:
        raise BuildError(f"cannot read {path}: {error}") from error
    except json.JSONDecodeError as error:
        raise BuildError(f"invalid JSON in {path}: {error}") from error


def load_feature_files(features_dir: Path) -> list[dict[str, Any]]:
    """Load source records and enforce one file equals one matching Feature ID."""

    paths = sorted(features_dir.glob("*.json"), key=lambda path: path.name)
    if not paths:
        raise BuildError(f"no Feature JSON files found in {features_dir}")

    features: list[dict[str, Any]] = []
    id_paths: dict[str, list[Path]] = defaultdict(list)
    errors: list[str] = []
    for path in paths:
        record = _load_json(path)
        if not isinstance(record, dict):
            errors.append(f"{path}: source record must be a JSON object")
            continue
        feature_id = record.get("id")
        if not isinstance(feature_id, str):
            errors.append(f"{path}: source record needs a string id")
            continue
        expected_name = f"{feature_id}.json"
        if path.name != expected_name:
            errors.append(f"{path}: filename must be {expected_name!r} for Feature ID {feature_id!r}")
        id_paths[feature_id].append(path)
        features.append(record)

    for feature_id, duplicates in sorted(id_paths.items()):
        if len(duplicates) > 1:
            errors.append(
                f"duplicate Feature ID {feature_id!r} in {[str(path) for path in duplicates]}"
            )
    if errors:
        raise BuildError("\n".join(sorted(errors)))
    return features


def _locked_contract_errors(features: list[dict[str, Any]]) -> list[str]:
    by_id = {feature["id"]: feature for feature in features}
    errors: list[str] = []
    for feature_id, parent_id in LOCKED_PARENT_BY_ID.items():
        feature = by_id.get(feature_id)
        if feature is None:
            errors.append(f"required reviewed Feature file is missing: {feature_id}.json")
            continue
        if feature.get("parent_id") != parent_id:
            errors.append(
                f"locked parent mismatch for {feature_id!r}: expected {parent_id!r}, "
                f"found {feature.get('parent_id')!r}"
            )
    for feature_id in sorted(by_id):
        slug = feature_id.removeprefix("feat-")
        if feature_id in LEGACY_SYNTHETIC_IDS or SYNTHETIC_ID_MARKER.search(slug):
            errors.append(f"synthetic/example Feature ID is forbidden in canonical sources: {feature_id!r}")
    return errors


def _tree_preorder(features: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_id = {feature["id"]: feature for feature in features}
    children: dict[str, list[str]] = defaultdict(list)
    for feature in features:
        parent_id = feature.get("parent_id")
        if isinstance(parent_id, str):
            children[parent_id].append(feature["id"])
    for child_ids in children.values():
        child_ids.sort()

    ordered: list[dict[str, Any]] = []

    def visit(feature_id: str) -> None:
        ordered.append(by_id[feature_id])
        for child_id in children[feature_id]:
            visit(child_id)

    visit(ROOT_ID)
    return ordered


def build_document(features_dir: Path, schema_path: Path = DEFAULT_SCHEMA) -> dict[str, Any]:
    """Load, validate and deterministically order the formal Feature sources."""

    schema = _load_json(schema_path)
    if not isinstance(schema, dict):
        raise BuildError(f"schema must be a JSON object: {schema_path}")
    try:
        Draft202012Validator.check_schema(schema)
    except SchemaError as error:
        raise BuildError(f"invalid JSON Schema {schema_path}: {error.message}") from error

    features = load_feature_files(features_dir)
    provisional = sorted(features, key=lambda feature: (feature["id"] != ROOT_ID, feature["id"]))
    document = {
        "schema_version": "1.0.0",
        "tree_id": "internspace-feature-tree",
        "features": provisional,
    }
    issues = validate_document(document, schema, require_formal=True)
    errors = [f"{issue.code} {issue.path}: {issue.message}" for issue in issues]
    errors.extend(_locked_contract_errors(features))
    if errors:
        raise BuildError("\n".join(sorted(set(errors))))

    document["features"] = _tree_preorder(features)
    return document


def serialize_document(document: Mapping[str, Any]) -> bytes:
    """Return the only canonical byte representation used by build and check."""

    return (json.dumps(document, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def expected_projection_bytes(
    features_dir: Path = DEFAULT_FEATURES_DIR,
    schema_path: Path = DEFAULT_SCHEMA,
) -> bytes:
    return serialize_document(build_document(features_dir, schema_path))


def projection_is_current(
    features_dir: Path = DEFAULT_FEATURES_DIR,
    output_path: Path = DEFAULT_OUTPUT,
    schema_path: Path = DEFAULT_SCHEMA,
) -> bool:
    expected = expected_projection_bytes(features_dir, schema_path)
    try:
        actual = output_path.read_bytes()
    except FileNotFoundError:
        return False
    except OSError as error:
        raise BuildError(f"cannot read generated projection {output_path}: {error}") from error
    return actual == expected


def atomic_write(path: Path, content: bytes) -> None:
    """Write content beside the target, fsync it, then atomically replace target."""

    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb",
            prefix=f".{path.name}.",
            suffix=".tmp",
            dir=path.parent,
            delete=False,
        ) as handle:
            temporary_path = Path(handle.name)
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, path)
        temporary_path = None
        if hasattr(os, "O_DIRECTORY"):
            directory_fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


def write_projection(
    features_dir: Path = DEFAULT_FEATURES_DIR,
    output_path: Path = DEFAULT_OUTPUT,
    schema_path: Path = DEFAULT_SCHEMA,
) -> bytes:
    content = expected_projection_bytes(features_dir, schema_path)
    atomic_write(output_path, content)
    return content


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--features-dir", type=Path, default=DEFAULT_FEATURES_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--schema", type=Path, default=DEFAULT_SCHEMA)
    parser.add_argument(
        "--check",
        action="store_true",
        help="validate sources and fail if the generated projection is missing or stale",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        if args.check:
            if projection_is_current(args.features_dir, args.output, args.schema):
                count = len(load_feature_files(args.features_dir))
                print(f"CURRENT: {args.output} matches {count} formal Feature source files")
                return 0
            print(f"STALE: {args.output} does not match formal Feature sources", file=sys.stderr)
            return 1
        content = write_projection(args.features_dir, args.output, args.schema)
        document = json.loads(content)
        print(f"WROTE: {args.output} from {len(document['features'])} formal Feature source files")
        return 0
    except BuildError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
