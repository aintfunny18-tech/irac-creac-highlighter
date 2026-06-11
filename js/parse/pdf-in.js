// .pdf ingestion via pdf.js (vendored legacy build, lazy-loaded on first
// use). Text-based PDFs only; scanned PDFs produce a warning. Lines are
// reconstructed from positioned glyph items, with paragraph breaks inferred
// from vertical gaps.

import { parsePlaintext } from "./text.js";

let pdfjsLoading = null;

function loadPdfjs() {
  if (!pdfjsLoading) {
    pdfjsLoading = import("../vendor/pdfjs/pdf.min.js").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "../vendor/pdfjs/pdf.worker.min.js",
        import.meta.url
      ).href;
      return pdfjs;
    });
  }
  return pdfjsLoading;
}

/** Group positioned text items into lines, then lines into paragraphs. */
function pageItemsToText(items) {
  // Group items by their (rounded) baseline Y.
  const lines = new Map();
  for (const item of items) {
    if (!item.str) continue;
    const y = Math.round(item.transform[5]);
    if (!lines.has(y)) lines.set(y, []);
    lines.get(y).push(item);
  }
  // Sort lines top→bottom (PDF y-axis points up), items left→right.
  const sortedYs = [...lines.keys()].sort((a, b) => b - a);
  const lineTexts = [];
  let prevY = null;
  const lineGaps = [];
  for (const y of sortedYs) {
    const text = lines
      .get(y)
      .sort((a, b) => a.transform[4] - b.transform[4])
      .map((item) => item.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    if (prevY !== null) lineGaps.push(prevY - y);
    lineTexts.push({ text, gap: prevY === null ? 0 : prevY - y });
    prevY = y;
  }
  // Paragraph break when the vertical gap clearly exceeds the typical line gap.
  const typicalGap = lineGaps.length
    ? lineGaps.slice().sort((a, b) => a - b)[Math.floor(lineGaps.length / 2)]
    : 0;
  let out = "";
  lineTexts.forEach((line, i) => {
    if (i === 0) {
      out = line.text;
    } else if (typicalGap > 0 && line.gap > typicalGap * 1.6) {
      out += "\n\n" + line.text;
    } else {
      out += "\n" + line.text;
    }
  });
  return out;
}

/** Parse a File (.pdf) → { paragraphs, warnings }. */
export async function parsePdf(file) {
  const pdfjs = await loadPdfjs();
  const warnings = [];
  const pagesText = [];
  try {
    const data = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data }).promise;
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      pagesText.push(pageItemsToText(content.items));
    }
    await doc.destroy();
  } catch (err) {
    return { paragraphs: [], warnings: [`Could not read this PDF file. (${err.message})`] };
  }

  if (pagesText.length) {
    const avgChars = pagesText.reduce((sum, t) => sum + t.length, 0) / pagesText.length;
    if (avgChars < 50) {
      warnings.push("This PDF may be scanned or image-based. Text extraction may be incomplete.");
    }
  }

  // Collapse single newlines (line wraps) to spaces while preserving blank
  // lines as paragraph breaks. The escaped NUL sentinel avoids regex
  // lookbehind, which older Safari lacks.
  const joined = pagesText
    .join("\n\n")
    .replace(/\n{2,}/g, "\u0000")
    .replace(/\n/g, " ")
    .replace(/\u0000/g, "\n\n");
  const { paragraphs } = parsePlaintext(joined);
  if (!paragraphs.length) {
    warnings.push("The PDF appears to contain no extractable text.");
  }
  return { paragraphs, warnings };
}
