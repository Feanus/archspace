#!/usr/bin/env python3
"""Validate one Feature proposal and dry-run or atomically append it."""

from __future__ import annotations

import argparse
import copy
import difflib
import json
import os
import re
import sys
import tempfile
from pathlib import Path
from typing import Any

import yaml
from jsonschema import Draft202012Validator


ROOT_ID = "feat-olmo3-standard"
ID_RE = re.compile(r"^feat-[a-z][a-z0-9]*(?:-[a-z0-9]+)*$")
ALLOWED_STATUSES = {"proposed", "implementing", "validating", "analyzed", "abandoned"}
IMPLEMENTATION_FIELDS = ("commits", "sessions", "code_symbols")
DEFAULT_SCHEMA = Path(__file__).resolve().parents[1] / "schema" / "feature-tree.schema.json"


class ContractError(ValueError):
    pass


def load_document(path: Path) -> Any:
    text = path.read_text(encoding="utf-8")
    return load_document_from_text(text, path)


def load_document_from_text(text: str, path: Path) -> Any:
    if path.suffix.lower() == ".json":
        return json.loads(text)
    return yaml.safe_load(text)


def dump_document(value: Any, path: Path) -> str:
    if path.suffix.lower() == ".json":
        return json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    return yaml.safe_dump(value, allow_unicode=True, sort_keys=False, width=1000)


def _matching_array_end(text: str, start: int) -> int:
    depth = 0
    in_string = False
    escaped = False
    for index in range(start, len(text)):
        character = text[index]
        if in_string:
            if escaped:
                escaped = False
            elif character == "\\":
                escaped = True
            elif character == '"':
                in_string = False
            continue
        if character == '"':
            in_string = True
        elif character == "[":
            depth += 1
        elif character == "]":
            depth -= 1
            if depth == 0:
                return index
    raise ContractError("cannot locate the end of the JSON Feature array")


def append_json_text(
    original_text: str,
    container_key: str | None,
    proposal: dict[str, Any],
) -> str:
    if container_key is None:
        match = re.search(r"\[", original_text)
    else:
        encoded_key = re.escape(json.dumps(container_key))
        match = re.search(rf"{encoded_key}\s*:\s*\[", original_text)
    if not match:
        raise ContractError("cannot locate the JSON Feature array")
    array_start = original_text.find("[", match.start())
    array_end = _matching_array_end(original_text, array_start)
    whitespace_start = array_end
    while whitespace_start > array_start and original_text[whitespace_start - 1].isspace():
        whitespace_start -= 1
    trailing_whitespace = original_text[whitespace_start:array_end]
    closing_indent = trailing_whitespace.rsplit("\n", 1)[-1] if "\n" in trailing_whitespace else ""
    element_indent = closing_indent + "  "
    rendered = json.dumps(proposal, ensure_ascii=False, indent=2)
    rendered = "\n".join(element_indent + line for line in rendered.splitlines())
    has_items = bool(original_text[array_start + 1:whitespace_start].strip())
    separator = ",\n" if has_items else "\n"
    replacement = separator + rendered + "\n" + closing_indent
    return original_text[:whitespace_start] + replacement + original_text[array_end:]


def extract_features(document: Any) -> tuple[list[dict[str, Any]], str | None]:
    if isinstance(document, list):
        features = document
        container_key = None
    elif isinstance(document, dict):
        if isinstance(document.get("features"), list):
            features = document["features"]
            container_key = "features"
        elif isinstance(document.get("nodes"), list):
            features = document["nodes"]
            container_key = "nodes"
        else:
            raise ContractError("data must be a Feature list or contain a features/nodes list")
    else:
        raise ContractError("data document must be a list or mapping")
    if not all(isinstance(feature, dict) for feature in features):
        raise ContractError("every data entry must be a mapping")
    return features, container_key


def extract_proposal(document: Any) -> dict[str, Any]:
    if isinstance(document, dict) and isinstance(document.get("feature"), dict):
        document = document["feature"]
    if not isinstance(document, dict):
        raise ContractError("proposal must be a Feature mapping or contain a feature mapping")
    return document


def _require_text(mapping: dict[str, Any], field: str, prefix: str = "proposal") -> None:
    if not isinstance(mapping.get(field), str) or not mapping[field].strip():
        raise ContractError(f"{prefix}.{field} must be a non-empty string")


def validate_tree(features: list[dict[str, Any]]) -> None:
    ids: list[str] = []
    for index, feature in enumerate(features):
        feature_id = feature.get("id")
        if not isinstance(feature_id, str):
            raise ContractError(f"data feature at index {index} has no string id")
        ids.append(feature_id)
    duplicates = sorted({feature_id for feature_id in ids if ids.count(feature_id) > 1})
    if duplicates:
        raise ContractError(f"duplicate Feature ids: {', '.join(duplicates)}")

    by_id = {feature["id"]: feature for feature in features}
    roots = [feature for feature in features if feature.get("parent_id") is None]
    if len(roots) != 1 or roots[0].get("id") != ROOT_ID:
        raise ContractError(f"tree must have exactly one root, {ROOT_ID}")
    for feature in features:
        feature_id = feature["id"]
        parent_id = feature.get("parent_id")
        if feature_id == ROOT_ID:
            if feature.get("kind") not in {"baseline", "feature"}:
                raise ContractError("root kind must be baseline or feature")
            continue
        if feature.get("kind") != "feature":
            raise ContractError(f"{feature_id} is not a Feature node")
        if not isinstance(parent_id, str):
            raise ContractError(f"{feature_id} must have exactly one string parent_id")
        if parent_id not in by_id:
            raise ContractError(f"{feature_id} references missing parent {parent_id}")

    for feature_id in by_id:
        seen: set[str] = set()
        cursor = feature_id
        while cursor != ROOT_ID:
            if cursor in seen:
                raise ContractError(f"cycle detected from {feature_id}")
            seen.add(cursor)
            parent = by_id[cursor].get("parent_id")
            if parent not in by_id:
                raise ContractError(f"{feature_id} is not connected to {ROOT_ID}")
            cursor = parent


def validate_proposal(proposal: dict[str, Any], existing: list[dict[str, Any]]) -> None:
    feature_id = proposal.get("id")
    if not isinstance(feature_id, str) or not ID_RE.fullmatch(feature_id):
        raise ContractError("proposal.id must match feat-[a-z0-9-]+ with stable lowercase segments")
    if feature_id == ROOT_ID:
        raise ContractError("a proposal cannot replace or create the structural root")
    if feature_id in {feature.get("id") for feature in existing}:
        raise ContractError(f"Feature id already exists: {feature_id}")
    if proposal.get("kind") != "feature":
        raise ContractError("proposal.kind must be feature; component/source/commit nodes are forbidden")
    if proposal.get("record_type") != "feature":
        raise ContractError("proposal.record_type must be feature")
    if proposal.get("baseline") is not None:
        raise ContractError("only the root may carry baseline facts")

    parent_id = proposal.get("parent_id")
    if not isinstance(parent_id, str):
        raise ContractError("proposal.parent_id must be exactly one Feature id")
    if parent_id not in {feature.get("id") for feature in existing}:
        raise ContractError(f"proposal.parent_id does not exist: {parent_id}")
    if proposal.get("status") not in ALLOWED_STATUSES:
        allowed = ", ".join(sorted(ALLOWED_STATUSES))
        raise ContractError(f"proposal.status must be one of: {allowed}")
    for field in ("title", "summary", "hypothesis", "design"):
        _require_text(proposal, field)

    delta = proposal.get("delta")
    if not isinstance(delta, dict):
        raise ContractError("proposal.delta must be a mapping")
    _require_text(delta, "summary", "proposal.delta")
    operations = delta.get("operations")
    if not isinstance(operations, list):
        raise ContractError("proposal.delta.operations must be a list")
    for index, operation in enumerate(operations):
        prefix = f"proposal.delta.operations[{index}]"
        if not isinstance(operation, dict):
            raise ContractError(f"{prefix} must be a mapping")
        _require_text(operation, "target", prefix)
        if "before" not in operation or "after" not in operation:
            raise ContractError(f"{prefix} must preserve before and after")
        _require_text(operation, "rationale", prefix)
        evidence_ids = operation.get("evidence_ids")
        if not isinstance(evidence_ids, list):
            raise ContractError(f"{prefix}.evidence_ids must be a list")

    implementation = proposal.get("implementation")
    if not isinstance(implementation, dict):
        raise ContractError("proposal.implementation must be a mapping")
    for field in (*IMPLEMENTATION_FIELDS, "component_changes"):
        if not isinstance(implementation.get(field), list):
            raise ContractError(f"proposal.implementation.{field} must be a list")

    evidence = proposal.get("evidence")
    if not isinstance(evidence, list):
        raise ContractError("proposal.evidence must be a list")
    if proposal["status"] in {"validating", "analyzed", "abandoned"} and not evidence:
        raise ContractError(f"proposal.evidence cannot be empty for status {proposal['status']}")

    for field in ("experiments", "depends_on", "related_to"):
        if not isinstance(proposal.get(field), list):
            raise ContractError(f"proposal.{field} must be a list")
    for field in ("depends_on", "related_to"):
        for reference in proposal[field]:
            if not isinstance(reference, str):
                raise ContractError(f"proposal.{field} entries must be Feature ids")
            if reference not in {feature.get("id") for feature in existing}:
                raise ContractError(f"proposal.{field} references missing Feature {reference}")

    provenance = proposal.get("provenance")
    if not isinstance(provenance, dict):
        raise ContractError("proposal.provenance must be a mapping")
    if not isinstance(provenance.get("sources"), dict) or not provenance["sources"]:
        raise ContractError("proposal.provenance.sources must be a non-empty mapping")
    if not isinstance(provenance.get("fields"), dict):
        raise ContractError("proposal.provenance.fields must be a mapping")


def validate_schema(document: Any, schema_path: Path | None) -> None:
    if schema_path is None:
        return
    try:
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ContractError(f"cannot load canonical schema {schema_path}: {exc}") from exc
    errors = sorted(Draft202012Validator(schema).iter_errors(document), key=lambda error: list(error.path))
    if errors:
        first = errors[0]
        location = ".".join(str(part) for part in first.absolute_path) or "document"
        raise ContractError(f"canonical schema violation at {location}: {first.message}")


def append_feature(document: Any, container_key: str | None, proposal: dict[str, Any]) -> Any:
    updated = copy.deepcopy(document)
    if container_key is None:
        updated.append(copy.deepcopy(proposal))
    else:
        updated[container_key].append(copy.deepcopy(proposal))
    return updated


def make_diff(old_text: str, new_text: str, path: Path) -> str:
    return "".join(
        difflib.unified_diff(
            old_text.splitlines(keepends=True),
            new_text.splitlines(keepends=True),
            fromfile=str(path),
            tofile=f"{path} (proposed)",
        )
    )


def atomic_write(path: Path, text: str) -> None:
    mode = path.stat().st_mode & 0o777
    fd, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, mode)
        os.replace(temporary, path)
        directory_fd = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise


def run(
    data_path: Path,
    proposal_path: Path,
    apply: bool = False,
    schema_path: Path | None = DEFAULT_SCHEMA,
) -> str:
    original_text = data_path.read_text(encoding="utf-8")
    document = load_document(data_path)
    features, container_key = extract_features(document)
    validate_tree(features)
    proposal = extract_proposal(load_document(proposal_path))
    validate_proposal(proposal, features)

    updated = append_feature(document, container_key, proposal)
    updated_features, _ = extract_features(updated)
    validate_tree(updated_features)
    validate_schema(updated, schema_path if schema_path and schema_path.exists() else None)
    if data_path.suffix.lower() == ".json":
        new_text = append_json_text(original_text, container_key, proposal)
        if load_document_from_text(new_text, data_path) != updated:
            raise ContractError("serialized JSON does not match the validated append")
    else:
        new_text = dump_document(updated, data_path)
    diff = make_diff(original_text, new_text, data_path)
    if not diff:
        raise ContractError("proposal produced no diff")
    if apply:
        atomic_write(data_path, new_text)
    return diff


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", required=True, type=Path)
    parser.add_argument("--proposal", required=True, type=Path)
    parser.add_argument("--schema", type=Path, default=DEFAULT_SCHEMA)
    parser.add_argument("--apply", action="store_true", help="atomically append after validation")
    args = parser.parse_args(argv)
    try:
        diff = run(args.data, args.proposal, apply=args.apply, schema_path=args.schema)
    except (OSError, json.JSONDecodeError, yaml.YAMLError, ContractError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    print(diff, end="" if diff.endswith("\n") else "\n")
    print("APPLIED" if args.apply else "DRY-RUN: no files changed", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
