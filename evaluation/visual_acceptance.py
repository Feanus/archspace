#!/usr/bin/env python3
"""Render the independent visual-reference E2E gate as a concise Chinese report."""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


ANSI_RE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")


@dataclass(frozen=True)
class Requirement:
    check_id: str
    title: str
    blocking: bool = True


REQUIREMENTS = [
    Requirement("VIZ-01", "dark visual tokens, fixed glass header, canonical and DEMO sources stay distinct"),
    Requirement("VIZ-02", "first viewport is only the root plus four structural branches with no era or lane forest"),
    Requirement("VIZ-03", "nodes expose restrained category accent, validation, symbol and experiment coverage marker"),
    Requirement("VIZ-04", "drawer is closed by default, opens on node click, contains complete research fields and closes cleanly"),
    Requirement("VIZ-05", "structural and auxiliary edges have separate semantics"),
    Requirement("VIZ-06", "desktop and mobile layouts avoid node overlap, drawer occlusion and page-level horizontal overflow"),
    Requirement("VIZ-07", "pan zoom search keyboard and reduced-motion remain operable"),
    Requirement("VIZ-08", "local root, web, canonical data, CSS and JS assets all return 200"),
    Requirement("VIZ-09", "GitHub Pages root, web, canonical data, CSS and JS assets all return 200", False),
    Requirement("VIZ-10", "ExperimentReplayProvider is deterministic, disableable and never mutates canonical research evidence"),
    Requirement("VIZ-11", "capture reference, desktop, drawer and mobile screenshots outside Git"),
]

SCREENSHOTS = [
    Path("/tmp/internspace-reference-1440x900.png"),
    Path("/tmp/internspace-local-1440x900.png"),
    Path("/tmp/internspace-local-drawer-1440x900.png"),
    Path("/tmp/internspace-local-390x844.png"),
]


def iter_specs(suites: Iterable[dict[str, Any]]) -> Iterable[dict[str, Any]]:
    for suite in suites:
        yield from suite.get("specs", [])
        yield from iter_specs(suite.get("suites", []))


def first_error(results: list[dict[str, Any]]) -> str:
    messages = []
    for result in results:
        error = result.get("error") or {}
        message = ANSI_RE.sub("", error.get("message", "")).strip()
        if message:
            messages.append(message)
    if not messages:
        return "browser assertion failed"
    lines = [line.strip() for line in messages[0].splitlines() if line.strip()]
    preferred = next((line for line in lines if line.startswith("Error:")), lines[0])
    return preferred[:320]


def load_results(path: Path) -> dict[str, tuple[str, str]]:
    report = json.loads(path.read_text(encoding="utf-8"))
    results: dict[str, tuple[str, str]] = {}
    for spec in iter_specs(report.get("suites", [])):
        title = spec.get("title", "")
        attempts = [attempt for test in spec.get("tests", []) for attempt in test.get("results", [])]
        statuses = {attempt.get("status") for attempt in attempts}
        if statuses and statuses <= {"passed"}:
            results[title] = ("PASS", "browser assertion passed")
        elif "skipped" in statuses and not statuses.intersection({"failed", "timedOut", "interrupted"}):
            annotations = [
                ANSI_RE.sub("", annotation.get("description", ""))
                for test in spec.get("tests", [])
                for annotation in test.get("annotations", [])
                if annotation.get("description")
            ]
            results[title] = ("UNRESOLVED", annotations[0] if annotations else "external check skipped")
        else:
            results[title] = ("FAIL", first_error(attempts))
    return results


def render(results: dict[str, tuple[str, str]], report_path: Path) -> str:
    rows: list[tuple[str, str, str, str]] = []
    for requirement in REQUIREMENTS:
        status, detail = results.get(requirement.title, ("FAIL", "test result missing"))
        if requirement.check_id == "VIZ-11":
            missing = [str(path) for path in SCREENSHOTS if not path.is_file()]
            if missing:
                status, detail = "FAIL", f"missing screenshots={missing}"
            elif status == "PASS":
                detail = "all four /tmp screenshots exist; none are repository artifacts"
        if status == "FAIL" and not requirement.blocking:
            status = "UNRESOLVED" if "network" in detail.lower() or "connect" in detail.lower() else "FAIL"
        rows.append((requirement.check_id, status, requirement.title, detail))

    passed = sum(status == "PASS" for _, status, _, _ in rows)
    failed = sum(status == "FAIL" for _, status, _, _ in rows)
    unresolved = sum(status == "UNRESOLVED" for _, status, _, _ in rows)
    lines = [
        "# InternSpace 视觉参考与 E2E 验收报告",
        "",
        "验收日期：2026-07-20（Asia/Shanghai）",
        "",
        f"结果：**{passed} PASS / {failed} FAIL / {unresolved} UNRESOLVED**",
        "",
        "上线 URL：`https://inuyashayang.github.io/InternSpace/`",
        "",
        f"浏览器原始报告：`{report_path}`",
        "",
        "| ID | 结果 | 验收事实 | 说明 |",
        "|---|---|---|---|",
    ]
    labels = {"PASS": "PASS", "FAIL": "FAIL", "UNRESOLVED": "UNRESOLVED"}
    for check_id, status, title, detail in rows:
        safe_detail = detail.replace("|", "\\|").replace("\n", " ")
        lines.append(f"| {check_id} | {labels[status]} | {title} | {safe_detail} |")

    failed_titles = [title for _, status, title, _ in rows if status == "FAIL"]
    unresolved_titles = [title for _, status, title, _ in rows if status == "UNRESOLVED"]
    lines.extend([
        "",
        "## 判定说明",
        "",
        "- PASS 只表示本轮可执行门禁通过，不把 UI 测试当作研究效果证据。",
        "- GitHub Pages 在执行环境发生连接重置或 DNS/TLS 不可达时记为 UNRESOLVED；明确 HTTP 非 200 记为 FAIL。",
        "- `/tmp` 截图只用于本轮人工对照，不提交 Git。",
        "",
        "## 当前视觉差距",
        "",
    ])
    if failed_titles:
        lines.extend(f"- {title}" for title in failed_titles)
    else:
        lines.append("- 无阻塞视觉差距。")
    lines.extend(["", "## 未解决项", ""])
    if unresolved_titles:
        lines.extend(f"- {title}" for title in unresolved_titles)
    else:
        lines.append("- 无。")
    lines.extend([
        "",
        "## 截图索引",
        "",
        "| 视图 | 路径 |",
        "|---|---|",
        *[f"| {path.stem} | `{path}` |" for path in SCREENSHOTS],
        "",
    ])
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--browser-report", type=Path, default=Path("/tmp/internspace-visual-report.json"))
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).with_name("VISUAL_ACCEPTANCE_REPORT_ZH.md"),
    )
    args = parser.parse_args()
    try:
        results = load_results(args.browser_report)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"ERROR: cannot read browser report: {exc}")
        return 2
    args.output.write_text(render(results, args.browser_report), encoding="utf-8")
    print(args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
