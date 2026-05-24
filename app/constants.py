"""Shared constants used across parsing, classification, and routes."""

import re

ALLOWED_EXTENSIONS = {".docx", ".pdf", ".rtf"}
MAX_PASTE_BYTES = 50 * 1024
MAX_UPLOAD_BYTES = 10 * 1024 * 1024

STRUCT_LABEL_PATTERN = (
    r'^(?P<lbl>issue|rule|analysis|application(?:\s*[—\-]\s*[^:]{0,60})?|conclusion)\s*:\s*'
)
STRUCT_LABEL_RE = re.compile(STRUCT_LABEL_PATTERN, re.I)

