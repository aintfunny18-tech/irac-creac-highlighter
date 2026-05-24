"""
Document ingestion module.
All three paths return (paragraphs: list[str], warnings: list[str]).
"""

import re
from io import BytesIO

from app.constants import STRUCT_LABEL_PATTERN

# ---------------------------------------------------------------------------
# Test-document grouping helpers
# ---------------------------------------------------------------------------

# Matches the distinctive "TEST CASE A-1 | …" header used in the QA document.
_TEST_CASE_RE = re.compile(r'^TEST CASE [A-Z]-\d+\s*\|', re.I)

# Matches paragraphs that open with a structural IRAC/CRAC/RAC label:
# "Issue:", "Rule:", "Analysis:", "Application — X:", "Conclusion:"
_STRUCT_PARA_RE = re.compile(STRUCT_LABEL_PATTERN, re.I)


def _group_struct_labeled(paragraphs: list[str]) -> list[str]:
    """
    Merge consecutive struct-labeled paragraphs (Issue:, Rule:, Analysis:,
    Application — X:, Conclusion:) into a single entry so the classifier
    receives the full IRAC/CRAC/RAC block in one call and can badge it
    correctly as COMPLETE rather than issuing separate incomplete badges.

    Non-labeled paragraphs (exam instructions, question prompts, narrative
    text) flush the current group and pass through unchanged, so normal
    student writing without section labels is completely unaffected.

    Example — three consecutive docx paragraphs:
        "Rule: Under Fed. R. Civ. P. 12(b)(2)…"
        "Analysis: Beaumont filed a pre-answer motion…"
        "Conclusion: Beaumont has waived its personal jurisdiction defense."
    → merged into one entry → classifier sees RULE + APPLICATION + CONCLUSION
      → badge: COMPLETE_CRAC  ✓
    """
    result: list[str] = []
    group: list[str] = []
    for para in paragraphs:
        if _STRUCT_PARA_RE.match(para):
            group.append(para)
        else:
            if group:
                result.append(' '.join(group))
                group = []
            result.append(para)
    if group:
        result.append(' '.join(group))
    return result

# Lines to skip when building content groups in test-document mode.
_TESTDOC_SKIP = [
    re.compile(r'^Note:', re.I),
    re.compile(r'^PART [A-D]\b', re.I),
    re.compile(r'^IRAC/CREAC Structural', re.I),
    re.compile(r'^Test Document', re.I),
    re.compile(r'^Prepared for', re.I),
    re.compile(r'^Color legend', re.I),
    re.compile(r'^This document', re.I),
    re.compile(r'^The table below', re.I),
]


def _group_by_test_case(raw_paras: list[str]) -> list[str]:
    """
    For QA test documents where each sentence is a separate paragraph,
    group sentences back into one string per test case.

    Returns a list of joined strings — one entry per TEST CASE block,
    in document order. Everything before the first TEST CASE header and
    after the PART D / Answer Key section is discarded.
    """
    groups: list[str] = []
    current: list[str] = []
    in_content = False  # wait until the first TEST CASE header

    for text in raw_paras:
        if not text:
            continue

        # Stop when we reach the answer key
        if re.match(r'^PART D\b', text, re.I) or 'Answer Key' in text:
            break

        # New test case boundary → save current group, start fresh
        if _TEST_CASE_RE.match(text):
            if in_content and current:
                groups.append(' '.join(current))
                current = []
            in_content = True
            continue  # don't include the header line itself

        # Skip pre-content intro paragraphs
        if not in_content:
            continue

        # Skip metadata / note lines inside a test case
        if any(pat.match(text) for pat in _TESTDOC_SKIP):
            continue

        current.append(text)

    # Save the final group
    if current:
        groups.append(' '.join(current))

    return groups


# ---------------------------------------------------------------------------
# Public parsers
# ---------------------------------------------------------------------------

def parse_plaintext(text: str) -> tuple[list[str], list[str]]:
    """Split plain text on blank lines into paragraphs."""
    raw = text.replace('\r\n', '\n').replace('\r', '\n')
    blocks = raw.split('\n\n')
    paragraphs = [b.strip() for b in blocks if b.strip()]
    # Auto-detect QA test-document format and group sentences by test case.
    if any(_TEST_CASE_RE.match(p) for p in paragraphs):
        paragraphs = _group_by_test_case(paragraphs)
    else:
        # Merge consecutive struct-labeled paragraphs (Rule:, Analysis:,
        # Application — X:, Conclusion:) so a user who pastes sections with
        # blank lines between them still gets a single combined block that
        # earns a COMPLETE badge rather than three separate incomplete ones.
        paragraphs = _group_struct_labeled(paragraphs)
    return paragraphs, []


def parse_docx(file_storage) -> tuple[list[str], list[str]]:
    """
    Parse a werkzeug FileStorage (.docx) into paragraphs.
    Returns (paragraphs, warnings).

    If the document uses the QA test-document format (paragraphs starting
    with "TEST CASE X-N | …"), sentences are automatically grouped so that
    each test case is returned as a single paragraph string.  All other
    .docx files are handled normally — one entry per non-blank paragraph.
    """
    try:
        from docx import Document
    except ImportError:
        return [], ["python-docx is not installed."]

    try:
        data = BytesIO(file_storage.read())
        doc = Document(data)
    except Exception as exc:
        return [], [f"Could not read this .docx file. It may be corrupted or use an unsupported format. ({exc})"]

    paragraphs = []
    for para in doc.paragraphs:
        text = para.text.strip()
        if text:
            paragraphs.append(text)

    if not paragraphs:
        return [], ["The .docx file appears to contain no extractable text."]

    # Auto-detect QA test-document format and group sentences by test case.
    if any(_TEST_CASE_RE.match(p) for p in paragraphs):
        paragraphs = _group_by_test_case(paragraphs)
    else:
        # Merge consecutive struct-labeled paragraphs so each IRAC/CRAC/RAC
        # answer section is analyzed as one block and earns a COMPLETE badge.
        paragraphs = _group_struct_labeled(paragraphs)

    if not paragraphs:
        return [], ["The .docx file appears to contain no extractable text."]

    return paragraphs, []


def parse_pdf(file_storage) -> tuple[list[str], list[str]]:
    """
    Parse a werkzeug FileStorage (.pdf) into paragraphs.
    Returns (paragraphs, warnings).
    """
    try:
        import pdfplumber
    except ImportError:
        return [], ["pdfplumber is not installed."]

    warnings = []
    try:
        data = BytesIO(file_storage.read())
        pages_text = []
        with pdfplumber.open(data) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""
                pages_text.append(text)
    except Exception as exc:
        return [], [f"Could not read this PDF file. ({exc})"]

    # Scanned-PDF detection: average characters per page
    if pages_text:
        avg_chars = sum(len(t) for t in pages_text) / len(pages_text)
        if avg_chars < 50:
            warnings.append(
                "This PDF may be scanned or image-based. Text extraction may be incomplete."
            )

    full_text = "\n\n".join(pages_text)
    paragraphs, _ = parse_plaintext(full_text)
    return paragraphs, warnings


def _strip_rtf(raw: bytes) -> str:
    """
    Minimal RTF-to-plaintext stripper for Word-generated .rtf files.
    Handles common control words, hex escapes, and paragraph breaks.
    """
    # Decode: RTF files from Word are typically cp1252
    try:
        text = raw.decode('cp1252')
    except Exception:
        text = raw.decode('latin-1', errors='replace')

    # Convert common cp1252 special chars encoded as RTF hex escapes
    cp1252_map = {
        '91': '\u2018', '92': '\u2019',  # smart single quotes
        '93': '\u201c', '94': '\u201d',  # smart double quotes
        '96': '\u2013', '97': '\u2014',  # en-dash, em-dash
        'e2': '\u00e2', 'e9': '\u00e9',  # accented chars (uncommon in legal)
    }

    def replace_hex(m):
        code = m.group(1).lower()
        return cp1252_map.get(code, '')  # drop unknown escapes

    text = re.sub(r"\\'([0-9a-fA-F]{2})", replace_hex, text)

    # Paragraph breaks: \par and \pard signal new paragraphs
    text = re.sub(r'\\pard?\b', '\n\n', text)
    text = re.sub(r'\\line\b', '\n', text)

    # Strip all remaining RTF control words (\word or \word123)
    text = re.sub(r'\\[a-zA-Z]+\-?\d* ?', ' ', text)

    # Strip remaining control symbols (backslash + single non-alpha)
    text = re.sub(r'\\[^a-zA-Z0-9 \n]', '', text)

    # Strip braces (RTF group delimiters)
    text = re.sub(r'[{}]', '', text)

    # Collapse runs of spaces and tabs; normalize line endings
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)

    return text.strip()


def parse_rtf(file_storage) -> tuple[list[str], list[str]]:
    """
    Parse a werkzeug FileStorage (.rtf) into paragraphs.
    Returns (paragraphs, warnings).
    """
    try:
        raw = file_storage.read()
    except Exception as exc:
        return [], [f"Could not read this .rtf file. ({exc})"]

    if not raw.lstrip().startswith(b'{\\rtf'):
        # Not a real RTF — try treating it as plain text
        text = raw.decode('utf-8', errors='replace')
        return parse_plaintext(text)

    text = _strip_rtf(raw)
    if len(text) < 20:
        return [], ["Could not extract text from this .rtf file. It may be corrupted or use an unsupported format."]

    paragraphs, _ = parse_plaintext(text)
    return paragraphs, []
