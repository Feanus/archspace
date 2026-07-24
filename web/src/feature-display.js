export const NODE_TITLE_LIMIT = 19;

export function featureTitle(feature) {
  return feature?.title_zh || feature?.title || feature?.id || "未命名 Feature";
}

export function featureSummary(feature) {
  return feature?.summary_zh || feature?.summary || "";
}

export function featureEnglishSubtitle(feature) {
  return feature?.title_zh && feature.title && feature.title_zh !== feature.title
    ? feature.title
    : "";
}

export function compactFeatureTitle(feature, limit = NODE_TITLE_LIMIT) {
  const title = featureTitle(feature);
  return title.length > limit ? `${title.slice(0, limit - 1)}…` : title;
}

export function matchesFeatureSearch(feature, query) {
  const term = String(query ?? "").trim().toLocaleLowerCase("zh-CN");
  if (!term) return false;
  return [feature?.title_zh, feature?.title, feature?.summary_zh, feature?.summary, feature?.id, ...locatorSearchValues(feature)]
    .filter((value) => value != null && value !== "")
    .some((value) => String(value).toLocaleLowerCase("zh-CN").includes(term));
}
import { locatorSearchValues } from "./feature-view-model.js";
