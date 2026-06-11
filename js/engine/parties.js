// Best-effort extraction of party names from the first five paragraphs.
// Port of the Python `_extract_party_names`. Returns a Set of names.

import { PARTY_NAME_STOPWORDS } from "./lexicon.js";

function isUpper(ch) {
  return ch !== undefined && ch === ch.toUpperCase() && ch !== ch.toLowerCase();
}

export function extractPartyNames(paragraphs) {
  const names = new Set();
  const scanText = paragraphs.slice(0, 5).join(" ");

  // Pattern: "X v. Y" case name
  for (const m of scanText.matchAll(
    /([A-Z][A-Za-z\s]+?)\s+v\.\s+([A-Z][A-Za-z\s]+?)(?=[,;.\s])/g
  )) {
    for (const g of [m[1], m[2]]) {
      const parts = g.trim().split(/\s+/);
      const word = parts[parts.length - 1];
      if (word.length > 2 && !PARTY_NAME_STOPWORDS.has(word)) names.add(word);
    }
  }

  // Pattern: "the plaintiff/defendant Name" (case-insensitive scan; the
  // uppercase guard keeps only true proper nouns, mirroring Python's re.I).
  for (const m of scanText.matchAll(
    /\b(?:plaintiff|defendant|appellant|appellee|petitioner|respondent)\s+([A-Z][a-z]+)/gi
  )) {
    const candidate = m[1];
    if (isUpper(candidate[0]) && !PARTY_NAME_STOPWORDS.has(candidate)) {
      names.add(candidate);
    }
  }

  // Pattern: possessive proper nouns — "Morgan's", "BlueSky's"
  for (const m of scanText.matchAll(/\b([A-Z][a-zA-Z]{1,})'s\b/g)) {
    const name = m[1];
    if (name.length > 2 && !PARTY_NAME_STOPWORDS.has(name)) names.add(name);
  }

  // Pattern: CamelCase compound names — "BlueSky", "NeueStruktur"
  for (const m of scanText.matchAll(/\b([A-Z][a-z]+(?:[A-Z][a-z]*)+)\b/g)) {
    const name = m[1];
    if (name.length > 4 && !PARTY_NAME_STOPWORDS.has(name)) names.add(name);
  }

  // Frequent proper nouns (≥ 2 appearances)
  const freq = new Map();
  for (const m of scanText.matchAll(/\b([A-Z][a-z]{2,})\b/g)) {
    const c = m[1];
    if (!PARTY_NAME_STOPWORDS.has(c)) freq.set(c, (freq.get(c) || 0) + 1);
  }
  for (const [name, count] of freq) {
    if (count >= 2) names.add(name);
  }

  return names;
}
