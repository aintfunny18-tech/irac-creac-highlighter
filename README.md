# Legal Writing Structure Practice

**Live app: https://aintfunny18-tech.github.io/irac-creac-highlighter/**

A teaching tool for 1L legal writing. Paste an exam answer or memo discussion
section and every sentence is highlighted by its structural role — Issue,
Rule, Explanation, Application, Conclusion — with plain-English coaching on
what each paragraph is doing well and what to fix first.

Everything runs **entirely in the browser**: no server, no account, and
student writing never leaves the device. After the first visit the app also
works offline (installable as a PWA on phones and tablets).

## What it does

- Accepts drafts via paste, `.docx` upload, or `.pdf` upload (parsed locally)
- Detects IRAC / RAC / CRAC / CREAC structure paragraph by paragraph
- Highlights each sentence by structural role with confidence bands
- Explains every classification in plain English — hover (or tap) any
  sentence for *why this label*, competing labels, and a next-step hint
- Awards paragraph badges (✅ Complete, ⚠️ Missing Rule, ⚠️ Blend, …) with a
  structure score and ordered revision priorities
- Flags rule/application blends, premature application, rule dumps,
  counterarguments that need answering, and rule/application splits across
  paragraphs
- **Click-to-correct:** when the tool gets a sentence wrong, set the label
  yourself — badges, scores, and coaching update instantly
- One-click **example documents** (a well-formed CREAC office memo and a
  deliberately flawed IRAC exam answer) for classroom demos
- Exports an annotated `.docx` or a printable view (print → save as PDF)

## How the classifier thinks

The classifier is a transparent, deterministic rule engine — no AI model, no
network calls. For each sentence it asks, in priority order: explicit section
labels (`Rule:` / `Analysis:`) → issue framing (“whether…”) → opposing-party
framing → conclusion signals (position openers, “Therefore,” hedged outcome
predictions) → application signals (“Here,”, party names + factual verbs,
case-specific subjects) → rule signals (citations, standard phrases like
“must establish”, definitional structure, generic legal subjects) → case
illustrations (CREAC). Secondary passes then smooth context, cascade section
labels, detect blended sentences, and score the evidence behind every label
so the tool can show its work.

It will not reach 100% accuracy — legal writing blends roles, and that is
part of the lesson. Confidence bands and the click-to-correct feature are
designed around that honesty: low-confidence highlights are coaching prompts,
not verdicts.

## Development

No build step. The app is plain ES modules served as static files.

```bash
# serve locally (any static server works)
python -m http.server 4173

# run the test suite (Node 22+)
node --test "test/*.test.mjs"

# accuracy report (per-label precision/recall, confusion matrix, CI gate)
node tools/accuracy-report.mjs

# confidence calibration report
node tools/calibrate-confidence.mjs
```

| Path | Contents |
|---|---|
| `js/engine/` | DOM-free classification engine (rule table, passes, evidence, badges, coaching) |
| `js/parse/` | Paste/.docx/.pdf ingestion (mammoth.js, pdf.js — vendored) |
| `js/ui/` | Rendering, tooltips/detail panels, corrections |
| `js/export/` | Annotated .docx generation (docx — vendored) |
| `test/corpus/` | Hand-labeled corpus across 1L subjects; expectations drive the CI accuracy gate |
| `examples/` | The built-in demo documents (badge-pinned by tests) |
| `tools/` | Accuracy report, calibration report, icon generator |
| `archive/` | The original Python/Flask desktop app (retired, kept runnable) |

Deployments run automatically from `main` via `.github/workflows/pages.yml`:
syntax checks → tests → accuracy gate → publish. A guard step blocks any
source documents from reaching the public artifact.

## Known limitations

- Scanned or image-based PDFs are not supported (no OCR)
- Text boxes, headers, and footers in `.docx` files are not extracted
- Multi-column PDFs may produce garbled text extraction
- Structure scores and confidence are heuristic coaching aids, not
  statistical probabilities or formal assessments
- `.docx` export uses Word's limited highlight palette; APPLICATION
  sentences appear in mustard yellow (closest available to orange)
