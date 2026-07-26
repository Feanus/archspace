import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeFeatureTree } from "../../src/data-adapter.js";
import { ancestorIds, layoutTree, visibleFeatureIds } from "../../src/tree-layout.js";

const fixture = JSON.parse(await readFile(new URL("../fixtures/feature-tree.fixture.json", import.meta.url)));
const tree = normalizeFeatureTree(fixture);

test("layout is deterministic across repeated loads", () => {
  const first = layoutTree(tree);
  const second = layoutTree(normalizeFeatureTree(structuredClone(fixture)));
  assert.deepEqual([...first.positions], [...second.positions]);
});

test("adding Chinese display fields does not change formal layout coordinates", () => {
  const legacyFixture = structuredClone(fixture);
  for (const feature of legacyFixture.features) {
    delete feature.title_zh;
    delete feature.summary_zh;
  }
  const bilingualLayout = layoutTree(tree);
  const legacyLayout = layoutTree(normalizeFeatureTree(legacyFixture));
  assert.deepEqual([...bilingualLayout.positions], [...legacyLayout.positions]);
});

test("collapsed visibility keeps root and its first level", () => {
  const visible = visibleFeatureIds(tree, new Set([tree.rootId]));
  assert.deepEqual([...visible], [
    "feat-olmo3-standard",
    "feat-context-prediction",
    "feat-optimizer-stability",
    "feat-token-routing",
  ]);
});

test("layout and visibility can omit filtered nodes without leaving positions", () => {
  const includeNode = (node) => node.id !== "feat-optimizer-stability";
  const layout = layoutTree(tree, { includeNode });
  const visible = visibleFeatureIds(tree, new Set([tree.rootId]), includeNode);

  assert.equal(layout.positions.has("feat-optimizer-stability"), false);
  assert.equal(visible.has("feat-optimizer-stability"), false);
  assert.equal(layout.positions.has("feat-context-prediction"), true);
});

test("ancestors reveal a deep search result", () => {
  assert.deepEqual(ancestorIds(tree, "feat-context-window"), [
    "feat-olmo3-standard",
    "feat-context-prediction",
  ]);
});
