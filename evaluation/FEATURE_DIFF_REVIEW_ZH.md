# Concept OLMo Feature / Diff 人工裁决表

> 依据：`concept_olmo` 工作仓库、现有 proposal，以及 2026-07-19 的结构 Feature 人工裁决。
> 状态：结构类 D04–D10 已裁决；配置、训练与运行时类仍待裁决。
> canonical `data/feature-tree.json` 已于 2026-07-20 导入 10 个已裁决结构节点；其余待裁决候选仍只存在于 proposal。

## 结构 Feature 判定标准

结构 diff 在满足一般 Feature 准入规则的同时，按下列标准划分边界：

> 该 diff 引入一个有独立配置开关、或可独立消融的结构维度。

- 同一机制内的参数选择不单独成节点，例如 pooling 方式、chunk size、码本数量和码本大小；参数记录在所属节点说明中。
- 相同技术作用在可分别开关、可分别消融的不同对象上，可以形成不同节点。
- 语义等价的 Python 类替换属于重构/evidence，不因实现类变化自动成为结构节点。
- 多个 Feature 可以共享同一个聚合快照 commit；commit 不是 Feature 边界。

## 已裁决的 10 个结构节点

```text
OLMo-3 标准态
├── 分段拓扑骨架：encoder→chunk→HLM→fusion→decoder       [D04a]
│   └── HLM concept 预测模块                              [D04b]
│       ├── HLM 注意力继承骨干窗口节奏                    [D07]
│       └── HLM 层换成 OLMo3 标准 TransformerBlock        [D08，条件性]
├── Chunk 级 concept 表示（4-token 池化）                 [D05a]
│   └── Product VQ 离散化（32 码本 × 128）                [D05b]
├── Self-DD：模块内跨层读取                               [D06a]
│   └── Self-DD 累积式改写                                [D09]
└── 跨模块 residual-read 路由                             [D06b]
    └── 跨模块路由累积式改写                              [D10]
```

这里的四条一级分支表示四个可独立消融的结构维度。它们共享 `feat-olmo3-standard` 作为结构父节点；跨分支的实现关联使用 `related_to` / `depends_on` 表达，不引入一个虚构的“Concept OLMo 容器节点”。

## 结构节点明细

| Diff | 最终 Feature ID | English title | 中文标题 | 父节点 | 参数留在节点内 | 结论/待确认 |
|---|---|---|---|---|---|---|
| D04a | `feat-concept-segmented-topology` | Segmented encoder–chunk–HLM–fusion–decoder topology | 分段拓扑骨架 | `feat-olmo3-standard` | 各段层数等 | 五段信息流骨架，独立于表示、量化与路由的具体选择 |
| D04b | `feat-concept-hlm-predictor` | HLM concept predictor | HLM concept 预测模块 | `feat-concept-segmented-topology` | HLM 深度、宽度等 | D07/D08 的语义父节点 |
| D07 | `feat-concept-hlm-backbone-window` | HLM backbone-window attention | HLM 注意力继承骨干窗口节奏 | `feat-concept-hlm-predictor` | `window_size`、skip frequency | concept 窗口对应的 token 等效感受野待算法确认 |
| D08 | `feat-concept-hlm-olmo3-layer-reuse` | OLMo3 TransformerBlock reuse in HLM | HLM 层实现换成 OLMo3 标准 TransformerBlock | `feat-concept-hlm-predictor` | layer spec 细节 | 条件性节点；若确认前后语义/数值等价，降级为 D04b 的 evidence |
| D05a | `feat-concept-chunk-representation` | Chunk-level concept representation | Chunk 级 concept 表示 | `feat-olmo3-standard` | chunk=4、mean pooling、shift feature | shift feature 的准确语义待算法确认 |
| D05b | `feat-concept-product-vq` | Product-VQ concept discretization | Product VQ 离散化 | `feat-concept-chunk-representation` | 32 codebooks × 128 entries | 可移除后回到连续表示，优先补 VQ 消融 |
| D06a | `feat-concept-self-dd` | Self-DD intra-module cross-layer reads | Self-DD：模块内跨层读取 | `feat-olmo3-standard` | 启用位置、频率、混合参数 | “DD”准确展开待算法确认 |
| D09 | `feat-concept-cumsum-self-dd` | Cumsum self-DD state | Self-DD 累积式改写 | `feat-concept-self-dd` | normalization、mixing 参数 | 改变数学状态与内存复杂度，有独立 A/B launcher，无结果 artifact |
| D06b | `feat-concept-cross-module-residual-read` | Cross-module residual-read routes | 跨模块 residual-read 路由 | `feat-olmo3-standard` | 各 route enable flag、mixing 参数 | 与 D06a 为不同可消融维度 |
| D10 | `feat-concept-cross-module-cumsum-routes` | Cross-module cumsum routes | 跨模块路由累积式改写 | `feat-concept-cross-module-residual-read` | route mixing 参数 | 与 D09 技术相似但作用对象不同，不合并 |

## 全部 19 条语义原子 diff

“全部”指当前从 13 个旧 proposal 中抽取、并按人工裁决重分后的语义 diff，不是 Git 逐行增删清单。D04/D05/D06 从三条聚合 diff 拆成六条，所以总数由 16 变为 19。

| Diff | 类别 | Before | After | 当前裁决 | 最终 Feature / 归属 |
|---|---|---|---|---|---|
| D01 | 训练配置 | 无 branch-local 结构化小模型训练配方 | GBS=512、MBS=1、150B tokens、35763 steps、Adam、TP/PP/CP=1/1/1、WD=0.1 | 待裁决 | 待填写 |
| D02 | 模型/启动配置 | 7B 对照：32 层、hidden 4096、FFN 11008、32 heads、LR 3e-4 | 1B：16 层、hidden 2048、FFN 8192、Q/KV heads 16、head dim 128、LR 4e-4、32 H200 | 待裁决 | 待填写 |
| D03 | 模型/启动配置 | 7B 对照：32 层、hidden 4096、FFN 11008、32 heads、8 H200 | 3B：16 层、hidden 3328、FFN 13312、Q/KV heads 16、head dim 208、64 H200 | 待裁决 | 待填写 |
| D04a | 结构 | 单流 token Transformer | encoder → chunk → HLM → fusion → decoder 五段拓扑 | **NEW_FEATURE** | `feat-concept-segmented-topology` |
| D04b | 结构 | 无 concept-rate 自回归预测模块 | 小型 HLM 在低频 concept 序列上预测下一 concept | **NEW_FEATURE** | `feat-concept-hlm-predictor` |
| D05a | 结构 | 无 chunk-rate concept 表示 | 每 4 token 池化为一个连续 concept，含 shift feature | **NEW_FEATURE** | `feat-concept-chunk-representation` |
| D05b | 结构 | 连续 concept、不量化 | 32×128 Product VQ 离散 bottleneck | **NEW_FEATURE** | `feat-concept-product-vq` |
| D06a | 结构 | 模块层仅接收上一层输出 | 模块内可读取并混合此前所有层历史 | **NEW_FEATURE** | `feat-concept-self-dd` |
| D06b | 结构 | 模块间无中间状态读取 | HLM 读 encoder；decoder 读 encoder/HLM 的逐层历史 | **NEW_FEATURE** | `feat-concept-cross-module-residual-read` |
| D07 | 结构 | HLM 每层 full causal attention | 继承骨干 local/global 窗口节奏 | **NEW_FEATURE** | `feat-concept-hlm-backbone-window` |
| D08 | 结构/重构待定 | 自定义 ConceptCausalBlock + 独立 LayerNorm | OLMo3 layer spec TransformerBlock + final norm | **CONDITIONAL_FEATURE** | 暂留 `feat-concept-hlm-olmo3-layer-reuse`；等价则降级 evidence |
| D09 | 结构 | Self-DD 保存/stack 所有前层输出 | normalized recurrent cumsum + learned per-layer mixing | **NEW_FEATURE** | `feat-concept-cumsum-self-dd` |
| D10 | 结构 | 跨模块 route source 为逐层历史 | 每模块导出一个 cumsum source | **NEW_FEATURE** | `feat-concept-cross-module-cumsum-routes` |
| D11 | 训练配置 | ad-hoc public bench 与 A/B scripts | canonical Stage-1 launcher + reusable Concept config | 待裁决 | 待填写 |
| D12 | 训练/工程 | 无专用 full-state probe/grad-update records | save/resume smoke + route/VQ/rank/grad-update monitoring | 待裁决 | 待填写 |
| D13 | 运行时 | 仅训练态 full-prefix forward；stock runtime 不兼容 | SegmentedConceptKV + GPU-only batched decode | 待裁决 | 待填写 |
| D14 | 导出/工程 | 无 | strict custom model-only Hugging Face export | 待裁决 | 待填写 |
| D15 | 运行时 | fixed/equal-length batch cache | request-local lengths + dense caches + stable compiled routes | 待裁决 | 待填写 |
| D16 | 运行时 | HLM rotary input 缺失；无 correctness gate | rotary 修复 + GSM8K A/B + 默认关闭 | 待裁决 | 待填写 |

待裁决行继续使用：

- `NEW_FEATURE`
- `MERGE:<feature-id>`
- `EVIDENCE_ONLY:<feature-id>`
- `REJECT`
- `NEEDS_EVIDENCE`

## Commit-pinned 结构来源

| Diff | Revision | 主要实现 |
|---|---|---|
| D04a | `a489526` 聚合快照 | [`ConceptLMV2Model.forward`](https://github.com/Liu-yuliang/concept_olmo/blob/a489526d1dff4161a60dccc5034c2d595f059d49/repo/megatron/core/models/gpt/conceptlm_v2.py) |
| D04b | `a489526` 聚合快照 | [`ConceptPredictorV2`](https://github.com/Liu-yuliang/concept_olmo/blob/a489526d1dff4161a60dccc5034c2d595f059d49/repo/megatron/core/models/gpt/conceptlm_v2.py) |
| D05a | `a489526` 聚合快照 | [`_merge_token_chunks / _repeat_shift_concepts`](https://github.com/Liu-yuliang/concept_olmo/blob/a489526d1dff4161a60dccc5034c2d595f059d49/repo/megatron/core/models/gpt/conceptlm_v2.py) |
| D05b | `a489526` 聚合快照 | [`ConceptLMV22VQModel`](https://github.com/Liu-yuliang/concept_olmo/blob/a489526d1dff4161a60dccc5034c2d595f059d49/repo/megatron/core/models/gpt/conceptlm_v22_vq.py) |
| D06a | `a489526` 聚合快照 | [`V21SelfDD / V21DepthDD`](https://github.com/Liu-yuliang/concept_olmo/blob/a489526d1dff4161a60dccc5034c2d595f059d49/repo/megatron/core/models/gpt/conceptlm_v21.py) |
| D06b | `a489526` 聚合快照 | [`V21ResidualFlowRouteAdd` 与 route builders](https://github.com/Liu-yuliang/concept_olmo/blob/a489526d1dff4161a60dccc5034c2d595f059d49/repo/megatron/core/models/gpt/conceptlm_v21.py) |
| D07 | [`93fadb4`](https://github.com/Liu-yuliang/concept_olmo/commit/93fadb42872024a53b5d3750f8d47e44175d51da)、[`4c5c953`](https://github.com/Liu-yuliang/concept_olmo/commit/4c5c9536d6b015ce099172e550b4f5865d23e9b3) | HLM window 实现与默认配置 |
| D08 | [`7512755`](https://github.com/Liu-yuliang/concept_olmo/commit/7512755321ee4238b43ad08eb3ecfbc5fe2f2e6e) | [`ConceptPredictorV21.hlm_block`](https://github.com/Liu-yuliang/concept_olmo/blob/7512755321ee4238b43ad08eb3ecfbc5fe2f2e6e/repo/megatron/core/models/gpt/conceptlm_v21.py) |
| D09 | [`9871954`](https://github.com/Liu-yuliang/concept_olmo/commit/98719543fc9a3aa076a75ffd579e26d412c64141)、[`8d359fa`](https://github.com/Liu-yuliang/concept_olmo/commit/8d359faf0ae492d323edb86e704e1398af2ad7cc) | Self-DD cumsum 核心及跨路径应用 |
| D10 | [`28a1ec5`](https://github.com/Liu-yuliang/concept_olmo/commit/28a1ec57c9a0e5eed1eb5224b2d0883cc560a51a) | [跨模块 cumsum route source](https://github.com/Liu-yuliang/concept_olmo/blob/28a1ec57c9a0e5eed1eb5224b2d0883cc560a51a/repo/megatron/core/models/gpt/conceptlm_v21.py) |

D04a/D04b/D05a/D05b/D06a/D06b 共享历史起点 commit `a489526`，只通过文件/函数级 locator 区分。不能宣称它们各自拥有独立引入 commit，也不能从该历史恢复单项消融结果。

## 工程 Feature 的结构依赖提示

D05a 的分段压缩与 D06a/D06b 的状态/路由共同造成推理缓存与标准 Transformer 不兼容，是 D13/D15/D16 等工程 diff 的结构背景。工程类 Feature 重新裁决时应反向引用这些结构节点，但不改变上述结构节点边界。

## 中文字段

正式节点使用：

```yaml
title: Original English title
title_zh: 人工审核后的中文标题
summary: Original English summary
summary_zh: 人工审核后的中文说明
```

页面默认显示 `title_zh/summary_zh`，并保留英文标题作为副标题；缺少中文字段时回退到原字段。
