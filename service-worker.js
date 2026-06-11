// Offline support. Conventions follow the Finals Drill Program deployment:
// date-stamped cache name (bump on each release), network-first navigations
// with offline fallback, cache-first for same-origin assets, scoped URLs so
// the worker behaves under the GitHub Pages subpath.

const CACHE_NAME = "lwsc-pwa-2026-06-11-v1";

const RUNTIME_ASSETS = [
  "index.html",
  "offline.html",
  "manifest.webmanifest",
  "styles/tokens.css",
  "styles/app.css",
  "styles/print.css",
  "js/main.js",
  "js/engine/util.js",
  "js/engine/lexicon.js",
  "js/engine/lexicon-subjects.js",
  "js/engine/citations.js",
  "js/engine/segmenter.js",
  "js/engine/framework.js",
  "js/engine/parties.js",
  "js/engine/rules.js",
  "js/engine/passes.js",
  "js/engine/evidence.js",
  "js/engine/badges.js",
  "js/engine/coaching.js",
  "js/engine/classify.js",
  "js/parse/text.js",
  "js/parse/docx-in.js",
  "js/parse/pdf-in.js",
  "js/ui/state.js",
  "js/ui/messages.js",
  "js/ui/render.js",
  "js/ui/corrections.js",
  "js/ui/detail.js",
  "js/export/docx-out.js",
  "js/vendor/mammoth/mammoth.browser.min.js",
  "js/vendor/pdfjs/pdf.min.js",
  "js/vendor/pdfjs/pdf.worker.min.js",
  "js/vendor/docx/docx.iife.js",
  "examples/examples.js",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "assets/icons/maskable-512.png",
  "assets/icons/apple-touch-icon.png",
];

function scopedUrl(path) {
  return new URL(path, self.registration.scope).toString();
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(RUNTIME_ASSETS.map(scopedUrl)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("lwsc-pwa-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(scopedUrl("index.html"), copy));
          return response;
        })
        .catch(() =>
          caches
            .match(scopedUrl("index.html"))
            .then((response) => response || caches.match(scopedUrl("offline.html")))
        )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
