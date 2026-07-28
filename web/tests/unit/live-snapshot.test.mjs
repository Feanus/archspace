import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { normalizeModelGraph } from "../../src/model-data-adapter.js";

test("live snapshot targets RmZeta2718/arch-test and remains renderable when empty", async () => {
  const payload = JSON.parse(
    await readFile(new URL("../../../data/template-test-data.json", import.meta.url), "utf8"),
  );

  assert.equal(payload.source?.repo, "RmZeta2718/arch-test");
  const graph = normalizeModelGraph(payload);
  assert.equal(graph.models.length, payload.issues.length);
  assert.equal(graph.rootIds.length > 0, graph.models.length > 0);
});
