# Archive

This directory preserves the original **Python/Flask desktop version** of the
Legal Writing Structure Coach and its test documents. It was retired on
2026-06-11 when the project became a client-side static web app:

**https://aintfunny18-tech.github.io/irac-creac-highlighter/**

Contents:

- `flask-app/` — the complete Flask application (classifier, parser,
  exporter, UI), its pytest suite, and diagnostic scripts. Still runnable:
  `pip install -r flask-app/requirements.txt && python flask-app/run.py`
- `flask-app/tools/dump_golden.py` — generated the golden parity corpus used
  to verify the JavaScript port (`test/corpus/`, `test/corpus-local/`).
- `test-docs/` — the committed QA test documents and handoff materials the
  corpus was extracted from.
- `docs/` — the original v1.0/v1.1 specs.

The JavaScript engine in `js/engine/` started as a 1:1 port of
`flask-app/app/classifier.py` and has since diverged (better sentence
segmentation, de-overfit lexicon, new signals). The corpus expectations in
`test/corpus/` are the source of truth now — not this archive.
