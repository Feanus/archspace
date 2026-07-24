import { expect, test } from "@playwright/test";

test("GitHub Pages /archspace/ base path loads the offline model snapshot", async ({ page }) => {
  await page.goto("/archspace/");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
  await expect(page.locator("html")).toHaveAttribute("data-model-count", "4");
  const resources = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => new URL(entry.name).pathname));
  expect(resources).toContain("/archspace/styles.css");
  expect(resources).toContain("/archspace/src/model-app.js");
  expect(resources).toContain("/archspace/src/model-data-adapter.js");
  expect(resources).toContain("/archspace/data/template-test-data.json");
  await expect(page.locator('[data-model-id="issue-13"]')).toBeVisible();
});
