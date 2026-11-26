// Service worker страницы «code rotted»: кэширует только свои файлы, работает офлайн.
const VERSION = 'rot-v1';
const FILES = ['./', './index.html', './style.css', './app.js', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './icon-180.png'];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('rot-') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const opts = { ignoreSearch: true, ignoreVary: true };
  if (req.mode === 'navigate') {
    event.respondWith(caches.open(VERSION).then(async (c) => (await c.match('./index.html', opts)) ?? fetch(req)));
    return;
  }
  event.respondWith(caches.open(VERSION).then(async (c) => (await c.match(req, opts)) ?? fetch(req)));
});
