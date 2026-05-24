"""
Regression tests for the 1L training/coaching layer.

Run with:
  python.exe test_training_tool.py
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(__file__))

from app.classifier import classify_text


def test_sentence_diagnostics() -> None:
    result = classify_text(["The court should consider fairness and efficiency."], "AUTO")
    sent = result["paragraphs"][0]["sentences"][0]
    assert "competing_labels" in sent
    assert "revision_hint" in sent
    assert sent["confidence_label"] in ("low", "medium")
    assert sent["uncertainty_reason"]


def test_paragraph_training_fields() -> None:
    text = (
        "Here, Dana shoved Lee during the argument. "
        "Therefore, Dana is likely liable."
    )
    para = classify_text([text], "AUTO")["paragraphs"][0]
    assert isinstance(para.get("structure_score"), int)
    assert para.get("training_summary")
    kinds = {item["kind"] for item in para.get("revision_priorities", [])}
    assert "missing_rule" in kinds
    assert "unsupported_application" in kinds


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
    assert para["effective_framework"] == "CREAC"
    assert "EXPLANATION" in labels
    first = para["sentences"][0]
    assert first["competing_labels"]


def test_cross_paragraph_training_priority() -> None:
    paragraphs = [
        "Battery requires intentional harmful or offensive contact.",
        "Here, Dana shoved Lee during the argument. Therefore, Dana is likely liable.",
    ]
    result = classify_text(paragraphs, "AUTO")
    kinds = {item["kind"] for item in result["paragraphs"][0]["revision_priorities"]}
    assert "cross_paragraph_split" in kinds



if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__]))
