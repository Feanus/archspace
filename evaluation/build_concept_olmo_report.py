#!/usr/bin/env python3
"""Render the authoritative Concept OLMo structural adjudication report."""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import yaml


ROOT_ID = "feat-olmo3-standard"
STRUCTURAL_ORDER = [
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
]


def link(label: str, url: str) -> str:
    return f"[{label}]({url})"


def compact(value: Any) -> str:
    if value is None:
        return "`null`"
    if isinstance(value, (dict, list)):
        return f"`{json.dumps(value, ensure_ascii=False, sort_keys=True)}`"
    return f"`{value}`"


def depth(features: list[dict[str, Any]]) -> int:
    by_id = {feature["id"]: feature for feature in features}
    maximum = 0
    for feature in features:
        cursor = feature
        current = 0
        while cursor.get("parent_id") is not None:
            current += 1
            cursor = by_id.get(cursor["parent_id"], {"parent_id": None})
        maximum = max(maximum, current)
    return maximum


def text_tree(features: list[dict[str, Any]], allowed: set[str]) -> list[str]:
    children: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for feature in features:
        if feature["id"] in allowed:
            children[feature["parent_id"]].append(feature)
    lines = ["feat-olmo3-standard"]

    def visit(parent: str, prefix: str) -> None:
        siblings = children.get(parent, [])
        for index, feature in enumerate(siblings):
            last = index == len(siblings) - 1
            lines.append(prefix + ("└── " if last else "├── ") + f"{feature['id']} [{feature['title_zh']}]")
            visit(feature["id"], prefix + ("    " if last else "│   "))

    visit(ROOT_ID, "")
    return lines


def render(bundle: dict[str, Any], source: dict[str, Any]) -> str:
    features = bundle["features"]
    by_id = {feature["id"]: feature for feature in features}
    assessments = bundle["feature_assessments"]
    structural = set(STRUCTURAL_ORDER)
    pending_features = [feature for feature in features if assessments[feature["id"]]["decision_status"] == "pending"]
    categories = Counter(item["category"] for item in assessments.values())
    validations = Counter(item["validation_status"] for item in assessments.values())
    classifications = bundle["commit_classification"]
    initial = next(item for item in classifications if item["commit"] == source["observation_range"]["initial_revision"])
    d08 = assessments["feat-concept-hlm-olmo3-layer-reuse"]

    lines = [
        "# Concept OLMo Feature growth — 人工结构裁决落地报告",
        "",
        "> 权威口径：`evaluation/FEATURE_DIFF_REVIEW_ZH.md` 的 2026-07-19 人工裁决。工作仓库仅提供派生 Feature 的实现/证据，不是 OLMo-3 root provenance，也不是树节点。",
        "",
        "## 结果摘要",
        "",
        f"- proposal 总数：**{len(features)}**。",
        f"- 已裁决结构节点：**{len(structural)}**。",
        f"- 语义原子 diff：**{bundle['diff_review']['total']}**；结构 diff **{bundle['diff_review']['structural_count']}**，仍待裁决 **{bundle['diff_review']['pending_count']}**。",
        f"- 待裁决 proposal 文件：**{len(pending_features)}**（Stage-1 一个 proposal 承载 D11/D12 两条 diff）。",
        f"- 临时完整树最大深度：**{depth(features)} edges**。",
        f"- validation：validated {validations['validated']}、mixed {validations['mixed']}、failed {validations['failed']}、unverified {validations['unverified']}。",
        "- canonical `data/feature-tree.json` 已于 2026-07-20 apply：只导入 root 与 10 个已裁决结构节点；8 个待裁决 proposal 未导入。",
        "",
        "### Category 分布",
        "",
        "| Category | 数量 |",
        "|---|---:|",
    ]
    for category in ("architecture", "model_configuration", "training_configuration", "data", "runtime"):
        lines.append(f"| `{category}` | {categories[category]} |")

    lines.extend([
        "",
        "## 权威 10 节点结构树",
        "",
        "```text",
        *text_tree(features, structural),
        "```",
        "",
        "结构约束：",
        "",
        "- D07 与 D08 都以 D04b 为父节点，二者是兄弟关系。",
        "- D09 只继承 D06a；D10 只继承 D06b。",
        "- D05a 保留 `chunk_size=4`、`meanpooling`、`shift_feature=true`；D05b 保留 `32 × 128` Product VQ，均不再拆参数节点。",
        "- D04a/D04b/D05a/D05b/D06a/D06b 共享 initial snapshot evidence，但由 qualified symbol locator 区分边界。",
        "",
        "## 旧聚合节点迁移",
        "",
        "- `feat-concept-olmo-v22-vq-snapshot` is **superseded**：它把六个可独立消融维度聚合成了一个活动节点。当前只在 bundle migration history 中保留，不再出现在活动 Feature、parent、depends_on 或 related_to 中。",
        "- replacement：`feat-concept-segmented-topology`、`feat-concept-hlm-predictor`、`feat-concept-chunk-representation`、`feat-concept-product-vq`、`feat-concept-self-dd`、`feat-concept-cross-module-residual-read`。",
        "",
        "## 10 个结构 Feature 明细",
        "",
        "| Diff | Feature | 中文标题 | Parent | Locator | Validation | 裁决 |",
        "|---|---|---|---|---|---|---|",
    ])
    for feature_id in STRUCTURAL_ORDER:
        feature = by_id[feature_id]
        assessment = assessments[feature_id]
        locators = "<br>".join(
            f"{link(locator['symbol'], locator['url'])}<br>`{locator['revision']}`"
            for locator in assessment["primary_locators"]
        )
        decision = "conditional" if assessment["admission"] == "conditional" else "adjudicated"
        lines.append(
            f"| {', '.join(assessment['diff_ids'])} | `{feature_id}`<br>{feature['title']} | {feature['title_zh']} | `{feature['parent_id']}` | {locators} | `{assessment['validation_status']}` | `{decision}` |"
        )

    lines.extend([
        "",
        "## Parent-relative before/after",
        "",
        "| Feature | Target | Before | After | Rationale |",
        "|---|---|---|---|---|",
    ])
    for feature_id in STRUCTURAL_ORDER:
        feature = by_id[feature_id]
        for operation in feature["delta"]["operations"]:
            lines.append(f"| `{feature_id}` | `{operation['target']}` | {compact(operation['before'])} | {compact(operation['after'])} | {operation['rationale']} |")

    lines.extend([
        "",
        "## Shared initial snapshot evidence",
        "",
        f"- Revision: `{initial['commit']}`。",
        f"- Classification: 一条 `feature_implementation` 记录以 `{initial['evidence_role']}` 角色同时指向 **{len(initial['feature_ids'])}** 个结构 Feature。",
        "- 该 revision 是共同的最早可见聚合快照，不代表六项结构在同一时刻被分别引入，也不提供单项消融结果。",
        "",
        "| Feature | Qualified locator |",
        "|---|---|",
    ])
    for feature_id in sorted(initial["feature_ids"]):
        locator_text = "<br>".join(link(locator["symbol"], locator["url"]) for locator in assessments[feature_id]["primary_locators"])
        lines.append(f"| `{feature_id}` | {locator_text} |")

    lines.extend([
        "",
        "## D08 条件性 proposal",
        "",
        f"- 待确认问题：{d08['conditional_review']['question']}",
        f"- 若等价：{d08['conditional_review']['if_equivalent']}",
        f"- 若不等价：{d08['conditional_review']['if_not_equivalent']}",
        f"- 责任方：`{d08['conditional_review']['owner']}`。",
        "- 当前没有数值 parity、训练 A/B 或 checkpoint migration 结果，因此不得把 D08 写成已验证结构收益。",
        "",
        "## 其余 9 条待裁决 diff",
        "",
        "本轮不替用户裁决 D01–D03、D11–D16；现有 proposal 文件继续保留，但 `decision_status=pending` 且 `recommended_for_merge=false`。",
        "",
        "| Diff | Proposal | Category | Parent | Validation |",
        "|---|---|---|---|---|",
    ])
    for record in bundle["diff_review"]["records"]:
        if record["decision"] != "pending":
            continue
        feature_id = record["feature_ids"][0]
        feature = by_id[feature_id]
        assessment = assessments[feature_id]
        lines.append(f"| `{record['id']}` | `{feature_id}` | `{assessment['category']}` | `{feature['parent_id']}` | `{assessment['validation_status']}` |")

    lines.extend([
        "",
        "## 工程 Feature 的结构背景",
        "",
        "D13、D15、D16 的 runtime proposal 保持原 Feature 边界与 structural parent，不在本轮重裁决；它们额外通过 `depends_on` 记录以下结构背景：",
        "",
        "- `feat-concept-chunk-representation`（D05a）；",
        "- `feat-concept-self-dd`（D06a）；",
        "- `feat-concept-cross-module-residual-read`（D06b）。",
        "",
        "这些辅助关系不改变单父树。",
        "",
        "## Commit classification",
        "",
        "| Commit | Disposition | Feature(s)/reason |",
        "|---|---|---|",
    ])
    for item in classifications:
        refs = item.get("feature_ids") or ([item["feature_id"]] if item.get("feature_id") else [])
        target = ", ".join(f"`{feature_id}`" for feature_id in refs) if refs else item["reason"]
        lines.append(f"| {link(item['commit'], item['locator'])} | `{item['disposition']}` | {target} |")

    lines.extend([
        "",
        "## 来源边界",
        "",
        f"- Work repository: {link('Liu-yuliang/concept_olmo', source['repository']['url'])}。",
        f"- Observed main: `{source['observation_range']['initial_revision']}` → `{source['observation_range']['head_revision']}`。",
        "- 仓库不是官方 OLMo-3 发布仓库；root 的外部 official source/checkpoint/license 仍 unresolved。",
        "- checkpoint 内容哈希仍缺失；未复制上游内网路径。",
        "",
        "## 算法待确认项",
        "",
        "1. D08 自定义 `ConceptCausalBlock` 与 OLMo3 `TransformerBlock` 的结构语义和数值等价性。",
        "2. D07 concept-rate window 对 token 等效感受野的准确映射。",
        "3. D05a `shift_feature` 的准确算法语义与预期对齐方式。",
        "4. D06a 中 `DD` 的权威展开、作用位置及预期数学含义。",
        "5. 六个 shared-snapshot 基础结构、D07、D09、D10 的独立消融结果。",
        "6. D05b 连续 concept 与 Product-VQ 路径的效果比较。",
        "",
        "## 验证命令",
        "",
        "```bash",
        "python3 -m ingest.build_concept_olmo_proposals",
        "python3 -m ingest.validate_concept_proposals --combined-output /tmp/internspace-concept-olmo-tree.json",
        "python3 scripts/validate_feature_tree.py --data /tmp/internspace-concept-olmo-tree.json",
        "python3 sources/verify_olmo3_source.py",
        "python3 sources/verify_concept_olmo_observation.py",
        "pytest -q tests/e2e/test_contract.py tests/e2e/test_concept_olmo_proposals.py tests/model/test_structural_feature_policy.py",
        "git diff --check",
        "```",
        "",
    ])
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser()
    parser.add_argument("--proposal", type=Path, default=root / "ingest/proposals/concept-olmo-feature-tree.json")
    parser.add_argument("--source", type=Path, default=root / "sources/concept-olmo-observation.yaml")
    parser.add_argument("--output", type=Path, default=root / "evaluation/concept-olmo-feature-growth.md")
    args = parser.parse_args(argv)
    bundle = json.loads(args.proposal.read_text(encoding="utf-8"))
    source = yaml.safe_load(args.source.read_text(encoding="utf-8"))
    args.output.write_text(render(bundle, source), encoding="utf-8")
    print(args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
