# Feature contribution and automatic growth

## Objective

InternSpace uses Git review as the acceptance boundary for new Feature nodes.
A merged Feature proposal becomes visible without hand-editing the renderer.

```text
feature file → pull request → required checks → review → merge
             → deterministic aggregate → static site deployment
```

## Canonical storage

The target storage layout is one canonical file per Feature under `features/`.
The root file is fixed as `features/feat-olmo3-standard.json`.

The aggregate consumed by the browser is generated. Contributors must not
manually coordinate array ordering or edit a shared giant JSON document.

Each file contains exactly one Feature record and follows the same semantic
contract as the current tree:

- stable `feat-*` identity;
- original/English title plus a reviewed Chinese `title_zh` translation;
- exactly one structural parent except for the fixed root;
- parent-relative delta with target, before, after, rationale and evidence;
- implementation, experiment and provenance details;
- auxiliary references that do not affect tree structure.

Experiment records live outside the tree. A single experiment may cover several
Features, and it declares a cursor type such as `none`, `wandb-final`,
`wandb-replay` or future `live`. Completed experiments should provide a W&B URL
and final metrics; replay curves must come from fetched W&B traces and must not
be described as live training.

## Pull request contract

The normal contribution adds one Feature. A PR description should explain:

1. why this is an independent Feature rather than evidence for an existing one;
2. why the selected structural parent is correct;
3. the before/after delta relative to that parent;
4. the commit-pinned implementation code paths and qualified symbols;
5. the parent-relative experiment results, covered Feature IDs and effect status;
6. unresolved claims and confidence.

A configuration, training, data or runtime change may add a node when it meets
`FEATURE_ADMISSION_POLICY.md`. A size label or resource list without an
explicit reproducible diff and parent-relative evidence must not add a node.

Commits and PRs are audit evidence. They do not automatically define Feature
boundaries and must never render as tree nodes.

## Required checks

A Feature PR should be mergeable only when deterministic checks confirm:

- filename equals Feature ID;
- the fixed root is unchanged and no second root exists;
- ID is unique and has not been historically reused;
- parent and auxiliary references resolve;
- the aggregate remains connected and acyclic;
- every visible record is a Feature;
- delta and provenance references are complete;
- at least one immutable code locator identifies the structural implementation;
- effect status and parent-relative result evidence are explicit;
- every proposal declares an allowed category and passes its category-specific admission rules;
- no credentials, tokens or unsafe machine-local paths are included;
- the aggregate build is reproducible;
- model, browser and end-to-end tests pass;
- a preview artifact can render the proposed node and its parent path.

Changing an existing parent, deleting a historical Feature, or splitting and
merging nodes requires an explicit migration review rather than the ordinary
new-node path.

## Merge and publication

On merge to the protected main branch, a workflow should:

1. check out the exact merge revision;
2. validate all canonical Feature files;
3. generate the aggregate tree in stable ID order;
4. run unit and browser smoke tests;
5. assemble a static site artifact containing the aggregate;
6. deploy the artifact or publish it to the configured internal host.

The deployed artifact records its source repository and exact merge commit.
It contains no GitHub token or private source payload beyond explicitly
approved Feature evidence metadata.

The local development server should use the same builder and watch canonical
Feature files so a newly added valid node appears after rebuild without a
renderer code change.

## Relationship to concept_olmo

`Liu-yuliang/concept_olmo` supplies evidence for a sequence of Feature nodes
derived from classic OLMo-3. It is not the root and not a node itself.

The initial import will produce reviewed candidate Feature files. After that,
new Concept OLMo work should use the same ordinary contribution path: group
implementation commits into a semantic Feature proposal, review its parent and
delta, then merge it to make the tree grow.
