import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { normalizeModelGraph } from "../../src/model-data-adapter.js";
import { renderModelDetail } from "../../src/model-detail-view.js";

const payload = JSON.parse(
  await readFile(new URL("../../../data/template-test-data.json", import.meta.url), "utf8"),
);

function payloadWithPullRequest(reportUrl = "https://reports.example.com/run") {
  const next = structuredClone(payload);
  const rootIssue = next.issues.find((issue) => !issue.parsed?.parentIssue?.number);
  next.pullRequests = [{
    number: 10,
    title: "Implement Olmo3",
    state: "open",
    merged: false,
    mergedAt: null,
    labels: ["architecture proposal", "under review"],
    url: "https://github.com/scv11/template-test/pull/10",
    author: "contributor",
    base: { repo: "scv11/template-test", branch: "main" },
    head: { repo: "contributor/template-test", branch: "implementation" },
    parsed: {
      metadata: {
        title: "Implement Olmo3",
        architectureName: "Olmo3 implementation",
        about: "Implements the approved proposal",
      },
      architectureProposalIssue: { number: rootIssue.number, label: `#${rootIssue.number}` },
      archive: [
        {
          key: "wandbReport",
          label: "WandB Report",
          value: { label: "Report", url: reportUrl },
        },
        {
          key: "huggingfaceCollection",
          label: "HuggingFace Collection",
          value: { label: "Model", url: "https://models.example.com/model" },
        },
        {
          key: "moreInfo",
          label: "More Info",
          value: { label: "More Info", url: "https://docs.example.com/details" },
        },
      ],
      implementationDetails: "Implemented the proposal.",
      experimentalValidation: {
        intro: "Validation completed.",
        sections: [
          {
            title: "Finding 1: Improved Stability",
            level: 1,
            content: "Training was more stable.",
            children: [
              {
                title: "Evidence",
                level: 2,
                content: "Loss variance decreased.",
                children: [],
              },
            ],
          },
          {
            title: "Finding 2: Better Throughput",
            level: 1,
            content: "Throughput increased.",
            children: [],
          },
        ],
      },
      reviewerAssessment: "Ready for review.",
      mergeChecklist: [
        { checked: true, label: "The linked proposal is approved." },
        { checked: false, label: "Model artifacts are released." },
      ],
    },
    linkedIssues: [rootIssue.number],
  }];
  return next;
}

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

test("derives lifecycle status from Issue labels without changing Issue state statistics", () => {
  const graph = normalizeModelGraph(payload);
  const expectedStatuses = new Map([
    [1, "done"],
    [2, "in-progress"],
    [3, "declined"],
    [4, "under-review"],
  ]);

  for (const [issueNumber, status] of expectedStatuses) {
    const model = graph.byId.get(`issue-${issueNumber}`);
    assert.equal(model.lifecycleStatus, status);
    assert.equal(model.state, status);
    assert.equal(model.issueState, payload.issues.find((issue) => issue.number === issueNumber).state);
  }
  assert.equal(graph.stats.openIssues, payload.issues.filter((issue) => issue.state === "open").length);
});

test("associates each PR through its Architecture Proposal issue", () => {
  const graphPayload = payloadWithPullRequest();
  const graph = normalizeModelGraph(graphPayload);
  const expectedPullRequests = (issueNumber) =>
    graphPayload.pullRequests
      .filter((pullRequest) => pullRequest.parsed?.architectureProposalIssue?.number === issueNumber)
      .map((pullRequest) => pullRequest.number);

  for (const issue of graphPayload.issues) {
    assert.deepEqual(
      graph.byId.get(`issue-${issue.number}`).pullRequests.map((pullRequest) => pullRequest.number),
      expectedPullRequests(issue.number),
    );
  }
  assert.deepEqual(graph.unmatchedPullRequests, []);
});

test("renders model Issue and its unique PR as collapsible detail sections", () => {
  const graph = normalizeModelGraph(payloadWithPullRequest());
  const model = graph.byId.get(graph.rootId);
  const pullRequest = model.pullRequests[0];
  const proposalHtml = renderModelDetail(model, graph);
  const expandedProposalHtml = renderModelDetail(model, graph, "", true);
  const pullRequestHtml = renderModelDetail(model, graph, `pr-${pullRequest.number}`);

  assert.ok(proposalHtml.includes(`Issue #${model.issueNumber}`));
  assert.match(proposalHtml, /data-overview-toggle aria-expanded="false"/);
  assert.match(proposalHtml, />Proposal</);
  assert.doesNotMatch(proposalHtml, /data-detail-tab="proposal"/);
  assert.match(proposalHtml, /id="overview-content" class="overview-content" aria-hidden="true"/);
  assert.match(expandedProposalHtml, /data-overview-toggle aria-expanded="true"/);
  assert.match(expandedProposalHtml, /class="overview-content is-expanded" aria-hidden="false"/);
  assert.match(proposalHtml, /class="pull-request-panel"/);
  assert.match(proposalHtml, /class="pull-request-toggle"/);
  assert.ok(proposalHtml.includes(`data-detail-tab="pr-${pullRequest.number}"`));
  assert.match(proposalHtml, /<span class="pull-request-copy">\s*<strong>Implementation<\/strong>\s*<\/span>/);
  assert.match(proposalHtml, /<em class="pr-lifecycle-under-review">Under Review<\/em>/);
  assert.match(proposalHtml, new RegExp(`data-detail-tab="pr-${pullRequest.number}"[^>]+aria-expanded="false"`));
  assert.match(pullRequestHtml, new RegExp(`data-detail-tab="pr-${pullRequest.number}"[^>]+aria-expanded="true"`));
  assert.doesNotMatch(proposalHtml, /<h3>Model relationship<\/h3>/);
  assert.doesNotMatch(proposalHtml, /Model node/);
  assert.match(proposalHtml, /Parent issue/);
  assert.match(proposalHtml, /Open Issue/);
  assert.ok(proposalHtml.indexOf("Open Issue") < proposalHtml.indexOf('class="overview-panel"'));
  assert.ok(proposalHtml.indexOf("Architecture Name") < proposalHtml.indexOf("Parent Architecture"));
  assert.doesNotMatch(proposalHtml, /Proposal type/);
  assert.doesNotMatch(proposalHtml, /解析方式|Parent issue 为空，作为谱系根节点/);
  assert.match(proposalHtml, /Motivations/);
  assert.match(proposalHtml, /Proposed Architecture/);
  assert.match(proposalHtml, /Existing Results/);
  assert.match(proposalHtml, /Experiments Plan/);
  assert.doesNotMatch(proposalHtml, /Related work/i);
  assert.ok(pullRequestHtml.includes(`PR #${pullRequest.number}`));
  assert.match(pullRequestHtml, /Archive/);
  assert.match(pullRequestHtml, />WandB Report<\/a>/);
  assert.match(pullRequestHtml, />HuggingFace Collection<\/a>/);
  assert.match(pullRequestHtml, />More Info<\/a>/);
  assert.doesNotMatch(pullRequestHtml, /Official model|Official Model/);
  assert.doesNotMatch(pullRequestHtml, /W&amp;B Links|Projects|Training run|Benchmark run/);
  assert.match(pullRequestHtml, /Experimental Validation/);
  assert.match(pullRequestHtml, /<h4>Finding 1: Improved Stability<\/h4>/);
  assert.match(pullRequestHtml, /<h5>Evidence<\/h5>/);
  assert.match(pullRequestHtml, /<h4>Finding 2: Better Throughput<\/h4>/);
  assert.doesNotMatch(pullRequestHtml, /###|####/);
  assert.doesNotMatch(pullRequestHtml, /<h3>Association and progress<\/h3>/);
  assert.match(pullRequestHtml, /Architecture Name/);
  assert.match(pullRequestHtml, /Architecture Proposal/);
  assert.match(pullRequestHtml, /Base/);
  assert.match(pullRequestHtml, /Head/);
  assert.match(pullRequestHtml, /Open Pull Request/);
  assert.match(pullRequestHtml, /Reviewer Assessment/);
  assert.match(pullRequestHtml, /Merge Checklist/);
  assert.match(pullRequestHtml, /The linked proposal is approved/);
  assert.match(pullRequestHtml, /Model artifacts are released/);
  assert.equal((pullRequestHtml.match(/class="is-checked"/g) ?? []).length, 1);
  assert.doesNotMatch(pullRequestHtml, /Commits|Changed files/);
});

test("omits PR accordion status when no lifecycle label is present", () => {
  const graphPayload = payloadWithPullRequest();
  graphPayload.pullRequests[0].labels = ["architecture proposal"];
  const graph = normalizeModelGraph(graphPayload);
  const html = renderModelDetail(graph.byId.get(graph.rootId), graph);

  assert.doesNotMatch(html, /pr-lifecycle-/);
  assert.doesNotMatch(html, /<em[^>]*>.*(?:Open|Closed).*<\/em>/i);
});

test("renders every Archive link in an open merged-model section only for a merged PR", () => {
  const graphPayload = payloadWithPullRequest();
  graphPayload.pullRequests[0].state = "closed";
  graphPayload.pullRequests[0].merged = true;
  graphPayload.pullRequests[0].mergedAt = "2026-07-25T12:21:47Z";
  const graph = normalizeModelGraph(graphPayload);
  const html = renderModelDetail(graph.byId.get(graph.rootId), graph);

  assert.match(html, /<details class="done-pr-panel" open>/);
  assert.match(html, />The model is merged<\/strong>/);
  assert.equal((html.match(/class="done-report-link"/g) ?? []).length, 3);
  assert.match(html, /class="done-report-link"[^>]+href="https:\/\/reports\.example\.com\/run"/);
  assert.match(html, />WandB Report<\/span>/);
  assert.match(html, />HuggingFace Collection<\/span>/);
  assert.match(html, />More Info<\/span>/);
  assert.doesNotMatch(html, /class="done-report-link"[^>]+href="https:\/\/github\.com\/scv11\/template-test\/pull\/10"/);
  assert.ok(html.indexOf('class="pull-request-panel"') < html.indexOf('class="done-pr-panel"'));

  const expandedHtml = renderModelDetail(
    graph.byId.get(graph.rootId),
    graph,
    "pr-10",
  );
  assert.ok(expandedHtml.indexOf('class="model-tab-panel"') < expandedHtml.indexOf('class="done-pr-panel"'));

  graphPayload.pullRequests[0].merged = false;
  const unmergedGraph = normalizeModelGraph(graphPayload);
  const unmergedHtml = renderModelDetail(unmergedGraph.byId.get(unmergedGraph.rootId), unmergedGraph);
  assert.doesNotMatch(unmergedHtml, /class="done-pr-panel"/);
});

test("omits Implementation and the merged-model section for models without PRs", () => {
  const graph = normalizeModelGraph(payloadWithPullRequest());
  const modelWithoutPullRequests = graph.models.find((model) => model.pullRequests.length === 0);
  const html = renderModelDetail(modelWithoutPullRequests, graph);

  assert.doesNotMatch(html, /class="pull-request-panel"/);
  assert.doesNotMatch(html, /<strong>Implementation<\/strong>/);
  assert.doesNotMatch(html, /data-detail-tab=/);
  assert.doesNotMatch(html, /class="done-pr-panel"/);
});

test("offline data and rendered links contain no credential query parameters", () => {
  const graph = normalizeModelGraph(
    payloadWithPullRequest("https://reports.example.com/run?accessToken=secret"),
  );
  const model = graph.byId.get(graph.rootId);
  const pullRequestHtml = renderModelDetail(model, graph, `pr-${model.pullRequests[0].number}`);

  assert.doesNotMatch(JSON.stringify(payload), /access.?token|github_pat_|Bearer /i);
  assert.doesNotMatch(pullRequestHtml, /access.?token|github_pat_|Bearer /i);
});
