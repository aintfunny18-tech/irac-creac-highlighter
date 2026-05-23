# diag_civpro.py — CivPro model answer sentence-level accuracy diagnostic
import sys, io, os, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.path.insert(0, os.path.dirname(__file__))
from docx import Document
from app.classifier import classify_text

STRUCT_LABEL_RE = re.compile(
    r'^(?P<lbl>issue|rule|analysis|application(?:\s*[—\-][^:]{0,60})?|conclusion)\s*:\s*',
    re.I,
)

def expected_label(para_text: str) -> str | None:
    """Return expected label for all sentences in this paragraph, or None if unlabeled."""
    m = STRUCT_LABEL_RE.match(para_text)
    if not m:
        return None
    lbl = m.group('lbl').lower()
    if lbl.startswith('issue'):       return 'ISSUE'
    if lbl.startswith('rule'):        return 'RULE'
    if lbl.startswith('analysis') or lbl.startswith('application'): return 'APPLICATION'
    if lbl.startswith('conclusion'):  return 'CONCLUSION'
    return None

# ---------------------------------------------------------------------------
# Section definitions: each entry is a complete IRAC / RAC model answer block
# ---------------------------------------------------------------------------
SECTIONS = [
    # ── Part II: Short Answer — RAC format (passed as CRAC to classifier) ──
    ("P2-Q1", "Part II Q1: Waived Objection",    [155, 156, 157], "CRAC"),
    ("P2-Q2", "Part II Q2: Notice Failure",       [159, 160, 161], "CRAC"),
    ("P2-Q3", "Part II Q3: Disputed Domicile",    [163, 164, 165], "CRAC"),
    ("P2-Q4", "Part II Q4: Pre-Suit Notice",      [167, 168, 169], "CRAC"),
    # ── Part III Essay 1 — IRAC format ──
    ("E1-S1", "Essay 1 Sub-1: General Jurisdiction",        [174, 175, 176, 177],                "IRAC"),
    ("E1-S2", "Essay 1 Sub-2: Specific Jurisdiction",       [179, 180, 181, 182, 183, 184],      "IRAC"),
    ("E1-S3", "Essay 1 Sub-3: Forum Non Conveniens",        [186, 187, 188, 189, 190, 191, 192], "IRAC"),
    # ── Part III Essay 2 — IRAC format ──
    ("E2-S1", "Essay 2 Sub-1: Virginia Damages Review",     [195, 196, 197, 198, 199, 200],      "IRAC"),
    ("E2-S2", "Essay 2 Sub-2: Expert Locality Rule",        [202, 203, 204, 205],                "IRAC"),
]

doc = Document(os.path.join(os.path.dirname(__file__),
                            'CivPro_II_Exam1_Piedmont_Healthcare.docx'))
all_paras = [p.text.strip() for p in doc.paragraphs]

total_correct = 0
total_sentences = 0
section_results = []

for sec_id, sec_name, para_indices, framework in SECTIONS:
    para_texts = [all_paras[i] for i in para_indices if i < len(all_paras) and all_paras[i]]

    # Build expected-label map: paragraph index → expected label
    expected_map = {}
    for idx, pt in enumerate(para_texts):
        expected_map[idx] = expected_label(pt)

    result = classify_text(para_texts, framework)

    sec_correct = 0
    sec_total   = 0
    sentence_details = []

    for p_idx, para in enumerate(result["paragraphs"]):
        exp = expected_map.get(p_idx)
        for sent in para["sentences"]:
            act = sent["label"]
            sec_total += 1
            is_correct = (exp is None) or (act == exp)
            if is_correct:
                sec_correct += 1
            sentence_details.append({
                "p_idx": p_idx,
                "exp": exp,
                "act": act,
                "ok": is_correct,
                "trig": sent.get("trigger_phrase", ""),
                "text": sent["text"],
            })

    total_correct  += sec_correct
    total_sentences += sec_total
    section_results.append((sec_id, sec_name, sec_correct, sec_total, sentence_details))

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------
print(f"\n{'='*75}")
print("CivPro Model Answer — Sentence Classification Accuracy")
print(f"{'='*75}")

for sec_id, sec_name, sc, st, details in section_results:
    pct = sc / st * 100 if st else 0
    status = "✅" if sc == st else f"⚠️  {sc}/{st}"
    print(f"\n[{sec_id}] {sec_name}")
    print(f"  Accuracy: {sc}/{st} ({pct:.0f}%)  {status}")
    for d in details:
        ok_mark = "  " if d["ok"] else "✗ "
        trig = f"  <- {d['trig']}" if d['trig'] else ""
        exp_str = d['exp'] if d['exp'] else "?"
        print(f"  {ok_mark}[exp:{exp_str:<12s}] [{d['act']:<14s}]{trig}")
        print(f"       {d['text'][:100]}")

print(f"\n{'='*75}")
pct_total = total_correct / total_sentences * 100 if total_sentences else 0
print(f"TOTAL: {total_correct}/{total_sentences} sentences correct  ({pct_total:.1f}%)")
print(f"{'='*75}")
