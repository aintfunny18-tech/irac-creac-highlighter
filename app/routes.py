"""
Flask routes: GET /, POST /analyze, POST /export
"""

import os

from flask import jsonify, render_template, request, send_file

from app import app
from app import classifier, exporter, parser

ALLOWED_EXTENSIONS = {".docx", ".pdf", ".rtf"}


def _bad(message: str, status: int = 400):
    return jsonify({"error": message}), status


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/analyze", methods=["POST"])
def analyze():
    framework = "AUTO"
    paragraphs: list[str] = []
    warnings: list[str] = []

    if request.content_type and request.content_type.startswith("multipart/form-data"):
        # File upload path
        framework = request.form.get("framework", "AUTO").upper()
        file = request.files.get("file")

        if not file or file.filename == "":
            return _bad("No text was provided. Please paste text or upload a file.")

        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            return _bad("Unsupported file type. Please upload a .docx or .pdf file.")

        if ext == ".docx":
            paragraphs, warnings = parser.parse_docx(file)
        elif ext == ".pdf":
            paragraphs, warnings = parser.parse_pdf(file)
        else:
            paragraphs, warnings = parser.parse_rtf(file)

        # Surface parser errors
        if not paragraphs and warnings:
            return _bad(warnings[0])

    else:
        # JSON paste path
        data = request.get_json(silent=True) or {}
        framework = data.get("framework", "AUTO").upper()
        text = data.get("text", "").strip()

        if not text:
            return _bad("No text was provided. Please paste text or upload a file.")

        paragraphs, warnings = parser.parse_plaintext(text)

    if not paragraphs:
        return _bad("No text was provided. Please paste text or upload a file.")

    if framework not in ("AUTO", "IRAC", "CREAC", "CRAC"):
        framework = "AUTO"

    result = classifier.classify_text(paragraphs, framework)

    total_labeled = sum(
        1 for para in result["paragraphs"]
        for sent in para["sentences"]
        if sent["label"] != "UNCLASSIFIED"
    )
    if total_labeled == 0:
        warnings.append(
            "No structural markers were detected. "
            "Try revising the passage to include clearer legal-writing structure."
        )

    if warnings:
        result["warnings"] = warnings

    return jsonify(result)


@app.route("/export", methods=["POST"])
def export():
    data = request.get_json(silent=True)
    if not data:
        return _bad("No classification data provided.")

    try:
        buf = exporter.export_docx(data)
    except Exception as exc:
        return _bad(f"Export failed: {exc}", 500)

    return send_file(
        buf,
        mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        as_attachment=True,
        download_name="annotated_draft.docx",
    )
