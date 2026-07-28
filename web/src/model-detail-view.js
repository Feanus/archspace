import {
  lifecycleStatusFromLabels,
  modelSubtitle,
  modelTitle,
} from "./model-data-adapter.js";

const LIFECYCLE_STATUS_LABELS = Object.freeze({
  "under-review": "Under Review",
  "in-progress": "In Progress",
  declined: "Declined",
  verified: "Verified",
  closed: "Closed",
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

const EMBEDDED_IMAGE_PATTERN = /!\[[^\]]*\]\(\s*<?https?:\/\/[^)\s>]+>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)|<img\b[^>]*>/gi;

function htmlAttribute(source, name) {
  const match = String(source || "").match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"),
  );
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? "";
}

function parseEmbeddedImage(token) {
  if (token.startsWith("![")) {
    const match = token.match(
      /^!\[([^\]]*)\]\(\s*<?(https?:\/\/[^)\s>]+)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)$/i,
    );
    if (!match) return null;
    const url = safeExternalUrl(match[2]);
    return url ? { url, alt: cleanDisplay(match[1]), width: "", height: "" } : null;
  }

  const url = safeExternalUrl(htmlAttribute(token, "src"));
  if (!url) return null;
  const width = htmlAttribute(token, "width");
  const height = htmlAttribute(token, "height");
  return {
    url,
    alt: cleanDisplay(htmlAttribute(token, "alt")),
    width: /^\d+$/.test(width) ? width : "",
    height: /^\d+$/.test(height) ? height : "",
  };
}

function renderEmbeddedImage(image) {
  const alt = image.alt || "Attached image";
  const dimensions = [
    image.width ? ` width="${escapeHtml(image.width)}"` : "",
    image.height ? ` height="${escapeHtml(image.height)}"` : "",
  ].join("");
  return `<figure class="embedded-image">
    <a href="${escapeHtml(image.url)}" target="_blank" rel="noreferrer" aria-label="Open ${escapeHtml(alt)}">
      <img src="${escapeHtml(image.url)}" alt="${escapeHtml(alt)}"${dimensions} loading="lazy" decoding="async">
    </a>
  </figure>`;
}

function renderEmbeddedContent(value, renderText) {
  const source = cleanDisplay(value);
  const chunks = [];
  let cursor = 0;
  EMBEDDED_IMAGE_PATTERN.lastIndex = 0;
  for (const match of source.matchAll(EMBEDDED_IMAGE_PATTERN)) {
    if (match.index > cursor) chunks.push(renderText(source.slice(cursor, match.index)));
    const image = parseEmbeddedImage(match[0]);
    chunks.push(image ? renderEmbeddedImage(image) : renderText(match[0]));
    cursor = match.index + match[0].length;
  }
  if (cursor < source.length) chunks.push(renderText(source.slice(cursor)));
  return chunks.filter(Boolean).join("");
}

function renderMarkdownInline(value) {
  let source = String(value ?? "").replace(/\0/g, "");
  const tokens = [];
  const store = (html) => {
    const index = tokens.push(html) - 1;
    return `\0${index}\0`;
  };

  source = source.replace(/`([^`\n]+)`/g, (_, code) =>
    store(`<code>${escapeHtml(code)}</code>`));
  source = source.replace(/\[([^\]\n]+)\]\(\s*<?(https?:\/\/[^)\s>]+)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/gi,
    (_, label, url) => {
      const safe = safeExternalUrl(url);
      return safe
        ? store(`<a class="markdown-link" href="${escapeHtml(safe)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`)
        : escapeHtml(label);
    });
  source = source.replace(/<((?:https?):\/\/[^>\s]+)>/gi, (_, url) => {
    const safe = safeExternalUrl(url);
    return safe
      ? store(`<a class="markdown-link" href="${escapeHtml(safe)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a>`)
      : escapeHtml(url);
  });
  const mathToken = (latex) => store(
    `<span class="math-inline" data-latex="${escapeHtml(latex)}">${escapeHtml(`\\(${latex}\\)`)}</span>`,
  );
  source = source.replace(/\\\((.*?)\\\)/g, (_, latex) => mathToken(latex));
  source = source.replace(/(^|[^\\])\$([^$\n]+)\$/g, (_, prefix, latex) =>
    `${prefix}${mathToken(latex)}`);

  let html = escapeHtml(source)
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s).,!?:;])/g, "$1<em>$2</em>")
    .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?:;])/g, "$1<em>$2</em>")
    .replace(/~~([^~\n]+)~~/g, "<del>$1</del>");
  html = html.replace(/\0(\d+)\0/g, (_, index) => tokens[Number(index)] ?? "");
  return html;
}

function markdownTableCells(line) {
  let source = String(line ?? "").trim();
  if (!source.includes("|")) return [];
  if (source.startsWith("|")) source = source.slice(1);
  if (source.endsWith("|") && !source.endsWith("\\|")) source = source.slice(0, -1);

  const cells = [];
  let cell = "";
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === "\\" && source[index + 1] === "|") {
      cell += "|";
      index += 1;
    } else if (character === "|") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function markdownTableAlignments(line) {
  const cells = markdownTableCells(line);
  if (!cells.length || cells.some((cell) => !/^:?-{2,}:?$/.test(cell))) return null;
  return cells.map((cell) => {
    if (cell.startsWith(":") && cell.endsWith(":")) return "center";
    if (cell.endsWith(":")) return "right";
    return "left";
  });
}

function renderDisplayMath(latex) {
  return `<div class="math-display" data-latex="${escapeHtml(latex)}">${escapeHtml(`$$\n${latex}\n$$`)}</div>`;
}

function renderMarkdownText(value) {
  const lines = String(value ?? "").replace(/\r\n?/g, "\n").trim().split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^\s*```([\w+-]*)\s*$/);
    if (fence) {
      const code = [];
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      const language = fence[1] ? ` data-language="${escapeHtml(fence[1])}"` : "";
      blocks.push(`<pre class="markdown-code"><code${language}>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    const singleLineMath = line.match(/^\s*\$\$(.+?)\$\$\s*$/);
    if (singleLineMath) {
      blocks.push(renderDisplayMath(singleLineMath[1].trim()));
      index += 1;
      continue;
    }

    if (/^\s*\$\$\s*$/.test(line)) {
      const closingIndex = lines.findIndex(
        (candidate, candidateIndex) =>
          candidateIndex > index && /^\s*\$\$\s*$/.test(candidate),
      );
      if (closingIndex !== -1) {
        blocks.push(renderDisplayMath(lines.slice(index + 1, closingIndex).join("\n").trim()));
        index = closingIndex + 1;
        continue;
      }
    }

    const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      const level = Math.min(6, heading[1].length + 3);
      blocks.push(`<h${level} class="markdown-heading">${renderMarkdownInline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    const tableAlignments = index + 1 < lines.length
      ? markdownTableAlignments(lines[index + 1])
      : null;
    const tableHeaders = tableAlignments ? markdownTableCells(line) : [];
    if (tableAlignments && tableHeaders.length === tableAlignments.length) {
      const rows = [];
      index += 2;
      while (index < lines.length && lines[index].trim() && lines[index].includes("|")) {
        const cells = markdownTableCells(lines[index]);
        if (cells.length !== tableHeaders.length) break;
        rows.push(cells);
        index += 1;
      }
      const alignmentClass = (columnIndex) => ` class="markdown-align-${tableAlignments[columnIndex]}"`;
      blocks.push(`<div class="markdown-table-wrap"><table class="markdown-table">
        <thead><tr>${tableHeaders.map((cell, columnIndex) =>
    `<th${alignmentClass(columnIndex)}>${renderMarkdownInline(cell)}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((row) => `<tr>${row.map((cell, columnIndex) =>
    `<td${alignmentClass(columnIndex)}>${renderMarkdownInline(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
      </table></div>`);
      continue;
    }

    if (/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line)) {
      blocks.push('<hr class="markdown-rule">');
      index += 1;
      continue;
    }

    const unordered = line.match(/^\s*[-+*]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      const tag = ordered ? "ol" : "ul";
      const items = [];
      const pattern = ordered ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-+*]\s+(.+)$/;
      while (index < lines.length) {
        const item = lines[index].match(pattern);
        if (!item) break;
        items.push(`<li>${renderMarkdownInline(item[1])}</li>`);
        index += 1;
      }
      blocks.push(`<${tag} class="markdown-list">${items.join("")}</${tag}>`);
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quote = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push(`<blockquote>${quote.map(renderMarkdownInline).join("<br>")}</blockquote>`);
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (
      index < lines.length
      && lines[index].trim()
      && !/^\s*(?:```|\$\$|#{1,6}\s|[-+*]\s+|\d+[.)]\s+|>\s?|---+\s*$|\*\*\*+\s*$|___+\s*$)/.test(lines[index])
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(`<p>${paragraph.map(renderMarkdownInline).join("<br>")}</p>`);
  }

  return blocks.join("");
}

function markdownBlock(value, empty = "Not provided") {
  const text = cleanDisplay(value);
  if (!text) return `<span class="empty-value">${escapeHtml(empty)}</span>`;
  return `<div class="markdown-block">${renderEmbeddedContent(text, renderMarkdownText)}</div>`;
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
  const preliminaryResults = parsed.preliminaryResults || parsed.existingResults;

  return `
    ${section("", facts([
      ["Architecture Name", parsed.architectureName || parsed.architectureId || "Not provided"],
      ["Parent Architecture", model.parentResolution === "root" ? "Root node" : parent ? modelTitle(parent) : "Unresolved"],
      ["Parent issue", model.parentIssueRaw || "None"],
    ]), "model-relation")}
    ${section("Motivations", markdownBlock(parsed.motivations))}
    ${section("Proposed Architecture", markdownBlock(parsed.proposedArchitecture))}
    ${cleanDisplay(preliminaryResults) ? section("Preliminary results (if any)", markdownBlock(preliminaryResults)) : ""}
    ${section("Experiments Plan", markdownBlock(parsed.experimentsPlan))}
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
  return markdownBlock(value);
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
  if (typeof summary === "string") return markdownBlock(summary);
  if (!summary || typeof summary !== "object") return "";
  const intro = cleanDisplay(summary.intro);
  const sections = renderSectionTreeNodes(summary.sections);
  if (!intro && !sections) return "";
  return `<div class="section-tree">
    ${intro ? `<div class="section-tree-intro">${markdownBlock(intro)}</div>` : ""}
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
    ${section("Implementation Details", markdownBlock(implementationDetails))}
    ${section("Experimental Validation", renderSectionTree(experimentalValidation))}
    ${section("Archive", renderArchiveLinks(archive))}
    ${section("Reviewer Assessment", markdownBlock(parsed.reviewerAssessment))}
    ${section("Merge Checklist", renderCheckboxes(parsed.mergeChecklist))}
  `;
}

function pullRequestSummary(model) {
  const pullRequest = model.pullRequests[0];
  if (!pullRequest) return null;
  const lifecycleStatus = pullRequest.merged
    ? "verified"
    : pullRequest.state === "closed"
      ? "closed"
      : lifecycleStatusFromLabels(pullRequest.labels);
  return {
    id: `pr-${pullRequest.number}`,
    number: pullRequest.number,
    lifecycleStatus,
    lifecycleStatusLabel: LIFECYCLE_STATUS_LABELS[lifecycleStatus] || "",
  };
}

function renderVerifiedPullRequest(model) {
  const mergedPullRequest = model.pullRequests.find((pullRequest) => pullRequest.merged === true);
  if (!mergedPullRequest) return "";

  const branchUrl = (reference) => {
    const repo = cleanDisplay(reference?.repo);
    const branch = cleanDisplay(reference?.branch);
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || !branch) return "";
    const encodedBranch = branch.split("/").map(encodeURIComponent).join("/");
    return safeExternalUrl(`https://github.com/${repo}/tree/${encodedBranch}`);
  };
  const mergeRefLabel = (reference, fallbackOwner = "unknown") => {
    const owner = cleanDisplay(reference?.repo).split("/")[0] || fallbackOwner;
    const branch = cleanDisplay(reference?.branch) || "unknown";
    return `${owner}-${branch}`;
  };
  const mergeSource = mergeRefLabel(
    mergedPullRequest.head ?? {
      repo: mergedPullRequest.headRepo,
      branch: mergedPullRequest.headBranch,
    },
    mergedPullRequest.author || "unknown",
  );
  const mergeTarget = mergeRefLabel(
    mergedPullRequest.base ?? {
      repo: mergedPullRequest.baseRepo,
      branch: mergedPullRequest.baseBranch,
    },
  );
  const mergeTargetReference = mergedPullRequest.base ?? {
    repo: mergedPullRequest.baseRepo,
    branch: mergedPullRequest.baseBranch,
  };
  const mergeTargetUrl = branchUrl(mergeTargetReference);
  const mergeTargetContent = mergeTargetUrl
    ? `<a class="done-target-branch-link" href="${escapeHtml(mergeTargetUrl)}" target="_blank" rel="noreferrer" aria-label="Open target branch ${escapeHtml(mergeTarget)}">${escapeHtml(mergeTarget)}<span aria-hidden="true">↗</span></a>`
    : escapeHtml(mergeTarget);

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
        <span class="done-pr-copy">
          <strong>This idea is verified</strong>
          <small>merge from ${escapeHtml(mergeSource)} into ${mergeTargetContent}</small>
        </span>
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
    ${section("Relationship rules", markdownBlock("Each Issue creates a model node. An empty parentIssue marks the lineage root; an Issue in the snapshot connects to its parent model, while an Issue outside the snapshot connects to a shared external-parent placeholder. Pull Requests are associated through Architecture Proposal (issue #)."))}
    ${tree.unmatchedPullRequests.length ? section("Unmatched Pull Requests", markdownBlock("These Pull Requests reference Proposal Issues that are not present in the current offline snapshot.")) : ""}
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
            <strong>Progress</strong>
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
    ${model.nodeType === "model" ? renderVerifiedPullRequest(model) : ""}
  `;
}
