// Change VERSION on each release. The new cache name makes every phone load the
// new files, and the activate step deletes the old cache.
const VERSION = '2.2.0';
const CACHE_PREFIX = 'wod-timer-';
const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`;

const APP_FILES = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './timeline.js',
  './audio.js',
  './settings.js',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  // `reload` skips the HTTP cache, so a new version never stores old files.
  const requests = APP_FILES.map((url) => new Request(url, { cache: 'reload' }));
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(requests))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names
        .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
        .map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

async function respond(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) {
    return cached;
  }
  if (request.mode === 'navigate') {
    const page = await cache.match('./index.html');
    if (page) {
      return page;
    }
  }
  return fetch(request);
}

self.addEventListener('fetch', (event) => {
  if (event.request.method === 'GET') {
    event.respondWith(respond(event.request));
  }
});
