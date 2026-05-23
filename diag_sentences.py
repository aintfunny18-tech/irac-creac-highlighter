# Sentence-level diagnostic for all 12 test cases.
import sys, io, os, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.path.insert(0, os.path.dirname(__file__))

from docx import Document
from app.classifier import classify_text

_TEST_CASE_RE = re.compile(r'^TEST CASE ([ABC]-\d+)\s*\|', re.I)
_SKIP = [re.compile(p, re.I) for p in [
    r'^Note:', r'^PART [A-D]\b', r'^IRAC/CREAC Structural',
    r'^Test Document', r'^Prepared for', r'^Color legend',
    r'^This document', r'^The table below',
]]

FRAMEWORKS = {k: "CREAC" if k in ("B-1", "B-2", "C-7") else "IRAC"
              for k in ("A-1","A-2","A-3","B-1","B-2","C-1","C-2","C-3","C-4","C-5","C-6","C-7")}

def load_cases(path):
    doc = Document(path)
    cases, cur_id, cur_paras = {}, None, []
    for para in doc.paragraphs:
        t = para.text.strip()
        if not t:
            continue
        if re.match(r'^PART D\b', t, re.I) or 'Answer Key' in t:
            break
        m = _TEST_CASE_RE.match(t)
        if m:
            if cur_id:
                cases[cur_id] = cur_paras
            cur_id, cur_paras = m.group(1), []
            continue
        if any(p.match(t) for p in _SKIP):
            continue
        if cur_id:
            cur_paras.append(t)
    if cur_id and cur_paras:
        cases[cur_id] = cur_paras
    return cases


docx_path = os.path.join(os.path.dirname(__file__), "IRAC_CREAC_Test_Document_v1.0.docx")
cases = load_cases(docx_path)

for case_id in sorted(cases.keys()):
    fw = FRAMEWORKS[case_id]
    full = " ".join(cases[case_id])
    result = classify_text([full], fw)
    para = result["paragraphs"][0]
    print(f"\n{'='*60}")
    print(f"TEST CASE {case_id} ({fw})  badge={para['badge']}")
    print(f"{'='*60}")
    for i, s in enumerate(para["sentences"]):
        blend = " [BLEND]" if s["blend"] else ""
        trig  = f"  <- {s['trigger_phrase']}" if s["trigger_phrase"] else ""
        print(f"  {i:2d}. [{s['label']:14s}]{blend}{trig}")
        print(f"       {s['text']}")
