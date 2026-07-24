import { readFile } from "node:fs/promises";
import { expect, test } from "../../web/node_modules/@playwright/test/index.mjs";

const document = JSON.parse(await readFile(new URL("../../data/feature-tree.json", import.meta.url)));
const features = document.features;
const byId = new Map(features.map((feature) => [feature.id, feature]));
const root = features.find((feature) => feature.parent_id == null);
const firstLevel = features.filter((feature) => feature.parent_id === root.id);

test.beforeEach(async ({ page }) => {
  await page.goto("/web/");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
});

test("formal data renders one Feature-only root canvas", async ({ page }) => {
  await expect(page.locator("html")).toHaveAttribute("data-feature-count", String(features.length));
  const nodes = page.locator("#node-layer [data-feature-id]");
  await expect(nodes).toHaveCount(1 + firstLevel.length);
  await expect(page.locator(`[data-feature-id="${root.id}"]`)).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#detail-panel h1")).toHaveText("OLMo-3 标准态");

  const renderedIds = await nodes.evaluateAll((items) => items.map((item) => item.dataset.featureId));
  expect(renderedIds.every((id) => byId.get(id)?.record_type === "feature")).toBeTruthy();
  expect(renderedIds.every((id) => !["component", "commit", "source"].includes(byId.get(id)?.kind))).toBeTruthy();
  await expect(page.locator("#edge-layer [data-edge]")).toHaveCount(renderedIds.length - 1);
  await expect(page.locator("#dependency-layer [data-auxiliary-edge]")).toHaveCount(0);
});

test("expand and collapse preserve the adjudicated HLM branch", async ({ page }) => {
  const nodes = page.locator("#node-layer [data-feature-id]");
  const initialCount = 1 + firstLevel.length;
  await page.locator(`[data-toggle-id="${root.id}"]`).click();
  await expect(nodes).toHaveCount(1);
  await page.locator(`[data-toggle-id="${root.id}"]`).click();
  await expect(nodes).toHaveCount(initialCount);

  await page.locator('[data-toggle-id="feat-concept-segmented-topology"]').click();
  await page.locator('[data-toggle-id="feat-concept-hlm-predictor"]').click();
  await expect(page.locator('[data-feature-id="feat-concept-hlm-backbone-window"]')).toBeVisible();
  await expect(page.locator('[data-feature-id="feat-concept-hlm-olmo3-layer-reuse"]')).toBeVisible();
  await page.locator('[data-toggle-id="feat-concept-hlm-predictor"]').click();
  await expect(page.locator('[data-feature-id="feat-concept-hlm-olmo3-layer-reuse"]')).toHaveCount(0);
});

test("selection shows complete Feature details and auxiliary edges stay auxiliary", async ({ page }) => {
  const structuralBefore = await page.locator("#edge-layer [data-edge]").count();
  await page.locator('[data-feature-id="feat-concept-self-dd"]').click();
  const detail = page.locator("#detail-panel");
  await expect(detail.locator("h1")).toHaveText("Self-DD：模块内跨层读取");
  for (const heading of ["摘要", "假设 / 需求", "设计", "相对父节点的变化", "实现", "分析与结论", "证据", "来源"]) {
    await expect(detail).toContainText(heading);
  }
  await expect(page.locator("#dependency-layer [data-auxiliary-edge]")).toHaveCount(1);
  await expect(page.locator("#edge-layer [data-edge]")).toHaveCount(structuralBefore);
});

test("search reveals a collapsed Product-VQ path and opens its details", async ({ page }) => {
  await page.locator("#feature-search").fill("Product VQ");
  await page.locator("#feature-search").press("Enter");
  await expect(page.locator('[data-feature-id="feat-concept-product-vq"]')).toBeVisible();
  await expect(page.locator("#detail-panel h1")).toHaveText("Product VQ 离散化");
});

test("root detail exposes every unresolved OLMo-3 pin field honestly", async ({ page }) => {
  const detail = page.locator("#detail-panel");
  for (const field of ["model family", "model scale", "repository", "revision", "configuration", "checkpoint", "license"]) {
    await expect(detail).toContainText(field, { ignoreCase: true });
  }
  await expect(detail).toContainText("unresolved", { ignoreCase: true });
});

test("missing formal data is an explicit error and never a fallback tree", async ({ page }) => {
  await page.route("**/data/feature-tree.json", (route) => route.fulfill({ status: 404, body: "missing" }));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-ready", "error");
  await expect(page.locator("#empty-state")).toContainText("返回 404");
  await expect(page.locator("#node-layer [data-feature-id]")).toHaveCount(0);
});
