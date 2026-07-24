# OLMo-3 baseline source pin

`olmo-3-standard.yaml` is the source record for the only structural root,
`feat-olmo3-standard`. It deliberately separates a project-declared display
identity from externally verified model facts.

The current record is `status: unresolved`. No confirmed local authoritative
OLMo-3 source was available when it was created, so it does not guess a model
size, repository, revision, config, checkpoint, or license.

## Pin workflow

1. Obtain an authoritative first-party repository, release, model card, or
   artifact without inferring values from a similarly named model.
2. Record each source in `authoritative_sources` with its URI, source type,
   retrieval time, and SHA-256 digest of the exact downloaded document (or a
   content-addressed immutable URI).
3. Fill every fact from those sources. Set the fact to `pinned` only when its
   `evidence` entries name records in `authoritative_sources`.
4. Pin the repository to an immutable revision. A branch, tag without a
   resolved commit, or `main` is not sufficient.
5. Pin config, checkpoint, and license artifacts by URI and SHA-256 digest.
6. Remove resolved paths from `unresolved_fields`, set the top-level status to
   `pinned`, and run:

   ```bash
   python3 sources/verify_olmo3_source.py --require-pinned
   ```

The verifier is intentionally offline. It verifies completeness, internal
references, immutable identifiers, and optional local artifact digests; it
does not turn network availability into permission to invent or silently
refresh provenance.

## Derived Concept OLMo work repository

`concept-olmo-observation.yaml` records a separate, commit-pinned observation
of the private `Liu-yuliang/concept_olmo` implementation repository. It is
explicitly a derived work repository and must never be used as the official
repository or provenance of `feat-olmo3-standard`.

```bash
python3 sources/verify_concept_olmo_observation.py
```

The observation stores only credential-free HTTPS locators, full commits and
SHA-256 content hashes. Internal checkpoint/runtime paths found in upstream
documents are deliberately excluded.
