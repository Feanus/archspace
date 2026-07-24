# IS-S01 / IS-S02 contract tests

Run source, schema, tree, and ingest contracts:

```bash
pytest -q tests/e2e/test_contract.py
```

Run the independent browser contract against formal `data/feature-tree.json`:

```bash
web/node_modules/.bin/playwright test --config tests/e2e/playwright.config.mjs
```

The browser suite uses the repository's installed Playwright package and
system Chromium, starts the existing read-only local server, stores all test
artifacts under `/tmp`, and never routes a success fixture over the formal data.

Run the independent visual-reference gate with:

```bash
node web/node_modules/@playwright/test/cli.js test \
  --config tests/e2e/visual-playwright.config.mjs
python3 -m evaluation.visual_acceptance
```

This suite checks dark visual tokens, root-plus-four initial structure,
category/validation/experiment marker semantics, drawer behavior, structural
versus auxiliary edges, desktop/mobile geometry, pan/zoom/search/keyboard/reduced
motion, local and GitHub Pages assets, and the deterministic disableable
`ExperimentReplayProvider`. Screenshots and the raw browser JSON remain under
`/tmp`; only the generated review and acceptance Markdown are repository
artifacts.

Run the commit-pinned Concept OLMo source and proposal contracts with:

```bash
pytest -q tests/e2e/test_concept_olmo_proposals.py
python3 -m ingest.validate_concept_proposals
```

The validator combines only the canonical root with the candidate Features in
memory. It never applies the proposal to `data/feature-tree.json`.
