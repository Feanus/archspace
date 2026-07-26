import assert from "node:assert/strict";
import test from "node:test";

import {
  ISSUE_FIELDS,
  PR_FIELD_GROUPS,
  parseArchiveLinks,
  parseArchitectureProposalIssue,
  parsePullRequest,
} from "../../scripts/github-template-test-fetcher-v4.mjs";
import {
  DEFAULT_ISSUE_LABEL,
  DEFAULT_PULL_REQUEST_LABEL,
  hasLabel,
} from "../../scripts/github-template-test-fetcher-v2.mjs";

test("parses the optional Preliminary results field from the JT-Ushio Issue schema", () => {
  const parsed = parseArchitectureProposalIssue(`### Architecture Name

Olmo3

### Parent issue

None

### Motivations

Improve the baseline.

### Proposed Architecture

Add the proposed change.

### Preliminary results (if any)

The prototype reduced validation loss.

### Experiments Plan

Run the full comparison.`, {
    owner: "JT-Ushio",
    repo: "template-test",
  });

  assert.deepEqual(Object.keys(parsed), [
    "architectureName",
    "parentIssue",
    "motivations",
    "proposedArchitecture",
    "preliminaryResults",
    "experimentsPlan",
  ]);
  assert.equal(parsed.parentIssue, null);
  assert.equal(parsed.preliminaryResults, "The prototype reduced validation loss.");
  assert.equal("relatedWork" in parsed, false);
  assert.equal("proposalType" in parsed, false);
});

test("exports field definitions matching the current Issue template", () => {
  assert.deepEqual(ISSUE_FIELDS.map((field) => field.key), [
    "architectureName",
    "parentIssue",
    "motivations",
    "proposedArchitecture",
    "preliminaryResults",
    "experimentsPlan",
  ]);
  const preliminaryResults = ISSUE_FIELDS.find((field) => field.key === "preliminaryResults");
  assert.equal(preliminaryResults?.templateId, "existing_results");
  assert.equal(preliminaryResults?.label, "Preliminary results (if any)");
  assert.equal(preliminaryResults?.required, false);
});

test("keeps parsing the former Existing Results heading for old Issues", () => {
  const parsed = parseArchitectureProposalIssue(`### Existing Results

Legacy result.`);
  assert.equal(parsed.preliminaryResults, "Legacy result.");
});

test("uses separate labels for Issue and PR filtering", () => {
  assert.equal(DEFAULT_ISSUE_LABEL, "architecture proposal");
  assert.equal(DEFAULT_PULL_REQUEST_LABEL, "architecture implementation");
  assert.equal(hasLabel({ labels: [{ name: "Architecture Proposal" }] }, DEFAULT_ISSUE_LABEL), true);
  assert.equal(hasLabel({ labels: [{ name: "architecture implementation" }] }, DEFAULT_PULL_REQUEST_LABEL), true);
  assert.equal(hasLabel({ labels: [{ name: "architecture proposal" }] }, DEFAULT_PULL_REQUEST_LABEL), false);
});

test("parses the renamed PR fields and preserves every Archive entry", () => {
  const body = `---
Title: Dynamic implementation
Architecture Name: Dynamic model
About: Implements the approved proposal
---

> **Architecture Proposal (issue #)**: #2

## Implementation Details

Implemented.

## Experimental Validation

Validated.

#### Research Question 1

Hypothesis and findings.

## Archive

- WandB Report: https://reports.example.com/run
- HuggingFace Collection: https://models.example.com/model
- More Info: https://docs.example.com/details

## Reviewer Assessment (for repo reviewers)

Ready.

**Merge Checklist**:
- [x] Linked proposal verified.
`;
  const links = parseArchiveLinks(body);
  const parsed = parsePullRequest(body, { owner: "JT-Ushio", repo: "template-test" });

  assert.deepEqual(links.map(({ key, label }) => ({ key, label })), [
    { key: "wandbReport", label: "WandB Report" },
    { key: "huggingfaceCollection", label: "HuggingFace Collection" },
    { key: "moreInfo", label: "More Info" },
  ]);
  assert.deepEqual(parsed.archive, links);
  assert.equal(parsed.archive[2].value.url, "https://docs.example.com/details");
  assert.equal(parsed.metadata.title, "Dynamic implementation");
  assert.equal(parsed.metadata.architectureName, "Dynamic model");
  assert.equal(parsed.architectureProposalIssue.number, 2);
  assert.equal(parsed.implementationDetails, "Implemented.");
  assert.equal(parsed.reviewerAssessment, "Ready.");
  assert.equal(parsed.mergeChecklist[0].checked, true);
  assert.equal("reportLinks" in parsed, false);
});

test("exports current Archive link definitions", () => {
  const archiveGroup = PR_FIELD_GROUPS.find((group) => group.key === "archive");
  assert.deepEqual(archiveGroup.fields.map(({ key, label }) => ({ key, label })), [
    { key: "wandbReportIncludeTrainingAndEvaluationLogs", label: "WandB Report (include training and evaluation logs)" },
    { key: "huggingfaceCollectionIncludeModelCheckpoints", label: "HuggingFace Collection (include model checkpoints)" },
  ]);
});

test("parses variable Experimental Validation headings into a hierarchy", () => {
  const parsed = parsePullRequest(`## Experimental Validation

Overall results improved.

#### Research Question 1

Training was more stable.

##### Evidence

Loss variance decreased.

#### Research Question 2

Throughput increased.`, {});

  assert.deepEqual(parsed.experimentalValidation, {
    intro: "Overall results improved.",
    sections: [
      {
        title: "Research Question 1",
        level: 2,
        content: "Training was more stable.",
        children: [
          {
            title: "Evidence",
            level: 3,
            content: "Loss variance decreased.",
            children: [],
          },
        ],
      },
      {
        title: "Research Question 2",
        level: 2,
        content: "Throughput increased.",
        children: [],
      },
    ],
  });
  assert.equal(JSON.stringify(parsed.experimentalValidation).includes("####"), false);
  assert.equal(
    PR_FIELD_GROUPS.find((group) => group.key === "implementation")
      ?.fields.find((field) => field.key === "experimentalValidation")?.type,
    "sectionTree",
  );
});
