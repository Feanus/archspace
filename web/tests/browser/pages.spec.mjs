import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";
import { normalizeModelGraph } from "../../src/model-data-adapter.js";
import { ancestorIds } from "../../src/tree-layout.js";

const snapshot = JSON.parse(
  await readFile(new URL("../../../data/template-test-data.json", import.meta.url), "utf8"),
);
const snapshotGraph = normalizeModelGraph(snapshot);

const lifecycleStatusByLabel = new Map([
  ["under review", "under-review"],
  ["under-review", "under-review"],
  ["in progress", "in-progress"],
  ["in-progress", "in-progress"],
  ["in-progess", "in-progress"],
  ["declined", "declined"],
  ["verified", "verified"],
]);

function lifecycleStatus(issue) {
  return issue.labels
    .map((label) => String(label).trim().toLocaleLowerCase("en-US"))
    .map((label) => lifecycleStatusByLabel.get(label))
    .find(Boolean) ?? "";
}

function issueTitle(issue) {
  return issue.parsed?.architectureName
    || issue.title.replace(/^\[ARCH-PROP\]\s*/i, "")
    || `Issue #${issue.number}`;
}

function proposalIssueNumber(pullRequest) {
  return pullRequest.parsed?.architectureProposalIssue?.number
    || pullRequest.linkedIssues?.[0]
    || null;
}

function pullRequestsForIssue(issueNumber) {
  return snapshot.pullRequests.filter(
    (pullRequest) => proposalIssueNumber(pullRequest) === issueNumber,
  );
}

test("GitHub Pages /archspace/ renders the JT-Ushio snapshot and progress details", async ({ page }) => {
  const visibleIssues = snapshotGraph.models
    .map((model) => model.issue)
    .filter((issue) => lifecycleStatus(issue) !== "declined");
  const rootIssue = snapshotGraph.models.find(
    (model) => model.parentResolution === "root",
  ).issue;
  const mergedPullRequest = snapshot.pullRequests.find((pullRequest) => pullRequest.merged === true);
  const mergedIssue = snapshot.issues.find(
    (issue) => issue.number === proposalIssueNumber(mergedPullRequest),
  );

  await page.goto("/archspace/");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
  await expect(page.locator("html")).toHaveAttribute("data-model-count", String(visibleIssues.length));
  await expect(page.locator(".brand-copy")).toContainText("ArchSpace");
  await expect(page.locator(".canvas-hint strong")).toContainText("Welcome to ArchSpace");
  await expect(page.locator("#model-search")).toHaveAttribute("placeholder", "Search Models");

  const resources = await page.evaluate(() =>
    performance.getEntriesByType("resource").map((entry) => new URL(entry.name).pathname));
  expect(resources).toContain("/archspace/styles.css");
  expect(resources).toContain("/archspace/src/model-app.js");
  expect(resources).toContain("/archspace/src/model-data-adapter.js");
  expect(resources).toContain("/archspace/data/template-test-data.json");

  await expect(page.locator("#stat-models")).toHaveText(String(visibleIssues.length));
  await expect(page.locator("#stat-pull-requests")).toHaveText(String(
    visibleIssues.reduce(
      (total, issue) => total + pullRequestsForIssue(issue.number).length,
      0,
    ),
  ));
  await expect(page.locator('[data-model-id="offline-repository"]')).toHaveCount(0);
  for (const rootModel of snapshotGraph.models.filter(
    (model) => model.parentResolution === "root",
  )) {
    await expect(page.locator(`[data-model-id="${rootModel.id}"]`)).toBeVisible();
    await expect(page.locator(`[data-edge$=":${rootModel.id}"]`)).toHaveCount(0);
  }

  for (const issue of visibleIssues) {
    const node = page.locator(`[data-model-id="issue-${issue.number}"]`);
    const lifecycle = lifecycleStatus(issue);
    const displayedState = lifecycle || issue.state;
    const pullRequest = pullRequestsForIssue(issue.number)[0];

    await expect(node).toBeVisible();
    await expect(node).toHaveAttribute("data-lifecycle-status", lifecycle);
    await expect(node).toHaveAttribute("data-issue-state", issue.state);
    await expect(node).toHaveClass(new RegExp(`status-${displayedState}`));
    await expect(node.locator(".issue-state-badge")).toHaveCount(0);
    await expect(node).not.toContainText(/architecture proposal/i);
    await expect(node).not.toContainText(/\b(?:Open|Closed)\b/);

    if (pullRequest?.merged) {
      await expect(node.locator(".node-code-hint")).toContainText("Merged");
    } else if (pullRequest) {
      await expect(node.locator(".node-code-hint")).toContainText(`PR #${pullRequest.number}`);
    } else if (lifecycle === "in-progress") {
      await expect(node.locator(".node-code-hint")).toHaveText("Awaiting PR");
    } else if (lifecycle === "under-review") {
      await expect(node.locator(".node-code-hint")).toHaveText("");
    }
  }

  for (const issue of snapshotGraph.models
    .map((model) => model.issue)
    .filter((item) => lifecycleStatus(item) === "declined")) {
    await expect(page.locator(`[data-model-id="issue-${issue.number}"]`)).toHaveCount(0);
  }

  const descendantModel = snapshotGraph.models.find(
    (model) => model.parentResolution === "issue",
  );
  await page.locator(`[data-model-id="${descendantModel.id}"]`).click();
  await expect(page.locator(`[data-model-id="${descendantModel.id}"]`)).toHaveClass(/is-selected/);
  const descendantAncestors = ancestorIds(snapshotGraph, descendantModel.id);
  for (const ancestorId of descendantAncestors) {
    await expect(page.locator(`[data-model-id="${ancestorId}"]`)).toHaveClass(/is-ancestor/);
  }
  await expect(page.locator(".structure-edge.is-lineage-edge")).toHaveCount(
    descendantAncestors.length,
  );
  const unrelatedModel = snapshotGraph.models.find(
    (model) => model.id !== descendantModel.id && !descendantAncestors.includes(model.id),
  );
  await expect(page.locator(`[data-model-id="${unrelatedModel.id}"]`)).toHaveClass(/is-dimmed/);

  await expect(page.locator("#category-filters")).toBeHidden();
  await expect(page.locator(".semantic-legend")).toContainText("Parent");
  await expect(page.locator(".semantic-legend")).not.toContainText("parentIssue");

  await page.locator(`[data-model-id="issue-${rootIssue.number}"]`).click();
  const overviewToggle = page.locator("[data-overview-toggle]");
  await expect(overviewToggle).toContainText("Proposal");
  await expect(overviewToggle).toHaveAttribute("aria-expanded", "false");
  await overviewToggle.click();
  await expect(overviewToggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#overview-content")).toBeVisible();
  await expect(page.locator("#overview-content")).toContainText("Parent Architecture");
  await expect(page.locator("#overview-content")).toContainText("Parent issue");
  if (rootIssue.parsed?.preliminaryResults || rootIssue.parsed?.existingResults) {
    await expect(page.locator("#overview-content")).toContainText("Preliminary results (if any)");
  }
  await expect(page.locator("#overview-content dt", { hasText: /^Existing Results$/ })).toHaveCount(0);
  await overviewToggle.click();
  await expect(page.locator("#overview-content")).toBeHidden();

  await page.locator(`[data-model-id="issue-${mergedIssue.number}"]`).click();
  const progressToggle = page.locator(`[data-detail-tab="pr-${mergedPullRequest.number}"]`);
  await expect(progressToggle).toContainText("Progress");
  await expect(progressToggle).toContainText("Verified");
  await expect(progressToggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".done-pr-panel")).toHaveAttribute("open", "");
  await expect(page.locator(".done-pr-header")).toContainText("This idea is verified");

  const sourceOwner = mergedPullRequest.head.repo.split("/")[0];
  const targetOwner = mergedPullRequest.base.repo.split("/")[0];
  await expect(page.locator(".done-pr-header")).toContainText(
    `merge from ${sourceOwner}-${mergedPullRequest.head.branch} into ${targetOwner}-${mergedPullRequest.base.branch}`,
  );
  await expect(page.locator(".done-target-branch-link")).toHaveAttribute(
    "href",
    `https://github.com/${mergedPullRequest.base.repo}/tree/${mergedPullRequest.base.branch}`,
  );
  await expect(page.locator(".done-report-link")).toHaveCount(
    mergedPullRequest.parsed.archive.filter((entry) => entry.value?.url).length,
  );

  await progressToggle.click();
  await expect(progressToggle).toHaveAttribute("aria-expanded", "true");
  const progressPanel = page.locator(`#pr-content-${mergedPullRequest.number}`);
  await expect(progressPanel).toContainText("Implementation Details");
  await expect(progressPanel).toContainText("Experimental Validation");
  await expect(progressPanel).not.toContainText(/#{3,6}\s/);
  await expect(progressPanel).toContainText("Merge Checklist");

  const openPullRequest = snapshot.pullRequests.find(
    (pullRequest) => !pullRequest.merged
      && snapshotGraph.byId.has(`issue-${proposalIssueNumber(pullRequest)}`),
  );
  if (openPullRequest) {
    await page.locator(
      `[data-model-id="issue-${proposalIssueNumber(openPullRequest)}"]`,
    ).click();
    await expect(
      page.locator(`[data-detail-tab="pr-${openPullRequest.number}"]`),
    ).toContainText("Progress");
    await expect(page.locator(".done-pr-panel")).toHaveCount(0);
  }
});

test("declined Issues stay out of the tree, search, statistics, and selection", async ({ page }) => {
  const declinedSnapshot = structuredClone(snapshot);
  const admittedIssues = normalizeModelGraph(declinedSnapshot).models.map((model) => model.issue);
  const parentNumbers = new Set(
    admittedIssues
      .map((issue) => issue.parsed?.parentIssue?.number)
      .filter(Boolean),
  );
  const declinedIssue = admittedIssues.find(
    (issue) => issue.parsed?.parentIssue?.number && !parentNumbers.has(issue.number),
  );
  declinedIssue.state = "closed";
  declinedIssue.labels = ["architecture proposal", "declined"];
  const admittedCount = normalizeModelGraph(declinedSnapshot).models.length;

  await page.route("**/data/template-test-data.json", async (route) => {
    await route.fulfill({ json: declinedSnapshot });
  });
  await page.goto("/archspace/");

  await expect(page.locator("html")).toHaveAttribute(
    "data-model-count",
    String(admittedCount - 1),
  );
  await expect(page.locator("#stat-models")).toHaveText(
    String(admittedCount - 1),
  );
  await expect(page.locator(`[data-model-id="issue-${declinedIssue.number}"]`)).toHaveCount(0);
  await page.locator("#model-search").fill(issueTitle(declinedIssue));
  await expect(page.locator("#search-results button")).toHaveCount(0);
  await expect(page.locator("#detail-panel")).not.toContainText(issueTitle(declinedIssue));
});

test("inline and display LaTeX formulas are typeset inside Markdown fields", async ({ page }) => {
  const formulaSnapshot = structuredClone(snapshot);
  const rootIssue = normalizeModelGraph(formulaSnapshot).models.find(
    (model) => model.parentResolution === "root",
  ).issue;
  rootIssue.parsed.preliminaryResults =
    "The objective is $L = x^2 + y_1$, with complexity \\(O(n^2)\\).\n\n$$\na = b\n$$";

  await page.route("**/data/template-test-data.json", async (route) => {
    await route.fulfill({ json: formulaSnapshot });
  });
  await page.goto("/archspace/");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
  await page.locator(`[data-model-id="issue-${rootIssue.number}"]`).click();
  await page.locator("[data-overview-toggle]").click();

  await expect(page.locator(".math-inline")).toHaveCount(2);
  await expect(page.locator(".math-inline .katex")).toHaveCount(2, { timeout: 15_000 });
  await expect(page.locator(".math-inline annotation")).toHaveCount(2);
  await expect(page.locator(".math-display")).toHaveCount(1);
  await expect(page.locator(".math-display .katex-display")).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator(".math-display annotation")).toHaveText("a = b");
});
