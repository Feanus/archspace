#!/usr/bin/env python3
"""Build the reviewed Concept OLMo candidate Feature bundle deterministically."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


REPOSITORY = "https://github.com/Liu-yuliang/concept_olmo"
HEAD = "6ae216283d88f8db0cb35e18c818018617b50f65"
INITIAL = "a489526d1dff4161a60dccc5034c2d595f059d49"
FIELDS = (
    "id", "record_type", "title", "category", "kind", "parent_id", "status", "summary",
    "hypothesis", "design", "baseline", "delta", "implementation", "experiments",
    "analysis", "evidence", "depends_on", "related_to",
)


def commit_url(revision: str) -> str:
    return f"{REPOSITORY}/commit/{revision}"


def blob_url(revision: str, path: str) -> str:
    return f"{REPOSITORY}/blob/{revision}/{path}"


def primary_locator(
    revision: str,
    path: str,
    symbol: str,
    role: str,
    *,
    parameter: str | None = None,
) -> dict[str, Any]:
    return {
        "repository": REPOSITORY,
        "revision": revision,
        "path": path,
        "symbol": symbol,
        "parameter": parameter,
        "role": role,
        "url": blob_url(revision, path),
    }


def evidence(evidence_id: str, kind: str, locator: str, revision: str, summary: str) -> dict[str, Any]:
    return {"id": evidence_id, "type": kind, "locator": locator, "revision": revision, "summary": summary}


def implementation_ref(ref_id: str, locator: str, summary: str, evidence_ids: list[str]) -> dict[str, Any]:
    return {"id": ref_id, "locator": locator, "summary": summary, "evidence_ids": evidence_ids}


def operation(target: str, before: Any, after: Any, rationale: str, evidence_ids: list[str]) -> dict[str, Any]:
    return {"target": target, "before": before, "after": after, "rationale": rationale, "evidence_ids": evidence_ids}


def review(
    category: str,
    validation_status: str,
    primary_locators: list[dict[str, Any]],
    *,
    comparison: str,
    conditions: str,
    metrics: dict[str, Any],
    artifact_locators: list[str],
    conclusion: str,
    limitations: list[str],
    admission: str = "admitted",
    recommended_for_merge: bool = True,
    has_effect_evidence: bool = False,
) -> dict[str, Any]:
    return {
        "category": category,
        "validation_status": validation_status,
        "admission": admission,
        "recommended_for_merge": recommended_for_merge,
        "has_effect_evidence": has_effect_evidence,
        "primary_locators": primary_locators,
        "validation": {
            "comparison": comparison,
            "conditions": conditions,
            "metrics": metrics,
            "artifact_locators": artifact_locators,
            "conclusion": conclusion,
            "limitations": limitations,
        },
    }


def feature(
    *,
    feature_id: str,
    title: str,
    title_zh: str | None = None,
    parent_id: str,
    status: str,
    summary: str,
    summary_zh: str | None = None,
    hypothesis: str,
    design: str,
    operations: list[dict[str, Any]],
    commits: list[dict[str, Any]],
    code_symbols: list[dict[str, Any]],
    evidence_items: list[dict[str, Any]],
    experiments: list[dict[str, Any]] | None = None,
    outcome: str = "inconclusive",
    conclusion: str,
    limitations: list[str],
    depends_on: list[str] | None = None,
    related_to: list[str] | None = None,
) -> dict[str, Any]:
    source_ids = [item["id"] for item in evidence_items]
    record = {
        "id": feature_id,
        "record_type": "feature",
        "title": title,
        "kind": "feature",
        "parent_id": parent_id,
        "status": status,
        "summary": summary,
        "hypothesis": hypothesis,
        "design": design,
        "baseline": None,
        "delta": {"summary": summary, "operations": operations},
        "implementation": {
            "commits": commits,
            "sessions": [],
            "code_symbols": code_symbols,
            "component_changes": [],
        },
        "experiments": experiments or [],
        "analysis": {
            "outcome": outcome,
            "conclusion": conclusion,
            "limitations": limitations,
            "evidence_ids": source_ids,
        },
        "evidence": evidence_items,
        "depends_on": depends_on or [],
        "related_to": related_to or [],
        "provenance": {
            "sources": {
                "work-repo": {
                    "state": "pinned",
                    "source_ids": source_ids,
                    "note": "Derived private work-repository evidence; never root or official OLMo-3 provenance.",
                }
            },
            "fields": {field: "work-repo" for field in FIELDS},
        },
    }
    if title_zh is not None:
        record["title_zh"] = title_zh
        record["provenance"]["fields"]["title_zh"] = "work-repo"
    if summary_zh is not None:
        record["summary_zh"] = summary_zh
        record["provenance"]["fields"]["summary_zh"] = "work-repo"
    return record


def build_features() -> list[dict[str, Any]]:
    shared_snapshot_summary = (
        "The first available repository commit is an aggregated ConceptLM V2/V2.1/V2.2-VQ "
        "snapshot; it supports six independently reviewed structures without exposing separate "
        "introduction commits or ablation results."
    )
    segmented_evidence = [
        evidence("ev-segmented-snapshot", "commit", commit_url(INITIAL), INITIAL, shared_snapshot_summary),
        evidence("ev-segmented-topology-code", "code_symbol", blob_url(INITIAL, "repo/megatron/core/models/gpt/conceptlm_v2.py"), INITIAL, "ConceptLMV2Model.__init__ and forward implement the segmented encoder/chunk/HLM/fusion/decoder path."),
    ]
    hlm_predictor_evidence = [
        evidence("ev-hlm-predictor-snapshot", "commit", commit_url(INITIAL), INITIAL, shared_snapshot_summary),
        evidence("ev-hlm-predictor-code", "code_symbol", blob_url(INITIAL, "repo/megatron/core/models/gpt/conceptlm_v2.py"), INITIAL, "ConceptPredictorV2 implements the concept-rate autoregressive predictor."),
    ]
    chunk_evidence = [
        evidence("ev-chunk-snapshot", "commit", commit_url(INITIAL), INITIAL, shared_snapshot_summary),
        evidence("ev-chunk-merge-code", "code_symbol", blob_url(INITIAL, "repo/megatron/core/models/gpt/conceptlm_v2.py"), INITIAL, "ConceptLMV2Model._merge_token_chunks constructs four-token mean-pooled concept states."),
        evidence("ev-chunk-shift-code", "code_symbol", blob_url(INITIAL, "repo/megatron/core/models/gpt/conceptlm_v2.py"), INITIAL, "ConceptLMV2Model._repeat_shift_concepts implements shifted concept reinjection."),
    ]
    product_vq_evidence = [
        evidence("ev-product-vq-snapshot", "commit", commit_url(INITIAL), INITIAL, shared_snapshot_summary),
        evidence("ev-product-vq-code", "code_symbol", blob_url(INITIAL, "repo/megatron/core/models/gpt/conceptlm_v22_vq.py"), INITIAL, "ConceptLMV22VQModel implements the 32-by-128 Product-VQ path and associated losses."),
    ]
    self_dd_evidence = [
        evidence("ev-self-dd-snapshot", "commit", commit_url(INITIAL), INITIAL, shared_snapshot_summary),
        evidence("ev-self-dd-code", "code_symbol", blob_url(INITIAL, "repo/megatron/core/models/gpt/conceptlm_v21.py"), INITIAL, "V21SelfDD controls same-module history reads."),
        evidence("ev-depth-dd-code", "code_symbol", blob_url(INITIAL, "repo/megatron/core/models/gpt/conceptlm_v21.py"), INITIAL, "V21DepthDD mixes stacked previous-layer states."),
    ]
    cross_read_evidence = [
        evidence("ev-cross-read-snapshot", "commit", commit_url(INITIAL), INITIAL, shared_snapshot_summary),
        evidence("ev-cross-read-route-code", "code_symbol", blob_url(INITIAL, "repo/megatron/core/models/gpt/conceptlm_v21.py"), INITIAL, "V21ResidualFlowRouteAdd implements learned cross-module residual reads."),
        evidence("ev-cross-read-builders-code", "code_symbol", blob_url(INITIAL, "repo/megatron/core/models/gpt/conceptlm_v21.py"), INITIAL, "ConceptLMV21Model route builders expose encoder and HLM histories to later modules."),
    ]
    window_93 = "93fadb42872024a53b5d3750f8d47e44175d51da"
    window_4c = "4c5c9536d6b015ce099172e550b4f5865d23e9b3"
    window_evidence = [
        evidence("ev-concept-window-implementation", "commit", commit_url(window_93), window_93, "Adds causal sliding-window masks and backbone-window configuration to the HLM tower."),
        evidence("ev-concept-window-default", "commit", commit_url(window_4c), window_4c, "Changes the launcher/model default from full HLM attention to backbone_window."),
    ]
    fast = "c5e4a029e6018cdcdbe500c5f13dc020c9d9fa4f"
    fast_evidence = [
        evidence("ev-concept-fastpath-commit", "commit", commit_url(fast), fast, "Adds cached static decoder route plans and compiled unstacked route/self-DD paths."),
        evidence("ev-concept-fastpath-code", "code_symbol", blob_url(fast, "repo/megatron/core/models/gpt/conceptlm_v21.py"), fast, "Route dispatch plans, unstacked compiled kernels and stable named-parameter traversal."),
    ]
    reuse = "7512755321ee4238b43ad08eb3ecfbc5fe2f2e6e"
    reuse_evidence = [
        evidence("ev-concept-olmo-layer-commit", "commit", commit_url(reuse), reuse, "Replaces the custom HLM causal block with Megatron TransformerBlock using the OLMo3 layer spec."),
        evidence("ev-concept-olmo-layer-code", "code_symbol", blob_url(reuse, "repo/megatron/core/models/gpt/conceptlm_v21.py"), reuse, "ConceptPredictorV21.hlm_block and HLM rotary embedding integration."),
    ]
    cumsum_987 = "98719543fc9a3aa076a75ffd579e26d412c64141"
    cumsum_8d = "8d359faf0ae492d323edb86e704e1398af2ad7cc"
    cumsum_ab = "93e1120c73350333405e9cf89e37c21e41e72653"
    cumsum_evidence = [
        evidence("ev-concept-cumsum-core", "commit", commit_url(cumsum_987), cumsum_987, "Introduces V21SelfCumsumDD as a recurrent single-state alternative to full layer-history self-DD."),
        evidence("ev-concept-cumsum-modules", "commit", commit_url(cumsum_8d), cumsum_8d, "Applies cumsum mode across encoder, HLM and decoder DD paths with single-source exports."),
        evidence("ev-concept-cumsum-ab", "commit", commit_url(cumsum_ab), cumsum_ab, "Adds an all-DD cumsum A/B submission, but no result artifact is committed."),
    ]
    cross = "28a1ec57c9a0e5eed1eb5224b2d0883cc560a51a"
    cross_evidence = [
        evidence("ev-concept-cross-route-commit", "commit", commit_url(cross), cross, "Adds cross-module cumsum route sources between encoder, HLM concept and decoder."),
        evidence("ev-concept-cross-route-code", "code_symbol", blob_url(cross, "repo/megatron/core/models/gpt/conceptlm_v21.py"), cross, "Single-module route exports and decoder cross-read source selection."),
    ]
    stage_commits = {
        "monitor_notes": "505b06820f2e4098ea0d973e07e995375508de85",
        "grad_monitor": "2d71d3fc2aa14c071e4ff514c66426b48f7a22bd",
        "mfu_probe": "7f4d92a3b0f37f99e14b41b54a5ab7971c3f9383",
        "resume_probe": "1f85baff62a930b57427302e65f7822c0cd8b3a8",
        "rjob_hardening": "82a7c1acaf91c7bfe2fc67262ec2360656d45c57",
        "merge": "34935e7c3c36e57823683f2c9bed2136ad77070b",
        "launcher": "bb08a0f4dc32549c79b904d9ba38c38c3fea280a",
        "organization": "9f0fb4a1211304b586f2daaf8f97d8f9bc82fda7",
    }
    stage_evidence = [
        evidence("ev-concept-stage-monitor", "commit", commit_url(stage_commits["grad_monitor"]), stage_commits["grad_monitor"], "Adds optimizer-step grad/update monitoring used by short successful smoke runs."),
        evidence("ev-concept-stage-resume", "commit", commit_url(stage_commits["resume_probe"]), stage_commits["resume_probe"], "Adds a 256-GPU full-state save/resume smoke launcher."),
        evidence("ev-concept-stage-launcher", "commit", commit_url(stage_commits["launcher"]), stage_commits["launcher"], "Adds the canonical Concept OLMo Stage-1 launcher."),
        evidence("ev-concept-stage-config", "commit", commit_url(stage_commits["organization"]), stage_commits["organization"], "Separates reusable Concept configuration from compatibility and Stage-1 launchers."),
        evidence("ev-concept-stage-report", "document", blob_url(HEAD, "monitor.md"), HEAD, "Documents successful short monitoring jobs, finite sampled gradients/updates and an unrelated later CE OOM."),
    ]
    runtime_780 = "7802ff627c0abc4e1a489a34353ad8ebe7b52eea"
    runtime_211 = "2119d24b231730b12953100e1e40bc2134993a18"
    runtime_evidence = [
        evidence("ev-concept-runtime-bringup", "commit", commit_url(runtime_780), runtime_780, "Adds three-domain segmented KV cache inference and checkpoint-safe benchmarks."),
        evidence("ev-concept-runtime-batched", "commit", commit_url(runtime_211), runtime_211, "Moves decode into a GPU-only batched token loop and optimizes segmented cache updates."),
        evidence("ev-concept-runtime-results", "document", blob_url(HEAD, "repo/experiments/vllm_inference/RESULTS_2026-07-17.md"), HEAD, "Teacher-forced top-1 matches at 12/256/1024 prompt lengths; short free generation is not bitwise equivalent."),
        evidence("ev-concept-runtime-code", "code_symbol", blob_url(HEAD, "repo/experiments/vllm_inference/segmented_kv.py"), HEAD, "SegmentedConceptKV and ConceptKVCaches coordinate encoder, HLM and decoder cache domains."),
    ]
    hf = "56e4c613757570fa1090947633c4efe9245b6a89"
    hf_evidence = [
        evidence("ev-concept-hf-export-commit", "commit", commit_url(hf), hf, "Adds strict model-only Hugging Face export and its launcher."),
        evidence("ev-concept-hf-export-code", "code_symbol", blob_url(hf, "repo/experiments/vllm_inference/export_hf.py"), hf, "Exporter validates expected model keys while preserving the custom ConceptLM compatibility boundary."),
    ]
    var_commits = {
        "stability": "236bfa37b8e55a78a4b5c8d2737bf958b7760434",
        "varlen": "06002575e5db02fde4b4a67aec28f7e1e3437ffe",
        "names": "49ccae9b46d440b676fd12c8a31c2e6cb7addfca",
        "compile": "ea921d04a02c3670e9e6c5d2aa72e9678e220c68",
        "precision": "832100f5fcc2cf6f37d0700fb0d52ce4b7abc934",
        "throughput": "78cbce74c3e049d44973ab4b61ecc3a5d7287197",
    }
    var_evidence = [
        evidence("ev-concept-varlen-stability", "commit", commit_url(var_commits["stability"]), var_commits["stability"], "Adds batched decode stability gates before generalizing request lengths."),
        evidence("ev-concept-varlen-core", "commit", commit_url(var_commits["varlen"]), var_commits["varlen"], "Adds request-local variable-length state and a FlashAttention varlen batch path with Flash Decode disabled."),
        evidence("ev-concept-varlen-compile", "commit", commit_url(var_commits["compile"]), var_commits["compile"], "Avoids recompiling routes for each prompt length and adds compile-shape diagnostics."),
        evidence("ev-concept-varlen-precision", "commit", commit_url(var_commits["precision"]), var_commits["precision"], "Separates logical request lengths from precision/padded batch lengths."),
        evidence("ev-concept-varlen-throughput", "commit", commit_url(var_commits["throughput"]), var_commits["throughput"], "Adds a fixed-batch steady-state throughput benchmark."),
        evidence("ev-concept-varlen-code", "code_symbol", blob_url(HEAD, "repo/experiments/vllm_inference/segmented_kv.py"), HEAD, "VarlenConceptKVCaches and per-request route-source planning."),
    ]
    flash_commits = {
        "fix": "4dc4c2dda6db0879defb31019bc97366e20ac2ad",
        "eval": "d57481c5f4b36e1d6846e01c18dd56cc077b3c0e",
        "docs": "f17d00a49521219b210b4c18fd153915817e7196",
        "pr_merge": "9fdc384f139448aa5f915a2501d0e19aabd84372",
        "main_merge": HEAD,
    }
    flash_evidence = [
        evidence("ev-concept-flash-rope-fix", "commit", commit_url(flash_commits["fix"]), flash_commits["fix"], "Restores HLM rotary inputs in the Flash Decode path and adds diagnosis tooling."),
        evidence("ev-concept-flash-gsm8k", "commit", commit_url(flash_commits["eval"]), flash_commits["eval"], "Adds deterministic sharded Flash-on/off GSM8K evaluation."),
        evidence("ev-concept-flash-workflow", "commit", commit_url(flash_commits["docs"]), flash_commits["docs"], "Documents safe defaults and the evidence-based Flash Decode decision."),
        evidence("ev-concept-flash-pr", "commit", f"{REPOSITORY}/pull/1/commits/{flash_commits['pr_merge']}", flash_commits["pr_merge"], "PR #1 integration commit for the inference branch."),
        evidence("ev-concept-flash-main-merge", "commit", commit_url(HEAD), HEAD, "Immutable main merge revision observed for this analysis."),
        evidence("ev-concept-flash-results", "document", blob_url(HEAD, "repo/experiments/vllm_inference/README.md"), HEAD, "Reports 522/1319 vs 525/1319 strict GSM8K, 1.106x makespan speedup, but only 817/1319 identical generations."),
    ]
    branch_initial = "9125bb9dcd27c8c717cda66c1b4ccbf374b5e06b"
    branch_recipe = "e3a07a986ff7069d5ce4edd053ffe86d962f976a"
    recipe_evidence = [
        evidence("ev-olmo3-recipe-initial", "commit", commit_url(branch_initial), branch_initial, "Defines the shared 150B-token schedule, batch, optimizer and resource defaults for 1B/3B vanilla training."),
        evidence("ev-olmo3-recipe-implementation", "code_symbol", blob_url(branch_recipe, "repo/examples/public_training_bench/olmo3_vanilla/recipe.py"), branch_recipe, "build_train_config/build_launch_config/validate_config resolve training, data, resources and parallelism."),
        evidence("ev-olmo3-recipe-cli", "code_symbol", blob_url(branch_recipe, "repo/examples/public_training_bench/olmo3_vanilla/cli.py"), branch_recipe, "CLI build/dry-run/launch surface for the resolved recipe."),
    ]
    one_b_evidence = [
        evidence("ev-olmo3-oneb-initial", "commit", commit_url(branch_initial), branch_initial, "Introduces the explicit 1B model dimensions and size-specific LR/resource defaults."),
        evidence("ev-olmo3-oneb-catalog", "code_symbol", blob_url(branch_recipe, "repo/examples/public_training_bench/olmo3_vanilla/catalog.py"), branch_recipe, "OLMO3_DENSE_PRESETS['1B'] resolves 16 layers, hidden 2048, FFN 8192 and 16 attention/KV heads."),
        evidence("ev-olmo3-oneb-recipe", "code_symbol", blob_url(branch_recipe, "repo/examples/public_training_bench/olmo3_vanilla/recipe.py"), branch_recipe, "RUNTIME_DEFAULTS['1B'] resolves 32 H200s, LR 4e-4 and minimum LR 4e-5."),
    ]
    three_b_evidence = [
        evidence("ev-olmo3-threeb-initial", "commit", commit_url(branch_initial), branch_initial, "Introduces the explicit 3B model dimensions and size-specific LR/resource defaults."),
        evidence("ev-olmo3-threeb-catalog", "code_symbol", blob_url(branch_recipe, "repo/examples/public_training_bench/olmo3_vanilla/catalog.py"), branch_recipe, "OLMO3_DENSE_PRESETS['3B'] resolves 16 layers, hidden 3328, FFN 13312 and 16 attention/KV heads."),
        evidence("ev-olmo3-threeb-recipe", "code_symbol", blob_url(branch_recipe, "repo/examples/public_training_bench/olmo3_vanilla/recipe.py"), branch_recipe, "RUNTIME_DEFAULTS['3B'] resolves 64 H200s, LR 3e-4 and minimum LR 3e-5."),
    ]

    return [
        feature(
            feature_id="feat-olmo3-150b-training-recipe", title="OLMo3 150B vanilla training recipe", parent_id="feat-olmo3-standard", status="proposed",
            summary="Define a reproducible 150B-token vanilla OLMo3 training schedule, batch, optimizer, checkpoint cadence and distributed resource contract.",
            hypothesis="A shared validated recipe surface can make model-size experiments comparable by holding data, token budget and most training settings constant.",
            design="Resolve global batch 512, sequence length 8192, 35,763 steps, Adam settings, cosine decay inputs, checkpoint interval, TP/PP/CP defaults and RJob resources through a versioned recipe with build/dry-run validation.",
            operations=[operation("training.recipe", "No branch-local structured recipe for smaller vanilla OLMo3 presets", {"target_tokens": 150000893952, "global_batch_size": 512, "micro_batch_size": 1, "sequence_length": 8192, "train_iters": 35763, "optimizer": "adam", "weight_decay": 0.1, "clip_grad": 1.0, "tp_pp_cp": "1/1/1"}, "Hold the training/data/resource contract explicit so size-specific model configurations can be reviewed independently.", ["ev-olmo3-recipe-initial", "ev-olmo3-recipe-implementation"])],
            commits=[implementation_ref("olmo3-recipe-initial", commit_url(branch_initial), "Initial shared 1B/3B schedule and resource configuration.", ["ev-olmo3-recipe-initial"]), implementation_ref("olmo3-recipe-refactor", commit_url(branch_recipe), "Structured catalog/recipe/CLI with validation.", ["ev-olmo3-recipe-implementation", "ev-olmo3-recipe-cli"])],
            code_symbols=[implementation_ref("olmo3-build-train-config", blob_url(branch_recipe, "repo/examples/public_training_bench/olmo3_vanilla/recipe.py"), "build_train_config, build_launch_config and validate_config.", ["ev-olmo3-recipe-implementation"]), implementation_ref("olmo3-recipe-cli", blob_url(branch_recipe, "repo/examples/public_training_bench/olmo3_vanilla/cli.py"), "build/dry-run/launch command interface.", ["ev-olmo3-recipe-cli"])],
            evidence_items=recipe_evidence,
            conclusion="The recipe is reproducibly specified and dry-run capable, but no parent-relative training outcome is committed.", limitations=["The branch is unmerged.", "Dry-run/config validation is not training-effect evidence.", "No completed 150B run or convergence comparison is available."],
        ),
        feature(
            feature_id="feat-olmo3-1b-dense-preset", title="OLMo3 1B dense preset", parent_id="feat-olmo3-standard", status="proposed",
            summary="Define a concrete 1B-class OLMo3 model and coupled launch defaults rather than relying on the aggregate size label.",
            hypothesis="A 16-layer, hidden-2048 OLMo3 configuration can provide a lower-cost vanilla baseline under the shared 150B recipe.",
            design="Set 16 layers, hidden 2048, FFN 8192, 16 query/KV heads, head dimension 128, untied embeddings, LR 4e-4 and 32 H200s while retaining the OLMo3 attention/RoPE/RMSNorm contract.",
            operations=[operation("model_and_launch_configuration.olmo3_1b", {"reference_work_launcher": "7B", "layers": 32, "hidden": 4096, "ffn": 11008, "heads": 32, "default_lr": "3e-4"}, {"layers": 16, "hidden": 2048, "ffn": 8192, "query_heads": 16, "kv_heads": 16, "head_dim": 128, "default_lr": "4e-4", "default_h200s": 32}, "Expose the actual model/training diff behind the 1B label.", ["ev-olmo3-oneb-catalog", "ev-olmo3-oneb-recipe"])],
            commits=[implementation_ref("olmo3-oneb-preset", commit_url(branch_initial), "Initial 1B dimensions and runtime defaults.", ["ev-olmo3-oneb-initial"]), implementation_ref("olmo3-oneb-catalog-recipe", commit_url(branch_recipe), "Structured preset and validated recipe consumption.", ["ev-olmo3-oneb-catalog", "ev-olmo3-oneb-recipe"])],
            code_symbols=[implementation_ref("olmo3-oneb-catalog", blob_url(branch_recipe, "repo/examples/public_training_bench/olmo3_vanilla/catalog.py"), "OLMO3_DENSE_PRESETS['1B'].", ["ev-olmo3-oneb-catalog"]), implementation_ref("olmo3-oneb-runtime-defaults", blob_url(branch_recipe, "repo/examples/public_training_bench/olmo3_vanilla/recipe.py"), "RUNTIME_DEFAULTS['1B'].", ["ev-olmo3-oneb-recipe"])],
            evidence_items=one_b_evidence,
            conclusion="The configuration diff and consumption path are explicit; no training result validates quality, stability or cost targets.", limitations=["The branch is unmerged.", "No 1B training run, checkpoint, loss curve or parent-relative effect artifact is available."],
            depends_on=["feat-olmo3-150b-training-recipe"], related_to=["feat-olmo3-3b-dense-preset"],
        ),
        feature(
            feature_id="feat-olmo3-3b-dense-preset", title="OLMo3 3B dense preset", parent_id="feat-olmo3-standard", status="proposed",
            summary="Define a concrete 3B-class OLMo3 model and coupled launch defaults rather than relying on the aggregate size label.",
            hypothesis="A 16-layer, hidden-3328 OLMo3 configuration can provide an intermediate vanilla baseline under the shared 150B recipe.",
            design="Set 16 layers, hidden 3328, FFN 13312, 16 query/KV heads, head dimension 208, untied embeddings, LR 3e-4 and 64 H200s while retaining the OLMo3 attention/RoPE/RMSNorm contract.",
            operations=[operation("model_and_launch_configuration.olmo3_3b", {"reference_work_launcher": "7B", "layers": 32, "hidden": 4096, "ffn": 11008, "heads": 32, "default_h200s": 8}, {"layers": 16, "hidden": 3328, "ffn": 13312, "query_heads": 16, "kv_heads": 16, "head_dim": 208, "default_lr": "3e-4", "default_h200s": 64}, "Expose the actual model/training diff behind the 3B label.", ["ev-olmo3-threeb-catalog", "ev-olmo3-threeb-recipe"])],
            commits=[implementation_ref("olmo3-threeb-preset", commit_url(branch_initial), "Initial 3B dimensions and runtime defaults.", ["ev-olmo3-threeb-initial"]), implementation_ref("olmo3-threeb-catalog-recipe", commit_url(branch_recipe), "Structured preset and validated recipe consumption.", ["ev-olmo3-threeb-catalog", "ev-olmo3-threeb-recipe"])],
            code_symbols=[implementation_ref("olmo3-threeb-catalog", blob_url(branch_recipe, "repo/examples/public_training_bench/olmo3_vanilla/catalog.py"), "OLMO3_DENSE_PRESETS['3B'].", ["ev-olmo3-threeb-catalog"]), implementation_ref("olmo3-threeb-runtime-defaults", blob_url(branch_recipe, "repo/examples/public_training_bench/olmo3_vanilla/recipe.py"), "RUNTIME_DEFAULTS['3B'].", ["ev-olmo3-threeb-recipe"])],
            evidence_items=three_b_evidence,
            conclusion="The configuration diff and consumption path are explicit; no training result validates quality, stability or cost targets.", limitations=["The branch is unmerged.", "No 3B training run, checkpoint, loss curve or parent-relative effect artifact is available."],
            depends_on=["feat-olmo3-150b-training-recipe"], related_to=["feat-olmo3-1b-dense-preset"],
        ),
        feature(
            feature_id="feat-concept-segmented-topology", title="Segmented encoder–chunk–HLM–fusion–decoder topology", title_zh="分段拓扑骨架", parent_id="feat-olmo3-standard", status="validating",
            summary="Split the standard token Transformer into encoder, chunk compression, HLM concept prediction, fusion and decoder stages.",
            summary_zh="将标准 OLMo3 的单流 token Transformer 改为 token encoder → chunk 压缩 → HLM concept 预测 → concept fusion → token decoder 五段管道，并引入低频概念流。",
            hypothesis="A lower-rate concept stream can augment token modeling when the model exposes explicit encode, concept-predict, fuse and decode stages.",
            design="Define the five-stage information-flow skeleton without absorbing the independently switchable concept representation, quantizer or residual-read routes into this node.",
            operations=[operation("model.forward_topology", "single-stream token Transformer stack", "token encoder -> chunk compression -> HLM concept prediction -> concept fusion -> token decoder", "Define the primary segmented topology while leaving representation and routing choices independently reviewable.", ["ev-segmented-topology-code"])],
            commits=[implementation_ref("initial-logic-snapshot", commit_url(INITIAL), "Shared aggregated history starting point; not a unique introduction commit for this Feature.", ["ev-segmented-snapshot"])],
            code_symbols=[implementation_ref("conceptlm-v2-forward", blob_url(INITIAL, "repo/megatron/core/models/gpt/conceptlm_v2.py"), "ConceptLMV2Model.__init__ and ConceptLMV2Model.forward implement the five-stage path.", ["ev-segmented-topology-code"])],
            evidence_items=segmented_evidence,
            conclusion="The segmented topology is directly visible in code, but its isolated model-quality effect is unverified.", limitations=["No isolated parent-relative ablation artifact is available.", "The initial commit is shared with five other reviewed base mechanisms."],
        ),
        feature(
            feature_id="feat-concept-hlm-predictor", title="HLM concept predictor", title_zh="HLM concept 预测模块", parent_id="feat-concept-segmented-topology", status="validating",
            summary="Add a concept-rate autoregressive Transformer that predicts the next concept vector.", summary_zh="在概念流中加入负责预测下一个 concept 的小型自回归 Transformer；其序列单元是 concept 向量，序列长度约为 token 流的四分之一。",
            hypothesis="Autoregressive prediction over the lower-rate concept sequence can provide useful high-level supervision and states for token decoding.",
            design="Instantiate ConceptPredictorV2 over concept states with its own causal layers, normalization and prediction heads; attention-window and layer-implementation variants evolve beneath this node.",
            operations=[operation("concept.hlm.module", "no concept-rate autoregressive predictor", "ConceptPredictorV2 HLM tower with causal layers, final norm and prediction heads", "The HLM is independently configurable and is the semantic parent of D07 and D08.", ["ev-hlm-predictor-code"])],
            commits=[implementation_ref("initial-logic-snapshot", commit_url(INITIAL), "Shared aggregated history starting point; not a unique introduction commit for this Feature.", ["ev-hlm-predictor-snapshot"])],
            code_symbols=[implementation_ref("concept-predictor-v2", blob_url(INITIAL, "repo/megatron/core/models/gpt/conceptlm_v2.py"), "ConceptPredictorV2 implements the concept-rate autoregressive HLM tower.", ["ev-hlm-predictor-code"])],
            evidence_items=hlm_predictor_evidence,
            conclusion="The HLM module is implemented, but no isolated ablation establishes its effect.", limitations=["No isolated parent-relative ablation artifact is available.", "The initial commit is shared with five other reviewed base mechanisms."],
        ),
        feature(
            feature_id="feat-concept-hlm-backbone-window", title="HLM backbone-window attention", title_zh="HLM 注意力继承骨干窗口节奏", parent_id="feat-concept-hlm-predictor", status="implementing",
            summary="Make the chunk-rate HLM tower follow the backbone sliding/full attention schedule instead of always using full causal attention.", summary_zh="将 HLM 内部注意力从每层全因果改为继承 OLMo3 骨干的 local/global 交替节奏，包括 window_size 与 window_attn_skip_freq。",
            hypothesis="The HLM tower can reduce attention cost and align its inductive bias by inheriting the backbone window cadence.",
            design="Add per-layer sliding-window causal bias support and a full/backbone_window mode, then make backbone_window the default.",
            operations=[operation("concept.hlm.attention_pattern", "full causal attention", "inherit backbone window_size and window_attn_skip_freq", "Retain an independently switchable full-attention alternative.", ["ev-concept-window-implementation", "ev-concept-window-default"])],
            commits=[implementation_ref("hlm-window-mode", commit_url(window_93), "Window-aware HLM implementation.", ["ev-concept-window-implementation"]), implementation_ref("hlm-window-default", commit_url(window_4c), "Default selection change.", ["ev-concept-window-default"])],
            code_symbols=[implementation_ref("concept-causal-window", blob_url(window_93, "repo/megatron/core/models/gpt/conceptlm_v2.py"), "ConceptCausalBlock._sliding_window_causal_bias and layer scheduling.", ["ev-concept-window-implementation"])],
            evidence_items=window_evidence,
            conclusion="The code and default are pinned, but no isolated quality or throughput result is committed.", limitations=["No A/B result establishes the effect of HLM windowing.", "The concept-window to token receptive-field mapping needs algorithm-owner confirmation."], related_to=["feat-concept-hlm-olmo3-layer-reuse"],
        ),
        feature(
            feature_id="feat-concept-hlm-olmo3-layer-reuse", title="OLMo3 TransformerBlock reuse in HLM", title_zh="HLM 层实现换成 OLMo3 标准 TransformerBlock", parent_id="feat-concept-hlm-predictor", status="implementing",
            summary="Run HLM layers through the configured OLMo3 TransformerBlock instead of a separate custom causal block.", summary_zh="将 HLM 每层从自定义 ConceptCausalBlock 替换为 OLMo3 layer spec 的标准 TransformerBlock，并统一 final norm；若确认结构语义与数值等价，应降级为 HLM 节点的实现 evidence。",
            hypothesis="Sharing the backbone layer implementation may improve alignment, but it is a Feature only if the replacement changes structural semantics or numerical behavior.",
            design="Clone the transformer config for HLM depth, instantiate TransformerBlock with the OLMo3 layer spec and forward HLM RoPE explicitly; retain this as a conditional proposal pending equivalence review.",
            operations=[operation("concept.hlm.layer_implementation", "custom ConceptCausalBlock list with standalone LayerNorm", "TransformerBlock using the configured OLMo3 layer spec and final norm", "Record the replacement while preserving the explicit downgrade-to-evidence condition.", ["ev-concept-olmo-layer-commit", "ev-concept-olmo-layer-code"])],
            commits=[implementation_ref("olmo3-layer-reuse", commit_url(reuse), "HLM TransformerBlock reuse.", ["ev-concept-olmo-layer-commit"])],
            code_symbols=[implementation_ref("concept-predictor-hlm-block", blob_url(reuse, "repo/megatron/core/models/gpt/conceptlm_v21.py"), "ConceptPredictorV21.hlm_block and rotary forwarding.", ["ev-concept-olmo-layer-code"])],
            evidence_items=reuse_evidence,
            conclusion="The implementation replacement is clear; whether it is a structural Feature or semantically equivalent implementation evidence is unresolved.", limitations=["No numerical parity or training A/B artifact.", "Downgrade to D04b implementation evidence if algorithm review confirms structural and numerical equivalence."], related_to=["feat-concept-hlm-backbone-window"],
        ),
        feature(
            feature_id="feat-concept-chunk-representation", title="Chunk-level concept representation", title_zh="Chunk 级 concept 表示", parent_id="feat-olmo3-standard", status="validating",
            summary="Construct one continuous concept vector from each four-token chunk, using mean pooling and shifted reinjection semantics.", summary_zh="每 4 个连续 token 的隐状态经 mean pooling 形成一个连续 concept 向量，并通过 shift feature 控制其回注时序；chunk size、pooling 方式与 shift 均保留在本节点内。",
            hypothesis="A lower-rate continuous representation can summarize local token groups while keeping the model well-defined without quantization.",
            design="Group token states into four-token chunks, mean-pool each chunk and shift/repeat concept states for fusion; these parameters do not become child Features.",
            operations=[operation("model.concept_representation", "no chunk-rate concept representation", {"chunk_size": 4, "pooling": "meanpooling", "shift_feature": True, "representation": "continuous concept vector"}, "The representation is independently removable; its parameter choices remain inside one Feature.", ["ev-chunk-merge-code", "ev-chunk-shift-code"])],
            commits=[implementation_ref("initial-logic-snapshot", commit_url(INITIAL), "Shared aggregated history starting point; not a unique introduction commit for this Feature.", ["ev-chunk-snapshot"])],
            code_symbols=[implementation_ref("merge-token-chunks", blob_url(INITIAL, "repo/megatron/core/models/gpt/conceptlm_v2.py"), "ConceptLMV2Model._merge_token_chunks constructs chunk-level concept states.", ["ev-chunk-merge-code"]), implementation_ref("repeat-shift-concepts", blob_url(INITIAL, "repo/megatron/core/models/gpt/conceptlm_v2.py"), "ConceptLMV2Model._repeat_shift_concepts implements shifted concept reinjection.", ["ev-chunk-shift-code"])],
            evidence_items=chunk_evidence,
            conclusion="The continuous chunk representation is implemented; its isolated effect and exact shift semantics remain unverified.", limitations=["No isolated parent-relative ablation artifact is available.", "The initial commit is shared with five other reviewed base mechanisms."], related_to=["feat-concept-segmented-topology"],
        ),
        feature(
            feature_id="feat-concept-product-vq", title="Product-VQ concept discretization", title_zh="Product VQ 离散化", parent_id="feat-concept-chunk-representation", status="validating",
            summary="Discretize continuous chunk concepts with product vector quantization using 32 codebooks of 128 entries.", summary_zh="在连续 concept 向量上叠加 Product VQ：向量切分为 32 段，每段在 128 词条码本中选择码字；码本数量和大小作为节点内参数。",
            hypothesis="A discrete compositional concept bottleneck can improve high-level modeling while allowing VQ removal to recover the continuous representation.",
            design="Normalize each concept, quantize it through 32 codebooks with 128 entries each and train the HLM against the quantized path; codebook parameters stay within this Feature.",
            operations=[operation("model.concept_quantization", "continuous chunk concept vectors without VQ", {"method": "product vector quantization", "codebooks": 32, "codebook_size": 128}, "VQ is an optional structural layer whose removal returns the continuous parent state.", ["ev-product-vq-code"])],
            commits=[implementation_ref("initial-logic-snapshot", commit_url(INITIAL), "Shared aggregated history starting point; not a unique introduction commit for this Feature.", ["ev-product-vq-snapshot"])],
            code_symbols=[implementation_ref("conceptlm-v22-vq", blob_url(INITIAL, "repo/megatron/core/models/gpt/conceptlm_v22_vq.py"), "ConceptLMV22VQModel.__init__ and the VQ concept branch implement Product VQ and its losses.", ["ev-product-vq-code"])],
            evidence_items=product_vq_evidence,
            conclusion="Product VQ is independently identifiable, but no VQ-versus-continuous ablation result is committed.", limitations=["No isolated parent-relative ablation artifact is available.", "The initial commit is shared with five other reviewed base mechanisms."],
        ),
        feature(
            feature_id="feat-concept-self-dd", title="Self-DD intra-module cross-layer reads", title_zh="Self-DD：模块内跨层读取", parent_id="feat-olmo3-standard", status="validating",
            summary="Let layers inside a module read earlier layer outputs in addition to the immediately preceding state.", summary_zh="在模块内部加入跨层读取：每层除接收上一层输出外，还可读取此前所有层输出；初始实现保存并堆叠完整层历史。",
            hypothesis="Learned access to earlier layer states can improve information reuse beyond a strictly sequential residual stack.",
            design="Use V21SelfDD and V21DepthDD to select and mix same-module history states independently of cross-module residual routes.",
            operations=[operation("concept.self_dd", "each layer consumes only the immediately preceding hidden state", "V21SelfDD/V21DepthDD read and mix stacked earlier outputs within the same module", "Same-module history reads are independently switchable and are the direct parent of D09.", ["ev-self-dd-code", "ev-depth-dd-code"])],
            commits=[implementation_ref("initial-logic-snapshot", commit_url(INITIAL), "Shared aggregated history starting point; not a unique introduction commit for this Feature.", ["ev-self-dd-snapshot"])],
            code_symbols=[implementation_ref("v21-self-dd", blob_url(INITIAL, "repo/megatron/core/models/gpt/conceptlm_v21.py"), "V21SelfDD controls same-module history reads.", ["ev-self-dd-code"]), implementation_ref("v21-depth-dd", blob_url(INITIAL, "repo/megatron/core/models/gpt/conceptlm_v21.py"), "V21DepthDD mixes stacked previous-layer states.", ["ev-depth-dd-code"])],
            evidence_items=self_dd_evidence,
            conclusion="Self-DD is independently configured in code, but its isolated effect and the exact expansion of DD require algorithm-owner confirmation.", limitations=["No isolated parent-relative ablation artifact is available.", "The initial commit is shared with five other reviewed base mechanisms."], related_to=["feat-concept-segmented-topology"],
        ),
        feature(
            feature_id="feat-concept-cumsum-self-dd", title="Cumsum self-DD state", title_zh="Self-DD 累积式改写", parent_id="feat-concept-self-dd", status="validating",
            summary="Replace full same-module layer-history self-DD with a recurrent cumsum state across encoder, HLM and decoder paths.", summary_zh="将模块内 Self-DD 状态从堆叠全部前层输出改为归一化递归 cumsum 与每层可学习混合，使状态存储不再随层数线性增长。",
            hypothesis="A single accumulated state can retain depth context with lower history storage and simpler route shapes.",
            design="Introduce V21SelfCumsumDD, preserve initialization ordering and switch same-module DD paths to cumsum mode by configuration.",
            operations=[operation("concept.self_dd.state", "list/stack of previous layer outputs", "normalized recurrent cumsum state with learned per-layer mixing", "Change the mathematical state and memory shape while preserving D06a as the direct baseline.", ["ev-concept-cumsum-core", "ev-concept-cumsum-modules"])],
            commits=[implementation_ref("cumsum-self-dd", commit_url(cumsum_987), "Core cumsum state implementation.", ["ev-concept-cumsum-core"]), implementation_ref("cumsum-all-modules", commit_url(cumsum_8d), "Encoder/HLM/decoder integration.", ["ev-concept-cumsum-modules"])],
            code_symbols=[implementation_ref("v21-self-cumsum-dd", blob_url(cumsum_987, "repo/megatron/core/models/gpt/conceptlm_v21.py"), "V21SelfCumsumDD recurrent state module.", ["ev-concept-cumsum-core"])],
            evidence_items=cumsum_evidence,
            experiments=[{"id": "all-dd-cumsum-ab", "title": "All-DD cumsum A/B submission", "status": "planned", "summary": "A submission recipe exists, but no result artifact is committed.", "metrics": {}, "evidence_ids": ["ev-concept-cumsum-ab"]}],
            conclusion="Implementation and A/B intent are pinned; performance and model-quality conclusions remain unresolved.", limitations=["The A/B commit contains a launcher but no result or log artifact."], related_to=["feat-concept-cross-module-cumsum-routes"],
        ),
        feature(
            feature_id="feat-concept-cross-module-residual-read", title="Cross-module residual-read routes", title_zh="跨模块 residual-read 路由", parent_id="feat-olmo3-standard", status="validating",
            summary="Add routes that let HLM read encoder intermediates and decoder layers read encoder or HLM intermediates.", summary_zh="加入模块间信息通路：HLM 可读取 encoder 的中间表示，decoder 可读取 encoder 与 HLM 的中间表示；初始 source 为来源模块的逐层历史。",
            hypothesis="Later modules can benefit from direct learned access to intermediate states produced by earlier modules.",
            design="Expose encoder and concept/HLM histories as route sources and mix them through V21ResidualFlowRouteAdd with independent route-builder switches.",
            operations=[operation("concept.cross_module_routes", "no learned reads of intermediate states across encoder, HLM and decoder modules", "HLM reads encoder histories; decoder reads encoder and HLM histories through residual routes", "Cross-module reads are independently switchable from Self-DD and are the direct parent of D10.", ["ev-cross-read-route-code", "ev-cross-read-builders-code"])],
            commits=[implementation_ref("initial-logic-snapshot", commit_url(INITIAL), "Shared aggregated history starting point; not a unique introduction commit for this Feature.", ["ev-cross-read-snapshot"])],
            code_symbols=[implementation_ref("residual-flow-route-add", blob_url(INITIAL, "repo/megatron/core/models/gpt/conceptlm_v21.py"), "V21ResidualFlowRouteAdd implements learned cross-module reads.", ["ev-cross-read-route-code"]), implementation_ref("cross-module-route-builders", blob_url(INITIAL, "repo/megatron/core/models/gpt/conceptlm_v21.py"), "ConceptLMV21Model._build_encoder_concept_states, _build_decoder_encoder_states and _build_decoder_concept_states expose route sources.", ["ev-cross-read-builders-code"])],
            evidence_items=cross_read_evidence,
            conclusion="Cross-module residual-read routes are explicit and independently configurable, but their isolated effect is unverified.", limitations=["No isolated parent-relative ablation artifact is available.", "The initial commit is shared with five other reviewed base mechanisms."], related_to=["feat-concept-segmented-topology", "feat-concept-self-dd"],
        ),
        feature(
            feature_id="feat-concept-cross-module-cumsum-routes", title="Cross-module cumsum routes", title_zh="跨模块路由累积式改写", parent_id="feat-concept-cross-module-residual-read", status="implementing",
            summary="Expose cumsum states as single-source encoder/HLM/decoder route inputs instead of retaining multi-layer source histories.", summary_zh="将跨模块 residual-read 的 source 从来源模块逐层历史改为每个模块对外提供一个 cumsum 累积状态；它与 Self-DD 的累积式改写作用对象不同，可独立消融。",
            hypothesis="Cross-module residual reads can retain useful information while using one stable accumulated source per module.",
            design="Add module route exports and update concept-read-encoder, decoder-read-encoder and decoder-read-concept source selection independently of same-module cumsum state.",
            operations=[operation("concept.cross_module_routes.sources", "per-layer encoder/concept histories", "one cumsum route export per module", "D10 changes cross-module source semantics and therefore builds only on D06b.", ["ev-concept-cross-route-commit", "ev-concept-cross-route-code"])],
            commits=[implementation_ref("cross-module-cumsum-routes", commit_url(cross), "Cross-module source export integration.", ["ev-concept-cross-route-commit"])],
            code_symbols=[implementation_ref("module-route-export", blob_url(cross, "repo/megatron/core/models/gpt/conceptlm_v21.py"), "ConceptLMV21Model route-source builders and decoder source selection.", ["ev-concept-cross-route-code"])],
            evidence_items=cross_evidence,
            conclusion="The source-count and routing changes are explicit; no committed A/B outcome establishes their effect.", limitations=["The associated A/B launcher is evidence of intended validation, not a successful result."], related_to=["feat-concept-cumsum-self-dd"],
        ),
        feature(
            feature_id="feat-concept-stage1-scale-resume", title="Canonical Stage-1 scale and resume workflow", parent_id="feat-concept-cross-module-cumsum-routes", status="validating",
            summary="Package the Concept configuration into a canonical large-scale Stage-1 launcher with full-state save/resume probes and independent training health monitoring.",
            hypothesis="A reproducible launcher, checkpoint policy and health signals are required before the architecture can be treated as a trainable model state.",
            design="Separate reusable model config from launch wrappers, define a 256-GPU Stage-1 entrypoint, add MFU/save-resume probes and capture route/VQ/rank/grad-update health independently of checkpoint cadence.",
            operations=[
                operation("training.entrypoint", "ad-hoc public bench and A/B submission scripts", "canonical Stage-1 launcher sourcing one reusable Concept config", "Make the intended scale-up state explicit and reproducible.", ["ev-concept-stage-launcher", "ev-concept-stage-config"]),
                operation("training.recovery_and_health", "no dedicated full-state probe or Concept grad/update records", "full-state save/resume smoke plus route/VQ/rank/grad-update monitoring", "Detect inactive paths and verify recovery mechanics before long training.", ["ev-concept-stage-resume", "ev-concept-stage-monitor", "ev-concept-stage-report"]),
            ],
            commits=[
                implementation_ref("stage-grad-monitor", commit_url(stage_commits["grad_monitor"]), "Optimizer-step monitoring support.", ["ev-concept-stage-monitor"]),
                implementation_ref("stage-resume-probe", commit_url(stage_commits["resume_probe"]), "Full-state save/resume smoke launcher.", ["ev-concept-stage-resume"]),
                implementation_ref("stage-canonical-launcher", commit_url(stage_commits["launcher"]), "Canonical Stage-1 entrypoint.", ["ev-concept-stage-launcher"]),
                implementation_ref("stage-config-separation", commit_url(stage_commits["organization"]), "Reusable config and thin compatibility launcher.", ["ev-concept-stage-config"]),
            ],
            code_symbols=[implementation_ref("stage1-launcher", blob_url(HEAD, "full_train_dd_diag_256g_0611/scripts/pretrain_concept_olmo_stage_1.sh"), "Canonical Stage-1 resource/checkpoint launcher.", ["ev-concept-stage-launcher"])],
            evidence_items=stage_evidence,
            experiments=[{"id": "stage-monitor-smoke", "title": "Short Concept training health smokes", "status": "passed", "summary": "Committed report records successful short monitoring jobs with finite sampled gradients and updates; it is not a full Stage-1 completion.", "metrics": {"sampled_grad_nan_count": 0, "sampled_update_nan_count": 0}, "evidence_ids": ["ev-concept-stage-report"]}, {"id": "stage-full-training", "title": "Full Stage-1 training outcome", "status": "inconclusive", "summary": "The launcher and recovery workflow exist, but no complete training outcome is committed.", "metrics": {}, "evidence_ids": ["ev-concept-stage-launcher"]}],
            conclusion="Short operational smokes support the workflow, but full Stage-1 convergence and checkpoint content remain unresolved.", limitations=["The recorded successful jobs are short monitoring/probe runs, not the complete 256-GPU Stage-1 run.", "Checkpoint references are internal paths without content-addressed model hashes."],
        ),
        feature(
            feature_id="feat-concept-segmented-inference-runtime", title="Segmented Concept inference runtime", parent_id="feat-concept-cross-module-cumsum-routes", status="validating",
            summary="Add a checkpoint-safe custom inference runtime with separate encoder, HLM and decoder cache domains and a GPU-only batched decode loop.",
            hypothesis="ConceptLM can decode incrementally only if token and chunk-rate state are cached according to its segmented topology rather than stock OLMo assumptions.",
            design="Load the original Megatron checkpoint strictly, maintain three coordinated cache domains, refresh HLM state at chunk boundaries and expose a batched GPU-only inferencer API.",
            operations=[operation("inference.runtime", "training-only full-prefix Concept forward; stock runtime incompatible", "custom SegmentedConceptKV plus GPU-only batched token decode", "Respect encoder/HLM/decoder state boundaries without mutating the source checkpoint.", ["ev-concept-runtime-bringup", "ev-concept-runtime-batched", "ev-concept-runtime-code"])],
            commits=[implementation_ref("inference-bringup", commit_url(runtime_780), "Segmented cache prototype and benchmark harness.", ["ev-concept-runtime-bringup"]), implementation_ref("inference-batched-decode", commit_url(runtime_211), "GPU-only batched decode optimization.", ["ev-concept-runtime-batched"])],
            code_symbols=[implementation_ref("segmented-concept-kv", blob_url(HEAD, "repo/experiments/vllm_inference/segmented_kv.py"), "SegmentedConceptKV and cache-domain state.", ["ev-concept-runtime-code"])],
            evidence_items=runtime_evidence,
            experiments=[{"id": "segmented-kv-reference", "title": "Teacher-forced segmented-KV reference", "status": "passed", "summary": "Top-1 matched at all 32 checked positions for 12-, 256- and 1024-token prompts while the checkpoint metadata remained unchanged.", "metrics": {"prompt_lengths": "12,256,1024", "checked_positions_each": 32, "checkpoint_mutated": False, "decode_speedup_1024": "1.075x"}, "evidence_ids": ["ev-concept-runtime-results"]}],
            conclusion="The custom runtime is operational and checkpoint-safe, but free generation is not bitwise equivalent for every prompt.", limitations=["A short-prompt free run diverged after numerical differences accumulated.", "Stock vLLM serving remains unsupported."],
            depends_on=["feat-concept-chunk-representation", "feat-concept-self-dd", "feat-concept-cross-module-residual-read"], related_to=["feat-concept-stage1-scale-resume"],
        ),
        feature(
            feature_id="feat-concept-strict-hf-export", title="Strict model-only HF export", parent_id="feat-concept-cross-module-cumsum-routes", status="validating",
            summary="Export the custom ConceptLM model weights and configuration into a strict Hugging Face artifact without pretending it is a stock OLMo model.",
            hypothesis="A model-only artifact can support downstream tooling if custom architecture identity and key validation remain explicit.",
            design="Map the Megatron distributed checkpoint into custom ConceptLM HF keys, reject unexpected/missing model state and keep runtime compatibility probes separate.",
            operations=[operation("inference.artifact_export", None, "strict custom ConceptLM Hugging Face model-only export", "Provide a portable artifact while preserving the non-stock compatibility boundary.", ["ev-concept-hf-export-commit", "ev-concept-hf-export-code"])],
            commits=[implementation_ref("strict-hf-export", commit_url(hf), "Strict exporter and launcher.", ["ev-concept-hf-export-commit"])],
            code_symbols=[implementation_ref("export-hf", blob_url(hf, "repo/experiments/vllm_inference/export_hf.py"), "Strict custom model export implementation.", ["ev-concept-hf-export-code"])],
            evidence_items=hf_evidence,
            conclusion="The exporter implementation is pinned, but no public artifact digest or independent reload report is available.", limitations=["The exported model artifact itself is not available by content hash.", "The artifact does not make stock vLLM compatible with ConceptLM."],
            related_to=["feat-concept-segmented-inference-runtime", "feat-concept-stage1-scale-resume"],
        ),
        feature(
            feature_id="feat-concept-variable-length-batching", title="Variable-length compiled batching", parent_id="feat-concept-segmented-inference-runtime", status="validating",
            summary="Generalize the segmented runtime from fixed/equal-length batches to request-local variable lengths with stable route compilation and throughput gates.",
            hypothesis="Separating logical request lengths from padded precision shapes can enable true batching without recompiling routes per prompt length.",
            design="Add request-local varlen cache state, FlashAttention varlen prefill with Flash Decode disabled, dynamic route compile reuse, explicit precision lengths and fixed-batch throughput benchmarks.",
            operations=[operation("inference.batch_shape", "fixed or equal-length batch cache contract", "request-local variable lengths with shared dense token caches and stable compiled route plans", "Support heterogeneous prompts while containing shape-driven recompilation and preserving route semantics.", ["ev-concept-varlen-core", "ev-concept-varlen-compile", "ev-concept-varlen-precision"])],
            commits=[
                implementation_ref("varlen-stability-gates", commit_url(var_commits["stability"]), "Pre-varlen batch stability gates.", ["ev-concept-varlen-stability"]),
                implementation_ref("true-varlen-batching", commit_url(var_commits["varlen"]), "Request-local variable-length implementation.", ["ev-concept-varlen-core"]),
                implementation_ref("route-compile-shapes", commit_url(var_commits["compile"]), "Prompt-length compile reuse.", ["ev-concept-varlen-compile"]),
                implementation_ref("precision-lengths", commit_url(var_commits["precision"]), "Logical versus padded length separation.", ["ev-concept-varlen-precision"]),
                implementation_ref("fixed-batch-benchmark", commit_url(var_commits["throughput"]), "Steady-state throughput gate.", ["ev-concept-varlen-throughput"]),
            ],
            code_symbols=[implementation_ref("varlen-cache-runtime", blob_url(HEAD, "repo/experiments/vllm_inference/segmented_kv.py"), "VarlenConceptKVCaches and per-request route plans.", ["ev-concept-varlen-code"])],
            evidence_items=var_evidence,
            experiments=[{"id": "varlen-runtime-smoke", "title": "Variable-length runtime smoke", "status": "passed", "summary": "PR validation reports the true varlen path and inferencer API completing with checkpoint mutation disabled.", "metrics": {"checkpoint_mutated": False, "flash_decode": False}, "evidence_ids": ["ev-concept-varlen-core", "ev-concept-varlen-throughput"]}],
            conclusion="The variable-length path is implemented and smoke-validated under its safe contract; broad workload equivalence is not established.", limitations=["Flash Decode is intentionally excluded from random varlen batching.", "The committed evidence does not provide a full matrix of batch-size/length numerical parity."],
            depends_on=["feat-concept-chunk-representation", "feat-concept-self-dd", "feat-concept-cross-module-residual-read"], related_to=["feat-concept-strict-hf-export"],
        ),
        feature(
            feature_id="feat-concept-flash-decode-evaluation", title="Flash Decode repair and evaluation", parent_id="feat-concept-segmented-inference-runtime", status="analyzed",
            summary="Repair missing HLM rotary inputs in Flash Decode, then evaluate speed, task accuracy and numerical/generation drift with deterministic sharded GSM8K.",
            hypothesis="Flash Decode may improve throughput after the HLM RoPE fix, but must remain gated if numerical drift changes autoregressive trajectories.",
            design="Add a dedicated diagnosis path, restore HLM rotary state, run matched Flash-off/on long-context and eight-shard GSM8K comparisons, and default Flash Decode off when equivalence is not supported.",
            operations=[operation("inference.flash_decode", "HLM rotary input missing; unstable path without a task-level correctness gate", "rotary path repaired, deterministic A/B evaluation added, feature remains disabled by default", "Treat speed and correctness as separate claims and preserve the safer runtime default.", ["ev-concept-flash-rope-fix", "ev-concept-flash-gsm8k", "ev-concept-flash-results"])],
            commits=[implementation_ref("flash-rope-fix", commit_url(flash_commits["fix"]), "HLM RoPE repair and diagnostics.", ["ev-concept-flash-rope-fix"]), implementation_ref("flash-gsm8k-eval", commit_url(flash_commits["eval"]), "Sharded task evaluation.", ["ev-concept-flash-gsm8k"]), implementation_ref("flash-workflow-doc", commit_url(flash_commits["docs"]), "Safe-default documentation.", ["ev-concept-flash-workflow"])],
            code_symbols=[implementation_ref("flash-diagnose", blob_url(HEAD, "repo/experiments/vllm_inference/flash_decode_diagnose.py"), "Long-context numerical diagnosis.", ["ev-concept-flash-rope-fix"]), implementation_ref("gsm8k-eval", blob_url(HEAD, "repo/experiments/vllm_inference/gsm8k_eval.py"), "Deterministic sharded GSM8K evaluator.", ["ev-concept-flash-gsm8k"])],
            evidence_items=flash_evidence,
            experiments=[{"id": "flash-gsm8k-paired", "title": "Flash Decode GSM8K paired evaluation", "status": "inconclusive", "summary": "Aggregate strict accuracy was similar and makespan improved, but full generations and logits were not equivalent.", "metrics": {"strict_off": "522/1319", "strict_on": "525/1319", "paired_p_value": 0.8199, "makespan_speedup": "1.106x", "identical_generations": "817/1319", "worst_relative_l2": 0.9201, "minimum_cosine": 0.6655}, "evidence_ids": ["ev-concept-flash-results"]}],
            outcome="partially_supported",
            conclusion="The speed claim is supported, but numerical and generation equivalence is not; Flash Decode should remain off by default for output-sensitive use.",
            limitations=["One GSM8K A/B cannot establish universal quality neutrality.", "Long-context top-1 agreement coexists with large relative-logit drift.", "Flash Decode does not satisfy the random variable-length batch contract."],
            depends_on=["feat-concept-chunk-representation", "feat-concept-self-dd", "feat-concept-cross-module-residual-read"], related_to=["feat-concept-variable-length-batching", "feat-concept-stage1-scale-resume"],
        ),
    ]


def build_bundle() -> dict[str, Any]:
    features = build_features()
    assessments = {
        "feat-olmo3-150b-training-recipe": {"boundary_confidence": "medium", "grouped_commits": ["9125bb9dcd27c8c717cda66c1b4ccbf374b5e06b", "e3a07a986ff7069d5ce4edd053ffe86d962f976a"], "evidence_only_commits": ["79f65577f5a14d5ada43ccab5382d9be01114a77", "49d1d1a33bbae26c03471d9088479061b5540e87"], "reason": "The recipe has an independent reproducibility goal, but remains unmerged and untested as a full training intervention."},
        "feat-olmo3-1b-dense-preset": {"boundary_confidence": "medium", "grouped_commits": ["9125bb9dcd27c8c717cda66c1b4ccbf374b5e06b", "e3a07a986ff7069d5ce4edd053ffe86d962f976a"], "evidence_only_commits": [], "reason": "The exact 1B model and launch diff is explicit; the branch and effect remain unverified."},
        "feat-olmo3-3b-dense-preset": {"boundary_confidence": "medium", "grouped_commits": ["9125bb9dcd27c8c717cda66c1b4ccbf374b5e06b", "e3a07a986ff7069d5ce4edd053ffe86d962f976a"], "evidence_only_commits": [], "reason": "The exact 3B model and launch diff is explicit; the branch and effect remain unverified."},
        "feat-concept-segmented-topology": {"boundary_confidence": "high", "grouped_commits": [INITIAL], "evidence_only_commits": [], "reason": "Human review separates the five-stage information-flow skeleton from representation, quantization and route dimensions; the shared snapshot is evidence, not the boundary."},
        "feat-concept-hlm-predictor": {"boundary_confidence": "high", "grouped_commits": [INITIAL], "evidence_only_commits": [], "reason": "ConceptPredictorV2 is an independently configurable HLM module and the semantic parent of D07 and D08."},
        "feat-concept-chunk-representation": {"boundary_confidence": "high", "grouped_commits": [INITIAL], "evidence_only_commits": [], "reason": "Chunk-rate continuous representation is independently removable; chunk=4, mean pooling and shift remain parameters of the same Feature."},
        "feat-concept-product-vq": {"boundary_confidence": "high", "grouped_commits": [INITIAL], "evidence_only_commits": [], "reason": "Product VQ is an optional discretization layer over the continuous D05a parent; 32 codebooks by 128 entries remain internal parameters."},
        "feat-concept-self-dd": {"boundary_confidence": "high", "grouped_commits": [INITIAL], "evidence_only_commits": ["c5e4a029e6018cdcdbe500c5f13dc020c9d9fa4f"], "reason": "Same-module history reads are independently switchable from cross-module routes; semantic-preserving compiled fastpaths are implementation evidence."},
        "feat-concept-cross-module-residual-read": {"boundary_confidence": "high", "grouped_commits": [INITIAL], "evidence_only_commits": ["c5e4a029e6018cdcdbe500c5f13dc020c9d9fa4f"], "reason": "Cross-module route builders and V21ResidualFlowRouteAdd define a separate ablatable information-flow dimension; route fastpaths remain evidence."},
        "feat-concept-hlm-backbone-window": {"boundary_confidence": "high", "grouped_commits": ["93fadb42872024a53b5d3750f8d47e44175d51da", "4c5c9536d6b015ce099172e550b4f5865d23e9b3"], "evidence_only_commits": [], "reason": "Implementation and default flip jointly establish one attention mechanism."},
        "feat-concept-hlm-olmo3-layer-reuse": {"boundary_confidence": "medium", "grouped_commits": ["7512755321ee4238b43ad08eb3ecfbc5fe2f2e6e"], "evidence_only_commits": [], "reason": "Conditional sibling of D07 under D04b; downgrade to D04b implementation evidence if custom and OLMo3 blocks are structurally and numerically equivalent."},
        "feat-concept-cumsum-self-dd": {"boundary_confidence": "high", "grouped_commits": ["98719543fc9a3aa076a75ffd579e26d412c64141", "8d359faf0ae492d323edb86e704e1398af2ad7cc"], "evidence_only_commits": ["93e1120c73350333405e9cf89e37c21e41e72653"], "reason": "Core recurrent state and all-module application form one mechanism; the A/B launcher is evidence only."},
        "feat-concept-cross-module-cumsum-routes": {"boundary_confidence": "high", "grouped_commits": ["28a1ec57c9a0e5eed1eb5224b2d0883cc560a51a"], "evidence_only_commits": [], "reason": "Cross-module source semantics build only on D06b; similarity to D09 does not make D09 the parent."},
        "feat-concept-stage1-scale-resume": {"boundary_confidence": "medium", "grouped_commits": ["1f85baff62a930b57427302e65f7822c0cd8b3a8", "bb08a0f4dc32549c79b904d9ba38c38c3fea280a", "9f0fb4a1211304b586f2daaf8f97d8f9bc82fda7"], "evidence_only_commits": ["505b06820f2e4098ea0d973e07e995375508de85", "2d71d3fc2aa14c071e4ff514c66426b48f7a22bd", "7f4d92a3b0f37f99e14b41b54a5ab7971c3f9383", "82a7c1acaf91c7bfe2fc67262ec2360656d45c57", "34935e7c3c36e57823683f2c9bed2136ad77070b"], "reason": "A reproducible training configuration branch on the routed Concept model; short smokes do not validate full training effect."},
        "feat-concept-segmented-inference-runtime": {"boundary_confidence": "high", "grouped_commits": ["7802ff627c0abc4e1a489a34353ad8ebe7b52eea", "2119d24b231730b12953100e1e40bc2134993a18"], "evidence_only_commits": [], "reason": "The custom cache domains and GPU batched decode are one runtime capability, independent of Stage-1 launch configuration."},
        "feat-concept-strict-hf-export": {"boundary_confidence": "medium", "grouped_commits": ["56e4c613757570fa1090947633c4efe9245b6a89"], "evidence_only_commits": [], "reason": "Potential deployment capability, but currently close to a pure export and lacks an artifact/reload result."},
        "feat-concept-variable-length-batching": {"boundary_confidence": "medium", "grouped_commits": ["236bfa37b8e55a78a4b5c8d2737bf958b7760434", "06002575e5db02fde4b4a67aec28f7e1e3437ffe", "ea921d04a02c3670e9e6c5d2aa72e9678e220c68", "832100f5fcc2cf6f37d0700fb0d52ce4b7abc934", "78cbce74c3e049d44973ab4b61ecc3a5d7287197"], "evidence_only_commits": ["49ccae9b46d440b676fd12c8a31c2e6cb7addfca"], "reason": "Varlen state and shape-stable execution build directly on the segmented runtime, not HF export."},
        "feat-concept-flash-decode-evaluation": {"boundary_confidence": "high", "grouped_commits": ["4dc4c2dda6db0879defb31019bc97366e20ac2ad", "d57481c5f4b36e1d6846e01c18dd56cc077b3c0e"], "evidence_only_commits": ["f17d00a49521219b210b4c18fd153915817e7196", "9fdc384f139448aa5f915a2501d0e19aabd84372", HEAD], "reason": "A distinct mixed runtime mode branching from segmented inference; it is incompatible with random varlen batching."},
    }
    review_metadata = {
        "feat-olmo3-150b-training-recipe": review(
            "training_configuration", "unverified",
            [primary_locator("e3a07a986ff7069d5ce4edd053ffe86d962f976a", "repo/examples/public_training_bench/olmo3_vanilla/recipe.py", "build_train_config / build_launch_config / validate_config", "Resolve and validate the 150B training, optimizer, parallel and resource recipe.", parameter="GLOBAL_BATCH_SIZE, TRAIN_ITERS, LR, TP_SIZE, PP_SIZE, CP_SIZE")],
            comparison="No structured branch-local smaller-model training recipe versus a resolved 150B schedule.", conditions="Code and dry-run contract review only; no training run artifact.", metrics={}, artifact_locators=[],
            conclusion="Configuration is explicit but its training effect is unverified.", limitations=["Unmerged branch.", "No completed run or parent-relative convergence/cost result."], recommended_for_merge=False,
        ),
        "feat-olmo3-1b-dense-preset": review(
            "model_configuration", "unverified",
            [primary_locator("e3a07a986ff7069d5ce4edd053ffe86d962f976a", "repo/examples/public_training_bench/olmo3_vanilla/catalog.py", "OLMO3_DENSE_PRESETS['1B']", "Define the 1B model dimensions."), primary_locator("e3a07a986ff7069d5ce4edd053ffe86d962f976a", "repo/examples/public_training_bench/olmo3_vanilla/recipe.py", "RUNTIME_DEFAULTS['1B']", "Bind the 1B preset to LR and 32-H200 launch defaults.")],
            comparison="Work-repository 7B comparison launcher versus 1B concrete dimensions and launch defaults.", conditions="Catalog/recipe build and dry-run capability only.", metrics={}, artifact_locators=[],
            conclusion="The 1B intervention is reproducible but has no effect evidence.", limitations=["Unmerged branch.", "No training, quality, stability or cost artifact."], recommended_for_merge=False,
        ),
        "feat-olmo3-3b-dense-preset": review(
            "model_configuration", "unverified",
            [primary_locator("e3a07a986ff7069d5ce4edd053ffe86d962f976a", "repo/examples/public_training_bench/olmo3_vanilla/catalog.py", "OLMO3_DENSE_PRESETS['3B']", "Define the 3B model dimensions."), primary_locator("e3a07a986ff7069d5ce4edd053ffe86d962f976a", "repo/examples/public_training_bench/olmo3_vanilla/recipe.py", "RUNTIME_DEFAULTS['3B']", "Bind the 3B preset to LR and 64-H200 launch defaults.")],
            comparison="Work-repository 7B comparison launcher versus 3B concrete dimensions and launch defaults.", conditions="Catalog/recipe build and dry-run capability only.", metrics={}, artifact_locators=[],
            conclusion="The 3B intervention is reproducible but has no effect evidence.", limitations=["Unmerged branch.", "No training, quality, stability or cost artifact."], recommended_for_merge=False,
        ),
        "feat-concept-segmented-topology": review(
            "architecture", "unverified",
            [primary_locator(INITIAL, "repo/megatron/core/models/gpt/conceptlm_v2.py", "ConceptLMV2Model.__init__ / ConceptLMV2Model.forward", "Implement the segmented encoder, chunk, HLM, fusion and decoder topology.")],
            comparison="Standard single-stream OLMo3 Transformer versus the five-stage segmented topology.", conditions="Retrospective inspection of the shared initial snapshot; no isolated A/B artifact.", metrics={}, artifact_locators=[],
            conclusion="The topology is pinned and independently reviewable; its effect is unverified.", limitations=["Shared snapshot does not reveal a separate introduction time.", "No isolated quality or efficiency result."],
        ),
        "feat-concept-hlm-predictor": review(
            "architecture", "unverified",
            [primary_locator(INITIAL, "repo/megatron/core/models/gpt/conceptlm_v2.py", "ConceptPredictorV2", "Implement the concept-rate autoregressive HLM predictor.")],
            comparison="Segmented topology without a concept-rate predictor versus ConceptPredictorV2.", conditions="Retrospective inspection of the shared initial snapshot; no isolated A/B artifact.", metrics={}, artifact_locators=[],
            conclusion="The HLM module is pinned; its parent-relative effect is unverified.", limitations=["Shared snapshot does not reveal a separate introduction time.", "No HLM ablation result."],
        ),
        "feat-concept-chunk-representation": review(
            "architecture", "unverified",
            [primary_locator(INITIAL, "repo/megatron/core/models/gpt/conceptlm_v2.py", "ConceptLMV2Model._merge_token_chunks", "Construct four-token mean-pooled continuous concept states.", parameter="chunk_size=4, merge=meanpooling"), primary_locator(INITIAL, "repo/megatron/core/models/gpt/conceptlm_v2.py", "ConceptLMV2Model._repeat_shift_concepts", "Apply shifted concept reinjection semantics.", parameter="shift_feature=true")],
            comparison="No chunk-rate representation versus continuous four-token mean-pooled concepts with shifted reinjection.", conditions="Retrospective inspection of the shared initial snapshot; no isolated A/B artifact.", metrics={}, artifact_locators=[],
            conclusion="The representation and its parameters are pinned; effect and exact shift semantics are unverified.", limitations=["Shared snapshot does not reveal a separate introduction time.", "No chunk/pooling/shift ablation result."],
        ),
        "feat-concept-product-vq": review(
            "architecture", "unverified",
            [primary_locator(INITIAL, "repo/megatron/core/models/gpt/conceptlm_v22_vq.py", "ConceptLMV22VQModel.__init__ / ConceptLMV22VQModel._concept_branch_v21", "Implement Product VQ and its HLM/VQ loss path.", parameter="32 codebooks x 128 entries")],
            comparison="Continuous D05a concepts versus Product-VQ-discretized concepts.", conditions="Retrospective inspection of the shared initial snapshot; no isolated VQ A/B artifact.", metrics={}, artifact_locators=[],
            conclusion="The VQ bottleneck is pinned and independently removable; its effect is unverified.", limitations=["Shared snapshot does not reveal a separate introduction time.", "No continuous-versus-VQ result."],
        ),
        "feat-concept-self-dd": review(
            "architecture", "unverified",
            [primary_locator(INITIAL, "repo/megatron/core/models/gpt/conceptlm_v21.py", "V21SelfDD / V21DepthDD", "Implement same-module cross-layer history reads and mixing.")],
            comparison="Sequential layers reading only the previous state versus same-module stacked-history reads.", conditions="Retrospective inspection of the shared initial snapshot; no isolated A/B artifact.", metrics={}, artifact_locators=[],
            conclusion="Self-DD is pinned and independently switchable; its effect is unverified.", limitations=["Shared snapshot does not reveal a separate introduction time.", "DD acronym expansion and isolated result need algorithm-owner confirmation."],
        ),
        "feat-concept-cross-module-residual-read": review(
            "architecture", "unverified",
            [primary_locator(INITIAL, "repo/megatron/core/models/gpt/conceptlm_v21.py", "V21ResidualFlowRouteAdd", "Implement learned cross-module residual reads."), primary_locator(INITIAL, "repo/megatron/core/models/gpt/conceptlm_v21.py", "ConceptLMV21Model._build_encoder_concept_states / _build_decoder_encoder_states / _build_decoder_concept_states", "Build encoder-to-HLM and encoder/HLM-to-decoder route sources.")],
            comparison="No intermediate-state reads across modules versus learned encoder/HLM/decoder residual-read routes.", conditions="Retrospective inspection of the shared initial snapshot; no isolated A/B artifact.", metrics={}, artifact_locators=[],
            conclusion="Cross-module routes are pinned and independently switchable; their effect is unverified.", limitations=["Shared snapshot does not reveal a separate introduction time.", "No route ablation result."],
        ),
        "feat-concept-hlm-backbone-window": review(
            "architecture", "unverified",
            [primary_locator("93fadb42872024a53b5d3750f8d47e44175d51da", "repo/megatron/core/models/gpt/conceptlm_v2.py", "ConceptCausalBlock._sliding_window_causal_bias", "Implement HLM sliding-window attention."), primary_locator("4c5c9536d6b015ce099172e550b4f5865d23e9b3", "repo/examples/public_training_bench/train_concept_v22_vq_olmo3_7b.sh", "CONCEPTLM_HLM_ATTENTION_MODE", "Select backbone_window as the default.", parameter="conceptlm-hlm-attention-mode")],
            comparison="Full causal HLM attention versus backbone sliding/full attention cadence.", conditions="No isolated A/B run is committed.", metrics={}, artifact_locators=[],
            conclusion="Mechanism and default are pinned; effect is unverified.", limitations=["No quality, memory or throughput comparison."],
        ),
        "feat-concept-hlm-olmo3-layer-reuse": review(
            "architecture", "unverified",
            [primary_locator("7512755321ee4238b43ad08eb3ecfbc5fe2f2e6e", "repo/megatron/core/models/gpt/conceptlm_v21.py", "ConceptPredictorV21.hlm_block", "Replace custom HLM blocks with the configured OLMo3 TransformerBlock.")],
            comparison="Custom ConceptCausalBlock HLM versus shared OLMo3 TransformerBlock implementation.", conditions="Patch inspection; no parity or training A/B artifact.", metrics={}, artifact_locators=[],
            conclusion="Implementation replacement is clear; Feature status depends on unresolved structural/numerical equivalence.", limitations=["No checkpoint migration or numerical parity result.", "If equivalent, downgrade this proposal to D04b implementation evidence."], admission="conditional", recommended_for_merge=False,
        ),
        "feat-concept-cumsum-self-dd": review(
            "architecture", "unverified",
            [primary_locator("98719543fc9a3aa076a75ffd579e26d412c64141", "repo/megatron/core/models/gpt/conceptlm_v21.py", "V21SelfCumsumDD", "Replace full layer-history self-DD with recurrent cumsum state."), primary_locator("8d359faf0ae492d323edb86e704e1398af2ad7cc", "repo/megatron/core/models/gpt/conceptlm_v21.py", "ConceptLMV21Model._run_v21_decoder", "Apply cumsum state across encoder/HLM/decoder paths.")],
            comparison="Full previous-layer history DD versus one recurrent cumsum state.", conditions="A/B submission script exists but no result artifact.", metrics={}, artifact_locators=[],
            conclusion="Architecture is implemented; effect is unverified.", limitations=["No memory, speed, loss or quality result from the planned A/B."],
        ),
        "feat-concept-cross-module-cumsum-routes": review(
            "architecture", "unverified",
            [primary_locator("28a1ec57c9a0e5eed1eb5224b2d0883cc560a51a", "repo/megatron/core/models/gpt/conceptlm_v21.py", "ConceptLMV21Model._build_encoder_concept_states", "Expose and consume single cumsum sources across encoder, concept and decoder modules.")],
            comparison="Cross-module reads over per-layer histories versus one cumsum source per module.", conditions="Code and submission-path review; no A/B result.", metrics={}, artifact_locators=[],
            conclusion="Routing semantics are explicit; effect is unverified.", limitations=["No route-quality, throughput or convergence comparison."],
        ),
        "feat-concept-stage1-scale-resume": review(
            "training_configuration", "unverified",
            [primary_locator(HEAD, "full_train_dd_diag_256g_0611/scripts/pretrain_concept_olmo_stage_1.sh", "shell entrypoint", "Define the canonical 256-H200 Stage-1 resource and checkpoint workflow.", parameter="cards=256, load_dir, save_interval, save_full_state"), primary_locator(HEAD, "repo/examples/public_training_bench/concept_v22_vq_olmo3_config.sh", "Concept V2.2-VQ Stage-1 environment", "Bind model, optimizer and route configuration consumed by the launcher.")],
            comparison="Routed Concept model without a canonical scale/recovery plan versus 256-H200 Stage-1 plus full-state resume and monitoring.", conditions="Short 2/4-step monitoring smokes; not a full Stage-1 run.", metrics={"sampled_grad_nan_count": 0, "sampled_update_nan_count": 0}, artifact_locators=[blob_url(HEAD, "monitor.md")],
            conclusion="Short health smokes support implementation integrity but do not validate the training configuration's model effect.", limitations=["No completed Stage-1 convergence or checkpoint-content artifact."],
        ),
        "feat-concept-segmented-inference-runtime": review(
            "runtime", "mixed",
            [primary_locator(HEAD, "repo/experiments/vllm_inference/segmented_kv.py", "SegmentedConceptKV", "Maintain separate encoder, HLM and decoder cache domains."), primary_locator(HEAD, "repo/experiments/vllm_inference/inference.py", "ConceptLMInferencer", "Expose GPU-only batched decode.")],
            comparison="Full-prefix Concept forward versus segmented-KV incremental decode.", conditions="One H200; greedy 32-token decode at prompt lengths 12, 256 and 1024; strict checkpoint metadata fingerprinting.", metrics={"decode_speedup_12": "1.039x", "decode_speedup_256": "1.012x", "decode_speedup_1024": "1.075x", "teacher_forced_top1": "32/32 at all three lengths", "short_free_generation_match": False, "checkpoint_mutated": False}, artifact_locators=[blob_url(HEAD, "repo/experiments/vllm_inference/RESULTS_2026-07-17.md")],
            conclusion="Incremental runtime works and can be faster, but generation is not universally equivalent.", limitations=["Single-device limited prompt set.", "Stock vLLM serving unsupported."], has_effect_evidence=True,
        ),
        "feat-concept-strict-hf-export": review(
            "runtime", "unverified",
            [primary_locator("56e4c613757570fa1090947633c4efe9245b6a89", "repo/experiments/vllm_inference/export_hf.py", "main / strict state-key validation", "Export a custom model-only Hugging Face artifact with strict key checks.")],
            comparison="Megatron distributed checkpoint only versus a custom HF model-only export path.", conditions="Exporter code/launcher only; no content-addressed export and reload artifact.", metrics={}, artifact_locators=[],
            conclusion="Deployment value is plausible but not demonstrated; admission remains ambiguous.", limitations=["Could be evidence-only pure export.", "No artifact digest or independent reload result."], admission="ambiguous", recommended_for_merge=False,
        ),
        "feat-concept-variable-length-batching": review(
            "runtime", "unverified",
            [primary_locator(HEAD, "repo/experiments/vllm_inference/segmented_kv.py", "VarlenConceptKVCaches", "Maintain request-local state for heterogeneous prompt lengths."), primary_locator("ea921d04a02c3670e9e6c5d2aa72e9678e220c68", "repo/experiments/vllm_inference/compile_shape_sweep.py", "main", "Measure and constrain prompt-length route recompilation.")],
            comparison="Fixed/equal-length segmented batches versus request-local variable-length batches.", conditions="Implementation and smoke claims with Flash Decode disabled; no full parity matrix.", metrics={}, artifact_locators=[],
            conclusion="Runtime mode is implemented but parent-relative behavior/effect remains insufficiently measured.", limitations=["No broad batch-size/length numerical parity metrics.", "Flash Decode is outside this contract."],
        ),
        "feat-concept-flash-decode-evaluation": review(
            "runtime", "mixed",
            [primary_locator(HEAD, "repo/experiments/vllm_inference/flash_decode_diagnose.py", "main", "Diagnose long-context Flash Decode numerical behavior."), primary_locator(HEAD, "repo/experiments/vllm_inference/gsm8k_eval.py", "main", "Run deterministic sharded GSM8K Flash on/off evaluation.")],
            comparison="Segmented runtime with Flash Decode off versus repaired Flash Decode on.", conditions="Eight matched H200 GSM8K shards plus long-context numerical gates.", metrics={"strict_off": "522/1319", "strict_on": "525/1319", "paired_p_value": 0.8199, "makespan_speedup": "1.106x", "identical_generations": "817/1319", "worst_relative_l2": 0.9201, "minimum_cosine": 0.6655}, artifact_locators=[blob_url(HEAD, "repo/experiments/vllm_inference/README.md")],
            conclusion="Faster with neutral aggregate accuracy in one run, but logits and generations are not equivalent; keep default off.", limitations=["Not compatible with random variable-length batching.", "One task A/B is not universal quality evidence."], has_effect_evidence=True,
        ),
    }
    for feature_id, metadata in review_metadata.items():
        assessments[feature_id].update(metadata)
    diff_map = {
        "feat-olmo3-150b-training-recipe": ["D01"],
        "feat-olmo3-1b-dense-preset": ["D02"],
        "feat-olmo3-3b-dense-preset": ["D03"],
        "feat-concept-segmented-topology": ["D04a"],
        "feat-concept-hlm-predictor": ["D04b"],
        "feat-concept-chunk-representation": ["D05a"],
        "feat-concept-product-vq": ["D05b"],
        "feat-concept-self-dd": ["D06a"],
        "feat-concept-cross-module-residual-read": ["D06b"],
        "feat-concept-hlm-backbone-window": ["D07"],
        "feat-concept-hlm-olmo3-layer-reuse": ["D08"],
        "feat-concept-cumsum-self-dd": ["D09"],
        "feat-concept-cross-module-cumsum-routes": ["D10"],
        "feat-concept-stage1-scale-resume": ["D11", "D12"],
        "feat-concept-segmented-inference-runtime": ["D13"],
        "feat-concept-strict-hf-export": ["D14"],
        "feat-concept-variable-length-batching": ["D15"],
        "feat-concept-flash-decode-evaluation": ["D16"],
    }
    structural_ids = {
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
    }
    for feature in features:
        feature_id = feature["id"]
        feature["category"] = assessments[feature_id]["category"]
        feature["provenance"]["fields"]["category"] = "work-repo"
        assessment = assessments[feature_id]
        assessment["diff_ids"] = diff_map[feature_id]
        assessment["decision_status"] = "adjudicated" if feature_id in structural_ids else "pending"
        if feature_id not in structural_ids:
            assessment["recommended_for_merge"] = False
    assessments["feat-concept-hlm-olmo3-layer-reuse"]["conditional_review"] = {
        "question": "Are ConceptCausalBlock and the OLMo3 TransformerBlock path structurally and numerically equivalent under the same HLM configuration?",
        "if_equivalent": "Downgrade D08 to implementation evidence of feat-concept-hlm-predictor.",
        "if_not_equivalent": "Retain D08 as a sibling of D07 under feat-concept-hlm-predictor.",
        "owner": "algorithm review",
    }
    classifications: list[dict[str, Any]] = []
    messages = {
        INITIAL: "Initial logic snapshot",
        "505b06820f2e4098ea0d973e07e995375508de85": "Monitoring note update",
        "2d71d3fc2aa14c071e4ff514c66426b48f7a22bd": "Grad/update monitoring",
        "93fadb42872024a53b5d3750f8d47e44175d51da": "HLM backbone-window implementation",
        "4c5c9536d6b015ce099172e550b4f5865d23e9b3": "Backbone-window default",
        "c5e4a029e6018cdcdbe500c5f13dc020c9d9fa4f": "Route fastpaths",
        "7512755321ee4238b43ad08eb3ecfbc5fe2f2e6e": "OLMo3 layer reuse",
        "98719543fc9a3aa076a75ffd579e26d412c64141": "Cumsum self-DD core",
        "8d359faf0ae492d323edb86e704e1398af2ad7cc": "Cumsum across modules",
        "93e1120c73350333405e9cf89e37c21e41e72653": "Cumsum A/B launcher",
        "28a1ec57c9a0e5eed1eb5224b2d0883cc560a51a": "Cross-module cumsum routes",
        "7f4d92a3b0f37f99e14b41b54a5ab7971c3f9383": "MFU probe",
        "1f85baff62a930b57427302e65f7822c0cd8b3a8": "Save/resume smoke",
        "82a7c1acaf91c7bfe2fc67262ec2360656d45c57": "RJob/cache hardening",
        "34935e7c3c36e57823683f2c9bed2136ad77070b": "Training updates merge",
        "bb08a0f4dc32549c79b904d9ba38c38c3fea280a": "Canonical Stage-1 launcher",
        "9f0fb4a1211304b586f2daaf8f97d8f9bc82fda7": "Experiment organization/config separation",
        "9ec27a113876f0c6d4ee9bc6ce7be55fd8690ca2": "Remove upstream test suite",
        "7802ff627c0abc4e1a489a34353ad8ebe7b52eea": "Inference runtime bring-up",
        "2119d24b231730b12953100e1e40bc2134993a18": "GPU batched decode",
        "56e4c613757570fa1090947633c4efe9245b6a89": "Strict HF export",
        "236bfa37b8e55a78a4b5c8d2737bf958b7760434": "Batched Flash stability gates",
        "06002575e5db02fde4b4a67aec28f7e1e3437ffe": "True variable-length batching",
        "49ccae9b46d440b676fd12c8a31c2e6cb7addfca": "Job-name standardization",
        "ea921d04a02c3670e9e6c5d2aa72e9678e220c68": "Route compile shape reuse",
        "832100f5fcc2cf6f37d0700fb0d52ce4b7abc934": "Explicit precision lengths",
        "78cbce74c3e049d44973ab4b61ecc3a5d7287197": "Fixed-batch throughput benchmark",
        "4dc4c2dda6db0879defb31019bc97366e20ac2ad": "Flash HLM rotary repair",
        "d57481c5f4b36e1d6846e01c18dd56cc077b3c0e": "Sharded Flash GSM8K evaluation",
        "f17d00a49521219b210b4c18fd153915817e7196": "Inference workflow documentation",
        "9fdc384f139448aa5f915a2501d0e19aabd84372": "PR branch merge commit",
        HEAD: "Main PR merge commit",
    }
    main_feature_ids = structural_ids | {
        "feat-concept-stage1-scale-resume",
        "feat-concept-segmented-inference-runtime",
        "feat-concept-strict-hf-export",
        "feat-concept-variable-length-batching",
        "feat-concept-flash-decode-evaluation",
    }
    commit_assignments: dict[str, dict[str, Any]] = {}
    for feature_id in main_feature_ids:
        assessment = assessments[feature_id]
        for commit in assessment["grouped_commits"]:
            assigned = commit_assignments.setdefault(commit, {"disposition": "feature_implementation", "feature_ids": set()})
            assigned["disposition"] = "feature_implementation"
            assigned["feature_ids"].add(feature_id)
        for commit in assessment["evidence_only_commits"]:
            assigned = commit_assignments.setdefault(commit, {"disposition": "feature_evidence", "feature_ids": set()})
            assigned["feature_ids"].add(feature_id)
    for commit, assigned in commit_assignments.items():
        item = {
            "commit": commit,
            "locator": commit_url(commit),
            "message": messages[commit],
            "disposition": assigned["disposition"],
        }
        feature_ids = sorted(assigned["feature_ids"])
        if len(feature_ids) == 1:
            item["feature_id"] = feature_ids[0]
        else:
            item["feature_ids"] = feature_ids
            item["reason"] = "One commit supplies shared implementation/evidence for multiple independently reviewed Features."
        if commit == INITIAL:
            item["evidence_role"] = "shared_initial_snapshot_evidence"
        classifications.append(item)
    cleanup = "9ec27a113876f0c6d4ee9bc6ce7be55fd8690ca2"
    classifications.append({"commit": cleanup, "locator": commit_url(cleanup), "message": messages[cleanup], "disposition": "rejected_engineering", "reason": "Repository-size cleanup removes an upstream test tree but adds no Concept capability."})
    classifications.sort(key=lambda item: list(messages).index(item["commit"]))
    branch_classification = [
        {
            "commit": "9125bb9dcd27c8c717cda66c1b4ccbf374b5e06b",
            "locator": commit_url("9125bb9dcd27c8c717cda66c1b4ccbf374b5e06b"),
            "message": "Add OLMo3 1B and 3B vanilla launch presets",
            "disposition": "candidate_implementation",
            "feature_ids": [
                "feat-olmo3-150b-training-recipe",
                "feat-olmo3-1b-dense-preset",
                "feat-olmo3-3b-dense-preset",
            ],
            "reason": "Introduces substantive shared training defaults and explicit 1B/3B model/resource interventions.",
        },
        {
            "commit": "e3a07a986ff7069d5ce4edd053ffe86d962f976a",
            "locator": commit_url("e3a07a986ff7069d5ce4edd053ffe86d962f976a"),
            "message": "Organize OLMo3 vanilla training recipes",
            "disposition": "candidate_implementation",
            "feature_ids": [
                "feat-olmo3-150b-training-recipe",
                "feat-olmo3-1b-dense-preset",
                "feat-olmo3-3b-dense-preset",
            ],
            "reason": "Moves the interventions into a structured catalog/recipe/CLI with parameter validation and dry-run resolution.",
        },
        {
            "commit": "79f65577f5a14d5ada43ccab5382d9be01114a77",
            "locator": commit_url("79f65577f5a14d5ada43ccab5382d9be01114a77"),
            "message": "Improve OLMo3 vanilla training guide",
            "disposition": "candidate_evidence",
            "feature_ids": ["feat-olmo3-150b-training-recipe"],
            "reason": "Documentation clarifies the existing recipe but adds no independent intervention.",
        },
        {
            "commit": "49d1d1a33bbae26c03471d9088479061b5540e87",
            "locator": commit_url("49d1d1a33bbae26c03471d9088479061b5540e87"),
            "message": "Generalize architecture extension template",
            "disposition": "candidate_evidence",
            "feature_ids": ["feat-olmo3-150b-training-recipe"],
            "reason": "Template/generalization work supports the recipe surface without changing the admitted model or training configuration.",
        },
    ]
    diff_review = [
        {"id": "D01", "category": "training_configuration", "decision": "pending", "feature_ids": ["feat-olmo3-150b-training-recipe"]},
        {"id": "D02", "category": "model_configuration", "decision": "pending", "feature_ids": ["feat-olmo3-1b-dense-preset"]},
        {"id": "D03", "category": "model_configuration", "decision": "pending", "feature_ids": ["feat-olmo3-3b-dense-preset"]},
        {"id": "D04a", "category": "architecture", "decision": "new_feature", "feature_ids": ["feat-concept-segmented-topology"]},
        {"id": "D04b", "category": "architecture", "decision": "new_feature", "feature_ids": ["feat-concept-hlm-predictor"]},
        {"id": "D05a", "category": "architecture", "decision": "new_feature", "feature_ids": ["feat-concept-chunk-representation"]},
        {"id": "D05b", "category": "architecture", "decision": "new_feature", "feature_ids": ["feat-concept-product-vq"]},
        {"id": "D06a", "category": "architecture", "decision": "new_feature", "feature_ids": ["feat-concept-self-dd"]},
        {"id": "D06b", "category": "architecture", "decision": "new_feature", "feature_ids": ["feat-concept-cross-module-residual-read"]},
        {"id": "D07", "category": "architecture", "decision": "new_feature", "feature_ids": ["feat-concept-hlm-backbone-window"]},
        {"id": "D08", "category": "architecture", "decision": "conditional_feature", "feature_ids": ["feat-concept-hlm-olmo3-layer-reuse"]},
        {"id": "D09", "category": "architecture", "decision": "new_feature", "feature_ids": ["feat-concept-cumsum-self-dd"]},
        {"id": "D10", "category": "architecture", "decision": "new_feature", "feature_ids": ["feat-concept-cross-module-cumsum-routes"]},
        {"id": "D11", "category": "training_configuration", "decision": "pending", "feature_ids": ["feat-concept-stage1-scale-resume"]},
        {"id": "D12", "category": "training_configuration", "decision": "pending", "feature_ids": ["feat-concept-stage1-scale-resume"]},
        {"id": "D13", "category": "runtime", "decision": "pending", "feature_ids": ["feat-concept-segmented-inference-runtime"]},
        {"id": "D14", "category": "runtime", "decision": "pending", "feature_ids": ["feat-concept-strict-hf-export"]},
        {"id": "D15", "category": "runtime", "decision": "pending", "feature_ids": ["feat-concept-variable-length-batching"]},
        {"id": "D16", "category": "runtime", "decision": "pending", "feature_ids": ["feat-concept-flash-decode-evaluation"]},
    ]
    return {
        "proposal_version": "1.2.0",
        "base_root_id": "feat-olmo3-standard",
        "source_record": "sources/concept-olmo-observation.yaml",
        "work_repository": {"url": REPOSITORY, "role": "derived_private_work_repository", "official_olmo3_source": False},
        "observation": {"initial_revision": INITIAL, "head_revision": HEAD, "pull_request": 1, "branch_reviewed": "olmo_1B_3B"},
        "features": features,
        "feature_assessments": assessments,
        "diff_review": {
            "total": 19,
            "structural_count": 10,
            "pending_count": 9,
            "records": diff_review,
        },
        "migration": {
            "superseded_feature_ids": [
                {
                    "id": "feat-concept-olmo-v22-vq-snapshot",
                    "status": "superseded",
                    "replaced_by": sorted(structural_ids - {
                        "feat-concept-hlm-backbone-window",
                        "feat-concept-hlm-olmo3-layer-reuse",
                        "feat-concept-cumsum-self-dd",
                        "feat-concept-cross-module-cumsum-routes",
                    }),
                    "reason": "The aggregated snapshot node mixed six independently ablatable structural dimensions.",
                }
            ]
        },
        "commit_classification": classifications,
        "branch_commit_classification": branch_classification,
        "branch_disposition": {
            "revision": "49d1d1a33bbae26c03471d9088479061b5540e87",
            "status": "unmerged_configuration_candidates",
            "reason": "The branch contains three policy-admissible configuration candidates, but remains unmerged and has no effect evidence.",
        },
    }


def build_manifest(bundle: dict[str, Any]) -> dict[str, Any]:
    assessments = bundle["feature_assessments"]
    return {
        "proposal_version": bundle["proposal_version"],
        "base_root_id": bundle["base_root_id"],
        "bundle": "../concept-olmo-feature-tree.json",
        "features": [
            {
                "id": feature["id"],
                "file": f"features/{feature['id']}.json",
                "category": assessments[feature["id"]]["category"],
                "parent_id": feature["parent_id"],
                "validation_status": assessments[feature["id"]]["validation_status"],
                "boundary_confidence": assessments[feature["id"]]["boundary_confidence"],
                "admission": assessments[feature["id"]]["admission"],
                "recommended_for_merge": assessments[feature["id"]]["recommended_for_merge"],
                "has_effect_evidence": assessments[feature["id"]]["has_effect_evidence"],
                "diff_ids": assessments[feature["id"]]["diff_ids"],
                "decision_status": assessments[feature["id"]]["decision_status"],
                "primary_locators": assessments[feature["id"]]["primary_locators"],
                "validation": assessments[feature["id"]]["validation"],
                **(
                    {"conditional_review": assessments[feature["id"]]["conditional_review"]}
                    if "conditional_review" in assessments[feature["id"]]
                    else {}
                ),
            }
            for feature in bundle["features"]
        ],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("proposals") / "concept-olmo-feature-tree.json")
    parser.add_argument("--split-dir", type=Path, default=Path(__file__).with_name("proposals") / "concept-olmo")
    args = parser.parse_args(argv)
    bundle = build_bundle()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(bundle, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    feature_dir = args.split_dir / "features"
    feature_dir.mkdir(parents=True, exist_ok=True)
    expected_names = {f"{feature['id']}.json" for feature in bundle["features"]}
    for stale in feature_dir.glob("*.json"):
        if stale.name not in expected_names:
            stale.unlink()
    for feature in bundle["features"]:
        path = feature_dir / f"{feature['id']}.json"
        path.write_text(json.dumps(feature, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (args.split_dir / "manifest.json").write_text(
        json.dumps(build_manifest(bundle), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(args.output)
    print(args.split_dir / "manifest.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
