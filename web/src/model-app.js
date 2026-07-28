import {
  ModelDataError,
  compactModelTitle,
  loadModelGraph,
  matchesModelSearch,
  modelSubtitle,
  modelTitle,
} from "./model-data-adapter.js";
import { renderModelDetail } from "./model-detail-view.js";
import { ancestorIds, boundsForIds, layoutTree, visibleFeatureIds } from "./tree-layout.js";
import { exceedsPanThreshold, translatedViewport } from "./viewport-state.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const KATEX_VERSION = "0.17.0";
const KATEX_BASE_URL = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist`;
let katexLoadPromise = null;
const CATEGORY_META = Object.freeze({
  parent_issue: { label: "Parent Issue", color: "#94a3b8" },
  root_model: { label: "Root model", color: "#34d399" },
  model: { label: "Model proposal", color: "#fb923c" },
});
const STATUS_META = Object.freeze({
  "under-review": { label: "Under review", key: "under-review" },
  "in-progress": { label: "In progress", key: "in-progress" },
  declined: { label: "Declined", key: "declined" },
  verified: { label: "Verified", key: "verified" },
  open: { label: "Open", key: "open" },
  closed: { label: "Closed", key: "closed" },
  reference: { label: "Reference", key: "reference" },
  offline: { label: "Offline", key: "offline" },
});
const elements = {
  app: document.querySelector("#app-shell"),
  svg: document.querySelector("#tree-canvas"),
  viewport: document.querySelector("#viewport-layer"),
  nodes: document.querySelector("#node-layer"),
  edges: document.querySelector("#edge-layer"),
  search: document.querySelector("#model-search"),
  searchResults: document.querySelector("#search-results"),
  zoomOutput: document.querySelector("#zoom-output"),
  empty: document.querySelector("#empty-state"),
  emptyMessage: document.querySelector("#empty-message"),
  categoryFilters: document.querySelector("#category-filters"),
  detail: document.querySelector("#detail-panel"),
  detailContent: document.querySelector("#detail-content"),
  detailClose: document.querySelector("#detail-close"),
  statModels: document.querySelector("#stat-models"),
  statOpenIssues: document.querySelector("#stat-open-issues"),
  statPullRequests: document.querySelector("#stat-pull-requests"),
  statParentLinks: document.querySelector("#stat-parent-links"),
};

const state = {
  tree: null,
  layout: null,
  expanded: new Set(),
  enabledCategories: new Set(),
  selectedId: null,
  activeDetailTab: "",
  overviewExpanded: false,
  drawerOpen: false,
  scale: 1,
  translateX: 0,
  translateY: 0,
  pan: null,
  suppressClickUntil: 0,
};

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function statusFor(model) {
  return STATUS_META[model?.state] ?? { label: model?.state || "Unknown", key: "unknown" };
}

function isDisplayableModel(model) {
  return Boolean(model) && model.lifecycleStatus !== "declined" && model.state !== "declined";
}

function compactBadgeLabel(label, limit = 22) {
  return label.length > limit ? `${label.slice(0, limit - 1)}…` : label;
}

function modelRelationLabel(model) {
  if (model.parentResolution === "root") return "Root architecture";
  const parent = state.tree.byId.get(model.parent_id);
  return parent ? `Parent: ${modelTitle(parent)}` : "Parent unresolved";
}

function modelFooter(model) {
  if (model.nodeType === "parent_issue") {
    const count = (state.tree.childrenById.get(model.id) ?? []).filter((node) => node.nodeType === "model").length;
    return `${count} direct model${count === 1 ? "" : "s"}`;
  }
  const pullRequest = model.pullRequests[0];
  if (pullRequest?.merged) {
    const mergedAt = pullRequest.mergedAt ? new Date(pullRequest.mergedAt) : null;
    const mergedDate = !mergedAt || Number.isNaN(mergedAt.getTime())
      ? ""
      : new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(mergedAt);
    return mergedDate ? `Merged ${mergedDate}` : "Merged implementation";
  }
  if (pullRequest) {
    return `${pullRequest.draft ? "Draft " : ""}PR #${pullRequest.number}`;
  }
  if (model.lifecycleStatus === "under-review") return "";
  if (model.lifecycleStatus === "in-progress") return "Awaiting PR";
  if (model.lifecycleStatus === "declined") return "Not planned";
  if (model.lifecycleStatus === "verified") return "Implementation verified";
  return "Proposal only";
}

function curveBetween(source, target) {
  const startX = source.x + state.layout.config.nodeWidth;
  const startY = source.y + state.layout.config.nodeHeight / 2;
  const endX = target.x;
  const endY = target.y + state.layout.config.nodeHeight / 2;
  const midX = startX + (endX - startX) * 0.5;
  return `M${startX},${startY} C${midX},${startY} ${midX},${endY} ${endX},${endY}`;
}

function renderTree() {
  if (!state.tree) return;
  const visible = visibleFeatureIds(state.tree, state.expanded, isDisplayableModel);
  elements.nodes.replaceChildren();
  elements.edges.replaceChildren();

  const selectionActive = Boolean(
    state.drawerOpen
    && state.selectedId
    && visible.has(state.selectedId),
  );
  const ancestorSet = new Set(
    selectionActive ? ancestorIds(state.tree, state.selectedId) : [],
  );
  const lineageSet = new Set(
    selectionActive ? [...ancestorSet, state.selectedId] : [],
  );

  for (const id of visible) {
    const model = state.tree.byId.get(id);
    if (!model.parent_id || !visible.has(model.parent_id)) continue;
    const lineageEdge = lineageSet.has(id) && lineageSet.has(model.parent_id);
    elements.edges.append(svgElement("path", {
      d: curveBetween(state.layout.positions.get(model.parent_id), state.layout.positions.get(id)),
      class: `structure-edge${lineageEdge ? " is-lineage-edge" : ""}${selectionActive && !lineageEdge ? " is-dimmed-edge" : ""}`,
      "data-edge": `${model.parent_id}:${id}`,
    }));
  }

  for (const id of visible) {
    const model = state.tree.byId.get(id);
    const category = model.category;
    const categoryMeta = CATEGORY_META[category] ?? CATEGORY_META.model;
    const status = statusFor(model);
    const issueStatus = STATUS_META[model.issueState] ?? { label: model.issueState || "Unknown", key: "unknown" };
    const point = state.layout.positions.get(id);
    const children = (state.tree.childrenById.get(id) ?? []).filter(isDisplayableModel);
    const selected = selectionActive && state.selectedId === id;
    const ancestor = ancestorSet.has(id);
    const dimmed = selectionActive && !selected && !ancestor;
    const categoryDimmed = !state.enabledCategories.has(category);
    const group = svgElement("g", {
      class: `feature-node category-${category} status-${status.key}${selected ? " is-selected" : ""}${ancestor ? " is-ancestor" : ""}${dimmed ? " is-dimmed" : ""}${categoryDimmed ? " is-category-dimmed" : ""}`,
      transform: `translate(${point.x} ${point.y})`,
      tabindex: "0",
      role: "treeitem",
      "aria-label": `${modelTitle(model)}, ${status.label}, ${issueStatus.label}`,
      "aria-selected": state.selectedId === id ? "true" : "false",
      "aria-expanded": children.length ? String(state.expanded.has(id)) : "false",
      "data-model-id": id,
      "data-category": category,
      "data-lifecycle-status": model.lifecycleStatus || "",
      "data-issue-state": model.issueState || "",
    });
    const card = svgElement("g", { class: "node-card" });
    card.append(svgElement("rect", {
      class: "node-panel",
      width: state.layout.config.nodeWidth,
      height: state.layout.config.nodeHeight,
      rx: 8,
    }));
    card.append(svgElement("rect", {
      class: "category-accent lifecycle-accent",
      width: 4,
      height: state.layout.config.nodeHeight,
      rx: 2,
    }));
    const title = svgElement("text", { x: 16, y: 20, class: "node-title" });
    title.textContent = compactModelTitle(model);
    card.append(title);
    const subtitle = svgElement("text", { x: 16, y: 35, class: "node-subtitle" });
    subtitle.textContent = modelSubtitle(model);
    card.append(subtitle);

    const statusWidth = Math.min(76, 18 + status.label.length * 5.2);
    let statusX = 16;
    let statusY = 44;
    let footerX = 16;
    let footerY = 84;

    if (model.nodeType === "model") {
      const relationLabel = compactBadgeLabel(modelRelationLabel(model), 30);
      const relationWidth = Math.min(164, 16 + relationLabel.length * 4.3);
      const relationBadge = svgElement("g", {
        class: "node-badge category-badge lineage-badge",
        transform: "translate(16 44)",
      });
      relationBadge.append(svgElement("rect", { width: relationWidth, height: 15, rx: 7.5 }));
      const relationText = svgElement("text", { x: 7, y: 10.5 });
      relationText.textContent = relationLabel;
      relationBadge.append(relationText);
      card.append(relationBadge);
      const labelTitle = svgElement("title");
      labelTitle.textContent = modelRelationLabel(model);
      card.append(labelTitle);
      statusY = 65;
      footerX = statusX + statusWidth + 10;
      footerY = 76;
    } else {
      const categoryWidth = Math.min(92, 18 + categoryMeta.label.length * 5.1);
      const categoryBadge = svgElement("g", { class: "node-badge category-badge", transform: "translate(16 44)" });
      categoryBadge.append(svgElement("rect", { width: categoryWidth, height: 15, rx: 7.5 }));
      const categoryLabel = svgElement("text", { x: 7, y: 10.5 });
      categoryLabel.textContent = categoryMeta.label;
      categoryBadge.append(categoryLabel);
      card.append(categoryBadge);
      statusX = 22 + categoryWidth;
    }

    const statusBadge = svgElement("g", { class: "node-badge validation-badge", transform: `translate(${statusX} ${statusY})` });
    statusBadge.append(svgElement("rect", { width: statusWidth, height: 15, rx: 7.5 }));
    statusBadge.append(svgElement("circle", { cx: 7, cy: 7.5, r: 2.2 }));
    const statusLabel = svgElement("text", { x: 13, y: 10.5 });
    statusLabel.textContent = status.label;
    statusBadge.append(statusLabel);
    card.append(statusBadge);

    const footer = svgElement("text", { x: footerX, y: footerY, class: "node-code-hint" });
    footer.textContent = modelFooter(model);
    card.append(footer);

    if (children.length) {
      const toggle = svgElement("g", {
        class: "node-toggle",
        transform: `translate(${state.layout.config.nodeWidth - 11} 18)`,
        "data-toggle-id": id,
      });
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
}

function loadKatex() {
  if (window.katex?.render) return Promise.resolve(window.katex);
  if (katexLoadPromise) return katexLoadPromise;

  if (!document.querySelector('link[data-katex-runtime="true"]')) {
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = `${KATEX_BASE_URL}/katex.min.css`;
    stylesheet.crossOrigin = "anonymous";
    stylesheet.dataset.katexRuntime = "true";
    document.head.append(stylesheet);
  }

  katexLoadPromise = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = `${KATEX_BASE_URL}/katex.min.js`;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.addEventListener("load", () => resolve(window.katex ?? null), { once: true });
    script.addEventListener("error", () => resolve(null), { once: true });
    document.head.append(script);
  });
  return katexLoadPromise;
}

function typesetMath(root) {
  const formulas = [...root.querySelectorAll(
    ".math-inline[data-latex]:not([data-math-rendered]), .math-display[data-latex]:not([data-math-rendered])",
  )];
  if (!formulas.length) return;

  const render = (katex) => {
    if (!katex?.render) return;
    for (const formula of formulas) {
      if (!formula.isConnected || formula.dataset.mathRendered) continue;
      katex.render(formula.dataset.latex, formula, {
        displayMode: formula.classList.contains("math-display"),
        throwOnError: false,
        trust: false,
        strict: "warn",
        output: "htmlAndMathml",
        maxSize: 10,
        maxExpand: 1000,
      });
      formula.dataset.mathRendered = "true";
    }
  };

  if (window.katex?.render) render(window.katex);
  else loadKatex().then(render);
}

function renderDrawer() {
  if (!state.tree || !state.selectedId) return;
  const model = state.tree.byId.get(state.selectedId);
  elements.detailContent.innerHTML = renderModelDetail(
    model,
    state.tree,
    state.activeDetailTab,
    state.overviewExpanded,
  );
  typesetMath(elements.detailContent);
}

function setDisclosureState(toggle, panel, expanded) {
  toggle.setAttribute("aria-expanded", String(expanded));
  panel?.setAttribute("aria-hidden", String(!expanded));
  panel?.classList.toggle("is-expanded", expanded);
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

function selectModel(id, { reveal = false } = {}) {
  if (!state.tree?.byId.has(id) || !isDisplayableModel(state.tree.byId.get(id))) return;
  if (reveal) for (const ancestor of ancestorIds(state.tree, id)) state.expanded.add(ancestor);
  state.selectedId = id;
  state.activeDetailTab = "";
  state.overviewExpanded = false;
  renderDrawer();
  openDrawer();
  renderTree();
  if (reveal) requestAnimationFrame(fitTree);
}

function toggleModel(id) {
  if (!(state.tree.childrenById.get(id)?.length)) return;
  state.expanded.has(id) ? state.expanded.delete(id) : state.expanded.add(id);
  renderTree();
  requestAnimationFrame(fitTree);
}

function applyTransform() {
  elements.viewport.setAttribute("transform", `translate(${state.translateX} ${state.translateY}) scale(${state.scale})`);
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
  const visible = visibleFeatureIds(state.tree, state.expanded, isDisplayableModel);
  const bounds = boundsForIds(state.layout, visible);
  const width = elements.svg.viewBox.baseVal.width;
  const height = elements.svg.viewBox.baseVal.height;
  const nextScale = Math.min(1.12, Math.max(0.35, Math.min(width / bounds.width, height / bounds.height)));
  state.scale = nextScale;
  state.translateX = (width - bounds.width * nextScale) / 2 - bounds.minX * nextScale;
  state.translateY = (height - bounds.height * nextScale) / 2 - bounds.minY * nextScale;
  applyTransform();
}

function searchModels(query) {
  if (!state.tree || !query.trim()) return [];
  return state.tree.features
    .filter((model) => isDisplayableModel(model) && matchesModelSearch(model, query))
    .slice(0, 8);
}

function renderSearchResults() {
  const results = searchModels(elements.search.value);
  if (!elements.search.value.trim()) {
    elements.searchResults.hidden = true;
    return;
  }
  elements.searchResults.replaceChildren();
  if (!results.length) {
    const empty = document.createElement("p");
    empty.textContent = "No matching models, Issues, or Pull Requests";
    elements.searchResults.append(empty);
  }
  for (const model of results) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.searchId = model.id;
    const title = document.createElement("strong");
    title.textContent = modelTitle(model);
    const metadata = document.createElement("small");
    metadata.textContent = `${modelSubtitle(model)} · ${CATEGORY_META[model.category]?.label ?? model.category}`;
    button.append(title, metadata);
    elements.searchResults.append(button);
  }
  elements.searchResults.hidden = false;
}

function renderStats() {
  const models = state.tree.models.filter(isDisplayableModel);
  elements.statModels.textContent = String(models.length);
  elements.statOpenIssues.textContent = String(models.filter((model) => model.issueState === "open").length);
  elements.statPullRequests.textContent = String(models.reduce((total, model) => total + model.pullRequests.length, 0));
  elements.statParentLinks.textContent = String(models.filter((model) => model.parentResolution !== "root").length);
}

function renderCategoryFilters() {
  const categories = [...new Set(state.tree.features.filter(isDisplayableModel).map((model) => model.category))];
  state.enabledCategories = new Set(categories);
  elements.categoryFilters.replaceChildren();
  for (const category of categories) {
    const meta = CATEGORY_META[category] ?? CATEGORY_META.model;
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

function offlineDataUrl() {
  const pageBase = new URL(".", document.baseURI);
  return pageBase.pathname.endsWith("/web/")
    ? new URL("../data/template-test-data.json", pageBase)
    : new URL("data/template-test-data.json", pageBase);
}

function showError(error) {
  elements.empty.hidden = false;
  elements.emptyMessage.textContent = error instanceof ModelDataError
    ? [error.message, ...error.details].join("; ")
    : error.message;
  elements.svg.classList.add("is-unavailable");
}

async function initialize() {
  elements.empty.hidden = true;
  elements.svg.classList.remove("is-unavailable");
  try {
    state.tree = await loadModelGraph(offlineDataUrl());
    state.layout = layoutTree(state.tree, {
      originX: 70,
      originY: 58,
      depthGap: 274,
      rowGap: 116,
      includeNode: isDisplayableModel,
    });
    state.expanded = new Set(
      state.tree.features
        .filter((model) => isDisplayableModel(model) && (state.tree.childrenById.get(model.id) ?? []).some(isDisplayableModel))
        .map((model) => model.id),
    );
    state.selectedId = state.tree.rootId;
    state.activeDetailTab = "";
    state.overviewExpanded = false;
    elements.svg.setAttribute("viewBox", `0 0 ${Math.max(state.layout.width, 1180)} ${Math.max(state.layout.height, 680)}`);
    renderStats();
    renderCategoryFilters();
    renderDrawer();
    renderTree();
    fitTree();
    document.documentElement.dataset.ready = "true";
    document.documentElement.dataset.modelCount = String(state.tree.models.filter(isDisplayableModel).length);
    document.documentElement.dataset.pullRequestCount = String(state.tree.stats.pullRequests);
    document.documentElement.dataset.parentLinkCount = String(state.tree.stats.parentLinks);
  } catch (error) {
    showError(error);
    document.documentElement.dataset.ready = "error";
  }
}

elements.nodes.addEventListener("click", (event) => {
  const toggle = event.target.closest("[data-toggle-id]");
  if (toggle) {
    event.stopPropagation();
    toggleModel(toggle.dataset.toggleId);
    return;
  }
  const node = event.target.closest("[data-model-id]");
  if (node) selectModel(node.dataset.modelId);
});
elements.nodes.addEventListener("dblclick", (event) => {
  const node = event.target.closest("[data-model-id]");
  if (node) toggleModel(node.dataset.modelId);
});
elements.nodes.addEventListener("keydown", (event) => {
  const node = event.target.closest("[data-model-id]");
  if (!node) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    selectModel(node.dataset.modelId);
  } else if (event.key === "ArrowRight") {
    state.expanded.add(node.dataset.modelId);
    renderTree();
  } else if (event.key === "ArrowLeft") {
    state.expanded.delete(node.dataset.modelId);
    renderTree();
  }
});
elements.svg.addEventListener("pointerdown", (event) => {
  if (!event.isPrimary || (event.pointerType !== "touch" && event.button !== 0)) return;
  if (event.target.closest("[data-model-id], [data-toggle-id]")) return;
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
elements.svg.addEventListener("click", (event) => {
  if (performance.now() >= state.suppressClickUntil) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);
elements.svg.addEventListener("wheel", (event) => {
  event.preventDefault();
  setZoom(state.scale * (event.deltaY > 0 ? 0.9 : 1.1), clientPointToSvg(event.clientX, event.clientY));
}, { passive: false });

elements.search.addEventListener("input", renderSearchResults);
elements.search.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    const result = searchModels(elements.search.value)[0];
    if (result) selectModel(result.id, { reveal: true });
    elements.searchResults.hidden = true;
  } else if (event.key === "Escape") {
    elements.search.value = "";
    elements.searchResults.hidden = true;
  }
});
elements.searchResults.addEventListener("click", (event) => {
  const result = event.target.closest("[data-search-id]");
  if (!result) return;
  selectModel(result.dataset.searchId, { reveal: true });
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
elements.detailContent.addEventListener("click", (event) => {
  const overviewToggle = event.target.closest("[data-overview-toggle]");
  if (overviewToggle) {
    state.overviewExpanded = !state.overviewExpanded;
    setDisclosureState(
      overviewToggle,
      elements.detailContent.querySelector("#overview-content"),
      state.overviewExpanded,
    );
    return;
  }
  const tab = event.target.closest("[data-detail-tab]");
  if (!tab) return;
  const expanded = state.activeDetailTab !== tab.dataset.detailTab;
  state.activeDetailTab = expanded ? tab.dataset.detailTab : "";
  const panelId = tab.getAttribute("aria-controls");
  const panel = panelId ? elements.detailContent.querySelector(`#${panelId}`) : null;
  setDisclosureState(tab, panel, expanded);
});
elements.detailClose.addEventListener("click", closeDrawer);

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

initialize();
