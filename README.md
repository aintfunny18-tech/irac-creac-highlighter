# IRAC/CREAC Structural Highlighter

A fully offline Python desktop application for law students to identify and correct structural deficiencies in legal writing drafts (practice exams, memos).

## What It Does

- Accepts drafts via plain text paste, `.docx` upload, `.pdf` upload, or `.rtf` upload
- Automatically detects IRAC, RAC, CRAC, and CREAC structure by paragraph
- Classifies each sentence as a structural component (Issue, Rule, Explanation, Application, Conclusion, or Unclassified)
- Displays sentence-level color highlighting, paragraph badges, structure scores, and revision-priority coaching
- Shows structured hover explanations with trigger phrase, evidence, confidence, competing labels, uncertainty notes, and next-step hints
- Flags structural problems (missing rules, missing applications, missing conclusions, rule/application blends, premature application, and low-confidence highlights)
- Exports an annotated `.docx` copy with highlights, badges, confidence, structure scores, training summaries, and top revision priorities

## Prerequisites

- Python 3.10 or higher
- pip

## Installation

```bash
pip install -r requirements.txt
```

**Note:** The first run will automatically download NLTK tokenizer data (~1 MB). An internet connection is required for this one-time download only. All subsequent runs are fully offline.

## Usage

```bash
python run.py
```

The app starts a local server and opens your default browser automatically. If port 5050 is in use, it will try ports 5051–5060.

## Input Modes

| Mode | Description |
|---|---|
| Paste Text | Paste draft text directly into the text area |
| Upload .docx | Upload a Word document |
| Upload .pdf | Upload a PDF (text-based; scanned/image PDFs are not supported) |
| Upload .rtf | Upload an RTF document |

## Frameworks

- **IRAC** — Issue, Rule, Application, Conclusion
- **RAC** — Rule, Application, Conclusion
- **CRAC** — Conclusion, Rule, Application, Conclusion
- **CREAC** — Conclusion (opening), Rule, Explanation, Application, Conclusion (closing)

## Training Features

- **Structure score** gives a rough 0-100 completeness signal for discussion and triage, not grading.
- **Revision priorities** identify the most useful structural fix for a paragraph.
- **Confidence bands** help students see when a highlight is a strong read versus a tentative coaching guess.
- **Focus filter** shows only warning, blended, or low-confidence paragraphs.

## Known Limitations

- Scanned or image-based PDFs are not supported (no OCR)
- Text boxes, headers, and footers in `.docx` files are not extracted
- Two-column PDFs may produce garbled text extraction
- Structure scores and confidence are heuristic coaching aids, not statistical probabilities or formal assessments
- `.docx` export uses Word's limited highlight palette; APPLICATION sentences appear in mustard yellow (closest available to orange)
