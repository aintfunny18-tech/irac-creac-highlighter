// Corpus expectation tests — the permanent regression suite.
//
// Each corpus case carries hand-written expectations (badge, labels,
// must_label spot checks, coaching fields). Unlike parity.test.mjs these are
// independent of the archived Python engine and survive accuracy work.

import test from "node:test";
import assert from "node:assert/strict";

import { classifyText } from "../js/engine/classify.js";
import { loadCorpusCases } from "./helpers.mjs";

const corpus = loadCorpusCases();

for (const corpusCase of corpus) {
  const expect = corpusCase.expect || {};
  if (!Object.keys(expect).length) continue;

  // Cases marked pending document a known engine weakness with a planned fix
  // (e.g. de-overfitting CivPro application phrases). They run as TODO so the
  // expectation is preserved without failing the suite until the fix lands.
  const options = expect.pending ? { todo: `pending: ${expect.pending}` } : {};

  test(`corpus: ${corpusCase.id}`, options, () => {
    const result = classifyText(corpusCase.paragraphs, corpusCase.framework);
    const para0 = result.paragraphs[0];
    const allSentences = result.paragraphs.flatMap((p) => p.sentences);

    if (expect.badge) {
      assert.equal(para0.badge, expect.badge, "badge");
    }
    if (expect.badge_not_complete) {
      assert.ok(
        !para0.badge.startsWith("COMPLETE"),
        `expected non-COMPLETE badge, got ${para0.badge}`
      );
    }
    if (expect.effective_framework) {
      assert.equal(para0.effective_framework, expect.effective_framework, "framework");
    }
    if (expect.labels) {
      assert.deepEqual(
        para0.sentences.map((s) => s.label),
        expect.labels,
        "sentence labels"
      );
    }
    if (expect.must_label) {
      for (const [needle, expectedLabel] of Object.entries(expect.must_label)) {
        const match = allSentences.find((s) => s.text.includes(needle));
        assert.ok(match, `missing sentence containing "${needle}"`);
        assert.equal(match.label, expectedLabel, `label for "${needle}"`);
      }
    }
    if (expect.must_counterargument) {
      for (const needle of expect.must_counterargument) {
        const match = allSentences.find((s) => s.text.includes(needle));
        assert.ok(match, `missing sentence containing "${needle}"`);
        assert.equal(match.counterargument, true, `counterargument for "${needle}"`);
      }
    }
    if (expect.priority_kinds) {
      const kinds = new Set(
        result.paragraphs.flatMap((p) => p.revision_priorities.map((x) => x.kind))
      );
      for (const kind of expect.priority_kinds) {
        assert.ok(kinds.has(kind), `expected revision priority "${kind}"`);
      }
    }
    if (expect.priority_kinds_para0) {
      const kinds = new Set(para0.revision_priorities.map((x) => x.kind));
      for (const kind of expect.priority_kinds_para0) {
        assert.ok(kinds.has(kind), `expected ¶0 revision priority "${kind}"`);
      }
    }
    if (expect.first_sentence_confidence_label_in) {
      assert.ok(
        expect.first_sentence_confidence_label_in.includes(
          para0.sentences[0].confidence_label
        ),
        `confidence_label ${para0.sentences[0].confidence_label}`
      );
    }
    if (expect.para_expected_labels) {
      // Per-paragraph struct-prefix expectations (CivPro exam sections):
      // every sentence in a labeled paragraph should carry that label.
      expect.para_expected_labels.forEach((expLabel, pi) => {
        if (!expLabel) return;
        for (const s of result.paragraphs[pi].sentences) {
          assert.equal(
            s.label,
            expLabel,
            `¶${pi} "${s.text.slice(0, 50)}" expected ${expLabel}`
          );
        }
      });
    }

    // Universal sanity checks on the response shape.
    for (const s of allSentences) {
      assert.ok(s.label, "label present");
      assert.ok(typeof s.confidence === "number", "confidence numeric");
      assert.ok(["low", "medium", "high"].includes(s.confidence_label), "band");
      assert.ok(typeof s.revision_hint === "string", "revision_hint");
    }
    assert.equal(
      result.summary.total_sentences,
      allSentences.length,
      "summary sentence count"
    );
  });
}
