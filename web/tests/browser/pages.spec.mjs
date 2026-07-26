import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

const snapshot = JSON.parse(
  await readFile(new URL("../../../data/template-test-data.json", import.meta.url), "utf8"),
);

test("GitHub Pages /archspace/ base path loads the offline model snapshot", async ({ page }) => {
  await page.goto("/archspace/");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
  await expect(page.locator("html")).toHaveAttribute("data-model-count", "4");
  await expect(page.locator(".brand-copy")).not.toContainText("Issue 驱动的模型谱系");
  await expect(page.locator(".brand-copy")).toContainText("ArchSpace");
  await expect(page.locator(".canvas-hint strong")).toContainText("Welcome to ArchSpace");
  await expect(page.locator(".canvas-hint span")).toContainText("Explore how model ideas branch, evolve, and come to life");
  await expect(page.locator("#model-search")).toHaveAttribute("placeholder", "Search Models");
  const resources = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => new URL(entry.name).pathname));
  expect(resources).toContain("/archspace/styles.css");
  expect(resources).toContain("/archspace/src/model-app.js");
  expect(resources).toContain("/archspace/src/model-data-adapter.js");
  expect(resources).toContain("/archspace/data/template-test-data.json");
  await expect(page.locator('[data-model-id="issue-1"]')).toBeVisible();
  const expectedStatuses = new Map([
    ["issue-1", "done"],
    ["issue-2", "in-progress"],
    ["issue-3", "declined"],
    ["issue-4", "under-review"],
  ]);
  const expectedRelations = new Map([
    ["issue-1", "Root architecture"],
    ["issue-2", "Parent: Olmo3"],
    ["issue-3", "Parent: Olmo3"],
    ["issue-4", "Parent: Depth"],
  ]);
  const expectedImplementationSummaries = new Map([
    ["issue-1", "Merged"],
    ["issue-2", "PR #8"],
    ["issue-3", "Not planned"],
    ["issue-4", "Awaiting decision"],
  ]);
  const accentColors = [];
  for (const [modelId, status] of expectedStatuses) {
    const node = page.locator(`[data-model-id="${modelId}"]`);
    const issue = snapshot.issues.find((candidate) => `issue-${candidate.number}` === modelId);
    await expect(node).toHaveAttribute("data-lifecycle-status", status);
    await expect(node).toHaveAttribute("data-issue-state", issue.state);
    await expect(node).toHaveClass(new RegExp(`status-${status}`));
    await expect(node.locator(".issue-state-badge")).toHaveCount(0);
    await expect(node.locator(".lineage-badge")).toContainText(expectedRelations.get(modelId));
    await expect(node.locator(".node-code-hint")).toContainText(expectedImplementationSummaries.get(modelId));
    await expect(node).not.toContainText(/architecture proposal/i);
    await expect(node).not.toContainText(/\b(?:Open|Closed)\b/);
    await expect(node.locator(".node-code-hint")).not.toContainText(/\b\d+\s+PRs?\b/);
    accentColors.push(await node.locator(".lifecycle-accent").evaluate((accent) => getComputedStyle(accent).fill));
  }
  expect(new Set(accentColors).size).toBe(4);
  await expect(page.locator("#category-filters")).toBeHidden();
  await expect(page.locator(".semantic-legend")).toContainText("Parent");
  await expect(page.locator(".semantic-legend")).not.toContainText("parentIssue");
  await page.locator('[data-model-id="issue-1"]').click();
  const overviewToggle = page.locator("[data-overview-toggle]");
  await expect(overviewToggle).toContainText("Proposal");
  await expect(overviewToggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#overview-content")).toBeHidden();
  await expect(page.locator(".model-detail-header").getByRole("link", { name: "Open Issue", exact: true })).toBeVisible();
  await expect(page.locator("#overview-content").getByRole("link", { name: "Open Issue", exact: true })).toHaveCount(0);
  await overviewToggle.click();
  await expect(overviewToggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#overview-content")).toBeVisible();
  await expect(page.locator("#overview-content").getByRole("heading", { name: "Model relationship" })).toHaveCount(0);
  await expect(page.locator("#overview-content")).not.toContainText("Model node");
  await expect(page.locator("#overview-content")).toContainText("Parent Architecture");
  await expect(page.locator("#overview-content")).toContainText("Parent issue");
  await expect(page.locator("#overview-content .model-relation dt").first()).toHaveText("Architecture Name");
  await expect(page.locator(".drawer-topline")).not.toContainText("MODEL · ISSUE · PULL REQUEST");
  await expect(page.locator("#overview-content")).toContainText("Existing Results");
  await expect(page.locator("#detail-panel")).not.toContainText("Related work");
  await overviewToggle.click();
  await expect(overviewToggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#overview-content")).toBeHidden();
  const pullRequestToggle = page.locator('[data-detail-tab="pr-7"]');
  await expect(pullRequestToggle).toContainText("Implementation");
  await expect(pullRequestToggle.locator("small")).toHaveCount(0);
  await expect(pullRequestToggle).not.toContainText(/Open|Closed|Under Review|Declined|In Progress|Done/);
  await expect(pullRequestToggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".done-pr-panel")).toHaveAttribute("open", "");
  await expect(page.locator(".done-pr-header")).toContainText("The model is merged");
  await expect(page.locator(".done-report-link")).toHaveCount(2);
  await expect(page.locator(".done-pr-panel").getByRole("link", { name: "WandB Report" })).toBeVisible();
  await expect(page.locator(".done-pr-panel").getByRole("link", { name: "HuggingFace Collection" })).toBeVisible();
  await pullRequestToggle.click();
  await expect(pullRequestToggle).toHaveAttribute("aria-expanded", "true");
  const detailBeforeDone = await page.evaluate(() => {
    const detail = document.querySelector(".model-tab-panel");
    const done = document.querySelector(".done-pr-panel");
    return Boolean(detail && done && (detail.compareDocumentPosition(done) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(detailBeforeDone).toBe(true);
  const rootImplementation = page.locator("#pr-content-7");
  await expect(rootImplementation).toContainText("Implementation Details");
  await expect(rootImplementation.getByRole("heading", { name: "Association and progress" })).toHaveCount(0);
  await expect(rootImplementation).toContainText("Architecture Name");
  await expect(rootImplementation).toContainText("Architecture Proposal");
  await expect(rootImplementation).toContainText("Base");
  await expect(rootImplementation).toContainText("Head");
  await expect(rootImplementation).toContainText("Open Pull Request");
  await expect(rootImplementation).toContainText("Experimental Validation");
  await expect(rootImplementation.locator(".section-tree-node > h4")).toHaveCount(3);
  await expect(rootImplementation.locator(".section-tree-node > h4").first()).toContainText("Research Question 1");
  await expect(rootImplementation).toContainText("Hypothesis: This is Hypothesis 1.");
  await expect(rootImplementation).not.toContainText("*Hypothesis:*");
  await expect(rootImplementation).not.toContainText(/#{3,6}\s/);
  await expect(rootImplementation.getByRole("link", { name: "WandB Report" })).toBeVisible();
  await expect(rootImplementation.getByRole("link", { name: "HuggingFace Collection" })).toBeVisible();
  await expect(rootImplementation.getByRole("link", { name: "More Info" })).toHaveCount(0);
  await expect(rootImplementation).toContainText("Merge Checklist");
  await expect(rootImplementation.locator(".detail-section").filter({ hasText: "Merge Checklist" }).locator(".check-list li")).toHaveCount(4);
  await expect(rootImplementation.locator(".detail-section").filter({ hasText: "Merge Checklist" }).locator(".check-list li.is-checked")).toHaveCount(4);
  await pullRequestToggle.click();
  await expect(pullRequestToggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".model-tab-panel")).toHaveCount(1);
  await expect(page.locator(".model-tab-panel")).toBeHidden();

  await page.locator('[data-model-id="issue-2"]').click();
  await expect(page.locator('[data-detail-tab="pr-8"]')).toContainText("Implementation");
  await expect(page.locator('[data-detail-tab="pr-8"] small')).toHaveCount(0);
  await page.locator('[data-detail-tab="pr-8"]').click();
  const secondImplementation = page.locator("#pr-content-8");
  await expect(secondImplementation.getByRole("link", { name: "WandB Report" })).toBeVisible();
  await expect(secondImplementation.getByRole("link", { name: "HuggingFace Collection" })).toBeVisible();
  await expect(secondImplementation.getByRole("link", { name: "More Info" })).toHaveCount(0);
  await expect(secondImplementation.locator(".section-tree-node > h4")).toHaveCount(4);
  await expect(secondImplementation).not.toContainText(/#{3,6}\s/);
  await expect(page.locator(".done-pr-panel")).toHaveCount(0);

  await page.locator('[data-model-id="issue-3"]').click();
  await expect(page.locator(".pull-request-panel")).toHaveCount(0);
  await expect(page.locator(".pull-request-toggle")).toHaveCount(0);
  await expect(page.locator("#detail-panel")).not.toContainText("Implementation");
  await expect(page.locator("[data-detail-tab]")).toHaveCount(0);
  await expect(page.locator(".done-pr-panel")).toHaveCount(0);
});
