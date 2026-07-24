#!/usr/bin/env python3
"""Offline, deterministic validation for the InternSpace Feature Tree v1."""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict, deque
from dataclasses import asdict, dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Iterable, Mapping, Sequence
from urllib.parse import urlsplit

from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError


ROOT_ID = "feat-olmo3-standard"
ROOT_TITLE = "OLMo-3 标准态"
REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA = REPO_ROOT / "data" / "feature-tree.json"
DEFAULT_SCHEMA = REPO_ROOT / "schema" / "feature-tree.schema.json"
FORBIDDEN_TOP_LEVEL_COLLECTIONS = {
    "artifacts",
    "code_symbols",
    "commits",
    "component_changes",
    "components",
    "evidence",
    "experiments",
    "papers",
    "sessions",
}
POSITIONAL_ID = re.compile(
    r"^feat-(?:node|feature|position|pos|row|col|level)(?:-?[0-9]+)$"
)


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


def _formal_schema_issues(data: Any, schema: Mapping[str, Any]) -> list[ValidationIssue]:
    """Validate each source record against the strict formalFeature definition."""

    formal_schema = {
        "$schema": schema.get("$schema", "https://json-schema.org/draft/2020-12/schema"),
        "$defs": schema.get("$defs", {}),
        "$ref": "#/$defs/formalFeature",
    }
    validator = Draft202012Validator(formal_schema)
    issues: list[ValidationIssue] = []
    for index, feature in enumerate(_feature_records(data)):
        for error in validator.iter_errors(feature):
            issues.append(
                ValidationIssue(
                    path=_json_path(("features", index, *error.absolute_path)),
                    code="FORMAL_SCHEMA",
                    message=error.message,
                )
            )
    return issues


def _feature_records(data: Any) -> list[Any]:
    if not isinstance(data, dict):
        return []
    features = data.get("features")
    return features if isinstance(features, list) else []


def _walk_evidence_references(value: Any, path: tuple[Any, ...]) -> Iterable[tuple[str, str]]:
    if isinstance(value, dict):
        for key, child in value.items():
            child_path = (*path, key)
            if key == "evidence_ids" and isinstance(child, list):
                for index, evidence_id in enumerate(child):
                    if isinstance(evidence_id, str):
                        yield _json_path((*child_path, index)), evidence_id
            else:
                yield from _walk_evidence_references(child, child_path)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from _walk_evidence_references(child, (*path, index))


def _canonical_cycle(cycle: Sequence[str]) -> tuple[str, ...]:
    rotations = [tuple(cycle[index:] + cycle[:index]) for index in range(len(cycle))]
    return min(rotations)


def _graph_issues(features: list[Any]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    id_occurrences: dict[str, list[int]] = defaultdict(list)

    for index, feature in enumerate(features):
        path = f"$.features[{index}]"
        if not isinstance(feature, dict):
            issues.append(
                ValidationIssue(path, "NON_FEATURE_RECORD", "features may contain only Feature objects")
            )
            continue
        if feature.get("record_type") != "feature":
            issues.append(
                ValidationIssue(
                    f"{path}.record_type",
                    "NON_FEATURE_RECORD",
                    "record_type must be 'feature'; details such as commits or experiments must be embedded",
                )
            )
        if feature.get("kind") not in {"baseline", "feature"}:
            issues.append(
                ValidationIssue(
                    f"{path}.kind",
                    "NON_FEATURE_RECORD",
                    "kind must identify a baseline or ordinary Feature, not an implementation or evidence entity",
                )
            )
        feature_id = feature.get("id")
        if isinstance(feature_id, str):
            id_occurrences[feature_id].append(index)
            if POSITIONAL_ID.fullmatch(feature_id):
                issues.append(
                    ValidationIssue(
                        f"{path}.id",
                        "POSITIONAL_ID",
                        "Feature IDs must be stable semantic identifiers, not display positions",
                    )
                )

    for feature_id, indices in sorted(id_occurrences.items()):
        if len(indices) > 1:
            issues.append(
                ValidationIssue(
                    "$.features",
                    "DUPLICATE_ID",
                    f"Feature ID {feature_id!r} occurs at indices {indices}",
                )
            )

    feature_by_id = {
        feature["id"]: feature
        for feature in features
        if isinstance(feature, dict)
        and isinstance(feature.get("id"), str)
        and len(id_occurrences[feature["id"]]) == 1
    }
    index_by_id = {
        feature["id"]: index
        for index, feature in enumerate(features)
        if isinstance(feature, dict)
        and isinstance(feature.get("id"), str)
        and len(id_occurrences[feature["id"]]) == 1
    }

    roots = [
        feature.get("id")
        for feature in features
        if isinstance(feature, dict) and feature.get("parent_id") is None
    ]
    if roots != [ROOT_ID]:
        issues.append(
            ValidationIssue(
                "$.features",
                "ROOT_SET",
                f"exactly one root is required and it must be {ROOT_ID!r}; found {roots!r}",
            )
        )

    root = feature_by_id.get(ROOT_ID)
    if root is None:
        issues.append(
            ValidationIssue("$.features", "ROOT_IDENTITY", f"required root {ROOT_ID!r} is missing or duplicated")
        )
    else:
        root_index = index_by_id[ROOT_ID]
        root_path = f"$.features[{root_index}]"
        if root.get("parent_id") is not None:
            issues.append(
                ValidationIssue(f"{root_path}.parent_id", "ROOT_PARENT", "the root parent_id must be null")
            )
        if root.get("kind") != "baseline":
            issues.append(
                ValidationIssue(f"{root_path}.kind", "ROOT_IDENTITY", "the root kind must be 'baseline'")
            )
        if root.get("title") != ROOT_TITLE:
            issues.append(
                ValidationIssue(f"{root_path}.title", "ROOT_IDENTITY", f"the root title must be {ROOT_TITLE!r}")
            )
        if not isinstance(root.get("baseline"), dict):
            issues.append(
                ValidationIssue(f"{root_path}.baseline", "ROOT_BASELINE", "the root must contain baseline details")
            )

    for feature_id, feature in sorted(feature_by_id.items()):
        index = index_by_id[feature_id]
        path = f"$.features[{index}]"
        parent_id = feature.get("parent_id")
        if feature_id != ROOT_ID:
            if feature.get("kind") != "feature":
                issues.append(
                    ValidationIssue(f"{path}.kind", "NON_ROOT_KIND", "non-root records must have kind 'feature'")
                )
            if feature.get("baseline") is not None:
                issues.append(
                    ValidationIssue(
                        f"{path}.baseline",
                        "NON_ROOT_BASELINE",
                        "baseline details are reserved for the root Feature",
                    )
                )
            if not isinstance(parent_id, str):
                issues.append(
                    ValidationIssue(
                        f"{path}.parent_id",
                        "PARENT_REQUIRED",
                        "every non-root Feature must have exactly one parent_id",
                    )
                )
            elif parent_id not in feature_by_id:
                issues.append(
                    ValidationIssue(
                        f"{path}.parent_id",
                        "MISSING_PARENT",
                        f"parent Feature {parent_id!r} does not exist uniquely",
                    )
                )

        for relation in ("depends_on", "related_to"):
            targets = feature.get(relation)
            if not isinstance(targets, list):
                continue
            for relation_index, target in enumerate(targets):
                relation_path = f"{path}.{relation}[{relation_index}]"
                if target == feature_id:
                    issues.append(
                        ValidationIssue(relation_path, "SELF_RELATION", f"{relation} cannot reference the Feature itself")
                    )
                elif isinstance(target, str) and target not in feature_by_id:
                    issues.append(
                        ValidationIssue(
                            relation_path,
                            "MISSING_AUXILIARY_TARGET",
                            f"auxiliary relation target {target!r} does not exist uniquely",
                        )
                    )

    seen_cycles: set[tuple[str, ...]] = set()
    fully_walked: set[str] = set()
    for start in sorted(feature_by_id):
        if start in fully_walked:
            continue
        trail: list[str] = []
        trail_index: dict[str, int] = {}
        current: str | None = start
        while current in feature_by_id and current not in fully_walked:
            if current in trail_index:
                cycle = _canonical_cycle(trail[trail_index[current] :])
                if cycle not in seen_cycles:
                    seen_cycles.add(cycle)
                    closed = " -> ".join((*cycle, cycle[0]))
                    issues.append(ValidationIssue("$.features", "CYCLE", f"structural parent cycle: {closed}"))
                break
            trail_index[current] = len(trail)
            trail.append(current)
            parent = feature_by_id[current].get("parent_id")
            current = parent if isinstance(parent, str) else None
        fully_walked.update(trail)

    if ROOT_ID in feature_by_id:
        children: dict[str, list[str]] = defaultdict(list)
        for feature_id, feature in feature_by_id.items():
            parent = feature.get("parent_id")
            if isinstance(parent, str) and parent in feature_by_id:
                children[parent].append(feature_id)
        reached = {ROOT_ID}
        queue = deque([ROOT_ID])
        while queue:
            parent = queue.popleft()
            for child in sorted(children[parent]):
                if child not in reached:
                    reached.add(child)
                    queue.append(child)
        unreachable = sorted(set(feature_by_id) - reached)
        if unreachable:
            issues.append(
                ValidationIssue(
                    "$.features",
                    "DISCONNECTED",
                    f"Features not reachable from {ROOT_ID!r}: {unreachable}",
                )
            )

    return issues


def _provenance_issues(features: list[Any]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    global_evidence: dict[str, list[str]] = defaultdict(list)

    for index, feature in enumerate(features):
        if not isinstance(feature, dict):
            continue
        path = f"$.features[{index}]"
        evidence = feature.get("evidence")
        evidence = evidence if isinstance(evidence, list) else []
        local_evidence: dict[str, Mapping[str, Any]] = {}
        for evidence_index, item in enumerate(evidence):
            if not isinstance(item, dict) or not isinstance(item.get("id"), str):
                continue
            evidence_id = item["id"]
            evidence_path = f"{path}.evidence[{evidence_index}].id"
            if evidence_id in local_evidence:
                issues.append(
                    ValidationIssue(evidence_path, "DUPLICATE_EVIDENCE_ID", f"duplicate local evidence ID {evidence_id!r}")
                )
            else:
                local_evidence[evidence_id] = item
            global_evidence[evidence_id].append(evidence_path)

        for reference_path, evidence_id in _walk_evidence_references(feature, ("features", index)):
            if evidence_id not in local_evidence:
                issues.append(
                    ValidationIssue(
                        reference_path,
                        "MISSING_EVIDENCE",
                        f"evidence reference {evidence_id!r} is not embedded in this Feature",
                    )
                )

        provenance = feature.get("provenance")
        if not isinstance(provenance, dict):
            continue
        sources = provenance.get("sources")
        fields = provenance.get("fields")
        sources = sources if isinstance(sources, dict) else {}
        fields = fields if isinstance(fields, dict) else {}

        for field_name in sorted(set(feature) - {"provenance"}):
            if field_name not in fields:
                issues.append(
                    ValidationIssue(
                        f"{path}.provenance.fields",
                        "MISSING_FIELD_PROVENANCE",
                        f"top-level field {field_name!r} needs a provenance source mapping",
                    )
                )

        for field_name, source_name in sorted(fields.items()):
            if isinstance(source_name, str) and source_name not in sources:
                issues.append(
                    ValidationIssue(
                        f"{path}.provenance.fields.{field_name}",
                        "MISSING_PROVENANCE_SOURCE",
                        f"provenance source {source_name!r} is not defined",
                    )
                )

        for source_name, source in sorted(sources.items()):
            if not isinstance(source, dict):
                continue
            source_path = f"{path}.provenance.sources.{source_name}"
            state = source.get("state")
            source_ids = source.get("source_ids")
            if not isinstance(source_ids, list):
                continue
            for source_index, evidence_id in enumerate(source_ids):
                if isinstance(evidence_id, str) and evidence_id not in local_evidence:
                    issues.append(
                        ValidationIssue(
                            f"{source_path}.source_ids[{source_index}]",
                            "MISSING_EVIDENCE",
                            f"provenance evidence {evidence_id!r} is not embedded in this Feature",
                        )
                    )
            if state in {"pinned", "documented"} and not source_ids:
                issues.append(
                    ValidationIssue(
                        f"{source_path}.source_ids",
                        "PROVENANCE_UNSOURCED",
                        f"{state} provenance requires at least one evidence source",
                    )
                )
            if state == "unresolved" and source_ids:
                issues.append(
                    ValidationIssue(
                        f"{source_path}.source_ids",
                        "UNRESOLVED_WITH_SOURCE",
                        "unresolved provenance must not pretend to have supporting evidence",
                    )
                )
            if state == "pinned":
                for evidence_id in source_ids:
                    item = local_evidence.get(evidence_id)
                    if item is not None and item.get("revision") is None:
                        issues.append(
                            ValidationIssue(
                                source_path,
                                "PIN_WITHOUT_REVISION",
                                f"pinned provenance evidence {evidence_id!r} needs an immutable revision",
                            )
                        )

        if feature.get("id") == ROOT_ID and isinstance(feature.get("baseline"), dict):
            for claim_name, claim in sorted(feature["baseline"].items()):
                if not isinstance(claim, dict):
                    continue
                source_name = claim.get("provenance")
                claim_path = f"{path}.baseline.{claim_name}"
                source = sources.get(source_name) if isinstance(source_name, str) else None
                if source is None:
                    issues.append(
                        ValidationIssue(
                            f"{claim_path}.provenance",
                            "MISSING_PROVENANCE_SOURCE",
                            f"baseline provenance source {source_name!r} is not defined",
                        )
                    )
                    continue
                state = source.get("state") if isinstance(source, dict) else None
                value = claim.get("value")
                if value is None and state != "unresolved":
                    issues.append(
                        ValidationIssue(
                            claim_path,
                            "NULL_BASELINE_NOT_UNRESOLVED",
                            "a missing baseline value must have unresolved provenance",
                        )
                    )
                if value is not None and state == "unresolved":
                    issues.append(
                        ValidationIssue(
                            claim_path,
                            "VALUE_WITH_UNRESOLVED_PROVENANCE",
                            "a populated baseline value cannot use unresolved provenance",
                        )
                    )

    for evidence_id, paths in sorted(global_evidence.items()):
        if len(paths) > 1:
            issues.append(
                ValidationIssue(
                    "$.features",
                    "DUPLICATE_EVIDENCE_ID",
                    f"evidence ID {evidence_id!r} must be globally unique; found at {paths}",
                )
            )
    return issues


def _credential_free_https_url(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    parsed = urlsplit(value)
    return (
        parsed.scheme == "https"
        and bool(parsed.netloc)
        and parsed.username is None
        and parsed.password is None
        and not parsed.query
        and not parsed.fragment
    )


def _formal_locator_issues(features: list[Any]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for feature_index, feature in enumerate(features):
        if not isinstance(feature, dict) or feature.get("id") == ROOT_ID:
            continue
        path = f"$.features[{feature_index}]"
        locators = feature.get("code_locators")
        if not isinstance(locators, list):
            continue
        for locator_index, locator in enumerate(locators):
            if not isinstance(locator, dict):
                continue
            locator_path = f"{path}.code_locators[{locator_index}]"
            repository = locator.get("repository")
            url = locator.get("url")
            revision = locator.get("revision")
            repo_path = locator.get("path")
            if not _credential_free_https_url(repository):
                issues.append(
                    ValidationIssue(
                        f"{locator_path}.repository",
                        "CREDENTIAL_OR_UNSTABLE_REPOSITORY",
                        "repository must be a credential-free HTTPS URL without query or fragment",
                    )
                )
            if not _credential_free_https_url(url):
                issues.append(
                    ValidationIssue(
                        f"{locator_path}.url",
                        "CREDENTIAL_OR_UNPINNED_CODE_URL",
                        "code URL must be a credential-free commit-pinned HTTPS URL",
                    )
                )
                continue
            if isinstance(revision, str) and revision not in urlsplit(url).path:
                issues.append(
                    ValidationIssue(
                        f"{locator_path}.url",
                        "REVISION_NOT_IN_CODE_URL",
                        "code URL path must contain the full immutable revision",
                    )
                )
            if isinstance(repo_path, str):
                parsed_path = PurePosixPath(repo_path)
                if parsed_path.is_absolute() or ".." in parsed_path.parts:
                    issues.append(
                        ValidationIssue(
                            f"{locator_path}.path",
                            "INVALID_REPOSITORY_PATH",
                            "code path must be repository-relative and may not traverse '..'",
                        )
                    )
                elif isinstance(revision, str):
                    pinned_suffix = f"/{revision}/{repo_path}"
                    if pinned_suffix not in urlsplit(url).path:
                        issues.append(
                            ValidationIssue(
                                f"{locator_path}.url",
                                "PATH_NOT_IN_CODE_URL",
                                "code URL must pin the declared repository-relative path",
                            )
                        )
    return issues


def semantic_issues(data: Any) -> list[ValidationIssue]:
    """Check invariants that JSON Schema cannot express."""

    issues: list[ValidationIssue] = []
    if isinstance(data, dict):
        for key in sorted(FORBIDDEN_TOP_LEVEL_COLLECTIONS.intersection(data)):
            issues.append(
                ValidationIssue(
                    f"$.{key}",
                    "NON_FEATURE_COLLECTION",
                    f"{key} must be embedded in a Feature detail or referenced as evidence, not stored beside features",
                )
            )
    features = _feature_records(data)
    issues.extend(_graph_issues(features))
    issues.extend(_provenance_issues(features))
    return sorted(set(issues))


def validate_document(
    data: Any,
    schema: Mapping[str, Any],
    *,
    require_formal: bool = False,
) -> list[ValidationIssue]:
    """Return every schema and semantic issue in deterministic order."""

    issues = [*_schema_issues(data, schema), *semantic_issues(data)]
    if require_formal:
        issues.extend(_formal_schema_issues(data, schema))
        issues.extend(_formal_locator_issues(_feature_records(data)))
    return sorted(set(issues))


def summarize(data: Any) -> dict[str, int]:
    features = [feature for feature in _feature_records(data) if isinstance(feature, dict)]
    root = next((feature for feature in features if feature.get("id") == ROOT_ID), None)
    unresolved = 0
    if isinstance(root, dict) and isinstance(root.get("baseline"), dict):
        provenance = root.get("provenance", {})
        sources = provenance.get("sources", {}) if isinstance(provenance, dict) else {}
        for claim in root["baseline"].values():
            if not isinstance(claim, dict):
                continue
            source = sources.get(claim.get("provenance"), {}) if isinstance(sources, dict) else {}
            if isinstance(source, dict) and source.get("state") == "unresolved":
                unresolved += 1
    return {
        "features": len(features),
        "structural_edges": sum(feature.get("parent_id") is not None for feature in features),
        "depends_on_edges": sum(len(feature.get("depends_on", [])) for feature in features),
        "related_to_edges": sum(len(feature.get("related_to", [])) for feature in features),
        "unresolved_baseline_claims": unresolved,
    }


def _load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA, help="Feature Tree JSON document")
    parser.add_argument("--schema", type=Path, default=DEFAULT_SCHEMA, help="Feature Tree JSON Schema")
    parser.add_argument("--json", action="store_true", help="emit a machine-readable JSON result")
    parser.add_argument(
        "--allow-legacy",
        action="store_true",
        help="skip the strict one-Feature source contract for legacy proposal fixtures",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        schema = _load_json(args.schema)
        data = _load_json(args.data)
        Draft202012Validator.check_schema(schema)
    except (OSError, json.JSONDecodeError, SchemaError) as error:
        if args.json:
            print(json.dumps({"valid": False, "configuration_error": str(error)}, ensure_ascii=False, sort_keys=True))
        else:
            print(f"ERROR: {error}", file=sys.stderr)
        return 2

    issues = validate_document(data, schema, require_formal=not args.allow_legacy)
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
            f"{summary['features']} Features, "
            f"{summary['structural_edges']} structural edges, "
            f"{summary['depends_on_edges']} depends_on edges, "
            f"{summary['related_to_edges']} related_to edges, "
            f"{summary['unresolved_baseline_claims']} unresolved baseline claims"
        )
    return 1 if issues else 0


if __name__ == "__main__":
    raise SystemExit(main())
