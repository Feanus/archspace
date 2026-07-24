import { featureEnglishSubtitle, featureSummary, featureTitle } from "./feature-display.js";
import {
  configurationView,
  deltaOperations,
  featureValidation,
  structuredCodeLocators,
  validationView,
} from "./feature-view-model.js";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const labelFor = (key) => ({
  commits: "Commits",
  sessions: "Sessions",
  code_symbols: "Python / 代码符号",
  repositories: "代码仓库",
  checkpoints: "Checkpoints",
}[key] ?? key.replaceAll("_", " "));

function renderValue(value) {
  if (value == null || value === "") return "";
  if (Array.isArray(value)) {
    if (!value.length) return "";
    return `<ul>${value.map((item) => `<li>${renderValue(item)}</li>`).join("")}</ul>`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value).filter(([, item]) => item != null && item !== "" && (!Array.isArray(item) || item.length));
    if (!entries.length) return "";
    return `<dl class="fact-list">${entries.map(([key, item]) => `<div><dt>${escapeHtml(labelFor(key))}</dt><dd>${renderValue(item)}</dd></div>`).join("")}</dl>`;
  }
  const text = escapeHtml(value);
  return /^https?:\/\//.test(String(value)) ? `<a href="${text}" target="_blank" rel="noreferrer">${text}</a>` : text;
}

function section(title, value, className = "") {
  const content = renderValue(value);
  if (!content) return "";
  return `<section class="detail-section ${className}"><h3>${title}</h3><div>${content}</div></section>`;
}

function htmlSection(title, content, className = "") {
  if (!content) return "";
  return `<section class="detail-section ${className}"><h3>${title}</h3>${content}</section>`;
}

function safeExternalUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return "";
    return url.href;
  } catch {
    return "";
  }
}

function renderDelta(feature, parent) {
  const operations = deltaOperations(feature);
  if (!operations.length && !parent) return "";
  const parentHtml = parent
    ? `<p class="detail-parent"><span>结构父 Feature</span><strong>${escapeHtml(featureTitle(parent))}</strong><code>${escapeHtml(parent.id)}</code></p>`
    : "";
  const operationHtml = operations.map((operation) => `
    <article class="delta-card">
      ${operation.target ? `<code class="delta-target">${escapeHtml(operation.target)}</code>` : ""}
      <div class="delta-grid">
        <div><span>Before</span>${renderValue(operation.before) || "<em>未记录</em>"}</div>
        <div><span>After</span>${renderValue(operation.after) || "<em>未记录</em>"}</div>
      </div>
      ${operation.rationale ? `<p>${escapeHtml(operation.rationale)}</p>` : ""}
    </article>
  `).join("");
  return htmlSection("相对父节点的变化", `<div>${parentHtml}${operationHtml}</div>`, "detail-delta");
}

function renderConfiguration(feature) {
  const config = configurationView(feature);
  if (!config.design && !config.parameters && !feature.baseline) return "";
  const content = [
    config.design ? `<div class="config-design"><span>设计</span><p>${escapeHtml(config.design)}</p></div>` : "",
    config.parameters ? `<div class="config-parameters"><span>配置开关 / 参数</span>${renderValue(config.parameters)}</div>` : "",
    feature.baseline ? `<div class="config-parameters"><span>标准态 pin 状态</span>${renderValue(feature.baseline)}</div>` : "",
  ].join("");
  return htmlSection("设计 / 配置开关与参数", `<div>${content}</div>`, "detail-config");
}

function renderLocators(feature) {
  const locators = structuredCodeLocators(feature);
  if (!locators.length) return "";
  const content = locators.map((locator) => `
    <article class="locator-card">
      <strong class="locator-symbol">${escapeHtml(locator.symbol || locator.id || "代码位置")}</strong>
      <dl>
        ${locator.repository ? `<div><dt>Repository</dt><dd>${escapeHtml(locator.repository)}</dd></div>` : ""}
        ${locator.revision ? `<div><dt>Full revision</dt><dd><code>${escapeHtml(locator.revision)}</code></dd></div>` : ""}
        ${locator.path ? `<div><dt>Path</dt><dd><code>${escapeHtml(locator.path)}</code></dd></div>` : ""}
        ${locator.symbol ? `<div><dt>Symbol</dt><dd><code>${escapeHtml(locator.symbol)}</code></dd></div>` : ""}
        ${locator.role ? `<div><dt>Role</dt><dd>${escapeHtml(locator.role)}</dd></div>` : ""}
      </dl>
      ${locator.pinnedUrl ? `<a class="pinned-link" href="${escapeHtml(locator.pinnedUrl)}" target="_blank" rel="noreferrer">打开 commit-pinned source ↗</a>` : ""}
    </article>
  `).join("");
  return htmlSection("实现 / 结构化代码定位", `<div class="locator-list">${content}</div>`, "detail-locators");
}

function validationRow(label, value) {
  const content = renderValue(value);
  return content ? `<div class="validation-row"><span>${label}</span>${content}</div>` : "";
}

function renderValidation(feature) {
  if (feature.kind === "baseline") return "";
  const view = validationView(feature);
  const rows = [
    validationRow("假设 / 需求", view.hypothesis),
    validationRow("Comparison", view.comparison),
    validationRow("Conditions", view.conditions),
    validationRow("Metrics", view.metrics),
    validationRow("证据 / Artifacts", view.artifacts),
    validationRow("Observations", view.observations),
    validationRow("Conclusion", view.conclusion),
  ].join("");
  return htmlSection("验证 / 分析与结论", `
    <div class="validation-summary validation-${view.validation.key}">
      <span class="validation-pill">${escapeHtml(view.validation.label)}</span>
      ${view.statement ? `<strong>${escapeHtml(view.statement)}</strong>` : ""}
    </div>
    <div class="validation-rows">${rows}</div>
  `, "detail-validation");
}

const EXPERIMENT_STATUS_LABEL = Object.freeze({
  planned: "计划中",
  running: "运行中",
  completed: "已完成",
  failed: "失败",
  inconclusive: "无结论",
  archived: "已归档",
});

const CURSOR_TYPE_LABEL = Object.freeze({
  none: "无光标",
  "wandb-final": "W&B final",
  "wandb-replay": "W&B 回放 · 非实时",
  live: "实时",
});

function renderExperimentMetrics(metrics) {
  const entries = Object.entries(metrics ?? {}).filter(([, value]) => value != null && value !== "");
  if (!entries.length) return "";
  return `<dl class="experiment-metrics">${entries.map(([key, value]) => `
    <div><dt>${escapeHtml(key)}</dt><dd><code>${escapeHtml(value)}</code></dd></div>
  `).join("")}</dl>`;
}

function renderExperiments(experiments) {
  if (!experiments?.length) return "";
  const content = experiments.map((experiment) => {
    const title = experiment.title_zh || experiment.title;
    const wandbUrl = safeExternalUrl(experiment.wandb_url);
    const status = EXPERIMENT_STATUS_LABEL[experiment.status] ?? experiment.status;
    const cursor = CURSOR_TYPE_LABEL[experiment.cursor_type] ?? experiment.cursor_type;
    const metrics = renderExperimentMetrics(experiment.final_metrics);
    const covered = experiment.covered_feature_ids?.length
      ? `<p class="experiment-covered">覆盖 Feature：${experiment.covered_feature_ids.map((id) => `<code>${escapeHtml(id)}</code>`).join(" ")}</p>`
      : "";
    const rootReferenceNotice = experiment.type === "training_reference" && experiment.covered_feature_ids?.includes("feat-olmo3-standard")
      ? `<p class="experiment-notice">外部训练日志参考；不是 OLMo-3 标准态的 root provenance。</p>`
      : "";
    return `
      <article class="experiment-card status-${escapeHtml(experiment.status)}">
        <div class="experiment-card-head">
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(status)}</span>
        </div>
        <code>${escapeHtml(experiment.id)}</code>
        ${experiment.summary_zh || experiment.summary ? `<p>${escapeHtml(experiment.summary_zh || experiment.summary)}</p>` : ""}
        <div class="experiment-cursor"><span>光标类型</span><strong>${escapeHtml(cursor)}</strong></div>
        ${metrics}
        ${wandbUrl ? `<a class="wandb-link" href="${escapeHtml(wandbUrl)}" target="_blank" rel="noreferrer">打开 W&B run ↗</a>` : ""}
        ${rootReferenceNotice}
        ${covered}
      </article>
    `;
  }).join("");
  return htmlSection("实验覆盖 / W&B 与结果", `<div class="experiment-list">${content}</div>`, "detail-experiments");
}

function renderRelations(feature, tree) {
  const dependencies = feature.depends_on.map((id) => tree.byId.get(id)).filter(Boolean);
  const related = feature.related_to.map((id) => tree.byId.get(id)).filter(Boolean);
  if (!dependencies.length && !related.length) return "";
  return section("辅助关系", {
    ...(dependencies.length ? { "依赖 Feature": dependencies.map((item) => `${featureTitle(item)} · ${item.id}`) } : {}),
    ...(related.length ? { "相关 Feature": related.map((item) => `${featureTitle(item)} · ${item.id}`) } : {}),
  });
}

function renderLimitationsAndProvenance(feature) {
  const validation = validationView(feature);
  const limitationHtml = validation.limitations.length
    ? `<div class="provenance-block"><span>Limitations</span>${renderValue(validation.limitations)}</div>`
    : "";
  const evidenceHtml = feature.evidence?.length
    ? `<div class="provenance-block"><span>Evidence</span>${renderValue(feature.evidence)}</div>`
    : "";
  const sources = feature.provenance?.sources && typeof feature.provenance.sources === "object"
    ? Object.entries(feature.provenance.sources)
    : [];
  const sourceHtml = sources.length
    ? `<div class="provenance-block provenance-sources"><span>Sources</span>${sources.map(([sourceId, source]) => `
      <article class="provenance-source">
        <div><code>${escapeHtml(sourceId)}</code><strong>${escapeHtml(source.state ?? "")}</strong></div>
        ${source.note ? `<p>${escapeHtml(source.note)}</p>` : ""}
        ${source.source_ids?.length ? `<small>Evidence IDs: ${source.source_ids.map((id) => escapeHtml(id)).join(", ")}</small>` : ""}
      </article>
    `).join("")}</div>`
    : "";
  return htmlSection(
    "Limitations / 来源与 provenance",
    `${limitationHtml}${evidenceHtml}${sourceHtml}`,
    "detail-provenance",
  );
}

export function renderDetail(feature, tree, experiments = []) {
  const parent = feature.parent_id ? tree.byId.get(feature.parent_id) : null;
  const validation = featureValidation(feature);
  const englishSubtitle = featureEnglishSubtitle(feature)
    ? `<p class="detail-title-en">${escapeHtml(featureEnglishSubtitle(feature))}</p>`
    : "";
  return `
    <div class="detail-header">
      <div class="detail-eyebrow validation-${validation.key}"><span class="status-dot"></span>${escapeHtml(validation.label)}<span class="detail-category">${escapeHtml(feature.category ?? (feature.kind === "baseline" ? "baseline" : "feature"))}</span></div>
      <h1>${escapeHtml(featureTitle(feature))}</h1>
      ${englishSubtitle}
      <code>${escapeHtml(feature.id)}</code>
    </div>
    ${section("一句话结构作用 / 摘要", featureSummary(feature), "detail-summary")}
    ${renderDelta(feature, parent)}
    ${renderConfiguration(feature)}
    ${renderLocators(feature)}
    ${renderValidation(feature)}
    ${renderExperiments(experiments)}
    ${renderRelations(feature, tree)}
    ${renderLimitationsAndProvenance(feature)}
  `;
}
