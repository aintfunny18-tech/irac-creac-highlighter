// Paragraph-level framework auto-detection (IRAC / CRAC / CREAC).
// Port of the Python `_auto_detect_framework`.

import {
  CONCLUSION_PHRASES,
  EXPLANATION_PHRASES,
  EXPLANATION_REGEX_PATTERNS,
  HEDGE_WORDS,
  ISSUE_PHRASES,
  STRONG_CONCLUSION_STARTERS,
} from "./lexicon.js";
import { containsAny } from "./util.js";

const OPENING_POSITION_RE =
  /\b(?:is|are|was|were|will|would|should|can|cannot)\b.{0,80}\b(?:liable|guilty|enforceable|proper|improper|valid|invalid|satisfied|met|prevail|succeed|fail)\b/;

/**
 * Pick the best paragraph-level analysis mode. Explicit selections are
 * honored (regression scripts); the UI sends AUTO so students never choose.
 */
export function autoDetectFramework(paraText, userFramework) {
  const fw = (userFramework || "AUTO").toUpperCase();
  if (fw === "IRAC" || fw === "CREAC" || fw === "CRAC") return fw;

  const sl = paraText.toLowerCase();
  const firstDot = sl.indexOf(".");
  const firstSent = firstDot > 0 ? sl.slice(0, firstDot) : sl.slice(0, 150);

  const hasIssueOpener =
    ISSUE_PHRASES.some((phrase) => firstSent.includes(phrase)) ||
    /\bwhether\b/.test(firstSent.slice(0, 100));
  if (hasIssueOpener) return "IRAC";

  const hasExplanation =
    EXPLANATION_PHRASES.some((phrase) => sl.includes(phrase)) ||
    EXPLANATION_REGEX_PATTERNS.some((pattern) => pattern.test(paraText));

  const hasOpeningPosition =
    STRONG_CONCLUSION_STARTERS.test(firstSent) ||
    CONCLUSION_PHRASES.some((phrase) => firstSent.includes(phrase)) ||
    Boolean(containsAny(firstSent, HEDGE_WORDS)) ||
    OPENING_POSITION_RE.test(firstSent);

  if (hasOpeningPosition) {
    return hasExplanation ? "CREAC" : "CRAC";
  }
  return "IRAC";
}
