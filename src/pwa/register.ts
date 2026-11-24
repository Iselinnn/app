/** Регистрация service worker и предложение обновиться при новой версии. */
import { signal } from '@preact/signals';

/** Функция применения обновления (null — обновления нет). */
export const updateReady = signal<(() => void) | null>(null);

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  let reloadRequested = false;
  const offer = (worker: ServiceWorker): void => {
    updateReady.value = () => {
      reloadRequested = true;
      worker.postMessage({ type: 'SKIP_WAITING' });
    };
  };
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          if (!w) return;
          w.addEventListener('statechange', () => {
            if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
          });
        });
        setInterval(() => void reg.update(), 60 * 60 * 1000);
      })
      .catch((e: unknown) => {
        console.warn('Service worker не зарегистрирован', e);
      });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadRequested) location.reload();
    });
  });
}
