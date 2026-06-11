// Paragraph badge logic and the 0–100 structure score.
// Port of the Python `_compute_badge` and `_structure_score`.

import { SUGGESTIONS } from "./lexicon.js";

/** Return { badge, badgeLabel, suggestion } from observed structure. */
export function computeBadge(sentencesData, framework) {
  const labels = sentencesData.map((s) => s.label);
  const labelSet = new Set(labels);
  const hasBlend = sentencesData.some((s) => s.blend);
  const n = sentencesData.length;

  const hasIssue = labelSet.has("ISSUE");
  const hasRule = labelSet.has("RULE") || labelSet.has("EXPLANATION");
  const hasExplanation = labelSet.has("EXPLANATION");
  const hasApplication = labelSet.has("APPLICATION");
  const hasConclusion = labelSet.has("CONCLUSION");
  const conclusionCount = labels.filter((l) => l === "CONCLUSION").length;

  if (n <= 2 && !hasRule && !hasApplication) {
    return { badge: "INFO_INTRODUCTORY", badgeLabel: "ℹ️ Introductory / Transition", suggestion: "" };
  }
  const onlyIssueUnclassified = [...labelSet].every(
    (l) => l === "ISSUE" || l === "UNCLASSIFIED"
  );
  if (onlyIssueUnclassified && labelSet.has("ISSUE")) {
    return { badge: "INFO_INTRODUCTORY", badgeLabel: "ℹ️ Introductory / Transition", suggestion: "" };
  }

  const unclassifiedCount = labels.filter((l) => l === "UNCLASSIFIED").length;
  if (n > 0 && unclassifiedCount / n > 0.6) {
    return { badge: "INFO_MOSTLY_UNCLASSIFIED", badgeLabel: "❓ Mostly Unclassified", suggestion: "" };
  }

  if (hasExplanation && hasApplication) {
    const firstExpIdx = labels.indexOf("EXPLANATION");
    const lastAppIdxFromEnd = [...labels].reverse().indexOf("APPLICATION");
    if (lastAppIdxFromEnd !== -1 && firstExpIdx !== -1) {
      const lastAppFwd = n - 1 - lastAppIdxFromEnd;
      if (firstExpIdx > lastAppFwd) {
        return {
          badge: "WARNING_EXPLANATION_AFTER_APPLICATION",
          badgeLabel: "⚠️ Structural Disorder: Explanation After Application",
          suggestion: SUGGESTIONS.WARNING_EXPLANATION_AFTER_APPLICATION,
        };
      }
    }
  }

  if (hasBlend) {
    return {
      badge: "WARNING_BLEND",
      badgeLabel: "⚠️ Rule/Application Blend Detected",
      suggestion: SUGGESTIONS.WARNING_BLEND,
    };
  }

  if (hasApplication && !hasRule) {
    return {
      badge: "WARNING_MISSING_RULE",
      badgeLabel: "⚠️ Missing Rule",
      suggestion: SUGGESTIONS.WARNING_MISSING_RULE,
    };
  }

  const firstRuleIdx = labels.findIndex((l) => l === "RULE" || l === "EXPLANATION");
  const firstAppIdx = labels.indexOf("APPLICATION");
  const firstConcIdx = labels.indexOf("CONCLUSION");
  const lastConcIdx = labels.lastIndexOf("CONCLUSION");
  const firstIssueIdx = labels.indexOf("ISSUE");

  if (hasApplication && hasRule && firstRuleIdx !== -1 && firstAppIdx !== -1) {
    if (firstAppIdx < firstRuleIdx) {
      return {
        badge: "WARNING_APPLICATION_WITHOUT_RULE",
        badgeLabel: "⚠️ Application Before Rule",
        suggestion: SUGGESTIONS.WARNING_APPLICATION_WITHOUT_RULE,
      };
    }
  }

  if (hasRule && !hasApplication) {
    return {
      badge: "WARNING_MISSING_APPLICATION",
      badgeLabel: "⚠️ Missing Application",
      suggestion: SUGGESTIONS.WARNING_MISSING_APPLICATION,
    };
  }

  if ((hasRule || hasApplication) && !hasConclusion) {
    return {
      badge: "WARNING_MISSING_CONCLUSION",
      badgeLabel: "⚠️ Missing Conclusion",
      suggestion: SUGGESTIONS.WARNING_MISSING_CONCLUSION,
    };
  }

  if (!(hasRule && hasApplication && hasConclusion)) {
    return { badge: "INFO_MOSTLY_UNCLASSIFIED", badgeLabel: "❓ Mostly Unclassified", suggestion: "" };
  }

  const opensWithConclusion = firstConcIdx === 0;
  const closesWithConclusion =
    lastConcIdx !== -1 && firstAppIdx !== -1 && lastConcIdx > firstAppIdx;

  if (opensWithConclusion && conclusionCount >= 2 && closesWithConclusion) {
    if (hasExplanation) {
      return { badge: "COMPLETE_CREAC", badgeLabel: "✅ CREAC Complete", suggestion: "" };
    }
    return { badge: "COMPLETE_CRAC", badgeLabel: "✅ CRAC Complete", suggestion: "" };
  }

  if (firstConcIdx !== -1 && firstRuleIdx !== -1 && firstConcIdx < firstRuleIdx) {
    return {
      badge: "WARNING_APPLICATION_WITHOUT_RULE",
      badgeLabel: "⚠️ Structural Disorder: Conclusion Before Rule",
      suggestion: SUGGESTIONS.WARNING_APPLICATION_WITHOUT_RULE,
    };
  }

  if (hasIssue && firstIssueIdx !== -1 && firstRuleIdx !== -1 && firstIssueIdx < firstRuleIdx) {
    return { badge: "COMPLETE_IRAC", badgeLabel: "✅ IRAC Complete", suggestion: "" };
  }

  return { badge: "COMPLETE_RAC", badgeLabel: "✅ RAC Complete", suggestion: "" };
}

/** Simple 0–100 structural completeness score for student-facing feedback. */
export function structureScore(sentencesData, badgeKey, framework) {
  const labels = sentencesData.map((s) => s.label);
  const labelSet = new Set(labels);
  const hasRule = labelSet.has("RULE") || labelSet.has("EXPLANATION");
  const hasApplication = labelSet.has("APPLICATION");
  const hasConclusion = labelSet.has("CONCLUSION");
  const hasIssue = labelSet.has("ISSUE");
  const hasExplanation = labelSet.has("EXPLANATION");
  const conclusionCount = labels.filter((l) => l === "CONCLUSION").length;

  let score = 0;
  if (framework === "IRAC") {
    score += hasIssue ? 20 : 10;
    score += hasRule ? 25 : 0;
    score += hasApplication ? 30 : 0;
    score += hasConclusion ? 25 : 0;
  } else if (framework === "CREAC") {
    score += conclusionCount >= 2 ? 20 : hasConclusion ? 10 : 0;
    score += hasRule ? 20 : 0;
    score += hasExplanation ? 20 : 0;
    score += hasApplication ? 25 : 0;
    score += badgeKey === "COMPLETE_CREAC" ? 15 : 0;
  } else {
    score += conclusionCount >= 2 ? 25 : hasConclusion ? 10 : 0;
    score += hasRule ? 30 : 0;
    score += hasApplication ? 30 : 0;
    score += badgeKey === "COMPLETE_CRAC" ? 15 : 0;
  }

  if (badgeKey.startsWith("COMPLETE")) {
    score = Math.max(score, 92);
  } else if (badgeKey.startsWith("WARNING")) {
    score = Math.min(score, 78);
  } else if (badgeKey === "INFO_MOSTLY_UNCLASSIFIED") {
    score = Math.min(score, 45);
  }

  const blendPenalty = sentencesData.some((s) => s.blend) ? 10 : 0;
  const lowConfCount = sentencesData.filter((s) => s.confidence_label === "low").length;
  const lowConfPenalty = Math.min(12, 4 * lowConfCount);
  return Math.max(0, Math.min(100, score - blendPenalty - lowConfPenalty));
}
