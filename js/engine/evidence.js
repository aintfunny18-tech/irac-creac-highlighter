// Transparent evidence scoring, confidence, and uncertainty explanations.
// Port of the Python `_score_sentence_evidence` and friends.
//
// The deterministic rule-table label remains authoritative; these scores
// explain how much evidence supports each possible structural role and feed
// the confidence bands shown to students.

import {
  APPLICATION_PHRASES,
  APPLICATION_START_PHRASES,
  BECAUSE_FACT_RE,
  CASE_SPECIFIC_FACT_RE,
  CONCLUSION_PHRASES,
  EXPLANATION_PHRASES,
  EXPLANATION_REGEX_PATTERNS,
  FACTUAL_VERBS,
  GENERIC_SUBJECT_RE,
  HEDGE_WORDS,
  ISSUE_PHRASES,
  LABEL_ORDER,
  PRONOUN_AUX_RE,
  PRONOUN_SUBJECT_RE,
  SPECIFIC_LEGAL_OUTCOME_RE,
  STRONG_CONCLUSION_STARTERS,
} from "./lexicon.js";
import { hasCitation } from "./citations.js";
import { containsAny, round2, startsWithAny } from "./util.js";
import { countRuleSignals, isCounterargument } from "./rules.js";

const WHETHER_OPENER_RE = /^whether\b/;
const WHETHER_AFTER_INTRO_RE = /^[^,]{0,30},\s*whether\b/;
const EMBEDDED_WHETHER_RE = /\b(?:question|issue|inquiry|problem)\b.{0,60}\bwhether\b/;
const COURT_SHOULD_CONSIDER_RE = /\bthe\s+court\s+should\s+consider\b/;
const OUTCOME_VERB_RE =
  /\b(?:liable|guilty|enforceable|proper|improper|valid|invalid|satisfied|met|prevail|succeed|fail|deny|grant|hold|find|conclude)\b/;

// --- additional linguistic signals (evidence-only; they shape confidence and
// competing labels without changing the deterministic rule table) ---

// Generic legal subject + normative modal: "a defendant must…", "a party may
// not…" — the modality of an abstract rule statement.
const NORMATIVE_MODAL_RE =
  /\b(?:must|shall|may\s+not|cannot|is\s+required\s+to|are\s+required\s+to)\b/;

// Predictive outcome language: "would likely", "will likely", "should grant…"
// — the modality of a conclusion about this case.
const PREDICTIVE_OUTCOME_RE =
  /\b(?:would\s+likely|will\s+likely|is\s+likely\s+to|should\s+(?:grant|deny|dismiss|find|hold|conclude|prevail))\b/;

// A full citation at the very end of the sentence ("…, 248 N.Y. 339 (1928).")
// is how rules and case explanations are anchored; applications cite
// mid-sentence if at all.
const TRAILING_CITE_RE = /(?:\(\d{4}\)|§+\s*\d[\w().–-]*)\s*[).”"']*\.?$/;

// Quoted language plus a citation usually reproduces the governing standard.
const QUOTED_AUTHORITY_RE = /["“'‘][^"”'’]{10,}["”'’]/;

/** Convert transparent label scores into a stable 0.50–0.98 confidence. */
export function confidenceFromScores(label, scores) {
  if (label === "UNCLASSIFIED") {
    const values = Object.values(scores);
    const top = values.length ? Math.max(...values) : 0;
    return round2(top < 1.5 ? 0.55 : 0.35);
  }

  const labelScore = scores[label] ?? 0;
  const competing = Object.entries(scores)
    .filter(([k]) => k !== label && k !== "UNCLASSIFIED")
    .map(([, v]) => v);
  const runnerUp = competing.length ? Math.max(...competing) : 0;
  if (labelScore <= 0) return 0.62;

  const margin = Math.max(0, labelScore - runnerUp);
  const confidence = 0.5 + Math.min(0.35, labelScore * 0.07) + Math.min(0.15, margin * 0.06);
  return round2(Math.min(0.98, Math.max(0.5, confidence)));
}

export function confidenceBand(confidence) {
  if (confidence >= 0.82) return "high";
  if (confidence >= 0.68) return "medium";
  return "low";
}

/** Likely alternative labels, for transparent, non-binary coaching. */
export function competingLabels(finalLabel, scores) {
  const rows = Object.entries(scores)
    .filter(([label, score]) => label !== finalLabel && score > 0)
    .map(([label, score]) => ({ label, score: round2(score) }));
  rows.sort((a, b) => b.score - a.score);
  return rows.slice(0, 3);
}

/** Explain why a sentence should be treated cautiously. */
export function uncertaintyReason(finalLabel, confidence, scores, evidence) {
  if (confidence >= 0.82) return "";

  const alternatives = competingLabels(finalLabel, scores);
  if (alternatives.length) {
    const alt = alternatives[0];
    return (
      `This sentence also has signals of ${alt.label.toLowerCase()}, ` +
      "so treat this classification as a coaching guess."
    );
  }

  if (!(evidence[finalLabel] || []).length) {
    return (
      "The sentence has weak explicit structure markers, so the tool is " +
      "leaning on context rather than a clear signal."
    );
  }

  return "The signal is present but not strong enough for high confidence.";
}

function addScore(scores, evidence, label, points, reason) {
  scores[label] += points;
  if (reason && !evidence[label].includes(reason)) {
    evidence[label].push(reason);
  }
}

/**
 * Score one sentence's evidence for every label.
 * Returns { confidence, confidence_label, evidence_scores, competing_labels,
 *           evidence, uncertainty_reason } using the response-JSON key names.
 */
export function scoreSentenceEvidence(
  sentence,
  idxInPara,
  totalInPara,
  framework,
  partyNames,
  finalLabel,
  triggerPhrase
) {
  const s = sentence.trim();
  const sl = s.toLowerCase();
  const scores = {};
  const evidence = {};
  for (const label of LABEL_ORDER) {
    scores[label] = 0.0;
    evidence[label] = [];
  }

  // Authoritative section labels and context passes.
  if (triggerPhrase.startsWith("[section label:")) {
    addScore(scores, evidence, finalLabel, 5.0, triggerPhrase);
  } else if (triggerPhrase.startsWith("[context:")) {
    addScore(scores, evidence, finalLabel, 2.6, triggerPhrase);
  } else if (triggerPhrase.startsWith("[para cascade:")) {
    addScore(scores, evidence, finalLabel, 2.6, triggerPhrase);
  } else if (triggerPhrase.startsWith("[final sentence")) {
    addScore(scores, evidence, finalLabel, 2.4, triggerPhrase);
  } else if (triggerPhrase.startsWith("[standalone citation")) {
    addScore(scores, evidence, finalLabel, 2.0, triggerPhrase);
  }

  // Issue evidence.
  const issueTrigger = containsAny(sl, ISSUE_PHRASES);
  if (issueTrigger) {
    addScore(scores, evidence, "ISSUE", 3.2, issueTrigger);
  }
  if (s.endsWith("?") && !hasCitation(s) && !GENERIC_SUBJECT_RE.test(s)) {
    addScore(scores, evidence, "ISSUE", 2.7, "question mark");
  }
  if (WHETHER_OPENER_RE.test(sl) || WHETHER_AFTER_INTRO_RE.test(sl)) {
    addScore(scores, evidence, "ISSUE", 2.7, "whether opener");
  } else if (EMBEDDED_WHETHER_RE.test(sl)) {
    addScore(scores, evidence, "ISSUE", 2.4, "issue noun + whether");
  }

  // Rule evidence.
  const { total: totalRule, strong: strongRule, trigger: ruleTrigger } = countRuleSignals(s, sl);
  if (totalRule) {
    addScore(
      scores,
      evidence,
      "RULE",
      1.1 * totalRule + 0.8 * strongRule,
      ruleTrigger || "rule signal"
    );
  }
  if (hasCitation(s)) {
    addScore(scores, evidence, "RULE", 1.6, "citation");
    if (TRAILING_CITE_RE.test(s)) {
      addScore(scores, evidence, "RULE", 0.6, "citation anchors the sentence");
    }
    if (QUOTED_AUTHORITY_RE.test(s)) {
      addScore(scores, evidence, "RULE", 0.8, "quoted authority language");
    }
  }
  if (GENERIC_SUBJECT_RE.test(s) && NORMATIVE_MODAL_RE.test(sl)) {
    addScore(scores, evidence, "RULE", 0.9, "generic subject + legal modal");
  }

  // Explanation evidence. In CREAC this is a distinct label; in IRAC it also
  // supports RULE because case explanation usually functions as rule support.
  let expTrigger = containsAny(sl, EXPLANATION_PHRASES);
  if (!expTrigger) {
    for (const pattern of EXPLANATION_REGEX_PATTERNS) {
      if (pattern.test(s)) {
        expTrigger = "[case illustration]";
        break;
      }
    }
  }
  if (expTrigger) {
    const expPoints = 2.6 + (hasCitation(s) ? 0.8 : 0);
    if (framework === "CREAC") {
      addScore(scores, evidence, "EXPLANATION", expPoints, expTrigger);
    } else {
      addScore(scores, evidence, "RULE", expPoints * 0.8, `case explanation: ${expTrigger}`);
    }
  }

  // Application evidence.
  const appStart = startsWithAny(sl, APPLICATION_START_PHRASES);
  const appPhrase = startsWithAny(sl, APPLICATION_PHRASES) || containsAny(sl, APPLICATION_PHRASES);
  if (isCounterargument(s)) {
    addScore(scores, evidence, "APPLICATION", 2.4, "opposing-position signal");
  }
  if (appStart) {
    addScore(scores, evidence, "APPLICATION", 3.3, appStart);
  } else if (appPhrase) {
    addScore(scores, evidence, "APPLICATION", 2.5, appPhrase);
  }
  if (CASE_SPECIFIC_FACT_RE.test(sl)) {
    addScore(scores, evidence, "APPLICATION", 2.6, "case-specific fact");
  }
  if (SPECIFIC_LEGAL_OUTCOME_RE.test(s)) {
    addScore(scores, evidence, "APPLICATION", 2.7, "specific legal outcome");
  }
  if (BECAUSE_FACT_RE.test(sl) && FACTUAL_VERBS.test(sl)) {
    addScore(scores, evidence, "APPLICATION", 2.2, "causal application");
  }
  if (PRONOUN_SUBJECT_RE.test(sl) && !PRONOUN_AUX_RE.test(sl) && FACTUAL_VERBS.test(sl)) {
    addScore(scores, evidence, "APPLICATION", 1.8, "pronoun + factual verb");
  }
  if (partyNames.size && !hasCitation(s)) {
    for (const name of partyNames) {
      if (s.includes(name) && FACTUAL_VERBS.test(sl)) {
        addScore(scores, evidence, "APPLICATION", 1.9, `party fact: ${name}`);
        break;
      }
    }
  }

  // Conclusion evidence.
  if (framework === "CRAC" && idxInPara === 0 && totalInPara > 1) {
    addScore(scores, evidence, "CONCLUSION", 2.4, "CRAC opening position");
  }
  if (framework === "CREAC" && idxInPara === 0 && totalInPara > 1) {
    addScore(scores, evidence, "CONCLUSION", 2.2, "CREAC opening position");
  }
  if (STRONG_CONCLUSION_STARTERS.test(sl)) {
    addScore(scores, evidence, "CONCLUSION", 3.3, "strong conclusion starter");
  }
  const conclusionTrigger =
    startsWithAny(sl, CONCLUSION_PHRASES) || containsAny(sl, CONCLUSION_PHRASES);
  if (conclusionTrigger) {
    addScore(scores, evidence, "CONCLUSION", 2.7, conclusionTrigger);
  }
  if (idxInPara === totalInPara - 1) {
    const hedge = containsAny(sl, HEDGE_WORDS);
    if (hedge) {
      addScore(scores, evidence, "CONCLUSION", 1.8, `final sentence + hedge: ${hedge}`);
    }
  }
  if (PREDICTIVE_OUTCOME_RE.test(sl) && !GENERIC_SUBJECT_RE.test(s)) {
    addScore(scores, evidence, "CONCLUSION", 1.2, "predictive outcome language");
  }

  if (triggerPhrase && finalLabel !== "UNCLASSIFIED") {
    addScore(scores, evidence, finalLabel, 0.8, `selected trigger: ${triggerPhrase}`);
  }

  let confidence = confidenceFromScores(finalLabel, scores);
  if (
    finalLabel === "CONCLUSION" &&
    COURT_SHOULD_CONSIDER_RE.test(sl) &&
    !OUTCOME_VERB_RE.test(sl)
  ) {
    confidence = Math.min(confidence, 0.66);
    addScore(scores, evidence, "UNCLASSIFIED", 1.4, "generic court-should phrasing");
  }

  const roundedScores = {};
  for (const label of LABEL_ORDER) roundedScores[label] = round2(scores[label]);
  const reason = uncertaintyReason(finalLabel, confidence, scores, evidence);

  return {
    confidence,
    confidence_label: confidenceBand(confidence),
    evidence_scores: roundedScores,
    competing_labels: competingLabels(finalLabel, scores),
    evidence: (evidence[finalLabel] || []).slice(0, 4),
    uncertainty_reason: reason,
  };
}
