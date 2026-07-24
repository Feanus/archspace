#!/usr/bin/env python3
"""Validate the Concept OLMo proposal bundle without applying canonical data."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

from scripts.validate_feature_tree import validate_document


ROOT_ID = "feat-olmo3-standard"
ROOT_CHILDREN = {
    "feat-olmo3-150b-training-recipe",
    "feat-olmo3-1b-dense-preset",
    "feat-olmo3-3b-dense-preset",
    "feat-concept-segmented-topology",
    "feat-concept-chunk-representation",
    "feat-concept-self-dd",
    "feat-concept-cross-module-residual-read",
}
STRUCTURAL_PARENTS = {
    "feat-concept-segmented-topology": ROOT_ID,
    "feat-concept-hlm-predictor": "feat-concept-segmented-topology",
    "feat-concept-hlm-backbone-window": "feat-concept-hlm-predictor",
    "feat-concept-hlm-olmo3-layer-reuse": "feat-concept-hlm-predictor",
    "feat-concept-chunk-representation": ROOT_ID,
    "feat-concept-product-vq": "feat-concept-chunk-representation",
    "feat-concept-self-dd": ROOT_ID,
    "feat-concept-cumsum-self-dd": "feat-concept-self-dd",
    "feat-concept-cross-module-residual-read": ROOT_ID,
    "feat-concept-cross-module-cumsum-routes": "feat-concept-cross-module-residual-read",
}
SHARED_SNAPSHOT_FEATURES = {
    "feat-concept-segmented-topology",
    "feat-concept-hlm-predictor",
    "feat-concept-chunk-representation",
    "feat-concept-product-vq",
    "feat-concept-self-dd",
    "feat-concept-cross-module-residual-read",
}
OLD_SNAPSHOT_ID = "feat-concept-olmo-v22-vq-snapshot"
INITIAL = "a489526d1dff4161a60dccc5034c2d595f059d49"
ALLOWED_CATEGORIES = {"architecture", "model_configuration", "training_configuration", "data", "runtime"}
ALLOWED_VALIDATION = {"validated", "mixed", "failed", "unverified"}
ALLOWED_ADMISSION = {"admitted", "ambiguous", "conditional"}
FULL_COMMIT = re.compile(r"^[0-9a-f]{40}$")
COMMIT_PINNED = re.compile(
    r"https://github\.com/Liu-yuliang/concept_olmo/(?:commit/([0-9a-f]{40})|blob/([0-9a-f]{40})/.+)"
)
PR_COMMIT_PINNED = re.compile(r"https://github\.com/Liu-yuliang/concept_olmo/pull/1/commits/([0-9a-f]{40})$")
SECRET = re.compile(r"(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]+|authorization\s*:|access[_-]?token)", re.I)
ABSOLUTE_INTERNAL = re.compile(r"/(?:mnt|home|root|workspace|nfs|gpfs)(?:/|\\b)")


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def combine_with_root(bundle: dict[str, Any], root_data: dict[str, Any]) -> dict[str, Any]:
    roots = [feature for feature in root_data.get("features", []) if feature.get("id") == ROOT_ID]
    if len(roots) != 1:
        raise ValueError("root data must contain exactly one feat-olmo3-standard")
    features = bundle.get("features")
    if not isinstance(features, list):
        raise ValueError("proposal bundle features must be a list")
    return {
        "schema_version": root_data.get("schema_version", "1.0.0"),
        "tree_id": root_data.get("tree_id", "internspace-feature-tree"),
        "features": [roots[0], *features],
    }


def proposal_issues(bundle: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    rendered = json.dumps(bundle, ensure_ascii=False)
    if SECRET.search(rendered):
        errors.append("proposal bundle contains a token-like secret")
    if ABSOLUTE_INTERNAL.search(rendered):
        errors.append("proposal bundle contains an absolute internal path")

    features = bundle.get("features")
    if not isinstance(features, list) or not features:
        return errors + ["features must be a non-empty list"]
    ids = [feature.get("id") for feature in features if isinstance(feature, dict)]
    if len(ids) != len(set(ids)):
        errors.append("candidate Feature IDs must be unique")
    if ROOT_ID in ids:
        errors.append("proposal bundle must not redefine the canonical root")
    if OLD_SNAPSHOT_ID in ids:
        errors.append("superseded snapshot ID must not remain an active Feature")
    root_children = {feature.get("id") for feature in features if feature.get("parent_id") == ROOT_ID}
    if root_children != ROOT_CHILDREN:
        errors.append("candidate root children must match the adjudicated configuration and four structural branches")

    by_id = {feature["id"]: feature for feature in features}
    if set(STRUCTURAL_PARENTS) - set(by_id):
        errors.append("proposal bundle must contain all ten adjudicated structural Features")
    else:
        for feature_id, parent_id in STRUCTURAL_PARENTS.items():
            feature = by_id[feature_id]
            if feature.get("parent_id") != parent_id:
                errors.append(f"{feature_id} must have adjudicated parent {parent_id}")
            if not feature.get("title_zh") or not feature.get("summary_zh"):
                errors.append(f"{feature_id} must include reviewed title_zh and summary_zh")
    for feature in features:
        for field in ("parent_id", "depends_on", "related_to"):
            value = feature.get(field)
            references = value if isinstance(value, list) else [value]
            if OLD_SNAPSHOT_ID in references:
                errors.append(f"{feature.get('id')}.{field} must not actively reference the superseded snapshot ID")

    evidence_ids: set[str] = set()
    for feature in features:
        feature_id = feature.get("id", "<missing>")
        for evidence in feature.get("evidence", []):
            evidence_id = evidence.get("id")
            if evidence_id in evidence_ids:
                errors.append(f"duplicate evidence id: {evidence_id}")
            evidence_ids.add(evidence_id)
            revision = evidence.get("revision")
            if not isinstance(revision, str) or not FULL_COMMIT.fullmatch(revision):
                errors.append(f"{feature_id}/{evidence_id} must use a full revision")
            locator = evidence.get("locator", "")
            match = COMMIT_PINNED.fullmatch(locator) or PR_COMMIT_PINNED.fullmatch(locator)
            if not match:
                errors.append(f"{feature_id}/{evidence_id} locator is not commit-pinned")
            elif next((group for group in match.groups() if group is not None), None) != revision:
                errors.append(f"{feature_id}/{evidence_id} locator revision mismatch")

    assessments = bundle.get("feature_assessments")
    if not isinstance(assessments, dict) or set(assessments) != set(ids):
        errors.append("feature_assessments must cover every candidate Feature exactly once")
    else:
        for feature_id, assessment in assessments.items():
            if assessment.get("boundary_confidence") not in {"high", "medium", "low"}:
                errors.append(f"{feature_id} has invalid boundary_confidence")
            if assessment.get("category") not in ALLOWED_CATEGORIES:
                errors.append(f"{feature_id} has invalid category")
            if assessment.get("validation_status") not in ALLOWED_VALIDATION:
                errors.append(f"{feature_id} has invalid validation_status")
            if assessment.get("admission") not in ALLOWED_ADMISSION:
                errors.append(f"{feature_id} has invalid admission")
            if by_id.get(feature_id, {}).get("category") != assessment.get("category"):
                errors.append(f"{feature_id} Feature category must match feature_assessments")
            expected_decision = "adjudicated" if feature_id in STRUCTURAL_PARENTS else "pending"
            if assessment.get("decision_status") != expected_decision:
                errors.append(f"{feature_id} must have decision_status {expected_decision}")
            diff_ids = assessment.get("diff_ids")
            if not isinstance(diff_ids, list) or not diff_ids:
                errors.append(f"{feature_id}.diff_ids must be a non-empty list")
            if not isinstance(assessment.get("recommended_for_merge"), bool):
                errors.append(f"{feature_id}.recommended_for_merge must be boolean")
            if not isinstance(assessment.get("has_effect_evidence"), bool):
                errors.append(f"{feature_id}.has_effect_evidence must be boolean")
            locators = assessment.get("primary_locators")
            if not isinstance(locators, list) or not locators:
                errors.append(f"{feature_id} must have at least one primary locator")
            else:
                for index, locator in enumerate(locators):
                    prefix = f"{feature_id}.primary_locators[{index}]"
                    if locator.get("repository") != "https://github.com/Liu-yuliang/concept_olmo":
                        errors.append(f"{prefix}.repository must be the credential-free work repository URL")
                    revision = locator.get("revision")
                    if not isinstance(revision, str) or not FULL_COMMIT.fullmatch(revision):
                        errors.append(f"{prefix}.revision must be a full commit")
                    path = locator.get("path")
                    if not isinstance(path, str) or not path or path.startswith("/"):
                        errors.append(f"{prefix}.path must be a repo-relative path")
                    if not locator.get("symbol") and not locator.get("parameter"):
                        errors.append(f"{prefix} must name a qualified symbol or concrete parameter")
                    if not isinstance(locator.get("role"), str) or not locator["role"].strip():
                        errors.append(f"{prefix}.role must explain how the location implements the Feature")
                    expected_url = (
                        f"https://github.com/Liu-yuliang/concept_olmo/blob/{revision}/{path}"
                        if isinstance(revision, str) and isinstance(path, str) else None
                    )
                    if locator.get("url") != expected_url:
                        errors.append(f"{prefix}.url must be commit-pinned and match revision/path")
            validation = assessment.get("validation")
            if not isinstance(validation, dict):
                errors.append(f"{feature_id}.validation must be an object")
            else:
                for field in ("comparison", "conditions", "metrics", "artifact_locators", "conclusion", "limitations"):
                    if field not in validation:
                        errors.append(f"{feature_id}.validation missing {field}")
                for locator in validation.get("artifact_locators", []):
                    if not (COMMIT_PINNED.fullmatch(locator) or PR_COMMIT_PINNED.fullmatch(locator)):
                        errors.append(f"{feature_id}.validation artifact locator is not commit-pinned")
            for field in ("grouped_commits", "evidence_only_commits"):
                commits = assessment.get(field)
                if not isinstance(commits, list):
                    errors.append(f"{feature_id}.{field} must be a list")
                    continue
                for commit in commits:
                    if not isinstance(commit, str) or not FULL_COMMIT.fullmatch(commit):
                        errors.append(f"{feature_id}.{field} contains a non-full commit")

        conditional = assessments.get("feat-concept-hlm-olmo3-layer-reuse", {}).get("conditional_review")
        if not isinstance(conditional, dict):
            errors.append("D08 must include conditional_review metadata")
        elif "Downgrade D08" not in conditional.get("if_equivalent", ""):
            errors.append("D08 conditional review must downgrade to D04b evidence when equivalent")

    diff_review = bundle.get("diff_review")
    if not isinstance(diff_review, dict):
        errors.append("diff_review must be present")
    else:
        records = diff_review.get("records")
        record_ids = [record.get("id") for record in records] if isinstance(records, list) else []
        if diff_review.get("total") != 19 or len(record_ids) != 19 or len(set(record_ids)) != 19:
            errors.append("diff_review must contain exactly 19 unique semantic diffs")
        structural_records = [record for record in records or [] if record.get("category") == "architecture"]
        pending_records = [record for record in records or [] if record.get("decision") == "pending"]
        if diff_review.get("structural_count") != 10 or len(structural_records) != 10:
            errors.append("diff_review must contain exactly ten adjudicated structural diffs")
        if diff_review.get("pending_count") != 9 or len(pending_records) != 9:
            errors.append("diff_review must leave exactly nine diffs pending")
        if {record.get("id") for record in structural_records} != {"D04a", "D04b", "D05a", "D05b", "D06a", "D06b", "D07", "D08", "D09", "D10"}:
            errors.append("structural diff IDs must match the human adjudication")

    migration = bundle.get("migration", {}).get("superseded_feature_ids", [])
    old_records = [item for item in migration if item.get("id") == OLD_SNAPSHOT_ID]
    if len(old_records) != 1 or old_records[0].get("status") != "superseded":
        errors.append("old snapshot history must be retained only as an explicitly superseded migration record")

    classifications = bundle.get("commit_classification")
    if not isinstance(classifications, list):
        errors.append("commit_classification must be a list")
    else:
        seen: set[str] = set()
        for item in classifications:
            commit = item.get("commit")
            if not isinstance(commit, str) or not FULL_COMMIT.fullmatch(commit):
                errors.append("commit_classification contains a non-full commit")
                continue
            if commit in seen:
                errors.append(f"commit_classification duplicates {commit}")
            seen.add(commit)
            disposition = item.get("disposition")
            if disposition not in {"feature_implementation", "feature_evidence", "rejected_engineering"}:
                errors.append(f"commit_classification has invalid disposition for {commit}")
            if disposition.startswith("feature_"):
                references = [item["feature_id"]] if item.get("feature_id") else item.get("feature_ids")
                if not isinstance(references, list) or not references or not set(references).issubset(set(ids)):
                    errors.append(f"commit_classification references unknown Feature for {commit}")
            expected_locator = f"https://github.com/Liu-yuliang/concept_olmo/commit/{commit}"
            if item.get("locator") != expected_locator:
                errors.append(f"commit_classification locator is not commit-pinned for {commit}")
        initial_items = [item for item in classifications if item.get("commit") == INITIAL]
        if len(initial_items) != 1 or set(initial_items[0].get("feature_ids", [])) != SHARED_SNAPSHOT_FEATURES:
            errors.append("initial snapshot commit must be one shared classification supporting exactly six structural Features")
        elif initial_items[0].get("evidence_role") != "shared_initial_snapshot_evidence":
            errors.append("initial snapshot classification must explicitly identify its shared evidence role")
    branch = bundle.get("branch_disposition", {})
    if not isinstance(branch.get("revision"), str) or not FULL_COMMIT.fullmatch(branch["revision"]):
        errors.append("branch_disposition.revision must be a full commit")
    if branch.get("status") != "unmerged_configuration_candidates":
        errors.append("olmo_1B_3B must be classified as unmerged_configuration_candidates")
    branch_classification = bundle.get("branch_commit_classification")
    if not isinstance(branch_classification, list) or len(branch_classification) != 4:
        errors.append("branch_commit_classification must cover exactly four olmo_1B_3B commits")
    else:
        branch_seen: set[str] = set()
        for item in branch_classification:
            commit = item.get("commit")
            if not isinstance(commit, str) or not FULL_COMMIT.fullmatch(commit):
                errors.append("branch_commit_classification contains a non-full commit")
                continue
            if commit in branch_seen:
                errors.append(f"branch_commit_classification duplicates {commit}")
            branch_seen.add(commit)
            if item.get("locator") != f"https://github.com/Liu-yuliang/concept_olmo/commit/{commit}":
                errors.append(f"branch_commit_classification locator is not commit-pinned for {commit}")
            if item.get("disposition") not in {"candidate_implementation", "candidate_evidence"}:
                errors.append(f"branch_commit_classification has invalid disposition for {commit}")
            feature_ids = item.get("feature_ids")
            if not isinstance(feature_ids, list) or not feature_ids or not set(feature_ids).issubset(set(ids)):
                errors.append(f"branch_commit_classification references unknown Feature for {commit}")
    return errors


def split_proposal_issues(bundle: dict[str, Any], split_dir: Path) -> list[str]:
    errors: list[str] = []
    features = bundle.get("features", [])
    by_id = {feature["id"]: feature for feature in features}
    feature_dir = split_dir / "features"
    actual_files = {path.name for path in feature_dir.glob("*.json")} if feature_dir.is_dir() else set()
    expected_files = {f"{feature_id}.json" for feature_id in by_id}
    if actual_files != expected_files:
        errors.append("one-Feature directory filenames must match candidate IDs exactly")
    for feature_id, feature in by_id.items():
        path = feature_dir / f"{feature_id}.json"
        try:
            stored = load_json(path)
        except (OSError, json.JSONDecodeError) as exc:
            errors.append(f"cannot load split Feature {feature_id}: {exc}")
            continue
        if not isinstance(stored, dict) or stored != feature:
            errors.append(f"split Feature {feature_id} must contain exactly the full schema-compatible Feature object")
    manifest_path = split_dir / "manifest.json"
    try:
        manifest = load_json(manifest_path)
    except (OSError, json.JSONDecodeError) as exc:
        return errors + [f"cannot load proposal manifest: {exc}"]
    entries = manifest.get("features") if isinstance(manifest, dict) else None
    if not isinstance(entries, list) or {entry.get("id") for entry in entries if isinstance(entry, dict)} != set(by_id):
        errors.append("manifest must cover every candidate Feature exactly once")
        return errors
    assessments = bundle["feature_assessments"]
    for entry in entries:
        feature_id = entry["id"]
        feature = by_id[feature_id]
        assessment = assessments[feature_id]
        expected = {
            "file": f"features/{feature_id}.json",
            "category": assessment["category"],
            "parent_id": feature["parent_id"],
            "validation_status": assessment["validation_status"],
            "boundary_confidence": assessment["boundary_confidence"],
            "admission": assessment["admission"],
            "recommended_for_merge": assessment["recommended_for_merge"],
            "has_effect_evidence": assessment["has_effect_evidence"],
            "diff_ids": assessment["diff_ids"],
            "decision_status": assessment["decision_status"],
            "primary_locators": assessment["primary_locators"],
            "validation": assessment["validation"],
        }
        if "conditional_review" in assessment:
            expected["conditional_review"] = assessment["conditional_review"]
        for key, value in expected.items():
            if entry.get(key) != value:
                errors.append(f"manifest entry {feature_id} has stale or invalid {key}")
    return errors


def tree_depth(features: list[dict[str, Any]]) -> int:
    by_id = {feature["id"]: feature for feature in features}
    maximum = 0
    for feature in features:
        depth = 0
        cursor = feature
        seen: set[str] = set()
        while cursor.get("parent_id") is not None:
            if cursor["id"] in seen:
                break
            seen.add(cursor["id"])
            depth += 1
            cursor = by_id.get(cursor["parent_id"], {"parent_id": None})
        maximum = max(maximum, depth)
    return maximum


def main(argv: list[str] | None = None) -> int:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser()
    parser.add_argument("--proposal", type=Path, default=root / "ingest/proposals/concept-olmo-feature-tree.json")
    parser.add_argument("--root-data", type=Path, default=root / "data/feature-tree.json")
    parser.add_argument("--schema", type=Path, default=root / "schema/feature-tree.schema.json")
    parser.add_argument("--split-dir", type=Path, default=root / "ingest/proposals/concept-olmo")
    parser.add_argument("--combined-output", type=Path)
    args = parser.parse_args(argv)
    try:
        bundle = load_json(args.proposal)
        root_data = load_json(args.root_data)
        schema = load_json(args.schema)
        errors = proposal_issues(bundle)
        errors.extend(split_proposal_issues(bundle, args.split_dir))
        combined = combine_with_root(bundle, root_data)
        errors.extend(f"{issue.code} {issue.path}: {issue.message}" for issue in validate_document(combined, schema))
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    if errors:
        for error in errors:
            print(f"FAIL: {error}", file=sys.stderr)
        return 1
    if args.combined_output:
        args.combined_output.write_text(json.dumps(combined, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    classifications = bundle["commit_classification"]
    assigned = sum(item["disposition"].startswith("feature_") for item in classifications)
    print(
        f"PASS: {len(bundle['features'])} candidate Features, depth {tree_depth(combined['features'])}, "
        f"{assigned}/{len(classifications)} observed commits assigned as implementation/evidence"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
