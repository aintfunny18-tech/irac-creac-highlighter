// Small helpers shared across the engine. All functions are pure.
//
// Several helpers intentionally mirror Python semantics from the original
// Flask classifier (archive/flask-app) so the JS engine stays in parity with
// the golden output generated from it.

/** First phrase that the lowercased sentence starts with, else null. */
export function startsWithAny(sentenceLower, phrases) {
  for (const phrase of phrases) {
    if (sentenceLower.startsWith(phrase)) return phrase;
  }
  return null;
}

/** First phrase contained anywhere in the lowercased sentence, else null. */
export function containsAny(sentenceLower, phrases) {
  for (const phrase of phrases) {
    if (sentenceLower.includes(phrase)) return phrase;
  }
  return null;
}

/** Python str.split() — whitespace split with no empty tokens. */
export function words(s) {
  const trimmed = s.trim();
  return trimmed ? trimmed.split(/\s+/) : [];
}

/**
 * Round to 2 decimals the way Python's round() does: by the double's true
 * decimal expansion (0.81499… → 0.81). Multiplying by 100 first would
 * reintroduce float error exactly at band boundaries (0.81499…×100 == 81.5),
 * which is why this uses toFixed instead.
 */
export function round2(v) {
  return Number(v.toFixed(2));
}

/** Escape a literal string for use inside a RegExp. */
export function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
