import os

from app.classifier import classify_text
from test_classifier import EXPECTED, load_test_cases
from test_perturbations import CASES as PERTURBATION_CASES
from test_structural_spectrum import CASES as SPECTRUM_CASES


def test_classifier_demo_document_badges():
    docx = os.path.join(os.path.dirname(__file__), "Legal_Writing_Structure_Coach_Test_Document_v1.0.docx")
    cases = load_test_cases(docx)
    for case_id, (framework, paras) in cases.items():
        _expected_fw, expected_badge = EXPECTED[case_id]
        result = classify_text([" ".join(paras)], framework)["paragraphs"][0]
        assert result["badge"] == expected_badge, case_id


def test_perturbation_cases_for_pytest():
    for name, text, expected_badge, expected_labels in PERTURBATION_CASES:
        para = classify_text([text], "IRAC")["paragraphs"][0]
        assert para["badge"] == expected_badge, name
        assert [s["label"] for s in para["sentences"]] == expected_labels, name


def test_structural_spectrum_cases_for_pytest():
    for case in SPECTRUM_CASES:
        para = classify_text([case["text"]], "AUTO")["paragraphs"][0]
        assert para["badge"] == case["badge"], case["name"]
        if case.get("effective"):
            assert para["effective_framework"] == case["effective"], case["name"]
        if case.get("labels"):
            assert [s["label"] for s in para["sentences"]] == case["labels"], case["name"]
        for needle, expected_label in case.get("must_label", {}).items():
            match = next((s for s in para["sentences"] if needle in s["text"]), None)
            assert match is not None, f"{case['name']} missing {needle}"
            assert match["label"] == expected_label, f"{case['name']} {needle}"

