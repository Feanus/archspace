# Feature Tree v1 contract

正式 source of truth 位于 `features/<feature-id>.json`；`data/feature-tree.json` 是由
`scripts/build_feature_tree.py` 生成的只读投影。Feature Tree JSON Schema 位于
`schema/feature-tree.schema.json`。实验覆盖索引位于 `data/experiments.json`，Schema 位于
`schema/experiment-index.schema.json`。这是 InternSpace 自有的小型 v1 contract，不迁移
LumiaTree schema，也不允许聚合文件成为第二份手工真相。

## 数据边界

顶层只有 `schema_version`、`tree_id` 和 `features`。`features` 中的每条记录都必须是
`record_type: feature`：根记录使用 `kind: baseline`，其他记录使用 `kind: feature`。
commit、session、code symbol、component change 和 experiment 只能嵌在 Feature 详情中；
paper 等外部材料通过 Feature 的 `evidence` 引用，不能进入主数组。

每个 Feature 必须提供：

- 稳定语义 ID、标题、kind、status 和唯一结构 `parent_id`；
- summary、hypothesis、design 与相对父节点的 `delta`；
- implementation、experiments、analysis 和 evidence；
- 非结构关系 `depends_on`、`related_to`；
- 覆盖每个主字段的 provenance。

基础 `$defs.feature` 为旧 proposal/fixture 保留兼容读取能力；正式单文件 source 必须通过
更严格的 `$defs.formalFeature`。`category` 允许值为 `architecture`、
`model_configuration`、`training_configuration`、`data` 和 `runtime`。现有 fixture
不需要立即回填；当前 10 个正式非根节点均被人工裁决为 `architecture`。

## 双语显示字段

`title`、`summary` 是稳定原文，不因翻译修订而改变 Feature 身份。`title_zh`、
`summary_zh` 在兼容 Feature 中可选，在正式非根 Feature 中必填，且必须非空、可人工修订：

- 缺失中文字段时，消费者回退到对应的 `title` / `summary`；
- 翻译变化不是新 Feature，不改变 `id`、`parent_id` 或结构边；
- 现有 fixture 不被强制立即补中文；
- 兼容 fixture 可选择是否追踪翻译来源；正式 source 必须在 `provenance.fields` 中逐字段
  记录 `title_zh`、`summary_zh`。

## 正式非根 Feature

每个 `$defs.formalFeature` 非根记录必须另外提供：

- `category` 与 `validation_status`；
- 至少一个 `code_locators` 条目，显式给出 credential-free repository、40 位 revision、
  repo-relative path、qualified symbol、role 和包含同一 revision/path 的 commit-pinned URL；
- `validation`：comparison、conditions、metrics/observations、artifact locators、conclusion、
  limitations 和 evidence 引用；
- 英文 `title/summary` 与中文 `title_zh/summary_zh`。

`validation_status` 只允许 `validated`、`mixed`、`failed`、`unverified`。没有结果 artifact
时必须诚实使用 `unverified`，不能从代码存在或测试通过推断研究效果。

D08 (`feat-concept-hlm-olmo3-layer-reuse`) 还必须包含 `structural_review`，当前固定为
`conditional + unresolved` 并给出确认等价后降级为 evidence 的条件。Schema 只约束元数据
自洽，不能自动判断 TransformerBlock 替换是否语义或数值等价。

Feature ID 使用 `feat-` 加稳定语义 slug。ID 不编码 node/row/level 等显示位置，数组顺序也
不定义身份或父子关系。

## Provenance

`provenance.sources` 定义可复用来源项，状态为 `pinned`、`documented`、`inferred` 或
`unresolved`；`provenance.fields` 为每个主字段选择一个来源项。来源中的 `source_ids`
只能指向同一 Feature 内嵌的 evidence。`pinned` evidence 必须有 immutable revision；
`unresolved` 不得附带伪造来源。

根 Feature 的 `baseline` 另外为 model family、scale、repository、revision、configuration
、checkpoint 和 license 逐项记录值与 provenance。当前只有 OLMo-3 family 来自项目契约；
精确 scale、repository、revision、configuration、checkpoint 和 license 都明确为
`null + unresolved`。

## 校验边界

JSON Schema 检查对象形状、必填字段、枚举、ID 语法和禁止额外字段。离线 CLI 继续检查
JSON Schema 无法表达的 invariants：

- 唯一根必须是 `feat-olmo3-standard`，且 `parent_id: null`；
- 每个非根 Feature 恰有一个存在的父 Feature；
- `parent_id` 图连通、无环，所有 Feature 都从根可达；
- Feature ID 和 evidence ID 唯一，位置型 Feature ID 被拒绝；
- `depends_on` / `related_to` 只引用已有 Feature 且不参与结构遍历；
- 主数组和顶层不存在 commit、session、experiment、component 等伪节点集合；
- evidence 与逐字段 provenance 引用均可解析；缺失 baseline 值必须保持 unresolved。

## Experiment Index contract

`data/experiments.json` 只描述实验对 Feature 的覆盖关系，不产生树节点。一个实验可以覆盖
多个 Feature，Feature 详情页反向展示这些实验。实验光标类型固定为：

- `none`：无可展示光标；
- `wandb-final`：已完成/归档结果，只展示 sanitized W&B URL 和 final metrics；
- `wandb-replay`：已抓取 loss trace 的页面回放，不表示实时训练；
- `live`：未来实时接入预留类型。

W&B URL 必须是无凭证、无 query、无 fragment 的 `https://wandb.ai/...` 地址。带
`accessToken` 或任何 token-like 值的实验数据会被拒绝。`wandb-replay` 必须显式提供至少
两个数值 loss trace 点；非 replay 光标不得启用 replay。`covered_feature_ids` 与
`primary_feature_ids` 都必须引用已 merge 的 Feature，且 primary 必须同时出现在 covered 中。

根节点上的 OLMo2 W&B report 只是外部训练日志参考，不是 OLMo-3 标准态 root provenance；
root baseline provenance 仍按上文规则保持 unresolved，直到取得真正的官方 OLMo-3 pinned source。

## 结构边界裁决 contract

`schema/structural-feature-admission.schema.json` 是人工 architecture 边界 review 的辅助
contract，不是第二棵 canonical 树。它验证：

- `admit_feature` 必须是机制级结构维度，并至少有独立 switch 或独立 ablation；
- pooling、chunk size、codebook count/size 等 `within_mechanism` 参数使用
  `keep_in_parent`；
- 同一 technique 可以因作用于不同、可分别控制的 subject 而分别准入；
- 已确认语义等价的实现替换只能是 `evidence_only`；
- 等价性 unresolved 的实现替换只能是 `conditional_proposal`，且必须提供明确的
  `downgrade_condition`；
- `shared_snapshot_group` 与相同 evidence revision 不会强制合并独立机制。

政策 fixture 位于
`tests/model/fixtures/structural-feature-admission.cases.json`。它只验证政策可表达性，不会
把 fixture 中的案例导入 canonical Feature 数据，也不能从代码自动判断 D08 一类替换是否
真正语义等价。

运行 canonical 校验：

```bash
python3 scripts/build_feature_tree.py
python3 scripts/build_feature_tree.py --check
python3 scripts/validate_feature_tree.py
python3 scripts/validate_feature_tree.py --json
python3 scripts/validate_experiments.py
python3 scripts/validate_experiments.py --json
```

运行模型专项测试：

```bash
python3 -m unittest discover -s tests/model -p 'test_*.py' -v
```

命令不访问网络、不写 runtime state，输出不含时间戳并按稳定顺序报告问题。canonical 中
Feature 内容的准入与人工 merge 仍以 `FEATURE_ADMISSION_POLICY.md` 为准；schema 通过不代表
研究效果已验证。
