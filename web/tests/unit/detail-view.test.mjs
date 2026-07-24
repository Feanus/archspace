import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeFeatureTree } from "../../src/data-adapter.js";
import { renderDetail } from "../../src/detail-view.js";

test("detail rendering prefers bilingual fields and escapes every display value", () => {
  const parent = { id: "feat-parent", title: "Parent", title_zh: "父节点<script>" };
  const dependency = { id: "feat-dependency", title: "Dependency", title_zh: "依赖<img>" };
  const feature = {
    id: "feat-child",
    kind: "feature",
    status: "validating",
    title: "English <title>",
    title_zh: "中文 <img src=x onerror=alert(1)>",
    summary: "English summary",
    summary_zh: "中文摘要 <script>alert(1)</script>",
    parent_id: parent.id,
    depends_on: [dependency.id],
    related_to: [],
    experiments: [],
    evidence: [],
    implementation: {},
    provenance: {},
  };
  const tree = { byId: new Map([[parent.id, parent], [dependency.id, dependency], [feature.id, feature]]) };
  const html = renderDetail(feature, tree);
  assert.match(html, /中文 &lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /English &lt;title&gt;/);
  assert.match(html, /中文摘要 &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /父节点&lt;script&gt;/);
  assert.match(html, /依赖&lt;img&gt;/);
  assert.doesNotMatch(html, /<img|<script>alert/);
});

test("formal unverified detail is ordered, explicit and has a safe pinned locator", async () => {
  const payload = JSON.parse(await readFile(new URL("../../../data/feature-tree.json", import.meta.url), "utf8"));
  const tree = normalizeFeatureTree(payload);
  const feature = tree.byId.get("feat-concept-self-dd");
  const html = renderDetail(feature, tree);
  const orderedHeadings = [
    "一句话结构作用 / 摘要",
    "相对父节点的变化",
    "设计 / 配置开关与参数",
    "实现 / 结构化代码定位",
    "验证 / 分析与结论",
    "Limitations / 来源与 provenance",
  ];
  let cursor = -1;
  for (const heading of orderedHeadings) {
    const position = html.indexOf(heading);
    assert.ok(position > cursor, `${heading} should be in fixed detail order`);
    cursor = position;
  }
  assert.match(html, /暂无独立消融\/效果证据/);
  assert.match(html, /Full revision/);
  assert.match(html, /class="pinned-link"/);
  assert.doesNotMatch(html, /[?&](token|auth|secret|credential)=/i);
  assert.doesNotMatch(html, /<h3>实验<\/h3>/);
  assert.doesNotMatch(html, /record type/);
  assert.doesNotMatch(html, /parent id/);
  assert.doesNotMatch(html, /<dt>fields<\/dt>/);
});
