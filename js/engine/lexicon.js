// Lexicon: every phrase list, regex, and constant the classifier uses.
// Data only — no logic. Ported 1:1 from the archived Python constants
// (archive/flask-app/app/constants.py); regex sources are kept byte-identical
// where the engine slices `pattern.source` into trigger text.
//
// NOTE on regex flags: the Python engine mixes anchored `re.match` and
// unanchored `re.search`. Every regex here carries its own `^` when the
// Python call site used `match`, so JS call sites can always use .test().

export const MAX_PASTE_BYTES = 50 * 1024;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const STRUCT_LABEL_RE =
  /^(?<lbl>issue|rule|analysis|application(?:\s*[—\-]\s*[^:]{0,60})?|conclusion)\s*:\s*/i;

// ---------------------------------------------------------------------------
// Phrase lists
// ---------------------------------------------------------------------------

export const ISSUE_PHRASES = [
  "the issue is",
  "the question is",
  "the question presented",
  "the dispositive question",
  "at issue is",
  "at issue are",
  "the dispute is",
  "the dispute centers",
  "the problem is",
  "the central question",
  "the key question",
];

export const RULE_STANDARD_PHRASES = [
  // Court practice (exact; flexible variants handled by RULE_REGEX_PATTERNS)
  "courts have held",
  "courts have found",
  "courts require",
  "courts have recognized",
  "court has held",
  "court has found",
  // Definitional
  "the rule is",
  "the general rule",
  "is defined as",
  "refers to",
  // Elements / standard
  "must show",
  "must establish",
  "must prove",
  "must demonstrate",
  "must be", // "an offer must be sufficiently definite"
  "is required to show",
  "is required to establish",
  "is required to prove",
  "elements of the offense",
  "elements of the crime",
  "elements of the tort",
  "elements of the claim",
  "elements of the contract",
  "elements of the cause",
  "the elements are",
  "the element is",
  "the standard is",
  "the standard for",
  "requires that",
  "is established when",
  "in order to prevail",
  "in order to recover",
  // Statutory / regulatory
  "pursuant to",
  "provides that",
  "prohibits",
  "the act requires",
  "the statute requires",
  "the statute provides",
  "the code provides",
  "the restatement",
  // Generic subject + obligation
  "a plaintiff must",
  "a defendant must",
  "a party must",
  "a claimant must",
  "an individual must",
  "one must",
  "to establish",
  "to prevail on",
  "to succeed on",
  "the test is",
  "the test for",
  // Duty / omission (Crim Law, Torts)
  "duty to",
  "no duty to",
  "creates a duty",
  "owes a duty",
  "owes a duty of",
  "is subject to liability",
  "failure to act",
  "does not constitute",
  "does not satisfy",
  // Causation
  "but for",
  "but-for",
  "proximate cause",
  "actual cause",
  "superseding cause",
  "intervening cause",
  "reasonably foreseeable",
  // Standard of care / negligence
  "standard of care",
  "reasonable person",
  "reasonably prudent",
  "gross deviation",
  "criminal negligence",
  // Constitutional law
  "congress may",
  "congress shall",
  "may regulate",
  "has the power to",
  "rational basis",
  "strict scrutiny",
  "intermediate scrutiny",
  "substantially affect",
  "substantially affects",
  // Exception / qualification structures
  "however, a",
  "however, an",
  "however, the",
  "however, when",
  "generally,",
  "generally there",
  "generally no",
  "as a general rule",
  "as a rule,",
  "ordinarily,",
  "unless",
  "except when",
  "notwithstanding",
  // Conditional rule structures
  "if the defendant",
  "if a defendant",
  "if the plaintiff",
  "if a plaintiff",
  "if a person",
  "when a defendant",
  "when the defendant",
  "where the defendant",
  "where a defendant",
  // Property law
  "runs with the land",
  "touches and concerns",
  // Civil Procedure — Jurisdiction & Erie
  "general jurisdiction",
  "specific jurisdiction",
  "track 1 applies",
  "track 2 applies",
  "under track 1",
  "under track 2",
  "directly and squarely",
  "no federal rule directly",
  "forum non conveniens",
  "is amenable to",
  "is non-waivable",
  "may not be raised",
  "are all waived",
  "if omitted from",
  "receives strong deference",
  "choice of forum",
  "for diversity purposes",
  "for purposes of diversity",
  "essentially at home",
  "preempts conflicting",
  "directly conflicts with",
  "does not directly conflict",
  "no direct collision",
  "does not abridge",
  "is arguably procedural",
  "the federal rule",
  // Passive-voice rule establishment phrases
  "has been upheld",
  "has been established",
  "has been recognized",
  "has been applied",
  // Conditional rule structures (when proper, when applicable)
  "is proper only when",
  "is proper when",
  "is available when",
  "is available only when",
];

// Flexible rule regexes — sources must stay byte-identical to the Python
// patterns because the engine uses `pattern.source.slice(0, 30)` as the
// visible trigger text (parity with Python `pat.pattern[:30]`).
export const RULE_REGEX_PATTERNS = [
  /\bcourts?\s+(?:\w+\s+){0,2}(?:have\s+)?(?:held|found|recognized|ruled|concluded|determined|stated|noted|required|applied|apply)\b/i,
  /\bthe\s+court\s+(?:has\s+)?(?:then\s+)?(?:held|found|recognized|ruled|concluded|determined|stated|noted|required|applies|applied)\b/i,
];

export const EXPLANATION_PHRASES = [
  "the court found that",
  "the court held that",
  "the court determined that",
  "the court concluded that",
  "the court noted that",
  "the court observed that",
  "the court reasoned that",
  "the court reasoned",
  "the court ruled that",
  "the court ruled",
  "the court sustained",
  "the court upheld",
  "the court struck",
  "the court distinguished",
  "the court enforced",
  "the court applied",
  "the court affirmed",
  "the court reversed",
  "the majority reasoned",
  "the dissent reasoned",
  "for example,",
  "for instance,",
  "as in ",
  "similarly, in",
  "by contrast, in",
  "in that case",
  "the plaintiff in that case",
  "the defendant in that case",
  "that court",
];

export const EXPLANATION_REGEX_PATTERNS = [
  /^(?:in|as\s+in|similarly,\s+in|by\s+contrast,\s+in)\s+[A-Z][^,]{1,80},\s+the\s+court\b/i,
];

// Phrases that trigger APPLICATION only when they START a sentence.
export const APPLICATION_START_PHRASES = [
  "here,",
  "here, the",
  "applying the",
];

export const APPLICATION_PHRASES = [
  "in this case,",
  "in the present case,",
  "in the instant case,",
  "in our case,",
  "under these facts,",
  "on these facts,",
  "applying this rule",
  "applying the rule",
  "applying this standard",
  "applying the standard",
  "applying this test",
  "applying the test",
  "the facts here",
  "the facts show",
  "the facts indicate",
  "the facts demonstrate",
  "turning to the facts",
  "based on these facts",
  "based on the facts",
  "looking at the facts",
  "this conduct",
  "this action",
  "this behavior",
  // Specific factual/event nouns at sentence start
  "this breach",
  "this omission",
  "this failure",
  "this delay",
  "this refusal",
  "this neglect",
  "this transfer",
  "this payment",
  "this statement",
  "this agreement",
  "this promise",
  "this decision",
  // CivPro factual nouns
  "this contract",
  "this motion",
  "this notice",
  "this prong",
  "this factor",
  "these factors",
  "these contacts",
  // Factual analysis language common in unlabeled student writing
  "the fact that",
  "is insufficient to",
  "is sufficient to",
  "is an adequate",
  "is not an adequate",
  "objective indicator",
  "in this action",
  "this claim",
  "this counterclaim",
  // State-assertion APPLICATION phrases
  "is physically present",
  "is domiciled",
  "are domiciled",
  "is incorporated",
  "is headquartered",
  "is amenable",
  "does not directly conflict",
  "directly conflicts",
  "is preempted",
  "is not preempted",
  // Counterclaim / supplemental jurisdiction application phrases
  "arises directly from",
  "arises from the same",
  "arises out of the same",
  "same operative facts",
  "same transaction or occurrence",
  "same case or controversy",
  "logical relationship",
  "common nucleus",
  // Forum non conveniens / multi-factor test application
  "factors are mixed",
  "factors strongly favor",
  "do not strongly favor",
  "favor retention",
  "favor dismissal",
  // Erie doctrine application judgment
  "for erie purposes",
  "applies in this",
  "applied in this",
  // Service / exhaustion of process applied to specific party
  "must exhaust",
];

export const CONCLUSION_PHRASES = [
  "therefore,",
  "thus,",
  "accordingly,",
  "for these reasons,",
  "for the foregoing reasons,",
  "in conclusion,",
  "in sum,",
  "in summary,",
  "as a result,",
  "it follows that",
  "a court would likely",
  "a court would probably",
  "the court should",
  "the court will likely",
  "the court is likely to",
  "is likely to prevail",
  "is likely to succeed",
  "is likely to fail",
  "is likely to be liable",
  "is likely to be found",
  "has established",
  "has failed to establish",
  "will likely prevail",
  "will likely succeed",
  "will likely fail",
  "will likely be found",
  "is improbable",
  "is probable",
  // CRAC-style opening / closing assertions
  "satisfies the",
  "does not satisfy",
  "fails to satisfy",
  "is not established",
  "is guilty of",
  "is not guilty",
  "is liable for",
  "is not liable",
  "can be established",
  "cannot be established",
  "so no ",
  "so, no",
  "no actual cause",
  "no proximate cause",
  "causation is not",
  "causation is",
  "element is satisfied",
  "element is not satisfied",
  "elements are satisfied",
  "elements are met",
  "elements are not satisfied",
  "elements are not met",
  "requirement is met",
  "requirement is not met",
  "requirement is satisfied",
  "requirement is not satisfied",
  "claim fails",
  "claims fail",
  "is enforceable",
  "is not enforceable",
  "is unenforceable",
  // CivPro conclusions
  "cannot exercise",
  "may not exercise",
  "lacks jurisdiction",
  "has jurisdiction",
  "is preempted",
  "has been waived",
  // Additional conclusion assertions common in unlabeled student writing
  "is incorrect",
  "argument is wrong",
  "is improper",
  "is not improper",
  "was improper",
  "was not improper",
  "were improper",
  "were not improper",
  "is properly",
  "is not properly",
  // Motion / request disposition
  "should be denied",
];

export const HEDGE_WORDS = [
  "likely",
  "unlikely",
  "probably",
  "improbably",
  "arguably",
  "may",
  "might",
  "could",
  "should",
  "appear",
  "appears",
  "seem",
  "seems",
  "improbable",
  "probable",
];

// Legal terms of art — presence in a sentence is a (weak) rule signal.
export const LEGAL_VOCAB_TERMS = [
  // Criminal Law
  "actus reus", "mens rea", "scienter", "malice aforethought",
  "voluntary act", "involuntary manslaughter", "voluntary manslaughter",
  "first-degree murder", "first degree murder", "second-degree murder",
  "second degree murder", "felony murder",
  "specific intent", "general intent",
  "recklessness", "criminal negligence", "gross negligence",
  "accomplice liability", "conspiracy", "attempt",
  "affirmative defense", "self-defense", "defense of others",
  "insanity defense", "m'naghten", "model penal code",
  // Causation
  "but-for test", "but for test",
  "causal chain", "chain of causation",
  "foreseeability", "unforeseeable",
  "superseding cause", "intervening cause",
  // Torts
  "duty of care", "breach of duty", "proximate cause",
  "compensatory damages", "punitive damages", "negligence per se",
  "res ipsa loquitur", "assumption of risk",
  "battery", "assault", "defamation",
  // Contracts
  "offer and acceptance", "consideration", "breach of contract",
  "promissory estoppel", "statute of frauds", "parol evidence",
  "liquidated damages", "anticipatory repudiation",
  "material terms", "meeting of the minds",
  // Property
  "adverse possession", "fee simple", "easement", "covenant",
  "hostile possession",
  // Constitutional / Federal
  "commerce clause", "due process", "equal protection",
  "first amendment", "fourth amendment", "fifth amendment",
  "fourteenth amendment", "probable cause",
  "reasonable expectation of privacy", "warrantless search",
  "search and seizure", "exclusionary rule",
  "rational basis", "strict scrutiny", "intermediate scrutiny",
  "interstate commerce", "substantial effect",
  // General
  "reasonable doubt", "beyond a reasonable doubt",
  "preponderance of the evidence", "clear and convincing",
  "burden of proof", "burden of persuasion",
  "elements of the offense", "elements of the crime",
  "fiduciary duty", "duty of loyalty", "self-dealing",
  "breach of fiduciary",
  // Civil Procedure
  "personal jurisdiction", "general jurisdiction", "specific jurisdiction",
  "subject matter jurisdiction", "subject-matter jurisdiction",
  "purposeful availment", "minimum contacts", "long-arm statute",
  "forum non conveniens", "adequate alternative forum",
  "diversity jurisdiction", "complete diversity", "amount in controversy",
  "federal question", "supplemental jurisdiction",
  "service of process", "domicile",
  "forum shopping", "outcome determinative", "outcome-determinative",
  "twin aims", "re-examination clause",
  "essentially at home", "continuous and systematic",
  "private interest factors", "public interest factors",
  "abuse of discretion", "de novo review",
  "choice of forum", "forum selection",
  "waiver of jurisdiction", "personal jurisdiction defense",
  "Erie doctrine",
  "impleader", "third-party claim", "third-party defendant",
  "indemnity", "contribution", "subrogation",
];

// ---------------------------------------------------------------------------
// Structural regexes
// ---------------------------------------------------------------------------

// "Because/Since [non-generic subject]" at sentence start → APPLICATION.
export const BECAUSE_FACT_RE =
  /^(?:because|since)\s+(?!a\s+defendant\b|the\s+defendant\b|a\s+plaintiff\b|the\s+plaintiff\b|a\s+person\b|an?\s+individual\b|courts?\b|the\s+law\b|a\s+party\b|generally\b|typically\b|ordinarily\b|such\b)/i;

export const PRONOUN_SUBJECT_RE = /^(?:she|he|they)\s/i;

export const PRONOUN_AUX_RE = /^(?:she|he|they)\s+(?:was|were|had|is|are)\b/i;

export const CASE_SPECIFIC_FACT_RE =
  /^(?:the\s+)?(?:case|action|complaint|motion|notice|transfer|removal|counterclaim|claim|contract|agreement|statement|property|injury|conduct|record|evidence|facts?)\s+(?:was|were|is|are|has|had|did|does|directly|arises|involves|concerns|occurred|resulted|shows?|indicates?|demonstrates?)\b/i;

export const SPECIFIC_LEGAL_OUTCOME_RE =
  /^(?:[A-Z][A-Za-z0-9&.'’\-]*(?:\s+[A-Z][A-Za-z0-9&.'’\-]*){0,8}|the\s+[A-Z][A-Za-z0-9&.'’\-]*(?:\s+[A-Z][A-Za-z0-9&.'’\-]*){0,8})\s+(?:is|are|was|were|has|have|cannot|can|does|do)\b.{0,180}(?:not\s+among|no\s+exceptional\s+circumstances|cannot\s+automatically\s+be\s+imputed|not\s+continuous\s+and\s+systematic|not\s+at\s+home|is\s+at\s+home|is\s+proper|is\s+improper|was\s+proper|was\s+improper|satisf(?:y|ies|ied)|does\s+not\s+satisfy|fails?\s+to\s+satisfy)/i;

// Guard for CRAC/CREAC opening-conclusion heuristic.
export const SECTION_PREFIX_RE = /^(?:analysis|application)\b/i;

export const CITE_STARTERS = /^(?:see\s+also|see|id\.|cf\.|accord|compare)\b/i;

export const COUNTERARGUMENT_RE =
  /\b(?:(?:plaintiff|defendant|petitioner|respondent|appellant|appellee|state|government|prosecution)\s+(?:will|would|may|might|could|can|should|is\s+likely\s+to)\s+(?:argue|contend|claim|assert|respond|counter)|one\s+could\s+argue|one\s+might\s+argue|opposing\s+counsel\s+(?:will|would|may)\s+argue|on\s+the\s+other\s+hand|by\s+contrast|conversely|however,\s+(?:plaintiff|defendant|petitioner|respondent|appellant|appellee)\s+(?:will|would|may|might|could)\s+(?:argue|contend|claim|assert))\b/i;

export const STRONG_CONCLUSION_STARTERS =
  /^(?:therefore|thus|hence|accordingly|in\s+conclusion|for\s+these\s+reasons|for\s+the\s+foregoing\s+reasons|in\s+sum|in\s+summary|as\s+a\s+result)\b/i;

// Generic / hypothetical legal subjects — signals abstract rule statement.
export const GENERIC_SUBJECT_RE =
  /\b(?:a\s+defendant|the\s+defendant|a\s+plaintiff|the\s+plaintiff|a\s+person|an\s+individual|one\s+who|one\s+must|a\s+party|the\s+parties|the\s+law|a\s+fiduciary|the\s+fiduciary|a\s+trustee|the\s+trustee|a\s+claimant|an\s+offeror|an\s+offeree|a\s+promisor|a\s+promisee|an?\s+omission|the\s+offender|the\s+accused|a\s+reasonable\s+person|the\s+reasonable\s+person|a\s+driver|the\s+driver|a\s+corporation|the\s+corporation|corporations|a\s+tortfeasor|an\s+employer|an\s+employee|a\s+landlord|a\s+tenant|a\s+buyer|a\s+seller)\b/i;

// Definitional structure — intentionally case-sensitive (no /i), as in Python.
export const DEFINITIONAL_RE =
  /^(?!This\b|These\b|That\b|Those\b|It\b|He\b|She\b|They\b|We\b|I\b|Here\b|There\b|Each\b|All\b)[A-Z][A-Za-z\s\-]{2,50}\b(?:is|are|means?|refers?\s+to|consists?\s+of|requires?|constitutes?|includes?|encompasses?|prohibits?|permits?|governs?)\b/;

export const CONDITIONAL_RULE_RE = /^(?:if|when|where|whenever)\b.{5,}(?:,|then)\b/i;

// Factual verbs for party-name / application detection (searched on lowercase).
export const FACTUAL_VERBS =
  /\b(?:did|said|acted|was|had|stood|failed|refused|knew|told|made|took|argued|contended|asserted|claimed|alleged|signed|entered|agreed|breached|prepared|delayed|chose|filed|shot|injected|drove|killed|brought|gave|received|sent|wrote|called|used|owned|possessed|committed|attempted|planned|intended|struck|hit|fired|stole|sold|purchased|demanded|threatened|forced|coerced|lied|denied|hid|fled|admitted|confessed|caused|created|allowed|enabled|ignored|neglected|waited|left|stayed|arrived|departed|moved|stopped|erected|maintained|planted|paid|excluded|confirmed|demonstrated|continued|suffered|received|relocated|declined|raised|directed|owed|relied|performed|delivered|dispatched|offered|settled|triggered|forfeited|waived|consolidated|omitted|withheld|published|contradicted|invoked|arises|appealed|remanded|transferred|stipulated|fails|argues|contends|arose|involves|analyzed|pursue|breaching)\b/;

// ---------------------------------------------------------------------------
// Labels, colors, coaching text
// ---------------------------------------------------------------------------

export const LABEL_COLORS = {
  ISSUE: "#EC4899",
  RULE: "#22C55E",
  EXPLANATION: "#A855F7",
  APPLICATION: "#F97316",
  CONCLUSION: "#3B82F6",
  UNCLASSIFIED: "#F3F4F6",
};

export const LABEL_ORDER = [
  "ISSUE",
  "RULE",
  "EXPLANATION",
  "APPLICATION",
  "CONCLUSION",
  "UNCLASSIFIED",
];

export const SUGGESTIONS = {
  WARNING_MISSING_RULE:
    "This paragraph applies facts but does not state the governing legal rule. " +
    "Add a rule statement citing the applicable statute, case, or doctrine before your application.",
  WARNING_MISSING_APPLICATION:
    "This paragraph states a rule but does not apply it to the facts. " +
    "Add a sentence beginning with ‘Here,’ or ‘In this case,’ connecting the rule to the specific facts.",
  WARNING_MISSING_CONCLUSION:
    "This paragraph does not reach a conclusion. " +
    "Add a closing sentence stating the likely legal outcome (e.g., ‘Therefore, [party] is likely to ...’).",
  WARNING_BLEND:
    "One or more sentences appear to mix a legal rule statement with fact-specific application. " +
    "Consider splitting the sentence: state the rule abstractly first, then apply it to the facts in a separate sentence.",
  WARNING_APPLICATION_WITHOUT_RULE:
    "Application language appears before the rule is stated. " +
    "IRAC/CREAC/CRAC requires that you state the governing rule before applying it to the facts.",
  WARNING_EXPLANATION_AFTER_APPLICATION:
    "In CREAC structure, the Explanation (case illustration) should appear before the Application. " +
    "Here, case-level reasoning appears after the fact-specific application, reversing the correct sequence.",
};

// ---------------------------------------------------------------------------
// Party name extraction stopwords
// ---------------------------------------------------------------------------

export const PARTY_NAME_STOPWORDS = new Set([
  // Generic words and articles
  "The", "This", "These", "That", "There", "Here", "Court",
  "However", "Therefore", "Thus", "Accordingly", "Additionally",
  "Furthermore", "Moreover", "Finally", "First", "Second", "Third",
  "Also", "While", "Although", "Because", "Since", "Under",
  "When", "Where", "Whether", "Assuming", "Generally", "Usually",
  "Instead", "Despite", "Nevertheless", "Even",
  // Months
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
  // Days
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  // Common institutional nouns that appear frequently but aren't parties
  "Congress", "State", "Amendment", "Constitution",
  "Act", "Code", "Law", "Part", "Section", "Rule", "Note",
  "Test", "Case", "Fact", "Issue", "Badge",
  // Common case-name words that get picked up by frequency scan
  "United", "States", "America", "People", "City", "County",
  "National", "Federal", "Local", "District", "Western", "Eastern",
  "Northern", "Southern", "Virginia", "German", "New", "York",
  // Legal authorities mistaken for party names
  "Restatement",
]);
