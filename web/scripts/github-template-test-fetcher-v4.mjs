#!/usr/bin/env node

import { fileURLToPath } from "node:url";

import {
  ISSUE_FIELDS,
  fetchArchitectureProposalData as fetchV3ArchitectureProposalData,
  parseArchitectureProposalIssue,
} from "./github-template-test-fetcher-v3.mjs";

const DEFAULT_OWNER = "JT-Ushio";
const DEFAULT_REPO = "template-test";

const DEFAULT_ARCHIVE_FIELDS = [
  {
    key: "wandbReportIncludeTrainingAndEvaluationLogs",
    label: "WandB Report (include training and evaluation logs)",
    type: "link",
  },
  {
    key: "huggingfaceCollectionIncludeModelCheckpoints",
    label: "HuggingFace Collection (include model checkpoints)",
    type: "link",
  },
];

export { ISSUE_FIELDS, parseArchitectureProposalIssue };

export function omitOfficialModel(value) {
  if (Array.isArray(value)) {
    return value
      .filter((item) => !(item && typeof item === "object" && item.key === "officialModel"))
      .map(omitOfficialModel);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "officialModel")
        .map(([key, child]) => [key, omitOfficialModel(child)]),
    );
  }
  return value;
}

export const PR_FIELD_GROUPS = [
  {
    key: "metadata",
    label: "Metadata",
    fields: [
      { key: "title", label: "Title", type: "text" },
      { key: "architectureName", label: "Architecture Name", type: "text" },
      { key: "about", label: "About", type: "text" },
    ],
  },
  {
    key: "architectureProposal",
    label: "Architecture Proposal",
    fields: [
      {
        key: "architectureProposalIssue",
        path: "architectureProposalIssue",
        label: "Architecture Proposal (issue #)",
        type: "link",
      },
    ],
  },
  {
    key: "implementation",
    label: "Implementation",
    fields: [
      { key: "implementationDetails", path: "implementationDetails", label: "Implementation Details", type: "markdown" },
      { key: "experimentalValidation", path: "experimentalValidation", label: "Experimental Validation", type: "sectionTree" },
    ],
  },
  createArchiveGroup(DEFAULT_ARCHIVE_FIELDS),
  {
    key: "review",
    label: "Review",
    fields: [
      { key: "reviewerAssessment", path: "reviewerAssessment", label: "Reviewer Assessment", type: "markdown" },
      { key: "mergeChecklist", path: "mergeChecklist", label: "Merge Checklist", type: "checkboxGroup" },
    ],
  },
];

export function parsePullRequest(body, context = {}) {
  const metadata = parseMetadata(body);
  const proposalMatch = String(body || "").match(
    /^\s*>?\s*\*\*Architecture Proposal \(issue #\)\*\*\s*:\s*(.+?)\s*$/mi,
  );
  const reviewerContent = findHeadingContent(body, "Reviewer Assessment (for repo reviewers)")
    .split(/^\s*\*\*Merge Checklist\*\*\s*:\s*$/mi)[0];

  return {
    metadata: {
      title: emptyToNull(metadata.Title),
      architectureName: emptyToNull(metadata["Architecture Name"]),
      about: emptyToNull(metadata.About),
    },
    architectureProposalIssue: firstLinkOrText(proposalMatch?.[1] || "", context),
    implementationDetails: emptyToNull(findHeadingDirectContent(body, "Implementation Details")),
    experimentalValidation: parseHierarchicalSection(body, "Experimental Validation"),
    archive: parseArchiveLinks(body, context),
    reviewerAssessment: emptyToNull(cleanMarkdown(reviewerContent)),
    mergeChecklist: parseMergeChecklist(body),
  };
}

export async function fetchArchitectureProposalData(options = {}) {
  const owner = options.owner || DEFAULT_OWNER;
  const repo = options.repo || DEFAULT_REPO;
  const token = options.token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
  const document = omitOfficialModel(await fetchV3ArchitectureProposalData(options));

  const pullRequests = await Promise.all(
    document.pullRequests.map(async (pullRequest) => {
      const body = await fetchPullRequestBody({
        owner,
        repo,
        number: pullRequest.number,
        token,
      });
      const parsed = parsePullRequest(body, { owner, repo });

      return {
        ...pullRequest,
        parsed,
      };
    }),
  );
  const archiveDefinitions = collectArchiveDefinitions(
    document.templates?.pullRequest?.content,
    pullRequests,
  );
  const pullRequestFieldGroups = PR_FIELD_GROUPS.map((group) =>
    group.key === "archive" ? createArchiveGroup(archiveDefinitions) : group,
  );
  const projectedPullRequests = pullRequests.map((pullRequest) => ({
    ...pullRequest,
    fieldGroups: fillFieldGroups(pullRequestFieldGroups, pullRequest.parsed),
  }));

  return {
    ...document,
    fieldDefinitions: {
      ...document.fieldDefinitions,
      pullRequests: pullRequestFieldGroups,
    },
    pullRequests: projectedPullRequests,
  };
}

async function fetchPullRequestBody({ owner, repo, number, token }) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "architecture-proposal-field-fetcher-v4",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}`,
    { headers },
  );

  if (!response.ok) {
    const text = await response.text();
    const remaining = response.headers.get("x-ratelimit-remaining");
    if (response.status === 403 && remaining === "0") {
      throw new Error("GitHub API rate limit exceeded. Set GITHUB_TOKEN or GH_TOKEN and retry.");
    }
    throw new Error(`GitHub request failed: ${response.status} ${response.statusText}\n${text}`);
  }

  const pullRequest = await response.json();
  return pullRequest.body || "";
}

function createArchiveGroup(definitions) {
  return {
    key: "archive",
    label: "Archive",
    fields: definitions.map((definition) => ({ ...definition, type: "link" })),
  };
}

function fillFieldGroups(groups, parsed) {
  const archiveValues = new Map(
    (Array.isArray(parsed.archive) ? parsed.archive : []).map((field) => [field.key, field.value]),
  );
  return groups.map((group) => ({
    ...group,
    fields: group.fields.map((field) => {
      const path = field.path || (group.key === "metadata" ? `metadata.${field.key}` : field.key);
      const value = group.key === "archive" ? archiveValues.get(field.key) || null : getByPath(parsed, path);
      return { ...field, value, status: classifyValue(value) };
    }),
  }));
}

export function parseArchiveLinks(body, context = {}) {
  const entries = parseDefinitionList(findHeadingContent(body, "Archive"));
  const fields = [];
  for (const [label, rawValue] of entries) {
    const baseKey = toCamelKey(label) || `link${fields.length + 1}`;
    fields.push({
      key: uniqueFieldKey(fields, baseKey),
      label,
      value: firstLinkOrText(rawValue, context),
    });
  }
  return fields;
}

function collectArchiveDefinitions(template, pullRequests) {
  const definitions = [];
  const add = (field) => {
    if (!field?.key || definitions.some((candidate) => candidate.key === field.key)) return;
    definitions.push({ key: field.key, label: field.label, type: "link" });
  };

  for (const field of parseArchiveLinks(template)) add(field);
  for (const pullRequest of pullRequests) {
    for (const field of pullRequest.parsed?.archive || []) add(field);
  }
  if (!definitions.length) {
    for (const field of DEFAULT_ARCHIVE_FIELDS) add(field);
  }
  return definitions;
}

function uniqueFieldKey(fields, baseKey) {
  let key = baseKey;
  let suffix = 2;
  while (fields.some((field) => field.key === key)) {
    key = `${baseKey}${suffix}`;
    suffix += 1;
  }
  return key;
}

function parseMetadata(markdown) {
  const source = String(markdown || "").replace(/\r\n/g, "\n");
  const block = source.match(/^\s*---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/)?.[1] || "";
  const metadata = {};
  for (const line of block.split("\n")) {
    const match = line.match(/^\s*([^:]+):\s*(.*?)\s*$/);
    if (match) metadata[match[1].trim()] = cleanMarkdown(match[2]);
  }
  return metadata;
}

function parseHeadingBlocks(markdown) {
  const source = String(markdown || "")
    .replace(/<!--[\s\S]*?-->/g, "")
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

function findHeadingBlock(markdown, wantedLabel) {
  const wanted = normalizeHeading(wantedLabel);
  return parseHeadingBlocks(markdown).find((heading) => heading.key === wanted);
}

function findHeadingContent(markdown, wantedLabel) {
  return findHeadingBlock(markdown, wantedLabel)?.content || "";
}

function findHeadingDirectContent(markdown, wantedLabel) {
  return cleanMarkdown(findHeadingBlock(markdown, wantedLabel)?.directContent || "");
}

function parseHierarchicalSection(markdown, wantedLabel) {
  const root = findHeadingBlock(markdown, wantedLabel);
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

function parseDefinitionList(markdown) {
  const result = [];
  for (const line of String(markdown || "").split(/\r?\n/)) {
    const bold = line.match(/^\s*[-*]\s+\*\*(.+?):\*\*\s*(.*)$/);
    const plain = line.match(/^\s*[-*]\s+(.+?):\s*(.*)$/);
    const match = bold || plain;
    if (match) result.push([cleanMarkdown(match[1]), cleanMarkdown(match[2])]);
  }
  return result;
}

function parseMergeChecklist(markdown) {
  const source = String(markdown || "").replace(/\r\n/g, "\n");
  const marker = /^\s*\*\*Merge Checklist\*\*\s*:\s*$/mi;
  const match = marker.exec(source);
  return match ? parseCheckboxes(source.slice(match.index + match[0].length)) : [];
}

function parseCheckboxes(markdown) {
  const items = [];
  for (const line of String(markdown || "").split(/\r?\n/)) {
    const match = line.match(/^\s*[-*]\s+\[(x|X| )\]\s+(.+?)\s*$/);
    if (!match) continue;
    const label = cleanMarkdown(match[2]);
    items.push({ key: toCamelKey(label), label, checked: match[1].toLowerCase() === "x" });
  }
  return items;
}

function firstLinkOrText(markdown, context = {}) {
  const source = cleanMarkdown(markdown);
  if (!source) return null;

  const markdownLink = source.match(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/);
  if (markdownLink) {
    return {
      label: cleanMarkdown(markdownLink[1]),
      url: markdownLink[2],
      raw: markdownLink[0],
    };
  }

  const url = source.match(/https?:\/\/[^\s)>\]]+/)?.[0];
  if (url) return { label: url, url, raw: url };

  const issueReference = source.match(/(?:^|[\s(])#(\d+)\b/);
  if (issueReference) {
    const number = Number(issueReference[1]);
    return {
      label: `#${number}`,
      number,
      url:
        context.owner && context.repo
          ? `https://github.com/${context.owner}/${context.repo}/issues/${number}`
          : "",
      raw: `#${number}`,
    };
  }

  return source;
}

function classifyValue(value) {
  if (value == null) return "missing";
  if (Array.isArray(value)) return value.length ? "filled" : "empty";
  if (typeof value === "object") {
    return Object.values(value).some((item) => classifyValue(item) === "filled")
      ? "filled"
      : "empty";
  }
  return cleanMarkdown(value) ? "filled" : "empty";
}

function cleanMarkdown(value) {
  return String(value || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

function emptyToNull(value) {
  const cleaned = cleanMarkdown(value);
  return cleaned || null;
}

function getByPath(source, path) {
  return String(path || "")
    .split(".")
    .filter(Boolean)
    .reduce((current, part) => current?.[part], source);
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
