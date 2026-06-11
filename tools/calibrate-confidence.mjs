// Confidence calibration report.
//
// Runs the engine over every labeled corpus sentence and reports, per
// confidence band and per 0.05-confidence bucket, how often the predicted
// label matched the hand label. The bands are coaching language, so they
// should roughly mean: high ≈ ≥90% observed accuracy, medium ≈ 70–90%,
// low < 70%. If the report drifts from that, adjust the thresholds in
// js/engine/evidence.js confidenceBand().
//
// Usage: node tools/calibrate-confidence.mjs

import { classifyText } from "../js/engine/classify.js";
import { loadCorpusCases } from "../test/helpers.mjs";

const corpus = loadCorpusCases();

const samples = []; // { confidence, band, correct }

for (const corpusCase of corpus) {
  const expect = corpusCase.expect || {};
  const result = classifyText(corpusCase.paragraphs, corpusCase.framework);

  if (expect.labels) {
    const para = result.paragraphs[0];
    expect.labels.forEach((expLabel, si) => {
      const s = para.sentences[si];
      if (!s) return;
      samples.push({
        confidence: s.confidence,
        band: s.confidence_label,
        correct: s.label === expLabel,
      });
    });
  }
  if (expect.para_expected_labels) {
    expect.para_expected_labels.forEach((expLabel, pi) => {
      if (!expLabel) return;
      for (const s of result.paragraphs[pi].sentences) {
        samples.push({
          confidence: s.confidence,
          band: s.confidence_label,
          correct: s.label === expLabel,
        });
      }
    });
  }
}

const pct = (num, den) => (den ? `${((num / den) * 100).toFixed(1)}%` : "—");

console.log(`\nConfidence calibration — ${samples.length} labeled sentences`);
console.log("=".repeat(56));

console.log("\nBy band:");
for (const band of ["high", "medium", "low"]) {
  const rows = samples.filter((s) => s.band === band);
  const correct = rows.filter((s) => s.correct).length;
  console.log(
    `  ${band.padEnd(7)} n=${String(rows.length).padEnd(5)} observed accuracy ${pct(correct, rows.length)}`
  );
}

console.log("\nBy confidence bucket:");
for (let lo = 0.5; lo < 1.0; lo += 0.05) {
  const hi = lo + 0.05;
  const rows = samples.filter((s) => s.confidence >= lo - 1e-9 && s.confidence < hi - 1e-9);
  if (!rows.length) continue;
  const correct = rows.filter((s) => s.correct).length;
  console.log(
    `  [${lo.toFixed(2)}, ${hi.toFixed(2)})  n=${String(rows.length).padEnd(5)} accuracy ${pct(correct, rows.length)}`
  );
}
console.log();
