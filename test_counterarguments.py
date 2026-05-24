import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from app.classifier import classify_text


def test_counterargument_gets_coaching_metadata():
    text = (
        "The issue is whether Dana committed battery. "
        "Battery requires intentional harmful or offensive contact. "
        "The defendant will argue that the contact was accidental. "
        "However, Dana raised her hand and shoved Lee after the warning. "
        "Therefore, Dana is likely liable."
    )
    para = classify_text([text], "AUTO")["paragraphs"][0]
    counter = next(sent for sent in para["sentences"] if "defendant will argue" in sent["text"].lower())

    assert counter["label"] == "APPLICATION"
    assert counter["counterargument"] is True
    assert "opposing-position" in counter["trigger_phrase"]
    assert "answers it with rule-based application" in counter["revision_hint"]

    kinds = {item["kind"] for item in para["revision_priorities"]}
    assert "counterargument_needs_response" in kinds


def test_counterargument_is_not_bare_conclusion_in_crac_opener():
    text = (
        "Defendant will argue that the search was reasonable. "
        "The Fourth Amendment requires a warrant unless an exception applies. "
        "Here, the officer searched the bag without consent or exigency. "
        "Therefore, the search was likely unreasonable."
    )
    para = classify_text([text], "CRAC")["paragraphs"][0]
    first = para["sentences"][0]

    assert first["counterargument"] is True
    assert first["label"] == "APPLICATION"


def test_citation_heavy_application_stays_application():
    text = (
        "The issue is whether transfer was proper. "
        "Under 28 U.S.C. § 1404(a), a court may transfer for convenience when venue is proper. "
        "The case was transferred under § 1406(a), but the original venue was proper under § 1391. "
        "Therefore, the transfer was improper."
    )
    para = classify_text([text], "IRAC")["paragraphs"][0]
    match = next(sent for sent in para["sentences"] if "transferred under" in sent["text"])

    assert match["label"] == "APPLICATION"

