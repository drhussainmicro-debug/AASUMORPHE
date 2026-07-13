/* ============================================================================
   Morphē — service worker

   HOW UPDATES WORK, AND WHY IT IS BUILT THIS WAY.

   The app is one big HTML file whose content changes whenever faculty publish.
   So the page itself is fetched NETWORK-FIRST: if the phone is online it always
   gets the newest published build, and the cache is only a fallback for when it
   is not. That means an update can never get "stuck" behind a stale cache, which
   is the classic way PWAs go wrong.

   Icons and the manifest barely ever change, so those are CACHE-FIRST.

   The page itself (not this worker) decides when to TELL the user an update
   exists: it re-fetches index.html in the background and compares the content
   fingerprint with the one it is running. If they differ, it shows a banner.
   That works even though this worker file has not changed — which it usually
   has not, because only the content changed.
   ============================================================================ */

const SW_VERSION = 'morphe-v1';
const SHELL = 'morphe-shell-v1';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL)
      .then(c => c.addAll(ASSETS).catch(() => {/* a missing optional asset must not block install */}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== SHELL).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;          /* never touch third-party requests */

  const isPage = req.mode === 'navigate' ||
                 url.pathname.endsWith('/') ||
                 url.pathname.endsWith('index.html');

  if (isPage) {
    /* NETWORK-FIRST: always prefer the freshly published build. */
    e.respondWith(
      fetch(req, { cache: 'no-store' })
        .then(res => {
          const copy = res.clone();
          caches.open(SHELL).then(c => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  /* CACHE-FIRST for icons and the manifest. */
  e.respondWith(
    caches.match(req).then(hit =>
      hit || fetch(req).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(SHELL).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => hit)
    )
  );
});

/* The page can ask us to drop everything and re-fetch (the Refresh button). */
self.addEventListener('message', e => {
  if (e.data === 'CLEAR_CACHE') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});
