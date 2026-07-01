/* Mundial 2026 Predictor — Service Worker v2
   CACHE_VERSION se inyecta en cada build por el plugin Vite (vite.config.js).
   Cambiar el valor fuerza a iOS Safari a detectar el SW como nuevo.

   Estrategias:
   - HTML (navigate):     Network-first  → siempre HTML fresco, código actualizado
   - /assets/* (Vite):   Cache-first    → inmutables (content hash), sin red innecesaria
   - /api/*:             Network-first  → datos en vivo, fallback offline
   - resto (icons, etc): Stale-while-revalidate → rápido + actualización en fondo
*/

const CACHE_VERSION = '__CACHE_VERSION__'; // reemplazado por vite.config.js en cada build
const CACHE_NAME    = `wc26-${CACHE_VERSION}`;

const PRECACHE = ['/manifest.json', '/icon-192.svg', '/icon-512.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((c) => c.addAll(PRECACHE))
  );
  // Activar de inmediato sin esperar a que cierren las pestañas abiertas
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      // Eliminar todos los caches de versiones anteriores
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
      // Tomar control de todas las pestañas/ventanas abiertas
      await self.clients.claim();
    })()
  );
});

// Permite que la página fuerce skipWaiting (para update manual)
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Ignorar no-GET y cross-origin
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  const isHtml  = request.mode === 'navigate'
                  || request.headers.get('Accept')?.includes('text/html');
  const isApi   = url.pathname.startsWith('/api/');
  const isAsset = url.pathname.startsWith('/assets/');

  // ── HTML: Network-first ─────────────────────────────────────────────────────
  // Garantiza que el usuario siempre cargue el index.html más reciente,
  // que a su vez referencia los bundles JS/CSS del último deploy.
  if (isHtml) {
    e.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            caches.open(CACHE_NAME).then((c) => c.put(request, res.clone()));
          }
          return res;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached ?? caches.match('/'))
        )
    );
    return;
  }

  // ── API: Network-first con fallback offline ─────────────────────────────────
  if (isApi) {
    e.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            caches.open(CACHE_NAME).then((c) => c.put(request, res.clone()));
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // ── /assets/*: Cache-first ──────────────────────────────────────────────────
  // Vite fingerprinta todos los assets con content hash → son inmutables.
  // Si el contenido cambia, el nombre de archivo cambia → nuevo recurso.
  if (isAsset) {
    e.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((res) => {
            if (res.ok) {
              caches.open(CACHE_NAME).then((c) => c.put(request, res.clone()));
            }
            return res;
          })
      )
    );
    return;
  }

  // ── Resto (icons, manifest, etc): Stale-while-revalidate ───────────────────
  e.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached       = await cache.match(request);
      const networkFetch = fetch(request).then((res) => {
        if (res.ok) cache.put(request, res.clone());
        return res;
      });
      return cached ?? networkFetch;
    })
  );
});
