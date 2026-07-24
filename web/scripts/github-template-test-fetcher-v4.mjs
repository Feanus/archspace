#!/usr/bin/env node

import { fileURLToPath } from "node:url";

import {
  ISSUE_FIELDS,
  PR_FIELD_GROUPS as V3_PR_FIELD_GROUPS,
  fetchArchitectureProposalData as fetchV3ArchitectureProposalData,
  parseArchitectureProposalIssue,
  parsePullRequest as parseV3PullRequest,
} from "./github-template-test-fetcher-v3.mjs";

const DEFAULT_OWNER = "JT-Ushio";
const DEFAULT_REPO = "template-test";

const REPORT_LINKS_GROUP = {
  key: "reportLinks",
  label: "Report Links",
  fields: [
    {
      key: "reportLink",
      label: "Report Link",
      type: "link",
    },
  ],
};

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

export const PR_FIELD_GROUPS = omitOfficialModel(V3_PR_FIELD_GROUPS).map((group) =>
  group.key === "wandbLinks" ? REPORT_LINKS_GROUP : group,
);

/**
 * Parses the current `Report Links / Report Link` field while retaining
 * historical W&B fields under `legacyWandbLinks`.
 */
export function parsePullRequest(body, context = {}) {
  const v3Parsed = omitOfficialModel(parseV3PullRequest(body, context));
  const { wandbLinks = {}, ...otherFields } = v3Parsed;
  const reportLinkText = parseBoldDefinitionList(
    findHeadingContent(body, "Report Links"),
  )["Report Link"];

  return {
    ...otherFields,
    reportLinks: {
      reportLink:
        firstLinkOrText(reportLinkText, context) ||
        wandbLinks.projects ||
        wandbLinks.trainingRun ||
        wandbLinks.benchmarkRun ||
        null,
    },
    legacyWandbLinks: {
      projects: wandbLinks.projects || null,
      trainingRun: wandbLinks.trainingRun || null,
      benchmarkRun: wandbLinks.benchmarkRun || null,
    },
  };
}

/**
 * Keeps all v3 behavior, including omission of `proposalType`, then migrates
 * the changed PR field. A PR body is fetched only when no legacy W&B link is
 * available in the v3 result.
 */
export async function fetchArchitectureProposalData(options = {}) {
  const owner = options.owner || DEFAULT_OWNER;
  const repo = options.repo || DEFAULT_REPO;
  const token = options.token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
  const document = omitOfficialModel(await fetchV3ArchitectureProposalData(options));

  const pullRequests = await Promise.all(
    document.pullRequests.map(async (pullRequest) => {
      const legacyParsed = pullRequest.parsed || {};
      const legacyWandbLinks = legacyParsed.wandbLinks || {};
      const legacyReportLink =
        legacyWandbLinks.projects ||
        legacyWandbLinks.trainingRun ||
        legacyWandbLinks.benchmarkRun ||
        null;

      let parsed;
      if (legacyReportLink) {
        const { wandbLinks: omitted, ...otherFields } = legacyParsed;
        void omitted;
        parsed = {
          ...otherFields,
          reportLinks: {
            reportLink: legacyReportLink,
          },
          legacyWandbLinks: {
            projects: legacyWandbLinks.projects || null,
            trainingRun: legacyWandbLinks.trainingRun || null,
            benchmarkRun: legacyWandbLinks.benchmarkRun || null,
          },
        };
      } else {
        const body = await fetchPullRequestBody({
          owner,
          repo,
          number: pullRequest.number,
          token,
        });
        parsed = parsePullRequest(body, { owner, repo });
      }

      return {
        ...pullRequest,
        parsed,
        fieldGroups: replaceReportLinksGroup(pullRequest.fieldGroups, parsed),
      };
    }),
  );

  return {
    ...document,
    fieldDefinitions: {
      ...document.fieldDefinitions,
      pullRequests: PR_FIELD_GROUPS,
    },
    pullRequests,
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

function replaceReportLinksGroup(fieldGroups, parsed) {
  const reportLink = parsed.reportLinks?.reportLink || null;
  const group = {
    ...REPORT_LINKS_GROUP,
    fields: REPORT_LINKS_GROUP.fields.map((field) => ({
      ...field,
      value: reportLink,
      status: classifyValue(reportLink),
    })),
  };

  const groups = Array.isArray(fieldGroups) ? fieldGroups : [];
  const legacyIndex = groups.findIndex((item) => item.key === "wandbLinks");
  if (legacyIndex < 0) {
    const summaryIndex = groups.findIndex((item) => item.key === "summaries");
    const insertAt = summaryIndex < 0 ? groups.length : summaryIndex;
    return [...groups.slice(0, insertAt), group, ...groups.slice(insertAt)];
  }

  return groups.map((item, index) => (index === legacyIndex ? group : item));
}

function findHeadingContent(markdown, wantedLabel) {
  const source = String(markdown || "").replace(/\r\n/g, "\n");
  const regex = /^(#{1,6})\s+(.+?)\s*$/gm;
  const headings = [];
  let match;

  while ((match = regex.exec(source)) !== null) {
    headings.push({
      level: match[1].length,
      title: match[2].trim(),
      start: match.index,
      bodyStart: regex.lastIndex,
    });
  }

  const wanted = normalizeHeading(wantedLabel);
  const index = headings.findIndex((heading) => normalizeHeading(heading.title) === wanted);
  if (index < 0) return "";

  const current = headings[index];
  let end = source.length;
  for (let nextIndex = index + 1; nextIndex < headings.length; nextIndex += 1) {
    if (headings[nextIndex].level <= current.level) {
      end = headings[nextIndex].start;
      break;
    }
  }
  return source.slice(current.bodyStart, end).trim();
}

function parseBoldDefinitionList(markdown) {
  const result = {};
  for (const line of String(markdown || "").split(/\r?\n/)) {
    const match = line.match(/^\s*[-*]\s+\*\*(.+?):\*\*\s*(.*)$/);
    if (match) result[match[1].trim()] = cleanMarkdown(match[2]);
  }
  return result;
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

function normalizeHeading(value) {
  return String(value || "")
    .replace(/[`*_:[\]()]/g, " ")
    .replace(/&/g, "and")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
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
