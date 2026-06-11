// Legal-aware sentence segmentation.
//
// Replaces NLTK punkt from the archived Python app with a two-layer approach:
//   1. splitSentences: abbreviation-aware boundary detection tuned for legal
//      citations (reporters, "v.", "U.S.C.", "Fed. R. Civ. P.", initials).
//   2. mergeCitationFragments: ported 1:1 from the Python safety net that
//      repaired punkt's over-splitting; it also repairs anything layer 1 still
//      splits inside a citation.
//
// segmentSentences() is the public entry point; its output is verified
// sentence-for-sentence against the Python golden corpus in test/parity.

import { words } from "./util.js";
import { hasCitation } from "./citations.js";

// Lowercased abbreviation tokens (with trailing period) that must never end a
// sentence. Dotted initialisms like "u.s." or "r.r." are handled by pattern.
const ABBREVIATIONS = new Set([
  // signals & latin
  "v.", "vs.", "etc.", "e.g.", "i.e.", "cf.", "id.", "al.", "seq.", "supra.",
  // courts / reporters / statutes
  "u.s.", "u.s.c.", "c.f.r.", "u.c.c.", "f.", "supp.", "ct.", "ed.", "l.ed.",
  "so.", "cal.", "md.", "ill.", "mass.", "wash.", "ariz.", "colo.", "conn.",
  "del.", "fla.", "ga.", "kan.", "ky.", "la.", "mich.", "minn.", "miss.",
  "mo.", "mont.", "neb.", "nev.", "okla.", "or.", "pa.", "tenn.", "tex.",
  "vt.", "va.", "wis.", "wyo.", "app.", "div.", "dist.", "cir.", "ch.",
  // rules
  "fed.", "r.", "civ.", "crim.", "evid.", "p.", "proc.", "stat.", "ann.",
  "reg.", "sec.", "art.", "amend.", "const.", "cong.", "sess.",
  // organizations & titles
  "inc.", "corp.", "co.", "ltd.", "no.", "nos.", "mr.", "mrs.", "ms.", "dr.",
  "prof.", "jr.", "sr.", "st.", "esq.", "dep't.", "dept.", "ass'n.", "bros.",
  // months
  "jan.", "feb.", "mar.", "apr.", "jun.", "jul.", "aug.", "sept.", "sep.",
  "oct.", "nov.", "dec.",
]);

function isLowerLetter(ch) {
  return ch !== undefined && ch !== ch.toUpperCase() && ch === ch.toLowerCase();
}

/** True when the token immediately before a "." must not end a sentence. */
function isProtectedAbbreviation(rawToken) {
  if (!rawToken) return false;
  // Strip opening punctuation that may cling to the token ("(Fed.").
  const token = rawToken.replace(/^["'“‘(\[]+/, "");
  if (/^[A-Z]\.$/.test(token)) return true; // single initial: "A.", "R."
  if (/^(?:[A-Za-z]{1,2}\d{0,2}[a-z]{0,2}\.){2,}$/.test(token)) return true; // "U.S.", "R.R.", "N.Y.", "F.3d."
  return ABBREVIATIONS.has(token.toLowerCase());
}

// Adverbial sentence openers that essentially never follow an abbreviation
// mid-citation. When one follows a protected abbreviation ("…in the U.S.
// Moreover, …"), the abbreviation really did end the sentence.
const STRONG_SENTENCE_OPENERS =
  /^(?:Moreover|However|Therefore|Thus|Accordingly|Furthermore|Additionally|Finally|Consequently|Nevertheless|Nonetheless|First|Second|Third|Next|Also|Instead|Indeed|Further|Similarly|Likewise|Meanwhile|Ultimately|Importantly|Notably)\b/;

// "v." / "vs." bind tighter than any opener — "Brown v. The Board…" must
// never split, so the opener override skips them.
const CASE_SIGNAL_RE = /^["'“‘(\[]*(?:v|vs)\.$/i;

/**
 * Split a paragraph into candidate sentences.
 * A boundary is a run of [.?!] (plus closing quotes/brackets) followed by
 * whitespace — unless the preceding token is a protected abbreviation or the
 * next character is lowercase (mid-sentence continuation).
 */
export function splitSentences(text) {
  const out = [];
  let start = 0;
  const candidate = /([.?!]+)(["'”’)\]]*)(\s+)/g;
  let m;
  while ((m = candidate.exec(text)) !== null) {
    const punctEnd = m.index + m[1].length;
    const boundaryEnd = punctEnd + m[2].length;
    const nextStart = boundaryEnd + m[3].length;
    const next = text[nextStart];
    if (next === undefined) break;
    if (isLowerLetter(next)) continue;
    if (m[1] === ".") {
      const tokenMatch = /(\S+)$/.exec(text.slice(start, punctEnd));
      if (tokenMatch && isProtectedAbbreviation(tokenMatch[1])) {
        const opensNewSentence =
          STRONG_SENTENCE_OPENERS.test(text.slice(nextStart, nextStart + 16)) &&
          !CASE_SIGNAL_RE.test(tokenMatch[1]);
        if (!opensNewSentence) continue;
      }
    }
    out.push(text.slice(start, boundaryEnd));
    start = nextStart;
  }
  if (start < text.length) out.push(text.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
}

const LEGAL_SENTENCE_STARTERS =
  /^(?:under|pursuant\s+to|according\s+to|see|see\s+also|cf\.|accord|restatement|rule|fed\.\s+r\.|[0-9]+\s+u\.s\.c\.)\b/i;

const ARTICLE_OPENER = /^(?:the|this|that|these|those|it|he|she|they|a|an)\b/i;

/**
 * Merge sentence fragments produced by splitting inside legal citations.
 * Direct port of the Python `_merge_citation_fragments`.
 */
export function mergeCitationFragments(sentences) {
  if (!sentences.length) return sentences;

  const merged = [sentences[0]];
  for (const sent of sentences.slice(1)) {
    const ws = words(sent);
    if (!ws.length) continue;
    const first = ws[0];
    const shortCitationishFragment = ws.length < 5 && !ARTICLE_OPENER.test(sent);
    const isFragment =
      shortCitationishFragment ||
      /[0-9]/.test(first[0]) ||
      isLowerLetter(first[0]) ||
      first.startsWith("§") ||
      /^[A-Z][a-z]{0,3}\.$/.test(first) || // "App.", "Md.", "Ill."
      /^(?:[A-Z]\.)+$/.test(first); // "U.S. Const. art. I…" citation tail
    const startsNewLegalSentence = LEGAL_SENTENCE_STARTERS.test(sent);
    if (isFragment) {
      // "Under 28 U.S.C." is a real new rule sentence that tokenizers often
      // chop before the section number. Keep it as the head of a new sentence
      // so later numeric fragments merge forward into it rather than backward
      // into the preceding issue/conclusion sentence.
      if (startsNewLegalSentence && !hasCitation(merged[merged.length - 1])) {
        merged.push(sent);
      } else {
        merged[merged.length - 1] = merged[merged.length - 1] + " " + sent;
      }
    } else {
      merged.push(sent);
    }
  }
  return merged;
}

/** Public entry point: paragraph text → clean sentence strings. */
export function segmentSentences(paraText) {
  const raw = splitSentences(paraText);
  return mergeCitationFragments(raw)
    .map((s) => s.trim())
    .filter(Boolean);
}
