/* Service worker for PDF Spacer Notes. Generated at build time from src/sw-template.js. */
const VERSION = '__VERSION__';
const CACHE = 'pdf-spacer-' + VERSION;
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      // First install: take over right away. An update instead waits until the page says it's a
      // safe moment (see main.ts), so an open page never loses the files it was loaded with.
      .then(() => (self.registration.active ? undefined : self.skipWaiting())),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
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
      // ignoreVary: module scripts send an Origin header the precache request didn't, which would
      // otherwise make a "Vary" response miss the cache.
      const cached = await cache.match(isPage ? './' : req, {
        ignoreSearch: isPage,
        ignoreVary: true,
      });
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res.ok && url.pathname.includes('/pdfjs/')) cache.put(req, res.clone());
        return res;
      } catch (err) {
        if (isPage) {
          const shell = await cache.match('./', { ignoreVary: true });
          if (shell) return shell;
        }
        throw err;
      }
    }),
  );
});
