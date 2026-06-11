// Public engine API: classifyText(paragraphs, framework) → analysis object.
//
// The output object keeps the exact JSON shape (snake_case keys) of the
// archived Flask /analyze endpoint so the UI, exporter, and the Python-parity
// tests all share one contract. One addition: each sentence carries `rule_id`,
// naming the classification rule that fired (used for tooltip explanations).

import { LABEL_COLORS, LABEL_ORDER } from "./lexicon.js";
import { segmentSentences } from "./segmenter.js";
import { autoDetectFramework } from "./framework.js";
import { extractPartyNames } from "./parties.js";
import { classifySentence, isCounterargument } from "./rules.js";
import {
  cascadeStructLabels,
  continueExplanations,
  detectBlends,
  inheritStandaloneCitations,
  promoteLastConclusion,
  smoothByContext,
} from "./passes.js";
import { scoreSentenceEvidence } from "./evidence.js";
import { computeBadge } from "./badges.js";
import { attachParagraphTrainingFields, sentenceRevisionHint } from "./coaching.js";

/** Re-score evidence and refresh hints after the label-changing passes. */
function refreshSentenceEvidence(sentencesData, framework, partyNames) {
  const total = sentencesData.length;
  sentencesData.forEach((sd, idx) => {
    Object.assign(
      sd,
      scoreSentenceEvidence(
        sd.text,
        idx,
        total,
        framework,
        partyNames,
        sd.label,
        sd.trigger_phrase || ""
      )
    );
    sd.revision_hint = sentenceRevisionHint(sd);
  });
  return sentencesData;
}

/**
 * Classify a list of paragraph strings.
 * framework: "AUTO", "IRAC", "CREAC", or "CRAC".
 */
export function classifyText(paragraphs, framework) {
  let fw = (framework || "AUTO").toUpperCase();
  if (!["AUTO", "IRAC", "CREAC", "CRAC"].includes(fw)) fw = "AUTO";

  const partyNames = extractPartyNames(paragraphs);

  const resultParagraphs = [];
  const labelCounts = {};
  for (const label of LABEL_ORDER) labelCounts[label] = 0;
  let totalSentences = 0;
  let blendCount = 0;
  let completeParagraphs = 0;
  let warningParagraphs = 0;

  paragraphs.forEach((paraText, paraIdx) => {
    // Per-paragraph framework: AUTO adapts to issue-led IRAC, conclusion-led
    // CRAC, or case-illustrating CREAC paragraph shapes.
    const effectiveFramework = autoDetectFramework(paraText, fw);

    const rawSentences = segmentSentences(paraText);

    let sentencesData = rawSentences.map((sentText, sentIdx) => {
      const { label, trigger, ruleId } = classifySentence(
        sentText,
        sentIdx,
        rawSentences.length,
        effectiveFramework,
        partyNames
      );
      return {
        text: sentText,
        label,
        color_hex: LABEL_COLORS[label],
        blend: false,
        blend_type: null,
        counterargument: isCounterargument(sentText),
        trigger_phrase: trigger,
        rule_id: ruleId,
      };
    });

    sentencesData = detectBlends(sentencesData);
    sentencesData = continueExplanations(sentencesData, effectiveFramework);
    sentencesData = smoothByContext(sentencesData);
    sentencesData = cascadeStructLabels(sentencesData);
    sentencesData = promoteLastConclusion(sentencesData);
    sentencesData = inheritStandaloneCitations(sentencesData);
    sentencesData = refreshSentenceEvidence(sentencesData, effectiveFramework, partyNames);

    const { badge, badgeLabel, suggestion } = computeBadge(sentencesData, effectiveFramework);

    for (const sent of sentencesData) {
      if (sent.label in labelCounts) labelCounts[sent.label] += 1;
      totalSentences += 1;
      if (sent.blend) blendCount += 1;
    }

    if (badge.startsWith("COMPLETE")) completeParagraphs += 1;
    else if (badge.startsWith("WARNING")) warningParagraphs += 1;

    const cleanSentences = sentencesData.map((s) => ({
      text: s.text,
      label: s.label,
      color_hex: s.color_hex,
      blend: s.blend,
      counterargument: s.counterargument || false,
      trigger_phrase: s.trigger_phrase,
      rule_id: s.rule_id,
      confidence: s.confidence ?? 0.0,
      confidence_label: s.confidence_label ?? "low",
      evidence_scores: s.evidence_scores ?? {},
      competing_labels: s.competing_labels ?? [],
      evidence: s.evidence ?? [],
      revision_hint: s.revision_hint ?? "",
      uncertainty_reason: s.uncertainty_reason ?? "",
    }));

    resultParagraphs.push({
      paragraph_index: paraIdx,
      badge,
      badge_label: badgeLabel,
      suggestion,
      effective_framework: effectiveFramework,
      sentences: cleanSentences,
      cross_para_note: "",
    });
  });

  // Cross-paragraph context notes: when adjacent paragraphs together would
  // form a complete structure but are split by a paragraph break.
  const nParas = resultParagraphs.length;
  resultParagraphs.forEach((para, i) => {
    const badge = para.badge;
    const prevLabels =
      i > 0 ? new Set(resultParagraphs[i - 1].sentences.map((s) => s.label)) : new Set();
    const nextLabels =
      i + 1 < nParas
        ? new Set(resultParagraphs[i + 1].sentences.map((s) => s.label))
        : new Set();

    if (badge === "WARNING_MISSING_APPLICATION") {
      if (nextLabels.has("APPLICATION")) {
        para.cross_para_note =
          "The application of these facts appears in the next paragraph. " +
          "In IRAC/CREAC, rule and application belong in the same paragraph.";
      } else if (prevLabels.has("APPLICATION")) {
        para.cross_para_note =
          "The application of these facts appears in the preceding paragraph. " +
          "In IRAC/CREAC, rule and application belong in the same paragraph.";
      }
    } else if (badge === "WARNING_MISSING_RULE") {
      const hasRuleish = (set) => set.has("RULE") || set.has("EXPLANATION");
      if (hasRuleish(nextLabels)) {
        para.cross_para_note =
          "The governing rule appears in the next paragraph. " +
          "In IRAC/CREAC, rule and application belong in the same paragraph.";
      } else if (hasRuleish(prevLabels)) {
        para.cross_para_note =
          "The governing rule appears in the preceding paragraph. " +
          "In IRAC/CREAC, rule and application belong in the same paragraph.";
      }
    }
  });

  for (const para of resultParagraphs) {
    attachParagraphTrainingFields(para);
  }

  return {
    framework: fw,
    paragraphs: resultParagraphs,
    summary: {
      total_paragraphs: resultParagraphs.length,
      complete_paragraphs: completeParagraphs,
      warning_paragraphs: warningParagraphs,
      total_sentences: totalSentences,
      blend_count: blendCount,
      label_counts: labelCounts,
    },
  };
}
