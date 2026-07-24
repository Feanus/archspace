const D08_ID = "feat-concept-hlm-olmo3-layer-reuse";
const FULL_REVISION = /^[0-9a-f]{40}$/i;
const SENSITIVE_QUERY = /(token|auth|secret|credential|api[_-]?key)/i;

const VALIDATION_PRESENTATION = Object.freeze({
  baseline: { key: "baseline", label: "标准态" },
  validated: { key: "validated", label: "已验证" },
  mixed: { key: "mixed", label: "混合证据" },
  failed: { key: "failed", label: "未通过" },
  conditional: { key: "conditional", label: "条件性 · 待等价性确认" },
  unverified: { key: "unverified", label: "未验证" },
});

function normalizedStatus(value) {
  return String(value ?? "").trim().toLowerCase().replaceAll("-", "_");
}

function explicitValidationKey(value) {
  const status = normalizedStatus(value);
  if (["validated", "verified", "passed", "supported", "complete", "completed"].includes(status)) return "validated";
  if (["mixed", "trade_off", "partial", "partially_validated"].includes(status)) return "mixed";
  if (["failed", "rejected", "not_supported", "abandoned"].includes(status)) return "failed";
  if (["conditional", "conditional_proposal", "pending_equivalence", "equivalence_pending"].includes(status)) return "conditional";
  if (["unverified", "inconclusive", "implementing", "validating", "proposed", "planned"].includes(status)) return "unverified";
  return null;
}

export function featureValidation(feature) {
  if (feature?.kind === "baseline" || feature?.id === "feat-olmo3-standard") return VALIDATION_PRESENTATION.baseline;
  const explicit = explicitValidationKey(feature?.validation_status);
  if (explicit && explicit !== "unverified") return VALIDATION_PRESENTATION[explicit];
  if (feature?.id === D08_ID) return VALIDATION_PRESENTATION.conditional;
  if (explicit) return VALIDATION_PRESENTATION[explicit];
  const analysisKey = explicitValidationKey(feature?.analysis?.outcome);
  if (analysisKey) return VALIDATION_PRESENTATION[analysisKey];
  const statusKey = explicitValidationKey(feature?.status);
  return VALIDATION_PRESENTATION[statusKey ?? "unverified"];
}

export function validationStatement(feature) {
  const validation = featureValidation(feature);
  if (validation.key === "conditional") {
    return "暂无独立消融/效果证据；当前为条件性 Feature，待结构与数值等价性确认。";
  }
  if (validation.key === "unverified") return "暂无独立消融/效果证据。";
  return "";
}

function safePinnedUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return "";
    if ([...url.searchParams.keys()].some((key) => SENSITIVE_QUERY.test(key))) return "";
    const parts = url.pathname.split("/").filter(Boolean);
    const pinIndex = parts.findIndex((part) => part === "blob" || part === "commit");
    const revision = pinIndex >= 0 ? parts[pinIndex + 1] : "";
    if (!FULL_REVISION.test(revision)) return "";
    return url.href;
  } catch {
    return "";
  }
}

function symbolFromSummary(summary) {
  const text = String(summary ?? "");
  const qualified = text.match(/\b[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+\b/)?.[0];
  if (qualified) return qualified;
  return text.match(/\b[A-Z][A-Za-z0-9_]*(?:Model|Block|Module|DD)\b/)?.[0] ?? "";
}

export function structuredCodeLocators(feature) {
  const symbols = Array.isArray(feature?.implementation?.code_symbols)
    ? feature.implementation.code_symbols
    : [];
  return symbols.map((entry) => {
    const locator = entry.locator ?? entry.url ?? entry.pinned_url ?? "";
    let repository = entry.repository ?? "";
    let revision = entry.revision ?? "";
    let path = entry.path ?? "";
    try {
      const url = new URL(locator);
      const parts = url.pathname.split("/").filter(Boolean);
      if (!repository && parts.length >= 2) repository = `${url.origin}/${parts[0]}/${parts[1]}`;
      const blobIndex = parts.indexOf("blob");
      const commitIndex = parts.indexOf("commit");
      const pinIndex = blobIndex >= 0 ? blobIndex : commitIndex;
      if (!revision && pinIndex >= 0) revision = parts[pinIndex + 1] ?? "";
      if (!path && blobIndex >= 0) path = parts.slice(blobIndex + 2).join("/");
    } catch {
      // Invalid locators remain visible as plain structured fields, never links.
    }
    const symbol = entry.qualified_symbol ?? entry.symbol ?? symbolFromSummary(entry.summary);
    return Object.freeze({
      id: entry.id ?? symbol ?? path,
      repository,
      revision,
      path,
      symbol,
      role: entry.role ?? entry.summary ?? "",
      pinnedUrl: safePinnedUrl(locator),
    });
  });
}

export function primaryCodeHint(feature, limit = 28) {
  const locator = structuredCodeLocators(feature)[0];
  if (!locator) return "";
  const hint = locator.symbol || locator.path.split("/").at(-1) || "";
  if (hint.length <= limit) return hint;
  const lastSymbol = hint.split(".").at(-1);
  return lastSymbol.length <= limit ? lastSymbol : `${lastSymbol.slice(0, limit - 1)}…`;
}

export function deltaOperations(feature) {
  return Array.isArray(feature?.delta?.operations) ? feature.delta.operations : [];
}

export function configurationView(feature) {
  const explicit = feature?.configuration ?? feature?.parameters ?? feature?.config ?? null;
  const derived = {};
  for (const operation of deltaOperations(feature)) {
    if (operation?.after && typeof operation.after === "object" && !Array.isArray(operation.after)) {
      Object.assign(derived, operation.after);
    }
    for (const key of ["configuration", "parameters", "switches"]) {
      if (operation?.[key] && typeof operation[key] === "object") Object.assign(derived, operation[key]);
    }
  }
  return {
    design: feature?.design ?? "",
    parameters: explicit ?? (Object.keys(derived).length ? derived : null),
  };
}

function hasContent(value) {
  if (value == null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

export function validationView(feature) {
  const canonical = feature?.validation && typeof feature.validation === "object" ? feature.validation : {};
  const experiments = Array.isArray(feature?.experiments) ? feature.experiments : [];
  const meaningful = experiments.filter((experiment) => hasContent(experiment) && Object.keys(experiment).length > 0);
  const comparison = [canonical.comparison, ...meaningful.map((item) => item.comparison ?? item.title)].filter(Boolean);
  const conditions = [canonical.conditions, ...meaningful.map((item) => item.conditions ?? item.condition)].filter(hasContent);
  const metrics = [canonical.metrics, ...meaningful.map((item) => item.metrics)].filter(hasContent);
  const artifacts = [canonical.artifacts, ...meaningful.flatMap((item) => item.artifact_refs ?? item.artifacts ?? [])]
    .flat()
    .filter(Boolean);
  const limitations = [
    ...(Array.isArray(canonical.limitations) ? canonical.limitations : []),
    ...(Array.isArray(feature?.limitations) ? feature.limitations : []),
    ...(Array.isArray(feature?.analysis?.limitations) ? feature.analysis.limitations : []),
  ].filter((value, index, values) => values.indexOf(value) === index);
  return {
    validation: featureValidation(feature),
    statement: validationStatement(feature),
    hypothesis: feature?.hypothesis ?? "",
    comparison,
    conditions,
    metrics,
    artifacts,
    observations: canonical.observations ?? [],
    conclusion: canonical.conclusion ?? feature?.analysis?.conclusion ?? "",
    limitations,
  };
}

export function locatorSearchValues(feature) {
  return structuredCodeLocators(feature).flatMap((locator) => [
    locator.repository,
    locator.revision,
    locator.path,
    locator.symbol,
    locator.role,
  ]);
}
