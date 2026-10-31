/* FairShift service worker. Bump VERSION when shipping changes that must reach offline users. */
const VERSION = 'v3';
const SHELL_CACHE = `fairshift-shell-${VERSION}`;
const STATIC_CACHE = `fairshift-static-${VERSION}`;
const KNOWN_CACHES = [SHELL_CACHE, STATIC_CACHE];
const SHELL_URLS = ['/', '/index.html'];
const STATIC_URLS = [
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Each precache is best effort, so a flaky network does not block installation.
      await Promise.all(
        SHELL_URLS.map((url) => cache.add(url).catch(() => undefined)),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('fairshift-') && !KNOWN_CACHES.includes(name))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

function isStaticAsset(pathname) {
  return pathname.startsWith('/assets/') || STATIC_URLS.includes(pathname);
}

/** Cache first for hashed build assets, manifest and icon. */
async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
  return response;
}

/**
 * Pages come from the network so a new deploy is picked up. When the network fails, the cached
 * app shell is served and the in-app router shows the right page.
 */
async function navigate(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put('/index.html', response.clone());
    }
    return response;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    const shell = (await cache.match('/index.html')) || (await cache.match('/'));
    return shell || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // API calls are never cached: they must reflect the live state.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigate(request));
    return;
  }
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});
