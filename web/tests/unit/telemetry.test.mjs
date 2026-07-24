import assert from "node:assert/strict";
import test from "node:test";
import { ExperimentReplayProvider, StaticArtifactTelemetryProvider } from "../../src/telemetry.js";

const replayExperiment = Object.freeze({
  id: "exp-run",
  status: "running",
  cursor_type: "wandb-replay",
  covered_feature_ids: ["feat-a", "feat-b"],
  final_metrics: { loss: 1.1 },
  replay: { enabled: true, source: "wandb", loss_trace: [1.9, 1.7, 1.5, 1.3] },
});

test("experiment replay telemetry is deterministic and experiment-scoped", () => {
  const first = new ExperimentReplayProvider().snapshot([replayExperiment], 2);
  const second = new ExperimentReplayProvider().snapshot([replayExperiment], 2);
  assert.deepEqual(first, second);
  assert.equal(first.source, "experiment-replay");
  assert.equal(first.replay, true);
  assert.equal(first.live, false);
  assert.equal(first.byExperiment.get("exp-run").loss, 1.5);
  assert.deepEqual(first.byExperiment.get("exp-run").coveredFeatureIds, ["feat-a", "feat-b"]);
});

test("experiment replay changes by tick without mutating experiments", () => {
  const experiments = Object.freeze([replayExperiment]);
  const provider = new ExperimentReplayProvider();
  assert.notDeepEqual(provider.snapshot(experiments, 0), provider.snapshot(experiments, 1));
  assert.equal(experiments[0].id, "exp-run");
});

test("reduced motion emits once and never schedules updates", () => {
  const provider = new ExperimentReplayProvider({ intervalMs: 1 });
  let updates = 0;
  const stop = provider.start([replayExperiment], () => { updates += 1; }, { reducedMotion: true });
  stop();
  assert.equal(updates, 1);
});

test("static artifact provider is a separate non-simulated contract", () => {
  const provider = new StaticArtifactTelemetryProvider(new Map([["exp-run", { loss: 1.2 }]]));
  const snapshot = provider.snapshot([replayExperiment]);
  assert.equal(snapshot.source, "artifact");
  assert.equal(snapshot.replay, false);
});
