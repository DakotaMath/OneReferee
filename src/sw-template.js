/* Service worker for PDF Spacer Notes. Generated at build time from src/sw-template.js. */
const VERSION = '__VERSION__';
const CACHE = 'pdf-spacer-' + VERSION;
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('pdf-spacer-') && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const isPage = req.mode === 'navigate';
      const cached = await cache.match(isPage ? './' : req, { ignoreSearch: isPage });
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res.ok && url.pathname.includes('/pdfjs/')) cache.put(req, res.clone());
        return res;
      } catch (err) {
        if (isPage) {
          const shell = await cache.match('./');
          if (shell) return shell;
        }
        throw err;
      }
    }),
  );
});
