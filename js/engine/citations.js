// Citation detection. Ported 1:1 from RULE_CITATION_PATTERNS in the archived
// Python constants; pattern order matters only for readability — hasCitation
// is a boolean OR over all of them.

export const RULE_CITATION_PATTERNS = [
  /\bv\.\s+[A-Z]/, // case name: X v. Y
  /\bv\s+[A-Z]/, // case name without period
  /§/, // statute section symbol
  /\bU\.S\.C\./, // federal statute
  /\bC\.F\.R\./, // federal regulation
  /\bU\.S\.\s+Const\b/i, // U.S. Constitution
  /\bamend\.\s+[IVX]+\b/, // Constitutional amendment: amend. IV
  /\bart\.\s+[IVX]+\b/i, // Constitutional article
  /\bRestatement\b/i, // Restatement
  /\bU\.C\.C\./, // Uniform Commercial Code
  /\d+\s+[A-Z]\w*\.?\s+\d+/, // reporter-style: 123 F.3d 456
  /\(\d{4}\)/, // parenthetical year: (2001)
  /\bId\.\b/, // Id.
  /\bsupra\b/i,
  /\binfra\b/i,
  /\bFed\.\s+R\./, // Fed. R. Civ. P., Fed. R. Evid., etc.
  /\bRule\s+\d+\b/, // Rule 12, Rule 56, Rule 702
  /\bFederal\s+Rule\s+of\b/i, // Federal Rule of Evidence / Civil Procedure
];

export function hasCitation(sentence) {
  return RULE_CITATION_PATTERNS.some((pattern) => pattern.test(sentence));
}
