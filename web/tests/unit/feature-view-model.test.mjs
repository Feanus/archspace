import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeFeatureTree } from "../../src/data-adapter.js";
import { matchesFeatureSearch } from "../../src/feature-display.js";
import {
  configurationView,
  featureValidation,
  primaryCodeHint,
  structuredCodeLocators,
  validationStatement,
} from "../../src/feature-view-model.js";

const payload = JSON.parse(await readFile(new URL("../../../data/feature-tree.json", import.meta.url), "utf8"));
const tree = normalizeFeatureTree(payload);

test("D08 remains conditional while other inconclusive Features are unverified", () => {
  const d08 = tree.byId.get("feat-concept-hlm-olmo3-layer-reuse");
  const d07 = tree.byId.get("feat-concept-hlm-backbone-window");
  assert.deepEqual(featureValidation(d08), { key: "conditional", label: "条件性 · 待等价性确认" });
  assert.deepEqual(featureValidation(d07), { key: "unverified", label: "未验证" });
  assert.match(validationStatement(d08), /暂无独立消融\/效果证据/);
  assert.match(validationStatement(d08), /等价性确认/);
});

test("explicit validation_status has priority over legacy fallbacks", () => {
  const feature = { ...tree.byId.get("feat-concept-hlm-olmo3-layer-reuse"), validation_status: "validated" };
  assert.deepEqual(featureValidation(feature), { key: "validated", label: "已验证" });
});

test("canonical code locator exposes a full safe commit pin and qualified symbol", () => {
  const feature = tree.byId.get("feat-concept-hlm-olmo3-layer-reuse");
  const [locator] = structuredCodeLocators(feature);
  assert.equal(locator.repository, "https://github.com/Liu-yuliang/concept_olmo");
  assert.equal(locator.revision, "7512755321ee4238b43ad08eb3ecfbc5fe2f2e6e");
  assert.equal(locator.path, "repo/megatron/core/models/gpt/conceptlm_v21.py");
  assert.equal(locator.symbol, "ConceptPredictorV21.hlm_block");
  assert.match(locator.pinnedUrl, /\/blob\/[0-9a-f]{40}\//);
  assert.doesNotMatch(locator.pinnedUrl, /token|credential|secret/i);
  assert.equal(primaryCodeHint(feature), "hlm_block");
});

test("sensitive or unpinned locator URLs never become clickable", () => {
  const feature = {
    implementation: {
      code_symbols: [{
        locator: "https://github.com/org/repo/blob/7512755321ee4238b43ad08eb3ecfbc5fe2f2e6e/model.py?token=secret",
        summary: "Model.forward role",
      }],
    },
  };
  assert.equal(structuredCodeLocators(feature)[0].pinnedUrl, "");
});

test("configuration parameters and code paths remain searchable", () => {
  const productVq = tree.byId.get("feat-concept-product-vq");
  assert.deepEqual(configurationView(productVq).parameters, {
    method: "product vector quantization",
    codebooks: 32,
    codebook_size: 128,
  });
  assert.equal(matchesFeatureSearch(productVq, "ConceptLMV22VQModel"), true);
  assert.equal(matchesFeatureSearch(productVq, "conceptlm_v22_vq.py"), true);
});
