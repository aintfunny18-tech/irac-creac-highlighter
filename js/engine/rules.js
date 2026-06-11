// Per-sentence classification.
//
// The Python engine's 242-line `_classify_sentence` is restructured here as an
// ordered table of named rules — first match wins, exactly preserving the
// original priority order:
//
//   structural section labels → ISSUE → counterargument → CRAC/CREAC opening
//   conclusion → strong conclusion starters → pre-rule conclusion checks →
//   early CREAC explanation → APPLICATION → CREAC explanation → RULE →
//   CONCLUSION → UNCLASSIFIED
//
// Each rule carries a stable `id` and a student-facing `explanation` used by
// the UI tooltip. The `label` + `trigger` outputs stay in parity with the
// Python golden corpus.

import {
  APPLICATION_PHRASES,
  APPLICATION_START_PHRASES,
  BECAUSE_FACT_RE,
  CASE_SPECIFIC_FACT_RE,
  CONCLUSION_PHRASES,
  CONDITIONAL_RULE_RE,
  COUNTERARGUMENT_RE,
  DEFINITIONAL_RE,
  EXPLANATION_PHRASES,
  EXPLANATION_REGEX_PATTERNS,
  FACTUAL_VERBS,
  GENERIC_SUBJECT_RE,
  HEDGE_WORDS,
  ISSUE_PHRASES,
  LEGAL_VOCAB_TERMS,
  PRONOUN_AUX_RE,
  PRONOUN_SUBJECT_RE,
  RULE_REGEX_PATTERNS,
  RULE_STANDARD_PHRASES,
  SECTION_PREFIX_RE,
  SPECIFIC_LEGAL_OUTCOME_RE,
  STRONG_CONCLUSION_STARTERS,
  STRUCT_LABEL_RE,
} from "./lexicon.js";
import { hasCitation, RULE_CITATION_PATTERNS } from "./citations.js";
import {
  CITE_GUARDED_APPLICATION_PHRASES,
  isRuleFramedSentence,
} from "./lexicon-subjects.js";
import { containsAny, startsWithAny, words } from "./util.js";

// ---------------------------------------------------------------------------
// Shared signal helpers
// ---------------------------------------------------------------------------

/** Detect opposing-position frames without creating a new IRAC label. */
export function isCounterargument(sentence) {
  return COUNTERARGUMENT_RE.test(sentence);
}

/**
 * Count rule signals: returns { total, strong, trigger }.
 * Five categories, each contributing at most 1 point; legal vocabulary is the
 * only "weak" signal (cannot satisfy the 1-signal fallback alone).
 */
export function countRuleSignals(sentence, sentenceLower) {
  let total = 0;
  let strong = 0;
  let trigger = "";

  // Signal 1: citation
  if (hasCitation(sentence)) {
    total += 1;
    strong += 1;
    trigger = trigger || "[citation]";
  }

  // Signal 2: exact standard phrase
  const matched = containsAny(sentenceLower, RULE_STANDARD_PHRASES);
  if (matched) {
    total += 1;
    strong += 1;
    trigger = trigger || matched;
  }

  // Signal 3: flexible regex pattern (e.g. "courts have further held")
  if (!matched) {
    for (const pat of RULE_REGEX_PATTERNS) {
      if (pat.test(sentence)) {
        total += 1;
        strong += 1;
        trigger = trigger || pat.source.slice(0, 30);
        break;
      }
    }
  }

  // Signal 4: legal vocabulary (weak)
  const legalTerm = containsAny(sentenceLower, LEGAL_VOCAB_TERMS);
  if (legalTerm) {
    total += 1;
    trigger = trigger || legalTerm;
  }

  // Signal 5: structural cue — generic subject, definitional, or conditional
  if (GENERIC_SUBJECT_RE.test(sentence)) {
    total += 1;
    strong += 1;
    trigger = trigger || "[generic legal subject]";
  } else if (DEFINITIONAL_RE.test(sentence)) {
    total += 1;
    strong += 1;
    trigger = trigger || "[definitional structure]";
  } else if (CONDITIONAL_RULE_RE.test(sentence)) {
    total += 1;
    strong += 1;
    trigger = trigger || "[conditional rule structure]";
  }

  return { total, strong, trigger };
}

// ---------------------------------------------------------------------------
// Rule table
// ---------------------------------------------------------------------------

const EMBEDDED_WHETHER_RE = /\b(?:question|issue|inquiry|problem)\b.{0,60}\bwhether\b/;
const CONCLUSION_ADVERB_RE = /\b(?:therefore|thus|accordingly|hence)\b/;
const THE_COURT_SHOULD_RE = /^the\b.{0,30}\bcourt\s+should\b/;
const MOST_LIKELY_RE = /\bmost\s+likely\b/;
const GENERIC_INDEFINITE_RE =
  /\b(?:a|an)\s+(?:defendant|plaintiff|party|person|individual|court|courts)\b/;
const COURTS_RULE_FRAME_RE =
  /^courts?\s+(?:apply|require|hold|have|recognize|employ|use|analyze|consider|balance|weigh)\b/;
const IT_HAS_NO_RE = /^it\s+has\s+(?:no|never|not)\b/;
const THE_COURT_OPENER_RE = /^the\s+court\b/;
const CLAIM_FAILS_RE = /\bclaims?\b.{0,80}\bfails?\b/;
const WHETHER_OPENER_RE = /^whether\b/;
const WHETHER_AFTER_INTRO_RE = /^[^,]{0,30},\s*whether\b/;

function findExplanationTrigger(s, sl) {
  const trigger = containsAny(sl, EXPLANATION_PHRASES);
  if (trigger) return trigger;
  for (const pattern of EXPLANATION_REGEX_PATTERNS) {
    if (pattern.test(s)) return "[case illustration]";
  }
  return null;
}

/**
 * Ordered rule table. Each rule:
 *   { id, explanation, match(ctx) → { label, trigger } | null }
 * ctx = { s, sl, idx, total, framework, partyNames }
 * (s/sl may have an "Issue:" prefix stripped by the section-label rule.)
 */
export const SENTENCE_RULES = [
  {
    id: "section-label",
    explanation:
      "This sentence carries an explicit section label, so the tool treats the label as authoritative.",
    match(ctx) {
      const m = STRUCT_LABEL_RE.exec(ctx.s);
      if (!m) return null;
      const lblWord = m.groups.lbl.toLowerCase();
      if (lblWord.startsWith("rule")) return { label: "RULE", trigger: "[section label: Rule]" };
      if (lblWord.startsWith("application") || lblWord.startsWith("analysis")) {
        return { label: "APPLICATION", trigger: "[section label: Application/Analysis]" };
      }
      if (lblWord.startsWith("conclusion")) {
        return { label: "CONCLUSION", trigger: "[section label: Conclusion]" };
      }
      if (lblWord.startsWith("issue")) {
        // Strip the prefix and continue ISSUE detection on the remaining text.
        ctx.s = ctx.s.slice(m[0].length).trim();
        ctx.sl = ctx.s.toLowerCase();
        if (!ctx.s) return { label: "ISSUE", trigger: "[section label: Issue]" };
      }
      return null;
    },
  },
  {
    id: "issue.question-mark",
    explanation:
      "It ends with a question mark and does not read like a rule statement — classic issue framing.",
    match(ctx) {
      if (!ctx.s.endsWith("?")) return null;
      // Rhetorical questions embedded in rule statements fall through.
      const preCite = RULE_CITATION_PATTERNS.some((pat) => pat.test(ctx.s));
      if (!preCite && !GENERIC_SUBJECT_RE.test(ctx.s)) {
        return { label: "ISSUE", trigger: "?" };
      }
      return null;
    },
  },
  {
    id: "issue.phrase",
    explanation:
      "It uses classic issue-framing language that tells the reader what legal question the paragraph will answer.",
    match(ctx) {
      const trigger = containsAny(ctx.sl, ISSUE_PHRASES);
      return trigger ? { label: "ISSUE", trigger } : null;
    },
  },
  {
    id: "issue.whether-opener",
    explanation:
      "Opening with “whether” frames the legal question — the signature move of an issue statement.",
    match(ctx) {
      if (WHETHER_OPENER_RE.test(ctx.sl) || WHETHER_AFTER_INTRO_RE.test(ctx.sl)) {
        return { label: "ISSUE", trigger: "whether" };
      }
      return null;
    },
  },
  {
    id: "issue.embedded-whether",
    explanation:
      "A question noun followed by “whether” frames the legal question this paragraph answers.",
    match(ctx) {
      if (
        EMBEDDED_WHETHER_RE.test(ctx.sl) &&
        !CONCLUSION_ADVERB_RE.test(ctx.sl)
      ) {
        return { label: "ISSUE", trigger: "whether" };
      }
      return null;
    },
  },
  {
    id: "application.counterargument",
    explanation:
      "It frames an opposing party's position — counterargument work belongs to the application step.",
    match(ctx) {
      if (isCounterargument(ctx.s)) {
        return { label: "APPLICATION", trigger: "[opposing-position signal]" };
      }
      return null;
    },
  },
  {
    id: "conclusion.crac-opener",
    explanation:
      "In CRAC, the paragraph opens by asserting the conclusion before stating the rule.",
    match(ctx) {
      if (ctx.framework !== "CRAC" || ctx.idx !== 0 || ctx.total <= 1) return null;
      if (!hasCitation(ctx.s) && !containsAny(ctx.sl, RULE_STANDARD_PHRASES)) {
        if (!SECTION_PREFIX_RE.test(ctx.s)) {
          return { label: "CONCLUSION", trigger: "[CRAC opening conclusion]" };
        }
      }
      return null;
    },
  },
  {
    id: "conclusion.creac-opener",
    explanation:
      "In CREAC, the paragraph opens with a (often hedged) position statement — the opening conclusion.",
    match(ctx) {
      if (ctx.framework !== "CREAC" || ctx.idx !== 0 || ctx.total <= 1) return null;
      if (!hasCitation(ctx.s) && !GENERIC_SUBJECT_RE.test(ctx.s)) {
        if (!SECTION_PREFIX_RE.test(ctx.s)) {
          if (containsAny(ctx.sl, HEDGE_WORDS) || !containsAny(ctx.sl, RULE_STANDARD_PHRASES)) {
            return { label: "CONCLUSION", trigger: "[CREAC opening conclusion]" };
          }
        }
      }
      return null;
    },
  },
  {
    id: "conclusion.strong-starter",
    explanation:
      "Starting with a conclusion adverb (Therefore, Thus, Accordingly…) announces the outcome of the analysis.",
    match(ctx) {
      if (STRONG_CONCLUSION_STARTERS.test(ctx.sl)) {
        return { label: "CONCLUSION", trigger: words(ctx.sl)[0] };
      }
      return null;
    },
  },
  {
    id: "conclusion.the-court-should",
    explanation:
      "“The court should …” asks for a specific result in this case — a conclusion, not a general rule.",
    match(ctx) {
      if (THE_COURT_SHOULD_RE.test(ctx.sl)) {
        return { label: "CONCLUSION", trigger: "the court should" };
      }
      return null;
    },
  },
  {
    id: "conclusion.most-likely",
    explanation:
      "“Most likely” signals a predicted outcome for these parties rather than an abstract rule.",
    match(ctx) {
      if (MOST_LIKELY_RE.test(ctx.sl) && !GENERIC_INDEFINITE_RE.test(ctx.sl)) {
        return { label: "CONCLUSION", trigger: "most likely" };
      }
      return null;
    },
  },
  {
    id: "explanation.early-creac",
    explanation:
      "It illustrates how a precedent court applied the rule — the Explanation step of CREAC.",
    match(ctx) {
      if (ctx.framework !== "CREAC") return null;
      const trigger = findExplanationTrigger(ctx.s, ctx.sl);
      return trigger ? { label: "EXPLANATION", trigger } : null;
    },
  },
  {
    id: "application.start-phrase",
    explanation:
      "It opens with a fact-application signpost (“Here,” / “Applying the …”) that turns from law to these facts.",
    match(ctx) {
      const trigger = startsWithAny(ctx.sl, APPLICATION_START_PHRASES);
      return trigger ? { label: "APPLICATION", trigger } : null;
    },
  },
  {
    id: "application.phrase-opener",
    explanation:
      "It opens with application language connecting the rule to the specific facts of this case.",
    match(ctx) {
      const trigger = startsWithAny(ctx.sl, APPLICATION_PHRASES);
      return trigger ? { label: "APPLICATION", trigger } : null;
    },
  },
  {
    id: "application.phrase",
    explanation:
      "It contains application language connecting the rule to the specific facts of this case.",
    match(ctx) {
      const trigger = containsAny(ctx.sl, APPLICATION_PHRASES);
      if (!trigger) return null;
      // Guard 1: "Courts apply/require…" is a rule-invoking frame.
      const courtsRuleFrame = COURTS_RULE_FRAME_RE.test(ctx.sl);
      // Guard 2: doctrinal-test wording embedded in a citation-bearing rule
      // statement ("Under Rule 13(a)(1), a counterclaim is compulsory if it
      // arises out of the same transaction…") states the rule, not its
      // application. See lexicon-subjects.js.
      const citedRuleFrame =
        CITE_GUARDED_APPLICATION_PHRASES.has(trigger) &&
        hasCitation(ctx.s) &&
        (isRuleFramedSentence(ctx.sl) ||
          GENERIC_SUBJECT_RE.test(ctx.s) ||
          ["is an adequate", "is not an adequate", "is amenable"].includes(trigger));
      if (courtsRuleFrame || citedRuleFrame) {
        return null; // fall through to RULE detection
      }
      return { label: "APPLICATION", trigger };
    },
  },
  {
    id: "application.it-has-no",
    explanation:
      "“It has no …” asserts a concrete fact about a specific party — fact application, not abstract law.",
    match(ctx) {
      if (IT_HAS_NO_RE.test(ctx.sl)) {
        return { label: "APPLICATION", trigger: "it has no" };
      }
      return null;
    },
  },
  {
    id: "application.case-specific-fact",
    explanation:
      "Its subject is a case-specific item (the motion, the contract, the conduct…) doing factual work.",
    match(ctx) {
      if (
        CASE_SPECIFIC_FACT_RE.test(ctx.sl) &&
        !(ctx.idx === ctx.total - 1 && containsAny(ctx.sl, CONCLUSION_PHRASES))
      ) {
        return { label: "APPLICATION", trigger: "[case-specific fact]" };
      }
      return null;
    },
  },
  {
    id: "application.specific-outcome",
    explanation:
      "It evaluates how the legal standard comes out on these specific facts — application work.",
    match(ctx) {
      if (
        SPECIFIC_LEGAL_OUTCOME_RE.test(ctx.s) &&
        !(ctx.idx === ctx.total - 1 && containsAny(ctx.sl, CONCLUSION_PHRASES))
      ) {
        return { label: "APPLICATION", trigger: "[specific legal outcome]" };
      }
      return null;
    },
  },
  {
    id: "application.causal",
    explanation:
      "“Because [specific facts] …” ties concrete facts to a legal consequence — the heart of application.",
    match(ctx) {
      if (BECAUSE_FACT_RE.test(ctx.sl) && FACTUAL_VERBS.test(ctx.sl)) {
        return { label: "APPLICATION", trigger: "[causal application]" };
      }
      return null;
    },
  },
  {
    id: "application.pronoun-fact",
    explanation:
      "A pronoun subject plus a factual verb continues the fact-application thread from the prior sentence.",
    match(ctx) {
      if (
        PRONOUN_SUBJECT_RE.test(ctx.sl) &&
        !PRONOUN_AUX_RE.test(ctx.sl) &&
        FACTUAL_VERBS.test(ctx.sl)
      ) {
        return { label: "APPLICATION", trigger: "[pronoun + factual verb]" };
      }
      return null;
    },
  },
  {
    id: "application.party-fact",
    explanation:
      "It describes what a party in this case did — applying the law to these specific facts.",
    match(ctx) {
      if (!ctx.partyNames.size || hasCitation(ctx.s)) return null;
      for (const name of ctx.partyNames) {
        if (!ctx.s.includes(name)) continue;
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        // Past-tense / perfect auxiliaries signal fact narration, not application.
        if (new RegExp(`\\b${escaped}\\s+(?:was|were|had)\\b`, "i").test(ctx.s)) continue;
        // Pure role descriptions ("Name is a defendant") are narration too.
        if (new RegExp(`\\b${escaped}\\s+(?:is|are)\\s+(?:a|an)\\s`, "i").test(ctx.s)) continue;
        if (FACTUAL_VERBS.test(ctx.sl)) {
          return { label: "APPLICATION", trigger: `[party: ${name}]` };
        }
      }
      return null;
    },
  },
  {
    id: "explanation.creac",
    explanation:
      "It explains how a precedent court reasoned — the Explanation step that supports the rule in CREAC.",
    match(ctx) {
      if (ctx.framework !== "CREAC") return null;
      const trigger = findExplanationTrigger(ctx.s, ctx.sl);
      if (!trigger) return null;
      const hasCite = hasCitation(ctx.s);
      const isCourtContinuation = THE_COURT_OPENER_RE.test(ctx.sl);
      const isNamedCaseIllustration = trigger === "[case illustration]";
      if (hasCite || isCourtContinuation || isNamedCaseIllustration) {
        return { label: "EXPLANATION", trigger };
      }
      return null;
    },
  },
  {
    id: "rule.signals",
    explanation:
      "It states the governing legal standard in general terms (citations, standard phrases, or a generic legal subject).",
    match(ctx) {
      const { total, strong, trigger } = countRuleSignals(ctx.s, ctx.sl);
      // A hedged final sentence with no strong rule anchor (no citation, no
      // standard phrase, no court-practice pattern, no generic subject) is a
      // predicted outcome, not a rule — even if it has definitional shape
      // ("The promise is likely unenforceable…"). Let conclusion rules take it.
      const hedgedFinalOutcome =
        ctx.idx === ctx.total - 1 &&
        Boolean(containsAny(ctx.sl, HEDGE_WORDS)) &&
        !hasCitation(ctx.s) &&
        !containsAny(ctx.sl, RULE_STANDARD_PHRASES) &&
        !RULE_REGEX_PATTERNS.some((p) => p.test(ctx.s)) &&
        !GENERIC_SUBJECT_RE.test(ctx.s);
      if (hedgedFinalOutcome) return null;
      if (total >= 2) return { label: "RULE", trigger };
      // 1-signal fallback: only when the signal is strong (not just vocab).
      if (total === 1 && strong >= 1) {
        if (
          hasCitation(ctx.s) ||
          trigger === "[generic legal subject]" ||
          ![...ctx.partyNames].some((name) => ctx.s.includes(name))
        ) {
          return { label: "RULE", trigger };
        }
      }
      return null;
    },
  },
  {
    id: "conclusion.phrase",
    explanation:
      "It uses outcome language stating who likely wins, loses, or satisfies the standard.",
    match(ctx) {
      const trigger =
        startsWithAny(ctx.sl, CONCLUSION_PHRASES) || containsAny(ctx.sl, CONCLUSION_PHRASES);
      return trigger ? { label: "CONCLUSION", trigger } : null;
    },
  },
  {
    id: "conclusion.claim-fails",
    explanation: "It announces that a claim fails — a bottom-line outcome statement.",
    match(ctx) {
      if (CLAIM_FAILS_RE.test(ctx.sl)) {
        return { label: "CONCLUSION", trigger: "claim fails" };
      }
      return null;
    },
  },
  {
    id: "conclusion.final-hedge",
    explanation:
      "It closes the paragraph with hedged outcome language (likely, probably…) — a conclusion move.",
    match(ctx) {
      if (ctx.idx === ctx.total - 1) {
        const hedge = containsAny(ctx.sl, HEDGE_WORDS);
        if (hedge) {
          return { label: "CONCLUSION", trigger: `[final sentence + hedge: ${hedge}]` };
        }
      }
      return null;
    },
  },
];

/** Map from rule id → explanation (used by the UI for tooltips). */
export const RULE_EXPLANATIONS = Object.fromEntries(
  SENTENCE_RULES.map((rule) => [rule.id, rule.explanation])
);

/**
 * Classify one sentence. Returns { label, trigger, ruleId }.
 * Mirrors the Python `_classify_sentence` priority order exactly.
 */
export function classifySentence(sentence, idxInPara, totalInPara, framework, partyNames) {
  const ctx = {
    s: sentence.trim(),
    sl: sentence.trim().toLowerCase(),
    idx: idxInPara,
    total: totalInPara,
    framework,
    partyNames,
  };

  for (const rule of SENTENCE_RULES) {
    const result = rule.match(ctx);
    if (result) {
      return { label: result.label, trigger: result.trigger, ruleId: rule.id };
    }
  }
  // Heading-like fragments ("1.", "Negligence — Duty of Care", "Question 2:")
  // get a dedicated explanation instead of the generic unclassified coaching.
  const isHeading =
    /^[\d\s.()]+$/.test(ctx.s) ||
    (words(ctx.s).length <= 8 && (/[:—]$/.test(ctx.s) || !/[.!?]["')\]]*$/.test(ctx.s)));
  if (isHeading) {
    return { label: "UNCLASSIFIED", trigger: "", ruleId: "heading" };
  }
  return { label: "UNCLASSIFIED", trigger: "", ruleId: "unclassified" };
}
