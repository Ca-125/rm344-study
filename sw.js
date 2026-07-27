const CACHE_NAME = 'rm344-pwa-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './favicon-32.png'
];

// Install: pre-cache app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches and take control
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy:
// - HTML: stale-while-revalidate (show cached immediately, update in background)
// - Static assets (icons, manifest): cache-first
// - Other: network-first with cache fallback
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and extensions
  if (request.method !== 'GET' || url.protocol.match(/^(chrome-extension|file|blob|data):/)) {
    return;
  }

  const isHTML = url.pathname === '/' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('.html');
  const isStaticAsset = ASSETS.some(asset =>
    asset.match(/\.(png|ico|json)$/) && url.pathname.endsWith(asset.replace('./', ''))
  );

  if (isHTML) {
    // Stale-while-revalidate for HTML
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(request).then(cached => {
          const fetchPromise = fetch(request).then(response => {
            // Only cache valid responses
            if (response && response.status === 200) {
              cache.put(request, response.clone());
            }
            return response;
          }).catch(() => cached);
          // Return cached immediately, or wait for network if no cache
          return cached || fetchPromise;
        })
      )
    );
  } else if (isStaticAsset) {
    // Cache-first for static assets (icons rarely change)
    event.respondWith(
      caches.match(request).then(cached =>
        cached || fetch(request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
      )
    );
  } else {
    // Network-first for everything else
    event.respondWith(
      fetch(request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone).catch(() => {}));
        return response;
      }).catch(() =>
        caches.match(request).then(cached => cached || new Response('离线模式', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        }))
      )
    );
  }
});

// Listen for skip waiting message
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
