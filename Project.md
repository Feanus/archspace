# InternSpace Feature Tree

## 核心定义

InternSpace 展示的不是模型组件图，也不是由多个根组成的研究森林。

它是一棵只有一个根的 **Feature 演进树**：

```text
● OLMo-3 标准态
├── ● Feature A
│   ├── ● Feature A1
│   └── ● Feature A2
├── ● Feature B
└── ● Feature C
```

**一个点就是一个 Feature。**

根点固定表示 `OLMo-3 标准态`。每个非根点表示在父 Feature 所代表的模型状态之上，引入的一项可独立审查的 Feature。Feature 可以是结构机制、模型配置、训练配置、数据或运行时变化。根到某个点的唯一路径，就是得到该点模型状态所需的 Feature 累积顺序。

## 强约束

1. 全树只有一个根：`feat-olmo3-standard`。
2. 根节点没有父节点；每个非根 Feature 恰有一个 `parent_id`。
3. `parent_id` 构成连通、无环的树，所有 Feature 都可从根到达。
4. 主画布上的每个点都必须是 Feature；Python 类、组件、commit、session、论文和实验不能伪装成树节点。
5. 多支系依赖使用 `depends_on`、`related_to` 等辅助引用，不改变主树的单父结构。
6. 辅助关系默认不画在主树上，只在选中 Feature 后显示。
7. OLMo-3 的内部架构、组件变化和实现事实属于 Feature 详情，不在主画布展开成第二套本体。
8. 层数、hidden size、attention/KV heads、batch、训练 token、GPU、并行和超参数的明确变化可以构成 Feature，但应分类为 `model_configuration` 或 `training_configuration`，不能冒充 `architecture` 结构机制。
9. “模型变大了”“换了一个 checkpoint”或单纯资源记录本身不足以建点；必须有独立意图、精确 parent-relative diff、代码/配置位置和结果状态。
10. 每个正式 Feature 必须能定位实现代码或配置，并展示相对父节点的验证结果；无法定位或没有效果证据时只能作为待审/未验证候选，不能宣称已验证有效。

## Feature 的朴素定义

一个 Feature 是能够独立讲清楚的一项模型、训练或运行干预：

```text
问题/目标
  → 假设或需求
  → 设计与相对父节点的变化
  → 实现（commit / session / code）
  → 验证（实验 / 测试 / artifact）
  → 当前结论
```

并非每个 Feature 都必须已经成功。`proposed`、`implementing`、`validating`、`analyzed`、`abandoned` 都是合法状态，失败分支必须能够保留。

Feature 至少分为：`architecture`、`model_configuration`、`training_configuration`、`data` 和 `runtime`。结构 Feature 通常会新增、删除、替换或重连模型模块、表示、信息流、路由或注意力路径；配置 Feature 可以改变层数、hidden/head 数、batch、训练 token、GPU/并行或超参数。

以下变化不能只凭表面标签自动建点：

- 1B、3B、7B 等聚合尺寸名称：必须展开成实际层数、宽度、heads 等配置 diff；
- 资源或超参记录：只有形成明确、可复现、被验证的干预时才构成配置 Feature；
- 纯导出、部署、监控、日志和评测脚本；
- 不改变结构语义的 bugfix、重命名、重构和文档；
- 单独一次 commit、PR、实验或 checkpoint。

详细的算/不算规则与条件见 `FEATURE_ADMISSION_POLICY.md`。`STRUCTURAL_FEATURE_POLICY.md` 只描述 `architecture` 子类型，不再是全局准入规则。

## 最小数据形状

```yaml
id: feat-context-prediction
title: Context prediction
title_zh: 上下文预测
kind: feature
parent_id: feat-olmo3-standard
status: validating

summary: 一句话说明这个 Feature 做了什么
summary_zh: 面向中文页面的准确说明
hypothesis: 为什么要做
design: 如何做

delta:
  summary: 相对父 Feature 改变了什么
  operations: []

implementation:
  commits: []
  sessions: []
  code_symbols:
    - repository: https://github.com/example/repo
      revision: full-immutable-commit
      path: path/to/model.py
      symbol: Model.forward
      role: 新结构的主要实现位置

experiments:
  - comparison: 相对父 Feature 的对照
    result_summary: 跑出了什么效果
    metrics: []
    artifact_refs: []
analysis: 当前证据是否支持该结构有效
evidence: []

depends_on: []
related_to: []
provenance: {}
```

第一阶段不追求复杂 change algebra。`delta.operations` 可以是开放的结构化记录，但必须保留 before/after、目标和证据，不能把组件变成主树节点。

页面必须让用户无需搜索仓库即可看到：结构代码所在 repository、完整 revision、path、qualified symbol/函数，以及可点击的 commit-pinned locator。结果区必须明确给出对照对象、实验条件、指标/观察、artifact 和结论。测试通过只证明实现正确，不能代替研究效果。

当历史资料只能由模型回溯时，模型输出的是带证据和置信度的 Feature proposal：它可以聚类 commit、定位代码、关联实验并总结效果，但不得把缺失结果补写成成功。人工 review 与 merge 才接受节点边界。

## 根 Feature

根 Feature 的固定身份为：

```yaml
id: feat-olmo3-standard
title: OLMo-3 标准态
kind: baseline
parent_id: null
```

根点在画布上只显示为一个点及简短标签。具体 OLMo-3 模型规模、代码仓库、immutable revision、配置、checkpoint、license 和来源必须放在详情中。

当前尚未指定“OLMo-3 标准态”的精确规模、revision、配置、checkpoint 与 license。第一版允许将这些字段标记为 `unresolved`，但不得伪造来源；正式数据稳定前必须补成 pinned provenance。

## 已知派生工作仓库

本项目已确认可以通过已认证的 GitHub CLI 只读访问以下私有工作仓库：

```text
repository: https://github.com/Liu-yuliang/concept_olmo
default_branch: main
observed_revision: 6ae216283d88f8db0cb35e18c818018617b50f65
observed_at: 2026-07-19
description: ConceptLM V2.2 OLMo 7B training logic snapshot
```

这个仓库**不是根 Feature 的来源**，而是从 `feat-olmo3-standard` 向外生长的 Concept OLMo Feature 支系及其实现证据。

仓库内 `repo/examples/public_training_bench/train_olmo3_7b.sh` 和相邻 README 提供用于计算差量的 OLMo 3 7B 对照 launcher；`concept_v22_vq_olmo3_config.sh`、ConceptLM launchers、实现代码、commit 和 PR 描述相对标准态产生的增量。对照 launcher 可以帮助解释 diff，但不能因此把整个工作仓库写进 root baseline provenance。

仓库、branch、commit、PR、代码文件和实验记录都不是 Feature 点。系统需要根据逻辑边界，将一个或多个相关 commit 归并为 Feature：

```text
● OLMo-3 标准态
└── ● Concept OLMo 初始 Feature
    ├── ● 某项训练/架构 Feature
    │   └── ● 后续改进 Feature
    └── ● 某项实验或推理 Feature
```

每个派生 Feature 必须明确：结构父 Feature、相对父节点的 diff、关联 commit/PR/path、证据和当前状态。Git 时间顺序只能作为证据，不能代替 Feature 边界判断。

这些内容可以 pin 派生 Feature 的工作仓库、实现 revision、相关配置/代码 locator 和内容 hash，但不能自动证明 root 的外部官方模型身份、checkpoint 内容或 license：

- checkpoint 当前只有内网路径，缺少可验证内容哈希；
- GitHub repository metadata 未声明 license；
- 未取得权威外部 OLMo-3 source 前，不把工作仓库描述成官方发布仓库，也不把它写成 root 的 repository/revision。

读取私有仓库时不得保存 GitHub token，不得把完整工作仓库复制进 InternSpace；优先记录 repository、immutable commit、commit-pinned path 和必要内容哈希。

## 页面契约

- 首屏就是树，不显示大幅介绍区。
- 根点清晰但保持紧凑，子 Feature 从根向外展开。
- 默认只显示树结构边；辅助依赖、证据和实现关系按需出现。
- 支持展开/收起子树、选中、搜索、适配窗口和缩放。
- 支持用鼠标、触控板或触屏拖动画布进行平移；拖动只改变视口，不改变 Feature 的确定性树坐标和父子关系。
- Feature 节点保持点击选择语义，不提供任意自由拖放改位；实现必须区分 click 与 pan，避免拖动画布后误触节点。
- 右侧详情栏展示 Feature 的假设、设计、delta、实现、实验、结论和来源。
- 实验记录不是树节点；一个实验可以覆盖多个 Feature，并在详情中反向显示覆盖关系。
- 实验光标必须声明类型：`none`、`wandb-final`、`wandb-replay` 或未来的 `live`。
- 已完成实验展示 W&B 地址、final loss 和 final metrics；没有 W&B 或 artifact 时保持未完成/无结论，不补写假结果。
- `wandb-replay` 只表示已抓取 loss trace 的回放，不表示训练任务正在实时运行。
- 每个节点保留原始/英文 `title`，同时提供人工可修订的 `title_zh`；页面默认显示中文标题，英文作为副标题或悬浮信息。重要摘要同样提供中文翻译，机器翻译必须可被 review/merge 修正。
- 节点颜色只表达少量稳定状态，不为每种关系创造强颜色。
- 大树必须使用确定性布局；更新数据后同一 Feature 不应无故跳位。

## 第一阶段非目标

- 不迁移 LumiaTree 的 v1/v2 canonical architecture IR。
- 不把 ContextLM、Python 类或模型组件作为顶层节点。
- 不实现多根森林或主结构多父 DAG。
- 不接真实飞书、不做无人化长期 session cursor。
- 不在第一版实现完整组件级图重写系统。
- 不复制 `/home/inuyasha/Lumia/LumiaTree` 的代码；需要复用的思想应重新实现为更小的接口。

## Git 驱动的 Feature 生长

项目未来的正式增长方式是提交 Feature 文件，而不是在网页上直接编辑树：

```text
贡献者新增一个 Feature 文件
        ↓
提交 commit / 创建 Pull Request
        ↓
CI 校验 schema、父节点、无环、provenance 和页面构建
        ↓
人工 review 接受其 Feature 边界与 parent/diff
        ↓
merge 到主分支
        ↓
确定性生成聚合 Feature Tree
        ↓
页面自动部署或刷新并长出新节点
```

长期 canonical source of truth 应从单个大文件迁移为“一 Feature 一文件”，例如：

```text
features/
  feat-olmo3-standard.json
  feat-concept-olmo-initial.json
  feat-concept-hlm-window-attention.json
```

聚合的 `feature-tree.json` 是构建产物，不应由多人手工维护。页面只消费确定性聚合结果，因此页面无需知道某个 Feature 来自哪次 PR。

贡献规则：

- 新增文件才会产生新节点；Git commit 本身不是 Feature。
- 文件名必须与 Feature ID 一致。
- 新 Feature 必须引用主分支上已存在的唯一父 Feature；第一项 Concept OLMo Feature 的父节点为 `feat-olmo3-standard`。
- PR 必须给出相对父节点的 before/after diff 和证据，而不是只给一个标题。
- PR 必须给出 Feature 的 commit-pinned code/config locator，以及相对父 Feature 的运行效果；配置和算力变化允许建点，但不能只有名称或资源清单。
- merge 表示项目接受该 Feature 边界和结构父节点；未 merge 的提案不能出现在正式页面。
- 已有 Feature ID 不得复用。历史 Feature 默认不删除；失败或废弃用状态表达。
- 修改已有 Feature、改 parent 或拆分/合并 Feature 需要显式 migration 说明和更严格 review。
- CI 与部署只能使用最小权限，不得把私有仓库 token、内网路径或凭证写进构建产物。

详细流程见 `CONTRIBUTION_WORKFLOW.md`。

## M1 完成标准

1. 有一份可验证的 Feature Tree schema。
2. 有且只有一个 OLMo-3 根点。
3. 正式数据包含 OLMo-3 根和从 `concept_olmo` 真实证据归并出的 Feature 支系；synthetic 分叉/失败样例移到测试 fixture，不冒充正式历史。
4. 页面可以从根逐层展开，点击节点查看完整详情。
5. 非 Feature 事实不会出现在主树上。
6. 本地服务、数据校验、单元测试和浏览器 smoke test 可重复运行。
7. 能从独立 Feature 文件确定性构建页面数据，并为未来 PR merge 后自动发布保留明确接口。
8. 每个正式非根节点都能从页面直接定位结构实现代码，并看到相对父节点的验证结果或明确的未验证状态。
