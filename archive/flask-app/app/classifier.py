"""
Heuristic classification engine for IRAC/CREAC/CRAC structural analysis.

Priority order (first match wins per sentence):
  1. ISSUE
  2. Strong conclusion starters (therefore/thus/accordingly at sentence start)
     — checked BEFORE RULE so "Therefore, a court would..." is never misclassified
  3. APPLICATION  (checked before RULE to avoid citation contamination)
  4. EXPLANATION  (CREAC only)
  5. RULE
  6. CONCLUSION   (remaining conclusion phrases)
  7. UNCLASSIFIED (fallback)

A secondary blend-detection pass runs after primary classification.
"""

import re

import nltk

from app.constants import (
    APPLICATION_PHRASES,
    APPLICATION_START_PHRASES,
    CONCLUSION_PHRASES,
    EXPLANATION_PHRASES,
    EXPLANATION_REGEX_PATTERNS,
    HEDGE_WORDS,
    ISSUE_PHRASES,
    LABEL_COLORS,
    LABEL_ORDER,
    LEGAL_VOCAB_TERMS,
    RULE_CITATION_PATTERNS,
    RULE_REGEX_PATTERNS,
    RULE_STANDARD_PHRASES,
    STRUCT_LABEL_RE,
    SUGGESTIONS,
    _BECAUSE_FACT_RE,
    _CASE_SPECIFIC_FACT_RE,
    _CITE_STARTERS,
    _CONDITIONAL_RULE_RE,
    _COUNTERARGUMENT_RE,
    _DEFINITIONAL_RE,
    _FACTUAL_VERBS,
    _GENERIC_SUBJECT_RE,
    _PARTY_NAME_STOPWORDS,
    _PRONOUN_AUX_RE,
    _PRONOUN_SUBJECT_RE,
    _SECTION_PREFIX_RE,
    _SPECIFIC_LEGAL_OUTCOME_RE,
    _STRONG_CONCLUSION_STARTERS,
)

# ---------------------------------------------------------------------------
# Helper utilities
# ---------------------------------------------------------------------------

def _has_citation(sentence: str) -> bool:
    for pattern in RULE_CITATION_PATTERNS:
        if pattern.search(sentence):
            return True
    return False


def _is_counterargument(sentence: str) -> bool:
    """Detect opposing-position frames without creating a new IRAC label."""
    return bool(_COUNTERARGUMENT_RE.search(sentence))


def _auto_detect_framework(para_text: str, user_framework: str) -> str:
    """
    Pick the best paragraph-level analysis mode.

    Explicit selections are still honored for regression scripts, but the UI
    now sends AUTO so students do not need to choose IRAC/CRAC/CREAC manually.
    """
    user_framework = (user_framework or "AUTO").upper()
    if user_framework in ("IRAC", "CREAC", "CRAC"):
        return user_framework

    sl = para_text.lower()
    first_dot = sl.find('.')
    first_sent = sl[:first_dot] if first_dot > 0 else sl[:150]
    has_issue_opener = (
        any(phrase in first_sent for phrase in ISSUE_PHRASES)
        or bool(re.search(r'\bwhether\b', first_sent[:100]))
    )
    if has_issue_opener:
        return "IRAC"

    has_explanation = (
        any(phrase in sl for phrase in EXPLANATION_PHRASES)
        or any(pattern.search(para_text) for pattern in EXPLANATION_REGEX_PATTERNS)
    )
    has_opening_position = (
        bool(_STRONG_CONCLUSION_STARTERS.match(first_sent))
        or any(phrase in first_sent for phrase in CONCLUSION_PHRASES)
        or bool(_contains_any(first_sent, HEDGE_WORDS))
        or bool(re.search(
            r'\b(?:is|are|was|were|will|would|should|can|cannot)\b.{0,80}'
            r'\b(?:liable|guilty|enforceable|proper|improper|valid|invalid|'
            r'satisfied|met|prevail|succeed|fail)\b',
            first_sent,
        ))
    )

    if has_opening_position:
        if has_explanation:
            return "CREAC"
        return "CRAC"

    return "IRAC"


def _starts_with_any(sentence_lower: str, phrases: tuple) -> str | None:
    for phrase in phrases:
        if sentence_lower.startswith(phrase):
            return phrase
    return None


def _contains_any(sentence_lower: str, phrases: tuple) -> str | None:
    for phrase in phrases:
        if phrase in sentence_lower:
            return phrase
    return None


def _count_rule_signals(sentence: str, sentence_lower: str) -> tuple[int, int, str]:
    """
    Return (total_signals, strong_signals, first_trigger_phrase).

    Four signal categories — each contributes at most 1 point:
      1. Citation marker       (strong)
      2. Standard phrase       (strong)
      3. Regex rule pattern    (strong)  — catches "courts have further held" etc.
      4. Legal vocabulary term (weak)
      5. Structural cue        (strong)  — generic legal subject, definitional, or conditional

    strong_signals = count of signals from categories 1, 2, 3, 5 only.
    The 1-signal fallback only fires when strong_signals >= 1.
    """
    total = 0
    strong = 0
    trigger = ""

    # Signal 1: citation
    if _has_citation(sentence):
        total += 1
        strong += 1
        trigger = trigger or "[citation]"

    # Signal 2: exact standard phrase
    matched = _contains_any(sentence_lower, RULE_STANDARD_PHRASES)
    if matched:
        total += 1
        strong += 1
        trigger = trigger or matched

    # Signal 3: flexible regex pattern (e.g. "courts have further held")
    if not matched:  # avoid double-counting with Signal 2
        for pat in RULE_REGEX_PATTERNS:
            if pat.search(sentence):
                total += 1
                strong += 1
                trigger = trigger or pat.pattern[:30]
                break

    # Signal 4: legal vocabulary (weak — does NOT satisfy 1-signal fallback alone)
    legal_term = _contains_any(sentence_lower, LEGAL_VOCAB_TERMS)
    if legal_term:
        total += 1
        trigger = trigger or legal_term

    # Signal 5: structural cue — generic legal subject, definitional, or conditional
    if _GENERIC_SUBJECT_RE.search(sentence):
        total += 1
        strong += 1
        trigger = trigger or "[generic legal subject]"
    elif _DEFINITIONAL_RE.match(sentence):
        total += 1
        strong += 1
        trigger = trigger or "[definitional structure]"
    elif _CONDITIONAL_RULE_RE.match(sentence):
        total += 1
        strong += 1
        trigger = trigger or "[conditional rule structure]"

    return total, strong, trigger


def _confidence_from_scores(label: str, scores: dict[str, float]) -> float:
    """Convert transparent label scores into a stable 0.0-1.0 confidence."""
    if label == "UNCLASSIFIED":
        top = max(scores.values()) if scores else 0
        return round(0.55 if top < 1.5 else 0.35, 2)

    label_score = scores.get(label, 0)
    competing = [v for k, v in scores.items() if k != label and k != "UNCLASSIFIED"]
    runner_up = max(competing) if competing else 0
    if label_score <= 0:
        return 0.62

    margin = max(0, label_score - runner_up)
    confidence = 0.50 + min(0.35, label_score * 0.07) + min(0.15, margin * 0.06)
    return round(min(0.98, max(0.50, confidence)), 2)


def _confidence_band(confidence: float) -> str:
    if confidence >= 0.82:
        return "high"
    if confidence >= 0.68:
        return "medium"
    return "low"


def _competing_labels(final_label: str, scores: dict[str, float]) -> list[dict]:
    """Return likely alternative labels for transparent, non-binary coaching."""
    rows = [
        {"label": label, "score": round(score, 2)}
        for label, score in scores.items()
        if label != final_label and score > 0
    ]
    rows.sort(key=lambda item: item["score"], reverse=True)
    return rows[:3]


def _uncertainty_reason(
    final_label: str,
    confidence: float,
    scores: dict[str, float],
    evidence: dict[str, list[str]],
) -> str:
    """Explain why a sentence should be treated cautiously."""
    if confidence >= 0.82:
        return ""

    alternatives = _competing_labels(final_label, scores)
    if alternatives:
        alt = alternatives[0]
        return (
            f"This sentence also has signals of {alt['label'].lower()}, "
            "so treat this classification as a coaching guess."
        )

    if not evidence.get(final_label):
        return (
            "The sentence has weak explicit structure markers, so the tool is "
            "leaning on context rather than a clear signal."
        )

    return "The signal is present but not strong enough for high confidence."


def _sentence_revision_hint(sentence_data: dict) -> str:
    """Short, structure-only coaching hint for a classified sentence."""
    label = sentence_data.get("label", "UNCLASSIFIED")
    text = sentence_data.get("text", "")
    sl = text.lower()
    evidence_scores = sentence_data.get("evidence_scores", {})

    if sentence_data.get("counterargument"):
        return (
            "This reads as an opposing-position sentence. Make sure the paragraph "
            "answers it with rule-based application, not just a bare assertion."
        )

    if sentence_data.get("blend"):
        return (
            "This looks blended. Try splitting the legal rule from the fact-specific "
            "application into separate sentences."
        )

    if label == "UNCLASSIFIED":
        return (
            "If this sentence carries structural work, add clearer legal-writing "
            "signals so a reader can tell whether it is rule, application, or conclusion."
        )

    if sentence_data.get("confidence_label") in ("low", "medium"):
        return (
            "Check whether this sentence is doing more than one job; a clearer "
            "signpost or separation may make the structure easier to follow."
        )

    if label == "RULE":
        app_score = evidence_scores.get("APPLICATION", 0)
        if app_score >= 1.8:
            return "This rule sentence may be drifting into facts. Keep the rule abstract, then apply it separately."
        return "Good rule signal. Make sure the next structural move connects this rule to specific facts."

    if label == "APPLICATION":
        rule_score = evidence_scores.get("RULE", 0)
        if rule_score >= 1.6:
            return "This application carries rule-like signals too. Consider whether a citation or standard belongs in a separate rule sentence."
        if not re.search(r'\b(?:because|here|fact|facts|show|shows|therefore|accordingly)\b', sl):
            return "Strengthen the facts-to-rule bridge by naming the concrete fact and the rule element it satisfies."
        return "Good application signal. Make sure it expressly connects facts to a rule element."

    if label == "EXPLANATION":
        return "This reads as case explanation. In CREAC, use it before applying the rule to your client's facts."

    if label == "CONCLUSION":
        if len(text.split()) < 8:
            return "A concise conclusion is fine, but make sure it states the likely legal result with enough specificity."
        return "Good conclusion signal. It should follow the rule and application rather than substitute for them."

    if label == "ISSUE":
        return "Good issue signal. The following sentences should move to rule, application, and conclusion."

    return ""


def _add_score(
    scores: dict[str, float],
    evidence: dict[str, list[str]],
    label: str,
    points: float,
    reason: str,
) -> None:
    scores[label] += points
    if reason and reason not in evidence[label]:
        evidence[label].append(reason)


def _score_sentence_evidence(
    sentence: str,
    idx_in_para: int,
    total_in_para: int,
    framework: str,
    party_names: set[str],
    final_label: str,
    trigger_phrase: str,
) -> dict:
    """
    Transparent scoring layer used for confidence and explainability.

    This intentionally coexists with the deterministic classifier while the
    project evolves. The existing label remains authoritative; these scores
    explain how much evidence supports each possible structural role.
    """
    s = sentence.strip()
    sl = s.lower()
    scores = {label: 0.0 for label in LABEL_ORDER}
    evidence = {label: [] for label in LABEL_ORDER}

    # Authoritative section labels and context passes.
    if trigger_phrase.startswith("[section label:"):
        _add_score(scores, evidence, final_label, 5.0, trigger_phrase)
    elif trigger_phrase.startswith("[context:"):
        _add_score(scores, evidence, final_label, 2.6, trigger_phrase)
    elif trigger_phrase.startswith("[para cascade:"):
        _add_score(scores, evidence, final_label, 2.6, trigger_phrase)
    elif trigger_phrase.startswith("[final sentence"):
        _add_score(scores, evidence, final_label, 2.4, trigger_phrase)
    elif trigger_phrase.startswith("[standalone citation"):
        _add_score(scores, evidence, final_label, 2.0, trigger_phrase)

    # Issue evidence.
    issue_trigger = _contains_any(sl, ISSUE_PHRASES)
    if issue_trigger:
        _add_score(scores, evidence, "ISSUE", 3.2, issue_trigger)
    if s.endswith("?") and not _has_citation(s) and not _GENERIC_SUBJECT_RE.search(s):
        _add_score(scores, evidence, "ISSUE", 2.7, "question mark")
    if re.match(r'^whether\b', sl) or re.match(r'^[^,]{0,30},\s*whether\b', sl):
        _add_score(scores, evidence, "ISSUE", 2.7, "whether opener")
    elif re.search(r'\b(?:question|issue|inquiry|problem)\b.{0,60}\bwhether\b', sl):
        _add_score(scores, evidence, "ISSUE", 2.4, "issue noun + whether")

    # Rule evidence.
    total_rule, strong_rule, rule_trigger = _count_rule_signals(s, sl)
    if total_rule:
        _add_score(
            scores,
            evidence,
            "RULE",
            1.1 * total_rule + 0.8 * strong_rule,
            rule_trigger or "rule signal",
        )
    if _has_citation(s):
        _add_score(scores, evidence, "RULE", 1.6, "citation")

    # Explanation evidence. In CREAC this is a distinct label; in IRAC it also
    # supports RULE because case explanation usually functions as rule support.
    exp_trigger = _contains_any(sl, EXPLANATION_PHRASES)
    if not exp_trigger:
        for pattern in EXPLANATION_REGEX_PATTERNS:
            if pattern.search(s):
                exp_trigger = "[case illustration]"
                break
    if exp_trigger:
        exp_points = 2.6 + (0.8 if _has_citation(s) else 0)
        if framework == "CREAC":
            _add_score(scores, evidence, "EXPLANATION", exp_points, exp_trigger)
        else:
            _add_score(scores, evidence, "RULE", exp_points * 0.8, f"case explanation: {exp_trigger}")

    # Application evidence.
    app_start = _starts_with_any(sl, APPLICATION_START_PHRASES)
    app_phrase = _starts_with_any(sl, APPLICATION_PHRASES) or _contains_any(sl, APPLICATION_PHRASES)
    if _is_counterargument(s):
        _add_score(scores, evidence, "APPLICATION", 2.4, "opposing-position signal")
    if app_start:
        _add_score(scores, evidence, "APPLICATION", 3.3, app_start)
    elif app_phrase:
        _add_score(scores, evidence, "APPLICATION", 2.5, app_phrase)
    if _CASE_SPECIFIC_FACT_RE.match(sl):
        _add_score(scores, evidence, "APPLICATION", 2.6, "case-specific fact")
    if _SPECIFIC_LEGAL_OUTCOME_RE.match(s):
        _add_score(scores, evidence, "APPLICATION", 2.7, "specific legal outcome")
    if _BECAUSE_FACT_RE.match(sl) and _FACTUAL_VERBS.search(sl):
        _add_score(scores, evidence, "APPLICATION", 2.2, "causal application")
    if _PRONOUN_SUBJECT_RE.match(sl) and not _PRONOUN_AUX_RE.match(sl) and _FACTUAL_VERBS.search(sl):
        _add_score(scores, evidence, "APPLICATION", 1.8, "pronoun + factual verb")
    if party_names and not _has_citation(s):
        for name in party_names:
            if name in s and _FACTUAL_VERBS.search(sl):
                _add_score(scores, evidence, "APPLICATION", 1.9, f"party fact: {name}")
                break

    # Conclusion evidence.
    if framework == "CRAC" and idx_in_para == 0 and total_in_para > 1:
        _add_score(scores, evidence, "CONCLUSION", 2.4, "CRAC opening position")
    if framework == "CREAC" and idx_in_para == 0 and total_in_para > 1:
        _add_score(scores, evidence, "CONCLUSION", 2.2, "CREAC opening position")
    if _STRONG_CONCLUSION_STARTERS.match(sl):
        _add_score(scores, evidence, "CONCLUSION", 3.3, "strong conclusion starter")
    conclusion_trigger = _starts_with_any(sl, CONCLUSION_PHRASES) or _contains_any(sl, CONCLUSION_PHRASES)
    if conclusion_trigger:
        _add_score(scores, evidence, "CONCLUSION", 2.7, conclusion_trigger)
    if idx_in_para == total_in_para - 1:
        hedge = _contains_any(sl, HEDGE_WORDS)
        if hedge:
            _add_score(scores, evidence, "CONCLUSION", 1.8, f"final sentence + hedge: {hedge}")

    if trigger_phrase and final_label != "UNCLASSIFIED":
        _add_score(scores, evidence, final_label, 0.8, f"selected trigger: {trigger_phrase}")

    confidence = _confidence_from_scores(final_label, scores)
    if (
        final_label == "CONCLUSION"
        and re.search(r'\bthe\s+court\s+should\s+consider\b', sl)
        and not re.search(
            r'\b(?:liable|guilty|enforceable|proper|improper|valid|invalid|'
            r'satisfied|met|prevail|succeed|fail|deny|grant|hold|find|conclude)\b',
            sl,
        )
    ):
        confidence = min(confidence, 0.66)
        _add_score(scores, evidence, "UNCLASSIFIED", 1.4, "generic court-should phrasing")
    rounded_scores = {label: round(scores[label], 2) for label in LABEL_ORDER}
    uncertainty_reason = _uncertainty_reason(final_label, confidence, scores, evidence)
    return {
        "confidence": confidence,
        "confidence_label": _confidence_band(confidence),
        "evidence_scores": rounded_scores,
        "competing_labels": _competing_labels(final_label, scores),
        "evidence": evidence.get(final_label, [])[:4],
        "uncertainty_reason": uncertainty_reason,
    }


def _refresh_sentence_evidence(
    sentences_data: list[dict],
    framework: str,
    party_names: set[str],
) -> list[dict]:
    total = len(sentences_data)
    for idx, sd in enumerate(sentences_data):
        sd.update(_score_sentence_evidence(
            sd["text"],
            idx,
            total,
            framework,
            party_names,
            sd["label"],
            sd.get("trigger_phrase", ""),
        ))
        sd["revision_hint"] = _sentence_revision_hint(sd)
    return sentences_data


# ---------------------------------------------------------------------------
# Party name extraction
# ---------------------------------------------------------------------------

def _extract_party_names(paragraphs: list[str]) -> set[str]:
    """
    Best-effort extraction of party names from the first five paragraphs.
    """
    names: set[str] = set()
    scan_text = " ".join(paragraphs[:5])

    # Pattern: "X v. Y" case name
    for m in re.finditer(
        r'([A-Z][A-Za-z\s]+?)\s+v\.\s+([A-Z][A-Za-z\s]+?)(?=[,;.\s])',
        scan_text,
    ):
        for g in (m.group(1), m.group(2)):
            word = g.strip().split()[-1]
            if len(word) > 2 and word not in _PARTY_NAME_STOPWORDS:
                names.add(word)

    # Pattern: "the plaintiff/defendant Name"
    for m in re.finditer(
        r'\b(?:plaintiff|defendant|appellant|appellee|petitioner|respondent)\s+([A-Z][a-z]+)',
        scan_text,
        re.I,
    ):
        candidate = m.group(1)
        # re.I makes [A-Z][a-z]+ match lowercase words too; guard with isupper check.
        if candidate[0].isupper() and candidate not in _PARTY_NAME_STOPWORDS:
            names.add(candidate)

    # Pattern: possessive proper nouns — "Morgan's", "Pruitt's", "BlueSky's"
    # Also catches CamelCase compound names with possessive: "BlueSky's", "ElecControl's"
    for m in re.finditer(r"\b([A-Z][a-zA-Z]{1,})'s\b", scan_text):
        name = m.group(1)
        if len(name) > 2 and name not in _PARTY_NAME_STOPWORDS:
            names.add(name)

    # Pattern: CamelCase compound names — "BlueSky", "ElecControl", "NeueStruktur"
    # Matches word with at least one internal uppercase letter (CamelCase).
    for m in re.finditer(r'\b([A-Z][a-z]+(?:[A-Z][a-z]*)+)\b', scan_text):
        name = m.group(1)
        if len(name) > 4 and name not in _PARTY_NAME_STOPWORDS:
            names.add(name)

    # Frequent proper nouns (≥ 2 appearances)
    candidates = re.findall(r'\b([A-Z][a-z]{2,})\b', scan_text)
    freq: dict[str, int] = {}
    for c in candidates:
        if c not in _PARTY_NAME_STOPWORDS:
            freq[c] = freq.get(c, 0) + 1
    for name, count in freq.items():
        if count >= 2:
            names.add(name)

    return names


# ---------------------------------------------------------------------------
# NLTK tokenization: merge citation fragments
# ---------------------------------------------------------------------------

def _merge_citation_fragments(sentences: list[str]) -> list[str]:
    """
    NLTK's punkt tokenizer splits on abbreviations in legal citations.
    E.g. "See Palsgraf v. Long Island R.R., 248 N.Y. 339 (1928)."
    becomes several fragments.  Merge any fragment that:
      - is very short (< 5 words), OR
      - starts with a digit or lowercase letter, OR
      - consists entirely of a reporter abbreviation pattern
    back into the preceding sentence.
    """
    if not sentences:
        return sentences

    merged = [sentences[0]]
    legal_sentence_starters = re.compile(
        r'^(?:under|pursuant\s+to|according\s+to|see|see\s+also|cf\.|accord|'
        r'restatement|rule|fed\.\s+r\.|[0-9]+\s+u\.s\.c\.)\b',
        re.I,
    )
    for sent in sentences[1:]:
        words = sent.split()
        short_citationish_fragment = (
            len(words) < 5
            and not re.match(r'^(?:the|this|that|these|those|it|he|she|they|a|an)\b', sent, re.I)
        )
        is_fragment = (
            short_citationish_fragment
            or (words and (
                words[0][0].isdigit()
                or words[0][0].islower()
                or words[0].startswith('§')
            ))
            or re.match(r'^[A-Z][a-z]{0,3}\.$', words[0])  # "App.", "Md.", "Ill."
        )
        starts_new_legal_sentence = bool(words and legal_sentence_starters.match(sent))
        if is_fragment and merged:
            # "Under 28 U.S.C." is a real new rule sentence that Punkt often
            # chops before the section number. Keep it as the head of a new
            # sentence so later numeric fragments merge forward into it rather
            # than backward into the preceding issue/conclusion sentence.
            if starts_new_legal_sentence and not _has_citation(merged[-1]):
                merged.append(sent)
            else:
                merged[-1] = merged[-1] + " " + sent
        else:
            merged.append(sent)
    return merged


# ---------------------------------------------------------------------------
# Per-sentence classifier
# ---------------------------------------------------------------------------

def _classify_sentence(
    sentence: str,
    idx_in_para: int,
    total_in_para: int,
    is_first_sentence_of_doc: bool,
    framework: str,
    party_names: set[str],
) -> tuple[str, str]:
    """Return (label, trigger_phrase)."""
    s = sentence.strip()
    sl = s.lower()

    # ---- STRUCTURAL SECTION LABEL DETECTION ----
    # Exam/memo answers often prefix sentences with explicit labels:
    # "Rule:", "Analysis:", "Application — Purposeful Availment:", "Conclusion:", "Issue:"
    # When present, the label word is authoritative — return the matching
    # classification immediately (or strip the prefix and continue for "Issue:").
    m = STRUCT_LABEL_RE.match(s)
    if m:
        lbl_word = m.group('lbl').lower()
        if lbl_word.startswith('rule'):
            return "RULE", "[section label: Rule]"
        if lbl_word.startswith('application') or lbl_word.startswith('analysis'):
            return "APPLICATION", "[section label: Application/Analysis]"
        if lbl_word.startswith('conclusion'):
            return "CONCLUSION", "[section label: Conclusion]"
        if lbl_word.startswith('issue'):
            # Strip prefix and continue ISSUE detection on remaining text
            s = s[m.end():].strip()
            sl = s.lower()
            if not s:
                return "ISSUE", "[section label: Issue]"

    # ---- ISSUE ----
    if s.endswith("?"):
        # Guard: if the sentence has strong rule signals (citation or generic legal subject),
        # it's likely a rhetorical question embedded in a rule statement — fall through.
        _pre_cite = any(pat.search(s) for pat in RULE_CITATION_PATTERNS)
        if not _pre_cite and not _GENERIC_SUBJECT_RE.search(s):
            return "ISSUE", "?"

    trigger = _contains_any(sl, ISSUE_PHRASES)
    if trigger:
        return "ISSUE", trigger

    if re.match(r'^whether\b', sl) or re.match(r'^[^,]{0,30},\s*whether\b', sl):
        return "ISSUE", "whether"

    # Embedded "whether" after a question/issue noun — "The question ... is whether..."
    # Guard: skip when strong conclusion language is also present (e.g. "The question,
    # therefore, is not whether..." is a CONCLUSION framing, not an ISSUE framing).
    if re.search(r'\b(?:question|issue|inquiry|problem)\b.{0,60}\bwhether\b', sl):
        if not re.search(r'\b(?:therefore|thus|accordingly|hence)\b', sl):
            return "ISSUE", "whether"

    # Opposing-position frames are application/analysis work, not standalone
    # conclusions. Surface the coaching note later through metadata.
    if _is_counterargument(s):
        return "APPLICATION", "[opposing-position signal]"

    # ---- CRAC/CREAC: opening conclusion (first sentence of paragraph) ----
    # In CRAC, the first sentence is always a conclusion assertion.
    # In CREAC, the first sentence is typically a hedged conclusion assertion
    # (e.g. "The State is unlikely to establish…", "The regulation is likely…").
    # Check this BEFORE APPLICATION so party-name detection doesn't steal these.
    # Guard: do NOT fire for sentences that already declare "Analysis:" or "Application:"
    # (those are handled by structural label detection above, or should not become CONCLUSION).
    if framework == "CRAC" and idx_in_para == 0 and total_in_para > 1:
        if not _has_citation(s) and not _contains_any(sl, RULE_STANDARD_PHRASES):
            if not _SECTION_PREFIX_RE.match(s):
                return "CONCLUSION", "[CRAC opening conclusion]"

    if framework == "CREAC" and idx_in_para == 0 and total_in_para > 1:
        if not _has_citation(s) and not _GENERIC_SUBJECT_RE.search(s):
            if not _SECTION_PREFIX_RE.match(s):
                # Hedged assertions ("likely", "probably", etc.) are classic CREAC openers.
                # Declarative assertions are also valid CREAC openers as long as they don't
                # look like a rule statement (no standard rule phrase present).
                if _contains_any(sl, HEDGE_WORDS) or not _contains_any(sl, RULE_STANDARD_PHRASES):
                    return "CONCLUSION", "[CREAC opening conclusion]"

    # ---- STRONG CONCLUSION STARTERS (checked before RULE) ----
    # This prevents "Therefore, a court would likely find..." from being
    # misclassified as RULE due to "duty of care" or other legal vocab.
    if _STRONG_CONCLUSION_STARTERS.match(sl):
        return "CONCLUSION", sl.split()[0]

    # ---- PRE-RULE CONCLUSION CHECKS ----
    # Certain conclusory assertions are checked BEFORE RULE to prevent citations
    # or rule terminology in the sentence from overriding the conclusion label.

    # "The court should [do X]" — "the court" (definite) = specific-case conclusion,
    # distinct from "a court should" or "courts should" (general rule statements).
    if re.match(r'^the\b.{0,30}\bcourt\s+should\b', sl):
        return "CONCLUSION", "the court should"

    # "most likely" in a sentence with no indefinite generic subject →
    # conclusion assertion (e.g., "Tanner is most likely domiciled in NC").
    # Guard: don't fire for general rules ("A court will most likely apply…").
    if re.search(r'\bmost\s+likely\b', sl):
        if not re.search(r'\b(?:a|an)\s+(?:defendant|plaintiff|party|person|individual|court|courts)\b', sl):
            return "CONCLUSION", "most likely"

    # CREAC explanation can look fact-specific because it names the precedent
    # parties. Catch clear case-illustration sentences before application
    # heuristics steal them via party-name detection.
    if framework == "CREAC":
        early_exp_trigger = _contains_any(sl, EXPLANATION_PHRASES)
        if not early_exp_trigger:
            for pattern in EXPLANATION_REGEX_PATTERNS:
                if pattern.search(s):
                    early_exp_trigger = "[case illustration]"
                    break
        if early_exp_trigger:
            return "EXPLANATION", early_exp_trigger

    # ---- APPLICATION (checked before RULE) ----
    # Start-only phrases first (prevents substring false positives like "There,")
    trigger = _starts_with_any(sl, APPLICATION_START_PHRASES)
    if trigger:
        return "APPLICATION", trigger

    trigger = _starts_with_any(sl, APPLICATION_PHRASES)
    if trigger:
        return "APPLICATION", trigger

    trigger = _contains_any(sl, APPLICATION_PHRASES)
    if trigger:
        # Guard 1: "Courts apply/require/hold [legal test]..." → rule-invoking frame;
        # the APPLICATION phrase appears embedded in a rule statement, not as application.
        _courts_rule_frame = bool(re.match(
            r'^courts?\s+(?:apply|require|hold|have|recognize|employ|use|'
            r'analyze|consider|balance|weigh)\b',
            sl,
        ))
        # Guard 2: specific state-assertion phrases that can appear embedded in citation-heavy
        # rule statements ("Under X v. Y, Germany is an adequate alternative forum...").
        _CITE_GUARDED_APP = frozenset({"is an adequate", "is not an adequate", "is amenable"})
        if _courts_rule_frame or (trigger in _CITE_GUARDED_APP and _has_citation(s)):
            pass  # fall through to RULE detection
        else:
            return "APPLICATION", trigger

    # "It has no [X]" — factual assertion about a specific entity having no property
    # (e.g. "It has no offices, employees, agents, or bank accounts in Virginia").
    # Only fire when the sentence is short enough that "It" is the main subject,
    # not "It has been established that…" (past-passive → falls to RULE via citation).
    if re.match(r'^it\s+has\s+(?:no|never|not)\b', sl):
        return "APPLICATION", "it has no"

    if _CASE_SPECIFIC_FACT_RE.match(sl) and not (
        idx_in_para == total_in_para - 1 and _contains_any(sl, CONCLUSION_PHRASES)
    ):
        return "APPLICATION", "[case-specific fact]"

    if _SPECIFIC_LEGAL_OUTCOME_RE.match(s) and not (
        idx_in_para == total_in_para - 1 and _contains_any(sl, CONCLUSION_PHRASES)
    ):
        return "APPLICATION", "[specific legal outcome]"

    # "Because/Since [non-generic subject] [factual verb]" → APPLICATION
    if _BECAUSE_FACT_RE.match(sl) and _FACTUAL_VERBS.search(sl):
        return "APPLICATION", "[causal application]"

    # Pronoun subject + factual verb → APPLICATION continuation.
    # Exclude auxiliary constructions ("She was called…", "He had argued…")
    # which are more likely fact narrative than legal application.
    if (_PRONOUN_SUBJECT_RE.match(sl)
            and not _PRONOUN_AUX_RE.match(sl)
            and _FACTUAL_VERBS.search(sl)):
        return "APPLICATION", "[pronoun + factual verb]"

    # Party-name + factual verb → APPLICATION.
    # Skip when the sentence contains a case citation (the name is likely from
    # the cited case, not the current party) or when the name is immediately
    # followed by an auxiliary verb (signals fact narrative, not application).
    if party_names and not _has_citation(s):
        for name in party_names:
            if name in s:
                # Block past-tense / perfect auxiliaries: these signal fact narration, not application.
                # ("Sandra had worked…", "She was called…" → skip, not APPLICATION)
                if re.search(r'\b' + re.escape(name) + r'\s+(?:was|were|had)\b', s, re.I):
                    continue
                # For present-tense "is/are": skip only pure role-descriptions ("Name is a defendant").
                # Allows state assertions ("Tanner is physically present", "Germany is an adequate…").
                if re.search(r'\b' + re.escape(name) + r'\s+(?:is|are)\s+(?:a|an)\s', s, re.I):
                    continue
                if _FACTUAL_VERBS.search(sl):
                    return "APPLICATION", f"[party: {name}]"

    # ---- EXPLANATION (CREAC only) ----
    if framework == "CREAC":
        exp_trigger = _contains_any(sl, EXPLANATION_PHRASES)
        if not exp_trigger:
            for pattern in EXPLANATION_REGEX_PATTERNS:
                if pattern.search(s):
                    exp_trigger = "[case illustration]"
                    break
        if exp_trigger:
            # Require citation for the FIRST explanation sentence to be sure,
            # but allow continuation sentences (no citation) when they start
            # with "The Court" — these are clearly within case illustration.
            has_cite = _has_citation(s)
            is_court_continuation = re.match(r'^the\s+court\b', sl)
            is_named_case_illustration = exp_trigger == "[case illustration]"
            if has_cite or is_court_continuation or is_named_case_illustration:
                return "EXPLANATION", exp_trigger

    # ---- RULE ----
    total_signals, strong_signals, trigger = _count_rule_signals(s, sl)

    if total_signals >= 2:
        return "RULE", trigger

    # 1-signal fallback: classify as RULE only if the signal is "strong"
    # (not just legal vocabulary). This prevents "This breach satisfies
    # actus reus." from being RULE when the only signal is "actus reus".
    # Exception: if the sentence has a citation, any case name appearing in it is
    # from the cited case — bypass the party-name block for citation sentences.
    if total_signals == 1 and strong_signals >= 1:
        if _has_citation(s) or trigger == "[generic legal subject]" or not any(name in s for name in party_names):
            return "RULE", trigger

    # ---- CONCLUSION ----
    trigger = _starts_with_any(sl, CONCLUSION_PHRASES)
    if trigger:
        return "CONCLUSION", trigger

    trigger = _contains_any(sl, CONCLUSION_PHRASES)
    if trigger:
        return "CONCLUSION", trigger

    if re.search(r'\bclaims?\b.{0,80}\bfails?\b', sl):
        return "CONCLUSION", "claim fails"

    # Last sentence of paragraph + hedge word
    if idx_in_para == total_in_para - 1:
        hedge = _contains_any(sl, HEDGE_WORDS)
        if hedge:
            return "CONCLUSION", f"[final sentence + hedge: {hedge}]"

    return "UNCLASSIFIED", ""


# ---------------------------------------------------------------------------
# Blend detection (secondary pass)
# ---------------------------------------------------------------------------

def _detect_blends(sentences_data: list[dict]) -> list[dict]:
    """
    Mark sentences that mix incompatible structural signals.
    """
    for sent in sentences_data:
        label = sent["label"]
        sl = sent["text"].lower()
        has_cite = _has_citation(sent["text"])

        if label == "RULE":
            # Rule sentence that also has application trigger at clause start
            for phrase in (*APPLICATION_START_PHRASES, *APPLICATION_PHRASES):
                if re.search(r'(?:^|[;,]\s)' + re.escape(phrase), sl):
                    sent["blend"] = True
                    sent["blend_type"] = "RULE+APPLICATION"
                    sent["trigger_phrase"] = sent.get("trigger_phrase") or phrase
                    break
            if not sent["blend"] and re.search(r'\b(?:and|but|because)\s+here\s+[A-Z]?', sent["text"], re.I):
                sent["blend"] = True
                sent["blend_type"] = "RULE+APPLICATION"
                sent["trigger_phrase"] = sent.get("trigger_phrase") or "here"

        elif label == "APPLICATION":
            # Application sentence that also contains a generic legal subject
            # (signals rule language was mixed in, e.g. C-4's long sentence).
            # Exception: state-assertion triggers like "is amenable", "is an adequate",
            # "is incorporated", "arises from the same" describe specific facts about
            # the case parties — these are NOT blends even if a citation is present.
            _STATE_ASSERTION_TRIGGERS = {
                "is an adequate", "is not an adequate", "is amenable",
                "is incorporated", "is headquartered", "is physically present",
                "is preempted", "is not preempted", "does not directly conflict",
                "directly conflicts", "arises directly from", "arises from the same",
                "arises out of the same", "same operative facts",
            }
            trig = sent.get("trigger_phrase", "")
            if trig in _STATE_ASSERTION_TRIGGERS:
                pass  # state assertions don't constitute blends
            elif _GENERIC_SUBJECT_RE.search(sent["text"]) and has_cite:
                sent["blend"] = True
                sent["blend_type"] = "RULE+APPLICATION"
                sent["trigger_phrase"] = sent.get("trigger_phrase") or "[citation in application]"
            elif _GENERIC_SUBJECT_RE.search(sent["text"]) and len(sent["text"].split()) > 40:
                # Long sentence with generic legal subject embedded → blend
                sent["blend"] = True
                sent["blend_type"] = "RULE+APPLICATION"
                sent["trigger_phrase"] = sent.get("trigger_phrase") or "[generic legal subject in application]"

    return sentences_data


# ---------------------------------------------------------------------------
# Context smoothing (secondary pass)
# ---------------------------------------------------------------------------

def _smooth_by_context(sentences_data: list[dict]) -> list[dict]:
    """
    Promote UNCLASSIFIED sentences to RULE or APPLICATION when the closest
    labeled neighbor on EACH side agrees on the same label.

    Bidirectional requirement prevents false cascades: a single APPLICATION
    sentence at the start of a fact-narrative paragraph would only have one
    labeled neighbor (on the left), so it cannot trigger promotion of subsequent
    UNCLASSIFIED sentences. Genuine rule-elaboration or analysis sentences
    surrounded by labeled sentences on both sides are safely promoted.

    Only promotes to RULE or APPLICATION — never CONCLUSION, ISSUE, or EXPLANATION.
    Does not demote sentences that already have a label.
    """
    # For prev search: skip CONCLUSION/ISSUE/EXPLANATION (don't cascade backward from them)
    _SKIP_PREV = {"UNCLASSIFIED", "CONCLUSION", "ISSUE", "EXPLANATION"}
    # For next search: allow CONCLUSION so (RULE, CONCLUSION) and (APPLICATION, CONCLUSION)
    # cross-label pairs can promote UNCLASSIFIED sentences sandwiched between R and C.
    _SKIP_NEXT = {"UNCLASSIFIED", "ISSUE", "EXPLANATION"}
    n = len(sentences_data)
    for i in range(n):
        if sentences_data[i]["label"] != "UNCLASSIFIED":
            continue
        # Find closest labeled neighbor in each direction (within 3 positions)
        prev_lbl = None
        for j in range(i - 1, max(-1, i - 4), -1):
            if sentences_data[j]["label"] not in _SKIP_PREV:
                prev_lbl = sentences_data[j]["label"]
                break
        next_lbl = None
        for j in range(i + 1, min(n, i + 4)):
            if sentences_data[j]["label"] not in _SKIP_NEXT:
                next_lbl = sentences_data[j]["label"]
                break
        # Promote when labeled on BOTH sides — same-label or IRAC-aware cross-label pairs
        _PROMOTE_TO_APP = {
            ("RULE", "APPLICATION"),
            ("APPLICATION", "RULE"),
            ("RULE", "CONCLUSION"),        # core IRAC: between R and C must be A
            ("APPLICATION", "CONCLUSION"),
        }
        if prev_lbl and next_lbl:
            if prev_lbl == next_lbl and prev_lbl in ("RULE", "APPLICATION"):
                target = prev_lbl
            elif (prev_lbl, next_lbl) in _PROMOTE_TO_APP:
                target = "APPLICATION"
            else:
                continue
            sentences_data[i]["label"] = target
            sentences_data[i]["color_hex"] = LABEL_COLORS[target]
            sentences_data[i]["trigger_phrase"] = "[context: neighbor smoothing]"
    return sentences_data


# ---------------------------------------------------------------------------
# Paragraph structural label cascade (secondary pass)
# ---------------------------------------------------------------------------

def _cascade_para_struct_label(sentences_data: list[dict]) -> list[dict]:
    """
    Cascade structural section labels across sentences in a paragraph.

    Scans all sentences for structural labels (Rule:, Analysis:, Application — X:,
    Conclusion:).  Whenever one is found it becomes the *active cascade label*;
    subsequent sentences that carry no struct label of their own are re-labeled
    to match.  The active label is set to None for ISSUE sections (never cascaded)
    and updates again when the next non-ISSUE struct label is encountered.

    Three usage patterns handled:
    ① Separate paragraphs (standard .docx upload, one section per paragraph):
       Each "Rule:", "Analysis:", "Conclusion:" paragraph is processed alone.
       The cascade straightens mislabeling within that paragraph — e.g. citation
       sentences in an Analysis paragraph that RULE signals forced to RULE →
       re-labeled APPLICATION.
    ② Combined block starting with "Rule:" (pasted without blank lines):
       "Rule: … Analysis: Beaumont filed … At the time … Conclusion: …"
       Cascade switches RULE → APPLICATION at the "Analysis:" sentence, then
       APPLICATION → CONCLUSION at "Conclusion:".
    ③ Combined block starting with "Issue: Whether …" (IRAC essays pasted or
       docx-grouped):
       "Issue: Whether…" is classified ISSUE with trigger "whether" — the struct
       prefix is stripped internally — so sentence 0 does NOT carry a
       "[section label:" trigger.  The function therefore must NOT require
       sentence 0 to have a struct label.  Instead it scans all sentences and
       activates the cascade at the first non-ISSUE struct label (e.g. "Rule:").

    Exceptions — never cascade-overridden:
    - Sentences that carry their own structural label (already correctly labeled).
    - ISSUE-labeled sentences.
    - Sentences that appear before the first non-ISSUE struct label is seen.
    """
    if not sentences_data:
        return sentences_data

    # Fast path: if no sentence has a struct label there is nothing to cascade.
    if not any(sd.get("trigger_phrase", "").startswith("[section label:")
               for sd in sentences_data):
        return sentences_data

    # current_cascade = None  →  cascade not yet active (pre-Rule in IRAC block,
    #                             or inside an ISSUE section).
    current_cascade = None

    for sd in sentences_data:
        trig = sd.get("trigger_phrase", "")
        if trig.startswith("[section label:"):
            # Structural section marker — update the running cascade label.
            new_lbl = sd["label"]
            current_cascade = None if new_lbl == "ISSUE" else new_lbl
            # This sentence is already correctly labeled; leave it untouched.
            continue

        if current_cascade is None:
            continue  # cascade not active yet
        if sd["label"] == "ISSUE":
            continue  # never override genuine ISSUE sentences

        if sd["label"] != current_cascade:
            sd["label"] = current_cascade
            sd["color_hex"] = LABEL_COLORS[current_cascade]
            sd["trigger_phrase"] = f"[para cascade: {current_cascade.lower()}]"

    return sentences_data


# ---------------------------------------------------------------------------
# Final-sentence conclusion promotion (secondary pass)
# ---------------------------------------------------------------------------

def _promote_last_conclusion(sentences_data: list[dict]) -> list[dict]:
    """
    Secondary pass: if the last sentence is UNCLASSIFIED, has no citation, no
    strong rule signal, and there is at least one RULE or APPLICATION sentence
    earlier in the paragraph — promote it to CONCLUSION.

    This handles closing conclusion assertions in unlabeled student writing that
    use no classic starters ("Therefore,…") and no hedge words:
        "The court has subject-matter jurisdiction over it."
        "Great Basin's removal was procedurally proper."
        "Counterclaim 1 is compulsory under Rule 13(a)." — guarded by citation ✓

    Guard: does NOT fire when prior sentences are all UNCLASSIFIED/ISSUE (e.g.,
    roadmap paragraphs, pure fact-narrative paragraphs) — requires actual
    RULE or APPLICATION content to have appeared earlier in the same paragraph.
    """
    if not sentences_data:
        return sentences_data
    last = sentences_data[-1]
    if last["label"] != "UNCLASSIFIED":
        return sentences_data
    # Require RULE or APPLICATION context earlier in the paragraph
    prior_labels = {s["label"] for s in sentences_data[:-1]}
    if "RULE" not in prior_labels and "APPLICATION" not in prior_labels:
        return sentences_data
    # Guard: don't fire for citation sentences (they stay RULE) or issue phrases
    if _has_citation(last["text"]):
        return sentences_data
    if re.match(r'^whether\b', last["text"], re.I):
        return sentences_data
    # Guard: don't fire if the sentence has any strong rule signal
    _, strong, _ = _count_rule_signals(last["text"], last["text"].lower())
    if strong > 0:
        return sentences_data
    # Guard: require at least 4 words to exclude trivial fragments
    if len(last["text"].split()) < 4:
        return sentences_data
    # Promote to CONCLUSION
    last["label"] = "CONCLUSION"
    last["color_hex"] = LABEL_COLORS["CONCLUSION"]
    last["trigger_phrase"] = "[final sentence, no strong rule signal]"
    return sentences_data


# ---------------------------------------------------------------------------
# Paragraph badge logic
# ---------------------------------------------------------------------------

def _compute_badge(sentences_data: list[dict], framework: str) -> tuple[str, str, str]:
    """Return (badge_key, badge_label, suggestion_text) from observed structure."""
    labels = [s["label"] for s in sentences_data]
    label_set = set(labels)
    has_blend = any(s.get("blend") for s in sentences_data)
    n = len(sentences_data)

    has_issue = "ISSUE" in label_set
    has_rule = "RULE" in label_set or "EXPLANATION" in label_set
    has_explanation = "EXPLANATION" in label_set
    has_application = "APPLICATION" in label_set
    has_conclusion = "CONCLUSION" in label_set
    conclusion_count = labels.count("CONCLUSION")

    if n <= 2 and not has_rule and not has_application:
        return "INFO_INTRODUCTORY", "ℹ️ Introductory / Transition", ""
    if label_set <= {"ISSUE", "UNCLASSIFIED"} and "ISSUE" in label_set:
        return "INFO_INTRODUCTORY", "ℹ️ Introductory / Transition", ""

    unclassified_count = labels.count("UNCLASSIFIED")
    if n > 0 and unclassified_count / n > 0.6:
        return "INFO_MOSTLY_UNCLASSIFIED", "❓ Mostly Unclassified", ""

    if has_explanation and has_application:
        first_exp_idx = next((i for i, s in enumerate(sentences_data) if s["label"] == "EXPLANATION"), None)
        last_app_idx = next((i for i, s in enumerate(reversed(sentences_data)) if s["label"] == "APPLICATION"), None)
        if last_app_idx is not None and first_exp_idx is not None:
            last_app_fwd = n - 1 - last_app_idx
            if first_exp_idx > last_app_fwd:
                return (
                    "WARNING_EXPLANATION_AFTER_APPLICATION",
                    "⚠️ Structural Disorder: Explanation After Application",
                    SUGGESTIONS["WARNING_EXPLANATION_AFTER_APPLICATION"],
                )

    if has_blend:
        return "WARNING_BLEND", "⚠️ Rule/Application Blend Detected", SUGGESTIONS["WARNING_BLEND"]

    if has_application and not has_rule:
        return "WARNING_MISSING_RULE", "⚠️ Missing Rule", SUGGESTIONS["WARNING_MISSING_RULE"]

    first_rule_idx = next((i for i, s in enumerate(sentences_data) if s["label"] in ("RULE", "EXPLANATION")), None)
    first_app_idx = next((i for i, s in enumerate(sentences_data) if s["label"] == "APPLICATION"), None)
    first_conc_idx = next((i for i, s in enumerate(sentences_data) if s["label"] == "CONCLUSION"), None)
    reverse_conc_idx = next((i for i, s in enumerate(reversed(sentences_data)) if s["label"] == "CONCLUSION"), None)
    last_conc_idx = n - 1 - reverse_conc_idx if reverse_conc_idx is not None else None
    first_issue_idx = next((i for i, s in enumerate(sentences_data) if s["label"] == "ISSUE"), None)

    if has_application and has_rule and first_rule_idx is not None and first_app_idx is not None:
        if first_app_idx < first_rule_idx:
            return (
                "WARNING_APPLICATION_WITHOUT_RULE",
                "⚠️ Application Before Rule",
                SUGGESTIONS["WARNING_APPLICATION_WITHOUT_RULE"],
            )

    if has_rule and not has_application:
        return (
            "WARNING_MISSING_APPLICATION",
            "⚠️ Missing Application",
            SUGGESTIONS["WARNING_MISSING_APPLICATION"],
        )

    if (has_rule or has_application) and not has_conclusion:
        return (
            "WARNING_MISSING_CONCLUSION",
            "⚠️ Missing Conclusion",
            SUGGESTIONS["WARNING_MISSING_CONCLUSION"],
        )

    if not (has_rule and has_application and has_conclusion):
        return "INFO_MOSTLY_UNCLASSIFIED", "❓ Mostly Unclassified", ""

    opens_with_conclusion = first_conc_idx == 0
    closes_with_conclusion = (
        last_conc_idx is not None
        and first_app_idx is not None
        and last_conc_idx > first_app_idx
    )

    if opens_with_conclusion and conclusion_count >= 2 and closes_with_conclusion:
        if has_explanation:
            return "COMPLETE_CREAC", "✅ CREAC Complete", ""
        return "COMPLETE_CRAC", "✅ CRAC Complete", ""

    if first_conc_idx is not None and first_rule_idx is not None and first_conc_idx < first_rule_idx:
        return (
            "WARNING_APPLICATION_WITHOUT_RULE",
            "⚠️ Structural Disorder: Conclusion Before Rule",
            SUGGESTIONS["WARNING_APPLICATION_WITHOUT_RULE"],
        )

    if (
        has_issue
        and first_issue_idx is not None
        and first_rule_idx is not None
        and first_issue_idx < first_rule_idx
    ):
        return "COMPLETE_IRAC", "✅ IRAC Complete", ""

    return "COMPLETE_RAC", "✅ RAC Complete", ""


def _structure_score(sentences_data: list[dict], badge_key: str, framework: str) -> int:
    """Simple 0-100 structural completeness score for student-facing feedback."""
    labels = [s["label"] for s in sentences_data]
    label_set = set(labels)
    has_rule = "RULE" in label_set or "EXPLANATION" in label_set
    has_application = "APPLICATION" in label_set
    has_conclusion = "CONCLUSION" in label_set
    has_issue = "ISSUE" in label_set
    has_explanation = "EXPLANATION" in label_set

    score = 0
    if framework == "IRAC":
        score += 20 if has_issue else 10
        score += 25 if has_rule else 0
        score += 30 if has_application else 0
        score += 25 if has_conclusion else 0
    elif framework == "CREAC":
        score += 20 if labels.count("CONCLUSION") >= 2 else 10 if has_conclusion else 0
        score += 20 if has_rule else 0
        score += 20 if has_explanation else 0
        score += 25 if has_application else 0
        score += 15 if badge_key == "COMPLETE_CREAC" else 0
    else:
        score += 25 if labels.count("CONCLUSION") >= 2 else 10 if has_conclusion else 0
        score += 30 if has_rule else 0
        score += 30 if has_application else 0
        score += 15 if badge_key == "COMPLETE_CRAC" else 0

    if badge_key.startswith("COMPLETE"):
        score = max(score, 92)
    elif badge_key.startswith("WARNING"):
        score = min(score, 78)
    elif badge_key == "INFO_MOSTLY_UNCLASSIFIED":
        score = min(score, 45)

    blend_penalty = 10 if any(s.get("blend") for s in sentences_data) else 0
    low_conf_penalty = min(12, 4 * sum(1 for s in sentences_data if s.get("confidence_label") == "low"))
    return max(0, min(100, score - blend_penalty - low_conf_penalty))


def _revision_priorities(
    sentences_data: list[dict],
    badge_key: str,
    framework: str,
    cross_para_note: str = "",
) -> list[dict]:
    """Ordered paragraph-level coaching items independent of the badge label."""
    labels = [s["label"] for s in sentences_data]
    label_set = set(labels)
    priorities: list[dict] = []

    def add(kind: str, title: str, detail: str, severity: str = "info") -> None:
        if not any(item["kind"] == kind for item in priorities):
            priorities.append({
                "kind": kind,
                "title": title,
                "detail": detail,
                "severity": severity,
            })

    if badge_key == "WARNING_MISSING_RULE":
        add(
            "missing_rule",
            "State the governing rule before applying facts.",
            "A 1L reader should see the legal standard before the paragraph turns to what happened here.",
            "warning",
        )
    elif badge_key == "WARNING_MISSING_APPLICATION":
        add(
            "missing_application",
            "Connect the rule to the specific facts.",
            "This paragraph states law but needs the facts-to-element reasoning that earns most exam points.",
            "warning",
        )
    elif badge_key == "WARNING_MISSING_CONCLUSION":
        add(
            "missing_conclusion",
            "Close with a likely legal result.",
            "End the unit by saying who likely wins, loses, satisfies an element, or fails a requirement.",
            "warning",
        )
    elif badge_key == "WARNING_APPLICATION_WITHOUT_RULE":
        add(
            "premature_application",
            "Move rule before application.",
            "Readers should not have to infer the legal test after seeing the facts applied.",
            "warning",
        )
    elif badge_key == "WARNING_EXPLANATION_AFTER_APPLICATION":
        add(
            "creac_order",
            "Move case explanation before client-fact application.",
            "In CREAC, case illustrations explain the rule before you apply it to the current facts.",
            "warning",
        )
    elif badge_key == "INFO_MOSTLY_UNCLASSIFIED":
        add(
            "unclear_structure",
            "Make the structural role of the paragraph clearer.",
            "Add explicit legal-writing signals if this paragraph is meant to do IRAC/CREAC work.",
            "info",
        )
    elif badge_key == "INFO_INTRODUCTORY":
        add(
            "roadmap_or_transition",
            "Likely roadmap or transition.",
            "This may be fine if it is only introducing the analysis; the next paragraph should carry the rule/application work.",
            "info",
        )

    if any(s.get("blend") for s in sentences_data):
        add(
            "blend",
            "Split blended rule/application sentences.",
            "Separate abstract law from fact-specific analysis so each sentence has one structural job.",
            "warning",
        )

    low_conf = [s for s in sentences_data if s.get("confidence_label") == "low"]
    if low_conf:
        add(
            "low_confidence",
            "Review low-confidence highlights.",
            "The tool is least certain about one or more sentences; use the hover explanation as a prompt, not a verdict.",
            "info",
        )

    if any(s.get("counterargument") for s in sentences_data):
        add(
            "counterargument_needs_response",
            "Answer the opposing argument.",
            "A counterargument is useful only if the paragraph responds with rule-based application to the current facts.",
            "warning",
        )

    rule_count = labels.count("RULE") + labels.count("EXPLANATION")
    if rule_count >= 3 and "APPLICATION" not in label_set:
        add(
            "rule_dump",
            "Rule dump risk.",
            "Several sentences state law without applying it. Add facts-to-rule reasoning after the rule statement.",
            "warning",
        )

    if "APPLICATION" in label_set and "RULE" not in label_set and "EXPLANATION" not in label_set:
        add(
            "unsupported_application",
            "Application needs a legal anchor.",
            "Facts should be tied to a stated statute, doctrine, element, or case rule.",
            "warning",
        )

    if framework == "CREAC" and "EXPLANATION" not in label_set and "RULE" in label_set and "APPLICATION" in label_set:
        add(
            "unsupported_case_illustration",
            "Consider adding case explanation if CREAC is expected.",
            "A CREAC paragraph normally uses precedent reasoning between the rule and current-fact application.",
            "info",
        )

    if cross_para_note:
        add(
            "cross_paragraph_split",
            "Rule and application may be split across paragraphs.",
            cross_para_note,
            "info",
        )

    return priorities[:5]


def _training_summary(
    badge_key: str,
    badge_label: str,
    score: int,
    priorities: list[dict],
) -> str:
    if badge_key.startswith("COMPLETE") and not any(p["severity"] == "warning" for p in priorities):
        return (
            f"{badge_label} with a structure score of {score}. The paragraph has the core moves; "
            "use the highlights to check whether each sentence is doing only one job."
        )
    if priorities:
        first = priorities[0]
        return (
            f"{badge_label} with a structure score of {score}. First revision priority: "
            f"{first['title']} {first['detail']}"
        )
    return (
        f"{badge_label} with a structure score of {score}. Review the sentence-level highlights "
        "for the clearest next revision move."
    )


def _attach_paragraph_training_fields(para: dict) -> None:
    score = _structure_score(para["sentences"], para["badge"], para.get("effective_framework", "IRAC"))
    priorities = _revision_priorities(
        para["sentences"],
        para["badge"],
        para.get("effective_framework", "IRAC"),
        para.get("cross_para_note", ""),
    )
    para["structure_score"] = score
    para["revision_priorities"] = priorities
    para["training_summary"] = _training_summary(para["badge"], para["badge_label"], score, priorities)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def classify_text(paragraphs: list[str], framework: str) -> dict:
    """
    Classify a list of paragraph strings and return the full analysis dict.

    framework: "AUTO", "IRAC", "CREAC", or "CRAC"
    """
    framework = (framework or "AUTO").upper()
    if framework not in ("AUTO", "IRAC", "CREAC", "CRAC"):
        framework = "AUTO"

    party_names = _extract_party_names(paragraphs)

    result_paragraphs = []
    first_sentence_of_doc = True

    label_counts = {
        "ISSUE": 0,
        "RULE": 0,
        "EXPLANATION": 0,
        "APPLICATION": 0,
        "CONCLUSION": 0,
        "UNCLASSIFIED": 0,
    }
    total_sentences = 0
    blend_count = 0
    complete_paragraphs = 0
    warning_paragraphs = 0

    for para_idx, para_text in enumerate(paragraphs):
        # Per-paragraph framework: auto-upgrade IRAC → CREAC when the paragraph
        # contains case-illustration language (explanation phrase + citation).
        # CREAC and CRAC user selections are never overridden.
        effective_framework = _auto_detect_framework(para_text, framework)

        try:
            raw_sentences = nltk.sent_tokenize(para_text)
        except Exception:
            raw_sentences = re.split(r'(?<=[.!?])\s+', para_text)

        # Merge citation fragments caused by NLTK splitting on abbreviations
        raw_sentences = _merge_citation_fragments(raw_sentences)
        raw_sentences = [s.strip() for s in raw_sentences if s.strip()]

        sentences_data = []
        for sent_idx, sent_text in enumerate(raw_sentences):
            label, trigger = _classify_sentence(
                sent_text,
                sent_idx,
                len(raw_sentences),
                first_sentence_of_doc,
                effective_framework,
                party_names,
            )
            first_sentence_of_doc = False

            sentences_data.append({
                "text": sent_text,
                "label": label,
                "color_hex": LABEL_COLORS[label],
                "blend": False,
                "blend_type": None,
                "counterargument": _is_counterargument(sent_text),
                "trigger_phrase": trigger,
            })

        sentences_data = _detect_blends(sentences_data)
        sentences_data = _smooth_by_context(sentences_data)
        sentences_data = _cascade_para_struct_label(sentences_data)
        sentences_data = _promote_last_conclusion(sentences_data)

        # Post-process: standalone citation sentences inherit the label of the
        # preceding labeled sentence so they share the same highlight color.
        # A "standalone citation" is UNCLASSIFIED, has a citation signal, and
        # either (a) is short (≤ 15 words) or (b) starts with a citation signal
        # word like "See", "Id.", "Cf.", "Accord".
        prev_known_label = None
        for sd in sentences_data:
            if sd["label"] != "UNCLASSIFIED":
                prev_known_label = sd["label"]
            elif prev_known_label is not None:
                words = sd["text"].split()
                is_short_cite = len(words) <= 15 and _has_citation(sd["text"])
                is_see_cite = _CITE_STARTERS.match(sd["text"]) and _has_citation(sd["text"])
                if is_short_cite or is_see_cite:
                    sd["label"] = prev_known_label
                    sd["color_hex"] = LABEL_COLORS[prev_known_label]
                    sd["trigger_phrase"] = "[standalone citation — inherits preceding label]"

        sentences_data = _refresh_sentence_evidence(sentences_data, effective_framework, party_names)

        badge_key, badge_label, suggestion = _compute_badge(sentences_data, effective_framework)

        for sent in sentences_data:
            lbl = sent["label"]
            if lbl in label_counts:
                label_counts[lbl] += 1
            total_sentences += 1
            if sent["blend"]:
                blend_count += 1

        if badge_key.startswith("COMPLETE"):
            complete_paragraphs += 1
        elif badge_key.startswith("WARNING"):
            warning_paragraphs += 1

        clean_sentences = [
            {
                "text": s["text"],
                "label": s["label"],
                "color_hex": s["color_hex"],
                "blend": s["blend"],
                "counterargument": s.get("counterargument", False),
                "trigger_phrase": s["trigger_phrase"],
                "confidence": s.get("confidence", 0.0),
                "confidence_label": s.get("confidence_label", "low"),
                "evidence_scores": s.get("evidence_scores", {}),
                "competing_labels": s.get("competing_labels", []),
                "evidence": s.get("evidence", []),
                "revision_hint": s.get("revision_hint", ""),
                "uncertainty_reason": s.get("uncertainty_reason", ""),
            }
            for s in sentences_data
        ]

        result_paragraphs.append({
            "paragraph_index": para_idx,
            "badge": badge_key,
            "badge_label": badge_label,
            "suggestion": suggestion,
            "effective_framework": effective_framework,
            "sentences": clean_sentences,
            "cross_para_note": "",
        })

    # -----------------------------------------------------------------------
    # Cross-paragraph context notes
    # When adjacent paragraphs together would form a complete structure but are
    # split by a paragraph break, add a note pointing to the other paragraph.
    # -----------------------------------------------------------------------
    n_paras = len(result_paragraphs)
    for i, para in enumerate(result_paragraphs):
        badge = para["badge"]
        prev_labels = {s["label"] for s in result_paragraphs[i - 1]["sentences"]} if i > 0 else set()
        next_labels = {s["label"] for s in result_paragraphs[i + 1]["sentences"]} if i + 1 < n_paras else set()

        if badge == "WARNING_MISSING_APPLICATION":
            if "APPLICATION" in next_labels:
                para["cross_para_note"] = (
                    "The application of these facts appears in the next paragraph. "
                    "In IRAC/CREAC, rule and application belong in the same paragraph."
                )
            elif "APPLICATION" in prev_labels:
                para["cross_para_note"] = (
                    "The application of these facts appears in the preceding paragraph. "
                    "In IRAC/CREAC, rule and application belong in the same paragraph."
                )

        elif badge == "WARNING_MISSING_RULE":
            rule_labels = {"RULE", "EXPLANATION"}
            if rule_labels & next_labels:
                para["cross_para_note"] = (
                    "The governing rule appears in the next paragraph. "
                    "In IRAC/CREAC, rule and application belong in the same paragraph."
                )
            elif rule_labels & prev_labels:
                para["cross_para_note"] = (
                    "The governing rule appears in the preceding paragraph. "
                    "In IRAC/CREAC, rule and application belong in the same paragraph."
                )

    for para in result_paragraphs:
        _attach_paragraph_training_fields(para)

    return {
        "framework": framework,
        "paragraphs": result_paragraphs,
        "summary": {
            "total_paragraphs": len(result_paragraphs),
            "complete_paragraphs": complete_paragraphs,
            "warning_paragraphs": warning_paragraphs,
            "total_sentences": total_sentences,
            "blend_count": blend_count,
            "label_counts": label_counts,
        },
    }
