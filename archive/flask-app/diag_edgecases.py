# Edge case diagnostic — Legal_Writing_Structure_Coach_EdgeCase_Test_v1.0.docx
import sys, io, re, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.path.insert(0, os.path.dirname(__file__))
from docx import Document
from app.classifier import classify_text

# ---------------------------------------------------------------------------
# Content paragraph indices per EC (from full dump; skip header/challenge/expected lines)
# ---------------------------------------------------------------------------
EC_PARA_INDICES = {
    "EC-01": ([18, 20, 22, 24, 26], "IRAC"),
    "EC-02": ([60, 62, 64, 66],     "IRAC"),
    "EC-03": ([96],                  "IRAC"),
    "EC-04": ([102],                 "IRAC"),
    "EC-05": ([72, 74],              "IRAC"),
    "EC-06": ([124, 126, 128, 130],  "IRAC"),
    "EC-07": ([32, 34, 36, 38],      "IRAC"),
    "EC-08": ([108],                 "IRAC"),
    "EC-09": ([136, 138, 140, 142, 144], "CREAC"),
    "EC-10": ([114],                 "IRAC"),
    "EC-11": ([80, 82, 84, 86],      "IRAC"),
    "EC-12": ([44, 46, 48, 50],      "IRAC"),
}

EXPECTED = {
    "EC-01": ("COMPLETE_IRAC",
              "ISSUE, RULE, EXPLANATION, APPLICATION, CONCLUSION — challenge: 'here' in explanation must NOT trigger APPLICATION"),
    "EC-02": ("COMPLETE_IRAC",
              "ISSUE, RULE (no citation — detected via definitional language), APPLICATION, CONCLUSION"),
    "EC-03": ("INFO_INTRODUCTORY",
              "Roadmap paragraph — no structural labels; must NOT flag as Missing Rule"),
    "EC-04": ("INFO_INTRODUCTORY",
              "Single-sentence conclusion mid-doc — must NOT badge IRAC Complete"),
    "EC-05": ("WARNING_MISSING_APPLICATION",
              "ISSUE, RULE, RULE, RULE — no application or conclusion"),
    "EC-06": ("COMPLETE_IRAC",
              "ISSUE, RULE, APPLICATION (no trigger words — party name only), CONCLUSION"),
    "EC-07": ("COMPLETE_IRAC",
              "ISSUE, RULE, RULE ('therefore' mid-rule must stay RULE not CONCLUSION), APPLICATION, CONCLUSION"),
    "EC-08": ("COMPLETE_IRAC",
              "Single paragraph with ISSUE, RULE, APPLICATION, CONCLUSION — sub-element IRAC"),
    "EC-09": ("COMPLETE_CREAC",
              "CONCLUSION (declarative opening, no hedge word), RULE, EXPLANATION, APPLICATION, CONCLUSION"),
    "EC-10": ("COMPLETE_IRAC",
              "Double IRAC in one paragraph — two I-R-A-C cycles; badge IRAC Complete"),
    "EC-11": ("COMPLETE_IRAC",
              "ISSUE, RULE (hedged — 'generally recognized', 'sometimes held'), APPLICATION, CONCLUSION"),
    "EC-12": ("COMPLETE_IRAC",
              "ISSUE, RULE, APPLICATION, CONCLUSION — final sentence has 'whether' but 'therefore' + position wins"),
}

doc = Document(os.path.join(os.path.dirname(__file__), '..', 'test-docs', 'Legal_Writing_Structure_Coach_EdgeCase_Test_v1.0.docx'))
all_paras = [p.text.strip() for p in doc.paragraphs]

passes = 0
failures = 0

for ec_id in sorted(EC_PARA_INDICES.keys()):
    indices, framework = EC_PARA_INDICES[ec_id]
    expected_badge, expected_desc = EXPECTED[ec_id]

    # Join content paragraphs into one text block
    content = " ".join(all_paras[i] for i in indices if all_paras[i])
    result = classify_text([content], framework)
    para = result["paragraphs"][0]
    actual_badge = para["badge"]

    status = "PASS" if actual_badge == expected_badge else "FAIL"
    if status == "PASS":
        passes += 1
    else:
        failures += 1

    print(f"\n{'='*65}")
    print(f"[{status}] {ec_id} ({framework})  badge={actual_badge}")
    print(f"       expected: {expected_badge}")
    print(f"       note:     {expected_desc[:80]}")
    print(f"{'='*65}")
    for i, s in enumerate(para["sentences"]):
        blend = " [BLEND]" if s["blend"] else ""
        trig  = f"  <- {s['trigger_phrase']}" if s["trigger_phrase"] else ""
        print(f"  {i:2d}. [{s['label']:14s}]{blend}{trig}")
        print(f"       {s['text'][:95]}")

print(f"\n{'='*65}")
print(f"Results: {passes} PASS, {failures} FAIL  ({passes}/{passes+failures})")
