export class ModelDataError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "ModelDataError";
    this.details = details;
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanText(value) {
  return String(value ?? "")
    .replace(/^`|`$/g, "")
    .trim();
}

const LIFECYCLE_STATUS_ALIASES = Object.freeze({
  "under review": "under-review",
  "under-review": "under-review",
  "in progress": "in-progress",
  "in-progress": "in-progress",
  "in-progess": "in-progress",
  declined: "declined",
  verified: "verified",
});
const ARCHITECTURE_PROPOSAL_LABEL = "architecture proposal";

function hasArchitectureProposalLabel(issue) {
  return asArray(issue?.labels).some(
    (label) => cleanText(label?.name ?? label).toLocaleLowerCase("en-US")
      === ARCHITECTURE_PROPOSAL_LABEL,
  );
}

function parentIssueContract(issue) {
  const parsed = issue?.parsed ?? {};
  const hasExplicitInput = Object.prototype.hasOwnProperty.call(parsed, "parentIssueInput");
  if (!hasExplicitInput && parsed.parentIssue == null) {
    return { valid: true, parentNumber: null };
  }

  const raw = hasExplicitInput
    ? cleanText(parsed.parentIssueInput)
    : cleanText(
      parsed.parentIssue?.raw
      || parsed.parentIssue?.label
      || parsed.parentIssue,
    );
  if (raw === "None") return { valid: true, parentNumber: null };

  const match = raw.match(/^#([1-9]\d*)$/);
  if (!match) {
    return {
      valid: false,
      reason: `Issue #${issue?.number ?? "?"} Parent issue must be exactly None or #<number>`,
    };
  }
  return { valid: true, parentNumber: Number(match[1]) };
}

function admitArchitectureProposalIssues(sourceIssues) {
  const proposalIssues = sourceIssues.filter(hasArchitectureProposalLabel);
  const proposalByNumber = new Map(
    proposalIssues.map((issue) => [Number(issue.number), issue]),
  );
  const admittedByNumber = new Map();
  const parentNumbers = new Map();
  const warnings = [];

  for (const issue of proposalIssues) {
    const issueNumber = Number(issue.number);
    const contract = parentIssueContract(issue);
    if (!contract.valid) {
      warnings.push(contract.reason);
      continue;
    }
    if (contract.parentNumber === issueNumber) {
      warnings.push(`Issue #${issueNumber} cannot use itself as Parent issue`);
      continue;
    }
    if (contract.parentNumber && !proposalByNumber.has(contract.parentNumber)) {
      warnings.push(
        `Issue #${issueNumber} Parent issue #${contract.parentNumber} is not an architecture proposal Issue in this snapshot`,
      );
      continue;
    }
    admittedByNumber.set(issueNumber, issue);
    parentNumbers.set(issueNumber, contract.parentNumber);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const [issueNumber] of admittedByNumber) {
      const parentNumber = parentNumbers.get(issueNumber);
      if (parentNumber && !admittedByNumber.has(parentNumber)) {
        admittedByNumber.delete(issueNumber);
        warnings.push(
          `Issue #${issueNumber} Parent issue #${parentNumber} was not admitted`,
        );
        changed = true;
      }
    }
  }

  return {
    issues: proposalIssues.filter((issue) => admittedByNumber.has(Number(issue.number))),
    parentNumbers,
    warnings,
  };
}

export function lifecycleStatusFromLabels(labels) {
  for (const label of asArray(labels)) {
    const normalized = cleanText(label).toLocaleLowerCase("en-US");
    if (LIFECYCLE_STATUS_ALIASES[normalized]) return LIFECYCLE_STATUS_ALIASES[normalized];
  }
  return "";
}

function issueModelTitle(issue) {
  return cleanText(issue?.parsed?.architectureName)
    || cleanText(issue?.parsed?.architectureId)
    || cleanText(issue?.title).replace(/^\[ARCH-PROP\]\s*/i, "")
    || `Issue #${issue?.number ?? "?"}`;
}

function issueReference(value) {
  if (value && typeof value === "object") {
    const number = Number(value.number);
    if (Number.isInteger(number) && number > 0) return number;
    value = value.raw || value.label || value.url;
  }
  const text = cleanText(value);
  const issueMatch = text.match(/(?:^|\/issues\/|#)(\d+)$/i);
  return issueMatch ? Number(issueMatch[1]) : null;
}

function parentIssueAnchorId(issueNumber) {
  return `parent-issue-${issueNumber}`;
}

function proposalIssueNumber(pullRequest) {
  const architectureProposal = Number(pullRequest?.parsed?.architectureProposalIssue?.number);
  if (Number.isInteger(architectureProposal) && architectureProposal > 0) return architectureProposal;
  const current = Number(pullRequest?.parsed?.basicInformation?.proposalIssue?.number);
  if (Number.isInteger(current) && current > 0) return current;
  const direct = Number(pullRequest?.parsed?.relatedArchitecture?.proposalIssue?.number);
  if (Number.isInteger(direct) && direct > 0) return direct;
  return asArray(pullRequest?.linkedIssues).find((number) => Number.isInteger(number) && number > 0) ?? null;
}

function modelSearchText(issue, pullRequests) {
  return JSON.stringify({
    issue: {
      architectureName: issue?.parsed?.architectureName,
      parentIssue: issue?.parsed?.parentIssue,
      motivations: issue?.parsed?.motivations,
      proposedArchitecture: issue?.parsed?.proposedArchitecture,
      preliminaryResults: issue?.parsed?.preliminaryResults || issue?.parsed?.existingResults,
      experimentsPlan: issue?.parsed?.experimentsPlan,
    },
    pullRequests: pullRequests.map((pullRequest) => pullRequest.parsed ?? {}),
  }).toLocaleLowerCase("zh-CN");
}

function buildChildren(nodes) {
  const childrenById = new Map(nodes.map((node) => [node.id, []]));
  for (const node of nodes) {
    if (node.parent_id && childrenById.has(node.parent_id)) {
      childrenById.get(node.parent_id).push(node);
    }
  }
  const kindOrder = { repository: 0, parent_issue: 1, model: 2 };
  for (const children of childrenById.values()) {
    children.sort((left, right) => {
      return (kindOrder[left.nodeType] ?? 9) - (kindOrder[right.nodeType] ?? 9)
        || (left.issue?.number ?? 0) - (right.issue?.number ?? 0)
        || left.id.localeCompare(right.id);
    });
  }
  return childrenById;
}

function repairCycles(nodes, byId, warnings) {
  for (const node of nodes) {
    const visited = new Set([node.id]);
    let cursor = node;
    while (cursor.parent_id) {
      if (visited.has(cursor.parent_id)) {
        warnings.push(`${node.id} has a parentIssue cycle and was detached as a root model`);
        node.parent_id = null;
        node.parentResolution = "root";
        node.category = "root_model";
        break;
      }
      visited.add(cursor.parent_id);
      cursor = byId.get(cursor.parent_id);
      if (!cursor) {
        node.parent_id = null;
        node.parentResolution = "root";
        node.category = "root_model";
        break;
      }
    }
  }
}

export function normalizeModelGraph(payload) {
  if (!payload || typeof payload !== "object") {
    throw new ModelDataError("Offline GitHub data must be a JSON object");
  }
  const admission = admitArchitectureProposalIssues(asArray(payload.issues));
  const issues = admission.issues;
  const pullRequests = asArray(payload.pullRequests);

  const issueByNumber = new Map(issues.map((issue) => [Number(issue.number), issue]));
  const pullRequestsByIssue = new Map(issues.map((issue) => [Number(issue.number), []]));
  const unmatchedPullRequests = [];

  for (const pullRequest of pullRequests) {
    const number = proposalIssueNumber(pullRequest);
    if (number && pullRequestsByIssue.has(number)) {
      pullRequestsByIssue.get(number).push(pullRequest);
    } else {
      unmatchedPullRequests.push(pullRequest);
    }
  }

  const externalParentNumbers = new Set(
    issues
      .map((issue) => admission.parentNumbers.get(Number(issue.number)))
      .filter((number) => number && !issueByNumber.has(number)),
  );
  const nodes = [];

  const anchors = new Map();
  for (const parentIssueNumber of externalParentNumbers) {
    const reference = issues
      .map((issue) => issue?.parsed?.parentIssue)
      .find((parentIssue) => issueReference(parentIssue) === parentIssueNumber);
    const id = parentIssueAnchorId(parentIssueNumber);
    anchors.set(id, {
      id,
      nodeType: "parent_issue",
      title: `Issue #${parentIssueNumber}`,
      title_zh: `External Parent Issue #${parentIssueNumber}`,
      summary: "This parent Issue is outside the current offline snapshot; its child models remain grouped by parentIssue.",
      parent_id: null,
      category: "parent_issue",
      state: "reference",
      issue: null,
      parentIssue: reference ?? null,
      parentIssueNumber,
      pullRequests: [],
      depends_on: [],
      related_to: [],
    });
  }
  nodes.push(...anchors.values());

  for (const issue of issues) {
    const issueNumber = Number(issue.number);
    const parentIssue = issue?.parsed?.parentIssue ?? null;
    const parentIssueNumber = admission.parentNumbers.get(issueNumber) ?? null;
    const parentIssueRaw = cleanText(parentIssue?.raw || parentIssue?.label || parentIssue?.url);
    const pullRequestsForIssue = pullRequestsByIssue.get(issueNumber) ?? [];
    const issueState = cleanText(issue.state) || "unknown";
    const lifecycleStatus = lifecycleStatusFromLabels(issue?.labels);
    let parentId = null;
    let parentResolution = "root";

    if (parentIssueNumber && issueByNumber.has(parentIssueNumber) && parentIssueNumber !== issueNumber) {
      parentId = `issue-${parentIssueNumber}`;
      parentResolution = "issue";
    } else if (parentIssueNumber) {
      parentId = parentIssueAnchorId(parentIssueNumber);
      parentResolution = "external_issue";
    }

    const title = issueModelTitle(issue);
    nodes.push({
      id: `issue-${issueNumber}`,
      nodeType: "model",
      title,
      title_zh: title,
      summary: cleanText(issue?.parsed?.motivations)
        || cleanText(issue?.parsed?.motivation?.researchHypothesis)
        || cleanText(issue?.parsed?.motivation?.currentLimitation),
      parent_id: parentId,
      category: parentResolution === "root" ? "root_model" : "model",
      state: lifecycleStatus || issueState,
      issueState,
      lifecycleStatus,
      issue,
      issueNumber,
      parentIssue,
      parentIssueNumber,
      parentIssueRaw,
      parentResolution,
      pullRequests: pullRequestsForIssue,
      searchText: modelSearchText(issue, pullRequestsForIssue),
      depends_on: [],
      related_to: [],
    });
  }

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const warnings = [...admission.warnings];
  repairCycles(nodes, byId, warnings);
  const childrenById = buildChildren(nodes);
  const modelNodes = nodes.filter((node) => node.nodeType === "model");
  const rootIds = nodes.filter((node) => node.parent_id == null).map((node) => node.id);
  const rootId = rootIds[0];

  return Object.freeze({
    rootId,
    rootIds: Object.freeze(rootIds),
    features: Object.freeze(nodes),
    models: Object.freeze(modelNodes),
    byId,
    childrenById,
    pullRequests: Object.freeze(pullRequests),
    unmatchedPullRequests: Object.freeze(unmatchedPullRequests),
    fieldDefinitions: payload.fieldDefinitions ?? {},
    source: payload.source ?? {},
    warnings: Object.freeze(warnings),
    stats: Object.freeze({
      models: modelNodes.length,
      openIssues: modelNodes.filter((node) => node.issueState === "open").length,
      pullRequests: pullRequests.length,
      linkedPullRequests: pullRequests.length - unmatchedPullRequests.length,
      parentLinks: modelNodes.filter((node) => node.parentResolution !== "root").length,
      externalParentIssues: anchors.size,
    }),
  });
}

export async function loadModelGraph(url = "../data/template-test-data.json", fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(url, { headers: { Accept: "application/json" }, cache: "no-store" });
  } catch (error) {
    throw new ModelDataError(`Could not load offline model data: ${error.message}`);
  }
  if (!response.ok) throw new ModelDataError(`Offline model data returned ${response.status}`);
  try {
    return normalizeModelGraph(await response.json());
  } catch (error) {
    if (error instanceof ModelDataError) throw error;
    throw new ModelDataError(`Could not parse offline model JSON: ${error.message}`);
  }
}

export function modelTitle(model) {
  return model?.title_zh || model?.title || model?.id || "Unnamed model";
}

export function modelSubtitle(model) {
  if (model?.nodeType === "model") return `Issue #${model.issueNumber}`;
  if (model?.nodeType === "parent_issue") return `Issue #${model.parentIssueNumber}`;
  return "Offline snapshot";
}

export function compactModelTitle(model, limit = 22) {
  const title = modelTitle(model);
  return title.length > limit ? `${title.slice(0, limit - 1)}…` : title;
}

export function matchesModelSearch(model, query) {
  const term = cleanText(query).toLocaleLowerCase("zh-CN");
  if (!term) return false;
  return [
    modelTitle(model),
    modelSubtitle(model),
    model.summary,
    model.parentIssueRaw,
    model.searchText,
  ].some((value) => cleanText(value).toLocaleLowerCase("zh-CN").includes(term));
}
