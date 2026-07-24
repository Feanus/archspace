from __future__ import annotations

import copy
import json
import subprocess
import sys
import unittest
from pathlib import Path
from urllib.parse import urlsplit

from scripts.build_feature_tree import LEGACY_SYNTHETIC_IDS, LOCKED_PARENT_BY_ID
from scripts.validate_feature_tree import ROOT_ID, summarize, validate_document


REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_PATH = REPO_ROOT / "data" / "feature-tree.json"
SCHEMA_PATH = REPO_ROOT / "schema" / "feature-tree.schema.json"
CLI_PATH = REPO_ROOT / "scripts" / "validate_feature_tree.py"


class FeatureTreeValidationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
        cls.schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))

    def validate(self, data: dict) -> list:
        return validate_document(data, self.schema, require_formal=True)

    @staticmethod
    def codes(issues: list) -> set[str]:
        return {issue.code for issue in issues}

    @staticmethod
    def feature(data: dict, feature_id: str) -> dict:
        return next(feature for feature in data["features"] if feature["id"] == feature_id)

    def test_canonical_projection_is_valid_and_has_expected_scale(self) -> None:
        self.assertEqual([], self.validate(self.data))
        self.assertEqual(
            {
                "features": 11,
                "structural_edges": 10,
                "depends_on_edges": 0,
                "related_to_edges": 8,
                "unresolved_baseline_claims": 6,
            },
            summarize(self.data),
        )

    def test_exact_reviewed_ids_and_parents_are_preserved(self) -> None:
        actual = {feature["id"]: feature["parent_id"] for feature in self.data["features"]}
        self.assertEqual(LOCKED_PARENT_BY_ID, actual)

    def test_no_legacy_synthetic_feature_remains_in_formal_data(self) -> None:
        ids = {feature["id"] for feature in self.data["features"]}
        self.assertTrue(ids.isdisjoint(LEGACY_SYNTHETIC_IDS))
        self.assertFalse(any("synthetic" in feature_id or "fixture" in feature_id for feature_id in ids))

    def test_every_non_root_feature_has_formal_contract_fields(self) -> None:
        for feature in self.data["features"]:
            if feature["id"] == ROOT_ID:
                continue
            self.assertEqual("architecture", feature["category"])
            self.assertIn(feature["validation_status"], {"validated", "mixed", "failed", "unverified"})
            self.assertTrue(feature["title"].strip())
            self.assertTrue(feature["title_zh"].strip())
            self.assertTrue(feature["summary"].strip())
            self.assertTrue(feature["summary_zh"].strip())
            self.assertTrue(feature["code_locators"])
            self.assertIsInstance(feature["validation"], dict)

    def test_structured_code_locators_are_complete_pinned_and_credential_free(self) -> None:
        for feature in self.data["features"]:
            if feature["id"] == ROOT_ID:
                continue
            for locator in feature["code_locators"]:
                self.assertEqual(
                    {"repository", "revision", "path", "symbol", "role", "url"},
                    set(locator),
                )
                self.assertEqual(40, len(locator["revision"]))
                self.assertFalse(Path(locator["path"]).is_absolute())
                self.assertNotIn("..", Path(locator["path"]).parts)
                self.assertTrue(locator["symbol"].strip())
                self.assertTrue(locator["role"].strip())
                repository = urlsplit(locator["repository"])
                pinned_url = urlsplit(locator["url"])
                self.assertEqual("https", repository.scheme)
                self.assertEqual("https", pinned_url.scheme)
                self.assertIsNone(repository.username)
                self.assertIsNone(pinned_url.username)
                self.assertIn(locator["revision"], pinned_url.path)
                self.assertIn(locator["path"], pinned_url.path)

    def test_parent_relative_validation_summary_is_explicit(self) -> None:
        for feature in self.data["features"]:
            if feature["id"] == ROOT_ID:
                continue
            validation = feature["validation"]
            self.assertTrue(validation["comparison"].strip())
            self.assertTrue(validation["conditions"])
            self.assertTrue(validation["metrics"] or validation["observations"])
            self.assertIsInstance(validation["artifacts"], list)
            self.assertTrue(validation["conclusion"].strip())
            self.assertIsInstance(validation["limitations"], list)
            self.assertTrue(validation["evidence_ids"])

    def test_d08_remains_unverified_and_conditional(self) -> None:
        feature = self.feature(self.data, "feat-concept-hlm-olmo3-layer-reuse")
        self.assertEqual("unverified", feature["validation_status"])
        self.assertEqual("conditional", feature["structural_review"]["decision"])
        self.assertEqual("unresolved", feature["structural_review"]["semantic_equivalence"])
        self.assertIn("Downgrade", feature["structural_review"]["downgrade_condition"])

    def test_root_baseline_unknowns_remain_explicitly_unresolved(self) -> None:
        root = self.feature(self.data, ROOT_ID)
        for name in ("model_scale", "repository", "revision", "configuration", "checkpoint", "license"):
            self.assertIsNone(root["baseline"][name]["value"])
            source_name = root["baseline"][name]["provenance"]
            self.assertEqual("unresolved", root["provenance"]["sources"][source_name]["state"])

    def test_duplicate_feature_id_is_rejected(self) -> None:
        data = copy.deepcopy(self.data)
        data["features"][-1]["id"] = data["features"][-2]["id"]
        self.assertIn("DUPLICATE_ID", self.codes(self.validate(data)))

    def test_second_root_is_rejected(self) -> None:
        data = copy.deepcopy(self.data)
        self.feature(data, "feat-concept-hlm-backbone-window")["parent_id"] = None
        codes = self.codes(self.validate(data))
        self.assertIn("ROOT_SET", codes)
        self.assertIn("PARENT_REQUIRED", codes)

    def test_wrong_root_identity_is_rejected(self) -> None:
        data = copy.deepcopy(self.data)
        self.feature(data, ROOT_ID)["title"] = "Some baseline"
        self.assertIn("ROOT_IDENTITY", self.codes(self.validate(data)))

    def test_missing_parent_is_rejected_and_tree_is_disconnected(self) -> None:
        data = copy.deepcopy(self.data)
        self.feature(data, "feat-concept-product-vq")["parent_id"] = "feat-missing-parent"
        codes = self.codes(self.validate(data))
        self.assertIn("MISSING_PARENT", codes)
        self.assertIn("DISCONNECTED", codes)

    def test_structural_cycle_is_rejected(self) -> None:
        data = copy.deepcopy(self.data)
        self.feature(data, "feat-concept-segmented-topology")["parent_id"] = "feat-concept-hlm-predictor"
        codes = self.codes(self.validate(data))
        self.assertIn("CYCLE", codes)
        self.assertIn("DISCONNECTED", codes)

    def test_auxiliary_reference_must_exist(self) -> None:
        data = copy.deepcopy(self.data)
        self.feature(data, "feat-concept-hlm-backbone-window")["depends_on"] = ["feat-unknown"]
        self.assertIn("MISSING_AUXILIARY_TARGET", self.codes(self.validate(data)))

    def test_auxiliary_self_reference_is_rejected(self) -> None:
        data = copy.deepcopy(self.data)
        feature = self.feature(data, "feat-concept-product-vq")
        feature["related_to"] = [feature["id"]]
        self.assertIn("SELF_RELATION", self.codes(self.validate(data)))

    def test_auxiliary_cycle_does_not_become_a_structural_cycle(self) -> None:
        data = copy.deepcopy(self.data)
        self.feature(data, "feat-concept-segmented-topology")["depends_on"] = [
            "feat-concept-product-vq"
        ]
        self.feature(data, "feat-concept-product-vq")["depends_on"] = [
            "feat-concept-segmented-topology"
        ]
        self.assertEqual([], self.validate(data))

    def test_non_feature_record_and_top_level_entity_collection_are_rejected(self) -> None:
        data = copy.deepcopy(self.data)
        data["commits"] = [{"id": "deadbeef"}]
        data["features"][1]["record_type"] = "commit"
        codes = self.codes(self.validate(data))
        self.assertIn("NON_FEATURE_COLLECTION", codes)
        self.assertIn("NON_FEATURE_RECORD", codes)
        self.assertIn("SCHEMA", codes)

    def test_positional_id_is_rejected(self) -> None:
        data = copy.deepcopy(self.data)
        self.feature(data, "feat-concept-product-vq")["id"] = "feat-node-7"
        self.assertIn("POSITIONAL_ID", self.codes(self.validate(data)))

    def test_every_present_top_level_field_needs_provenance(self) -> None:
        data = copy.deepcopy(self.data)
        feature = self.feature(data, "feat-concept-hlm-backbone-window")
        del feature["provenance"]["fields"]["validation_status"]
        self.assertIn("MISSING_FIELD_PROVENANCE", self.codes(self.validate(data)))

    def test_evidence_reference_must_be_local_and_existing(self) -> None:
        data = copy.deepcopy(self.data)
        feature = self.feature(data, "feat-concept-cumsum-self-dd")
        feature["validation"]["evidence_ids"] = ["ev-not-present"]
        self.assertIn("MISSING_EVIDENCE", self.codes(self.validate(data)))

    def test_formal_feature_missing_code_locator_is_rejected(self) -> None:
        data = copy.deepcopy(self.data)
        del self.feature(data, "feat-concept-product-vq")["code_locators"]
        self.assertIn("FORMAL_SCHEMA", self.codes(self.validate(data)))

    def test_invalid_validation_status_is_rejected(self) -> None:
        data = copy.deepcopy(self.data)
        self.feature(data, "feat-concept-product-vq")["validation_status"] = "successful"
        self.assertIn("SCHEMA", self.codes(self.validate(data)))

    def test_code_locator_rejects_credentials_and_unpinned_revision(self) -> None:
        data = copy.deepcopy(self.data)
        locator = self.feature(data, "feat-concept-product-vq")["code_locators"][0]
        locator["repository"] = "https://token@example.com/private/repo"
        locator["url"] = locator["url"].replace(locator["revision"], "main")
        codes = self.codes(self.validate(data))
        self.assertIn("CREDENTIAL_OR_UNSTABLE_REPOSITORY", codes)
        self.assertIn("REVISION_NOT_IN_CODE_URL", codes)

    def test_experiment_index_schema_is_present_and_wandb_report_is_sanitized(self) -> None:
        schema_path = REPO_ROOT / "schema" / "experiment-index.schema.json"
        self.assertTrue(schema_path.is_file())
        document = json.loads((REPO_ROOT / "data" / "experiments.json").read_text(encoding="utf-8"))
        wandb = self.experiment(document, "exp-olmo2-0425-1b-training-report")
        self.assertEqual("https://wandb.ai/ai2-llm/olmo-small/reports/Training-Logs-of-OLMo2-0425-1B--VmlldzoxMjUzOTUxNA", wandb["wandb_url"])
        self.assertNotIn("accessToken", json.dumps(document, ensure_ascii=False))

    @staticmethod
    def experiment(data: dict, experiment_id: str) -> dict:
        return next(experiment for experiment in data["experiments"] if experiment["id"] == experiment_id)

    def test_cli_json_output_is_repeatable(self) -> None:
        command = [sys.executable, str(CLI_PATH), "--json"]
        first = subprocess.run(command, cwd=REPO_ROOT, check=True, text=True, capture_output=True)
        second = subprocess.run(command, cwd=REPO_ROOT, check=True, text=True, capture_output=True)
        self.assertEqual(first.stdout, second.stdout)
        payload = json.loads(first.stdout)
        self.assertTrue(payload["valid"])
        self.assertEqual([], payload["issues"])


if __name__ == "__main__":
    unittest.main()
