"""
Regression tests for automatic format detection and mixed-quality 1L writing.

Run with:
  python.exe test_structural_spectrum.py
"""

import io
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from app.classifier import classify_text


CASES = [
    {
        "name": "full issue-led IRAC",
        "text": (
            "The issue is whether Dana committed battery. "
            "Battery requires an intentional harmful or offensive contact with another person. "
            "Dana shoved Lee in the shoulder during the argument, and Lee stumbled backward. "
            "Therefore, Dana is likely liable for battery."
        ),
        "badge": "COMPLETE_IRAC",
        "labels": ["ISSUE", "RULE", "APPLICATION", "CONCLUSION"],
    },
    {
        "name": "issue-less RAC should not be called IRAC",
        "text": (
            "Battery requires an intentional harmful or offensive contact with another person. "
            "Dana shoved Lee in the shoulder during the argument, and Lee stumbled backward. "
            "Therefore, Dana is likely liable for battery."
        ),
        "badge": "COMPLETE_RAC",
        "labels": ["RULE", "APPLICATION", "CONCLUSION"],
    },
    {
        "name": "automatic CRAC",
        "text": (
            "Dana is likely liable for battery. "
            "Battery requires an intentional harmful or offensive contact with another person. "
            "Dana shoved Lee in the shoulder during the argument, and Lee stumbled backward. "
            "Therefore, Dana is likely liable."
        ),
        "badge": "COMPLETE_CRAC",
        "effective": "CRAC",
    },
    {
        "name": "automatic CREAC",
        "text": (
            "The covenant is likely enforceable against Garrison. "
            "An equitable servitude binds successors when the covenant touches and concerns land, the parties intend it to run, and the later owner has notice. "
            "In Neponsit, the court enforced a covenant because the promise affected property ownership and bound successors with notice. "
            "Here, Garrison bought Parcel 14 after the residential-use restriction was recorded in the chain of title. "
            "Accordingly, the covenant is likely enforceable against Garrison."
        ),
        "badge": "COMPLETE_CREAC",
        "effective": "CREAC",
    },
    {
        "name": "missing application in rule dump",
        "text": (
            "The issue is whether the agreement is enforceable. "
            "A valid contract requires offer, acceptance, and consideration. "
            "Courts apply the objective theory of assent."
        ),
        "badge": "WARNING_MISSING_APPLICATION",
    },
    {
        "name": "muddled blend",
        "text": (
            "The issue is whether Rivera breached the duty of care. "
            "A driver must use reasonable care, and here Rivera looked down at a text message for six seconds while entering the intersection. "
            "Therefore, Rivera likely breached the duty of care."
        ),
        "badge": "WARNING_BLEND",
    },
    {
        "name": "NeueStruktur general jurisdiction application",
        "text": (
            "Whether the Western District of Virginia may exercise general personal jurisdiction over NeueStruktur GmbH, a German corporation, based on its contacts with Virginia. "
            "Under Daimler AG v. Bauman, 571 U.S. 117 (2014), and Goodyear Dunlop Tires Operations, S.A. v. Brown, 564 U.S. 915 (2011), a court may exercise general personal jurisdiction over a corporation only where the corporation's affiliations with the forum are so continuous and systematic as to render it 'essentially at home' there. "
            "For corporations, the paradigm cases of general jurisdiction are the state of incorporation and the state of principal place of business. "
            "Only in an 'exceptional case' would operations in another forum be so substantial as to render the corporation at home there. "
            "Even substantial and continuous commercial activity in a forum does not make a corporation 'at home' where it is neither incorporated nor headquartered. "
            "NeueStruktur GmbH is incorporated under German law and headquartered in Frankfurt, Germany. "
            "It has no offices, employees, agents, or bank accounts in Virginia or anywhere in the United States. "
            "Its U.S. subsidiary (NSA) is a separate legal entity with a New York principal place of business; NSA's contacts cannot automatically be imputed to the German parent absent a formal agency finding. "
            "Even if NSA's contacts were fully imputed, NSA is at home in Delaware and New York — not Virginia. "
            "NeueStruktur's five site visits to Virginia over two years are episodic, not continuous and systematic. "
            "Virginia is not among the paradigm forums for NeueStruktur, and no exceptional circumstances exist to support general jurisdiction there. "
            "The Western District of Virginia cannot exercise general personal jurisdiction over NeueStruktur GmbH."
        ),
        "badge": "COMPLETE_IRAC",
        "must_label": {
            "Virginia is not among the paradigm forums": "APPLICATION",
            "Even substantial and continuous commercial activity": "RULE",
        },
    },
]


def run_tests() -> None:
    passes = 0
    failures = 0
    for case in CASES:
        para = classify_text([case["text"]], "AUTO")["paragraphs"][0]
        ok = para["badge"] == case["badge"]
        if case.get("effective"):
            ok = ok and para["effective_framework"] == case["effective"]
        if case.get("labels"):
            ok = ok and [s["label"] for s in para["sentences"]] == case["labels"]
        for needle, expected_label in case.get("must_label", {}).items():
            match = next((s for s in para["sentences"] if needle in s["text"]), None)
            ok = ok and match is not None and match["label"] == expected_label

        print(f"[{'PASS' if ok else 'FAIL'}] {case['name']}")
        print(f"       expected: {case['badge']}  actual: {para['badge']}  detected={para['effective_framework']}")
        if not ok:
            for i, sent in enumerate(para["sentences"]):
                print(f"       {i:2d}. [{sent['label']:12s}] {sent['trigger_phrase']} :: {sent['text'][:100]}")
            failures += 1
        else:
            passes += 1
        print()

    print("=" * 70)
    print(f"Structural spectrum tests: {passes} PASS, {failures} FAIL ({passes}/{passes + failures})")
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    run_tests()
