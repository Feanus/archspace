from __future__ import annotations

import copy
import json
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator


REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = REPO_ROOT / "schema" / "structural-feature-admission.schema.json"
CASES_PATH = REPO_ROOT / "tests" / "model" / "fixtures" / "structural-feature-admission.cases.json"


class StructuralFeaturePolicyContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
        cls.document = json.loads(CASES_PATH.read_text(encoding="utf-8"))
        Draft202012Validator.check_schema(cls.schema)
        cls.validator = Draft202012Validator(cls.schema)

    def case(self, case_id: str) -> dict:
        return copy.deepcopy(next(case for case in self.document["cases"] if case["id"] == case_id))

    def errors(self, *cases: dict) -> list:
        document = {"policy_version": "1.0.0", "cases": list(cases)}
        return sorted(self.validator.iter_errors(document), key=lambda error: list(error.absolute_path))

    def test_policy_fixture_is_schema_valid_and_case_ids_are_unique(self) -> None:
        self.assertEqual([], list(self.validator.iter_errors(self.document)))
        ids = [case["id"] for case in self.document["cases"]]
        self.assertEqual(len(ids), len(set(ids)))

    def test_independent_switch_or_ablation_dimension_is_admitted(self) -> None:
        case = self.case("case-independent-route-switch")
        self.assertEqual("admit_feature", case["decision"])
        self.assertTrue(case["independent_switch"] or case["independent_ablation"])
        self.assertEqual([], self.errors(case))

    def test_pooling_and_codebook_parameters_stay_in_parent(self) -> None:
        cases = [
            self.case("case-pooling-mode-parameter"),
            self.case("case-codebook-size-parameter"),
        ]
        self.assertTrue(all(case["decision"] == "keep_in_parent" for case in cases))
        self.assertTrue(all(case["parameter_scope"] == "within_mechanism" for case in cases))
        self.assertEqual([], self.errors(*cases))

    def test_same_cumsum_technique_can_form_two_features_for_distinct_subjects(self) -> None:
        self_dd = self.case("case-cumsum-self-dd")
        route_source = self.case("case-cumsum-route-source")
        self.assertEqual(self_dd["technique"], route_source["technique"])
        self.assertNotEqual(self_dd["subject"], route_source["subject"])
        self.assertEqual("admit_feature", self_dd["decision"])
        self.assertEqual("admit_feature", route_source["decision"])
        self.assertEqual([], self.errors(self_dd, route_source))

    def test_equivalent_transformerblock_replacement_is_evidence_only(self) -> None:
        case = self.case("case-transformerblock-equivalent")
        self.assertEqual("equivalent", case["semantic_equivalence"])
        self.assertEqual("evidence_only", case["decision"])
        self.assertEqual([], self.errors(case))

    def test_unresolved_transformerblock_equivalence_requires_downgrade_condition(self) -> None:
        case = self.case("case-transformerblock-unresolved-equivalence")
        self.assertEqual("conditional_proposal", case["decision"])
        self.assertTrue(case["downgrade_condition"])
        self.assertEqual([], self.errors(case))

    def test_shared_snapshot_commit_does_not_force_feature_merge(self) -> None:
        representation = self.case("case-shared-snapshot-representation")
        routing = self.case("case-shared-snapshot-routing")
        self.assertEqual(representation["shared_snapshot_group"], routing["shared_snapshot_group"])
        self.assertEqual(representation["evidence_revision"], routing["evidence_revision"])
        self.assertNotEqual(representation["subject"], routing["subject"])
        self.assertEqual("admit_feature", representation["decision"])
        self.assertEqual("admit_feature", routing["decision"])
        self.assertEqual([], self.errors(representation, routing))

    def test_parameter_choice_cannot_be_declared_as_a_new_feature(self) -> None:
        case = self.case("case-pooling-mode-parameter")
        case["decision"] = "admit_feature"
        self.assertTrue(self.errors(case))

    def test_admitted_dimension_needs_switch_or_ablation(self) -> None:
        case = self.case("case-independent-route-switch")
        case["independent_switch"] = False
        case["configuration_key"] = None
        case["independent_ablation"] = False
        case["ablation_id"] = None
        self.assertTrue(self.errors(case))

    def test_equivalent_implementation_cannot_be_admitted_as_structure(self) -> None:
        case = self.case("case-transformerblock-equivalent")
        case["change_kind"] = "structural_dimension"
        case["parameter_scope"] = "mechanism"
        case["independent_switch"] = True
        case["configuration_key"] = "model.block.class"
        case["decision"] = "admit_feature"
        self.assertTrue(self.errors(case))

    def test_conditional_proposal_without_downgrade_condition_is_rejected(self) -> None:
        case = self.case("case-transformerblock-unresolved-equivalence")
        case["downgrade_condition"] = None
        self.assertTrue(self.errors(case))

    def test_switch_metadata_requires_a_configuration_key(self) -> None:
        case = self.case("case-independent-route-switch")
        case["configuration_key"] = None
        self.assertTrue(self.errors(case))


if __name__ == "__main__":
    unittest.main()
