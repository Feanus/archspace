import assert from "node:assert/strict";
import test from "node:test";
import { PAN_THRESHOLD_PX, exceedsPanThreshold, translatedViewport } from "../../src/viewport-state.js";

test("pan threshold separates a click-sized move from a drag", () => {
  const start = { x: 100, y: 100 };
  assert.equal(exceedsPanThreshold(start, { x: 103, y: 104 }), false);
  assert.equal(exceedsPanThreshold(start, { x: 100 + PAN_THRESHOLD_PX, y: 100 }), true);
});

test("panning returns new viewport translation without mutating layout input", () => {
  const origin = Object.freeze({ translateX: 30, translateY: -12 });
  const formalLayoutPoint = Object.freeze({ id: "feat-olmo3-standard", x: 90, y: 280 });
  const next = translatedViewport(origin, { x: 45, y: -20 });
  assert.deepEqual(next, { translateX: 75, translateY: -32 });
  assert.deepEqual(origin, { translateX: 30, translateY: -12 });
  assert.deepEqual(formalLayoutPoint, { id: "feat-olmo3-standard", x: 90, y: 280 });
});
