# Feature admission policy / Feature 准入政策

> 本文件是“哪些算 Feature、哪些不算”的权威规则。若与旧文档或提示词冲突，以本文件为准。

## 总原则

一个变化可以成为节点，当且仅当它能被描述为相对唯一父 Feature 的独立、可复现、可审查干预，并同时提供：

1. 明确目标或假设；
2. 精确 before/after diff；
3. 代码、配置或数据位置；
4. 验证状态和效果证据，或诚实的 `unverified`；
5. 稳定身份与 provenance。

“结构 Feature”只是 Feature 的一个类别，不是全部 Feature。

## 明确算 Feature

以下变化在满足总原则时可以独立成为节点：

| 类别 | 算 Feature 的变化 | 推荐 category |
|---|---|---|
| 模型结构 | 新增/删除/替换模块、表示、路由、attention/residual/context path、codebook/VQ、结构目标接口 | `architecture` |
| 模型配置 | 层数、hidden size、FFN size、attention heads、KV heads、context length、窗口/全注意力频率、embedding tying 等 | `model_configuration` |
| 训练配置 | micro/global batch、gradient accumulation、训练 token/steps、optimizer、learning rate/schedule、regularization、precision | `training_configuration` |
| 分布式配置 | GPU/节点数、TP/PP/CP/DP、通信或并行策略，只要它是被独立验证的可复现方案 | `training_configuration` |
| 数据 | 数据配比、过滤、curriculum、tokenizer 或采样策略的明确变化 | `data` |
| 运行时 | 引入新的推理/执行策略，并且具有独立行为或效果，而非纯等价实现细节 | `runtime` |

层数、hidden size、head 数、batch、训练 token、GPU、并行和超参数变化因此都可以算 Feature。

### 结构类 Feature 的边界判定

对 `category: architecture`，优先使用以下可操作标准划分节点：

> 该 diff 引入一个有独立配置开关、或可独立消融的结构维度。

- 同一机制内的参数选择不单独成节点，例如 pooling 方式、chunk size、码本数量与码本大小；这些值记录在所属 Feature 的 `delta`、设计说明和实验中。
- 同一种技术若作用于可分别开关、可分别消融的不同对象，可以形成不同 Feature。例如模块内 self-DD 的 cumsum 改写与跨模块 route source 的 cumsum 改写分别建点。
- 语义等价的实现替换仍是重构或 evidence，不因换用另一个 Python 类而自动成为结构节点。无法确认等价时可以保留条件性 proposal，并明确降级条件。
- 初始仓库快照可以同时为多个结构 Feature 提供 evidence；共享一个引入 commit 不要求把这些可独立消融的维度合并成一个节点。

English summary: an `architecture` node is admitted for an independently
switchable or meaningfully ablatable structural dimension. Parameter choices
inside that mechanism stay in the parent. Reusing one technique on separately
controlled subjects may produce separate Features. A semantically equivalent
implementation replacement is evidence only; unresolved equivalence permits a
conditional proposal only when its downgrade-to-evidence condition is explicit.

### 机器可读裁决记录 / Machine-readable review record

`schema/structural-feature-admission.schema.json` 记录人工结构边界裁决，供 review fixture
和 CI 检查裁决是否自洽。它要求显式记录：

- change kind、technique 与实际作用对象；
- 是否有独立配置开关及其 key；
- 是否有独立消融及其标识；
- 该变化是机制还是机制内参数；
- 实现替换的语义等价状态；
- shared snapshot group、evidence revision、decision、rationale 和降级条件。

该 schema 只验证“人工判断记录是否符合本政策”，不从 Python 类名、commit 数量或共享
revision 自动推断节点边界，也不能自动判定数值/算法等价性。

## 有条件地算

| 变化 | 准入条件 |
|---|---|
| 1B → 3B → 7B | “尺寸名称”本身不够；必须展开具体配置 diff、训练方案和结果。可以是一个聚合 configuration Feature，也可以拆成若干有独立假设的配置 Feature。 |
| Launcher / RJob / 脚本 | 若只是承载已有配置，不建点；若脚本首次定义并验证一个新的训练/并行方案，可作为该配置 Feature 的主要实现。 |
| Kernel / Flash Decode / 编译 | 语义完全等价且只是加速时通常作为 runtime evidence；若改变可用执行模式、数值行为或部署能力，并有独立结果，可成为 `runtime` Feature。 |
| Bugfix | 恢复原本意图时不建点；若修复后形成与父节点不同且可独立讨论的行为，可提案但必须说明为何不是已有节点修订。 |
| Checkpoint | checkpoint 本身不是 Feature；产生它的结构、配置、数据或训练方案可以是 Feature。 |
| Evaluation | 单纯评测脚本不是 Feature；新的评价方法只有在项目决定把 evaluation methodology 纳入树时才建点，当前默认作为效果证据。 |

## 明确不算 Feature

- commit、merge commit、PR、branch、tag；
- repository、文件、Python 类或函数；
- 纯重命名、格式化、目录整理和无语义重构；
- 仅增加日志、监控、文档或测试覆盖；
- 重复提交、同步上游、缓存和 CI 维护；
- 没有明确 diff 的“模型更大/更快/更好”描述；
- 无法关联到唯一父 Feature 的孤立变化。

这些内容可以成为 implementation/evidence，但不能在主树上占一个点。

## 代码与配置定位

不同类别允许不同主要 locator：

- `architecture`：类、函数、forward path、module/config binding；
- `model_configuration`：commit-pinned config、launcher 参数及其消费代码；
- `training_configuration`：训练配置、命令、调度/并行参数和实际运行 manifest；
- `data`：数据配方、过滤/采样代码和版本化 manifest；
- `runtime`：执行入口、kernel/runtime path 与调用条件。

每个 locator 至少记录 repository、完整 revision、path、symbol/parameter、role 和 commit-pinned URL。

## 效果证据

任何类别都必须相对父 Feature 报告效果：指标、吞吐、稳定性、收敛、质量、资源、定性观察或失败结果。效果类型随 Feature 类别变化，但都必须说明 comparison 和实验条件。

- `validated`：有足够 parent-relative evidence；
- `mixed`：有明确 trade-off 或结果冲突；
- `failed`：未达到目标；
- `unverified`：变化存在，但结果不足。

模型可以回溯生成 proposal，但不得从代码或 commit message 推断“有效”。
