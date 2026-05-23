"""
QA test script for the IRAC/CREAC classifier.

Reads Legal_Writing_Structure_Coach_Test_Document_v1.0.docx, groups each test case's content
sentences into a single paragraph, runs classify_text(), and compares the
badge against the expected result.

Run with:
  python.exe test_classifier.py
"""

import sys
import io
import re
import os

# Force UTF-8 output on Windows console
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

# Make sure app package is importable
sys.path.insert(0, os.path.dirname(__file__))

from docx import Document
from app.classifier import classify_text

# ---------------------------------------------------------------------------
# Expected results
# ---------------------------------------------------------------------------

EXPECTED = {
    "A-1": ("IRAC",  "COMPLETE_IRAC"),
    "A-2": ("IRAC",  "COMPLETE_IRAC"),
    "A-3": ("IRAC",  "COMPLETE_IRAC"),
    "B-1": ("CREAC", "COMPLETE_CREAC"),
    "B-2": ("CREAC", "COMPLETE_CREAC"),
    "C-1": ("IRAC",  "WARNING_MISSING_RULE"),
    "C-2": ("IRAC",  "WARNING_MISSING_APPLICATION"),
    "C-3": ("IRAC",  "WARNING_MISSING_CONCLUSION"),
    "C-4": ("IRAC",  "WARNING_BLEND"),
    "C-5": ("IRAC",  "WARNING_APPLICATION_WITHOUT_RULE"),
    "C-6": ("IRAC",  "INFO_MOSTLY_UNCLASSIFIED"),
    "C-7": ("CREAC", "WARNING_EXPLANATION_AFTER_APPLICATION"),
}

# ---------------------------------------------------------------------------
# Parse test document
# ---------------------------------------------------------------------------

def load_test_cases(docx_path: str) -> dict[str, tuple[str, list[str]]]:
    """
    Returns {case_id: (framework, [content_paragraph_texts])}
    """
    doc = Document(docx_path)
    cases: dict[str, tuple[str, list[str]]] = {}
    current_id: str | None = None
    current_fw: str = "IRAC"
    current_paras: list[str] = []

    for para in doc.paragraphs:
        text = para.text.strip()
        if not text:
            continue

        # Test case header
        if re.match(r'^TEST CASE ([ABC]-\d+)', text):
            # Save previous case
            if current_id:
                cases[current_id] = (current_fw, current_paras)
            m = re.match(r'^TEST CASE ([ABC]-\d+)', text)
            current_id = m.group(1)
            current_fw = "CREAC" if "CREAC" in text.upper() else "IRAC"
            current_paras = []
            continue

        # Stop at Answer Key section
        if "PART D" in text or "Answer Key" in text:
            break

        # Skip notes, headings, meta lines
        if text.startswith("Note:"):
            continue
        if re.match(r'^PART [A-Z]', text):
            continue
        if re.match(r'^(This document|Color legend|Prepared for)', text):
            continue
        if re.match(r'^IRAC/CREAC Structural', text):
            continue
        if re.match(r'^Test Document', text):
            continue

        # Content paragraph — belongs to current test case
        if current_id:
            current_paras.append(text)

    # Save last case
    if current_id and current_paras:
        cases[current_id] = (current_fw, current_paras)

    return cases


# ---------------------------------------------------------------------------
# Run tests
# ---------------------------------------------------------------------------

def run_tests(docx_path: str) -> None:
    cases = load_test_cases(docx_path)

    passes = 0
    failures = 0

    for case_id in sorted(cases.keys()):
        framework, paras = cases[case_id]
        expected_fw, expected_badge = EXPECTED.get(case_id, (framework, "???"))

        # Join all content paragraphs into one text block so NLTK can
        # tokenize across sentence boundaries and the badge is computed
        # on the complete structural unit.
        full_text = " ".join(paras)
        result = classify_text([full_text], framework)
        para_result = result["paragraphs"][0]
        actual_badge = para_result["badge"]

        status = "PASS" if actual_badge == expected_badge else "FAIL"
        if status == "PASS":
            passes += 1
        else:
            failures += 1

        print(f"[{status}] {case_id} ({framework})")
        print(f"       expected: {expected_badge}")
        print(f"       actual:   {actual_badge}  ({para_result['badge_label']})")

        if status == "FAIL":
            print("       --- sentence breakdown ---")
            for i, sent in enumerate(para_result["sentences"]):
                blend_mark = " [BLEND]" if sent["blend"] else ""
                trigger = f"  ← {sent['trigger_phrase']}" if sent["trigger_phrase"] else ""
                print(f"       {i:2d}. [{sent['label']:14s}]{blend_mark}{trigger}")
                print(f"           {sent['text'][:90]}")
        print()

    print(f"{'='*50}")
    print(f"Results: {passes} PASS, {failures} FAIL  ({passes}/{passes+failures})")


if __name__ == "__main__":
    docx = os.path.join(os.path.dirname(__file__), "Legal_Writing_Structure_Coach_Test_Document_v1.0.docx")
    run_tests(docx)
