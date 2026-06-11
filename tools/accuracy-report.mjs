// Accuracy report: runs the engine over the labeled corpus and prints
// per-label precision/recall/F1, a confusion matrix, and badge accuracy.
//
// Ground truth comes from two corpus sources:
//   - cases with expect.labels (full per-sentence label lists)
//   - cases with expect.para_expected_labels (struct-prefixed paragraphs)
// Badge accuracy comes from every case with expect.badge.
//
// Usage:
//   node tools/accuracy-report.mjs           report only
//   node tools/accuracy-report.mjs --ci      exit 1 if below floors (CI gate)
//
// CI floors are conservative: they gate the committed corpus only (the
// professor-material corpus in test/corpus-local is included automatically
// when present locally but never exists in CI).

import { classifyText } from "../js/engine/classify.js";
import { loadCorpusCases } from "../test/helpers.mjs";

const CI_MODE = process.argv.includes("--ci");

// Minimum acceptable metrics, measured on the committed corpus. The Python
// baseline at port time passed every badge expectation and every labeled
// sentence; keep the floors slightly below 100% to allow trivial churn while
// still catching real regressions.
const FLOORS = {
  badgeAccuracy: 0.97,
  sentenceAccuracy: 0.95,
};

const LABELS = ["ISSUE", "RULE", "EXPLANATION", "APPLICATION", "CONCLUSION", "UNCLASSIFIED"];

const corpus = loadCorpusCases();

let badgeTotal = 0;
let badgeCorrect = 0;
const badgeMisses = [];

// confusion[expected][actual] = count
const confusion = {};
for (const e of LABELS) {
  confusion[e] = {};
  for (const a of LABELS) confusion[e][a] = 0;
}
const sentenceMisses = [];

for (const corpusCase of corpus) {
  const expect = corpusCase.expect || {};
  const result = classifyText(corpusCase.paragraphs, corpusCase.framework);
  const para0 = result.paragraphs[0];

  if (expect.badge) {
    badgeTotal += 1;
    if (para0.badge === expect.badge) badgeCorrect += 1;
    else badgeMisses.push(`${corpusCase.id}: ${para0.badge} (expected ${expect.badge})`);
  }
  if (expect.badge_not_complete) {
    badgeTotal += 1;
    if (!para0.badge.startsWith("COMPLETE")) badgeCorrect += 1;
    else badgeMisses.push(`${corpusCase.id}: ${para0.badge} (expected non-COMPLETE)`);
  }

  if (expect.labels) {
    expect.labels.forEach((expLabel, si) => {
      const actLabel = para0.sentences[si]?.label ?? "UNCLASSIFIED";
      confusion[expLabel][actLabel] += 1;
      if (actLabel !== expLabel) {
        sentenceMisses.push(
          `${corpusCase.id} s${si}: ${actLabel} (expected ${expLabel}) "${para0.sentences[si]?.text.slice(0, 70)}"`
        );
      }
    });
  }

  if (expect.para_expected_labels) {
    expect.para_expected_labels.forEach((expLabel, pi) => {
      if (!expLabel) return;
      for (const s of result.paragraphs[pi].sentences) {
        confusion[expLabel][s.label] += 1;
        if (s.label !== expLabel) {
          sentenceMisses.push(
            `${corpusCase.id} ¶${pi}: ${s.label} (expected ${expLabel}) "${s.text.slice(0, 70)}"`
          );
        }
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

const totals = { tp: 0, all: 0 };
const rows = [];
for (const label of LABELS) {
  const tp = confusion[label][label];
  const expectedCount = LABELS.reduce((sum, a) => sum + confusion[label][a], 0);
  const predictedCount = LABELS.reduce((sum, e) => sum + confusion[e][label], 0);
  if (expectedCount === 0 && predictedCount === 0) continue;
  const precision = predictedCount ? tp / predictedCount : 0;
  const recall = expectedCount ? tp / expectedCount : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  totals.tp += tp;
  totals.all += expectedCount;
  rows.push({ label, expectedCount, precision, recall, f1 });
}

const pct = (v) => `${(v * 100).toFixed(1)}%`;

console.log(`\nAccuracy report — ${corpus.length} corpus cases`);
console.log("=".repeat(64));
console.log("Label          n      precision  recall   F1");
for (const r of rows) {
  console.log(
    `${r.label.padEnd(14)} ${String(r.expectedCount).padEnd(6)} ${pct(r.precision).padEnd(10)} ${pct(r.recall).padEnd(8)} ${pct(r.f1)}`
  );
}

const sentenceAccuracy = totals.all ? totals.tp / totals.all : 1;
const badgeAccuracy = badgeTotal ? badgeCorrect / badgeTotal : 1;

console.log("-".repeat(64));
console.log(`Sentence accuracy: ${totals.tp}/${totals.all} (${pct(sentenceAccuracy)})`);
console.log(`Badge accuracy:    ${badgeCorrect}/${badgeTotal} (${pct(badgeAccuracy)})`);

if (sentenceMisses.length) {
  console.log(`\nSentence misses (${sentenceMisses.length}):`);
  for (const miss of sentenceMisses.slice(0, 25)) console.log(`  ${miss}`);
}
if (badgeMisses.length) {
  console.log(`\nBadge misses (${badgeMisses.length}):`);
  for (const miss of badgeMisses) console.log(`  ${miss}`);
}

console.log("\nConfusion matrix (rows = expected, cols = actual):");
const short = (l) => l.slice(0, 5).padEnd(6);
console.log("        " + LABELS.map(short).join(""));
for (const e of LABELS) {
  const rowSum = LABELS.reduce((s, a) => s + confusion[e][a], 0);
  if (!rowSum) continue;
  console.log(short(e) + "  " + LABELS.map((a) => String(confusion[e][a]).padEnd(6)).join(""));
}

if (CI_MODE) {
  const failures = [];
  if (badgeAccuracy < FLOORS.badgeAccuracy) {
    failures.push(`badge accuracy ${pct(badgeAccuracy)} < floor ${pct(FLOORS.badgeAccuracy)}`);
  }
  if (sentenceAccuracy < FLOORS.sentenceAccuracy) {
    failures.push(
      `sentence accuracy ${pct(sentenceAccuracy)} < floor ${pct(FLOORS.sentenceAccuracy)}`
    );
  }
  if (failures.length) {
    console.error(`\nACCURACY GATE FAILED:\n  ${failures.join("\n  ")}`);
    process.exit(1);
  }
  console.log("\nAccuracy gate passed.");
}
