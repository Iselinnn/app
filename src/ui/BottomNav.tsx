/** Нижняя навигация: стеклянная капсула с моно-подписями; активный пункт — винная точка над словом. */
import { tick } from './haptics';
import { go, screen, type Screen } from './state';

const ITEMS: { to: Screen; label: string }[] = [
  { to: 'measure', label: 'замер' },
  { to: 'history', label: 'история' },
  { to: 'water', label: 'долив' },
  { to: 'settings', label: 'настройки' },
];

export function BottomNav() {
  const current = screen.value;
  return (
    <nav class="nav glass" aria-label="Разделы">
      {ITEMS.map((it) => (
        <button
          key={it.to}
          type="button"
          aria-current={current === it.to ? 'page' : undefined}
          onClick={() => {
            if (current !== it.to) {
              tick();
              go(it.to);
            }
          }}
        >
          {it.label}
        </button>
      ))}
    </nav>
  );
}
