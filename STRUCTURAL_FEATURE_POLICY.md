# Structural Feature policy / 结构 Feature 政策

> 本文件只适用于 `category: architecture`。全局节点准入以
> `FEATURE_ADMISSION_POLICY.md` 为准；模型配置、训练配置、数据与运行时
> Feature 即使不是结构机制，也可能是合法节点。

## Node admission rule

A visible non-root node represents a new model structure or information-flow
mechanism relative to its parent. Scaling an existing structure is not a new
structural Feature.

The operational boundary test is whether the diff introduces a structural
dimension with its own configuration switch or a meaningful independent
ablation. Parameter choices inside one mechanism, such as pooling mode, chunk
size, codebook count or codebook size, stay in that Feature's description and
experiments rather than becoming separate nodes.

The same technique may form separate Features when it changes independently
switchable objects. Conversely, replacing one Python implementation with
another is not a structural Feature when the two are semantically equivalent;
an unresolved equivalence question must be recorded as a conditional proposal
with an explicit downgrade-to-evidence condition.

## 人工裁决摘要 / Human review summary

- 有独立配置开关，或能进行有意义的独立消融，才构成候选结构维度。
- pooling、chunk size、码本数量/大小等机制内参数留在所属 Feature 的说明、delta 和实验中。
- 同一技术作用于不同且可分别控制的对象时可以拆点，例如模块内 self-DD cumsum 与跨模块
  route-source cumsum。
- 经确认语义等价的 Python/TransformerBlock 实现替换降级为 refactor/evidence。
- 等价性尚未确认时可以保留条件性 proposal，但必须写明“确认等价后降级 evidence”。
- 多个独立结构维度可以共享同一 initial snapshot commit；provenance 相同不等于边界相同。

The review record contract is
`schema/structural-feature-admission.schema.json`. It validates that a human
decision contains the switch/ablation, parameter scope, equivalence,
snapshot, decision and downgrade metadata required above. It does not decide
semantic or numerical equivalence from source code.

Typical structural changes include:

- adding, removing or replacing a semantic module;
- introducing a new representation or codebook;
- adding or rewiring an attention, residual, routing or context path;
- changing where and how information enters the forward computation;
- adding a structurally distinct objective interface or inference mechanism.

The following are not `architecture` nodes by themselves. They may still be
admitted as configuration, data or runtime Features under
`FEATURE_ADMISSION_POLICY.md`:

- parameter/model size, layer count, hidden width or head-count scaling;
- token budget, batch size, learning rate, optimizer, GPU count or parallelism;
- launchers, checkpointing, monitoring and cluster operations;
- semantic-preserving kernels, compilation, export and throughput work;
- evaluation harnesses, documentation, refactors, renames and bug fixes;
- individual commits, PRs, runs and checkpoints.

An engineering change can become a node only when the actual code diff proves
that it introduces an independently meaningful model structure.

## Required code location

Every accepted structural Feature must identify its implementation with at
least:

- repository URL;
- full immutable commit;
- repository-relative path;
- qualified class/function/symbol when available;
- the role played by that location;
- a commit-pinned browser locator or content hash.

Several locations may implement one Feature. Python classes and files remain
details and do not become tree nodes.

## Required effect evidence

Every proposal states its validation status:

- `validated`: parent-relative evidence supports the claimed effect;
- `mixed`: available results disagree or reveal trade-offs;
- `failed`: the structural attempt did not achieve its target;
- `unverified`: code exists but no adequate result is available.

An effect record should identify the parent/baseline comparison, experiment
conditions, metrics or qualitative observations, artifacts and source
revision. Unit tests establish implementation correctness, not research
effectiveness.

The UI may show unverified or failed branches, but must not label them as
effective. A merge accepts the node record and its status; it does not convert
missing evidence into validation.

## Retrospective model workflow

When no human-authored Feature record exists, a model may reconstruct a
proposal by:

1. establishing the parent architecture;
2. classifying commits as structural or supporting work;
3. clustering related structural diffs into one mechanism;
4. locating the implementation code at immutable revisions;
5. associating runs, logs, reports and artifacts;
6. comparing results with the parent Feature;
7. recording confidence and unresolved gaps.

The model must not infer effectiveness from commit messages, code existence or
training completion alone. Its output remains a proposal until reviewed and
merged.
