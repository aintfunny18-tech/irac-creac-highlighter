# Changelog

## 2026-05-23 - Project Rename

- Renamed the project from IRAC/CREAC Structural Highlighter to Legal Writing Structure Coach to match the training-tool direction.
- Updated the browser title/header, README, handoff materials, demo documents, local build README, generated artifact names, PyInstaller spec, and GitHub repository name.
- Kept IRAC, RAC, CRAC, and CREAC terminology in the product because those remain the structures being coached.

## 2026-05-22 - 1L Training Tool Refinement

- Added a training-oriented coaching layer while keeping the app fully offline and deterministic.
- Added sentence-level diagnostics: confidence, competing labels, uncertainty reasons, evidence, trigger phrase, and revision hints.
- Added paragraph-level coaching: structure score, training summary, and ordered revision priorities.
- Added UI support for coaching panels, structured hover tooltips, confidence legend, and a warnings/low-confidence-only focus filter.
- Expanded DOCX export to include average confidence, structure score, training summary, and top revision priorities.
- Cleaned up duplicated classifier helper definitions.
- Added `test_training_tool.py` for the training/coaching response fields and cross-paragraph priority behavior.
- Refreshed demo and handoff materials to reflect the new coaching workflow.

Validation:
- `python test_classifier.py`
- `python test_structural_spectrum.py`
- `python test_perturbations.py`
- `python test_training_tool.py`
- Bundled Node syntax check for `app/static/app.js`
- Live `/analyze` and `/export` smoke test

## 2026-04-27 - Local Demo Build and Handoff Materials

- Generated local build handoff materials for professor/demo review.
- Added demo DOCX, text-based PDF, paste-demo text, local build README, and 1L structural spectrum test document.
- Packaged the app for local/offline review.
