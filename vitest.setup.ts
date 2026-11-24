import 'fake-indexeddb/auto';

// happy-dom: без matchMedia анимация цифр и тема падают в дефолт; reduced-motion — мгновенные значения.
window.matchMedia = (query: string): MediaQueryList =>
  ({
    matches: query.includes('reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }) as MediaQueryList;
