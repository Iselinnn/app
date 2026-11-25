import { settings } from '../store/settings';
import { Segment } from './components';
import { go, mode, screen, setMode } from './state';

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
      {onMain && (
        <Segment
          label="Режим"
          value={mode.value}
          onChange={setMode}
          options={[
            { value: 'measure', label: 'замер' },
            { value: 'reverse', label: 'обратный' },
          ]}
        />
      )}
    </header>
  );
}
