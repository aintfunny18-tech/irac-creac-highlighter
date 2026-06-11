// The built-in example documents are part of the product: the professor can
// demo every badge type from them with one click. Pin their badges so engine
// changes that would break the demo fail loudly.

import test from "node:test";
import assert from "node:assert/strict";

import { classifyText } from "../js/engine/classify.js";
import { parsePlaintext } from "../js/parse/text.js";
import { EXAMPLES } from "../examples/examples.js";

test("example: office memo is well-formed CREAC", () => {
  const { paragraphs } = parsePlaintext(EXAMPLES.memo.text);
  const result = classifyText(paragraphs, "AUTO");
  const badges = result.paragraphs.map((p) => p.badge);
  assert.deepEqual(badges, ["INFO_INTRODUCTORY", "COMPLETE_CREAC", "COMPLETE_CREAC"]);
});

test("example: exam answer demos every warning badge", () => {
  const { paragraphs } = parsePlaintext(EXAMPLES.exam.text);
  const result = classifyText(paragraphs, "AUTO");
  const badges = result.paragraphs.map((p) => p.badge);
  assert.deepEqual(badges, [
    "COMPLETE_IRAC",
    "WARNING_MISSING_RULE",
    "WARNING_BLEND",
    "WARNING_APPLICATION_WITHOUT_RULE",
  ]);
});
