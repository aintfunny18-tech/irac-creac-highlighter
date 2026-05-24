"""
Perturbation regression tests for wording changes that should not shatter
IRAC/CREAC structure.

Run with:
  python.exe test_perturbations.py
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(__file__))

from app.classifier import classify_text


CASES = [
    (
        "baseline with signposts",
        "The issue is whether Mercer committed fraud. "
        "To establish fraud, a plaintiff must prove that the defendant made a false representation, "
        "knew it was false, intended reliance, and caused damages. "
        "Here, Mercer told Okafor that the fund returned twelve percent annually, but Mercer knew this was false. "
        "Therefore, Okafor is likely to prevail.",
        "COMPLETE_IRAC",
        ["ISSUE", "RULE", "APPLICATION", "CONCLUSION"],
    ),
    (
        "removed Here",
        "The issue is whether Mercer committed fraud. "
        "To establish fraud, a plaintiff must prove that the defendant made a false representation, "
        "knew it was false, intended reliance, and caused damages. "
        "Mercer told Okafor that the fund returned twelve percent annually, but Mercer knew this was false. "
        "Therefore, Okafor is likely to prevail.",
        "COMPLETE_IRAC",
        ["ISSUE", "RULE", "APPLICATION", "CONCLUSION"],
    ),
    (
        "removed Therefore",
        "The issue is whether Mercer committed fraud. "
        "To establish fraud, a plaintiff must prove that the defendant made a false representation, "
        "knew it was false, intended reliance, and caused damages. "
        "Here, Mercer told Okafor that the fund returned twelve percent annually, but Mercer knew this was false. "
        "Okafor is likely to prevail.",
        "COMPLETE_IRAC",
        ["ISSUE", "RULE", "APPLICATION", "CONCLUSION"],
    ),
    (
        "removed both signposts",
        "The issue is whether Mercer committed fraud. "
        "To establish fraud, a plaintiff must prove that the defendant made a false representation, "
        "knew it was false, intended reliance, and caused damages. "
        "Mercer told Okafor that the fund returned twelve percent annually, but Mercer knew this was false. "
        "Okafor is likely to prevail.",
        "COMPLETE_IRAC",
        ["ISSUE", "RULE", "APPLICATION", "CONCLUSION"],
    ),
    (
        "citation-heavy application without Here",
        "The issue is whether transfer was proper. "
        "Under 28 U.S.C. \u00a7 1404(a), a court may transfer for convenience when venue is proper. "
        "The case was transferred under \u00a7 1406(a), but the original venue was proper under \u00a7 1391. "
        "The transfer was improper.",
        "COMPLETE_IRAC",
        ["ISSUE", "RULE", "APPLICATION", "CONCLUSION"],
    ),
]



@pytest.mark.parametrize("name,text,expected_badge,expected_labels", CASES, ids=[case[0] for case in CASES])
def test_perturbation_case(name: str, text: str, expected_badge: str, expected_labels: list[str]) -> None:
    para = classify_text([text], "IRAC")["paragraphs"][0]
    assert para["badge"] == expected_badge, name
    assert [s["label"] for s in para["sentences"]] == expected_labels, name


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__]))
