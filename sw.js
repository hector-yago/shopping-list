// Service worker: la app funciona sin conexión. Red primero (siempre la última versión si hay conexión) y caché de respaldo.
const VERSION = '0.2.0'; // sincronizado por tools/sync-version.mjs
const CACHE = `shopping-list-${VERSION}`;
const SHELL = [
  './',
  'index.html',
  'css/styles.css',
  'js/app.js',
  'js/format.js',
  'js/stores.js',
  'js/products.js',
  'js/list.js',
  'js/stats.js',
  'js/migrations.js',
  'js/store.js',
  'js/version.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('shopping-list-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))),
  );
});
