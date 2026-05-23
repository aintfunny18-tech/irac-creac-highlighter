import nltk
from flask import Flask


def _ensure_nltk_tokenizers() -> None:
    """Use NLTK sentence data when available, but do not block local startup."""
    for resource in ("punkt", "punkt_tab"):
        try:
            nltk.data.find(f"tokenizers/{resource}")
        except LookupError:
            try:
                nltk.download(resource, quiet=True)
            except Exception:
                # classifier._sent_tokenize has a regex fallback for offline runs.
                pass


_ensure_nltk_tokenizers()

app = Flask(__name__, template_folder="templates", static_folder="static")

from app import routes  # noqa: E402, F401 - must import after app is created
