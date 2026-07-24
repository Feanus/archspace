export class TelemetryProvider {
  snapshot() {
    throw new Error("TelemetryProvider.snapshot must be implemented");
  }
}

function numericLossTrace(experiment) {
  const trace = experiment?.replay?.loss_trace;
  if (!Array.isArray(trace)) return [];
  return trace
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

function metricNumber(metrics, key) {
  const value = metrics?.[key];
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export class ExperimentReplayProvider extends TelemetryProvider {
  constructor({ intervalMs = 1600 } = {}) {
    super();
    this.intervalMs = intervalMs;
  }

  snapshot(experiments, tick = 0) {
    const byExperiment = new Map();
    for (const experiment of experiments) {
      if (experiment?.cursor_type !== "wandb-replay" || experiment?.replay?.enabled !== true) continue;
      const trace = numericLossTrace(experiment);
      if (!trace.length) continue;
      const cursor = Math.min(Math.max(0, tick), trace.length - 1);
      byExperiment.set(experiment.id, Object.freeze({
        source: experiment.replay.source ?? "wandb-replay",
        replay: true,
        live: false,
        loss: trace[cursor],
        finalLoss: metricNumber(experiment.final_metrics, "loss"),
        progress: trace.length <= 1 ? 1 : cursor / (trace.length - 1),
        sparkline: Object.freeze(trace.slice(Math.max(0, cursor - 17), cursor + 1)),
        coveredFeatureIds: Object.freeze(experiment.covered_feature_ids ?? []),
      }));
    }
    return Object.freeze({
      source: "experiment-replay",
      replay: true,
      live: false,
      tick,
      byExperiment,
      aggregate: Object.freeze({
        replaying: byExperiment.size,
        completed: experiments.filter((experiment) => experiment.status === "completed").length,
        running: experiments.filter((experiment) => experiment.status === "running").length,
      }),
    });
  }

  start(experiments, onSnapshot, { reducedMotion = false } = {}) {
    let tick = 0;
    onSnapshot(this.snapshot(experiments, tick));
    if (reducedMotion) return () => {};
    const timer = setInterval(() => onSnapshot(this.snapshot(experiments, ++tick)), this.intervalMs);
    return () => clearInterval(timer);
  }
}

export class StaticArtifactTelemetryProvider extends TelemetryProvider {
  constructor(snapshotByExperiment = new Map()) {
    super();
    this.snapshotByExperiment = snapshotByExperiment;
  }

  snapshot(experiments) {
    const byExperiment = new Map();
    for (const experiment of experiments) {
      const value = this.snapshotByExperiment.get(experiment.id);
      if (value) byExperiment.set(experiment.id, value);
    }
    return Object.freeze({
      source: "artifact",
      replay: false,
      live: false,
      tick: 0,
      byExperiment,
      aggregate: null,
    });
  }
}
