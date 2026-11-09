// Service Worker: Offline-Cache + Cross-Origin-Isolation (COOP/COEP) für GitHub Pages.
// GitHub Pages kann keine eigenen HTTP-Header setzen; SharedArrayBuffer (WASM-Threads)
// braucht aber COOP/COEP. Wir setzen sie hier auf jede Antwort (Prinzip von coi-serviceworker).
const CACHE = 'fonv-shell-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

function isolate(res) {
  if (res.status === 0) return res; // opaque
  const h = new Headers(res.headers);
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  h.set('Cross-Origin-Embedder-Policy', 'require-corp');
  h.set('Cross-Origin-Resource-Policy', 'cross-origin');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.headers.has('range')) return; // Range-Requests nie cachen
  e.respondWith(
    (async () => {
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
        return isolate(res);
      } catch {
        const cached = await caches.match(req);
        if (cached) return isolate(cached);
        throw new Error('offline und nicht im Cache: ' + req.url);
      }
    })(),
  );
});
