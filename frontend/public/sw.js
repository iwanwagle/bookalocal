const CACHE_NAME = 'bookalocal-v1';
const STATIC_ASSETS = [
  '/',
  '/search',
  '/about',
  '/offline',
];

// Install: cache static shell
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {}))
  );
});

// Activate: clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: network-first for API, cache-first for static
self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin requests
  if (request.method !== 'GET' || url.origin !== location.origin) return;

  // API requests: network-only (never cache auth/data)
  if (url.pathname.startsWith('/api/')) return;

  // Pages and assets: network-first with cache fallback
  e.respondWith(
    fetch(request)
      .then((res) => {
        // Cache successful responses for HTML/JS/CSS
        if (res.ok && (request.destination === 'document' || request.destination === 'script' || request.destination === 'style')) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return res;
      })
      .catch(() =>
        caches.match(request).then((cached) => {
          if (cached) return cached;
          // For navigation requests, show offline page
          if (request.destination === 'document') {
            return caches.match('/offline') || new Response('<h1>You are offline</h1>', { headers: { 'Content-Type': 'text/html' } });
          }
        })
      )
  );
});
