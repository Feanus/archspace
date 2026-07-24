#!/usr/bin/env python3
"""Run offline IS-S01/IS-S02 contract checks and emit a machine-readable report."""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any
from urllib.error import URLError
from urllib.request import urlopen

import yaml
from jsonschema import Draft202012Validator

from ingest.feature_proposal import ContractError, extract_features, validate_tree
from sources.verify_olmo3_source import load_record, validate_record


ROOT_ID = "feat-olmo3-standard"
REPO_ROOT = Path(__file__).resolve().parents[1]
CANONICAL_FEATURE_IDS = {
    ROOT_ID,
    "feat-concept-segmented-topology",
    "feat-concept-hlm-predictor",
    "feat-concept-hlm-backbone-window",
    "feat-concept-hlm-olmo3-layer-reuse",
    "feat-concept-chunk-representation",
    "feat-concept-product-vq",
    "feat-concept-self-dd",
    "feat-concept-cumsum-self-dd",
    "feat-concept-cross-module-residual-read",
    "feat-concept-cross-module-cumsum-routes",
}
FORBIDDEN_NODE_KINDS = {"component", "commit", "source", "session", "paper", "experiment"}
ANSI_RE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")


@dataclass
class Check:
    id: str
    requirement: str
    passed: bool
    detail: str
    blocking: bool = True


def _load(path: Path) -> Any:
    text = path.read_text(encoding="utf-8")
    if path.suffix.lower() == ".json":
        return json.loads(text)
    return yaml.safe_load(text)


def _display_path(path: Path | None) -> str | None:
    if path is None:
        return None
    try:
        return path.resolve().relative_to(REPO_ROOT.resolve()).as_posix()
    except ValueError:
        return path.name


def discover_data(data_dir: Path) -> Path | None:
    if not data_dir.is_dir():
        return None
    candidates = sorted(
        path for path in data_dir.rglob("*") if path.is_file() and path.suffix.lower() in {".json", ".yaml", ".yml"}
    )
    return candidates[0] if len(candidates) == 1 else None


def check_source(source_path: Path) -> list[Check]:
    try:
        record = load_record(source_path)
        errors = validate_record(record)
    except Exception as exc:  # reported as evidence, not hidden behind a traceback
        return [Check("SRC-01", "baseline source record is valid", False, str(exc))]
    checks = [
        Check(
            "SRC-01",
            "baseline source record is valid and honest",
            not errors,
            "; ".join(errors) if errors else f"status={record.get('status')}",
        )
    ]
    strict_errors = validate_record(record, require_pinned=True)
    unresolved = record.get("unresolved_fields", [])
    checks.append(
        Check(
            "SRC-02",
            "OLMo-3 baseline is fully pinned",
            not strict_errors,
            f"unresolved_fields={unresolved}" if strict_errors else "all required facts are pinned",
            False,
        )
    )
    return checks


def check_data(data_path: Path | None, schema_path: Path) -> list[Check]:
    if data_path is None:
        return [
            Check("IS-S01-DATA", "formal Feature data exists unambiguously", False, "no single YAML/JSON data file discovered")
        ]
    try:
        document = _load(data_path)
        features, _ = extract_features(document)
    except Exception as exc:
        return [Check("IS-S01-DATA", "formal Feature data loads", False, str(exc))]

    checks: list[Check] = []
    try:
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        errors = sorted(Draft202012Validator(schema).iter_errors(document), key=lambda error: list(error.path))
        detail = "schema valid" if not errors else errors[0].message
        checks.append(Check("IS-S01-01", "formal data satisfies canonical schema", not errors, detail))
    except Exception as exc:
        checks.append(Check("IS-S01-01", "formal data satisfies canonical schema", False, str(exc)))

    roots = [feature for feature in features if feature.get("parent_id") is None]
    checks.append(
        Check(
            "IS-S01-02",
            "there is exactly one OLMo-3 structural root",
            len(roots) == 1 and roots[0].get("id") == ROOT_ID,
            f"roots={[feature.get('id') for feature in roots]}",
        )
    )
    invalid_nodes = [
        feature.get("id")
        for feature in features
        if feature.get("record_type") != "feature"
        or (feature.get("id") != ROOT_ID and feature.get("kind") != "feature")
        or feature.get("kind") in FORBIDDEN_NODE_KINDS
    ]
    checks.append(
        Check(
            "IS-S01-03",
            "every formal node is a Feature",
            not invalid_nodes,
            f"invalid={invalid_nodes}" if invalid_nodes else f"count={len(features)}",
        )
    )
    try:
        validate_tree(features)
        tree_error = None
    except ContractError as exc:
        tree_error = str(exc)
    checks.append(
        Check(
            "IS-S01-04",
            "parent_id is single-parent, connected, and acyclic",
            tree_error is None,
            tree_error or "all Features reach the root exactly once",
        )
    )
    feature_ids = {feature.get("id") for feature in features}
    checks.append(
        Check(
            "IS-S01-05",
            "formal data is exactly the reviewed root plus ten structural Features",
            feature_ids == CANONICAL_FEATURE_IDS,
            f"ids={sorted(feature_ids)}",
        )
    )
    ids = {feature.get("id") for feature in features}
    bad_aux: list[str] = []
    for feature in features:
        for field in ("depends_on", "related_to"):
            references = feature.get(field)
            if not isinstance(references, list):
                bad_aux.append(f"{feature.get('id')}.{field}:not-list")
                continue
            for reference in references:
                if reference not in ids:
                    bad_aux.append(f"{feature.get('id')}.{field}:{reference}")
    checks.append(
        Check(
            "IS-S01-06",
            "auxiliary relations reference Features and do not define tree parents",
            not bad_aux,
            f"invalid={bad_aux}" if bad_aux else "only parent_id was used for structural validation",
        )
    )
    serialized = json.dumps(document, ensure_ascii=False).lower()
    fallback_markers = [marker for marker in ("fallback", "mock-data", "sample-data") if marker in serialized]
    checks.append(
        Check(
            "IS-S01-07",
            "formal data contains no fallback payload",
            not fallback_markers,
            f"markers={fallback_markers}" if fallback_markers else "no fallback markers",
        )
    )
    return checks


def check_web(web_dir: Path, base_url: str | None) -> list[Check]:
    source_files = []
    if web_dir.is_dir():
        source_files = [
            path for path in web_dir.rglob("*")
            if path.is_file()
            and not {"node_modules", "tests"}.intersection(path.parts)
            and path.suffix.lower() in {".html", ".js", ".jsx", ".ts", ".tsx", ".css"}
        ]
    checks = [
        Check(
            "IS-S02-01",
            "web implementation exists",
            bool(source_files),
            f"source_files={len(source_files)}",
        )
    ]
    if not base_url:
        checks.append(Check("IS-S02-02", "local service is reachable", False, "--base-url was not supplied"))
        return checks
    try:
        with urlopen(base_url, timeout=5) as response:
            body = response.read()
            ok = response.status == 200 and bool(body)
            detail = f"HTTP {response.status}, bytes={len(body)}"
    except (OSError, URLError) as exc:
        ok = False
        detail = str(exc)
    checks.append(Check("IS-S02-02", "local service is reachable", ok, detail))
    return checks


def check_browser(report_path: Path) -> list[Check]:
    requirements = {
        "formal data renders one Feature-only root canvas": (
            "IS-S02-03", "main canvas renders only the formal Feature tree"
        ),
        "expand and collapse preserve the adjudicated HLM branch": (
            "IS-S02-04", "expand/collapse preserves the adjudicated HLM branch"
        ),
        "selection shows complete Feature details and auxiliary edges stay auxiliary": (
            "IS-S02-05", "selection details are complete and auxiliary edges do not change the tree"
        ),
        "search reveals a collapsed Product-VQ path and opens its details": (
            "IS-S02-06", "search reveals the collapsed Product-VQ path and opens correct details"
        ),
        "root detail exposes every unresolved OLMo-3 pin field honestly": (
            "IS-S02-07", "root details expose every OLMo-3 pin field and unresolved state"
        ),
        "missing formal data is an explicit error and never a fallback tree": (
            "IS-S02-08", "missing formal data never activates a fallback tree"
        ),
    }
    if not report_path.is_file():
        return [
            Check(
                check_id,
                requirement,
                False,
                f"browser report missing: {report_path}",
            )
            for check_id, requirement in requirements.values()
        ]
    try:
        report = json.loads(report_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return [Check("IS-S02-BROWSER", "browser report is readable", False, str(exc))]

    results: dict[str, tuple[bool, str]] = {}
    for suite in report.get("suites", []):
        for spec in suite.get("specs", []):
            title = spec.get("title")
            tests = spec.get("tests", [])
            test_results = [result for test in tests for result in test.get("results", [])]
            passed = bool(test_results) and all(result.get("status") == "passed" for result in test_results)
            messages = [
                ANSI_RE.sub("", result.get("error", {}).get("message", ""))
                for result in test_results
                if result.get("status") != "passed"
            ]
            detail = " | ".join(message for message in messages if message) or "browser assertion passed"
            if "Expected substring" in detail and "license" in detail:
                detail = "formal root detail does not expose the unresolved license field"
            elif not passed:
                detail = detail.splitlines()[0][:500]
            results[title] = (passed, detail)

    checks: list[Check] = []
    for title, (check_id, requirement) in requirements.items():
        passed, detail = results.get(title, (False, "test result not found"))
        checks.append(Check(check_id, requirement, passed, detail))
    return checks


def render_markdown(checks: list[Check], data_path: Path | None) -> str:
    passed = sum(check.passed for check in checks)
    failed = sum(not check.passed and check.blocking for check in checks)
    unresolved = sum(not check.passed and not check.blocking for check in checks)
    lines = [
        "# InternSpace IS-S01 / IS-S02 acceptance report",
        "",
        f"Result: **{passed} PASS / {failed} FAIL / {unresolved} UNRESOLVED**",
        "",
        f"Formal data: `{_display_path(data_path)}`" if data_path else "Formal data: not discovered",
        "",
        "| ID | Result | Requirement | Detail |",
        "|---|---|---|---|",
    ]
    for check in checks:
        result = "PASS" if check.passed else ("FAIL" if check.blocking else "UNRESOLVED")
        detail = check.detail.replace("|", "\\|").replace("\n", " ")
        lines.append(f"| {check.id} | {result} | {check.requirement} | {detail} |")
    lines.append("")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path)
    parser.add_argument("--schema", type=Path, default=root / "schema/feature-tree.schema.json")
    parser.add_argument("--source", type=Path, default=root / "sources/olmo-3-standard.yaml")
    parser.add_argument("--web-dir", type=Path, default=root / "web")
    parser.add_argument("--base-url")
    parser.add_argument("--browser-report", type=Path, default=Path("/tmp/internspace-formal-tree-report.json"))
    parser.add_argument("--json-output", type=Path)
    parser.add_argument("--markdown-output", type=Path)
    args = parser.parse_args(argv)

    data_path = args.data or discover_data(root / "data")
    checks = (
        check_source(args.source)
        + check_data(data_path, args.schema)
        + check_web(args.web_dir, args.base_url)
        + check_browser(args.browser_report)
    )
    report = {
        "passed": all(check.passed for check in checks if check.blocking),
        "checks": [asdict(check) for check in checks],
        "data_path": _display_path(data_path),
    }
    if args.json_output:
        args.json_output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    markdown = render_markdown(checks, data_path)
    if args.markdown_output:
        args.markdown_output.write_text(markdown, encoding="utf-8")
    print(markdown)
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
