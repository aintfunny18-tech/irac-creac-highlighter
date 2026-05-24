"""
Perturbation regression tests for wording changes that should not shatter
IRAC/CREAC structure.

Run with:
  python.exe test_perturbations.py
"""

import io
import os
import sys

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


def run_tests() -> None:
    passes = 0
    failures = 0

    for name, text, expected_badge, expected_labels in CASES:
        para = classify_text([text], "IRAC")["paragraphs"][0]
        labels = [s["label"] for s in para["sentences"]]
        badge_ok = para["badge"] == expected_badge
        labels_ok = labels == expected_labels
        ok = badge_ok and labels_ok

        print(f"[{'PASS' if ok else 'FAIL'}] {name}")
        print(f"       expected badge: {expected_badge}")
        print(f"       actual badge:   {para['badge']}")
        print(f"       expected labels: {expected_labels}")
        print(f"       actual labels:   {labels}")
        if not ok:
            for i, sent in enumerate(para["sentences"]):
                print(f"       {i:2d}. [{sent['label']:12s}] {sent['trigger_phrase']} :: {sent['text']}")
            failures += 1
        else:
            passes += 1
        print()

    print("=" * 60)
    print(f"Perturbation tests: {passes} PASS, {failures} FAIL ({passes}/{passes + failures})")
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    run_tests()
