# Independent acceptance

Run the offline source/data checks and local-service probe with:

```bash
python3 -m evaluation.acceptance \
  --base-url http://127.0.0.1:8000 \
  --json-output evaluation/latest-report.json \
  --markdown-output evaluation/latest-report.md
```

If `--data` is omitted, exactly one YAML/JSON file must be discoverable under
`data/`. A missing implementation is a failure in the report, not a skipped
test. `SRC-02` also remains a deliberate failure until every OLMo-3 baseline
fact is authoritatively pinned.

The browser interaction contract is in `tests/e2e/formal-tree.spec.mjs`. Run it
before this command; its JSON result is written to
`/tmp/internspace-formal-tree-report.json` and merged into this report. The
fully pinned source check is reported as `UNRESOLVED`, separately from blocking
IS-S01/IS-S02 failures.

## Visual reference acceptance

The visual borrowing decision is documented in
`evaluation/VISUAL_REFERENCE_REVIEW_ZH.md`. Run the independent visual gate and
render its report with:

```bash
node web/node_modules/@playwright/test/cli.js test \
  --config tests/e2e/visual-playwright.config.mjs
python3 -m evaluation.visual_acceptance \
  --browser-report /tmp/internspace-visual-report.json
```

The resulting `evaluation/VISUAL_ACCEPTANCE_REPORT_ZH.md` distinguishes
blocking `FAIL` from external GitHub Pages connectivity `UNRESOLVED`. It never
copies `/tmp` screenshots into the repository and never treats demo telemetry
as Feature experiment/evidence.

## Concept OLMo Feature-growth review

The evidence-backed candidate analysis is generated independently of the UI
acceptance report:

```bash
python3 -m evaluation.build_concept_olmo_report
```

This writes `evaluation/concept-olmo-feature-growth.md` from the commit-pinned
work-repository observation and proposal bundle. It does not refresh
`latest-report.*` and does not modify canonical data, schema, scripts or web.
