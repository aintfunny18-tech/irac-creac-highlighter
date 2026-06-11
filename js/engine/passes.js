// Secondary classification passes, run in order after the per-sentence rule
// table. Each pass is a pure function (sentencesData) → sentencesData that
// mutates and returns the array, mirroring the Python pipeline:
//
//   detectBlends → smoothByContext → cascadeStructLabels →
//   promoteLastConclusion → inheritStandaloneCitations
//
// Order matters: smoothing only promotes UNCLASSIFIED sentences, the cascade
// overrides smoothing inside struct-labeled blocks, and the final-conclusion
// promotion only fires on what is still UNCLASSIFIED at the end.

import {
  APPLICATION_PHRASES,
  APPLICATION_START_PHRASES,
  CITE_STARTERS,
  GENERIC_SUBJECT_RE,
  LABEL_COLORS,
} from "./lexicon.js";
import { hasCitation } from "./citations.js";
import { escapeRegExp, words } from "./util.js";
import { countRuleSignals } from "./rules.js";

// ---------------------------------------------------------------------------
// Blend detection
// ---------------------------------------------------------------------------

// State-assertion triggers describe specific facts about the case parties —
// these are NOT blends even when a citation is present.
const STATE_ASSERTION_TRIGGERS = new Set([
  "is an adequate",
  "is not an adequate",
  "is amenable",
  "is incorporated",
  "is headquartered",
  "is physically present",
  "is preempted",
  "is not preempted",
  "does not directly conflict",
  "directly conflicts",
  "arises directly from",
  "arises from the same",
  "arises out of the same",
  "same operative facts",
]);

const AND_HERE_RE = /\b(?:and|but|because)\s+here\s+[A-Z]?/i;

/** Mark sentences that mix incompatible structural signals. */
export function detectBlends(sentencesData) {
  for (const sent of sentencesData) {
    const label = sent.label;
    const sl = sent.text.toLowerCase();
    const hasCite = hasCitation(sent.text);

    if (label === "RULE") {
      // Rule sentence that also has an application trigger at clause start.
      for (const phrase of [...APPLICATION_START_PHRASES, ...APPLICATION_PHRASES]) {
        if (new RegExp(`(?:^|[;,]\\s)${escapeRegExp(phrase)}`).test(sl)) {
          sent.blend = true;
          sent.blend_type = "RULE+APPLICATION";
          sent.trigger_phrase = sent.trigger_phrase || phrase;
          break;
        }
      }
      if (!sent.blend && AND_HERE_RE.test(sent.text)) {
        sent.blend = true;
        sent.blend_type = "RULE+APPLICATION";
        sent.trigger_phrase = sent.trigger_phrase || "here";
      }
    } else if (label === "APPLICATION") {
      const trig = sent.trigger_phrase || "";
      if (STATE_ASSERTION_TRIGGERS.has(trig)) {
        // state assertions don't constitute blends
      } else if (GENERIC_SUBJECT_RE.test(sent.text) && hasCite) {
        sent.blend = true;
        sent.blend_type = "RULE+APPLICATION";
        sent.trigger_phrase = sent.trigger_phrase || "[citation in application]";
      } else if (GENERIC_SUBJECT_RE.test(sent.text) && words(sent.text).length > 40) {
        // Long sentence with a generic legal subject embedded → blend.
        sent.blend = true;
        sent.blend_type = "RULE+APPLICATION";
        sent.trigger_phrase = sent.trigger_phrase || "[generic legal subject in application]";
      }
    }
  }
  return sentencesData;
}

// ---------------------------------------------------------------------------
// Context smoothing
// ---------------------------------------------------------------------------

const SKIP_PREV = new Set(["UNCLASSIFIED", "CONCLUSION", "ISSUE", "EXPLANATION"]);
const SKIP_NEXT = new Set(["UNCLASSIFIED", "ISSUE", "EXPLANATION"]);
const PROMOTE_TO_APP = new Set([
  "RULE|APPLICATION",
  "APPLICATION|RULE",
  "RULE|CONCLUSION", // core IRAC: between R and C must be A
  "APPLICATION|CONCLUSION",
]);

/**
 * Promote UNCLASSIFIED sentences when the closest labeled neighbor on EACH
 * side agrees (same label, or an IRAC-compatible cross-label pair). Only
 * promotes to RULE or APPLICATION; never demotes existing labels.
 */
export function smoothByContext(sentencesData) {
  const n = sentencesData.length;
  for (let i = 0; i < n; i++) {
    if (sentencesData[i].label !== "UNCLASSIFIED") continue;

    let prevLbl = null;
    for (let j = i - 1; j > Math.max(-1, i - 4); j--) {
      if (!SKIP_PREV.has(sentencesData[j].label)) {
        prevLbl = sentencesData[j].label;
        break;
      }
    }
    let nextLbl = null;
    for (let j = i + 1; j < Math.min(n, i + 4); j++) {
      if (!SKIP_NEXT.has(sentencesData[j].label)) {
        nextLbl = sentencesData[j].label;
        break;
      }
    }

    if (prevLbl && nextLbl) {
      let target;
      if (prevLbl === nextLbl && (prevLbl === "RULE" || prevLbl === "APPLICATION")) {
        target = prevLbl;
      } else if (PROMOTE_TO_APP.has(`${prevLbl}|${nextLbl}`)) {
        target = "APPLICATION";
      } else {
        continue;
      }
      sentencesData[i].label = target;
      sentencesData[i].color_hex = LABEL_COLORS[target];
      sentencesData[i].trigger_phrase = "[context: neighbor smoothing]";
    }
  }
  return sentencesData;
}

// ---------------------------------------------------------------------------
// Paragraph structural label cascade
// ---------------------------------------------------------------------------

/**
 * Cascade structural section labels (Rule:, Analysis:, Conclusion:) across the
 * sentences that follow them, so an "Analysis:" header re-labels subsequent
 * unlabeled sentences as APPLICATION until the next section marker. ISSUE
 * sections are never cascaded; genuine ISSUE sentences are never overridden.
 */
export function cascadeStructLabels(sentencesData) {
  if (!sentencesData.length) return sentencesData;

  const hasStructLabel = sentencesData.some((sd) =>
    (sd.trigger_phrase || "").startsWith("[section label:")
  );
  if (!hasStructLabel) return sentencesData;

  let currentCascade = null;

  for (const sd of sentencesData) {
    const trig = sd.trigger_phrase || "";
    if (trig.startsWith("[section label:")) {
      const newLbl = sd.label;
      currentCascade = newLbl === "ISSUE" ? null : newLbl;
      continue; // this sentence is already correctly labeled
    }

    if (currentCascade === null) continue;
    if (sd.label === "ISSUE") continue;

    if (sd.label !== currentCascade) {
      sd.label = currentCascade;
      sd.color_hex = LABEL_COLORS[currentCascade];
      sd.trigger_phrase = `[para cascade: ${currentCascade.toLowerCase()}]`;
    }
  }
  return sentencesData;
}

// ---------------------------------------------------------------------------
// Final-sentence conclusion promotion
// ---------------------------------------------------------------------------

/**
 * If the last sentence is UNCLASSIFIED, has no citation and no strong rule
 * signal, and RULE/APPLICATION content appeared earlier in the paragraph,
 * promote it to CONCLUSION. Handles closing assertions with no signposts.
 */
export function promoteLastConclusion(sentencesData) {
  if (!sentencesData.length) return sentencesData;
  const last = sentencesData[sentencesData.length - 1];
  if (last.label !== "UNCLASSIFIED") return sentencesData;

  const priorLabels = new Set(sentencesData.slice(0, -1).map((s) => s.label));
  if (!priorLabels.has("RULE") && !priorLabels.has("APPLICATION")) return sentencesData;

  if (hasCitation(last.text)) return sentencesData;
  if (/^whether\b/i.test(last.text)) return sentencesData;
  const { strong } = countRuleSignals(last.text, last.text.toLowerCase());
  if (strong > 0) return sentencesData;
  if (words(last.text).length < 4) return sentencesData;

  last.label = "CONCLUSION";
  last.color_hex = LABEL_COLORS.CONCLUSION;
  last.trigger_phrase = "[final sentence, no strong rule signal]";
  return sentencesData;
}

// ---------------------------------------------------------------------------
// Standalone citation inheritance
// ---------------------------------------------------------------------------

/**
 * Standalone citation sentences (UNCLASSIFIED, with a citation signal, short
 * or starting with "See"/"Id.") inherit the label of the preceding labeled
 * sentence so they share the same highlight color.
 */
export function inheritStandaloneCitations(sentencesData) {
  let prevKnownLabel = null;
  for (const sd of sentencesData) {
    if (sd.label !== "UNCLASSIFIED") {
      prevKnownLabel = sd.label;
    } else if (prevKnownLabel !== null) {
      const ws = words(sd.text);
      const isShortCite = ws.length <= 15 && hasCitation(sd.text);
      const isSeeCite = CITE_STARTERS.test(sd.text) && hasCitation(sd.text);
      if (isShortCite || isSeeCite) {
        sd.label = prevKnownLabel;
        sd.color_hex = LABEL_COLORS[prevKnownLabel];
        sd.trigger_phrase = "[standalone citation — inherits preceding label]";
      }
    }
  }
  return sentencesData;
}
