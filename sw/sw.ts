/**
 * Service worker: кэширует только собственные файлы сборки (список подставляется
 * при сборке), работает полностью офлайн, при новой версии ждёт команды SKIP_WAITING
 * от приложения и затем удаляет старые кэши.
 */
const sw = self as unknown as ServiceWorkerGlobalScope;

const VERSION = '__VERSION__';
const PRECACHE: string[] = '__PRECACHE__' as unknown as string[];
const CACHE_NAME = `salimeter-${VERSION}`;

sw.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE.map((f) => `./${f}`))),
  );
});

sw.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await sw.clients.claim();
    })(),
  );
});

sw.addEventListener('message', (event: ExtendableMessageEvent) => {
  const data: unknown = event.data;
  if (typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'SKIP_WAITING') {
    void sw.skipWaiting();
  }
});

sw.addEventListener('fetch', (event: FetchEvent) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== sw.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => (await cache.match('./index.html')) ?? fetch(req)),
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      return cached ?? fetch(req);
    }),
  );
});
