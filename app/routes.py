"""
Flask routes: GET /, POST /analyze, POST /export
"""

import os

from flask import jsonify, render_template, request, send_file

from app import app
from app import classifier, exporter, parser
from app.constants import ALLOWED_EXTENSIONS, MAX_PASTE_BYTES, MAX_UPLOAD_BYTES


def _bad(message: str, status: int = 400):
    return jsonify({"error": message}), status


def _file_size(file_storage) -> int | None:
    """Return upload size without consuming the stream when possible."""
    stream = getattr(file_storage, "stream", None)
    if stream is None or not all(hasattr(stream, name) for name in ("tell", "seek")):
        return file_storage.content_length or None
    pos = stream.tell()
    stream.seek(0, os.SEEK_END)
    size = stream.tell()
    stream.seek(pos)
    return size


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/analyze", methods=["POST"])
def analyze():
    framework = "AUTO"
    paragraphs: list[str] = []
    warnings: list[str] = []

    if request.content_type and request.content_type.startswith("multipart/form-data"):
        if request.content_length and request.content_length > MAX_UPLOAD_BYTES + 65536:
            return _bad("Uploaded file is too large. Please keep uploads under 10MB.")

        # File upload path
        framework = request.form.get("framework", "AUTO").upper()
        file = request.files.get("file")

        if not file or file.filename == "":
            return _bad("No text was provided. Please paste text or upload a file.")

        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            return _bad("Unsupported file type. Please upload a .docx, .pdf, or .rtf file.")

        size = _file_size(file)
        if size is not None and size > MAX_UPLOAD_BYTES:
            return _bad("Uploaded file is too large. Please keep uploads under 10MB.")

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
        if len(text.encode("utf-8")) > MAX_PASTE_BYTES:
            return _bad("Pasted text is too long. Please keep pasted text under 50KB.")

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
    except Exception:
        app.logger.exception("DOCX export failed")
        return _bad("Export failed. Please try again or re-run the analysis before exporting.", 500)

    return send_file(
        buf,
        mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        as_attachment=True,
        download_name="annotated_draft.docx",
    )
