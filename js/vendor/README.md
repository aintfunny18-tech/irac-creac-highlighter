# Vendored libraries

All third-party libraries are vendored as static files so the app works
offline (PWA) and has no build step. Versions are pinned; update by
re-downloading from the URLs below and bumping this table.

| File | Package | Version | Source URL |
| --- | --- | --- | --- |
| `mammoth/mammoth.browser.min.js` | mammoth | 1.11.0 | https://unpkg.com/mammoth@1.11.0/mammoth.browser.min.js |
| `pdfjs/pdf.min.js` | pdfjs-dist (legacy build) | 4.10.38 | https://unpkg.com/pdfjs-dist@4.10.38/legacy/build/pdf.min.mjs |
| `pdfjs/pdf.worker.min.js` | pdfjs-dist (legacy build) | 4.10.38 | https://unpkg.com/pdfjs-dist@4.10.38/legacy/build/pdf.worker.min.mjs |
| `docx/docx.iife.js` | docx | 9.7.1 | https://unpkg.com/docx@9.7.1/dist/index.iife.js |

Notes:

- The pdf.js **legacy** build is used deliberately: the modern build requires
  `Promise.withResolvers`, which breaks older iPad Safari. The `.mjs` files
  are renamed to `.js` so every static server serves them with a JS MIME type.
- `pdf.min.js` and `pdf.worker.min.js` must always be the **same version**.
- mammoth exposes the global `mammoth` (UMD); docx exposes the global `docx`
  (IIFE); both are lazy-loaded via script injection on first use.
- pdf.js is loaded via dynamic `import()` and its worker path is set to the
  vendored worker file.
