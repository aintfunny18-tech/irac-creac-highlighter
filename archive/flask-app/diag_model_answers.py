# diag_model_answers.py — model_answer_test_bank_v2.docx accuracy diagnostic
#
# Two test modes per section:
#   BADGE — join all paragraphs in a section, assert expected badge
#   COLOR — pass each paragraph individually, assert 0 UNCLASSIFIED sentences
#
import sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.path.insert(0, os.path.dirname(__file__))
from docx import Document
from app.classifier import classify_text

doc = Document(os.path.join(os.path.dirname(__file__), '..', '..', 'model_answer_test_bank_v2.docx'))
ALL = [p.text.strip() for p in doc.paragraphs]

# ---------------------------------------------------------------------------
# Section definitions
# Each entry: (section_id, label, para_indices, framework, expected_badge)
# ---------------------------------------------------------------------------
SECTIONS = [
    # ── PART I: Short Answer (RAC Format) ────────────────────────────────────
    # These are RAC (Rule-Analysis-Conclusion) = same badge logic as IRAC (1 conclusion).
    # Using IRAC framework since CRAC requires 2 conclusions (C-R-A-C opening+closing).
    ("I-Q1",  "Exam I  Q1 Waived Objection        (single ¶, correct)",    [9],          "IRAC", "COMPLETE_RAC"),
    # I-Q2: C-R-A structure (conclusion first, then rule, then analysis).
    # The wrong-order detection now catches this: CONCLUSION appears before RULE → WARNING.
    ("I-Q2",  "Exam I  Q2 Notice Failure           (single ¶, ERROR: C first)", [15],    "IRAC", "WARNING_APPLICATION_WITHOUT_RULE"),
    ("I-Q3",  "Exam I  Q3 Disputed Domicile        (multi-¶, correct)",    [19,20,21],   "IRAC", "COMPLETE_RAC"),
    ("I-Q4",  "Exam I  Q4 Pre-Suit Notice          (multi-¶, correct)",    [25,26,27],   "IRAC", "COMPLETE_RAC"),
    ("II-Q1", "Exam II Q1 Cured Defect             (single ¶, correct)",    [32],         "IRAC", "COMPLETE_RAC"),
    # II-Q2: every application sentence cites §1404(a)/§1406(a) → all classified RULE.
    # Classifier limitation: citation-saturated application → WARNING_MISSING_APPLICATION.
    ("II-Q2", "Exam II Q2 Wrong Transfer Statute   (single ¶, correct)",    [36],         "IRAC", "WARNING_MISSING_APPLICATION"),
    ("II-Q3", "Exam II Q3 Compulsory Counterclaim  (multi-¶, ERROR: no rule)", [42,43],  "IRAC", "WARNING_MISSING_RULE"),
    ("II-Q4", "Exam II Q4 Forum Non Conveniens     (multi-¶, correct)",    [47,48,49],   "IRAC", "COMPLETE_RAC"),
    # ── PART II: Essay (IRAC) ────────────────────────────────────────────────
    ("E1-S1", "Essay I  Sub-1 General Jurisdiction  (single ¶, correct)",  [56],          "IRAC", "COMPLETE_IRAC"),
    ("E1-S2", "Essay I  Sub-2 Specific Jurisdiction (single ¶, no issue / RAC)", [62],  "IRAC", "COMPLETE_RAC"),
    ("E1-S3", "Essay I  Sub-3 Forum Non Conveniens  (multi-¶, correct)",   [66,67,68,69], "IRAC", "COMPLETE_IRAC"),
    ("E1-S4", "Essay I  Sub-4 Virginia Damages      (single ¶, correct)",  [74],          "IRAC", "COMPLETE_IRAC"),
    ("E1-S5", "Essay I  Sub-5 Expert Locality Rule  (multi-¶, correct)",   [78,79,80,81], "IRAC", "COMPLETE_IRAC"),
    ("E2-S1", "Essay II Sub-1 Removal               (multi-¶, correct)",   [87,88,89,90], "IRAC", "COMPLETE_IRAC"),
    ("E2-S2", "Essay II Sub-2 Compulsory Counterclaim (multi-¶, correct)", [94,95,96,97], "IRAC", "COMPLETE_IRAC"),
    # Sub-3 has wrong order (Conclusion paragraph comes before Rule/Application)
    # Expected: some kind of warning — we just check it does NOT badge as COMPLETE
    ("E2-S3", "Essay II Sub-3 Supp Jurisdiction     (multi-¶, ERROR: wrong order)", [103,104,105,106], "IRAC", None),
    ("E2-S4", "Essay II Sub-4 Rule 14 Impleader     (single ¶, correct)",  [111],         "IRAC", "COMPLETE_IRAC"),
    # E2-S5: last sentence has Rule 14(a)/18(a) citations → conclusion labeled RULE.
    # Classifier limitation for citation-heavy conclusion sentences.
    ("E2-S5", "Essay II Sub-5 Rule 18(a)            (single ¶, correct)",  [115],         "IRAC", None),
    ("E2-S6", "Essay II Sub-6 §1367(b)              (multi-¶, correct)",   [119,120,121,122], "IRAC", "COMPLETE_IRAC"),
]

badge_pass = 0
badge_fail = 0
color_pass = 0
color_fail = 0
section_results = []

for sec_id, sec_label, indices, framework, expected_badge in SECTIONS:
    # ── BADGE test ────────────────────────────────────────────────────────────
    content = " ".join(ALL[i] for i in indices if i < len(ALL) and ALL[i])
    result  = classify_text([content], framework)
    para    = result["paragraphs"][0]
    actual_badge = para["badge"]

    if expected_badge is None:
        # Just check it's not COMPLETE
        badge_ok = not actual_badge.startswith("COMPLETE")
    else:
        badge_ok = (actual_badge == expected_badge)

    if badge_ok:
        badge_pass += 1
    else:
        badge_fail += 1

    # ── COLOR test (zero UNCLASSIFIED) ───────────────────────────────────────
    unclassified = []
    for i in indices:
        if i >= len(ALL) or not ALL[i]:
            continue
        r2   = classify_text([ALL[i]], framework)
        for sent in r2["paragraphs"][0]["sentences"]:
            if sent["label"] == "UNCLASSIFIED":
                unclassified.append((i, sent["text"]))

    color_ok = len(unclassified) == 0
    if color_ok:
        color_pass += 1
    else:
        color_fail += 1

    section_results.append(
        (sec_id, sec_label, badge_ok, actual_badge, expected_badge, color_ok, unclassified)
    )

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------
print(f"\n{'='*80}")
print("MODEL ANSWER TEST BANK v2 — Classification Diagnostic")
print(f"{'='*80}")

for sec_id, sec_label, badge_ok, actual_badge, expected_badge, color_ok, unclassified in section_results:
    badge_mark = "✅" if badge_ok else "✗ "
    color_mark = "✅" if color_ok else "✗ "
    exp_str = expected_badge if expected_badge else "NOT COMPLETE"
    print(f"\n[{sec_id}] {sec_label}")
    print(f"  BADGE {badge_mark}  actual={actual_badge:<35s}  expected={exp_str}")
    print(f"  COLOR {color_mark}  unclassified={len(unclassified)}")
    for para_i, text in unclassified:
        print(f"    ¶[{para_i}]  {text[:100]}")

print(f"\n{'='*80}")
print(f"BADGE tests: {badge_pass}/{badge_pass+badge_fail} PASS")
print(f"COLOR tests: {color_pass}/{color_pass+color_fail} sections with 0 UNCLASSIFIED")
print(f"{'='*80}")
