/* Vanillate Motion service worker (generated at build time). */
const VERSION = '__VERSION__';
const SHELL = `vm-shell-${VERSION}`;
const RUNTIME = 'vm-runtime-v1';
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('vm-shell-') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Large tracking assets: cache-first, filled on first use.
  if (url.pathname.startsWith('/models/') || url.pathname.startsWith('/mediapipe/')) {
    event.respondWith(
      caches.open(RUNTIME).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Navigations: network first, fall back to the cached app shell (SPA routes work offline).
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/', { cacheName: SHELL })));
    return;
  }

  // Hashed assets & static files: cache first.
  event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
