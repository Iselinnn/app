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

  // ignoreVary: хостинги отдают Vary: Origin / Accept-Encoding, из-за чего запросы модулей
  // (с заголовком Origin) не совпадали бы с закэшированными ответами.
  const opts: CacheQueryOptions = { ignoreSearch: true, ignoreVary: true };
  if (req.mode === 'navigate') {
    // Навигация только в корень приложения: вложенные страницы (например, ./rot/) живут отдельно.
    const scopePath = new URL('./', sw.location.href).pathname;
    if (url.pathname !== scopePath && url.pathname !== `${scopePath}index.html`) return;
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => (await cache.match('./index.html', opts)) ?? fetch(req)),
    );
    return;
  }
  if (url.pathname.startsWith(`${new URL('./', sw.location.href).pathname}rot/`)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(req, opts);
      return cached ?? fetch(req);
    }),
  );
});
