from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

import pytest
import yaml
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from ingest.feature_proposal import ContractError, run, validate_proposal, validate_tree
from sources.verify_olmo3_source import load_record, validate_record


SCHEMA_PATH = ROOT / "schema/feature-tree.schema.json"
SOURCE_PATH = ROOT / "sources/olmo-3-standard.yaml"
PROPOSAL_PATH = ROOT / "ingest/examples/feature-proposal.yaml"
FIELD_NAMES = (
    "id", "record_type", "title", "kind", "parent_id", "status", "summary",
    "hypothesis", "design", "baseline", "delta", "implementation", "experiments",
    "analysis", "evidence", "depends_on", "related_to",
)


def provenance(source: str = "fixture") -> dict:
    return {
        "sources": {
            source: {"state": "documented", "source_ids": [], "note": "Contract fixture."}
        },
        "fields": {field: source for field in FIELD_NAMES},
    }


def feature(feature_id: str, parent_id: str | None, status: str = "proposed") -> dict:
    root = parent_id is None
    return {
        "id": feature_id,
        "record_type": "feature",
        "title": "OLMo-3 标准态" if root else feature_id,
        "kind": "baseline" if root else "feature",
        "parent_id": parent_id,
        "status": status,
        "summary": "Contract fixture summary.",
        "hypothesis": "Contract fixture hypothesis.",
        "design": "Contract fixture design.",
        "baseline": {
            name: {"value": "OLMo-3" if name == "model_family" else None, "provenance": "fixture"}
            for name in ("model_family", "model_scale", "repository", "revision", "configuration", "checkpoint", "license")
        } if root else None,
        "delta": {"summary": "Fixture delta.", "operations": []},
        "implementation": {"commits": [], "sessions": [], "code_symbols": [], "component_changes": []},
        "experiments": [],
        "analysis": None,
        "evidence": [],
        "depends_on": [],
        "related_to": [],
        "provenance": provenance(),
    }


def tree_document() -> dict:
    return {
        "schema_version": "1.0.0",
        "tree_id": "internspace-feature-tree",
        "features": [
            feature(ROOT_ID := "feat-olmo3-standard", None),
            feature("feat-alpha", ROOT_ID),
            feature("feat-beta", ROOT_ID),
            feature("feat-alpha-child", "feat-alpha"),
            feature("feat-failed", "feat-beta", "abandoned"),
            feature("feat-cross", "feat-alpha"),
        ],
    }


def test_unresolved_source_record_is_honest_and_strict_pin_fails() -> None:
    record = load_record(SOURCE_PATH)
    assert record["status"] == "unresolved"
    assert validate_record(record) == []
    strict_errors = validate_record(record, require_pinned=True)
    assert strict_errors
    assert any("model_scale" in error for error in strict_errors)
    assert any("official_repository" in error for error in strict_errors)
    assert any("license" in error for error in strict_errors)


def test_fixture_matches_canonical_schema_and_tree_contract() -> None:
    document = tree_document()
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    assert list(Draft202012Validator(schema).iter_errors(document)) == []
    validate_tree(document["features"])


def test_dry_run_outputs_one_append_and_does_not_write(tmp_path: Path) -> None:
    data_path = tmp_path / "features.yaml"
    original = yaml.safe_dump(tree_document(), allow_unicode=True, sort_keys=False)
    data_path.write_text(original, encoding="utf-8")
    diff = run(data_path, PROPOSAL_PATH, schema_path=SCHEMA_PATH)
    assert data_path.read_text(encoding="utf-8") == original
    assert "+- id: feat-example-proposal" in diff
    assert diff.count("+- id: feat-example-proposal") == 1


def test_dry_run_accepts_current_formal_data_without_writing() -> None:
    data_path = ROOT / "data/feature-tree.json"
    if not data_path.exists():
        pytest.skip("parallel formal data has not appeared yet")
    original = data_path.read_bytes()
    diff = run(data_path, PROPOSAL_PATH, schema_path=SCHEMA_PATH)
    assert "feat-example-proposal" in diff
    assert data_path.read_bytes() == original


def test_explicit_apply_appends_exactly_one_feature(tmp_path: Path) -> None:
    data_path = tmp_path / "features.yaml"
    data_path.write_text(yaml.safe_dump(tree_document(), allow_unicode=True, sort_keys=False), encoding="utf-8")
    run(data_path, PROPOSAL_PATH, apply=True, schema_path=SCHEMA_PATH)
    updated = yaml.safe_load(data_path.read_text(encoding="utf-8"))
    ids = [item["id"] for item in updated["features"]]
    assert ids.count("feat-example-proposal") == 1
    assert len(ids) == 7
    validate_tree(updated["features"])


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("parent_id", "feat-missing", "does not exist"),
        ("parent_id", None, "exactly one"),
        ("kind", "component", "component/source/commit"),
        ("id", "feat-olmo3-standard", "structural root"),
        ("status", "successful", "must be one of"),
    ],
)
def test_invalid_proposals_are_rejected(field: str, value: object, message: str) -> None:
    proposal = yaml.safe_load(PROPOSAL_PATH.read_text(encoding="utf-8"))
    proposal[field] = value
    with pytest.raises(ContractError, match=message):
        validate_proposal(proposal, tree_document()["features"])


def test_auxiliary_relations_do_not_change_structural_parent() -> None:
    document = tree_document()
    target = copy.deepcopy(document["features"][-1])
    target["depends_on"] = ["feat-beta"]
    target["related_to"] = ["feat-failed"]
    validate_tree(document["features"][:-1] + [target])
    assert target["parent_id"] == "feat-alpha"
