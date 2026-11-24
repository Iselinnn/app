import { pressKey, type Key } from './state';
import { tick } from './haptics';
import { IconBackspace } from './icons';

const KEYS: Key[] = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', 'backspace'];

export function Keypad() {
  return (
    <div class="keypad" role="group" aria-label="Клавиатура">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          class="key"
          data-key={k}
          aria-label={k === 'backspace' ? 'Стереть' : k === '.' ? 'Точка' : k}
          onClick={() => {
            tick();
            pressKey(k);
          }}
        >
          {k === 'backspace' ? <IconBackspace /> : k}
        </button>
      ))}
    </div>
  );
}
