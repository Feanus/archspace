import {
  lifecycleStatusFromLabels,
  modelSubtitle,
  modelTitle,
} from "./model-data-adapter.js";

const LIFECYCLE_STATUS_LABELS = Object.freeze({
  "under-review": "Under Review",
  "in-progress": "In Progress",
  declined: "Declined",
  done: "Done",
});

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function cleanDisplay(value) {
  return String(value ?? "")
    .replace(/^`|`$/g, "")
    .trim();
}

function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return "";
    for (const key of [...url.searchParams.keys()]) {
      if (/(access.?token|auth|credential|key|secret|signature)/i.test(key)) url.searchParams.delete(key);
    }
    return url.href;
  } catch {
    return "";
  }
}

function textBlock(value, empty = "Not provided") {
  const text = cleanDisplay(value);
  if (!text) return `<span class="empty-value">${escapeHtml(empty)}</span>`;
  return `<p class="copy-block">${escapeHtml(text).replace(/\n/g, "<br>")}</p>`;
}

function externalLink(url, label = "Open source") {
  const safe = safeExternalUrl(url);
  return safe
    ? `<a class="source-link" href="${escapeHtml(safe)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`
    : "";
}

function section(title, content, className = "") {
  if (!content) return "";
  const heading = title ? `<h3>${escapeHtml(title)}</h3>` : "";
  return `<section class="detail-section ${className}">${heading}<div>${content}</div></section>`;
}

function facts(entries) {
  const rows = entries
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(cleanDisplay(value))}</dd></div>`)
    .join("");
  return rows ? `<dl class="fact-list">${rows}</dl>` : "";
}

function renderProposal(model, tree) {
  const issue = model.issue;
  const parsed = issue?.parsed ?? {};
  const parent = tree.byId.get(model.parent_id);

  return `
    ${section("", facts([
      ["Architecture Name", parsed.architectureName || parsed.architectureId || "Not provided"],
      ["Parent Architecture", model.parentResolution === "root" ? "Root node" : parent ? modelTitle(parent) : "Unresolved"],
      ["Parent issue", model.parentIssueRaw || "None"],
    ]), "model-relation")}
    ${section("Motivations", textBlock(parsed.motivations))}
    ${section("Proposed Architecture", textBlock(parsed.proposedArchitecture))}
    ${section("Existing Results", textBlock(parsed.existingResults))}
    ${section("Experiments Plan", textBlock(parsed.experimentsPlan))}
  `;
}

function renderValueRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return "";
  return `<div class="data-table">${rows.map((row) => {
    const value = cleanDisplay(row?.value);
    const placeholder = /^<.+>$/.test(value);
    return `<div class="${value && !placeholder ? "" : "is-empty"}"><span>${escapeHtml(row?.label || row?.key)}</span><strong>${escapeHtml(value && !placeholder ? value : "—")}</strong></div>`;
  }).join("")}</div>`;
}

function renderObjectRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return "";
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row ?? {})))];
  return `<div class="result-table">
    <div class="result-table-row result-table-head">${columns.map((column) => `<strong>${escapeHtml(column)}</strong>`).join("")}</div>
    ${rows.map((row) => `<div class="result-table-row">${columns.map((column) => `<span>${escapeHtml(cleanDisplay(row?.[column]) || "—")}</span>`).join("")}</div>`).join("")}
  </div>`;
}

function renderCheckboxes(items) {
  if (!Array.isArray(items) || !items.length) return "";
  return `<ul class="check-list">${items.map((item) => `<li class="${item.checked ? "is-checked" : ""}"><span aria-hidden="true">${item.checked ? "✓" : "○"}</span>${escapeHtml(item.label)}</li>`).join("")}</ul>`;
}

function renderSectionTreeContent(value) {
  const lines = cleanDisplay(value).split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return "";
  return `<div class="section-tree-copy">${lines.map((line) => {
    const labeled = line.match(/^\*{1,2}([^*]+?):\*{1,2}\s*(.*)$/);
    if (!labeled) return `<p>${escapeHtml(line)}</p>`;
    return `<p><strong>${escapeHtml(labeled[1])}:</strong>${labeled[2] ? ` ${escapeHtml(labeled[2])}` : ""}</p>`;
  }).join("")}</div>`;
}

function renderSectionTreeNodes(nodes, depth = 0) {
  if (!Array.isArray(nodes)) return "";
  return nodes.map((node) => {
    const title = cleanDisplay(node?.title);
    const content = cleanDisplay(node?.content);
    const children = renderSectionTreeNodes(node?.children, depth + 1);
    if (!title && !content && !children) return "";
    const headingLevel = Math.min(6, 4 + depth);
    return `
      <section class="section-tree-node depth-${Math.min(depth + 1, 3)}">
        ${title ? `<h${headingLevel}>${escapeHtml(title)}</h${headingLevel}>` : ""}
        ${content ? renderSectionTreeContent(content) : ""}
        ${children ? `<div class="section-tree-children">${children}</div>` : ""}
      </section>
    `;
  }).join("");
}

function renderSectionTree(summary) {
  if (typeof summary === "string") return textBlock(summary);
  if (!summary || typeof summary !== "object") return "";
  const intro = cleanDisplay(summary.intro);
  const sections = renderSectionTreeNodes(summary.sections);
  if (!intro && !sections) return "";
  return `<div class="section-tree">
    ${intro ? `<div class="section-tree-intro">${textBlock(intro)}</div>` : ""}
    ${sections}
  </div>`;
}

function archiveLinkEntries(archive) {
  const fields = Array.isArray(archive)
    ? archive
    : Object.entries(archive || {}).map(([key, value]) => ({
      key,
      label: key === "reportLink" ? "Report Link" : key,
      value,
    }));
  return fields.map((field) => {
    const value = field?.value ?? field;
    const url = safeExternalUrl(typeof value === "string" ? value : value?.url);
    if (!url) return null;
    const label = cleanDisplay(field.label)
      .replace(/\s+Link$/i, "")
      .replace(/\s*\([^)]*\)\s*$/, "") || "Open";
    return { label, url };
  }).filter(Boolean);
}

function renderArchiveLinks(archive) {
  const links = archiveLinkEntries(archive)
    .map(({ label, url }) => externalLink(url, label))
    .join("");
  return links ? `<div class="source-links">${links}</div>` : "";
}

function renderPullRequest(pullRequest) {
  const parsed = pullRequest?.parsed ?? {};
  const metadata = parsed.metadata ?? {};
  const legacyBasic = parsed.basicInformation ?? {};
  const architectureProposal = parsed.architectureProposalIssue ?? legacyBasic.proposalIssue;
  const archive = parsed.archive ?? parsed.reportLinks;
  const implementationDetails = parsed.implementationDetails ?? parsed.implementationSummary;
  const experimentalValidation = parsed.experimentalValidation ?? parsed.experimentsSummary;
  const base = pullRequest.base
    ? `${pullRequest.base.repo || ""}:${pullRequest.base.branch || ""}`
    : `${pullRequest.baseRepo || ""}:${pullRequest.baseBranch || ""}`;
  const head = pullRequest.head
    ? `${pullRequest.head.repo || ""}:${pullRequest.head.branch || ""}`
    : `${pullRequest.headRepo || ""}:${pullRequest.headBranch || ""}`;

  return `
    <section class="pr-summary">
      <div>
        <span class="pr-state pr-state-${escapeHtml(pullRequest.state)}">${escapeHtml(pullRequest.merged ? "merged" : pullRequest.state)}</span>
        <strong>${escapeHtml(metadata.title || parsed.templateTitle || parsed.title || pullRequest.title)}</strong>
        <small>PR #${escapeHtml(pullRequest.number)} · ${escapeHtml(pullRequest.author || "unknown")}</small>
      </div>
      ${externalLink(pullRequest.url, "Open Pull Request")}
    </section>
    ${section("", facts([
      ["Architecture Name", metadata.architectureName || legacyBasic.architectureName],
      ["About", metadata.about],
      ["Architecture Proposal", architectureProposal?.label],
      ["Base", base],
      ["Head", head],
    ]), "pr-association")}
    ${section("Implementation Details", textBlock(implementationDetails))}
    ${section("Experimental Validation", renderSectionTree(experimentalValidation))}
    ${section("Archive", renderArchiveLinks(archive))}
    ${section("Reviewer Assessment", textBlock(parsed.reviewerAssessment))}
    ${section("Merge Checklist", renderCheckboxes(parsed.mergeChecklist))}
  `;
}

function pullRequestSummary(model) {
  const pullRequest = model.pullRequests[0];
  if (!pullRequest) return null;
  const lifecycleStatus = lifecycleStatusFromLabels(pullRequest.labels);
  return {
    id: `pr-${pullRequest.number}`,
    number: pullRequest.number,
    lifecycleStatus,
    lifecycleStatusLabel: LIFECYCLE_STATUS_LABELS[lifecycleStatus] || "",
  };
}

function renderDonePullRequest(model) {
  const mergedPullRequest = model.pullRequests.find((pullRequest) => pullRequest.merged === true);
  if (!mergedPullRequest) return "";

  const links = archiveLinkEntries(
    mergedPullRequest.parsed?.archive ?? mergedPullRequest.parsed?.reportLinks,
  )
    .map(({ label, url }) => `
      <a class="done-report-link" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">
        <span>${escapeHtml(label)}</span>
        <i aria-hidden="true">↗</i>
      </a>
    `)
    .join("");

  return `
    <details class="done-pr-panel" open>
      <summary class="done-pr-header">
        <strong>The model is merged</strong>
        <span class="done-pr-chevron" aria-hidden="true"></span>
      </summary>
      ${links ? `<div class="done-pr-list">${links}</div>` : ""}
    </details>
  `;
}

function renderOverview(model, tree) {
  if (model.nodeType === "parent_issue") {
    const childModels = (tree.childrenById.get(model.id) ?? []).filter((node) => node.nodeType === "model");
    return `
      ${section("External parent Issue", facts([
        ["Issue", `#${model.parentIssueNumber}`],
        ["Referenced models", childModels.length],
        ["Description", model.summary],
      ]) + externalLink(model.parentIssue?.url, `Open Issue #${model.parentIssueNumber}`))}
      ${section("Direct descendant models", `<ul class="model-link-list">${childModels.map((node) => `<li><strong>${escapeHtml(modelTitle(node))}</strong><span>Issue #${node.issueNumber}</span></li>`).join("")}</ul>`)}
    `;
  }

  return `
    ${section("Offline data source", facts([
      ["Repository", tree.source?.repo],
      ["Branch", tree.source?.defaultBranch],
      ["Fetched at", tree.source?.fetchedAt],
      ["Model Issues", tree.stats.models],
      ["Pull Requests", tree.stats.pullRequests],
      ["Linked Pull Requests", tree.stats.linkedPullRequests],
      ["External parent Issues", tree.stats.externalParentIssues],
    ]))}
    ${section("Relationship rules", textBlock("Each Issue creates a model node. An empty parentIssue marks the lineage root; an Issue in the snapshot connects to its parent model, while an Issue outside the snapshot connects to a shared external-parent placeholder. Pull Requests are associated through Architecture Proposal (issue #)."))}
    ${tree.unmatchedPullRequests.length ? section("Unmatched Pull Requests", textBlock("These Pull Requests reference Proposal Issues that are not present in the current offline snapshot.")) : ""}
  `;
}

export function renderModelDetail(model, tree, requestedTab = "", overviewExpanded = false) {
  const pullRequestTab = model.nodeType === "model" ? pullRequestSummary(model) : null;
  const activeTab = pullRequestTab?.id === requestedTab ? requestedTab : "";
  const pullRequest = model.nodeType === "model" ? model.pullRequests[0] : null;
  const pullRequestExpanded = Boolean(pullRequest && pullRequestTab?.id === activeTab);
  const overview = model.nodeType === "model"
    ? renderProposal(model, tree)
    : renderOverview(model, tree);
  const issueLink = model.nodeType === "model"
    ? externalLink(model.issue?.url, "Open Issue")
    : "";

  return `
    <div class="detail-header model-detail-header">
      <div class="detail-eyebrow"><span class="status-dot"></span>${escapeHtml(model.state)}<span class="detail-category">${escapeHtml(model.category)}</span></div>
      <h1>${escapeHtml(modelTitle(model))}</h1>
      <div class="detail-header-meta">
        <code>${escapeHtml(modelSubtitle(model))}</code>
        ${issueLink}
      </div>
    </div>
    <section class="overview-panel">
      <button class="overview-toggle" type="button" data-overview-toggle aria-expanded="${overviewExpanded}" aria-controls="overview-content">
        <span>Proposal</span>
        <span class="overview-chevron" aria-hidden="true">↓</span>
      </button>
      <div id="overview-content" class="overview-content${overviewExpanded ? " is-expanded" : ""}" aria-hidden="${!overviewExpanded}">
        <div class="collapsible-inner">${overview}</div>
      </div>
    </section>
    ${model.nodeType === "model" && pullRequestTab ? `
      <section class="pull-request-panel">
        <button class="pull-request-toggle" type="button" data-detail-tab="${escapeHtml(pullRequestTab.id)}" aria-expanded="${pullRequestTab.id === activeTab}" aria-controls="pr-content-${escapeHtml(pullRequestTab.number)}">
          <span class="pull-request-copy">
            <strong>Implementation</strong>
          </span>
          <span class="pull-request-actions">
            ${pullRequestTab.lifecycleStatus ? `<em class="pr-lifecycle-${escapeHtml(pullRequestTab.lifecycleStatus)}">${escapeHtml(pullRequestTab.lifecycleStatusLabel)}</em>` : ""}
            <i class="pull-request-chevron" aria-hidden="true">↓</i>
          </span>
        </button>
        ${pullRequest ? `
          <div id="pr-content-${escapeHtml(pullRequest.number)}" class="model-tab-panel${pullRequestExpanded ? " is-expanded" : ""}" role="tabpanel" aria-hidden="${!pullRequestExpanded}">
            <div class="collapsible-inner">${renderPullRequest(pullRequest)}</div>
          </div>
        ` : ""}
      </section>
    ` : ""}
    ${model.nodeType === "model" ? renderDonePullRequest(model) : ""}
  `;
}
