import { modelSubtitle, modelTitle } from "./model-data-adapter.js";

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

function textBlock(value, empty = "未填写") {
  const text = cleanDisplay(value);
  if (!text) return `<span class="empty-value">${escapeHtml(empty)}</span>`;
  return `<p class="copy-block">${escapeHtml(text).replace(/\n/g, "<br>")}</p>`;
}

function externalLink(url, label = "打开来源") {
  const safe = safeExternalUrl(url);
  return safe
    ? `<a class="source-link" href="${escapeHtml(safe)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`
    : "";
}

function urlsFromText(value) {
  const links = [];
  const seen = new Set();
  for (const match of String(value ?? "").matchAll(/https?:\/\/[^\s)\]]+/g)) {
    const safe = safeExternalUrl(match[0]);
    if (safe && !seen.has(safe)) {
      seen.add(safe);
      links.push(safe);
    }
  }
  return links;
}

function section(title, content, className = "") {
  if (!content) return "";
  return `<section class="detail-section ${className}"><h3>${escapeHtml(title)}</h3><div>${content}</div></section>`;
}

function facts(entries) {
  const rows = entries
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(cleanDisplay(value))}</dd></div>`)
    .join("");
  return rows ? `<dl class="fact-list">${rows}</dl>` : "";
}

function labeledBlocks(entries) {
  return entries
    .filter(([, value]) => cleanDisplay(value))
    .map(([label, value]) => `<div class="labeled-copy"><span>${escapeHtml(label)}</span>${textBlock(value)}</div>`)
    .join("");
}

function evidenceBlock(evidence) {
  const entries = [
    ["论文或技术报告", evidence?.papers],
    ["相关实现", evidence?.implementations],
    ["实验依据", evidence?.experimentalEvidence],
  ].filter(([, value]) => cleanDisplay(value));
  if (!entries.length) return "";
  return entries.map(([label, value]) => {
    const links = urlsFromText(value)
      .map((url) => externalLink(url, new URL(url).hostname))
      .join("");
    return `<div class="labeled-copy"><span>${escapeHtml(label)}</span>${textBlock(value)}${links ? `<div class="source-links">${links}</div>` : ""}</div>`;
  }).join("");
}

function relatedWorkBlock(relatedWork) {
  if (!relatedWork) return "";
  const links = (Array.isArray(relatedWork.references) ? relatedWork.references : [])
    .map((reference) => externalLink(reference?.url, reference?.label || "打开来源"))
    .filter(Boolean)
    .join("");
  return [
    textBlock(relatedWork.raw, ""),
    links ? `<div class="source-links">${links}</div>` : "",
  ].filter(Boolean).join("");
}

function renderProposal(model, tree) {
  const issue = model.issue;
  const parsed = issue?.parsed ?? {};
  const parent = tree.byId.get(model.parent_id);
  const issueLink = externalLink(issue?.url, `打开 Issue #${issue?.number}`);

  return `
    ${section("模型关系", facts([
      ["模型节点", modelTitle(model)],
      ["Parent", model.parentResolution === "root" ? "根节点" : parent ? modelTitle(parent) : "未解析"],
      ["Parent issue", model.parentIssueRaw || "None"],
      ["Architecture Name", parsed.architectureName || parsed.architectureId || "未填写"],
    ]) + issueLink, "model-relation")}
    ${section("Motivations", textBlock(parsed.motivations))}
    ${section("Proposed Architecture", textBlock(parsed.proposedArchitecture))}
    ${section("Experiments Plan", textBlock(parsed.experimentsPlan))}
    ${section("Related work", relatedWorkBlock(parsed.relatedWork))}
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

function renderReportLink(reportLinks) {
  const reportLink = reportLinks?.reportLink;
  const url = safeExternalUrl(reportLink?.url);
  return url
    ? `<div class="source-links">${externalLink(url, "Report")}</div>`
    : "";
}

function renderPullRequest(pullRequest) {
  const parsed = pullRequest?.parsed ?? {};
  const basic = parsed.basicInformation ?? {};
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
        <strong>${escapeHtml(parsed.templateTitle || parsed.title || pullRequest.title)}</strong>
        <small>PR #${escapeHtml(pullRequest.number)} · ${escapeHtml(pullRequest.author || "unknown")}</small>
      </div>
      ${externalLink(pullRequest.url, "打开 Pull Request")}
    </section>
    ${section("关联与进度", facts([
      ["Architecture Name", basic.architectureName],
      ["Proposal Issue", basic.proposalIssue?.label],
      ["Base", base],
      ["Head", head],
    ]))}
    ${section("Report Link", renderReportLink(parsed.reportLinks))}
    ${section("Implementation summary", textBlock(parsed.implementationSummary))}
    ${section("Experiments summary", textBlock(parsed.experimentsSummary))}
    ${section("Experiments outcome", renderCheckboxes(parsed.experimentsOutcome))}
    ${section("Reproduction status", renderCheckboxes(parsed.reproductionStatus))}
    ${section("Conclusion", textBlock(parsed.conclusion))}
    ${section("Merge checklist", renderCheckboxes(parsed.mergeChecklist))}
  `;
}

function tabsForModel(model) {
  if (model.nodeType === "model") {
    return [
      {
        id: "proposal",
        label: cleanDisplay(model.issue?.parsed?.architectureName) || modelTitle(model),
      },
      ...model.pullRequests.map((pullRequest) => ({
        id: `pr-${pullRequest.number}`,
        label: cleanDisplay(pullRequest.parsed?.basicInformation?.architectureName)
          || cleanDisplay(pullRequest.title)
          || `PR #${pullRequest.number}`,
      })),
    ];
  }
  if (model.nodeType === "repository") {
    return [
      { id: "overview", label: "快照概览" },
      ...model.pullRequests.map((pullRequest) => ({ id: `pr-${pullRequest.number}`, label: `未关联 PR #${pullRequest.number}` })),
    ];
  }
  return [{ id: "overview", label: "外部父 Issue" }];
}

function renderOverview(model, tree) {
  if (model.nodeType === "parent_issue") {
    const childModels = (tree.childrenById.get(model.id) ?? []).filter((node) => node.nodeType === "model");
    return `
      ${section("外部父 Issue", facts([
        ["Issue", `#${model.parentIssueNumber}`],
        ["引用模型数", childModels.length],
        ["说明", model.summary],
      ]) + externalLink(model.parentIssue?.url, `打开 Issue #${model.parentIssueNumber}`))}
      ${section("直接派生模型", `<ul class="model-link-list">${childModels.map((node) => `<li><strong>${escapeHtml(modelTitle(node))}</strong><span>Issue #${node.issueNumber}</span></li>`).join("")}</ul>`)}
    `;
  }

  return `
    ${section("离线数据源", facts([
      ["Repository", tree.source?.repo],
      ["Branch", tree.source?.defaultBranch],
      ["Fetched at", tree.source?.fetchedAt],
      ["模型 Issue", tree.stats.models],
      ["Pull Requests", tree.stats.pullRequests],
      ["已关联 PR", tree.stats.linkedPullRequests],
      ["外部父 Issue", tree.stats.externalParentIssues],
    ]))}
    ${section("关系规则", textBlock("Issue 生成模型节点；parentIssue 为空时作为谱系根节点，引用快照内 Issue 时连接对应父模型，引用快照外 Issue 时连接共享的外部父 Issue 占位节点。PR 按 Basic information 中的 Proposal Issue 关联到模型。"))}
    ${tree.unmatchedPullRequests.length ? section("未关联 Pull Requests", textBlock("这些 PR 指向的 Proposal Issue 不在当前离线快照中，可通过上方选项卡查看。")) : ""}
  `;
}

export function renderModelDetail(model, tree, requestedTab = "") {
  const tabs = tabsForModel(model);
  const activeTab = tabs.some((tab) => tab.id === requestedTab) ? requestedTab : tabs[0].id;
  const pullRequest = activeTab.startsWith("pr-")
    ? model.pullRequests.find((item) => `pr-${item.number}` === activeTab)
    : null;
  const content = pullRequest
    ? renderPullRequest(pullRequest)
    : activeTab === "proposal"
      ? renderProposal(model, tree)
      : renderOverview(model, tree);

  return `
    <div class="detail-header model-detail-header">
      <div class="detail-eyebrow"><span class="status-dot"></span>${escapeHtml(model.state)}<span class="detail-category">${escapeHtml(model.category)}</span></div>
      <h1>${escapeHtml(modelTitle(model))}</h1>
      <code>${escapeHtml(modelSubtitle(model))}</code>
    </div>
    <div class="model-tabs" role="tablist" aria-label="${escapeHtml(modelTitle(model))} 信息">
      ${tabs.map((tab) => `<button type="button" role="tab" data-detail-tab="${escapeHtml(tab.id)}" aria-selected="${tab.id === activeTab}">${escapeHtml(tab.label)}</button>`).join("")}
    </div>
    <div class="model-tab-panel" role="tabpanel">${content}</div>
  `;
}
