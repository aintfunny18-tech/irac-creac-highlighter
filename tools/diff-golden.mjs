// Debug helper: diff JS engine output against Python golden for given case ids.
// Usage: node tools/diff-golden.mjs <case-id> [<case-id> ...]
import { classifyText } from "../js/engine/classify.js";
import { loadCorpusCases, loadGolden } from "../test/helpers.mjs";

const ids = process.argv.slice(2);
const corpus = loadCorpusCases();
const golden = loadGolden();

for (const id of ids) {
  const corpusCase = corpus.find((c) => c.id === id);
  const expected = golden[id];
  if (!corpusCase || !expected) {
    console.log(`!! ${id}: not found`);
    continue;
  }
  const actual = classifyText(corpusCase.paragraphs, corpusCase.framework);
  console.log("=".repeat(72));
  console.log(id);
  expected.paragraphs.forEach((expPara, pi) => {
    const actPara = actual.paragraphs[pi];
    const expTexts = expPara.sentences.map((s) => s.text);
    const actTexts = actPara ? actPara.sentences.map((s) => s.text) : [];
    if (JSON.stringify(expTexts) !== JSON.stringify(actTexts)) {
      console.log(`-- ¶${pi} SEGMENTATION DIFF (py ${expTexts.length} vs js ${actTexts.length})`);
      const n = Math.max(expTexts.length, actTexts.length);
      for (let i = 0; i < n; i++) {
        const e = expTexts[i] ?? "(none)";
        const a = actTexts[i] ?? "(none)";
        if (e === a) {
          console.log(`  [${i}] ${e.slice(0, 80)}`);
          continue;
        }
        console.log(`≠ py[${i}]: ${e}`);
        console.log(`  js[${i}]: ${a}`);
        break; // show first divergence only
      }
      return;
    }
    expPara.sentences.forEach((expSent, si) => {
      const actSent = actPara.sentences[si];
      const diffs = [];
      if (actSent.label !== expSent.label)
        diffs.push(`label ${actSent.label} != ${expSent.label}`);
      if (actSent.trigger_phrase !== expSent.trigger_phrase)
        diffs.push(`trigger "${actSent.trigger_phrase}" != "${expSent.trigger_phrase}"`);
      if (actSent.blend !== expSent.blend) diffs.push(`blend ${actSent.blend}`);
      if (Math.abs(actSent.confidence - expSent.confidence) > 0.001)
        diffs.push(`conf ${actSent.confidence} != ${expSent.confidence}`);
      if (actSent.confidence_label !== expSent.confidence_label)
        diffs.push(`band ${actSent.confidence_label} != ${expSent.confidence_label}`);
      for (const [lbl, sc] of Object.entries(expSent.evidence_scores || {})) {
        const ac = actSent.evidence_scores?.[lbl] ?? 0;
        if (Math.abs(ac - sc) > 0.011) diffs.push(`score[${lbl}] ${ac} != ${sc}`);
      }
      if (diffs.length) {
        console.log(`-- ¶${pi} s${si}: ${diffs.join("; ")}`);
        console.log(`   "${expSent.text.slice(0, 100)}"`);
      }
    });
    if (actPara.badge !== expPara.badge)
      console.log(`-- ¶${pi} BADGE ${actPara.badge} != ${expPara.badge}`);
    if (actPara.structure_score !== expPara.structure_score)
      console.log(`-- ¶${pi} score ${actPara.structure_score} != ${expPara.structure_score}`);
  });
}
