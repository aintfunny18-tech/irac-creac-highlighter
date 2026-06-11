// Subject-specific lexicon refinements.
//
// The original classifier was tuned against a CivPro exam corpus, and several
// CivPro phrases ("common nucleus", "arises out of the same") landed in the
// global APPLICATION list even though the same words appear inside RULE
// statements ("…a counterclaim is compulsory if it arises out of the same
// transaction or occurrence…"). This module de-overfits those phrases by
// declaring WHERE they may fire instead of deleting them:
//
//  - CITE_GUARDED_APPLICATION_PHRASES only count as application when the
//    sentence is NOT framed as a rule. A sentence that opens with
//    "Under <authority>," or "Courts apply…" and carries a citation is
//    stating the rule that contains those words, not applying it.
//
// Phrases stay listed in lexicon.js APPLICATION_PHRASES so that unguarded
// uses ("Both claims arise from the same project…") still classify as
// application.

// Doctrinal-test wording that appears verbatim inside rule statements.
export const CITE_GUARDED_APPLICATION_PHRASES = new Set([
  // From the original Python engine (state assertions inside cited rules)
  "is an adequate",
  "is not an adequate",
  "is amenable",
  // CivPro joinder / supplemental jurisdiction tests
  "same operative facts",
  "same transaction or occurrence",
  "same case or controversy",
  "logical relationship",
  "common nucleus",
  "arises directly from",
  "arises from the same",
  "arises out of the same",
  // Erie / preemption test wording
  "does not directly conflict",
  "directly conflicts",
  "is preempted",
  "is not preempted",
  "for erie purposes",
]);

/**
 * True when the sentence is framed as a rule statement: it opens by invoking
 * an authority ("Under Fed. R. Civ. P. 13(a)(1), …", "Pursuant to § 1367, …")
 * or describes what courts do ("Courts apply the logical relationship test").
 * Callers combine this with a citation check before suppressing an
 * application phrase.
 */
const UNDER_AUTHORITY_OPENER = /^(?:under|pursuant\s+to)\b/;

export function isRuleFramedSentence(sentenceLower) {
  return UNDER_AUTHORITY_OPENER.test(sentenceLower);
}
