// Click-to-correct: manual label overrides.
//
// A correction rewrites the sentence's label in state.results, then re-runs
// only the pure paragraph-level engine functions (badge, structure score,
// coaching, summary counts) — never the classification passes, so the rest of
// the analysis stays stable. The original label is kept for reset/export.

import { LABEL_COLORS, LABEL_ORDER } from "../engine/lexicon.js";
import { computeBadge } from "../engine/badges.js";
import { attachParagraphTrainingFields } from "../engine/coaching.js";
import { state, correctionKey } from "./state.js";
import { rerenderParagraph, renderSummary } from "./render.js";

function recomputeParagraph(para) {
  const { badge, badgeLabel, suggestion } = computeBadge(
    para.sentences,
    para.effective_framework
  );
  para.badge = badge;
  para.badge_label = badgeLabel;
  para.suggestion = suggestion;
  attachParagraphTrainingFields(para);
}

function recomputeSummary() {
  const summary = state.results.summary;
  const counts = {};
  for (const label of LABEL_ORDER) counts[label] = 0;
  let complete = 0;
  let warning = 0;
  for (const para of state.results.paragraphs) {
    for (const sent of para.sentences) {
      if (sent.label in counts) counts[sent.label] += 1;
    }
    if (para.badge.startsWith("COMPLETE")) complete += 1;
    else if (para.badge.startsWith("WARNING")) warning += 1;
  }
  summary.label_counts = counts;
  summary.complete_paragraphs = complete;
  summary.warning_paragraphs = warning;
}

/** Apply (or undo, when newLabel === original) a manual label override. */
export function applyCorrection(paraIdx, sentIdx, newLabel) {
  const para = state.results?.paragraphs?.[paraIdx];
  const sent = para?.sentences?.[sentIdx];
  if (!sent || sent.label === newLabel) return;

  const key = correctionKey(paraIdx, sentIdx);
  const existing = state.corrections.get(key);
  const originalLabel = existing ? existing.originalLabel : sent.label;

  sent.label = newLabel;
  sent.color_hex = LABEL_COLORS[newLabel];

  if (newLabel === originalLabel) {
    // Back to the engine's call — no longer a correction.
    state.corrections.delete(key);
    sent.corrected = false;
    delete sent.original_label;
  } else {
    state.corrections.set(key, { label: newLabel, originalLabel });
    sent.corrected = true;
    sent.original_label = originalLabel;
  }

  recomputeParagraph(para);
  recomputeSummary();
  rerenderParagraph(paraIdx);
  renderSummary();
}

/** Revert every manual override. */
export function resetCorrections() {
  if (!state.results) return;
  const touchedParas = new Set();
  for (const [key, { originalLabel }] of state.corrections) {
    const [paraIdx, sentIdx] = key.split(":").map(Number);
    const sent = state.results.paragraphs[paraIdx]?.sentences?.[sentIdx];
    if (!sent) continue;
    sent.label = originalLabel;
    sent.color_hex = LABEL_COLORS[originalLabel];
    sent.corrected = false;
    delete sent.original_label;
    touchedParas.add(paraIdx);
  }
  state.corrections.clear();
  for (const paraIdx of touchedParas) {
    recomputeParagraph(state.results.paragraphs[paraIdx]);
    rerenderParagraph(paraIdx);
  }
  recomputeSummary();
  renderSummary();
}

export { LABEL_ORDER };
