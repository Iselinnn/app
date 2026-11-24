/** Тема, акцент и цвет целевого диапазона → CSS-переменные и meta theme-color. */
import { effect, signal } from '@preact/signals';
import { accentColor, settings, type Settings } from '../store/settings';

const mql = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

export function isDark(s: Settings): boolean {
  return s.theme === 'depth' || (s.theme === 'auto' && (mql?.matches ?? false));
}

export const dark = signal(isDark(settings.value));

export function applyTheme(s: Settings = settings.value): void {
  const d = isDark(s);
  dark.value = d;
  const root = document.documentElement;
  root.classList.toggle('theme-depth', d);
  root.classList.toggle('theme-fog', !d);
  root.style.setProperty('--accent', accentColor(s));
  root.style.setProperty('--target-color', s.targetColor);
  root.style.colorScheme = d ? 'dark' : 'light';
  const color = d ? '#0B0F14' : '#F7F7F6';
  for (const m of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) m.content = color;
  document.title = `${s.appName.replace('.', '')} — солёность по ареометру`;
}

/** Следит за настройками и системной темой; возвращает функцию отписки. */
export function startThemeSync(): () => void {
  const dispose = effect(() => {
    applyTheme(settings.value);
  });
  const onChange = (): void => {
    applyTheme();
  };
  mql?.addEventListener('change', onChange);
  return () => {
    dispose();
    mql?.removeEventListener('change', onChange);
  };
}
