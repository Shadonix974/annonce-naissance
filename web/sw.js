const CACHE = 'annonce-v3';
const CORE = [
  '/', '/index.html', '/styles.css', '/app.js', '/manifest.webmanifest',
  '/icons/icon-192.png', '/icons/icon-512.png', '/icons/favicon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // Cross-origin: let the browser handle directly.
  if (url.origin !== location.origin) return;

  // Admin and SSE: never cache.
  if (url.pathname.startsWith('/api/admin/') || url.pathname === '/api/stream') return;

  // Any request with a query string bypasses the cache entirely.
  // This is how we invalidate a photo after recrop: the URL gains a ?v=N
  // suffix and therefore hits the network without matching any cached entry.
  if (url.search) return;

  // Initial state: network-first, cache fallback.
  if (url.pathname === '/api/state') {
    e.respondWith(
      fetch(e.request).then((r) => {
        caches.open(CACHE).then((c) => c.put(e.request, r.clone()));
        return r;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Photos: cache-first with long TTL (only reached for URLs with no query).
  if (url.pathname.startsWith('/photos/')) {
    e.respondWith(caches.match(e.request).then((hit) => hit ?? fetch(e.request).then((r) => {
      caches.open(CACHE).then((c) => c.put(e.request, r.clone()));
      return r;
    })));
    return;
  }

  // Other assets: stale-while-revalidate.
  if (url.pathname === '/' || url.pathname.startsWith('/icons/') || /\.(css|js|woff2|png|svg|webmanifest)$/.test(url.pathname)) {
    e.respondWith(caches.match(e.request).then((hit) => {
      const fresh = fetch(e.request).then((r) => {
        caches.open(CACHE).then((c) => c.put(e.request, r.clone()));
        return r;
      });
      return hit ?? fresh;
    }));
  }
});
