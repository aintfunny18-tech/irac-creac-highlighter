// Replaces the old app's service worker at this address. When a browser that
// installed the old offline app checks for an update, it gets this worker,
// which clears the old cache, removes itself, and reloads open tabs so they
// reach the redirect page.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) client.navigate(client.url);
    })()
  );
});
