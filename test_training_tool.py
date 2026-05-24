"""
Regression tests for the 1L training/coaching layer.

Run with:
  python.exe test_training_tool.py
"""

import io
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from app.classifier import classify_text


def assert_true(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def test_sentence_diagnostics() -> None:
    result = classify_text(["The court should consider fairness and efficiency."], "AUTO")
    sent = result["paragraphs"][0]["sentences"][0]
    assert_true("competing_labels" in sent, "sentence exposes competing_labels")
    assert_true("revision_hint" in sent, "sentence exposes revision_hint")
    assert_true(sent["confidence_label"] in ("low", "medium"), "ambiguous sentence is not high confidence")
    assert_true(sent["uncertainty_reason"], "ambiguous sentence explains uncertainty")


def test_paragraph_training_fields() -> None:
    text = (
        "Here, Dana shoved Lee during the argument. "
        "Therefore, Dana is likely liable."
    )
    para = classify_text([text], "AUTO")["paragraphs"][0]
    assert_true(isinstance(para.get("structure_score"), int), "paragraph has structure_score")
    assert_true(para.get("training_summary"), "paragraph has training_summary")
    kinds = {item["kind"] for item in para.get("revision_priorities", [])}
    assert_true("missing_rule" in kinds, "missing rule priority is present")
    assert_true("unsupported_application" in kinds, "unsupported application priority is present")


def test_creac_explanation_and_competing_labels() -> None:
    text = (
        "Dana is likely liable for battery. "
        "Battery requires intentional harmful or offensive contact. "
        "In Garratt v. Dailey, the court found that intent existed because contact was substantially certain. "
        "Here, Dana shoved Lee in the shoulder. "
        "Therefore, Dana is likely liable."
    )
    para = classify_text([text], "AUTO")["paragraphs"][0]
    labels = [sent["label"] for sent in para["sentences"]]
    assert_true(para["effective_framework"] == "CREAC", "AUTO detects CREAC")
    assert_true("EXPLANATION" in labels, "case illustration is labeled EXPLANATION")
    first = para["sentences"][0]
    assert_true(first["competing_labels"], "opening position exposes alternative signals")


def test_cross_paragraph_training_priority() -> None:
    paragraphs = [
        "Battery requires intentional harmful or offensive contact.",
        "Here, Dana shoved Lee during the argument. Therefore, Dana is likely liable.",
    ]
    result = classify_text(paragraphs, "AUTO")
    kinds = {item["kind"] for item in result["paragraphs"][0]["revision_priorities"]}
    assert_true("cross_paragraph_split" in kinds, "cross paragraph note becomes training priority")


def run_tests() -> None:
    tests = [
        test_sentence_diagnostics,
        test_paragraph_training_fields,
        test_creac_explanation_and_competing_labels,
        test_cross_paragraph_training_priority,
    ]
    passes = 0
    for test in tests:
        test()
        print(f"[PASS] {test.__name__}")
        passes += 1
    print("=" * 64)
    print(f"Training tool tests: {passes} PASS, 0 FAIL ({passes}/{len(tests)})")


if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    run_tests()
