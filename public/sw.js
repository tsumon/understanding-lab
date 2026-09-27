/* The build replaces these two markers with a content-derived public allowlist. */
const CACHE_NAME = "__CACHE_NAME__";
const PRECACHE = __PRECACHE__;
const allowed = new Set(PRECACHE.map((path) => new URL(path, self.location.origin).pathname));

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith("understanding-lab-public-") && name !== CACHE_NAME).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "ACTIVATE_UPDATE") { self.skipWaiting(); return; }
  if (event.data?.type !== "CHECK_CACHE") return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const complete = (await Promise.all(PRECACHE.map((path) => cache.match(path)))).every(Boolean);
    if (complete) event.source?.postMessage({ type: "CACHE_READY" });
  })());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (!allowed.has(url.pathname)) return;
  event.respondWith(caches.open(CACHE_NAME).then(async (cache) => {
    const cached = await cache.match(event.request, { ignoreSearch: true, ignoreVary: true });
    return cached ?? fetch(event.request);
  }));
});
