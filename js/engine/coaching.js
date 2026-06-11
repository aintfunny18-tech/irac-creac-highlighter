// Student-facing coaching: per-sentence revision hints, paragraph revision
// priorities, and training summaries. Port of the Python coaching layer.

import { words } from "./util.js";
import { structureScore } from "./badges.js";

const FACTS_BRIDGE_RE = /\b(?:because|here|fact|facts|show|shows|therefore|accordingly)\b/;

/** Short, structure-only coaching hint for a classified sentence. */
export function sentenceRevisionHint(sentenceData) {
  const label = sentenceData.label || "UNCLASSIFIED";
  const text = sentenceData.text || "";
  const sl = text.toLowerCase();
  const evidenceScores = sentenceData.evidence_scores || {};

  if (sentenceData.counterargument) {
    return (
      "This reads as an opposing-position sentence. Make sure the paragraph " +
      "answers it with rule-based application, not just a bare assertion."
    );
  }

  if (sentenceData.blend) {
    return (
      "This looks blended. Try splitting the legal rule from the fact-specific " +
      "application into separate sentences."
    );
  }

  if (label === "UNCLASSIFIED") {
    return (
      "If this sentence carries structural work, add clearer legal-writing " +
      "signals so a reader can tell whether it is rule, application, or conclusion."
    );
  }

  if (["low", "medium"].includes(sentenceData.confidence_label)) {
    return (
      "Check whether this sentence is doing more than one job; a clearer " +
      "signpost or separation may make the structure easier to follow."
    );
  }

  if (label === "RULE") {
    const appScore = evidenceScores.APPLICATION || 0;
    if (appScore >= 1.8) {
      return "This rule sentence may be drifting into facts. Keep the rule abstract, then apply it separately.";
    }
    return "Good rule signal. Make sure the next structural move connects this rule to specific facts.";
  }

  if (label === "APPLICATION") {
    const ruleScore = evidenceScores.RULE || 0;
    if (ruleScore >= 1.6) {
      return "This application carries rule-like signals too. Consider whether a citation or standard belongs in a separate rule sentence.";
    }
    if (!FACTS_BRIDGE_RE.test(sl)) {
      return "Strengthen the facts-to-rule bridge by naming the concrete fact and the rule element it satisfies.";
    }
    return "Good application signal. Make sure it expressly connects facts to a rule element.";
  }

  if (label === "EXPLANATION") {
    return "This reads as case explanation. In CREAC, use it before applying the rule to your client's facts.";
  }

  if (label === "CONCLUSION") {
    if (words(text).length < 8) {
      return "A concise conclusion is fine, but make sure it states the likely legal result with enough specificity.";
    }
    return "Good conclusion signal. It should follow the rule and application rather than substitute for them.";
  }

  if (label === "ISSUE") {
    return "Good issue signal. The following sentences should move to rule, application, and conclusion.";
  }

  return "";
}

/** Ordered paragraph-level coaching items independent of the badge label. */
export function revisionPriorities(sentencesData, badgeKey, framework, crossParaNote = "") {
  const labels = sentencesData.map((s) => s.label);
  const labelSet = new Set(labels);
  const priorities = [];

  const add = (kind, title, detail, severity = "info") => {
    if (!priorities.some((item) => item.kind === kind)) {
      priorities.push({ kind, title, detail, severity });
    }
  };

  if (badgeKey === "WARNING_MISSING_RULE") {
    add(
      "missing_rule",
      "State the governing rule before applying facts.",
      "A 1L reader should see the legal standard before the paragraph turns to what happened here.",
      "warning"
    );
  } else if (badgeKey === "WARNING_MISSING_APPLICATION") {
    add(
      "missing_application",
      "Connect the rule to the specific facts.",
      "This paragraph states law but needs the facts-to-element reasoning that earns most exam points.",
      "warning"
    );
  } else if (badgeKey === "WARNING_MISSING_CONCLUSION") {
    add(
      "missing_conclusion",
      "Close with a likely legal result.",
      "End the unit by saying who likely wins, loses, satisfies an element, or fails a requirement.",
      "warning"
    );
  } else if (badgeKey === "WARNING_APPLICATION_WITHOUT_RULE") {
    add(
      "premature_application",
      "Move rule before application.",
      "Readers should not have to infer the legal test after seeing the facts applied.",
      "warning"
    );
  } else if (badgeKey === "WARNING_EXPLANATION_AFTER_APPLICATION") {
    add(
      "creac_order",
      "Move case explanation before client-fact application.",
      "In CREAC, case illustrations explain the rule before you apply it to the current facts.",
      "warning"
    );
  } else if (badgeKey === "INFO_MOSTLY_UNCLASSIFIED") {
    add(
      "unclear_structure",
      "Make the structural role of the paragraph clearer.",
      "Add explicit legal-writing signals if this paragraph is meant to do IRAC/CREAC work.",
      "info"
    );
  } else if (badgeKey === "INFO_INTRODUCTORY") {
    add(
      "roadmap_or_transition",
      "Likely roadmap or transition.",
      "This may be fine if it is only introducing the analysis; the next paragraph should carry the rule/application work.",
      "info"
    );
  }

  if (sentencesData.some((s) => s.blend)) {
    add(
      "blend",
      "Split blended rule/application sentences.",
      "Separate abstract law from fact-specific analysis so each sentence has one structural job.",
      "warning"
    );
  }

  if (sentencesData.some((s) => s.confidence_label === "low")) {
    add(
      "low_confidence",
      "Review low-confidence highlights.",
      "The tool is least certain about one or more sentences; use the hover explanation as a prompt, not a verdict.",
      "info"
    );
  }

  if (sentencesData.some((s) => s.counterargument)) {
    add(
      "counterargument_needs_response",
      "Answer the opposing argument.",
      "A counterargument is useful only if the paragraph responds with rule-based application to the current facts.",
      "warning"
    );
  }

  const ruleCount =
    labels.filter((l) => l === "RULE").length + labels.filter((l) => l === "EXPLANATION").length;
  if (ruleCount >= 3 && !labelSet.has("APPLICATION")) {
    add(
      "rule_dump",
      "Rule dump risk.",
      "Several sentences state law without applying it. Add facts-to-rule reasoning after the rule statement.",
      "warning"
    );
  }

  if (labelSet.has("APPLICATION") && !labelSet.has("RULE") && !labelSet.has("EXPLANATION")) {
    add(
      "unsupported_application",
      "Application needs a legal anchor.",
      "Facts should be tied to a stated statute, doctrine, element, or case rule.",
      "warning"
    );
  }

  if (
    framework === "CREAC" &&
    !labelSet.has("EXPLANATION") &&
    labelSet.has("RULE") &&
    labelSet.has("APPLICATION")
  ) {
    add(
      "unsupported_case_illustration",
      "Consider adding case explanation if CREAC is expected.",
      "A CREAC paragraph normally uses precedent reasoning between the rule and current-fact application.",
      "info"
    );
  }

  if (crossParaNote) {
    add(
      "cross_paragraph_split",
      "Rule and application may be split across paragraphs.",
      crossParaNote,
      "info"
    );
  }

  return priorities.slice(0, 5);
}

export function trainingSummary(badgeKey, badgeLabel, score, priorities) {
  if (badgeKey.startsWith("COMPLETE") && !priorities.some((p) => p.severity === "warning")) {
    return (
      `${badgeLabel} with a structure score of ${score}. The paragraph has the core moves; ` +
      "use the highlights to check whether each sentence is doing only one job."
    );
  }
  if (priorities.length) {
    const first = priorities[0];
    return (
      `${badgeLabel} with a structure score of ${score}. First revision priority: ` +
      `${first.title} ${first.detail}`
    );
  }
  return (
    `${badgeLabel} with a structure score of ${score}. Review the sentence-level highlights ` +
    "for the clearest next revision move."
  );
}

/** Compute and attach structure_score / revision_priorities / training_summary. */
export function attachParagraphTrainingFields(para) {
  const framework = para.effective_framework || "IRAC";
  const score = structureScore(para.sentences, para.badge, framework);
  const priorities = revisionPriorities(
    para.sentences,
    para.badge,
    framework,
    para.cross_para_note || ""
  );
  para.structure_score = score;
  para.revision_priorities = priorities;
  para.training_summary = trainingSummary(para.badge, para.badge_label, score, priorities);
}
