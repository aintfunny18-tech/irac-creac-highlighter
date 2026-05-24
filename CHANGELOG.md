# Changelog

## 2026-05-24 - Claude Review Cleanup

- Moved classifier phrase dictionaries, regex patterns, label colors, suggestions, and party-name stopwords into `app/constants.py`.
- Reused the shared structural-label regex in the parser instead of recompiling an equivalent parser-only regex.
- Added real drag-and-drop handlers and visual feedback for DOCX, PDF, and RTF upload zones.
- Converted the legacy classifier, perturbation, structural-spectrum, and training-tool scripts to native pytest tests while preserving direct `python test_*.py` execution through pytest.
- Removed the temporary pytest wrapper file and added unsupported-upload and malformed-paste regression tests.

Validation:
- `python -m pytest -v`
- `python -m pytest --co -q`
- `python test_classifier.py`
- `python test_training_tool.py`
- `python test_structural_spectrum.py`
- `python test_perturbations.py`
- Bundled Node syntax check for `app/static/app.js`

## 2026-05-23 - Claude Feedback Implementation

- Added 50KB pasted-text and 10MB upload limits with student-friendly errors.
- Added the RTF upload tab, Ctrl/Cmd+Enter analyze shortcut, click/tap sentence detail panels, and a more responsive layout.
- Moved shared parser/classifier constants into `app/constants.py` and moved citation-starter regex compilation to module scope.
- Added counterargument/opposing-position coaching metadata and revision priorities without adding a new top-level IRAC label.
- Hardened export errors so internal exception details are logged but not shown to students.
- Added pytest coverage for legacy regressions, parser/routes/export behavior, counterarguments, RTF uploads, and size limits.

Validation:
- `python test_classifier.py`
- `python test_training_tool.py`
- `python test_structural_spectrum.py`
- `python test_perturbations.py`
- `python -m pytest`
- Bundled Node syntax check for `app/static/app.js`
- Browser smoke test for paste-demo analysis, RTF tab, and click/tap sentence details

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
