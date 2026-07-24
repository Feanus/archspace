from __future__ import annotations

import copy
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from ingest.build_concept_olmo_proposals import build_bundle
from ingest.validate_concept_proposals import (
    INITIAL,
    OLD_SNAPSHOT_ID,
    SHARED_SNAPSHOT_FEATURES,
    STRUCTURAL_PARENTS,
    combine_with_root,
    proposal_issues,
    split_proposal_issues,
    tree_depth,
)
from scripts.validate_feature_tree import validate_document
from sources.verify_concept_olmo_observation import load_record, validate_record


OBSERVATION = ROOT / "sources/concept-olmo-observation.yaml"
PROPOSAL = ROOT / "ingest/proposals/concept-olmo-feature-tree.json"
SPLIT_DIR = ROOT / "ingest/proposals/concept-olmo"
SCHEMA = ROOT / "schema/feature-tree.schema.json"
DATA = ROOT / "data/feature-tree.json"
DIFF_REVIEW = ROOT / "evaluation/FEATURE_DIFF_REVIEW_ZH.md"
GROWTH_REPORT = ROOT / "evaluation/concept-olmo-feature-growth.md"


def load_bundle() -> dict:
    return json.loads(PROPOSAL.read_text(encoding="utf-8"))


def test_work_repository_observation_is_pinned_but_not_root_or_official() -> None:
    record = load_record(OBSERVATION)
    assert validate_record(record) == []
    assert record["repository"]["role"] == "derived_private_work_repository"
    assert record["repository"]["official_olmo3_source"] is False
    assert record["repository"]["root_provenance"] is False
    assert record["observation_range"]["head_revision"] == "6ae216283d88f8db0cb35e18c818018617b50f65"


def test_observation_rejects_official_mislabel_branch_locator_short_commit_and_missing_hash() -> None:
    record = load_record(OBSERVATION)
    official = copy.deepcopy(record)
    official["repository"]["official_olmo3_source"] = True
    assert any("official OLMo-3" in error for error in validate_record(official))
    branch = copy.deepcopy(record)
    branch["artifacts"][0]["locator"] = "https://github.com/Liu-yuliang/concept_olmo/blob/main/README.md"
    assert any("pinned" in error or "branch" in error for error in validate_record(branch))
    short = copy.deepcopy(record)
    short["artifacts"][0]["revision"] = "6ae2162"
    assert any("full 40-character" in error for error in validate_record(short))
    unhashed = copy.deepcopy(record)
    unhashed["artifacts"][0]["sha256"] = None
    assert any("SHA-256" in error for error in validate_record(unhashed))


def test_observation_rejects_token_like_values_and_absolute_internal_paths() -> None:
    record = load_record(OBSERVATION)
    token = copy.deepcopy(record)
    token["repository"]["url"] = "https://github.com/Liu-yuliang/concept_olmo?access_token=github_pat_example_secret_value"
    assert any("token" in error or "credentials" in error for error in validate_record(token))
    internal = copy.deepcopy(record)
    internal["unresolved"].append("/mnt/private/checkpoint")
    assert any("absolute internal path" in error for error in validate_record(internal))


def test_generated_proposal_is_deterministic_safe_and_split_consistent() -> None:
    stored = load_bundle()
    assert stored == build_bundle()
    assert proposal_issues(stored) == []
    assert split_proposal_issues(stored, SPLIT_DIR) == []
    assert len(stored["features"]) == 18
    assert stored["work_repository"]["official_olmo3_source"] is False


def test_root_plus_candidates_passes_schema_and_semantic_validation() -> None:
    bundle = load_bundle()
    root_data = json.loads(DATA.read_text(encoding="utf-8"))
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    combined = combine_with_root(bundle, root_data)
    assert validate_document(combined, schema) == []
    assert tree_depth(combined["features"]) == 4


def test_exact_ten_structural_ids_parents_and_chinese_fields() -> None:
    bundle = load_bundle()
    by_id = {feature["id"]: feature for feature in bundle["features"]}
    structural = {feature_id for feature_id, assessment in bundle["feature_assessments"].items() if assessment["decision_status"] == "adjudicated"}
    assert structural == set(STRUCTURAL_PARENTS)
    assert len(structural) == 10
    for feature_id, parent_id in STRUCTURAL_PARENTS.items():
        feature = by_id[feature_id]
        assert feature["category"] == "architecture"
        assert feature["parent_id"] == parent_id
        assert feature["title_zh"].strip()
        assert feature["summary_zh"].strip()
        assert feature["provenance"]["fields"]["title_zh"] == "work-repo"
        assert feature["provenance"]["fields"]["summary_zh"] == "work-repo"


def test_structural_siblings_and_cumsum_branches_match_human_ruling() -> None:
    by_id = {feature["id"]: feature for feature in load_bundle()["features"]}
    assert by_id["feat-concept-hlm-backbone-window"]["parent_id"] == "feat-concept-hlm-predictor"
    assert by_id["feat-concept-hlm-olmo3-layer-reuse"]["parent_id"] == "feat-concept-hlm-predictor"
    assert by_id["feat-concept-cumsum-self-dd"]["parent_id"] == "feat-concept-self-dd"
    assert by_id["feat-concept-cross-module-cumsum-routes"]["parent_id"] == "feat-concept-cross-module-residual-read"


def test_shared_initial_snapshot_supports_six_features_with_distinct_locators() -> None:
    bundle = load_bundle()
    initial = next(item for item in bundle["commit_classification"] if item["commit"] == INITIAL)
    assert initial["disposition"] == "feature_implementation"
    assert initial["evidence_role"] == "shared_initial_snapshot_evidence"
    assert set(initial["feature_ids"]) == SHARED_SNAPSHOT_FEATURES
    assessments = bundle["feature_assessments"]
    locator_symbols = {
        feature_id: tuple(locator["symbol"] for locator in assessments[feature_id]["primary_locators"])
        for feature_id in SHARED_SNAPSHOT_FEATURES
    }
    assert all(all(locator["revision"] == INITIAL for locator in assessments[feature_id]["primary_locators"]) for feature_id in SHARED_SNAPSHOT_FEATURES)
    assert "ConceptLMV2Model.__init__ / ConceptLMV2Model.forward" in locator_symbols["feat-concept-segmented-topology"]
    assert "ConceptPredictorV2" in locator_symbols["feat-concept-hlm-predictor"]
    assert set(locator_symbols["feat-concept-chunk-representation"]) == {"ConceptLMV2Model._merge_token_chunks", "ConceptLMV2Model._repeat_shift_concepts"}
    assert any("ConceptLMV22VQModel" in symbol for symbol in locator_symbols["feat-concept-product-vq"])
    assert locator_symbols["feat-concept-self-dd"] == ("V21SelfDD / V21DepthDD",)
    assert any("V21ResidualFlowRouteAdd" in symbol for symbol in locator_symbols["feat-concept-cross-module-residual-read"])


def test_chunk_and_vq_parameters_remain_inside_their_features() -> None:
    by_id = {feature["id"]: feature for feature in load_bundle()["features"]}
    chunk_after = by_id["feat-concept-chunk-representation"]["delta"]["operations"][0]["after"]
    assert chunk_after == {"chunk_size": 4, "pooling": "meanpooling", "shift_feature": True, "representation": "continuous concept vector"}
    vq_after = by_id["feat-concept-product-vq"]["delta"]["operations"][0]["after"]
    assert vq_after["codebooks"] == 32
    assert vq_after["codebook_size"] == 128


def test_d08_is_conditional_and_has_explicit_downgrade_path() -> None:
    assessment = load_bundle()["feature_assessments"]["feat-concept-hlm-olmo3-layer-reuse"]
    assert assessment["admission"] == "conditional"
    assert assessment["recommended_for_merge"] is False
    assert "Downgrade D08" in assessment["conditional_review"]["if_equivalent"]
    assert "algorithm review" == assessment["conditional_review"]["owner"]


def test_diff_review_has_nineteen_rows_ten_structural_and_nine_pending() -> None:
    bundle = load_bundle()
    review = bundle["diff_review"]
    assert (review["total"], review["structural_count"], review["pending_count"]) == (19, 10, 9)
    records = review["records"]
    assert len(records) == len({record["id"] for record in records}) == 19
    assert {record["id"] for record in records if record["decision"] == "pending"} == {"D01", "D02", "D03", "D11", "D12", "D13", "D14", "D15", "D16"}


def test_chinese_diff_review_table_has_exactly_nineteen_semantic_rows() -> None:
    text = DIFF_REVIEW.read_text(encoding="utf-8")
    section = text.split("## 全部 19 条语义原子 diff", 1)[1].split("## Commit-pinned 结构来源", 1)[0]
    rows = re.findall(r"^\| (D(?:\d{2}[ab]?)) \|", section, flags=re.MULTILINE)
    assert len(rows) == len(set(rows)) == 19


def test_old_snapshot_id_is_only_superseded_history_not_active_structure() -> None:
    bundle = load_bundle()
    active = json.dumps(bundle["features"], ensure_ascii=False)
    assert OLD_SNAPSHOT_ID not in active
    migration = bundle["migration"]["superseded_feature_ids"]
    assert migration == [next(item for item in migration if item["id"] == OLD_SNAPSHOT_ID)]
    assert migration[0]["status"] == "superseded"
    assert set(migration[0]["replaced_by"]) == SHARED_SNAPSHOT_FEATURES


def test_engineering_features_record_d05a_d06a_d06b_as_structural_background() -> None:
    by_id = {feature["id"]: feature for feature in load_bundle()["features"]}
    expected = {"feat-concept-chunk-representation", "feat-concept-self-dd", "feat-concept-cross-module-residual-read"}
    for feature_id in ("feat-concept-segmented-inference-runtime", "feat-concept-variable-length-batching", "feat-concept-flash-decode-evaluation"):
        assert set(by_id[feature_id]["depends_on"]) == expected


def test_categories_validation_and_pending_decisions_are_explicit() -> None:
    assessments = load_bundle()["feature_assessments"]
    assert Counter(item["category"] for item in assessments.values()) == Counter({"architecture": 10, "runtime": 4, "model_configuration": 2, "training_configuration": 2})
    assert Counter(item["validation_status"] for item in assessments.values()) == Counter({"unverified": 16, "mixed": 2})
    assert sum(item["decision_status"] == "pending" for item in assessments.values()) == 8
    assert sum(item["has_effect_evidence"] for item in assessments.values()) == 2
    assert sum(item["recommended_for_merge"] for item in assessments.values()) == 9


def test_every_main_observation_commit_is_classified_once() -> None:
    classifications = load_bundle()["commit_classification"]
    commits = [item["commit"] for item in classifications]
    assert len(commits) == len(set(commits)) == 32
    assert sum(item["disposition"].startswith("feature_") for item in classifications) == 31
    rejected = [item for item in classifications if item["disposition"] == "rejected_engineering"]
    assert [item["commit"] for item in rejected] == ["9ec27a113876f0c6d4ee9bc6ce7be55fd8690ca2"]
    fastpath = next(item for item in classifications if item["commit"] == "c5e4a029e6018cdcdbe500c5f13dc020c9d9fa4f")
    assert fastpath["disposition"] == "feature_evidence"
    assert set(fastpath["feature_ids"]) == {"feat-concept-self-dd", "feat-concept-cross-module-residual-read"}


def test_one_feature_per_file_manifest_matches_bundle() -> None:
    bundle = load_bundle()
    manifest = json.loads((SPLIT_DIR / "manifest.json").read_text(encoding="utf-8"))
    files = list((SPLIT_DIR / "features").glob("*.json"))
    assert len(manifest["features"]) == len(files) == len(bundle["features"]) == 18
    for feature in bundle["features"]:
        path = SPLIT_DIR / "features" / f"{feature['id']}.json"
        assert json.loads(path.read_text(encoding="utf-8")) == feature


def test_growth_report_mentions_authoritative_counts_and_no_active_snapshot() -> None:
    text = GROWTH_REPORT.read_text(encoding="utf-8")
    assert "18" in text
    assert "10" in text
    assert "19" in text
    assert "9" in text
    for line in text.splitlines():
        if OLD_SNAPSHOT_ID in line:
            assert "superseded" in line.lower()
