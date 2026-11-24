import { settings } from '../store/settings';
import { tick } from './haptics';
import { IconClose, IconDrop, IconHistory, IconSettings } from './icons';
import { go, screen, type Screen } from './state';

function BrandName({ name }: { name: string }) {
  const i = name.indexOf('.');
  const a = i >= 0 ? name.slice(0, i) : name;
  const b = i >= 0 ? name.slice(i + 1) : '';
  return (
    <>
      {a}
      <span class="dot">.</span>
      {b}
    </>
  );
}

function NavButton({ to, label, children }: { to: Screen; label: string; children: preact.ComponentChildren }) {
  const current = screen.value === to;
  return (
    <button
      type="button"
      class="icon-btn"
      aria-label={label}
      aria-current={current ? 'page' : undefined}
      onClick={() => {
        tick();
        go(to);
      }}
    >
      {children}
    </button>
  );
}

export function Header() {
  const name = settings.value.appName;
  const onMain = screen.value === 'measure';
  return (
    <header class="header">
      <h1 class="pill glass brand">
        <button type="button" class="brand" onClick={() => go('measure')}>
          <BrandName name={name} />
          <span class="visually-hidden">, на главный экран</span>
        </button>
      </h1>
      <nav class="pill glass nav" aria-label="Разделы">
        {onMain ? (
          <>
            <NavButton to="history" label="История">
              <IconHistory />
            </NavButton>
            <NavButton to="water" label="Подмена воды">
              <IconDrop />
            </NavButton>
            <NavButton to="settings" label="Настройки">
              <IconSettings />
            </NavButton>
          </>
        ) : (
          <button
            type="button"
            class="icon-btn"
            aria-label="Закрыть"
            onClick={() => {
              tick();
              go('measure');
            }}
          >
            <IconClose />
          </button>
        )}
      </nav>
    </header>
  );
}
