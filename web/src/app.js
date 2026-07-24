import { ExperimentIndexDataError, FeatureTreeDataError, loadExperimentIndex, loadFeatureTree } from "./data-adapter.js";
import { compactFeatureTitle, featureEnglishSubtitle, featureTitle, matchesFeatureSearch } from "./feature-display.js";
import { featureValidation, primaryCodeHint, structuredCodeLocators } from "./feature-view-model.js";
import { ancestorIds, boundsForIds, layoutTree, visibleFeatureIds } from "./tree-layout.js";
import { renderDetail } from "./detail-view.js";
import { ExperimentReplayProvider } from "./telemetry.js";
import { exceedsPanThreshold, translatedViewport } from "./viewport-state.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const CATEGORY_META = Object.freeze({
  architecture: { label: "Architecture", color: "#22d3ee" },
  model_configuration: { label: "Model config", color: "#a855f7" },
  training_configuration: { label: "Training config", color: "#34d399" },
  data: { label: "Data", color: "#fb923c" },
  runtime: { label: "Runtime", color: "#60a5fa" },
  baseline: { label: "Baseline", color: "#7dd3fc" },
});
const elements = {
  app: document.querySelector("#app-shell"),
  svg: document.querySelector("#tree-canvas"),
  viewport: document.querySelector("#viewport-layer"),
  nodes: document.querySelector("#node-layer"),
  edges: document.querySelector("#edge-layer"),
  dependencies: document.querySelector("#dependency-layer"),
  scroller: document.querySelector("#canvas-scroller"),
  detail: document.querySelector("#detail-panel"),
  detailContent: document.querySelector("#detail-content"),
  detailClose: document.querySelector("#detail-close"),
  search: document.querySelector("#feature-search"),
  searchResults: document.querySelector("#search-results"),
  zoomOutput: document.querySelector("#zoom-output"),
  empty: document.querySelector("#empty-state"),
  emptyMessage: document.querySelector("#empty-message"),
  categoryFilters: document.querySelector("#category-filters"),
  telemetryToggle: document.querySelector("#telemetry-toggle"),
  statFeatures: document.querySelector("#stat-features"),
  statCategories: document.querySelector("#stat-categories"),
  statCodePinned: document.querySelector("#stat-code-pinned"),
  statValidation: document.querySelector("#stat-validation"),
  experimentCount: document.querySelector("#experiment-count"),
  experimentCompleted: document.querySelector("#experiment-completed"),
  experimentFinalLoss: document.querySelector("#experiment-final-loss"),
  experimentReplay: document.querySelector("#experiment-replay"),
};

const state = {
  tree: null,
  experimentIndex: null,
  layout: null,
  expanded: new Set(),
  selectedId: null,
  scale: 1,
  translateX: 0,
  translateY: 0,
  pan: null,
  suppressClickUntil: 0,
  drawerOpen: false,
  enabledCategories: new Set(),
  telemetryEnabled: true,
  telemetrySnapshot: null,
  stopTelemetry: null,
  telemetryProvider: new ExperimentReplayProvider(),
};

function featureCategory(feature) {
  return feature?.kind === "baseline" ? "baseline" : feature?.category ?? "architecture";
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function curveBetween(source, target) {
  const startX = source.x + state.layout.config.nodeWidth;
  const startY = source.y + state.layout.config.nodeHeight / 2;
  const endX = target.x;
  const endY = target.y + state.layout.config.nodeHeight / 2;
  const midX = startX + (endX - startX) * 0.5;
  return `M${startX},${startY} C${midX},${startY} ${midX},${endY} ${endX},${endY}`;
}

function dependencyCurve(source, target) {
  const sourceX = source.x + state.layout.config.nodeWidth / 2;
  const sourceY = source.y + state.layout.config.nodeHeight / 2;
  const targetX = target.x + state.layout.config.nodeWidth / 2;
  const targetY = target.y + state.layout.config.nodeHeight / 2;
  const bend = Math.max(45, Math.abs(targetY - sourceY) * 0.35);
  return `M${sourceX},${sourceY} C${sourceX},${sourceY - bend} ${targetX},${targetY - bend} ${targetX},${targetY}`;
}

function renderTree() {
  if (!state.tree) return;
  const visible = visibleFeatureIds(state.tree, state.expanded);
  elements.nodes.replaceChildren();
  elements.edges.replaceChildren();
  elements.dependencies.replaceChildren();

  for (const id of visible) {
    const feature = state.tree.byId.get(id);
    if (!feature.parent_id || !visible.has(feature.parent_id)) continue;
    elements.edges.append(svgElement("path", {
      d: curveBetween(state.layout.positions.get(feature.parent_id), state.layout.positions.get(id)),
      class: "structure-edge",
      "data-edge": `${feature.parent_id}:${id}`,
    }));
  }

  if (state.selectedId && visible.has(state.selectedId)) {
    const selected = state.tree.byId.get(state.selectedId);
    const source = state.layout.positions.get(state.selectedId);
    const references = [
      ...selected.depends_on.map((id) => ({ id, type: "depends" })),
      ...selected.related_to.map((id) => ({ id, type: "related" })),
    ];
    for (const reference of references) {
      if (!visible.has(reference.id) || reference.id === state.selectedId) continue;
      elements.dependencies.append(svgElement("path", {
        d: dependencyCurve(source, state.layout.positions.get(reference.id)),
        class: `auxiliary-edge auxiliary-${reference.type}`,
        "data-auxiliary-edge": `${state.selectedId}:${reference.id}`,
        "marker-end": "url(#dependency-arrow)",
      }));
    }
  }

  const emphasized = new Set();
  if (state.drawerOpen && state.selectedId && state.selectedId !== state.tree.rootId) {
    const selected = state.tree.byId.get(state.selectedId);
    emphasized.add(state.selectedId);
    for (const id of ancestorIds(state.tree, state.selectedId)) emphasized.add(id);
    for (const child of state.tree.childrenById.get(state.selectedId) ?? []) emphasized.add(child.id);
    for (const id of [...selected.depends_on, ...selected.related_to]) emphasized.add(id);
  }

  for (const id of visible) {
    const feature = state.tree.byId.get(id);
    const displayTitle = featureTitle(feature);
    const validation = featureValidation(feature);
    const codeHint = primaryCodeHint(feature);
    const category = featureCategory(feature);
    const categoryMeta = CATEGORY_META[category] ?? CATEGORY_META.architecture;
    const point = state.layout.positions.get(id);
    const children = state.tree.childrenById.get(id) ?? [];
    const dimmed = emphasized.size && !emphasized.has(id);
    const categoryDimmed = category !== "baseline" && !state.enabledCategories.has(category);
    const group = svgElement("g", {
      class: `feature-node category-${category} validation-${validation.key}${state.selectedId === id ? " is-selected" : ""}${dimmed ? " is-dimmed" : ""}${categoryDimmed ? " is-category-dimmed" : ""}`,
      transform: `translate(${point.x} ${point.y})`,
      tabindex: "0",
      role: "treeitem",
      "aria-label": `${displayTitle}，${validation.label}${codeHint ? `，代码 ${codeHint}` : ""}`,
      "aria-selected": state.selectedId === id ? "true" : "false",
      "aria-expanded": children.length ? String(state.expanded.has(id)) : "false",
      "data-feature-id": id,
      "data-validation": validation.key,
      "data-category": category,
    });
    const card = svgElement("g", { class: "node-card" });
    card.append(svgElement("rect", { class: "node-panel", width: state.layout.config.nodeWidth, height: state.layout.config.nodeHeight, rx: 13 }));
    card.append(svgElement("rect", { class: "category-accent", width: 4, height: state.layout.config.nodeHeight, rx: 2 }));
    const title = svgElement("text", { x: 16, y: 19, class: "node-title" });
    title.textContent = compactFeatureTitle(feature);
    card.append(title);
    const subtitle = svgElement("text", { x: 16, y: 34, class: "node-subtitle" });
    subtitle.textContent = featureEnglishSubtitle(feature) || feature.id;
    card.append(subtitle);
    const categoryWidth = Math.min(82, 18 + categoryMeta.label.length * 5.2);
    const categoryBadge = svgElement("g", { class: "node-badge category-badge", transform: "translate(16 42)" });
    categoryBadge.append(svgElement("rect", { width: categoryWidth, height: 15, rx: 7.5 }));
    const categoryLabel = svgElement("text", { x: 7, y: 10.5 });
    categoryLabel.textContent = categoryMeta.label;
    categoryBadge.append(categoryLabel);
    card.append(categoryBadge);
    const validationWidth = Math.min(118, Math.max(45, 18 + validation.label.length * 7));
    const badge = svgElement("g", { class: "node-badge validation-badge", transform: `translate(${22 + categoryWidth} 42)` });
    badge.append(svgElement("rect", { width: validationWidth, height: 15, rx: 7.5 }));
    badge.append(svgElement("circle", { cx: 7, cy: 7.5, r: 2.2 }));
    const badgeLabel = svgElement("text", { x: 13, y: 10.5 });
    badgeLabel.textContent = validation.label;
    badge.append(badgeLabel);
    card.append(badge);
    if (codeHint) {
      const code = svgElement("text", { x: 16, y: 72, class: "node-code-hint" });
      code.textContent = codeHint;
      card.append(code);
    }
    const coveredExperiments = experimentsForFeature(id);
    const hasWandb = coveredExperiments.some((item) => item.wandb_url);
    const experiment = svgElement("g", { class: `node-experiment${hasWandb ? " has-wandb" : ""}` });
    const expLabel = svgElement("text", { x: 16, y: 90, class: "node-exp-label" });
    expLabel.textContent = hasWandb ? "EXP · W&B" : "EXP";
    experiment.append(expLabel);
    experiment.append(svgElement("text", { x: hasWandb ? 78 : 38, y: 90, class: "node-exp-summary" }));
    experiment.append(svgElement("polyline", { class: "node-sparkline" }));
    experiment.append(svgElement("rect", { class: "node-progress-track", x: 0, y: 98, width: state.layout.config.nodeWidth, height: 2 }));
    experiment.append(svgElement("rect", { class: "node-progress-fill", x: 0, y: 98, width: 0, height: 2 }));
    card.append(experiment);
    if (children.length) {
      const toggle = svgElement("g", { class: "node-toggle", transform: `translate(${state.layout.config.nodeWidth - 11} 18)`, "data-toggle-id": id });
      toggle.append(svgElement("circle", { r: 10 }));
      const symbol = svgElement("text", { y: 4 });
      symbol.textContent = state.expanded.has(id) ? "−" : "+";
      toggle.append(symbol);
      card.append(toggle);
    }
    group.append(card);
    elements.nodes.append(group);
  }
  applyTransform();
  updateTelemetryDom();
}

function selectFeature(id, { reveal = false } = {}) {
  if (!state.tree?.byId.has(id)) return;
  if (reveal) for (const ancestor of ancestorIds(state.tree, id)) state.expanded.add(ancestor);
  state.selectedId = id;
  renderDrawer();
  openDrawer();
  renderTree();
  if (reveal) requestAnimationFrame(fitTree);
}

function openDrawer() {
  if (state.drawerOpen) return;
  state.drawerOpen = true;
  elements.app.classList.add("drawer-open");
  elements.detail.classList.add("is-open");
  elements.detail.setAttribute("aria-hidden", "false");
  requestAnimationFrame(fitTree);
}

function closeDrawer() {
  if (!state.drawerOpen) return;
  state.drawerOpen = false;
  elements.app.classList.remove("drawer-open");
  elements.detail.classList.remove("is-open");
  elements.detail.setAttribute("aria-hidden", "true");
  renderTree();
  requestAnimationFrame(fitTree);
}

function renderDrawer() {
  if (!state.tree || !state.selectedId) return;
  const feature = state.tree.byId.get(state.selectedId);
  elements.detailContent.innerHTML = renderDetail(feature, state.tree, experimentsForFeature(feature.id));
  updateTelemetryDom();
}

function toggleFeature(id) {
  if (!(state.tree.childrenById.get(id)?.length)) return;
  const expanding = !state.expanded.has(id);
  expanding ? state.expanded.add(id) : state.expanded.delete(id);
  renderTree();
  if (expanding) requestAnimationFrame(fitTree);
}

function applyTransform() {
  elements.viewport.setAttribute("transform", `translate(${state.translateX} ${state.translateY}) scale(${state.scale})`);
  elements.viewport.dataset.translateX = String(state.translateX);
  elements.viewport.dataset.translateY = String(state.translateY);
  elements.viewport.dataset.scale = String(state.scale);
  elements.zoomOutput.value = `${Math.round(state.scale * 100)}%`;
}

function clientPointToSvg(clientX, clientY) {
  const matrix = elements.svg.getScreenCTM();
  if (!matrix) return { x: clientX, y: clientY };
  const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
  return { x: point.x, y: point.y };
}

function setZoom(scale, anchor = null) {
  const next = Math.min(2.4, Math.max(0.35, scale));
  if (anchor) {
    const localX = (anchor.x - state.translateX) / state.scale;
    const localY = (anchor.y - state.translateY) / state.scale;
    state.translateX = anchor.x - localX * next;
    state.translateY = anchor.y - localY * next;
  }
  state.scale = next;
  applyTransform();
}

function actualSize() {
  state.scale = 1;
  state.translateX = 0;
  state.translateY = 0;
  applyTransform();
}

function fitTree() {
  if (!state.tree) return;
  const visible = visibleFeatureIds(state.tree, state.expanded);
  const bounds = boundsForIds(state.layout, visible);
  const width = elements.svg.viewBox.baseVal.width;
  const height = elements.svg.viewBox.baseVal.height;
  const nextScale = Math.min(1.15, Math.max(0.35, Math.min(width / bounds.width, height / bounds.height)));
  state.scale = nextScale;
  state.translateX = (width - bounds.width * nextScale) / 2 - bounds.minX * nextScale;
  state.translateY = (height - bounds.height * nextScale) / 2 - bounds.minY * nextScale;
  applyTransform();
}

function searchFeatures(query) {
  const term = query.trim().toLocaleLowerCase("zh-CN");
  if (!term || !state.tree) return [];
  return state.tree.features
    .filter((feature) => matchesFeatureSearch(feature, term))
    .slice(0, 8);
}

function renderSearchResults() {
  const results = searchFeatures(elements.search.value);
  if (!elements.search.value.trim()) {
    elements.searchResults.hidden = true;
    return;
  }
  elements.searchResults.replaceChildren();
  if (results.length) {
    for (const feature of results) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.searchId = feature.id;
      const title = document.createElement("strong");
      title.textContent = featureTitle(feature);
      const metadata = document.createElement("small");
      metadata.textContent = `${feature.id} · ${featureValidation(feature).label}${primaryCodeHint(feature) ? ` · ${primaryCodeHint(feature)}` : ""}`;
      button.append(title, metadata);
      elements.searchResults.append(button);
    }
  } else {
    const empty = document.createElement("p");
    empty.textContent = "没有匹配的 Feature";
    elements.searchResults.append(empty);
  }
  elements.searchResults.hidden = false;
}

function sparklinePoints(values) {
  if (!values?.length) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(0.001, max - min);
  return values.map((value, index) => {
    const x = 142 + index * (68 / (values.length - 1));
    const y = 93 - ((value - min) / range) * 11;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function experimentsForFeature(featureId) {
  return state.experimentIndex?.byFeatureId.get(featureId) ?? [];
}

function experimentStatusSummary(experiments) {
  if (!experiments.length) return "no runs";
  const wandbCount = experiments.filter((experiment) => experiment.wandb_url).length;
  if (wandbCount) {
    const otherCount = experiments.length - wandbCount;
    if (!otherCount) return wandbCount === 1 ? "W&B report" : `${wandbCount} W&B reports`;
    return `${wandbCount} W&B / ${otherCount} other`;
  }
  const counts = new Map();
  for (const experiment of experiments) counts.set(experiment.status, (counts.get(experiment.status) ?? 0) + 1);
  const preferred = ["running", "completed", "planned", "failed", "inconclusive", "archived"]
    .filter((status) => counts.has(status))
    .map((status) => `${counts.get(status)} ${status}`);
  return preferred.join(" / ");
}

function lossMetric(experiment) {
  const value = Number(experiment?.final_metrics?.loss);
  return Number.isFinite(value) ? value : null;
}

function latestFinalLoss() {
  const completed = state.experimentIndex?.experiments
    .filter((experiment) => experiment.status === "completed")
    .map((experiment) => ({ experiment, loss: lossMetric(experiment) }))
    .filter((item) => item.loss != null) ?? [];
  return completed.at(-1)?.loss ?? null;
}

function replayForFeature(featureId) {
  const snapshot = state.telemetrySnapshot;
  if (!snapshot || !state.telemetryEnabled) return null;
  for (const experiment of experimentsForFeature(featureId)) {
    const replay = snapshot.byExperiment.get(experiment.id);
    if (replay) return replay;
  }
  return null;
}

function updateTelemetryDom() {
  const snapshot = state.telemetrySnapshot;
  elements.app.classList.toggle("telemetry-off", !state.telemetryEnabled);
  elements.telemetryToggle.setAttribute("aria-pressed", String(state.telemetryEnabled));
  elements.telemetryToggle.textContent = state.telemetryEnabled ? "W&B 回放 开" : "W&B 回放 关";
  const experiments = state.experimentIndex?.experiments ?? [];
  const completed = experiments.filter((experiment) => experiment.status === "completed").length;
  const finalLoss = latestFinalLoss();
  elements.experimentCount.textContent = String(experiments.length);
  elements.experimentCompleted.textContent = String(completed);
  elements.experimentFinalLoss.textContent = finalLoss == null ? "—" : finalLoss.toFixed(3);
  elements.experimentReplay.textContent = snapshot && state.telemetryEnabled ? String(snapshot.aggregate.replaying) : "0";
  document.documentElement.dataset.telemetrySource = snapshot?.source ?? "experiment-index";
  document.documentElement.dataset.telemetryTick = String(snapshot?.tick ?? 0);
  for (const node of elements.nodes.querySelectorAll("[data-feature-id]")) {
    const featureId = node.dataset.featureId;
    const covered = experimentsForFeature(featureId);
    const replay = replayForFeature(featureId);
    const summary = node.querySelector(".node-exp-summary");
    const sparkline = node.querySelector(".node-sparkline");
    const progress = node.querySelector(".node-progress-fill");
    summary.textContent = replay ? `replay loss ${replay.loss.toFixed(3)}` : experimentStatusSummary(covered);
    sparkline.setAttribute("points", replay ? sparklinePoints(replay.sparkline) : "");
    progress.setAttribute("width", String(state.layout.config.nodeWidth * (replay?.progress ?? 0)));
  }
}

function startTelemetry() {
  state.stopTelemetry?.();
  if (!state.telemetryEnabled || !state.experimentIndex) return;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  state.stopTelemetry = state.telemetryProvider.start(
    state.experimentIndex.experiments,
    (snapshot) => {
      state.telemetrySnapshot = snapshot;
      updateTelemetryDom();
    },
    { reducedMotion },
  );
}

function toggleTelemetry() {
  state.telemetryEnabled = !state.telemetryEnabled;
  if (state.telemetryEnabled) startTelemetry();
  else {
    state.stopTelemetry?.();
    state.stopTelemetry = null;
    updateTelemetryDom();
  }
}

function renderCanonicalStats() {
  const categories = new Set(state.tree.features.filter((feature) => feature.kind !== "baseline").map(featureCategory));
  const codePinned = state.tree.features.filter((feature) => structuredCodeLocators(feature).some((locator) => locator.pinnedUrl)).length;
  const validations = new Map();
  for (const feature of state.tree.features.filter((item) => item.kind !== "baseline")) {
    const label = featureValidation(feature).label;
    validations.set(label, (validations.get(label) ?? 0) + 1);
  }
  elements.statFeatures.textContent = String(state.tree.features.length);
  elements.statCategories.textContent = String(categories.size);
  elements.statCodePinned.textContent = String(codePinned);
  elements.statValidation.textContent = [...validations].map(([label, count]) => `${label} ${count}`).join(" / ");
}

function renderCategoryFilters() {
  const categories = [...new Set(state.tree.features.filter((feature) => feature.kind !== "baseline").map(featureCategory))];
  state.enabledCategories = new Set(categories);
  elements.categoryFilters.replaceChildren();
  for (const category of categories) {
    const meta = CATEGORY_META[category] ?? CATEGORY_META.architecture;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "category-chip";
    button.dataset.category = category;
    button.style.setProperty("--chip-color", meta.color);
    button.setAttribute("aria-pressed", "true");
    button.textContent = meta.label;
    elements.categoryFilters.append(button);
  }
}

function formalDataUrl() {
  const pageBase = new URL(".", document.baseURI);
  return pageBase.pathname.endsWith("/web/")
    ? new URL("../data/feature-tree.json", pageBase)
    : new URL("data/feature-tree.json", pageBase);
}

function formalExperimentUrl() {
  const pageBase = new URL(".", document.baseURI);
  return pageBase.pathname.endsWith("/web/")
    ? new URL("../data/experiments.json", pageBase)
    : new URL("data/experiments.json", pageBase);
}

function showError(error) {
  elements.empty.hidden = false;
  elements.emptyMessage.textContent = error instanceof FeatureTreeDataError || error instanceof ExperimentIndexDataError
    ? [error.message, ...error.details].join("；")
    : error.message;
  elements.svg.classList.add("is-unavailable");
}

async function initialize() {
  elements.empty.hidden = true;
  elements.svg.classList.remove("is-unavailable");
  try {
    state.tree = await loadFeatureTree(formalDataUrl());
    state.experimentIndex = await loadExperimentIndex(formalExperimentUrl(), state.tree);
    state.layout = layoutTree(state.tree);
    state.expanded = new Set([state.tree.rootId]);
    state.selectedId = state.tree.rootId;
    elements.svg.setAttribute("viewBox", `0 0 ${Math.max(state.layout.width, 1200)} ${Math.max(state.layout.height, 720)}`);
    elements.detailContent.innerHTML = renderDetail(state.tree.byId.get(state.tree.rootId), state.tree, []);
    renderCanonicalStats();
    renderCategoryFilters();
    renderTree();
    updateTelemetryDom();
    fitTree();
    document.documentElement.dataset.ready = "true";
    document.documentElement.dataset.featureCount = String(state.tree.features.length);
    document.documentElement.dataset.experimentCount = String(state.experimentIndex.experiments.length);
    document.documentElement.dataset.structuralEdgeCount = String(state.tree.features.length - 1);
    document.documentElement.dataset.auxiliaryEdgeCount = String(state.tree.features.reduce(
      (count, feature) => count + feature.depends_on.length + feature.related_to.length,
      0,
    ));
    startTelemetry();
  } catch (error) {
    showError(error);
    document.documentElement.dataset.ready = "error";
  }
}

elements.nodes.addEventListener("click", (event) => {
  const toggle = event.target.closest("[data-toggle-id]");
  if (toggle) {
    event.stopPropagation();
    toggleFeature(toggle.dataset.toggleId);
    return;
  }
  const node = event.target.closest("[data-feature-id]");
  if (node) selectFeature(node.dataset.featureId);
});
elements.nodes.addEventListener("dblclick", (event) => {
  const node = event.target.closest("[data-feature-id]");
  if (node) toggleFeature(node.dataset.featureId);
});
elements.nodes.addEventListener("keydown", (event) => {
  const node = event.target.closest("[data-feature-id]");
  if (!node) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    selectFeature(node.dataset.featureId);
  } else if (event.key === "ArrowRight") {
    state.expanded.add(node.dataset.featureId);
    renderTree();
  } else if (event.key === "ArrowLeft") {
    state.expanded.delete(node.dataset.featureId);
    renderTree();
  }
});
elements.svg.addEventListener("pointerdown", (event) => {
  if (!event.isPrimary || (event.pointerType !== "touch" && event.button !== 0)) return;
  if (event.target.closest("[data-feature-id], [data-toggle-id]")) return;
  event.preventDefault();
  state.pan = {
    pointerId: event.pointerId,
    startClient: { x: event.clientX, y: event.clientY },
    startSvg: clientPointToSvg(event.clientX, event.clientY),
    origin: { translateX: state.translateX, translateY: state.translateY },
    moved: false,
  };
  elements.svg.setPointerCapture(event.pointerId);
  elements.svg.classList.add("is-panning");
});
elements.svg.addEventListener("pointermove", (event) => {
  if (!state.pan || event.pointerId !== state.pan.pointerId) return;
  event.preventDefault();
  const currentClient = { x: event.clientX, y: event.clientY };
  if (!state.pan.moved && !exceedsPanThreshold(state.pan.startClient, currentClient)) return;
  state.pan.moved = true;
  const currentSvg = clientPointToSvg(event.clientX, event.clientY);
  const next = translatedViewport(state.pan.origin, {
    x: currentSvg.x - state.pan.startSvg.x,
    y: currentSvg.y - state.pan.startSvg.y,
  });
  state.translateX = next.translateX;
  state.translateY = next.translateY;
  applyTransform();
});

function finishPan(event) {
  if (!state.pan || event.pointerId !== state.pan.pointerId) return;
  if (state.pan.moved) state.suppressClickUntil = performance.now() + 400;
  if (elements.svg.hasPointerCapture(event.pointerId)) elements.svg.releasePointerCapture(event.pointerId);
  state.pan = null;
  elements.svg.classList.remove("is-panning");
}

elements.svg.addEventListener("pointerup", finishPan);
elements.svg.addEventListener("pointercancel", finishPan);
elements.svg.addEventListener("lostpointercapture", (event) => {
  if (state.pan?.pointerId !== event.pointerId) return;
  if (state.pan.moved) state.suppressClickUntil = performance.now() + 400;
  state.pan = null;
  elements.svg.classList.remove("is-panning");
});
elements.svg.addEventListener("click", (event) => {
  if (performance.now() >= state.suppressClickUntil) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);
elements.search.addEventListener("input", renderSearchResults);
elements.search.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    const result = searchFeatures(elements.search.value)[0];
    if (result) {
      selectFeature(result.id, { reveal: true });
      elements.searchResults.hidden = true;
    }
  } else if (event.key === "Escape") {
    elements.search.value = "";
    elements.searchResults.hidden = true;
  }
});
elements.searchResults.addEventListener("click", (event) => {
  const result = event.target.closest("[data-search-id]");
  if (!result) return;
  selectFeature(result.dataset.searchId, { reveal: true });
  elements.searchResults.hidden = true;
});
elements.categoryFilters.addEventListener("click", (event) => {
  const chip = event.target.closest("[data-category]");
  if (!chip) return;
  const category = chip.dataset.category;
  state.enabledCategories.has(category) ? state.enabledCategories.delete(category) : state.enabledCategories.add(category);
  chip.setAttribute("aria-pressed", String(state.enabledCategories.has(category)));
  renderTree();
});
elements.telemetryToggle.addEventListener("click", toggleTelemetry);
elements.detailClose.addEventListener("click", closeDrawer);
elements.svg.addEventListener("wheel", (event) => {
  event.preventDefault();
  setZoom(state.scale * (event.deltaY > 0 ? 0.9 : 1.1), clientPointToSvg(event.clientX, event.clientY));
}, { passive: false });
document.addEventListener("keydown", (event) => {
  if (event.key === "/" && document.activeElement !== elements.search) {
    event.preventDefault();
    elements.search.focus();
  } else if (event.key === "Escape" && state.drawerOpen) {
    closeDrawer();
  }
});
document.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action === "zoom-in") setZoom(state.scale * 1.15);
  if (action === "zoom-out") setZoom(state.scale / 1.15);
  if (action === "actual-size") actualSize();
  if (action === "fit") fitTree();
  if (action === "retry") initialize();
});
window.addEventListener("resize", () => state.tree && fitTree());
window.addEventListener("pagehide", () => state.stopTelemetry?.());
initialize();
