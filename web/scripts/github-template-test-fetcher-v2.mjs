#!/usr/bin/env node

import { fileURLToPath } from "node:url";

const DEFAULT_OWNER = "JT-Ushio";
const DEFAULT_REPO = "template-test";
export const DEFAULT_ISSUE_LABEL = "architecture proposal";
export const DEFAULT_PULL_REQUEST_LABEL = "architecure implement";

export const ISSUE_FIELDS = [
  {
    key: "architectureName",
    templateId: "proposal_name",
    label: "Architecture Name",
    type: "text",
    required: true,
  },
  {
    key: "parentIssue",
    templateId: "base_architecture_issue",
    label: "Parent issue",
    type: "link",
    required: false,
  },
  {
    key: "motivations",
    templateId: "problem_and_hypothesis",
    label: "Motivations",
    type: "markdown",
    required: true,
  },
  {
    key: "proposedArchitecture",
    templateId: "proposed_change",
    label: "Proposed Architecture",
    type: "markdown",
    required: true,
  },
  {
    key: "existingResults",
    templateId: "existing_results",
    label: "Existing Results",
    type: "markdown",
    required: true,
  },
  {
    key: "experimentsPlan",
    templateId: "validation_plan",
    label: "Experiments Plan",
    type: "markdown",
    required: true,
  },
];

export const PR_FIELD_GROUPS = [
  {
    key: "identity",
    label: "Identity",
    fields: [
      { key: "templateTitle", path: "templateTitle", label: "Title", type: "text" },
    ],
  },
  {
    key: "basicInformation",
    label: "Basic information",
    fields: [
      { key: "architectureName", label: "Architecture Name", type: "text" },
      { key: "proposalIssue", label: "Proposal Issue", type: "link" },
      { key: "officialModel", label: "Official Model", type: "link" },
    ],
  },
  {
    key: "wandbLinks",
    label: "W&B Links",
    fields: [
      { key: "projects", label: "W&B Projects Link", type: "link" },
      { key: "trainingRun", label: "Training Run Link", type: "link" },
      { key: "benchmarkRun", label: "Benchmark Run Link", type: "link" },
    ],
  },
  {
    key: "summaries",
    label: "Summaries",
    fields: [
      { key: "implementationSummary", label: "Implementation Summary", type: "markdown" },
      { key: "experimentsSummary", label: "Experiments Summary", type: "sectionTree" },
    ],
  },
  {
    key: "results",
    label: "Results",
    fields: [
      { key: "experimentsOutcome", label: "Experiments Outcome", type: "checkboxGroup" },
      { key: "reproductionStatus", label: "Reproduction Status", type: "checkboxGroup" },
      { key: "conclusion", label: "Conclusion", type: "markdown" },
      { key: "mergeChecklist", label: "Merge Checklist", type: "checkboxGroup" },
    ],
  },
];

/**
 * Fetches the current templates plus all matching Issues and pull requests.
 *
 * Set GITHUB_TOKEN or GH_TOKEN to increase the GitHub API rate limit.
 */
export async function fetchArchitectureProposalData(options = {}) {
  const owner = options.owner || DEFAULT_OWNER;
  const repo = options.repo || DEFAULT_REPO;
  const issueLabel = options.issueLabel || options.label || DEFAULT_ISSUE_LABEL;
  const pullRequestLabel = options.pullRequestLabel || DEFAULT_PULL_REQUEST_LABEL;
  const token = options.token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
  const client = createGitHubClient({ token });

  const repoInfo = await client.getJson(`/repos/${owner}/${repo}`);
  const defaultBranch = repoInfo.default_branch || "main";
  const issueTemplatePath = ".github/ISSUE_TEMPLATE/architecture-proposal.yml";
  const pullRequestTemplatePath = ".github/pull_request_template.md";

  const [issueTemplate, pullRequestTemplate, issueItems, pullItems] = await Promise.all([
    client.getText(
      `/repos/${owner}/${repo}/contents/${issueTemplatePath}?ref=${encodeURIComponent(defaultBranch)}`,
    ),
    client.getOptionalText(
      `/repos/${owner}/${repo}/contents/${pullRequestTemplatePath}?ref=${encodeURIComponent(defaultBranch)}`,
    ),
    client.getAllPages(`/repos/${owner}/${repo}/issues?state=all`),
    client.getAllPages(`/repos/${owner}/${repo}/pulls?state=all`),
  ]);

  const issues = issueItems
    .filter((item) => !item.pull_request && hasLabel(item, issueLabel))
    .map((issue) => {
      const parsed = parseArchitectureProposalIssue(issue.body || "", { owner, repo });
      return {
        ...commonIssueMeta(issue),
        parsed,
        fields: fillFields(ISSUE_FIELDS, parsed),
      };
    });

  // Filter list results before requesting each PR's details, issue metadata, and reviews.
  const pullRequests = await Promise.all(
    pullItems.filter((item) => hasLabel(item, pullRequestLabel)).map(async (pullSummary) => {
      const [pull, issueMeta, reviews] = await Promise.all([
        client.getJson(`/repos/${owner}/${repo}/pulls/${pullSummary.number}`),
        client.getJson(`/repos/${owner}/${repo}/issues/${pullSummary.number}`),
        client.getAllPages(`/repos/${owner}/${repo}/pulls/${pullSummary.number}/reviews`),
      ]);
      const body = pull.body || issueMeta.body || "";
      const parsed = parsePullRequest(body, { owner, repo });

      return {
        ...commonIssueMeta(issueMeta),
        state: pull.state,
        draft: Boolean(pull.draft),
        merged: Boolean(pull.merged_at),
        mergedAt: pull.merged_at || null,
        base: {
          repo: pull.base?.repo?.full_name || "",
          branch: pull.base?.ref || "",
          sha: pull.base?.sha || "",
        },
        head: {
          repo: pull.head?.repo?.full_name || "",
          branch: pull.head?.ref || "",
          sha: pull.head?.sha || "",
        },
        commitCount: pull.commits ?? null,
        additions: pull.additions ?? null,
        deletions: pull.deletions ?? null,
        changedFiles: pull.changed_files ?? null,
        requestedReviewers: (pull.requested_reviewers || []).map((reviewer) => reviewer.login),
        reviews: reviews.map((review) => ({
          id: review.id,
          reviewer: review.user?.login || "",
          state: review.state,
          submittedAt: review.submitted_at || null,
          body: cleanMarkdown(review.body || ""),
          commitId: review.commit_id || null,
        })),
        linkedIssues: parseLinkedIssueNumbers(body),
        taskProgress: countCheckboxes(body),
        parsed,
        fieldGroups: fillFieldGroups(PR_FIELD_GROUPS, parsed),
      };
    }),
  );

  return {
    source: {
      repo: `${owner}/${repo}`,
      defaultBranch,
      labelFilter: issueLabel,
      labelFilters: {
        issues: issueLabel,
        pullRequests: pullRequestLabel,
      },
      fetchedAt: new Date().toISOString(),
    },
    templates: {
      issue: {
        path: issueTemplatePath,
        url: `https://github.com/${owner}/${repo}/blob/${defaultBranch}/${issueTemplatePath}`,
        content: issueTemplate,
      },
      pullRequest: {
        path: pullRequestTemplatePath,
        url: `https://github.com/${owner}/${repo}/blob/${defaultBranch}/${pullRequestTemplatePath}`,
        content: pullRequestTemplate,
      },
    },
    fieldDefinitions: {
      issues: ISSUE_FIELDS,
      pullRequests: PR_FIELD_GROUPS,
    },
    issues,
    pullRequests,
  };
}

export function parseArchitectureProposalIssue(body, context = {}) {
  const sections = parseHeadingBlocks(body);
  const get = (label) => cleanMarkdown(findSection(sections, label)?.content || "");
  const parentIssueRaw = get("Parent issue");

  return {
    architectureName: emptyToNull(get("Architecture Name")),
    parentIssue: firstLinkOrRef(parentIssueRaw, context),
    motivations: get("Motivations"),
    proposedArchitecture: get("Proposed Architecture"),
    existingResults: get("Existing Results"),
    experimentsPlan: get("Experiments Plan"),
  };
}

export function parsePullRequest(body, context = {}) {
  const sections = parseHeadingBlocks(body);
  const get = (label) => cleanMarkdown(findSection(sections, label)?.content || "");
  const getDirect = (label) => cleanMarkdown(findSection(sections, label)?.directContent || "");
  const basic = parseBoldDefinitionList(get("Basic information"));
  const wandb = parseBoldDefinitionList(get("W&B Links"));

  return {
    templateTitle: emptyToNull(getDirect("Title")),
    basicInformation: {
      architectureName: emptyToNull(basic["Architecture Name"]),
      proposalIssue: firstLinkOrRef(basic["Proposal Issue"] || "", context),
      officialModel: firstLinkOrText(basic["Official Model"] || "", context),
    },
    wandbLinks: {
      projects: firstLinkOrText(wandb["W&B Projects Link"] || "", context),
      trainingRun: firstLinkOrText(wandb["Training Run Link"] || "", context),
      benchmarkRun: firstLinkOrText(wandb["Benchmark Run Link"] || "", context),
    },
    implementationSummary: getDirect("Implementation Summary"),
    experimentsSummary: parseHierarchicalSection(body, "Experiments Summary"),
    experimentsOutcome: parseCheckboxes(get("Experiments Outcome")),
    reproductionStatus: parseCheckboxes(get("Reproduction Status")),
    conclusion: getDirect("Conclusion"),
    mergeChecklist: parseCheckboxes(get("Merge Checklist")),
  };
}

function createGitHubClient({ token }) {
  const baseUrl = "https://api.github.com";
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "architecture-proposal-field-fetcher",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  async function request(path, accept) {
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await fetch(`${baseUrl}${path}`, {
          headers: { ...headers, Accept: accept || headers.Accept },
        });
        if (response.ok) return response;

        const text = await response.text();
        const remaining = response.headers.get("x-ratelimit-remaining");
        if (response.status === 403 && remaining === "0") {
          throw new Error("GitHub API rate limit exceeded. Set GITHUB_TOKEN or GH_TOKEN and retry.");
        }
        if (response.status < 500 && response.status !== 429) {
          throw new Error(`GitHub request failed: ${response.status} ${response.statusText}\n${text}`);
        }
        lastError = new Error(`GitHub request failed: ${response.status} ${response.statusText}\n${text}`);
      } catch (error) {
        lastError = error;
      }
      if (attempt < 3) await delay(250 * 2 ** (attempt - 1));
    }
    throw lastError;
  }

  return {
    async getJson(path) {
      const response = await request(path);
      return response.json();
    },
    async getText(path) {
      const response = await request(path, "application/vnd.github.raw");
      return response.text();
    },
    async getOptionalText(path) {
      try {
        return await this.getText(path);
      } catch (error) {
        if (/\b404\b/.test(error.message)) return "";
        throw error;
      }
    },
    async getAllPages(path) {
      const all = [];
      for (let page = 1; ; page += 1) {
        const pagePath = appendQuery(path, { per_page: "100", page: String(page) });
        const rows = await this.getJson(pagePath);
        if (!Array.isArray(rows)) throw new Error(`Expected an array response for ${pagePath}`);
        all.push(...rows);
        if (rows.length < 100) break;
      }
      return all;
    },
  };
}

function commonIssueMeta(issue) {
  return {
    number: issue.number,
    title: issue.title,
    state: issue.state,
    url: issue.html_url,
    author: issue.user?.login || "",
    createdAt: issue.created_at || null,
    updatedAt: issue.updated_at || null,
    closedAt: issue.closed_at || null,
    labels: (issue.labels || []).map((label) => (typeof label === "string" ? label : label.name)),
    assignees: (issue.assignees || []).map((assignee) => assignee.login),
    milestone: issue.milestone?.title || null,
  };
}

export function hasLabel(item, requiredLabel) {
  const wanted = normalizeLabel(requiredLabel);
  return (item.labels || []).some((label) => {
    const name = typeof label === "string" ? label : label?.name;
    return normalizeLabel(name) === wanted;
  });
}

function normalizeLabel(value) {
  return String(value || "").trim().toLowerCase();
}

function fillFields(definitions, parsed) {
  return definitions.map((definition) => {
    const value = getByPath(parsed, definition.key);
    return { ...definition, value, status: classifyValue(value) };
  });
}

function fillFieldGroups(groups, parsed) {
  return groups.map((group) => ({
    key: group.key,
    label: group.label,
    fields: group.fields.map((field) => {
      const path =
        field.path ||
        (group.key === "summaries" || group.key === "results" ? field.key : `${group.key}.${field.key}`);
      const value = getByPath(parsed, path);
      return { ...field, value, status: classifyValue(value) };
    }),
  }));
}

function parseHeadingBlocks(markdown) {
  const source = String(markdown || "")
    .replace(/<!--[^]*?-->/g, "")
    .replace(/\r\n/g, "\n");
  const regex = /^(#{1,6})\s+(.+?)\s*$/gm;
  const matches = [];
  let match;

  while ((match = regex.exec(source)) !== null) {
    matches.push({
      level: match[1].length,
      title: match[2].trim(),
      start: match.index,
      bodyStart: regex.lastIndex,
    });
  }

  return matches.map((current, index) => {
    const nextHeadingStart = matches[index + 1]?.start ?? source.length;
    let sectionEnd = source.length;
    for (let nextIndex = index + 1; nextIndex < matches.length; nextIndex += 1) {
      if (matches[nextIndex].level <= current.level) {
        sectionEnd = matches[nextIndex].start;
        break;
      }
    }
    return {
      ...current,
      key: normalizeHeading(current.title),
      directContent: source.slice(current.bodyStart, nextHeadingStart).trim(),
      content: source.slice(current.bodyStart, sectionEnd).trim(),
    };
  });
}

function parseHierarchicalSection(markdown, label) {
  const root = findSection(parseHeadingBlocks(markdown), label);
  if (!root) return { intro: null, sections: [] };

  const children = parseHeadingBlocks(root.content);
  const introEnd = children[0]?.start ?? root.content.length;
  const intro = emptyToNull(cleanMarkdown(root.content.slice(0, introEnd)));
  const sections = [];
  const stack = [];

  for (const child of children) {
    const level = Math.max(1, child.level - root.level);
    const node = {
      title: cleanMarkdown(child.title),
      level,
      content: emptyToNull(cleanMarkdown(child.directContent)),
      children: [],
    };
    while (stack.length && stack.at(-1).level >= level) stack.pop();
    if (stack.length) stack.at(-1).node.children.push(node);
    else sections.push(node);
    stack.push({ level, node });
  }

  return { intro, sections };
}

function findSection(sections, label) {
  const key = normalizeHeading(label);
  return sections.find((section) => section.key === key);
}

function parseBoldDefinitionList(markdown) {
  const result = {};
  for (const line of String(markdown || "").split(/\r?\n/)) {
    const match = line.match(/^\s*[-*]\s+\*\*(.+?):\*\*\s*(.*)$/);
    if (match) result[match[1].trim()] = cleanMarkdown(match[2]);
  }
  return result;
}

function parseCheckboxes(markdown) {
  const items = [];
  for (const line of String(markdown || "").split(/\r?\n/)) {
    const match = line.match(/^\s*[-*]\s+\[(x|X| )\]\s+(.+?)\s*$/);
    if (!match) continue;
    const label = cleanMarkdown(match[2]);
    items.push({
      key: toCamelKey(label),
      label,
      checked: match[1].toLowerCase() === "x",
    });
  }
  return items;
}

function countCheckboxes(markdown) {
  const items = parseCheckboxes(markdown);
  return {
    checked: items.filter((item) => item.checked).length,
    total: items.length,
  };
}

function parseLinksAndRefs(markdown, context = {}) {
  const source = String(markdown || "");
  const items = [];
  const seen = new Set();

  function add(item) {
    const key = item.url || item.raw;
    if (!key || seen.has(key)) return;
    seen.add(key);
    items.push(item);
  }

  for (const match of source.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g)) {
    add({ label: cleanMarkdown(match[1]), url: match[2], raw: match[0] });
  }
  for (const match of source.matchAll(/https?:\/\/[^\s)>\]]+/g)) {
    add({ label: match[0], url: match[0], raw: match[0] });
  }
  for (const match of source.matchAll(/(^|[\s(])#(\d+)\b/g)) {
    const number = Number(match[2]);
    const url =
      context.owner && context.repo
        ? `https://github.com/${context.owner}/${context.repo}/issues/${number}`
        : "";
    add({ label: `#${number}`, number, url, raw: `#${number}` });
  }
  return items;
}

function firstLinkOrRef(markdown, context = {}) {
  const cleaned = cleanMarkdown(markdown);
  if (!cleaned || /^(none|n\/a|null)$/i.test(cleaned)) return null;
  return parseLinksAndRefs(cleaned, context)[0] || cleaned;
}

function firstLinkOrText(markdown, context = {}) {
  const cleaned = cleanMarkdown(markdown);
  if (!cleaned) return null;
  return parseLinksAndRefs(cleaned, context)[0] || cleaned;
}

function parseLinkedIssueNumbers(markdown) {
  const numbers = new Set();
  const regex = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)\b|#(\d+)\b/gi;
  for (const match of String(markdown || "").matchAll(regex)) {
    numbers.add(Number(match[1] || match[2]));
  }
  return [...numbers].sort((a, b) => a - b);
}

function cleanMarkdown(value) {
  const cleaned = String(value || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (/^_?No response_?$/i.test(cleaned)) return "";
  return cleaned;
}

function emptyToNull(value) {
  const cleaned = cleanMarkdown(value);
  if (!cleaned) return null;
  const inlineCode = cleaned.match(/^`([^`]+)`$/);
  return inlineCode ? inlineCode[1] : cleaned;
}

function classifyValue(value) {
  if (value == null) return "missing";
  if (Array.isArray(value)) return value.length ? "filled" : "empty";
  if (typeof value === "object") {
    const values = Object.values(value);
    return values.some((item) => classifyValue(item) === "filled") ? "filled" : "empty";
  }
  const text = cleanMarkdown(value);
  if (!text) return "empty";
  if (/^<[^>]+>$/.test(text) || /^(value|n\/a|tbd|todo)$/i.test(text)) return "placeholder";
  return "filled";
}

function getByPath(source, path) {
  return path.split(".").reduce((current, part) => current?.[part], source);
}

function normalizeHeading(value) {
  return String(value || "")
    .replace(/[`*_:[\]()]/g, " ")
    .replace(/&/g, "and")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function toCamelKey(value) {
  return normalizeHeading(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => (index ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join("");
}

function appendQuery(path, params) {
  const url = new URL(path, "https://api.github.com");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isCli) {
  const [ownerArg, repoArg] = process.argv.slice(2);
  fetchArchitectureProposalData({
    owner: ownerArg || DEFAULT_OWNER,
    repo: repoArg || DEFAULT_REPO,
  })
    .then((document) => {
      process.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
    })
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
