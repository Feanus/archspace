export const MODEL_ROOT_ID = "offline-repository";

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
      relatedWork: issue?.parsed?.relatedWork,
      motivations: issue?.parsed?.motivations,
      proposedArchitecture: issue?.parsed?.proposedArchitecture,
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

function repairCycles(nodes, byId, rootId, warnings) {
  for (const node of nodes) {
    if (node.id === rootId) continue;
    const visited = new Set([node.id]);
    let cursor = node;
    while (cursor.parent_id) {
      if (visited.has(cursor.parent_id)) {
        warnings.push(`${node.id} 的 parentIssue 形成循环，已挂到离线仓库根节点`);
        node.parent_id = rootId;
        break;
      }
      visited.add(cursor.parent_id);
      cursor = byId.get(cursor.parent_id);
      if (!cursor) {
        node.parent_id = rootId;
        break;
      }
    }
  }
}

export function normalizeModelGraph(payload) {
  if (!payload || typeof payload !== "object") {
    throw new ModelDataError("离线 GitHub 数据必须是 JSON 对象");
  }
  const issues = asArray(payload.issues);
  const pullRequests = asArray(payload.pullRequests);
  if (!issues.length) throw new ModelDataError("离线数据中没有 Issue");

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

  const rootIssues = issues.filter((issue) => !issueReference(issue?.parsed?.parentIssue));
  const externalParentNumbers = new Set(
    issues
      .map((issue) => issueReference(issue?.parsed?.parentIssue))
      .filter((number) => number && !issueByNumber.has(number)),
  );
  const hasSingleModelRoot = rootIssues.length === 1 && externalParentNumbers.size === 0;
  const rootId = hasSingleModelRoot ? `issue-${Number(rootIssues[0].number)}` : MODEL_ROOT_ID;
  const nodes = [];
  const sourceRepo = cleanText(payload.source?.repo) || "Offline GitHub snapshot";
  if (!hasSingleModelRoot) {
    nodes.push({
      id: MODEL_ROOT_ID,
      nodeType: "repository",
      title: sourceRepo,
      title_zh: sourceRepo,
      summary: "离线 Issue 与 Pull Request 快照",
      parent_id: null,
      category: "repository",
      state: "offline",
      issue: null,
      parentIssue: null,
      parentIssueNumber: null,
      pullRequests: unmatchedPullRequests,
      depends_on: [],
      related_to: [],
    });
  }

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
      title_zh: `外部父 Issue #${parentIssueNumber}`,
      summary: "该父 Issue 不在当前离线快照中，其子模型仍按 parentIssue 关系归组。",
      parent_id: rootId,
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
    const parentIssueNumber = issueReference(parentIssue);
    const parentIssueRaw = cleanText(parentIssue?.raw || parentIssue?.label || parentIssue?.url);
    const pullRequestsForIssue = pullRequestsByIssue.get(issueNumber) ?? [];
    let parentId = rootId;
    let parentResolution = "root";

    if (!parentIssueNumber && issueNumber === Number(rootIssues[0]?.number) && hasSingleModelRoot) {
      parentId = null;
    } else if (parentIssueNumber && issueByNumber.has(parentIssueNumber) && parentIssueNumber !== issueNumber) {
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
      state: cleanText(issue.state) || "unknown",
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
  const warnings = [];
  repairCycles(nodes, byId, rootId, warnings);
  const childrenById = buildChildren(nodes);
  const modelNodes = nodes.filter((node) => node.nodeType === "model");

  return Object.freeze({
    rootId,
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
      openIssues: modelNodes.filter((node) => node.state === "open").length,
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
    throw new ModelDataError(`无法连接离线模型数据: ${error.message}`);
  }
  if (!response.ok) throw new ModelDataError(`离线模型数据返回 ${response.status}`);
  try {
    return normalizeModelGraph(await response.json());
  } catch (error) {
    if (error instanceof ModelDataError) throw error;
    throw new ModelDataError(`离线模型 JSON 无法解析: ${error.message}`);
  }
}

export function modelTitle(model) {
  return model?.title_zh || model?.title || model?.id || "未命名模型";
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
