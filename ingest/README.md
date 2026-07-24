# Minimal Feature proposal ingest

The ingest command validates one explicit Feature proposal against the current
tree and prints a unified dry-run diff. It does not classify a proposal with a
model, derive parentage, create component nodes, or write formal data by
default.

```bash
python3 -m ingest.feature_proposal \
  --data data/features.yaml \
  --proposal ingest/examples/feature-proposal.yaml
```

Only an explicit `--apply` atomically replaces the data file after appending
exactly one Feature:

```bash
python3 -m ingest.feature_proposal \
  --data data/features.yaml \
  --proposal path/to/proposal.yaml \
  --apply
```

The accepted proposal is a Feature mapping (or `{feature: ...}` wrapper) with:

- stable lowercase `feat-*` ID and an existing single `parent_id`;
- `kind: feature` and a lifecycle status declared in `Project.md`;
- explicit summary, hypothesis, design, and parent-relative delta;
- structured implementation and evidence lists;
- auxiliary Feature references that do not affect structural parentage; and
- canonical per-field provenance with named `sources` and a complete `fields`
  mapping.

Each non-empty delta operation must retain `target`, `before`, `after`,
`rationale`, and an `evidence_ids` list. Proposed work may have empty
implementation/evidence lists;
validating, analyzed, and abandoned work must retain evidence.

The repository's `schema/feature-tree.schema.json` is applied to the complete
post-append document before a diff is accepted or a write occurs.

## Concept OLMo candidate bundle

The evidence-backed multi-Feature candidate is generated and validated without
using the single-Feature apply path:

```bash
python3 -m ingest.build_concept_olmo_proposals
python3 -m ingest.validate_concept_proposals
```

The output is `ingest/proposals/concept-olmo-feature-tree.json`. It contains
candidate Feature records plus boundary-confidence and commit-classification
metadata. Validation temporarily combines only those Feature records with the
canonical root; it never applies them to `data/feature-tree.json`.
