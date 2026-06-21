/* Mundial 2026 Predictor — Service Worker
   Strategy:
   - Static assets (JS/CSS/HTML): cache-first, stale-while-revalidate
   - API calls (/api/*): network-first, fallback to cache (enables offline)
   - Opaque cross-origin requests: network-only (can't cache safely)
*/

const CACHE_NAME = 'wc26-v1';
const OFFLINE_URL = '/';

// Assets to pre-cache on install
const PRECACHE_URLS = ['/', '/manifest.json', '/icon-192.svg', '/icon-512.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin requests
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  const isApi = url.pathname.startsWith('/api/');

  if (isApi) {
    // Network-first: try network, fall back to cache
    e.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
  } else {
    // Cache-first for static assets
    e.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (res.ok) {
              const clone = res.clone();
              caches.open(CACHE_NAME).then((c) => c.put(request, clone));
            }
            return res;
          })
      )
    );
  }
});
