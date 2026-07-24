import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { normalizeModelGraph } from "../../src/model-data-adapter.js";
import { renderModelDetail } from "../../src/model-detail-view.js";

const payload = JSON.parse(
  await readFile(new URL("../../../data/template-test-data.json", import.meta.url), "utf8"),
);

test("builds one rooted Issue model tree through parentIssue", () => {
  const graph = normalizeModelGraph(payload);
  const rootIssues = payload.issues.filter((issue) => !issue.parsed?.parentIssue?.number);

  assert.equal(rootIssues.length, 1);
  assert.equal(graph.stats.models, payload.issues.length);
  assert.equal(graph.stats.parentLinks, payload.issues.length - 1);
  assert.equal(graph.stats.externalParentIssues, 0);
  assert.equal(graph.rootId, `issue-${rootIssues[0].number}`);
  for (const issue of payload.issues) {
    const model = graph.byId.get(`issue-${issue.number}`);
    const parentIssueNumber = issue.parsed?.parentIssue?.number;
    assert.equal(model.parent_id, parentIssueNumber ? `issue-${parentIssueNumber}` : null);
    assert.equal(model.parentResolution, parentIssueNumber ? "issue" : "root");
  }
  assert.equal(graph.byId.has("offline-repository"), false);
});

test("derives root styling from parentIssue without using proposalType", () => {
  const changedProposalTypes = structuredClone(payload);
  for (const issue of changedProposalTypes.issues) {
    issue.parsed.proposalType = issue.parsed.parentIssue
      ? "Root architecture"
      : "Modification to an existing architecture";
  }
  const graph = normalizeModelGraph(changedProposalTypes);

  assert.equal(graph.byId.get(graph.rootId).category, "root_model");
  for (const model of graph.models.filter((candidate) => candidate.id !== graph.rootId)) {
    assert.equal(model.category, "model");
  }
});

test("associates each PR through its Proposal Issue", () => {
  const graph = normalizeModelGraph(payload);
  const expectedPullRequests = (issueNumber) =>
    payload.pullRequests
      .filter((pullRequest) => pullRequest.parsed?.basicInformation?.proposalIssue?.number === issueNumber)
      .map((pullRequest) => pullRequest.number);

  for (const issue of payload.issues) {
    assert.deepEqual(
      graph.byId.get(`issue-${issue.number}`).pullRequests.map((pullRequest) => pullRequest.number),
      expectedPullRequests(issue.number),
    );
  }
  assert.deepEqual(graph.unmatchedPullRequests, []);
});

test("renders model Issue and PR information as selectable detail tabs", () => {
  const graph = normalizeModelGraph(payload);
  const model = graph.byId.get(graph.rootId);
  const pullRequest = model.pullRequests[0];
  const proposalHtml = renderModelDetail(model, graph, "proposal");
  const pullRequestHtml = renderModelDetail(model, graph, `pr-${pullRequest.number}`);
  const issueArchitectureName = model.issue.parsed.architectureName;
  const pullRequestArchitectureName = pullRequest.parsed.basicInformation.architectureName;

  assert.ok(proposalHtml.includes(`Issue #${model.issueNumber}`));
  assert.ok(proposalHtml.includes(`data-detail-tab="proposal"`));
  assert.ok(proposalHtml.includes(`>${issueArchitectureName}</button>`));
  assert.ok(proposalHtml.includes(`data-detail-tab="pr-${pullRequest.number}"`));
  assert.ok(proposalHtml.includes(`>${pullRequestArchitectureName}</button>`));
  assert.match(proposalHtml, /Parent issue/);
  assert.doesNotMatch(proposalHtml, /Proposal type/);
  assert.doesNotMatch(proposalHtml, /解析方式|Parent issue 为空，作为谱系根节点/);
  assert.match(proposalHtml, /Motivations/);
  assert.match(proposalHtml, /Proposed Architecture/);
  assert.match(proposalHtml, /Experiments Plan/);
  assert.ok(pullRequestHtml.includes(`PR #${pullRequest.number}`));
  assert.match(pullRequestHtml, /Report Link/);
  assert.match(pullRequestHtml, />Report<\/a>/);
  assert.doesNotMatch(pullRequestHtml, /Official model|Official Model/);
  assert.doesNotMatch(pullRequestHtml, /W&amp;B Links|Projects|Training run|Benchmark run/);
  assert.match(pullRequestHtml, /Experiments summary/);
  assert.match(pullRequestHtml, /Reproduction status/);
  assert.doesNotMatch(pullRequestHtml, /<dt>(Commits|Changed files|Checklist)<\/dt>/);
});

test("offline data and rendered links contain no credential query parameters", () => {
  const graph = normalizeModelGraph(payload);
  const model = graph.models.find((candidate) => candidate.pullRequests.length);
  const pullRequestHtml = renderModelDetail(model, graph, `pr-${model.pullRequests[0].number}`);

  assert.doesNotMatch(JSON.stringify(payload), /access.?token|github_pat_|Bearer /i);
  assert.doesNotMatch(pullRequestHtml, /access.?token|github_pat_|Bearer /i);
});
