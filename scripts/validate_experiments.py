#!/usr/bin/env python3
"""Offline, deterministic validation for the InternSpace Experiment Index v1."""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from collections import defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence
from urllib.parse import urlsplit

from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError


ROOT_ID = "feat-olmo3-standard"
WANDB_HOST = "wandb.ai"
REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA = REPO_ROOT / "data" / "experiments.json"
DEFAULT_SCHEMA = REPO_ROOT / "schema" / "experiment-index.schema.json"
DEFAULT_FEATURE_TREE = REPO_ROOT / "data" / "feature-tree.json"
TOKEN_PATTERNS = (
    re.compile(r"(?i)\baccess[_-]?token\b"),
    re.compile(r"(?i)\bapi[_-]?key\b"),
    re.compile(r"(?i)\bclient[_-]?secret\b"),
    re.compile(r"(?i)\bprivate[_-]?token\b"),
    re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._-]{12,}"),
    re.compile(r"github_pat_[A-Za-z0-9_]{10,}"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b"),
    re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b"),
)
INTERNAL_PATH_PATTERNS = (
    re.compile(r"(?<![A-Za-z0-9])/(?:home|root|mnt|private|Users)/[^\s'\"<>]+"),
    re.compile(r"[A-Za-z]:\\Users\\[^\s'\"<>]+"),
)
WANDb_CURSOR_TYPES = {"wandb-final", "wandb-replay"}


@dataclass(frozen=True, order=True)
class ValidationIssue:
    """One stable, machine-readable validation finding."""

    path: str
    code: str
    message: str


def _json_path(parts: Iterable[Any]) -> str:
    path = "$"
    for part in parts:
        if isinstance(part, int):
            path += f"[{part}]"
        elif isinstance(part, str) and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", part):
            path += f".{part}"
        else:
            path += f"[{json.dumps(part, ensure_ascii=False)}]"
    return path


def _schema_issues(data: Any, schema: Mapping[str, Any]) -> list[ValidationIssue]:
    validator = Draft202012Validator(schema)
    issues = []
    for error in validator.iter_errors(data):
        issues.append(
            ValidationIssue(
                path=_json_path(error.absolute_path),
                code="SCHEMA",
                message=error.message,
            )
        )
    return issues


def _experiment_records(data: Any) -> list[Any]:
    if not isinstance(data, dict):
        return []
    experiments = data.get("experiments")
    return experiments if isinstance(experiments, list) else []


def _walk_json(value: Any, path: tuple[Any, ...] = ()) -> Iterable[tuple[tuple[Any, ...], Any]]:
    yield path, value
    if isinstance(value, dict):
        for key, child in value.items():
            yield from _walk_json(child, (*path, key))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from _walk_json(child, (*path, index))


def _load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _feature_ids(feature_tree: Any) -> set[str]:
    if not isinstance(feature_tree, dict) or not isinstance(feature_tree.get("features"), list):
        return set()
    return {
        feature["id"]
        for feature in feature_tree["features"]
        if isinstance(feature, dict) and isinstance(feature.get("id"), str)
    }


def _safe_wandb_url(value: Any) -> bool:
    if not isinstance(value, str) or not value:
        return False
    parsed = urlsplit(value)
    return (
        parsed.scheme == "https"
        and parsed.hostname == WANDB_HOST
        and parsed.username is None
        and parsed.password is None
        and not parsed.query
        and not parsed.fragment
    )


def _finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _security_issues(data: Any) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for path, value in _walk_json(data):
        json_path = _json_path(path)
        if path and isinstance(path[-1], str):
            key = path[-1]
            for pattern in TOKEN_PATTERNS[:4]:
                if pattern.fullmatch(key) or pattern.search(key):
                    issues.append(
                        ValidationIssue(
                            json_path,
                            "CREDENTIAL_FIELD",
                            f"credential-like key {key!r} is forbidden in public experiment data",
                        )
                    )
        if not isinstance(value, str):
            continue
        for pattern in TOKEN_PATTERNS:
            if pattern.search(value):
                issues.append(
                    ValidationIssue(
                        json_path,
                        "CREDENTIAL_VALUE",
                        "credential-like value is forbidden in public experiment data",
                    )
                )
        for pattern in INTERNAL_PATH_PATTERNS:
            if pattern.search(value):
                issues.append(
                    ValidationIssue(
                        json_path,
                        "INTERNAL_PATH",
                        "internal absolute paths are forbidden in public experiment data",
                    )
                )
        parsed = urlsplit(value)
        if parsed.hostname == WANDB_HOST and not _safe_wandb_url(value):
            issues.append(
                ValidationIssue(
                    json_path,
                    "UNSAFE_WANDB_URL",
                    "W&B URLs must be credential-free https://wandb.ai URLs without query or fragment",
                )
            )
    return issues


def semantic_issues(data: Any, feature_tree: Any | None = None) -> list[ValidationIssue]:
    """Check invariants that JSON Schema cannot express."""

    issues: list[ValidationIssue] = []
    experiments = _experiment_records(data)
    known_feature_ids = _feature_ids(feature_tree)
    id_occurrences: dict[str, list[int]] = defaultdict(list)

    for index, experiment in enumerate(experiments):
        path = f"$.experiments[{index}]"
        if not isinstance(experiment, dict):
            continue
        experiment_id = experiment.get("id")
        if isinstance(experiment_id, str):
            id_occurrences[experiment_id].append(index)

        covered = experiment.get("covered_feature_ids")
        covered = covered if isinstance(covered, list) else []
        primary = experiment.get("primary_feature_ids")
        primary = primary if isinstance(primary, list) else []
        covered_set = {feature_id for feature_id in covered if isinstance(feature_id, str)}

        for field_name, feature_ids in (("covered_feature_ids", covered), ("primary_feature_ids", primary)):
            for feature_index, feature_id in enumerate(feature_ids):
                if not isinstance(feature_id, str):
                    continue
                if known_feature_ids and feature_id not in known_feature_ids:
                    issues.append(
                        ValidationIssue(
                            f"{path}.{field_name}[{feature_index}]",
                            "UNKNOWN_FEATURE",
                            f"experiment references unknown Feature {feature_id!r}",
                        )
                    )

        for primary_index, feature_id in enumerate(primary):
            if isinstance(feature_id, str) and feature_id not in covered_set:
                issues.append(
                    ValidationIssue(
                        f"{path}.primary_feature_ids[{primary_index}]",
                        "PRIMARY_NOT_COVERED",
                        f"primary Feature {feature_id!r} must also appear in covered_feature_ids",
                    )
                )

        wandb_url = experiment.get("wandb_url")
        if wandb_url is not None and not _safe_wandb_url(wandb_url):
            issues.append(
                ValidationIssue(
                    f"{path}.wandb_url",
                    "UNSAFE_WANDB_URL",
                    "wandb_url must be a credential-free https://wandb.ai URL without query or fragment",
                )
            )

        cursor_type = experiment.get("cursor_type")
        if cursor_type in WANDb_CURSOR_TYPES and not isinstance(wandb_url, str):
            issues.append(
                ValidationIssue(
                    f"{path}.wandb_url",
                    "WANDB_CURSOR_REQUIRES_URL",
                    f"{cursor_type} experiments require a sanitized wandb_url",
                )
            )

        replay = experiment.get("replay")
        replay = replay if isinstance(replay, dict) else {}
        replay_enabled = replay.get("enabled") is True
        trace = replay.get("loss_trace")
        numeric_trace = [value for value in trace if _finite_number(value)] if isinstance(trace, list) else []
        if cursor_type == "wandb-replay":
            if not replay_enabled or len(numeric_trace) < 2 or len(numeric_trace) != len(trace or []):
                issues.append(
                    ValidationIssue(
                        f"{path}.replay.loss_trace",
                        "WANDB_REPLAY_REQUIRES_TRACE",
                        "wandb-replay requires replay.enabled=true and at least two finite numeric loss_trace points",
                    )
                )
        elif replay_enabled:
            issues.append(
                ValidationIssue(
                    f"{path}.replay.enabled",
                    "REPLAY_WITHOUT_WANDB_REPLAY_CURSOR",
                    "only cursor_type=wandb-replay may enable replay",
                )
            )

    for experiment_id, indices in sorted(id_occurrences.items()):
        if len(indices) > 1:
            issues.append(
                ValidationIssue(
                    "$.experiments",
                    "DUPLICATE_EXPERIMENT_ID",
                    f"Experiment ID {experiment_id!r} occurs at indices {indices}",
                )
            )

    issues.extend(_security_issues(data))
    return sorted(set(issues))


def validate_document(
    data: Any,
    schema: Mapping[str, Any],
    *,
    feature_tree: Any | None = None,
) -> list[ValidationIssue]:
    """Return every schema and semantic issue in deterministic order."""

    return sorted(set([*_schema_issues(data, schema), *semantic_issues(data, feature_tree)]))


def validate_files(
    data_path: Path = DEFAULT_DATA,
    schema_path: Path = DEFAULT_SCHEMA,
    feature_tree_path: Path = DEFAULT_FEATURE_TREE,
) -> list[ValidationIssue]:
    schema = _load_json(schema_path)
    data = _load_json(data_path)
    feature_tree = _load_json(feature_tree_path)
    Draft202012Validator.check_schema(schema)
    return validate_document(data, schema, feature_tree=feature_tree)


def summarize(data: Any) -> dict[str, int]:
    experiments = [experiment for experiment in _experiment_records(data) if isinstance(experiment, dict)]
    covered_features = {
        feature_id
        for experiment in experiments
        for feature_id in experiment.get("covered_feature_ids", [])
        if isinstance(feature_id, str)
    }
    return {
        "experiments": len(experiments),
        "covered_features": len(covered_features),
        "wandb_reports": sum(isinstance(experiment.get("wandb_url"), str) for experiment in experiments),
        "replay_traces": sum(experiment.get("cursor_type") == "wandb-replay" for experiment in experiments),
    }


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA, help="Experiment Index JSON document")
    parser.add_argument("--schema", type=Path, default=DEFAULT_SCHEMA, help="Experiment Index JSON Schema")
    parser.add_argument("--feature-tree", type=Path, default=DEFAULT_FEATURE_TREE, help="Feature Tree JSON document")
    parser.add_argument("--json", action="store_true", help="emit a machine-readable JSON result")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        schema = _load_json(args.schema)
        data = _load_json(args.data)
        feature_tree = _load_json(args.feature_tree)
        Draft202012Validator.check_schema(schema)
    except (OSError, json.JSONDecodeError, SchemaError) as error:
        if args.json:
            print(json.dumps({"valid": False, "configuration_error": str(error)}, ensure_ascii=False, sort_keys=True))
        else:
            print(f"ERROR: {error}", file=sys.stderr)
        return 2

    issues = validate_document(data, schema, feature_tree=feature_tree)
    summary = summarize(data)
    if args.json:
        print(
            json.dumps(
                {
                    "valid": not issues,
                    "summary": summary,
                    "issues": [asdict(issue) for issue in issues],
                },
                ensure_ascii=False,
                sort_keys=True,
            )
        )
    elif issues:
        print(f"INVALID: {len(issues)} issue(s)")
        for issue in issues:
            print(f"{issue.code} {issue.path}: {issue.message}")
    else:
        print(
            "VALID: "
            f"{summary['experiments']} experiments, "
            f"{summary['covered_features']} covered Features, "
            f"{summary['wandb_reports']} W&B reports, "
            f"{summary['replay_traces']} replay traces"
        )
    return 1 if issues else 0


if __name__ == "__main__":
    raise SystemExit(main())
