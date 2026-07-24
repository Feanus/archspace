import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const screenshotPath = (name) => new URL(`../../docs/${name}.png`, import.meta.url).pathname;
const bilingualFixture = JSON.parse(await readFile(new URL("../fixtures/feature-tree.fixture.json", import.meta.url), "utf8"));
const legacyFixture = structuredClone(bilingualFixture);
for (const feature of legacyFixture.features) {
  delete feature.title_zh;
  delete feature.summary_zh;
}

async function loadFeaturePayload(page, payload) {
  await page.unroute("**/data/feature-tree.json");
  await page.route("**/data/feature-tree.json", (route) => route.fulfill({ json: payload }));
  await page.unroute("**/data/experiments.json").catch(() => {});
  await page.route("**/data/experiments.json", (route) => route.fulfill({ json: { experiments: [] } }));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
}

async function blankCanvasPoint(page) {
  return page.evaluate(() => {
    for (let y = 100; y < Math.min(innerHeight - 40, 520); y += 24) {
      for (let x = 24; x < Math.min(innerWidth - 24, 900); x += 24) {
        const target = document.elementFromPoint(x, y);
        if (target?.id === "tree-canvas") return { x, y };
      }
    }
    throw new Error("No blank canvas point found");
  });
}

async function viewportSnapshot(page) {
  return page.evaluate(() => ({
    transform: document.querySelector("#viewport-layer").getAttribute("transform"),
    translation: {
      x: document.querySelector("#viewport-layer").dataset.translateX,
      y: document.querySelector("#viewport-layer").dataset.translateY,
      scale: document.querySelector("#viewport-layer").dataset.scale,
    },
    nodeTransforms: [...document.querySelectorAll("[data-feature-id]")].map((node) => [
      node.dataset.featureId,
      node.getAttribute("transform"),
    ]),
    edgePaths: [...document.querySelectorAll("[data-edge]")].map((edge) => [
      edge.dataset.edge,
      edge.getAttribute("d"),
    ]),
  }));
}

test.beforeEach(async ({ page }) => {
  await page.goto("/web/");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
});

test("root state and adjudicated HLM branch", async ({ page }) => {
  const nodes = page.locator("[data-feature-id]");
  await expect(nodes).toHaveCount(5);
  await expect(page.locator('[data-feature-id="feat-olmo3-standard"]')).toHaveAttribute("aria-selected", "true");
  await expect(page.locator('[data-feature-id="feat-olmo3-standard"] .node-exp-label')).toHaveText("EXP · W&B");
  await expect(page.locator('[data-feature-id="feat-olmo3-standard"] .node-exp-summary')).toContainText("W&B report");
  await expect(page.locator("#detail-panel")).toHaveAttribute("aria-hidden", "true");
  await page.locator('[data-feature-id="feat-olmo3-standard"]').click();
  await expect(page.locator("#detail-panel")).toContainText("外部训练日志参考；不是 OLMo-3 标准态的 root provenance。");
  await page.locator("#detail-close").click();
  await expect(page.locator("#detail-panel")).toHaveAttribute("aria-hidden", "true");
  const initialIds = await nodes.evaluateAll((items) => items.map((item) => item.dataset.featureId));
  expect(new Set(initialIds)).toEqual(new Set([
    "feat-olmo3-standard",
    "feat-concept-segmented-topology",
    "feat-concept-chunk-representation",
    "feat-concept-self-dd",
    "feat-concept-cross-module-residual-read",
  ]));
  expect(initialIds).not.toContain("feat-data-quality-gate");
  expect(initialIds).not.toContain("feat-evaluation-harness");
  for (const id of initialIds.filter((id) => id !== "feat-olmo3-standard")) {
    await expect(page.locator(`[data-feature-id="${id}"] .validation-badge`)).toContainText("未验证");
    await expect(page.locator(`[data-feature-id="${id}"] .node-code-hint`)).not.toBeEmpty();
  }
  await page.screenshot({ path: screenshotPath("root-initial"), fullPage: true });
  await page.screenshot({ path: screenshotPath("desktop-initial"), fullPage: true });

  await page.locator('[data-toggle-id="feat-concept-segmented-topology"]').click();
  await page.locator('[data-toggle-id="feat-concept-hlm-predictor"]').click();
  await expect(nodes).toHaveCount(8);
  await expect(page.locator('[data-feature-id="feat-concept-hlm-backbone-window"]')).toBeVisible();
  await expect(page.locator('[data-feature-id="feat-concept-hlm-olmo3-layer-reuse"]')).toBeVisible();
  await expect(page.locator('[data-feature-id="feat-concept-hlm-olmo3-layer-reuse"] .validation-badge')).toHaveText(/条件性.*待等价性确认/);
  await expect(page.locator('[data-feature-id="feat-concept-hlm-olmo3-layer-reuse"] .node-code-hint')).toHaveText("hlm_block");
  const d08Box = await page.locator('[data-feature-id="feat-concept-hlm-olmo3-layer-reuse"]').boundingBox();
  const detailBox = await page.locator("#detail-panel").boundingBox();
  expect(d08Box.x + d08Box.width).toBeLessThanOrEqual(detailBox.x + 1);
  await page.locator('[data-feature-id="feat-concept-hlm-olmo3-layer-reuse"]').focus();
  await page.locator('[data-feature-id="feat-concept-hlm-olmo3-layer-reuse"]').press("Enter");
  await expect(page.locator("#detail-panel code").first()).toHaveText("feat-concept-hlm-olmo3-layer-reuse");
  await expect(page.locator("#detail-panel")).toContainText("暂无独立消融/效果证据");
  await expect(page.locator("#detail-panel")).toContainText("Downgrade to D04b implementation evidence");
  await page.screenshot({ path: screenshotPath("d08-conditional"), fullPage: true });
});

test("all 11 formal nodes are reachable, non-overlapping and keep the HLM siblings", async ({ page }) => {
  for (const id of [
    "feat-concept-segmented-topology",
    "feat-concept-hlm-predictor",
    "feat-concept-chunk-representation",
    "feat-concept-self-dd",
    "feat-concept-cross-module-residual-read",
  ]) {
    await page.locator(`[data-toggle-id="${id}"]`).click();
  }
  const nodes = page.locator("[data-feature-id]");
  await expect(nodes).toHaveCount(11);
  await expect(page.locator('[data-feature-id="feat-concept-hlm-backbone-window"]')).toBeVisible();
  await expect(page.locator('[data-feature-id="feat-concept-hlm-olmo3-layer-reuse"]')).toBeVisible();

  const overlapPairs = await nodes.evaluateAll((items) => {
    const boxes = items.map((item) => {
      const matrix = item.transform.baseVal.consolidate().matrix;
      const rect = item.querySelector(".node-panel");
      return { id: item.dataset.featureId, x: matrix.e, y: matrix.f, width: Number(rect.getAttribute("width")), height: Number(rect.getAttribute("height")) };
    });
    const overlaps = [];
    for (let left = 0; left < boxes.length; left += 1) {
      for (let right = left + 1; right < boxes.length; right += 1) {
        const a = boxes[left];
        const b = boxes[right];
        if (a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y) {
          overlaps.push([a.id, b.id]);
        }
      }
    }
    return overlaps;
  });
  expect(overlapPairs).toEqual([]);

  await page.getByRole("button", { name: "适配" }).click();
  const detailBox = await page.locator("#detail-panel").boundingBox();
  const workspaceBox = await page.locator(".tree-workspace").boundingBox();
  const visibleNodeBoxes = await nodes.evaluateAll((items) => items.map((item) => item.getBoundingClientRect().toJSON()));
  expect(visibleNodeBoxes.every((box) => box.right <= detailBox.x + 1 && box.left >= workspaceBox.x - 1)).toBe(true);
  await page.screenshot({ path: screenshotPath("formal-all-nodes"), fullPage: true });
});

test("selected detail and auxiliary dependency", async ({ page }) => {
  await page.locator('[data-feature-id="feat-concept-self-dd"]').click();
  await expect(page.locator("#detail-panel code").first()).toHaveText("feat-concept-self-dd");
  await expect(page.locator("#detail-panel")).toContainText("V21SelfDD");
  await expect(page.locator("#detail-panel")).toContainText("暂无独立消融/效果证据");
  await expect(page.locator("#detail-panel")).not.toContainText("已验证");
  await expect(page.locator("#detail-panel")).toContainText("分段拓扑骨架");
  await expect(page.locator("[data-auxiliary-edge]")).toHaveCount(1);
  await expect(page.locator("#detail-panel")).toHaveClass(/is-open/);
  await page.screenshot({ path: screenshotPath("selected-detail-dependency"), fullPage: true });
  await page.screenshot({ path: screenshotPath("selected-drawer"), fullPage: true });
});

test("structured locator is pinned, clickable and searchable without credentials", async ({ page }) => {
  await page.locator('[data-feature-id="feat-concept-self-dd"]').click();
  const detail = page.locator("#detail-panel");
  const headings = await detail.locator("h3").allTextContents();
  const requiredOrder = [
    "一句话结构作用 / 摘要",
    "相对父节点的变化",
    "设计 / 配置开关与参数",
    "实现 / 结构化代码定位",
    "验证 / 分析与结论",
    "Limitations / 来源与 provenance",
  ];
  const headingPositions = requiredOrder.map((heading) => headings.indexOf(heading));
  expect(headingPositions.every((position) => position >= 0)).toBe(true);
  expect(headingPositions).toEqual([...headingPositions].sort((a, b) => a - b));
  const link = detail.locator(".pinned-link").first();
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  expect(href).toMatch(/\/blob\/[0-9a-f]{40}\//);
  expect(href).not.toMatch(/token|auth|secret|credential/i);
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(detail).toContainText("Full revision");
  await expect(detail).toContainText("repo/megatron/core/models/gpt/conceptlm_v21.py");

  await page.locator("#feature-search").fill("V21SelfCumsumDD");
  await expect(page.locator("#search-results")).toContainText("Self-DD 累积式改写");
  await page.locator("#feature-search").fill("conceptlm_v22_vq.py");
  await expect(page.locator("#search-results")).toContainText("Product VQ 离散化");
});

test("search reveals a collapsed path and canvas controls work", async ({ page }) => {
  await page.locator("#feature-search").fill("Product VQ");
  await page.locator("#feature-search").press("Enter");
  await expect(page.locator('[data-feature-id="feat-concept-product-vq"]')).toBeVisible();
  await expect(page.locator("#detail-panel code").first()).toHaveText("feat-concept-product-vq");
  await page.getByRole("button", { name: "1:1" }).click();
  await expect(page.locator("#zoom-output")).toHaveText("100%");
});

test("shows explicit failure instead of using fallback data", async ({ page }) => {
  await page.route("**/data/feature-tree.json", (route) => route.fulfill({ status: 404, body: "missing" }));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-ready", "error");
  await expect(page.locator("#empty-state")).toContainText("返回 404");
});

test("mobile keeps horizontal overflow inside the canvas", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
  const metrics = await page.evaluate(() => ({
    pageWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    canvasScrollWidth: document.querySelector("#canvas-scroller").scrollWidth,
    canvasClientWidth: document.querySelector("#canvas-scroller").clientWidth,
  }));
  expect(metrics.pageWidth).toBe(metrics.viewportWidth);
  expect(metrics.canvasScrollWidth).toBeGreaterThan(metrics.canvasClientWidth);
});

test("pointer pan changes only viewport transform and preserves node click", async ({ page }) => {
  const initial = await viewportSnapshot(page);
  const blank = await blankCanvasPoint(page);

  await page.mouse.move(blank.x, blank.y);
  await page.mouse.down();
  await page.mouse.move(blank.x + 3, blank.y + 3);
  await page.mouse.up();
  expect((await viewportSnapshot(page)).transform).toBe(initial.transform);

  await page.locator('[data-feature-id="feat-concept-self-dd"]').click();
  await expect(page.locator("#detail-panel code").first()).toHaveText("feat-concept-self-dd");
  await page.getByRole("button", { name: "放大" }).click();
  const zoomed = await viewportSnapshot(page);

  await page.mouse.move(blank.x, blank.y);
  await page.mouse.down();
  await page.mouse.move(blank.x + 96, blank.y - 58, { steps: 5 });
  await page.mouse.up();

  const panned = await viewportSnapshot(page);
  expect(panned.transform).not.toBe(zoomed.transform);
  expect(panned.translation.scale).toBe(zoomed.translation.scale);
  expect(panned.nodeTransforms).toEqual(zoomed.nodeTransforms);
  expect(panned.edgePaths).toEqual(zoomed.edgePaths);
  await expect(page.locator("#detail-panel code").first()).toHaveText("feat-concept-self-dd");

  const layersAligned = await page.evaluate(() => {
    const edgeMatrix = document.querySelector("#edge-layer").getCTM();
    const nodeMatrix = document.querySelector("#node-layer").getCTM();
    return ["a", "b", "c", "d", "e", "f"].every((key) => edgeMatrix[key] === nodeMatrix[key]);
  });
  expect(layersAligned).toBe(true);

  const beforeSidebarDrag = (await viewportSnapshot(page)).transform;
  const detailBox = await page.locator("#detail-panel").boundingBox();
  await page.mouse.move(detailBox.x + 40, detailBox.y + 180);
  await page.mouse.down();
  await page.mouse.move(detailBox.x + 40, detailBox.y + 100);
  await page.mouse.up();
  expect((await viewportSnapshot(page)).transform).toBe(beforeSidebarDrag);

  await page.waitForTimeout(420);
  await page.locator('[data-feature-id="feat-concept-chunk-representation"]').click();
  await expect(page.locator("#detail-panel code").first()).toHaveText("feat-concept-chunk-representation");
  await page.screenshot({ path: screenshotPath("canvas-panned"), fullPage: true });
});

test("1:1, fit and reload restore predictable viewport states", async ({ page }) => {
  const initial = await viewportSnapshot(page);
  const blank = await blankCanvasPoint(page);
  await page.mouse.move(blank.x, blank.y);
  await page.mouse.down();
  await page.mouse.move(blank.x + 80, blank.y + 45);
  await page.mouse.up();
  expect((await viewportSnapshot(page)).transform).not.toBe(initial.transform);

  await page.getByRole("button", { name: "1:1" }).click();
  await expect(page.locator("#viewport-layer")).toHaveAttribute("transform", "translate(0 0) scale(1)");
  await page.getByRole("button", { name: "适配" }).click();
  expect((await viewportSnapshot(page)).transform).toBe(initial.transform);

  await page.mouse.move(blank.x, blank.y);
  await page.mouse.down();
  await page.mouse.move(blank.x - 70, blank.y - 30);
  await page.mouse.up();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
  expect((await viewportSnapshot(page)).transform).toBe(initial.transform);
  await expect(page.locator('[data-feature-id="feat-olmo3-standard"]')).toHaveAttribute("aria-selected", "true");
});

test("mobile touch pointer pan does not scroll the page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
  const blank = await blankCanvasPoint(page);
  const initial = await viewportSnapshot(page);
  const beforeScroll = await page.evaluate(() => ({ x: scrollX, y: scrollY, top: document.documentElement.scrollTop }));
  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: blank.x, y: blank.y, id: 1, radiusX: 1, radiusY: 1, force: 1 }],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: blank.x - 72, y: blank.y + 38, id: 1, radiusX: 1, radiusY: 1, force: 1 }],
  });
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

  expect((await viewportSnapshot(page)).transform).not.toBe(initial.transform);
  expect(await page.evaluate(() => ({ x: scrollX, y: scrollY, top: document.documentElement.scrollTop }))).toEqual(beforeScroll);
  await expect(page.locator("#tree-canvas")).not.toHaveClass(/is-panning/);
});

test("bilingual display prefers Chinese without changing layout or interactions", async ({ page }) => {
  await loadFeaturePayload(page, legacyFixture);
  await page.locator('[data-toggle-id="feat-context-prediction"]').click();
  const legacyLayout = (await viewportSnapshot(page)).nodeTransforms;

  await loadFeaturePayload(page, bilingualFixture);
  await expect(page.locator('[data-feature-id="feat-context-prediction"] .node-title')).toHaveText("上下文预测");
  await expect(page.locator('[data-feature-id="feat-optimizer-stability"] .node-title')).toHaveText("Optimizer stability");
  await page.locator('[data-toggle-id="feat-context-prediction"]').click();
  expect((await viewportSnapshot(page)).nodeTransforms).toEqual(legacyLayout);

  const longTitleNode = page.locator('[data-feature-id="feat-context-window"]');
  await expect(longTitleNode.locator(".node-title")).toHaveText(/…$/);
  await expect(longTitleNode.locator(".node-panel")).toHaveAttribute("height", "100");
  await longTitleNode.click();
  await expect(page.locator("#detail-panel h1")).toHaveText("这是一个用于验证紧凑截断规则的超长中文功能标题");
  await expect(page.locator(".detail-title-en")).toHaveText("Longer context window");
  await expect(page.locator("#detail-panel")).toContainText("扩展训练上下文长度，同时保持节点高度不变。");
  await expect(page.locator("#detail-panel")).toContainText("上下文预测");
  await expect(page.locator("#detail-panel")).toContainText("令牌路由 · feat-token-routing");
  await page.screenshot({ path: screenshotPath("bilingual-display"), fullPage: true });

  await page.locator('[data-feature-id="feat-context-prediction"]').click();
  await expect(page.locator("#detail-panel")).toContainText("令牌路由 · feat-token-routing");

  for (const query of ["令牌路由", "Token routing", "显式上下文信号", "Adds a context prediction objective", "feat-context-prediction"]) {
    await page.locator("#feature-search").fill(query);
    await expect(page.locator("#search-results strong").first()).toBeVisible();
  }
  await page.locator("#feature-search").fill("Token routing");
  await expect(page.locator("#search-results strong").first()).toHaveText("令牌路由");

  const beforePan = (await viewportSnapshot(page)).transform;
  const blank = await blankCanvasPoint(page);
  await page.mouse.move(blank.x, blank.y);
  await page.mouse.down();
  await page.mouse.move(blank.x + 72, blank.y - 36);
  await page.mouse.up();
  expect((await viewportSnapshot(page)).transform).not.toBe(beforePan);
  await page.waitForTimeout(420);
  await page.locator('[data-feature-id="feat-token-routing"]').click();
  await expect(page.locator("#detail-panel code").first()).toHaveText("feat-token-routing");
});

test("search and detail render bilingual values as text, not HTML", async ({ page }) => {
  const maliciousFixture = structuredClone(bilingualFixture);
  const feature = maliciousFixture.features.find((item) => item.id === "feat-optimizer-stability");
  feature.title_zh = '<img src=x onerror="window.__webXss=1">';
  feature.summary_zh = "摘要 <script>window.__webXss=2</script>";
  await loadFeaturePayload(page, maliciousFixture);
  await page.locator("#feature-search").fill("img src");
  await expect(page.locator("#search-results strong").first()).toHaveText(feature.title_zh);
  await expect(page.locator("#search-results img, #search-results script")).toHaveCount(0);
  await page.locator("#search-results button").first().click();
  await expect(page.locator("#detail-panel h1")).toHaveText(feature.title_zh);
  await expect(page.locator("#detail-panel img, #detail-panel script")).toHaveCount(0);
  expect(await page.evaluate(() => window.__webXss)).toBeUndefined();
});

test("canonical stats and experiment cursors remain visibly separated and stoppable", async ({ page }) => {
  await expect(page.locator(".canonical-stats .stat-source")).toHaveText("CANONICAL");
  await expect(page.locator("#stat-features")).toHaveText("11");
  await expect(page.locator("#stat-categories")).toHaveText("1");
  await expect(page.locator("#stat-code-pinned")).toHaveText("10");
  await expect(page.locator("#stat-validation")).toContainText("未验证");
  await expect(page.locator(".experiment-stats .stat-source")).toContainText("EXPERIMENTS");
  await expect(page.locator("#experiment-count")).toHaveText("2");
  await expect(page.locator("#experiment-completed")).toHaveText("0");
  await expect(page.locator("#experiment-final-loss")).toHaveText("—");
  await expect(page.locator("html")).toHaveAttribute("data-telemetry-source", "experiment-replay");

  const firstTick = Number(await page.locator("html").getAttribute("data-telemetry-tick"));
  await expect.poll(async () => Number(await page.locator("html").getAttribute("data-telemetry-tick"))).toBeGreaterThan(firstTick);
  await page.screenshot({ path: screenshotPath("telemetry-running"), fullPage: true });

  await page.locator("#telemetry-toggle").click();
  await expect(page.locator("#telemetry-toggle")).toHaveAttribute("aria-pressed", "false");
  const stoppedTick = await page.locator("html").getAttribute("data-telemetry-tick");
  await page.waitForTimeout(1800);
  expect(await page.locator("html").getAttribute("data-telemetry-tick")).toBe(stoppedTick);
  await expect(page.locator("#experiment-replay")).toHaveText("0");

  const canonicalText = await page.evaluate(() => {
    const resource = performance.getEntriesByType("resource").find((entry) => entry.name.includes("feature-tree.json"));
    return fetch(resource.name).then((response) => response.text());
  });
  expect(canonicalText).not.toMatch(/DEMO telemetry|"simulated"|"sparkline"/i);
  const experimentText = await page.evaluate(() => {
    const resource = performance.getEntriesByType("resource").find((entry) => entry.name.includes("experiments.json"));
    return fetch(resource.name).then((response) => response.text());
  });
  expect(experimentText).toMatch(/covered_feature_ids/);
});

test("category filter only dims presentation and never changes the tree", async ({ page }) => {
  const before = await viewportSnapshot(page);
  const chip = page.locator('#category-filters [data-category="architecture"]');
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator('[data-feature-id="feat-concept-self-dd"]')).toHaveClass(/is-category-dimmed/);
  await expect(page.locator('[data-feature-id="feat-olmo3-standard"]')).not.toHaveClass(/is-category-dimmed/);
  const after = await viewportSnapshot(page);
  expect(after.nodeTransforms).toEqual(before.nodeTransforms);
  expect(after.edgePaths).toEqual(before.edgePaths);
  await expect(page.locator("[data-feature-id]")).toHaveCount(5);
});

test("reduced motion freezes experiment replay at the first snapshot", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
  const tick = await page.locator("html").getAttribute("data-telemetry-tick");
  await page.waitForTimeout(1800);
  expect(await page.locator("html").getAttribute("data-telemetry-tick")).toBe(tick);
});

test("drawer restores canvas width and mobile uses a non-overflowing bottom overlay", async ({ page }) => {
  const initialWidth = (await page.locator(".tree-workspace").boundingBox()).width;
  await page.locator('[data-feature-id="feat-concept-self-dd"]').click();
  await expect(page.locator("#detail-panel")).toHaveAttribute("aria-hidden", "false");
  expect((await page.locator(".tree-workspace").boundingBox()).width).toBeLessThan(initialWidth);
  await page.locator("#detail-close").click();
  await expect(page.locator("#detail-panel")).toHaveAttribute("aria-hidden", "true");
  await expect.poll(async () => (await page.locator(".tree-workspace").boundingBox()).width).toBe(initialWidth);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.locator('[data-feature-id="feat-concept-self-dd"]').click();
  const metrics = await page.evaluate(() => ({
    pageWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    drawerWidth: document.querySelector("#detail-panel").getBoundingClientRect().width,
  }));
  expect(metrics.pageWidth).toBe(metrics.viewportWidth);
  expect(metrics.drawerWidth).toBe(metrics.viewportWidth);
  await page.screenshot({ path: screenshotPath("mobile-390"), fullPage: true });
});
