// Plain-text ingestion: split pasted text into paragraphs, with the same
// grouping conveniences as the archived Python parser:
//  - consecutive struct-labeled paragraphs (Rule:, Analysis:, Conclusion:)
//    merge into one block so a complete answer earns one COMPLETE badge;
//  - the QA test-document format ("TEST CASE A-1 | …") groups sentences per
//    test case.
// Returns { paragraphs, warnings }.

import { STRUCT_LABEL_RE } from "../engine/lexicon.js";

const TEST_CASE_RE = /^TEST CASE [A-Z]-\d+\s*\|/i;

const TESTDOC_SKIP = [
  /^Note:/i,
  /^PART [A-D]\b/i,
  /^IRAC\/CREAC Structural/i,
  /^Test Document/i,
  /^Prepared for/i,
  /^Color legend/i,
  /^This document/i,
  /^The table below/i,
];

/** Merge consecutive struct-labeled paragraphs into single blocks. */
function groupStructLabeled(paragraphs) {
  const result = [];
  let group = [];
  for (const para of paragraphs) {
    if (STRUCT_LABEL_RE.test(para)) {
      group.push(para);
    } else {
      if (group.length) {
        result.push(group.join(" "));
        group = [];
      }
      result.push(para);
    }
  }
  if (group.length) result.push(group.join(" "));
  return result;
}

/** Group QA test-document sentences back into one string per test case. */
function groupByTestCase(rawParas) {
  const groups = [];
  let current = [];
  let inContent = false;

  for (const text of rawParas) {
    if (!text) continue;
    if (/^PART D\b/i.test(text) || text.includes("Answer Key")) break;

    if (TEST_CASE_RE.test(text)) {
      if (inContent && current.length) {
        groups.push(current.join(" "));
        current = [];
      }
      inContent = true;
      continue;
    }

    if (!inContent) continue;
    if (TESTDOC_SKIP.some((pat) => pat.test(text))) continue;
    current.push(text);
  }

  if (current.length) groups.push(current.join(" "));
  return groups;
}

/** Split plain text on blank lines into paragraphs. */
export function parsePlaintext(text) {
  const raw = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = raw.split("\n\n");
  let paragraphs = blocks.map((b) => b.trim()).filter(Boolean);

  if (paragraphs.some((p) => TEST_CASE_RE.test(p))) {
    paragraphs = groupByTestCase(paragraphs);
  } else {
    paragraphs = groupStructLabeled(paragraphs);
  }
  return { paragraphs, warnings: [] };
}
