# Concept OLMo Feature growth — 人工结构裁决落地报告

> 权威口径：`evaluation/FEATURE_DIFF_REVIEW_ZH.md` 的 2026-07-19 人工裁决。工作仓库仅提供派生 Feature 的实现/证据，不是 OLMo-3 root provenance，也不是树节点。

## 结果摘要

- proposal 总数：**18**。
- 已裁决结构节点：**10**。
- 语义原子 diff：**19**；结构 diff **10**，仍待裁决 **9**。
- 待裁决 proposal 文件：**8**（Stage-1 一个 proposal 承载 D11/D12 两条 diff）。
- 临时完整树最大深度：**4 edges**。
- validation：validated 0、mixed 2、failed 0、unverified 16。
- canonical `data/feature-tree.json` 已于 2026-07-20 apply：只导入 root 与 10 个已裁决结构节点；8 个待裁决 proposal 未导入。

### Category 分布

| Category | 数量 |
|---|---:|
| `architecture` | 10 |
| `model_configuration` | 2 |
| `training_configuration` | 2 |
| `data` | 0 |
| `runtime` | 4 |

## 权威 10 节点结构树

```text
feat-olmo3-standard
├── feat-concept-segmented-topology [分段拓扑骨架]
│   └── feat-concept-hlm-predictor [HLM concept 预测模块]
│       ├── feat-concept-hlm-backbone-window [HLM 注意力继承骨干窗口节奏]
│       └── feat-concept-hlm-olmo3-layer-reuse [HLM 层实现换成 OLMo3 标准 TransformerBlock]
├── feat-concept-chunk-representation [Chunk 级 concept 表示]
│   └── feat-concept-product-vq [Product VQ 离散化]
├── feat-concept-self-dd [Self-DD：模块内跨层读取]
│   └── feat-concept-cumsum-self-dd [Self-DD 累积式改写]
└── feat-concept-cross-module-residual-read [跨模块 residual-read 路由]
    └── feat-concept-cross-module-cumsum-routes [跨模块路由累积式改写]
```

结构约束：

- D07 与 D08 都以 D04b 为父节点，二者是兄弟关系。
- D09 只继承 D06a；D10 只继承 D06b。
- D05a 保留 `chunk_size=4`、`meanpooling`、`shift_feature=true`；D05b 保留 `32 × 128` Product VQ，均不再拆参数节点。
- D04a/D04b/D05a/D05b/D06a/D06b 共享 initial snapshot evidence，但由 qualified symbol locator 区分边界。

## 旧聚合节点迁移

- `feat-concept-olmo-v22-vq-snapshot` is **superseded**：它把六个可独立消融维度聚合成了一个活动节点。当前只在 bundle migration history 中保留，不再出现在活动 Feature、parent、depends_on 或 related_to 中。
- replacement：`feat-concept-segmented-topology`、`feat-concept-hlm-predictor`、`feat-concept-chunk-representation`、`feat-concept-product-vq`、`feat-concept-self-dd`、`feat-concept-cross-module-residual-read`。

## 10 个结构 Feature 明细

| Diff | Feature | 中文标题 | Parent | Locator | Validation | 裁决 |
|---|---|---|---|---|---|---|
| D04a | `feat-concept-segmented-topology`<br>Segmented encoder–chunk–HLM–fusion–decoder topology | 分段拓扑骨架 | `feat-olmo3-standard` | [ConceptLMV2Model.__init__ / ConceptLMV2Model.forward](https://github.com/Liu-yuliang/concept_olmo/blob/a489526d1dff4161a60dccc5034c2d595f059d49/repo/megatron/core/models/gpt/conceptlm_v2.py)<br>`a489526d1dff4161a60dccc5034c2d595f059d49` | `unverified` | `adjudicated` |
| D04b | `feat-concept-hlm-predictor`<br>HLM concept predictor | HLM concept 预测模块 | `feat-concept-segmented-topology` | [ConceptPredictorV2](https://github.com/Liu-yuliang/concept_olmo/blob/a489526d1dff4161a60dccc5034c2d595f059d49/repo/megatron/core/models/gpt/conceptlm_v2.py)<br>`a489526d1dff4161a60dccc5034c2d595f059d49` | `unverified` | `adjudicated` |
| D07 | `feat-concept-hlm-backbone-window`<br>HLM backbone-window attention | HLM 注意力继承骨干窗口节奏 | `feat-concept-hlm-predictor` | [ConceptCausalBlock._sliding_window_causal_bias](https://github.com/Liu-yuliang/concept_olmo/blob/93fadb42872024a53b5d3750f8d47e44175d51da/repo/megatron/core/models/gpt/conceptlm_v2.py)<br>`93fadb42872024a53b5d3750f8d47e44175d51da`<br>[CONCEPTLM_HLM_ATTENTION_MODE](https://github.com/Liu-yuliang/concept_olmo/blob/4c5c9536d6b015ce099172e550b4f5865d23e9b3/repo/examples/public_training_bench/train_concept_v22_vq_olmo3_7b.sh)<br>`4c5c9536d6b015ce099172e550b4f5865d23e9b3` | `unverified` | `adjudicated` |
| D08 | `feat-concept-hlm-olmo3-layer-reuse`<br>OLMo3 TransformerBlock reuse in HLM | HLM 层实现换成 OLMo3 标准 TransformerBlock | `feat-concept-hlm-predictor` | [ConceptPredictorV21.hlm_block](https://github.com/Liu-yuliang/concept_olmo/blob/7512755321ee4238b43ad08eb3ecfbc5fe2f2e6e/repo/megatron/core/models/gpt/conceptlm_v21.py)<br>`7512755321ee4238b43ad08eb3ecfbc5fe2f2e6e` | `unverified` | `conditional` |
| D05a | `feat-concept-chunk-representation`<br>Chunk-level concept representation | Chunk 级 concept 表示 | `feat-olmo3-standard` | [ConceptLMV2Model._merge_token_chunks](https://github.com/Liu-yuliang/concept_olmo/blob/a489526d1dff4161a60dccc5034c2d595f059d49/repo/megatron/core/models/gpt/conceptlm_v2.py)<br>`a489526d1dff4161a60dccc5034c2d595f059d49`<br>[ConceptLMV2Model._repeat_shift_concepts](https://github.com/Liu-yuliang/concept_olmo/blob/a489526d1dff4161a60dccc5034c2d595f059d49/repo/megatron/core/models/gpt/conceptlm_v2.py)<br>`a489526d1dff4161a60dccc5034c2d595f059d49` | `unverified` | `adjudicated` |
| D05b | `feat-concept-product-vq`<br>Product-VQ concept discretization | Product VQ 离散化 | `feat-concept-chunk-representation` | [ConceptLMV22VQModel.__init__ / ConceptLMV22VQModel._concept_branch_v21](https://github.com/Liu-yuliang/concept_olmo/blob/a489526d1dff4161a60dccc5034c2d595f059d49/repo/megatron/core/models/gpt/conceptlm_v22_vq.py)<br>`a489526d1dff4161a60dccc5034c2d595f059d49` | `unverified` | `adjudicated` |
| D06a | `feat-concept-self-dd`<br>Self-DD intra-module cross-layer reads | Self-DD：模块内跨层读取 | `feat-olmo3-standard` | [V21SelfDD / V21DepthDD](https://github.com/Liu-yuliang/concept_olmo/blob/a489526d1dff4161a60dccc5034c2d595f059d49/repo/megatron/core/models/gpt/conceptlm_v21.py)<br>`a489526d1dff4161a60dccc5034c2d595f059d49` | `unverified` | `adjudicated` |
| D09 | `feat-concept-cumsum-self-dd`<br>Cumsum self-DD state | Self-DD 累积式改写 | `feat-concept-self-dd` | [V21SelfCumsumDD](https://github.com/Liu-yuliang/concept_olmo/blob/98719543fc9a3aa076a75ffd579e26d412c64141/repo/megatron/core/models/gpt/conceptlm_v21.py)<br>`98719543fc9a3aa076a75ffd579e26d412c64141`<br>[ConceptLMV21Model._run_v21_decoder](https://github.com/Liu-yuliang/concept_olmo/blob/8d359faf0ae492d323edb86e704e1398af2ad7cc/repo/megatron/core/models/gpt/conceptlm_v21.py)<br>`8d359faf0ae492d323edb86e704e1398af2ad7cc` | `unverified` | `adjudicated` |
| D06b | `feat-concept-cross-module-residual-read`<br>Cross-module residual-read routes | 跨模块 residual-read 路由 | `feat-olmo3-standard` | [V21ResidualFlowRouteAdd](https://github.com/Liu-yuliang/concept_olmo/blob/a489526d1dff4161a60dccc5034c2d595f059d49/repo/megatron/core/models/gpt/conceptlm_v21.py)<br>`a489526d1dff4161a60dccc5034c2d595f059d49`<br>[ConceptLMV21Model._build_encoder_concept_states / _build_decoder_encoder_states / _build_decoder_concept_states](https://github.com/Liu-yuliang/concept_olmo/blob/a489526d1dff4161a60dccc5034c2d595f059d49/repo/megatron/core/models/gpt/conceptlm_v21.py)<br>`a489526d1dff4161a60dccc5034c2d595f059d49` | `unverified` | `adjudicated` |
| D10 | `feat-concept-cross-module-cumsum-routes`<br>Cross-module cumsum routes | 跨模块路由累积式改写 | `feat-concept-cross-module-residual-read` | [ConceptLMV21Model._build_encoder_concept_states](https://github.com/Liu-yuliang/concept_olmo/blob/28a1ec57c9a0e5eed1eb5224b2d0883cc560a51a/repo/megatron/core/models/gpt/conceptlm_v21.py)<br>`28a1ec57c9a0e5eed1eb5224b2d0883cc560a51a` | `unverified` | `adjudicated` |

## Parent-relative before/after

| Feature | Target | Before | After | Rationale |
|---|---|---|---|---|
| `feat-concept-segmented-topology` | `model.forward_topology` | `single-stream token Transformer stack` | `token encoder -> chunk compression -> HLM concept prediction -> concept fusion -> token decoder` | Define the primary segmented topology while leaving representation and routing choices independently reviewable. |
| `feat-concept-hlm-predictor` | `concept.hlm.module` | `no concept-rate autoregressive predictor` | `ConceptPredictorV2 HLM tower with causal layers, final norm and prediction heads` | The HLM is independently configurable and is the semantic parent of D07 and D08. |
| `feat-concept-hlm-backbone-window` | `concept.hlm.attention_pattern` | `full causal attention` | `inherit backbone window_size and window_attn_skip_freq` | Retain an independently switchable full-attention alternative. |
| `feat-concept-hlm-olmo3-layer-reuse` | `concept.hlm.layer_implementation` | `custom ConceptCausalBlock list with standalone LayerNorm` | `TransformerBlock using the configured OLMo3 layer spec and final norm` | Record the replacement while preserving the explicit downgrade-to-evidence condition. |
| `feat-concept-chunk-representation` | `model.concept_representation` | `no chunk-rate concept representation` | `{"chunk_size": 4, "pooling": "meanpooling", "representation": "continuous concept vector", "shift_feature": true}` | The representation is independently removable; its parameter choices remain inside one Feature. |
| `feat-concept-product-vq` | `model.concept_quantization` | `continuous chunk concept vectors without VQ` | `{"codebook_size": 128, "codebooks": 32, "method": "product vector quantization"}` | VQ is an optional structural layer whose removal returns the continuous parent state. |
| `feat-concept-self-dd` | `concept.self_dd` | `each layer consumes only the immediately preceding hidden state` | `V21SelfDD/V21DepthDD read and mix stacked earlier outputs within the same module` | Same-module history reads are independently switchable and are the direct parent of D09. |
| `feat-concept-cumsum-self-dd` | `concept.self_dd.state` | `list/stack of previous layer outputs` | `normalized recurrent cumsum state with learned per-layer mixing` | Change the mathematical state and memory shape while preserving D06a as the direct baseline. |
| `feat-concept-cross-module-residual-read` | `concept.cross_module_routes` | `no learned reads of intermediate states across encoder, HLM and decoder modules` | `HLM reads encoder histories; decoder reads encoder and HLM histories through residual routes` | Cross-module reads are independently switchable from Self-DD and are the direct parent of D10. |
| `feat-concept-cross-module-cumsum-routes` | `concept.cross_module_routes.sources` | `per-layer encoder/concept histories` | `one cumsum route export per module` | D10 changes cross-module source semantics and therefore builds only on D06b. |

## Shared initial snapshot evidence

- Revision: `a489526d1dff4161a60dccc5034c2d595f059d49`。
- Classification: 一条 `feature_implementation` 记录以 `shared_initial_snapshot_evidence` 角色同时指向 **6** 个结构 Feature。
- 该 revision 是共同的最早可见聚合快照，不代表六项结构在同一时刻被分别引入，也不提供单项消融结果。

| Feature | Qualified locator |
|---|---|
| `feat-concept-chunk-representation` | [ConceptLMV2Model._merge_token_chunks](https://github.com/Liu-yuliang/concept_olmo/blob/a489526d1dff4161a60dccc5034c2d595f059d49/repo/megatron/core/models/gpt/conceptlm_v2.py)<br>[ConceptLMV2Model._repeat_shift_concepts](https://github.com/Liu-yuliang/concept_olmo/blob/a489526d1dff4161a60dccc5034c2d595f059d49/repo/megatron/core/models/gpt/conceptlm_v2.py) |
| `feat-concept-cross-module-residual-read` | [V21ResidualFlowRouteAdd](https://github.com/Liu-yuliang/concept_olmo/blob/a489526d1dff4161a60dccc5034c2d595f059d49/repo/megatron/core/models/gpt/conceptlm_v21.py)<br>[ConceptLMV21Model._build_encoder_concept_states / _build_decoder_encoder_states / _build_decoder_concept_states](https://github.com/Liu-yuliang/concept_olmo/blob/a489526d1dff4161a60dccc5034c2d595f059d49/repo/megatron/core/models/gpt/conceptlm_v21.py) |
| `feat-concept-hlm-predictor` | [ConceptPredictorV2](https://github.com/Liu-yuliang/concept_olmo/blob/a489526d1dff4161a60dccc5034c2d595f059d49/repo/megatron/core/models/gpt/conceptlm_v2.py) |
| `feat-concept-product-vq` | [ConceptLMV22VQModel.__init__ / ConceptLMV22VQModel._concept_branch_v21](https://github.com/Liu-yuliang/concept_olmo/blob/a489526d1dff4161a60dccc5034c2d595f059d49/repo/megatron/core/models/gpt/conceptlm_v22_vq.py) |
| `feat-concept-segmented-topology` | [ConceptLMV2Model.__init__ / ConceptLMV2Model.forward](https://github.com/Liu-yuliang/concept_olmo/blob/a489526d1dff4161a60dccc5034c2d595f059d49/repo/megatron/core/models/gpt/conceptlm_v2.py) |
| `feat-concept-self-dd` | [V21SelfDD / V21DepthDD](https://github.com/Liu-yuliang/concept_olmo/blob/a489526d1dff4161a60dccc5034c2d595f059d49/repo/megatron/core/models/gpt/conceptlm_v21.py) |

## D08 条件性 proposal

- 待确认问题：Are ConceptCausalBlock and the OLMo3 TransformerBlock path structurally and numerically equivalent under the same HLM configuration?
- 若等价：Downgrade D08 to implementation evidence of feat-concept-hlm-predictor.
- 若不等价：Retain D08 as a sibling of D07 under feat-concept-hlm-predictor.
- 责任方：`algorithm review`。
- 当前没有数值 parity、训练 A/B 或 checkpoint migration 结果，因此不得把 D08 写成已验证结构收益。

## 其余 9 条待裁决 diff

本轮不替用户裁决 D01–D03、D11–D16；现有 proposal 文件继续保留，但 `decision_status=pending` 且 `recommended_for_merge=false`。

| Diff | Proposal | Category | Parent | Validation |
|---|---|---|---|---|
| `D01` | `feat-olmo3-150b-training-recipe` | `training_configuration` | `feat-olmo3-standard` | `unverified` |
| `D02` | `feat-olmo3-1b-dense-preset` | `model_configuration` | `feat-olmo3-standard` | `unverified` |
| `D03` | `feat-olmo3-3b-dense-preset` | `model_configuration` | `feat-olmo3-standard` | `unverified` |
| `D11` | `feat-concept-stage1-scale-resume` | `training_configuration` | `feat-concept-cross-module-cumsum-routes` | `unverified` |
| `D12` | `feat-concept-stage1-scale-resume` | `training_configuration` | `feat-concept-cross-module-cumsum-routes` | `unverified` |
| `D13` | `feat-concept-segmented-inference-runtime` | `runtime` | `feat-concept-cross-module-cumsum-routes` | `mixed` |
| `D14` | `feat-concept-strict-hf-export` | `runtime` | `feat-concept-cross-module-cumsum-routes` | `unverified` |
| `D15` | `feat-concept-variable-length-batching` | `runtime` | `feat-concept-segmented-inference-runtime` | `unverified` |
| `D16` | `feat-concept-flash-decode-evaluation` | `runtime` | `feat-concept-segmented-inference-runtime` | `mixed` |

## 工程 Feature 的结构背景

D13、D15、D16 的 runtime proposal 保持原 Feature 边界与 structural parent，不在本轮重裁决；它们额外通过 `depends_on` 记录以下结构背景：

- `feat-concept-chunk-representation`（D05a）；
- `feat-concept-self-dd`（D06a）；
- `feat-concept-cross-module-residual-read`（D06b）。

这些辅助关系不改变单父树。

## Commit classification

| Commit | Disposition | Feature(s)/reason |
|---|---|---|
| [a489526d1dff4161a60dccc5034c2d595f059d49](https://github.com/Liu-yuliang/concept_olmo/commit/a489526d1dff4161a60dccc5034c2d595f059d49) | `feature_implementation` | `feat-concept-chunk-representation`, `feat-concept-cross-module-residual-read`, `feat-concept-hlm-predictor`, `feat-concept-product-vq`, `feat-concept-segmented-topology`, `feat-concept-self-dd` |
| [505b06820f2e4098ea0d973e07e995375508de85](https://github.com/Liu-yuliang/concept_olmo/commit/505b06820f2e4098ea0d973e07e995375508de85) | `feature_evidence` | `feat-concept-stage1-scale-resume` |
| [2d71d3fc2aa14c071e4ff514c66426b48f7a22bd](https://github.com/Liu-yuliang/concept_olmo/commit/2d71d3fc2aa14c071e4ff514c66426b48f7a22bd) | `feature_evidence` | `feat-concept-stage1-scale-resume` |
| [93fadb42872024a53b5d3750f8d47e44175d51da](https://github.com/Liu-yuliang/concept_olmo/commit/93fadb42872024a53b5d3750f8d47e44175d51da) | `feature_implementation` | `feat-concept-hlm-backbone-window` |
| [4c5c9536d6b015ce099172e550b4f5865d23e9b3](https://github.com/Liu-yuliang/concept_olmo/commit/4c5c9536d6b015ce099172e550b4f5865d23e9b3) | `feature_implementation` | `feat-concept-hlm-backbone-window` |
| [c5e4a029e6018cdcdbe500c5f13dc020c9d9fa4f](https://github.com/Liu-yuliang/concept_olmo/commit/c5e4a029e6018cdcdbe500c5f13dc020c9d9fa4f) | `feature_evidence` | `feat-concept-cross-module-residual-read`, `feat-concept-self-dd` |
| [7512755321ee4238b43ad08eb3ecfbc5fe2f2e6e](https://github.com/Liu-yuliang/concept_olmo/commit/7512755321ee4238b43ad08eb3ecfbc5fe2f2e6e) | `feature_implementation` | `feat-concept-hlm-olmo3-layer-reuse` |
| [98719543fc9a3aa076a75ffd579e26d412c64141](https://github.com/Liu-yuliang/concept_olmo/commit/98719543fc9a3aa076a75ffd579e26d412c64141) | `feature_implementation` | `feat-concept-cumsum-self-dd` |
| [8d359faf0ae492d323edb86e704e1398af2ad7cc](https://github.com/Liu-yuliang/concept_olmo/commit/8d359faf0ae492d323edb86e704e1398af2ad7cc) | `feature_implementation` | `feat-concept-cumsum-self-dd` |
| [93e1120c73350333405e9cf89e37c21e41e72653](https://github.com/Liu-yuliang/concept_olmo/commit/93e1120c73350333405e9cf89e37c21e41e72653) | `feature_evidence` | `feat-concept-cumsum-self-dd` |
| [28a1ec57c9a0e5eed1eb5224b2d0883cc560a51a](https://github.com/Liu-yuliang/concept_olmo/commit/28a1ec57c9a0e5eed1eb5224b2d0883cc560a51a) | `feature_implementation` | `feat-concept-cross-module-cumsum-routes` |
| [7f4d92a3b0f37f99e14b41b54a5ab7971c3f9383](https://github.com/Liu-yuliang/concept_olmo/commit/7f4d92a3b0f37f99e14b41b54a5ab7971c3f9383) | `feature_evidence` | `feat-concept-stage1-scale-resume` |
| [1f85baff62a930b57427302e65f7822c0cd8b3a8](https://github.com/Liu-yuliang/concept_olmo/commit/1f85baff62a930b57427302e65f7822c0cd8b3a8) | `feature_implementation` | `feat-concept-stage1-scale-resume` |
| [82a7c1acaf91c7bfe2fc67262ec2360656d45c57](https://github.com/Liu-yuliang/concept_olmo/commit/82a7c1acaf91c7bfe2fc67262ec2360656d45c57) | `feature_evidence` | `feat-concept-stage1-scale-resume` |
| [34935e7c3c36e57823683f2c9bed2136ad77070b](https://github.com/Liu-yuliang/concept_olmo/commit/34935e7c3c36e57823683f2c9bed2136ad77070b) | `feature_evidence` | `feat-concept-stage1-scale-resume` |
| [bb08a0f4dc32549c79b904d9ba38c38c3fea280a](https://github.com/Liu-yuliang/concept_olmo/commit/bb08a0f4dc32549c79b904d9ba38c38c3fea280a) | `feature_implementation` | `feat-concept-stage1-scale-resume` |
| [9f0fb4a1211304b586f2daaf8f97d8f9bc82fda7](https://github.com/Liu-yuliang/concept_olmo/commit/9f0fb4a1211304b586f2daaf8f97d8f9bc82fda7) | `feature_implementation` | `feat-concept-stage1-scale-resume` |
| [9ec27a113876f0c6d4ee9bc6ce7be55fd8690ca2](https://github.com/Liu-yuliang/concept_olmo/commit/9ec27a113876f0c6d4ee9bc6ce7be55fd8690ca2) | `rejected_engineering` | Repository-size cleanup removes an upstream test tree but adds no Concept capability. |
| [7802ff627c0abc4e1a489a34353ad8ebe7b52eea](https://github.com/Liu-yuliang/concept_olmo/commit/7802ff627c0abc4e1a489a34353ad8ebe7b52eea) | `feature_implementation` | `feat-concept-segmented-inference-runtime` |
| [2119d24b231730b12953100e1e40bc2134993a18](https://github.com/Liu-yuliang/concept_olmo/commit/2119d24b231730b12953100e1e40bc2134993a18) | `feature_implementation` | `feat-concept-segmented-inference-runtime` |
| [56e4c613757570fa1090947633c4efe9245b6a89](https://github.com/Liu-yuliang/concept_olmo/commit/56e4c613757570fa1090947633c4efe9245b6a89) | `feature_implementation` | `feat-concept-strict-hf-export` |
| [236bfa37b8e55a78a4b5c8d2737bf958b7760434](https://github.com/Liu-yuliang/concept_olmo/commit/236bfa37b8e55a78a4b5c8d2737bf958b7760434) | `feature_implementation` | `feat-concept-variable-length-batching` |
| [06002575e5db02fde4b4a67aec28f7e1e3437ffe](https://github.com/Liu-yuliang/concept_olmo/commit/06002575e5db02fde4b4a67aec28f7e1e3437ffe) | `feature_implementation` | `feat-concept-variable-length-batching` |
| [49ccae9b46d440b676fd12c8a31c2e6cb7addfca](https://github.com/Liu-yuliang/concept_olmo/commit/49ccae9b46d440b676fd12c8a31c2e6cb7addfca) | `feature_evidence` | `feat-concept-variable-length-batching` |
| [ea921d04a02c3670e9e6c5d2aa72e9678e220c68](https://github.com/Liu-yuliang/concept_olmo/commit/ea921d04a02c3670e9e6c5d2aa72e9678e220c68) | `feature_implementation` | `feat-concept-variable-length-batching` |
| [832100f5fcc2cf6f37d0700fb0d52ce4b7abc934](https://github.com/Liu-yuliang/concept_olmo/commit/832100f5fcc2cf6f37d0700fb0d52ce4b7abc934) | `feature_implementation` | `feat-concept-variable-length-batching` |
| [78cbce74c3e049d44973ab4b61ecc3a5d7287197](https://github.com/Liu-yuliang/concept_olmo/commit/78cbce74c3e049d44973ab4b61ecc3a5d7287197) | `feature_implementation` | `feat-concept-variable-length-batching` |
| [4dc4c2dda6db0879defb31019bc97366e20ac2ad](https://github.com/Liu-yuliang/concept_olmo/commit/4dc4c2dda6db0879defb31019bc97366e20ac2ad) | `feature_implementation` | `feat-concept-flash-decode-evaluation` |
| [d57481c5f4b36e1d6846e01c18dd56cc077b3c0e](https://github.com/Liu-yuliang/concept_olmo/commit/d57481c5f4b36e1d6846e01c18dd56cc077b3c0e) | `feature_implementation` | `feat-concept-flash-decode-evaluation` |
| [f17d00a49521219b210b4c18fd153915817e7196](https://github.com/Liu-yuliang/concept_olmo/commit/f17d00a49521219b210b4c18fd153915817e7196) | `feature_evidence` | `feat-concept-flash-decode-evaluation` |
| [9fdc384f139448aa5f915a2501d0e19aabd84372](https://github.com/Liu-yuliang/concept_olmo/commit/9fdc384f139448aa5f915a2501d0e19aabd84372) | `feature_evidence` | `feat-concept-flash-decode-evaluation` |
| [6ae216283d88f8db0cb35e18c818018617b50f65](https://github.com/Liu-yuliang/concept_olmo/commit/6ae216283d88f8db0cb35e18c818018617b50f65) | `feature_evidence` | `feat-concept-flash-decode-evaluation` |

## 来源边界

- Work repository: [Liu-yuliang/concept_olmo](https://github.com/Liu-yuliang/concept_olmo)。
- Observed main: `a489526d1dff4161a60dccc5034c2d595f059d49` → `6ae216283d88f8db0cb35e18c818018617b50f65`。
- 仓库不是官方 OLMo-3 发布仓库；root 的外部 official source/checkpoint/license 仍 unresolved。
- checkpoint 内容哈希仍缺失；未复制上游内网路径。

## 算法待确认项

1. D08 自定义 `ConceptCausalBlock` 与 OLMo3 `TransformerBlock` 的结构语义和数值等价性。
2. D07 concept-rate window 对 token 等效感受野的准确映射。
3. D05a `shift_feature` 的准确算法语义与预期对齐方式。
4. D06a 中 `DD` 的权威展开、作用位置及预期数学含义。
5. 六个 shared-snapshot 基础结构、D07、D09、D10 的独立消融结果。
6. D05b 连续 concept 与 Product-VQ 路径的效果比较。

## 验证命令

```bash
python3 -m ingest.build_concept_olmo_proposals
python3 -m ingest.validate_concept_proposals --combined-output /tmp/internspace-concept-olmo-tree.json
python3 scripts/validate_feature_tree.py --data /tmp/internspace-concept-olmo-tree.json
python3 sources/verify_olmo3_source.py
python3 sources/verify_concept_olmo_observation.py
pytest -q tests/e2e/test_contract.py tests/e2e/test_concept_olmo_proposals.py tests/model/test_structural_feature_policy.py
git diff --check
```
