import { readdir, readFile } from "node:fs/promises";
import { expect, test } from "../../web/node_modules/@playwright/test/index.mjs";

const repositoryRoot = new URL("../../", import.meta.url);
const webRoot = new URL("../../web/", import.meta.url);
const canonical = JSON.parse(await readFile(new URL("../../data/feature-tree.json", import.meta.url), "utf8"));
const cssSource = await readFile(new URL("../../web/styles.css", import.meta.url), "utf8");
const indexSource = await readFile(new URL("../../web/index.html", import.meta.url), "utf8");
const srcNames = (await readdir(new URL("../../web/src/", import.meta.url))).filter((name) => name.endsWith(".js"));
const srcSources = Object.fromEntries(await Promise.all(srcNames.map(async (name) => [
  name,
  await readFile(new URL(`../../web/src/${name}`, import.meta.url), "utf8"),
])));

const root = canonical.features.find((feature) => feature.parent_id == null);
const firstLevel = canonical.features.filter((feature) => feature.parent_id === root.id);
const forbiddenCanvasWords = /synthetic|年代|era\b|lane\b|时间轴/i;

function drawerLocator(page) {
  return page.locator("#detail-drawer, [data-detail-drawer], #detail-panel").first();
}

async function isDrawerOpen(drawer) {
  if (await drawer.count() === 0) return false;
  return drawer.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const state = element.getAttribute("data-state");
    const ariaHidden = element.getAttribute("aria-hidden");
    const explicitlyOpen = state === "open" || element.classList.contains("open") || element.classList.contains("is-open");
    const visiblyIntersecting = style.display !== "none"
      && style.visibility !== "hidden"
      && Number(style.opacity || 1) > 0
      && rect.width > 1
      && rect.height > 1
      && rect.right > 0
      && rect.left < innerWidth
      && rect.bottom > 0
      && rect.top < innerHeight;
    return ariaHidden !== "true" && state !== "closed" && (explicitlyOpen || visiblyIntersecting);
  });
}

async function visibleTexts(locator) {
  return locator.evaluateAll((elements) => elements
    .filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    })
    .map((element) => element.textContent.trim()));
}

function intersectionArea(a, b) {
  return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
}

test.beforeEach(async ({ page }) => {
  await page.goto("/web/");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
});

test("dark visual tokens, fixed glass header, canonical and experiment sources stay distinct", async ({ page }) => {
  expect(cssSource).toMatch(/color-scheme\s*:\s*dark/i);
  expect(cssSource).toMatch(/radial-gradient/i);
  expect(cssSource).toMatch(/(?:repeating-)?linear-gradient|background-size/i);
  expect(cssSource).toMatch(/backdrop-filter\s*:\s*blur/i);

  const visual = await page.evaluate(() => {
    const rootStyle = getComputedStyle(document.documentElement);
    const bodyStyle = getComputedStyle(document.body);
    const canvas = document.querySelector("#canvas-scroller, .canvas-scroller, [data-tree-canvas]");
    const canvasStyle = canvas ? getComputedStyle(canvas) : null;
    const header = document.querySelector("header, [role=banner]");
    const headerStyle = header ? getComputedStyle(header) : null;
    return {
      colorScheme: `${rootStyle.colorScheme} ${bodyStyle.colorScheme}`,
      bodyBackground: `${bodyStyle.backgroundImage} ${bodyStyle.backgroundColor}`,
      canvasBackground: canvasStyle ? `${canvasStyle.backgroundImage} ${canvasStyle.backgroundColor}` : "",
      headerPosition: headerStyle?.position ?? "",
      headerBackdrop: headerStyle?.backdropFilter ?? "",
    };
  });
  expect(visual.colorScheme).toContain("dark");
  expect(`${visual.bodyBackground} ${visual.canvasBackground}`).toContain("radial-gradient");
  expect(visual.canvasBackground).toMatch(/gradient/i);
  expect(["fixed", "sticky"]).toContain(visual.headerPosition);
  expect(visual.headerBackdrop).toMatch(/blur/i);

  const canonicalStats = page.locator("[data-source='canonical'], [data-canonical-stat], .canonical-stat, .canonical-stats");
  const experimentStats = page.locator(".experiment-stats, [data-experiment-stats]");
  expect((await visibleTexts(canonicalStats)).length).toBeGreaterThan(0);
  expect((await visibleTexts(experimentStats)).join(" ")).toMatch(/EXPERIMENTS|W&B|Final loss/i);
  await expect(page.locator("[data-source='canonical'].experiment-stats")).toHaveCount(0);
});

test("first viewport is only the root plus four structural branches with no era or lane forest", async ({ page }) => {
  const nodes = page.locator("#node-layer [data-feature-id]");
  await expect(nodes).toHaveCount(1 + firstLevel.length);
  const rendered = new Set(await nodes.evaluateAll((elements) => elements.map((element) => element.dataset.featureId)));
  expect(rendered).toEqual(new Set([root.id, ...firstLevel.map((feature) => feature.id)]));
  expect(firstLevel).toHaveLength(4);
  await expect(page.locator(".era-band, .lane-label, [data-era], [data-lane]")).toHaveCount(0);
  expect((await page.locator("body").innerText())).not.toMatch(forbiddenCanvasWords);
  expect([...rendered].every((id) => canonical.features.some((feature) => feature.id === id))).toBeTruthy();
});

test("nodes expose restrained category accent, validation, symbol and experiment coverage marker", async ({ page }) => {
  expect(cssSource).toMatch(/category/i);
  const nodes = page.locator("#node-layer [data-feature-id]");
  for (const feature of firstLevel) {
    const node = page.locator(`#node-layer [data-feature-id='${feature.id}']`);
    const categoryMarker = await node.evaluate((element) => `${element.dataset.category ?? ""} ${element.className.baseVal ?? element.className}`);
    expect(categoryMarker).toMatch(/architecture|model_configuration|training_configuration|data|runtime/);
    await expect(node.locator(".validation-badge, [data-validation-badge]")).toHaveCount(1);
    const symbol = node.locator(".node-code-hint, [data-symbol-summary]");
    await expect(symbol).toHaveCount(1);
    await expect(symbol).not.toHaveText("");
    const sparkline = node.locator(".node-sparkline, [data-sparkline]");
    await expect(sparkline).toHaveCount(1);
    await expect(node.locator(".node-exp-label, [data-exp-label]")).toHaveCount(1);
    await expect(node).toContainText(/EXP|run/i);
  }
});

test("drawer is closed by default, opens on node click, contains complete research fields and closes cleanly", async ({ page }) => {
  const drawer = drawerLocator(page);
  await expect(drawer).toHaveCount(1);
  expect(await isDrawerOpen(drawer)).toBeFalsy();

  await page.locator("[data-feature-id='feat-concept-self-dd']").click();
  expect(await isDrawerOpen(drawer)).toBeTruthy();
  const detailText = await drawer.innerText();
  for (const field of ["摘要", "假设", "设计", "相对父节点", "代码", "验证", "证据", "来源"]) {
    expect(detailText).toContain(field);
  }
  expect(detailText).toMatch(/repository|revision|path|symbol/i);
  expect(detailText).toMatch(/effect|validation|unverified|未验证/i);
  expect(detailText).toMatch(/provenance|来源/i);

  const close = drawer.locator("[data-action='close-detail'], [data-drawer-close], button[aria-label*='关闭']").first();
  await expect(close).toBeVisible();
  await close.click();
  expect(await isDrawerOpen(drawer)).toBeFalsy();
  await expect(page.locator("#tree-canvas, [data-tree-canvas]").first()).toBeVisible();
});

test("structural and auxiliary edges have separate semantics", async ({ page }) => {
  const nodes = page.locator("#node-layer [data-feature-id]");
  const structural = page.locator("#edge-layer [data-edge], [data-structural-edge]");
  const auxiliary = page.locator("#dependency-layer [data-auxiliary-edge], [data-auxiliary-edge]");
  await expect(structural).toHaveCount((await nodes.count()) - 1);
  await expect(auxiliary).toHaveCount(0);

  const structuralStyle = await structural.first().evaluate((element) => {
    const style = getComputedStyle(element);
    return { dash: style.strokeDasharray, opacity: style.opacity };
  });
  expect(structuralStyle.dash === "none" || structuralStyle.dash === "0px").toBeTruthy();

  await page.locator("[data-feature-id='feat-concept-self-dd']").click();
  expect(await auxiliary.count()).toBeGreaterThan(0);
  const auxiliaryStyle = await auxiliary.first().evaluate((element) => {
    const style = getComputedStyle(element);
    return { dash: style.strokeDasharray, opacity: Number(style.opacity) };
  });
  expect(auxiliaryStyle.dash).not.toBe(structuralStyle.dash);
  expect(auxiliaryStyle.opacity).toBeLessThanOrEqual(1);
});

test("desktop and mobile layouts avoid node overlap, drawer occlusion and page-level horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
  for (const feature of canonical.features.filter((item) => canonical.features.some((child) => child.parent_id === item.id))) {
    const node = page.locator(`[data-feature-id='${feature.id}']`);
    if (await node.count() && await node.getAttribute("aria-expanded") === "false") {
      await page.locator(`[data-toggle-id='${feature.id}']`).click();
    }
  }
  await expect(page.locator("#node-layer [data-feature-id]")).toHaveCount(canonical.features.length);
  await page.locator("[data-feature-id='feat-concept-hlm-olmo3-layer-reuse']").click();
  const drawer = drawerLocator(page);
  expect(await isDrawerOpen(drawer)).toBeTruthy();
  const boxes = (await page.locator("#node-layer [data-feature-id]").evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { id: element.dataset.featureId, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  })));
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      expect(intersectionArea(boxes[i], boxes[j]), `${boxes[i].id} overlaps ${boxes[j].id}`).toBeLessThan(1);
    }
  }
  const drawerBox = await drawer.boundingBox();
  expect(boxes.every((nodeBox) => nodeBox.x + nodeBox.width <= drawerBox.x + 1)).toBeTruthy();
  await drawer.locator("#detail-close, [data-action='close-detail'], [data-drawer-close], button[aria-label*='关闭']").first().click();
  expect(await isDrawerOpen(drawer)).toBeFalsy();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
  const overflow = await page.evaluate(() => ({
    html: document.documentElement.scrollWidth - innerWidth,
    body: document.body.scrollWidth - innerWidth,
  }));
  expect(overflow.html).toBeLessThanOrEqual(1);
  expect(overflow.body).toBeLessThanOrEqual(1);
});

test("pan zoom search keyboard and reduced-motion remain operable", async ({ page }) => {
  const viewport = page.locator("#viewport-layer");
  const scaleBefore = Number(await viewport.getAttribute("data-scale"));
  await page.locator("[data-action='zoom-in']").click();
  expect(Number(await viewport.getAttribute("data-scale"))).toBeGreaterThan(scaleBefore);
  await page.locator("[data-action='actual-size']").click();
  await expect(page.locator("#zoom-output")).toHaveText("100%");

  const canvas = page.locator("#tree-canvas");
  const box = await canvas.boundingBox();
  const x = box.x + 52;
  const y = box.y + 190;
  const txBefore = Number(await viewport.getAttribute("data-translate-x"));
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 70, y - 35, { steps: 4 });
  await page.mouse.up();
  expect(Number(await viewport.getAttribute("data-translate-x"))).not.toBe(txBefore);

  await page.locator("#feature-search").fill("Product VQ");
  await page.locator("#feature-search").press("Enter");
  await expect(page.locator("[data-feature-id='feat-concept-product-vq']")).toBeVisible();

  const node = page.locator("[data-feature-id='feat-concept-product-vq']");
  await node.focus();
  await node.press("Enter");
  expect(await isDrawerOpen(drawerLocator(page))).toBeTruthy();

  await page.emulateMedia({ reducedMotion: "reduce" });
  const motion = await node.evaluate((element) => {
    const style = getComputedStyle(element);
    return `${style.animationDuration} ${style.transitionDuration}`;
  });
  expect(motion).toMatch(/(?:^|\s)0s(?:\s|$)/);
  expect(cssSource).toMatch(/prefers-reduced-motion\s*:\s*reduce/i);
});

test("local root, web, canonical data, experiment data, CSS and JS assets all return 200", async ({ request }) => {
  for (const path of ["/", "/web/", "/data/feature-tree.json", "/data/experiments.json", "/web/styles.css", "/web/src/app.js"]) {
    const response = await request.get(path, { failOnStatusCode: false });
    expect(response.status(), path).toBe(200);
  }
});

test("GitHub Pages root, web, canonical data, experiment data, CSS and JS assets all return 200", async ({ playwright }, testInfo) => {
  const context = await playwright.request.newContext({
    baseURL: "https://inuyashayang.github.io",
    ignoreHTTPSErrors: false,
  });
  const results = [];
  try {
    for (const path of [
      "/InternSpace/",
      "/InternSpace/web/",
      "/InternSpace/data/feature-tree.json",
      "/InternSpace/data/experiments.json",
      "/InternSpace/web/styles.css",
      "/InternSpace/web/src/app.js",
    ]) {
      const response = await context.get(path, { failOnStatusCode: false, timeout: 15_000 });
      results.push({ path, status: response.status() });
    }
  } catch (error) {
    testInfo.annotations.push({ type: "unresolved", description: `external network: ${error.message}` });
    test.skip(true, `GitHub Pages could not be reached from this runner: ${error.message}`);
  } finally {
    await context.dispose();
  }
  for (const result of results) expect(result.status, result.path).toBe(200);
});

test("ExperimentReplayProvider is deterministic, disableable and never mutates canonical research evidence", async ({ page }) => {
  const telemetryEntry = Object.entries(srcSources).find(([, source]) => /export\s+class\s+ExperimentReplayProvider/.test(source));
  expect(telemetryEntry, "web/src must export ExperimentReplayProvider").toBeTruthy();
  const [fileName, telemetrySource] = telemetryEntry;
  expect(telemetrySource).not.toMatch(/Math\.random\s*\(/);

  const providerContract = await page.evaluate(async (moduleUrl) => {
    const module = await import(moduleUrl);
    const Provider = module.ExperimentReplayProvider;
    if (typeof Provider !== "function") return { error: "missing named ExperimentReplayProvider export" };
    const experiment = {
      id: "exp-visual",
      status: "running",
      cursor_type: "wandb-replay",
      covered_feature_ids: ["feat-concept-self-dd"],
      final_metrics: { loss: 1.11 },
      replay: { enabled: true, source: "wandb", loss_trace: [1.5, 1.4, 1.3] },
    };
    const normalize = (snapshot) => ({
      source: snapshot?.source,
      replay: snapshot?.replay,
      live: snapshot?.live,
      tick: snapshot?.tick,
      aggregate: snapshot?.aggregate,
      byExperiment: snapshot?.byExperiment instanceof Map ? [...snapshot.byExperiment.entries()] : snapshot?.byExperiment,
    });
    const invoke = async (provider) => {
      const method = provider.snapshot ?? provider.sample ?? provider.getSnapshot ?? provider.get;
      if (typeof method !== "function") return { error: "missing snapshot/sample/getSnapshot/get method" };
      return normalize(await method.call(provider, [experiment], 2));
    };
    const first = await invoke(new Provider());
    const second = await invoke(new Provider());
    let callbackCount = 0;
    const stop = new Provider().start(
      [experiment],
      () => { callbackCount += 1; },
      { reducedMotion: true },
    );
    stop();
    return { first, second, callbackCount, stopType: typeof stop };
  }, `/web/src/${fileName}`);
  expect(providerContract.error).toBeUndefined();
  expect(providerContract.first).toEqual(providerContract.second);
  expect(providerContract.first?.replay).toBe(true);
  expect(providerContract.first?.live).toBe(false);
  expect(providerContract.stopType).toBe("function");
  expect(providerContract.callbackCount).toBe(1);

  const telemetryToggle = page.locator("#telemetry-toggle, [data-telemetry-toggle]").first();
  await expect(telemetryToggle).toBeVisible();
  await expect(telemetryToggle).toHaveAttribute("aria-pressed", "true");
  await telemetryToggle.click();
  await expect(telemetryToggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#app-shell, .app-shell").first()).toHaveClass(/telemetry-off/);

  const researchPayload = canonical.features.map((feature) => ({
    id: feature.id,
    experiments: feature.experiments,
    validation: feature.validation,
    evidence: feature.evidence,
    provenance: feature.provenance,
  }));
  expect(JSON.stringify(researchPayload)).not.toMatch(/demo[_ -]?telemetry|"simulated"\s*:\s*true|\bSIM\b/i);

  const before = await (await page.request.get("/data/feature-tree.json")).json();
  await page.reload();
  const after = await (await page.request.get("/data/feature-tree.json")).json();
  expect(after).toEqual(before);
});

test("capture reference, desktop, drawer and mobile screenshots outside Git", async ({ page }) => {
  await page.goto("file:///home/inuyasha/Lumia/index(1).html");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: "/tmp/internspace-reference-1440x900.png", fullPage: false });

  await page.goto("http://127.0.0.1:4173/web/");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
  await page.screenshot({ path: "/tmp/internspace-local-1440x900.png", fullPage: false });
  await page.locator("[data-feature-id='feat-concept-self-dd']").click();
  await page.screenshot({ path: "/tmp/internspace-local-drawer-1440x900.png", fullPage: false });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true");
  await page.screenshot({ path: "/tmp/internspace-local-390x844.png", fullPage: false });
});
