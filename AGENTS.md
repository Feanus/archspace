# Shared agent rules

- Read `Project.md` completely before editing.
- Read `FEATURE_ADMISSION_POLICY.md` before creating, rejecting, importing or rendering Feature nodes.
- The primary invariant is: one visible point equals one Feature.
- The only structural root is `feat-olmo3-standard`.
- Every non-root Feature has exactly one structural parent.
- Components, Python symbols, commits, sessions, papers and experiments are Feature details, not tree nodes.
- Architecture, model configuration, training configuration, data and runtime changes may all be Feature nodes when they satisfy the admission policy.
- Do not copy source files from `/home/inuyasha/Lumia/LumiaTree`.
- Preserve concurrent edits and stay inside the ownership scope in the task prompt.
- Do not read or modify `../INTERNSPACE_SESSION_DISPATCH.md`.
- Do not commit Git; the dispatcher will create checkpoints.
- Do not add credentials, runtime state, caches, screenshots from `/tmp`, or third-party source trees to Git.
- Prefer a small explicit contract over a general ontology.
