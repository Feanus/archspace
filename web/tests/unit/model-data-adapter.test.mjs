import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { normalizeModelGraph } from "../../src/model-data-adapter.js";
import { renderModelDetail } from "../../src/model-detail-view.js";
import { layoutTree, visibleFeatureIds } from "../../src/tree-layout.js";

const payload = JSON.parse(
  await readFile(new URL("../fixtures/template-test-data.json", import.meta.url), "utf8"),
);

function rootModels(graph) {
  return graph.models.filter((model) => model.parentResolution === "root");
}

function firstRootModel(graph) {
  const model = rootModels(graph)[0];
  assert.ok(model, "The admitted graph should contain at least one root Issue");
  return model;
}

function modelWithPullRequest(graph, pullRequestNumber = 10) {
  const model = graph.models.find(
    (candidate) => candidate.pullRequests.some(
      (pullRequest) => pullRequest.number === pullRequestNumber,
    ),
  );
  assert.ok(model, `PR #${pullRequestNumber} should belong to an admitted model`);
  return model;
}

function payloadWithPullRequest(reportUrl = "https://reports.example.com/run") {
  const next = structuredClone(payload);
  const admittedGraph = normalizeModelGraph(next);
  const rootIssue = firstRootModel(admittedGraph).issue;
  next.pullRequests = [{
    number: 10,
    title: "Implement Olmo3",
    state: "open",
    merged: false,
    mergedAt: null,
    labels: ["architecture proposal", "under review"],
    url: "https://github.com/JT-Ushio/template-test/pull/10",
    author: "contributor",
    base: { repo: "JT-Ushio/template-test", branch: "main" },
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

test("builds one structural tree with one or more root Issues", () => {
  const graph = normalizeModelGraph(payload);
  const roots = rootModels(graph);

  assert.ok(roots.length >= 1);
  assert.ok(graph.stats.models <= payload.issues.length);
  assert.equal(
    graph.stats.parentLinks,
    graph.models.filter((model) => model.parentIssueNumber).length,
  );
  assert.equal(graph.stats.externalParentIssues, 0);
  assert.equal(
    graph.rootId,
    roots[0].id,
  );
  assert.deepEqual(graph.rootIds, roots.map((model) => model.id));
  for (const model of graph.models) {
    const parentIssueNumber = model.parentIssueNumber;
    assert.equal(
      model.parent_id,
      parentIssueNumber ? `issue-${parentIssueNumber}` : null,
    );
    assert.equal(model.parentResolution, parentIssueNumber ? "issue" : "root");
  }
  assert.equal(graph.byId.has("offline-repository"), false);
});

test("lays out multiple None proposals as parallel parentless roots", () => {
  const graphPayload = structuredClone(payload);
  const initialGraph = normalizeModelGraph(graphPayload);
  const initialRootCount = rootModels(initialGraph).length;
  const extraRoot = structuredClone(firstRootModel(initialGraph).issue);
  extraRoot.number = 200;
  extraRoot.title = "[ARCH-PROP] Second root";
  extraRoot.url = "https://github.com/JT-Ushio/template-test/issues/200";
  extraRoot.parsed.architectureName = "Second root";
  extraRoot.parsed.parentIssueInput = "None";
  extraRoot.parsed.parentIssue = null;
  graphPayload.issues.unshift(extraRoot);

  const graph = normalizeModelGraph(graphPayload);
  const roots = rootModels(graph);
  const layout = layoutTree(graph);
  const visible = visibleFeatureIds(graph, new Set());

  assert.equal(roots.length, initialRootCount + 1);
  assert.deepEqual(graph.rootIds, roots.map((model) => model.id));
  assert.equal(new Set(roots.map((model) => layout.positions.get(model.id).x)).size, 1);
  assert.equal(new Set(roots.map((model) => layout.positions.get(model.id).y)).size, roots.length);
  for (const model of roots) {
    assert.equal(model.parent_id, null);
    assert.equal(model.category, "root_model");
    assert.equal(layout.positions.get(model.id).depth, 0);
    assert.equal(visible.has(model.id), true);
  }
});

test("admits only None or #<number> parents that resolve to architecture proposal Issues", () => {
  const graphPayload = structuredClone(payload);
  const admittedGraph = normalizeModelGraph(graphPayload);
  const rootIssue = firstRootModel(admittedGraph).issue;
  for (const issue of graphPayload.issues) {
    issue.parsed.parentIssueInput = issue.parsed.parentIssue?.number
      ? `#${issue.parsed.parentIssue.number}`
      : "None";
  }

  const proposalIssue = (number, parentIssueInput, parentNumber, labels = [
    "architecture proposal",
    "under review",
  ]) => ({
    number,
    title: `[ARCH-PROP] Contract ${number}`,
    state: "open",
    url: `https://github.com/JT-Ushio/template-test/issues/${number}`,
    labels,
    parsed: {
      architectureName: `Contract ${number}`,
      parentIssueInput,
      parentIssue: parentNumber
        ? { label: `#${parentNumber}`, number: parentNumber, raw: `#${parentNumber}` }
        : null,
      motivations: "Validate the parent contract.",
      proposedArchitecture: "Test fixture.",
      preliminaryResults: "",
      experimentsPlan: "Test fixture.",
    },
  });

  graphPayload.issues.push(
    proposalIssue(100, "hello", rootIssue.number),
    proposalIssue(101, "#999", 999),
    proposalIssue(102, "None", null, ["bug"]),
    proposalIssue(103, "#102", 102),
    proposalIssue(104, null, null),
    proposalIssue(105, `#${rootIssue.number}`, rootIssue.number),
    proposalIssue(
      106,
      `https://github.com/JT-Ushio/template-test/issues/${rootIssue.number}`,
      rootIssue.number,
    ),
  );

  const graph = normalizeModelGraph(graphPayload);

  assert.equal(graph.stats.models, payload.issues.length + 1);
  assert.equal(graph.byId.get("issue-105")?.parent_id, `issue-${rootIssue.number}`);
  for (const issueNumber of [100, 101, 102, 103, 104, 106]) {
    assert.equal(graph.byId.has(`issue-${issueNumber}`), false);
  }
  assert.match(graph.warnings.join("\n"), /Issue #100 Parent issue must be exactly None or #<number>/);
  assert.match(graph.warnings.join("\n"), /Issue #101 Parent issue #999 is not an architecture proposal Issue/);
  assert.match(graph.warnings.join("\n"), /Issue #103 Parent issue #102 is not an architecture proposal Issue/);
  assert.match(graph.warnings.join("\n"), /Issue #104 Parent issue must be exactly None or #<number>/);
  assert.match(graph.warnings.join("\n"), /Issue #106 Parent issue must be exactly None or #<number>/);
});

test("derives root styling from parentIssue without using proposalType", () => {
  const changedProposalTypes = structuredClone(payload);
  for (const issue of changedProposalTypes.issues) {
    issue.parsed.proposalType = issue.parsed.parentIssue
      ? "Root architecture"
      : "Modification to an existing architecture";
  }
  const graph = normalizeModelGraph(changedProposalTypes);

  for (const model of rootModels(graph)) {
    assert.equal(model.category, "root_model");
  }
  for (const model of graph.models.filter((candidate) => candidate.parentResolution !== "root")) {
    assert.equal(model.category, "model");
  }
});

test("derives lifecycle status from Issue labels without changing Issue state statistics", () => {
  const graph = normalizeModelGraph(payload);
  const lifecycleStatusByLabel = new Map([
    ["under review", "under-review"],
    ["under-review", "under-review"],
    ["in progress", "in-progress"],
    ["in-progress", "in-progress"],
    ["in-progess", "in-progress"],
    ["declined", "declined"],
    ["verified", "verified"],
  ]);

  for (const model of graph.models) {
    const issue = model.issue;
    const expectedLifecycleStatus = issue.labels
      .map((label) => String(label).trim().toLocaleLowerCase("en-US"))
      .map((label) => lifecycleStatusByLabel.get(label))
      .find(Boolean) ?? "";

    assert.equal(model.lifecycleStatus, expectedLifecycleStatus);
    assert.equal(model.state, expectedLifecycleStatus || issue.state);
    assert.equal(model.issueState, issue.state);
  }
  assert.equal(
    graph.stats.openIssues,
    graph.models.filter((model) => model.issueState === "open").length,
  );
});

test("associates each PR through its Architecture Proposal issue", () => {
  const graphPayload = payloadWithPullRequest();
  const graph = normalizeModelGraph(graphPayload);
  const expectedPullRequests = (issueNumber) =>
    graphPayload.pullRequests
      .filter((pullRequest) => pullRequest.parsed?.architectureProposalIssue?.number === issueNumber)
      .map((pullRequest) => pullRequest.number);

  for (const model of graph.models) {
    assert.deepEqual(
      model.pullRequests.map((pullRequest) => pullRequest.number),
      expectedPullRequests(model.issueNumber),
    );
  }
  const admittedIssueNumbers = new Set(graph.models.map((model) => model.issueNumber));
  assert.deepEqual(
    graph.unmatchedPullRequests.map((pullRequest) => pullRequest.number),
    graphPayload.pullRequests
      .filter(
        (pullRequest) => !admittedIssueNumbers.has(
          pullRequest.parsed?.architectureProposalIssue?.number,
        ),
      )
      .map((pullRequest) => pullRequest.number),
  );
});

test("renders model Issue and its unique PR as collapsible detail sections", () => {
  const graph = normalizeModelGraph(payloadWithPullRequest());
  const model = modelWithPullRequest(graph);
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
  assert.match(proposalHtml, /<span class="pull-request-copy">\s*<strong>Progress<\/strong>\s*<\/span>/);
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
  assert.match(proposalHtml, /Preliminary results \(if any\)/);
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

test("omits the optional Preliminary results section when an Issue leaves it empty", () => {
  const graphPayload = payloadWithPullRequest();
  const admittedGraph = normalizeModelGraph(graphPayload);
  const rootIssue = firstRootModel(admittedGraph).issue;
  rootIssue.parsed.preliminaryResults = "";
  delete rootIssue.parsed.existingResults;
  const graph = normalizeModelGraph(graphPayload);
  const html = renderModelDetail(modelWithPullRequest(graph), graph, "", true);

  assert.doesNotMatch(html, /Preliminary results \(if any\)/);
});

test("omits PR accordion status when no lifecycle label is present", () => {
  const graphPayload = payloadWithPullRequest();
  graphPayload.pullRequests[0].labels = ["architecture proposal"];
  const graph = normalizeModelGraph(graphPayload);
  const html = renderModelDetail(modelWithPullRequest(graph), graph);

  assert.doesNotMatch(html, /pr-lifecycle-/);
  assert.doesNotMatch(html, /<em[^>]*>.*(?:Open|Closed).*<\/em>/i);
});

test("labels a closed unmerged PR as Closed beside Progress", () => {
  const graphPayload = payloadWithPullRequest();
  graphPayload.pullRequests[0].state = "closed";
  graphPayload.pullRequests[0].merged = false;
  graphPayload.pullRequests[0].mergedAt = null;
  graphPayload.pullRequests[0].labels = ["architecture proposal"];
  const graph = normalizeModelGraph(graphPayload);
  const html = renderModelDetail(modelWithPullRequest(graph), graph);

  assert.match(html, /<strong>Progress<\/strong>/);
  assert.match(html, /<em class="pr-lifecycle-closed">Closed<\/em>/);
  assert.doesNotMatch(html, /pr-lifecycle-verified/);
  assert.doesNotMatch(html, /class="done-pr-panel"/);
});

test("renders every Archive link in an open merged-model section only for a merged PR", () => {
  const graphPayload = payloadWithPullRequest();
  graphPayload.pullRequests[0].state = "closed";
  graphPayload.pullRequests[0].merged = true;
  graphPayload.pullRequests[0].mergedAt = "2026-07-25T12:21:47Z";
  const graph = normalizeModelGraph(graphPayload);
  const model = modelWithPullRequest(graph);
  const html = renderModelDetail(model, graph);

  assert.match(html, /<details class="done-pr-panel" open>/);
  assert.match(html, />This idea is verified<\/strong>/);
  assert.match(html, /<em class="pr-lifecycle-verified">Verified<\/em>/);
  assert.match(html, /merge from contributor-implementation into <a class="done-target-branch-link"/);
  assert.match(html, /href="https:\/\/github\.com\/JT-Ushio\/template-test\/tree\/main"/);
  assert.match(html, /aria-label="Open target branch JT-Ushio-main">JT-Ushio-main/);
  assert.equal((html.match(/class="done-report-link"/g) ?? []).length, 3);
  assert.match(html, /class="done-report-link"[^>]+href="https:\/\/reports\.example\.com\/run"/);
  assert.match(html, />WandB Report<\/span>/);
  assert.match(html, />HuggingFace Collection<\/span>/);
  assert.match(html, />More Info<\/span>/);
  assert.doesNotMatch(html, /class="done-report-link"[^>]+href="https:\/\/github\.com\/JT-Ushio\/template-test\/pull\/10"/);
  assert.ok(html.indexOf('class="pull-request-panel"') < html.indexOf('class="done-pr-panel"'));

  const expandedHtml = renderModelDetail(
    model,
    graph,
    "pr-10",
  );
  assert.ok(expandedHtml.indexOf('class="model-tab-panel"') < expandedHtml.indexOf('class="done-pr-panel"'));

  graphPayload.pullRequests[0].merged = false;
  const unmergedGraph = normalizeModelGraph(graphPayload);
  const unmergedHtml = renderModelDetail(modelWithPullRequest(unmergedGraph), unmergedGraph);
  assert.doesNotMatch(unmergedHtml, /class="done-pr-panel"/);
});

test("omits Progress and the verified-idea section for models without PRs", () => {
  const graph = normalizeModelGraph(payloadWithPullRequest());
  const modelWithoutPullRequests = graph.models.find((model) => model.pullRequests.length === 0);
  const html = renderModelDetail(modelWithoutPullRequests, graph);

  assert.doesNotMatch(html, /class="pull-request-panel"/);
  assert.doesNotMatch(html, /<strong>Progress<\/strong>/);
  assert.doesNotMatch(html, /data-detail-tab=/);
  assert.doesNotMatch(html, /class="done-pr-panel"/);
});

test("offline data and rendered links contain no credential query parameters", () => {
  const graph = normalizeModelGraph(
    payloadWithPullRequest("https://reports.example.com/run?accessToken=secret"),
  );
  const model = modelWithPullRequest(graph);
  const pullRequestHtml = renderModelDetail(model, graph, `pr-${model.pullRequests[0].number}`);

  assert.doesNotMatch(JSON.stringify(payload), /access.?token|github_pat_|Bearer /i);
  assert.doesNotMatch(pullRequestHtml, /access.?token|github_pat_|Bearer /i);
});

test("renders sanitized Markdown and HTML images from Issue and PR fields", () => {
  const graphPayload = payloadWithPullRequest();
  const admittedGraph = normalizeModelGraph(graphPayload);
  const rootIssue = firstRootModel(admittedGraph).issue;
  rootIssue.parsed.preliminaryResults = `## Result

**Improved** with *stable loss*, \`bf16\`, and [public notes](https://docs.example.com/result?accessToken=secret).

The objective is $L = x^2 + y_1$, with complexity \\(O(n^2)\\).

$$
a = b
$$

- Lower variance
- Better throughput

> Reproduced twice.

Benchmark | Preliminary score
-- | --:
AIME 2025 | 83.3%
GPQA Diamond | 72.7%
MATH500 | 97.4%

Model size | Baseline | Proposed model
-- | -- | --
1B | OLMo 3 | OLMo 3 + SiameseNorm + Depth-Attention
3B | OLMo 3 | OLMo 3 + SiameseNorm + Depth-Attention
7B | OLMo 3 | OLMo 3 + SiameseNorm + Depth-Attention

<script>alert("unsafe")</script>

<img width="942" height="289" alt="Issue diagram" src="https://images.example.com/issue.png?accessToken=secret">

After`;
  graphPayload.pullRequests[0].parsed.implementationDetails =
    "Implemented.\n\n![PR diagram](https://images.example.com/pr.png?secret=hidden)";
  graphPayload.pullRequests[0].parsed.experimentalValidation.sections[0].content =
    "*Hypothesis:* Visual result.\n\n![Validation plot](https://images.example.com/validation.png)";
  const graph = normalizeModelGraph(graphPayload);
  const model = modelWithPullRequest(graph);
  const proposalHtml = renderModelDetail(model, graph, "", true);
  const progressHtml = renderModelDetail(model, graph, "pr-10");

  assert.match(proposalHtml, /Preliminary results \(if any\)/);
  assert.match(proposalHtml, /<h5 class="markdown-heading">Result<\/h5>/);
  assert.match(proposalHtml, /<strong>Improved<\/strong>/);
  assert.match(proposalHtml, /<em>stable loss<\/em>/);
  assert.match(proposalHtml, /<code>bf16<\/code>/);
  assert.match(proposalHtml, /<span class="math-inline" data-latex="L = x\^2 \+ y_1">\\\(L = x\^2 \+ y_1\\\)<\/span>/);
  assert.match(proposalHtml, /<span class="math-inline" data-latex="O\(n\^2\)">\\\(O\(n\^2\)\\\)<\/span>/);
  assert.match(proposalHtml, /<div class="math-display" data-latex="a = b">\$\$\na = b\n\$\$<\/div>/);
  assert.match(proposalHtml, /<ul class="markdown-list"><li>Lower variance<\/li><li>Better throughput<\/li><\/ul>/);
  assert.match(proposalHtml, /<blockquote>Reproduced twice\.<\/blockquote>/);
  assert.match(proposalHtml, /<table class="markdown-table">/);
  assert.match(proposalHtml, /<th class="markdown-align-left">Benchmark<\/th>/);
  assert.match(proposalHtml, /<th class="markdown-align-right">Preliminary score<\/th>/);
  assert.match(proposalHtml, /<td class="markdown-align-left">AIME 2025<\/td><td class="markdown-align-right">83\.3%<\/td>/);
  assert.match(proposalHtml, /<td class="markdown-align-left">GPQA Diamond<\/td><td class="markdown-align-right">72\.7%<\/td>/);
  assert.match(proposalHtml, /<td class="markdown-align-left">MATH500<\/td><td class="markdown-align-right">97\.4%<\/td>/);
  assert.match(proposalHtml, /<th class="markdown-align-left">Model size<\/th><th class="markdown-align-left">Baseline<\/th><th class="markdown-align-left">Proposed model<\/th>/);
  assert.match(proposalHtml, /<td class="markdown-align-left">1B<\/td><td class="markdown-align-left">OLMo 3<\/td><td class="markdown-align-left">OLMo 3 \+ SiameseNorm \+ Depth-Attention<\/td>/);
  assert.match(proposalHtml, /class="markdown-link"[^>]+href="https:\/\/docs\.example\.com\/result"/);
  assert.match(proposalHtml, /&lt;script&gt;alert\(&quot;unsafe&quot;\)&lt;\/script&gt;/);
  assert.doesNotMatch(proposalHtml, /<script>/);
  assert.match(proposalHtml, /<img[^>]+src="https:\/\/images\.example\.com\/issue\.png"[^>]+alt="Issue diagram"[^>]+width="942"[^>]+height="289"/);
  assert.match(progressHtml, /<img[^>]+src="https:\/\/images\.example\.com\/pr\.png"[^>]+alt="PR diagram"/);
  assert.match(progressHtml, /<img[^>]+src="https:\/\/images\.example\.com\/validation\.png"[^>]+alt="Validation plot"/);
  assert.doesNotMatch(`${proposalHtml}${progressHtml}`, /<figcaption>/);
  assert.doesNotMatch(`${proposalHtml}${progressHtml}`, /accessToken|secret=|!\[PR diagram\]|<img width=/);
});
