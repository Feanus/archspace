import assert from "node:assert/strict";
import test from "node:test";
import {
  NODE_TITLE_LIMIT,
  compactFeatureTitle,
  featureEnglishSubtitle,
  featureSummary,
  featureTitle,
  matchesFeatureSearch,
} from "../../src/feature-display.js";

const bilingual = {
  id: "feat-bilingual",
  title: "English feature title",
  title_zh: "中文功能标题",
  summary: "English searchable summary",
  summary_zh: "中文可搜索摘要",
};

test("display fields prefer Chinese and retain an English subtitle", () => {
  assert.equal(featureTitle(bilingual), "中文功能标题");
  assert.equal(featureSummary(bilingual), "中文可搜索摘要");
  assert.equal(featureEnglishSubtitle(bilingual), "English feature title");
});

test("legacy fields remain the fallback without a duplicate subtitle", () => {
  const legacy = { id: "feat-legacy", title: "Legacy English title", summary: "Legacy summary" };
  assert.equal(featureTitle(legacy), "Legacy English title");
  assert.equal(featureSummary(legacy), "Legacy summary");
  assert.equal(featureEnglishSubtitle(legacy), "");
});

test("search covers Chinese, English, summaries and id", () => {
  assert.equal(matchesFeatureSearch(bilingual, "中文功能"), true);
  assert.equal(matchesFeatureSearch(bilingual, "english feature"), true);
  assert.equal(matchesFeatureSearch(bilingual, "可搜索摘要"), true);
  assert.equal(matchesFeatureSearch(bilingual, "searchable summary"), true);
  assert.equal(matchesFeatureSearch(bilingual, "feat-bilingual"), true);
});

test("long Chinese titles use the compact single-line rule", () => {
  const feature = { title: "Long title", title_zh: "这是一个用于验证紧凑截断规则的超长中文功能标题" };
  const compact = compactFeatureTitle(feature);
  assert.equal(compact.length, NODE_TITLE_LIMIT);
  assert.match(compact, /…$/);
  assert.equal(feature.title_zh, "这是一个用于验证紧凑截断规则的超长中文功能标题");
});
