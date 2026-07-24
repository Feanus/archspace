# InternSpace IS-S01 / IS-S02 acceptance report

Result: **16 PASS / 0 FAIL / 1 UNRESOLVED**

Formal data: `data/feature-tree.json`

| ID | Result | Requirement | Detail |
|---|---|---|---|
| SRC-01 | PASS | baseline source record is valid and honest | status=unresolved |
| SRC-02 | UNRESOLVED | OLMo-3 baseline is fully pinned | unresolved_fields=['facts.model_family.authoritative_external_evidence', 'facts.model_scale', 'facts.official_repository', 'facts.immutable_revision', 'facts.config', 'facts.checkpoint', 'facts.license', 'authoritative_sources'] |
| IS-S01-01 | PASS | formal data satisfies canonical schema | schema valid |
| IS-S01-02 | PASS | there is exactly one OLMo-3 structural root | roots=['feat-olmo3-standard'] |
| IS-S01-03 | PASS | every formal node is a Feature | count=11 |
| IS-S01-04 | PASS | parent_id is single-parent, connected, and acyclic | all Features reach the root exactly once |
| IS-S01-05 | PASS | formal data is exactly the reviewed root plus ten structural Features | ids=['feat-concept-chunk-representation', 'feat-concept-cross-module-cumsum-routes', 'feat-concept-cross-module-residual-read', 'feat-concept-cumsum-self-dd', 'feat-concept-hlm-backbone-window', 'feat-concept-hlm-olmo3-layer-reuse', 'feat-concept-hlm-predictor', 'feat-concept-product-vq', 'feat-concept-segmented-topology', 'feat-concept-self-dd', 'feat-olmo3-standard'] |
| IS-S01-06 | PASS | auxiliary relations reference Features and do not define tree parents | only parent_id was used for structural validation |
| IS-S01-07 | PASS | formal data contains no fallback payload | no fallback markers |
| IS-S02-01 | PASS | web implementation exists | source_files=10 |
| IS-S02-02 | PASS | local service is reachable | HTTP 200, bytes=5560 |
| IS-S02-03 | PASS | main canvas renders only the formal Feature tree | browser assertion passed |
| IS-S02-04 | PASS | expand/collapse preserves the adjudicated HLM branch | browser assertion passed |
| IS-S02-05 | PASS | selection details are complete and auxiliary edges do not change the tree | browser assertion passed |
| IS-S02-06 | PASS | search reveals the collapsed Product-VQ path and opens correct details | browser assertion passed |
| IS-S02-07 | PASS | root details expose every OLMo-3 pin field and unresolved state | browser assertion passed |
| IS-S02-08 | PASS | missing formal data never activates a fallback tree | browser assertion passed |

## 视觉参考门禁

- 独立结果：**10 PASS / 0 FAIL / 1 UNRESOLVED**。
- 详细报告：`evaluation/VISUAL_ACCEPTANCE_REPORT_ZH.md`。
- 唯一未解决项：当前 runner 访问 `https://inuyashayang.github.io/InternSpace/` 时连接重置；GitHub Pages API 显示 commit `8b3133710d3a4330b9520800e5181ccff9c39e4d` 的部署状态为 `built`（更新时间 `2026-07-20T02:32:15Z`），但本轮未用该元数据冒充五个线上 URL 的 HTTP 200 实测。
- 本地暗色主题、root + 四主分支、节点 SIM 标识、抽屉、边语义、1440×900、390×844、pan/zoom/search/keyboard/reduced-motion、资源 200 与 telemetry 隔离均通过。
