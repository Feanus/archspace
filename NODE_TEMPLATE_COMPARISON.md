# InternSpace 节点模板与 JT-Ushio/template-test 对比

观察日期：2026-07-22（Asia/Shanghai）

## 结论

两者差异很大：`JT-Ushio/template-test` 是 GitHub Issue/PR 层的研究流程模板；InternSpace 当前“节点模板”是会被 schema、builder、页面和 CI 消费的 canonical Feature 数据合同。

如果按“能否直接替换”为标准，差异约为 **80%**：`template-test` 不能直接生成 InternSpace 节点，也不能驱动页面长出 Feature。

如果按“研究审查问题是否相似”为标准，重合约为 **50%**：motivation、parent-relative delta、实验计划、结果分析、artifact 这些问题是一致的，但 InternSpace 还需要更强的机器可读身份、树结构、证据和 provenance。

## 观察对象

### InternSpace 本地模板/合同

本报告把以下内容合并视为“我们的节点 template”：

- `features/<feature-id>.json`：正式一 Feature 一文件 source of truth；
- `schema/feature-tree.schema.json`：机器可校验数据合同；
- `ingest/examples/feature-proposal.yaml`：轻量 proposal 示例；
- `Project.md`、`FEATURE_ADMISSION_POLICY.md`、`CONTRIBUTION_WORKFLOW.md`：语义边界。

核心定义是：一个可见点就是一个 Feature。Feature 有唯一 `parent_id`，根固定为 `feat-olmo3-standard`。commit、PR、实验、W&B run、Python symbol 都只是 evidence 或详情，不是节点。

### JT-Ushio/template-test

远端仓库：<https://github.com/JT-Ushio/template-test>

通过 GitHub API 观察到：

- public repo；
- default branch: `main`；
- latest observed commit: `ae54592eb832bcd9e280a80806e463991c2db7f2`；
- license: Apache-2.0；
- 核心文件只有 GitHub 模板：
  - `.github/ISSUE_TEMPLATE/architecture-proposal.yml`
  - `.github/pull_request_template.md`

`architecture-proposal.yml` 的主体字段是：

- `motivation`
- `parent_commit`
- `proposed_modification`
- `experiment_plan`

`pull_request_template.md` 的主体结构是：

- Related Architecture Proposal
- Implementation Summary
- Architectural Changes
- Implementation Details
- Code-Level Validation
- Experiment Setup
- Validation Results
- Result Analysis
- Proposed Conclusion
- Research Artifacts
- Merge Checklist

## 核心差异表

| 维度 | InternSpace 当前节点模板 | template-test | 差异判断 |
|---|---|---|---|
| 主要用途 | canonical Feature 数据，直接参与构建、校验和渲染 | GitHub Issue/PR 填写模板 | 本体不同 |
| 最小单位 | 一个 `feat-*` Feature 节点 | 一个 architecture proposal issue 或 implementation PR | 不可直接互换 |
| 父关系 | `parent_id` 指向父 Feature | `parent_commit` 指向 immutable commit | 语义差异最大 |
| 根基准 | 固定 `feat-olmo3-standard` | 没有固定 root baseline 概念 | InternSpace 更像树数据库 |
| 节点类型 | `architecture`、`model_configuration`、`training_configuration`、`data`、`runtime` | 基本只面向 architecture modification | template-test 范围更窄 |
| 结构边界 | 是否独立开关/可独立消融；单父树 | 一次架构修改一个 proposal | 审查方向相似，但约束弱很多 |
| 代码定位 | repository、40 位 revision、path、symbol、role、commit-pinned URL | PR 中自由文本列 main files/modules | InternSpace 更机器可读 |
| 实验 | Feature 内 validation + 新增 experiment index；实验可覆盖多个 Feature | issue 写 experiment plan，PR 写 setup/results 表 | template-test 更适合人工填写 |
| W&B / loss | 应归属于实验；completed 显示 W&B/final loss，replay 标明非实时 | 只要求 experiment run IDs / external tracker | InternSpace 需要补 cursor 类型 |
| validation | `validation_status` enum + comparison/conditions/metrics/observations/conclusion | 结果表 + proposed conclusion checklist | 可互补 |
| evidence | 每个 evidence 有 id/type/locator/revision/summary | Research Artifacts 自由列表 | InternSpace 更可审计 |
| provenance | `provenance.sources` + `provenance.fields` 机器审计 | 无逐字段 provenance | InternSpace 更重，但 UI 应隐藏 fields 噪声 |
| 双语 | `title_zh`、`summary_zh` | 无中文字段 | InternSpace 页面需要 |
| 辅助关系 | `depends_on`、`related_to` | 无 DAG/辅助边概念 | InternSpace 独有 |
| 合并后效果 | merge 后页面自动长出节点 | merge 后是否更新 architecture metadata/tree 由 checklist 提醒 | InternSpace 自动化目标更强 |

## 字段映射

template-test 可以映射到 InternSpace，但只能作为“人类提案入口”，不能直接成为节点文件。

| template-test 字段 | 推荐映射到 InternSpace |
|---|---|
| Architecture ID | `id: feat-*`，但必须符合项目命名和不复用规则 |
| Parent Commit | 不应映射为 `parent_id`；应进入 evidence/implementation。真正父节点必须是 `parent_feature_id` / `parent_id` |
| Motivation | `hypothesis` + `summary` |
| Proposed Modification | `delta.summary` + `delta.operations[]` |
| Components changed | 可作为 `implementation.component_changes[]` 或 delta 说明，不是树节点 |
| Main files or modules changed | `code_locators[]` / `implementation.code_symbols[]` |
| Code-Level Validation | `evidence[type=test]` 或 PR checklist，不替代研究效果 |
| Experiment Setup | experiment index 记录；需要 `covered_feature_ids` |
| Validation Results | `validation.metrics` + experiment final metrics |
| Result Analysis | `analysis.conclusion` / `validation.conclusion` |
| Proposed Conclusion | `validation_status`，但最终状态应由 review/merge 决定 |
| Research Artifacts | `evidence[]`、`validation.artifacts[]`、experiment `wandb_url` |

## template-test 缺少的 InternSpace 必需项

如果直接用 `template-test` 来提交 InternSpace 节点，会缺少以下关键字段：

- `id: feat-*` 的稳定语义 ID；
- `parent_id` 指向父 Feature，而不是 parent commit；
- `category`，且不仅限于 architecture；
- `title_zh` / `summary_zh`；
- `validation_status` enum；
- `code_locators[]` 的 commit-pinned repository/revision/path/symbol/url；
- `evidence[]` 的本地 evidence ID 与 revision；
- `provenance.sources`；
- `depends_on` / `related_to`；
- experiment 覆盖多个 Feature 的 `covered_feature_ids`；
- experiment cursor 类型：`none`、`wandb-final`、`wandb-replay`、未来 `live`；
- 一 Feature 一文件、filename 等于 Feature ID、builder 生成 `data/feature-tree.json` 的规则。

## InternSpace 缺少或较弱的 template-test 优点

template-test 也暴露出我们当前 workflow 的不足：

- 我们缺少真正 GitHub Issue Form 入口，贡献者需要直接理解 JSON/schema；
- 我们的 `ingest/examples/feature-proposal.yaml` 太轻，不能引导作者填写 acceptance/rejection criteria；
- 我们缺少 PR 模板中的 code-level validation checklist；
- 我们缺少 PR 中那种 parent/proposed/delta/criterion/pass 的结果表；
- 我们当前 `provenance.fields` 对机器有用，但对页面用户是噪声，应该只在校验层保留，不在 drawer 直出；
- 我们需要把 experiment index 明确纳入贡献流程，尤其是 W&B URL、final loss、final metrics 和 replay trace 的边界。

## 建议

不要用 `template-test` 替换 InternSpace 节点模板。正确做法是分层：

1. 保留 InternSpace 的 `features/<feature-id>.json` 作为 canonical source。
2. 新增 GitHub Issue Form，吸收 `architecture-proposal.yml` 的人类友好提问，但把 `Parent Commit` 改成两项：
   - Parent Feature ID；
   - implementation/evidence commit。
3. 新增/改造 PR template，吸收 `template-test` 的 checklist 和结果表。
4. PR template 必须额外要求：
   - Feature ID；
   - category；
   - parent-relative diff；
   - code locator；
   - `covered_feature_ids`；
   - W&B URL / final loss / cursor type；
   - 是否只是 W&B replay，不能声称实时。
5. 页面只展示人可读 provenance source/evidence，不展示 `provenance.fields` 全量映射。

## 最短融合方案

可以把 template-test 收敛成三份 InternSpace 文件：

```text
.github/ISSUE_TEMPLATE/feature-proposal.yml
.github/pull_request_template.md
docs/FEATURE_PROPOSAL_AUTHORING.md
```

其中 Issue Form 面向“提出一个候选 Feature”，PR 模板面向“实现并验证一个候选 Feature”，canonical JSON 仍由 maintainer 或脚本生成。这样既保留 template-test 的易用性，也不牺牲 InternSpace 的可校验树结构。

## 来源

- `https://github.com/JT-Ushio/template-test`
- `https://raw.githubusercontent.com/JT-Ushio/template-test/main/.github/ISSUE_TEMPLATE/architecture-proposal.yml`
- `https://raw.githubusercontent.com/JT-Ushio/template-test/main/.github/pull_request_template.md`
- `ingest/examples/feature-proposal.yaml`
- `features/feat-concept-cumsum-self-dd.json`
- `schema/feature-tree.schema.json`
