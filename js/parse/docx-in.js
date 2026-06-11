// .docx ingestion via mammoth.js (vendored UMD build, lazy-loaded on first
// use). Everything runs in the browser; the file never leaves the device.

import { parsePlaintext } from "./text.js";

let mammothLoading = null;

function loadMammoth() {
  if (window.mammoth) return Promise.resolve(window.mammoth);
  if (!mammothLoading) {
    mammothLoading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "./js/vendor/mammoth/mammoth.browser.min.js";
      script.onload = () => resolve(window.mammoth);
      script.onerror = () =>
        reject(new Error("Could not load the Word-document reader. Reload and try again."));
      document.head.appendChild(script);
    });
  }
  return mammothLoading;
}

/** Parse a File (.docx) → { paragraphs, warnings }. */
export async function parseDocx(file) {
  const mammoth = await loadMammoth();
  let result;
  try {
    const arrayBuffer = await file.arrayBuffer();
    result = await mammoth.extractRawText({ arrayBuffer });
  } catch (err) {
    return {
      paragraphs: [],
      warnings: [
        "Could not read this .docx file. It may be corrupted or use an unsupported format.",
      ],
    };
  }
  // mammoth separates paragraphs with double newlines — exactly what
  // parsePlaintext expects.
  const { paragraphs, warnings } = parsePlaintext(result.value || "");
  if (!paragraphs.length) {
    warnings.push("The .docx file appears to contain no extractable text.");
  }
  return { paragraphs, warnings };
}
