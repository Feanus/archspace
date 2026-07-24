import { expect, test } from "@playwright/test";

test("GitHub Pages /InternSpace/ base path loads modules and canonical data", async ({ page }) => {
  await page.goto("/InternSpace/");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
  await expect(page.locator("html")).toHaveAttribute("data-feature-count", "11");
  const resources = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => new URL(entry.name).pathname));
  expect(resources).toContain("/InternSpace/styles.css");
  expect(resources).toContain("/InternSpace/src/app.js");
  expect(resources).toContain("/InternSpace/data/feature-tree.json");
  expect(resources).toContain("/InternSpace/data/experiments.json");
  await expect(page.locator('[data-feature-id="feat-olmo3-standard"]')).toBeVisible();
});
