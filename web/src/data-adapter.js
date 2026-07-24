export const ROOT_ID = "feat-olmo3-standard";

export class FeatureTreeDataError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "FeatureTreeDataError";
    this.details = details;
  }
}

export class ExperimentIndexDataError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "ExperimentIndexDataError";
    this.details = details;
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanReference(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return value.id ?? value.feature_id ?? value.target_id ?? null;
  return null;
}

function normalizeFeature(feature) {
  return {
    ...feature,
    id: String(feature.id ?? ""),
    title: String(feature.title ?? feature.id ?? "未命名 Feature"),
    title_zh: String(feature.title_zh ?? ""),
    kind: feature.kind ?? "feature",
    parent_id: feature.parent_id ?? null,
    status: feature.status ?? "proposed",
    summary: feature.summary ?? "",
    summary_zh: feature.summary_zh ?? "",
    hypothesis: feature.hypothesis ?? "",
    design: feature.design ?? "",
    delta: feature.delta ?? null,
    implementation: feature.implementation ?? {},
    experiments: asArray(feature.experiments),
    evidence: asArray(feature.evidence),
    depends_on: asArray(feature.depends_on).map(cleanReference).filter(Boolean),
    related_to: asArray(feature.related_to).map(cleanReference).filter(Boolean),
    provenance: feature.provenance ?? {},
  };
}

export function normalizeFeatureTree(payload) {
  const rawFeatures = Array.isArray(payload)
    ? payload
    : payload?.features ?? payload?.nodes ?? payload?.feature_tree?.features;

  if (!Array.isArray(rawFeatures)) {
    throw new FeatureTreeDataError("数据中缺少 features 数组");
  }

  const features = rawFeatures.map(normalizeFeature);
  const errors = [];
  const byId = new Map();

  for (const feature of features) {
    if (!feature.id) errors.push("存在缺少 id 的 Feature");
    else if (byId.has(feature.id)) errors.push(`重复的 Feature id: ${feature.id}`);
    else byId.set(feature.id, feature);
  }

  const roots = features.filter((feature) => feature.parent_id == null);
  if (roots.length !== 1 || roots[0]?.id !== ROOT_ID) {
    errors.push(`必须有且只有一个根 ${ROOT_ID}`);
  }

  for (const feature of features) {
    if (feature.id !== ROOT_ID && !feature.parent_id) errors.push(`${feature.id} 缺少 parent_id`);
    if (feature.parent_id && !byId.has(feature.parent_id)) {
      errors.push(`${feature.id} 的父节点不存在: ${feature.parent_id}`);
    }
  }

  const visitState = new Map();
  const visit = (id) => {
    if (visitState.get(id) === 1) {
      errors.push(`parent_id 构成环: ${id}`);
      return;
    }
    if (visitState.get(id) === 2 || !byId.has(id)) return;
    visitState.set(id, 1);
    const parentId = byId.get(id).parent_id;
    if (parentId) visit(parentId);
    visitState.set(id, 2);
  };
  for (const id of byId.keys()) visit(id);

  const childrenById = new Map(features.map((feature) => [feature.id, []]));
  for (const feature of features) {
    if (feature.parent_id && childrenById.has(feature.parent_id)) {
      childrenById.get(feature.parent_id).push(feature);
    }
  }
  const compare = (a, b) => {
    const orderA = Number.isFinite(a.order) ? a.order : Number.MAX_SAFE_INTEGER;
    const orderB = Number.isFinite(b.order) ? b.order : Number.MAX_SAFE_INTEGER;
    return orderA - orderB || a.title.localeCompare(b.title, "en") || a.id.localeCompare(b.id);
  };
  for (const children of childrenById.values()) children.sort(compare);

  const reachable = new Set();
  const walk = (id) => {
    if (reachable.has(id)) return;
    reachable.add(id);
    for (const child of childrenById.get(id) ?? []) walk(child.id);
  };
  if (byId.has(ROOT_ID)) walk(ROOT_ID);
  if (reachable.size !== features.length) errors.push("存在无法从根到达的 Feature");

  if (errors.length) throw new FeatureTreeDataError("Feature Tree 数据无效", errors);

  return Object.freeze({
    rootId: ROOT_ID,
    features: Object.freeze(features),
    byId,
    childrenById,
    metadata: Array.isArray(payload) ? {} : payload.metadata ?? payload.meta ?? {},
  });
}

export async function loadFeatureTree(url = "../data/feature-tree.json", fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(url, { headers: { Accept: "application/json" }, cache: "no-store" });
  } catch (error) {
    throw new FeatureTreeDataError(`无法连接 Feature Tree 数据源: ${error.message}`);
  }
  if (!response.ok) throw new FeatureTreeDataError(`Feature Tree 数据源返回 ${response.status}`);
  try {
    return normalizeFeatureTree(await response.json());
  } catch (error) {
    if (error instanceof FeatureTreeDataError) throw error;
    throw new FeatureTreeDataError(`Feature Tree JSON 无法解析: ${error.message}`);
  }
}

const EXPERIMENT_STATUSES = new Set(["planned", "running", "completed", "failed", "inconclusive", "archived"]);
const EXPERIMENT_CURSOR_TYPES = new Set(["none", "wandb-final", "wandb-replay", "live"]);
const WANDB_HOST = "wandb.ai";

function safeWandbUrl(value) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return "";
    if (url.hostname !== WANDB_HOST || url.search || url.hash) return "";
    return url.href;
  } catch {
    return "";
  }
}

function normalizeExperiment(experiment) {
  const covered = asArray(experiment?.covered_feature_ids).map(cleanReference).filter(Boolean);
  const primary = asArray(experiment?.primary_feature_ids).map(cleanReference).filter(Boolean);
  return Object.freeze({
    ...experiment,
    id: String(experiment?.id ?? ""),
    title: String(experiment?.title ?? experiment?.id ?? "未命名实验"),
    title_zh: String(experiment?.title_zh ?? ""),
    type: String(experiment?.type ?? "training"),
    status: String(experiment?.status ?? "planned"),
    cursor_type: String(experiment?.cursor_type ?? "none"),
    covered_feature_ids: Object.freeze(covered),
    primary_feature_ids: Object.freeze(primary.length ? primary : covered),
    summary: String(experiment?.summary ?? ""),
    summary_zh: String(experiment?.summary_zh ?? ""),
    wandb_url: safeWandbUrl(experiment?.wandb_url),
    final_metrics: experiment?.final_metrics && typeof experiment.final_metrics === "object" ? experiment.final_metrics : {},
    replay: experiment?.replay && typeof experiment.replay === "object" ? experiment.replay : {},
    evidence: asArray(experiment?.evidence),
  });
}

export function normalizeExperimentIndex(payload, tree = null) {
  const rawExperiments = Array.isArray(payload)
    ? payload
    : payload?.experiments ?? payload?.experiment_index?.experiments ?? [];
  if (!Array.isArray(rawExperiments)) {
    throw new ExperimentIndexDataError("数据中缺少 experiments 数组");
  }

  const experiments = rawExperiments.map(normalizeExperiment);
  const errors = [];
  const byId = new Map();
  const byFeatureId = new Map();
  for (const experiment of experiments) {
    if (!experiment.id) errors.push("存在缺少 id 的实验");
    else if (byId.has(experiment.id)) errors.push(`重复的实验 id: ${experiment.id}`);
    else byId.set(experiment.id, experiment);
    if (!EXPERIMENT_STATUSES.has(experiment.status)) errors.push(`${experiment.id} 的 status 无效: ${experiment.status}`);
    if (!EXPERIMENT_CURSOR_TYPES.has(experiment.cursor_type)) errors.push(`${experiment.id} 的 cursor_type 无效: ${experiment.cursor_type}`);
    if (experiment.wandb_url === "") errors.push(`${experiment.id} 的 wandb_url 必须是无凭证、无 query/fragment 的 https://wandb.ai URL`);
    if (["wandb-final", "wandb-replay"].includes(experiment.cursor_type) && !experiment.wandb_url) {
      errors.push(`${experiment.id} 的 ${experiment.cursor_type} 需要 wandb_url`);
    }
    if (experiment.cursor_type === "wandb-replay") {
      const trace = experiment.replay?.loss_trace;
      if (experiment.replay?.enabled !== true || !Array.isArray(trace) || trace.length < 2) {
        errors.push(`${experiment.id} 的 wandb-replay 需要启用 replay 并提供至少两个 loss_trace 点`);
      }
    } else if (experiment.replay?.enabled === true) {
      errors.push(`${experiment.id} 只有 wandb-replay 可以启用 replay`);
    }
    if (!experiment.covered_feature_ids.length) errors.push(`${experiment.id} 至少要覆盖一个 Feature`);
    for (const featureId of experiment.covered_feature_ids) {
      if (tree?.byId && !tree.byId.has(featureId)) errors.push(`${experiment.id} 覆盖的 Feature 不存在: ${featureId}`);
      if (!byFeatureId.has(featureId)) byFeatureId.set(featureId, []);
      byFeatureId.get(featureId).push(experiment);
    }
    for (const featureId of experiment.primary_feature_ids) {
      if (tree?.byId && !tree.byId.has(featureId)) errors.push(`${experiment.id} 的 primary Feature 不存在: ${featureId}`);
      if (!experiment.covered_feature_ids.includes(featureId)) errors.push(`${experiment.id} 的 primary Feature 必须同时出现在 covered_feature_ids: ${featureId}`);
    }
  }

  if (errors.length) throw new ExperimentIndexDataError("Experiment Index 数据无效", errors);
  return Object.freeze({
    experiments: Object.freeze(experiments),
    byId,
    byFeatureId,
    metadata: Array.isArray(payload) ? {} : payload.metadata ?? payload.meta ?? {},
  });
}

export async function loadExperimentIndex(url = "../data/experiments.json", tree = null, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(url, { headers: { Accept: "application/json" }, cache: "no-store" });
  } catch (error) {
    throw new ExperimentIndexDataError(`无法连接 Experiment Index 数据源: ${error.message}`);
  }
  if (!response.ok) throw new ExperimentIndexDataError(`Experiment Index 数据源返回 ${response.status}`);
  try {
    return normalizeExperimentIndex(await response.json(), tree);
  } catch (error) {
    if (error instanceof ExperimentIndexDataError) throw error;
    throw new ExperimentIndexDataError(`Experiment Index JSON 无法解析: ${error.message}`);
  }
}
