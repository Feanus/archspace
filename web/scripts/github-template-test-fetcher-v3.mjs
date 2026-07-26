#!/usr/bin/env node

import { fileURLToPath } from "node:url";

import {
  ISSUE_FIELDS as V2_ISSUE_FIELDS,
  PR_FIELD_GROUPS,
  fetchArchitectureProposalData as fetchV2ArchitectureProposalData,
  parseArchitectureProposalIssue as parseV2ArchitectureProposalIssue,
  parsePullRequest,
} from "./github-template-test-fetcher-v2.mjs";

const DEFAULT_OWNER = "JT-Ushio";
const DEFAULT_REPO = "template-test";

export function omitProposalType(value) {
  if (Array.isArray(value)) {
    return value
      .filter((item) => !(item && typeof item === "object" && item.key === "proposalType"))
      .map(omitProposalType);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "proposalType")
        .map(([key, child]) => [key, omitProposalType(child)]),
    );
  }
  return value;
}

export const ISSUE_FIELDS = omitProposalType(V2_ISSUE_FIELDS);
export { PR_FIELD_GROUPS, parsePullRequest };

export function parseArchitectureProposalIssue(body, context = {}) {
  return omitProposalType(parseV2ArchitectureProposalIssue(body, context));
}

export async function fetchArchitectureProposalData(options = {}) {
  return omitProposalType(await fetchV2ArchitectureProposalData(options));
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
