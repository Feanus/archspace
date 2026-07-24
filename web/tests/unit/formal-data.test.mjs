import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ROOT_ID, normalizeFeatureTree } from "../../src/data-adapter.js";
import { layoutTree } from "../../src/tree-layout.js";

const formalDataUrl = new URL("../../../data/feature-tree.json", import.meta.url);

test("formal IS-S01 data satisfies the browser adapter contract", async () => {
  const payload = JSON.parse(await readFile(formalDataUrl, "utf8"));
  const tree = normalizeFeatureTree(payload);
  assert.equal(tree.rootId, ROOT_ID);
  assert.equal(tree.features.length, 11);
  assert.equal(tree.features.filter((feature) => feature.parent_id).length, 10);
  assert.equal(tree.features.filter((feature) => feature.category === "architecture").length, 10);
  assert.equal(tree.features.filter((feature) => feature.title_zh).length, 10);
  assert.ok(!tree.byId.has("feat-data-quality-gate"));
  assert.ok(!tree.byId.has("feat-evaluation-harness"));
  assert.deepEqual(new Set(tree.childrenById.get(ROOT_ID).map((feature) => feature.id)), new Set([
    "feat-concept-segmented-topology",
    "feat-concept-chunk-representation",
    "feat-concept-self-dd",
    "feat-concept-cross-module-residual-read",
  ]));
  assert.deepEqual(new Set(tree.childrenById.get("feat-concept-hlm-predictor").map((feature) => feature.id)), new Set([
    "feat-concept-hlm-backbone-window",
    "feat-concept-hlm-olmo3-layer-reuse",
  ]));
  const reachable = new Set();
  const visit = (id) => {
    reachable.add(id);
    for (const child of tree.childrenById.get(id) ?? []) visit(child.id);
  };
  visit(ROOT_ID);
  assert.equal(reachable.size, 11);
});

test("formal data produces identical coordinates after a clean reload", async () => {
  const payload = JSON.parse(await readFile(formalDataUrl, "utf8"));
  const first = layoutTree(normalizeFeatureTree(payload));
  const second = layoutTree(normalizeFeatureTree(structuredClone(payload)));
  assert.deepEqual([...first.positions], [...second.positions]);
});
