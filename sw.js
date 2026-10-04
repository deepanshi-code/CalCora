// Service worker: makes the app installable and usable offline.
// Strategy:
//   - App shell (same-origin files): stale-while-revalidate. Opens instantly from cache,
//     refreshes in the background, so updates appear on the next visit.
//   - Google Fonts: stale-while-revalidate (falls back to system fonts if never cached).
//   - Currency API and anything else cross-origin: network only. The app already has its
//     own offline fallback rates, and stale exchange rates must not be served silently.
// Both the precache and the background refresh bypass the browser's HTTP cache
// (cache: 'reload' / 'no-cache'); otherwise a stale copy sitting in the HTTP cache gets
// pinned into the service-worker cache and users never see the new version.
// Bump CACHE_VERSION whenever the file list changes.
const CACHE_VERSION = 'calcora-v4.13';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'calculator.js',
  'converters.js',
  'bmi.js',
  'formulas.js',
  'calculus.js',
  'integration.js',
  'formula-solver.js',
  'units.js',
  'formula-data.js',
  'unit-converter.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => Promise.all(SHELL.map((path) => {
        const url = new URL(path, self.location).href;
        return fetch(new Request(url, { cache: 'reload' })).then((response) => {
          if (!response.ok) throw new Error(`Precache failed for ${path}: ${response.status}`);
          return cache.put(cacheKey(new URL(url)), response);
        });
      })))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Same-origin files are stored by path only, so "styles.css?v=3.2" and "/?r=35" don't
// create a new cache entry per query string. "/index.html" and "/" share one entry.
function cacheKey(url) {
  const path = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
  return new Request(url.origin + path);
}

function staleWhileRevalidate(request, key, bypassHttpCache) {
  return caches.open(CACHE_VERSION).then((cache) =>
    cache.match(key).then((cached) => {
      const network = fetch(bypassHttpCache ? new Request(request, { cache: 'no-cache' }) : request)
        .then((response) => {
          if (response && (response.ok || response.type === 'opaque')) {
            cache.put(key, response.clone());
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request, cacheKey(url), true));
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(request, request, false));
  }
  // everything else (currency API) goes straight to the network
});
