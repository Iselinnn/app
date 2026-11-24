/** Поле ввода с степперами и свайпом; значение набирается своей клавиатурой. */
import { useRef } from 'preact/hooks';
import { activeField, buffer, displayValue, fieldSpec, focusField, nudge, pressKey, type FieldId, type Key } from './state';
import { tick } from './haptics';
import { IconMinus, IconPlus } from './icons';

const SWIPE_PX = 14;

function HoldButton({
  label,
  onStep,
  children,
}: {
  label: string;
  onStep: () => void;
  children: preact.ComponentChildren;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);
  const fired = useRef(false);
  const stop = (): void => {
    if (timer.current) clearTimeout(timer.current);
    if (interval.current) clearInterval(interval.current);
    timer.current = null;
    interval.current = null;
  };
  return (
    <button
      type="button"
      class="stepper"
      aria-label={label}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        fired.current = false;
        timer.current = setTimeout(() => {
          interval.current = setInterval(() => {
            fired.current = true;
            onStep();
          }, 90);
        }, 450);
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={stop}
      onClick={() => {
        stop();
        if (!fired.current) onStep();
      }}
    >
      {children}
    </button>
  );
}

export function NumberField({ id, label, unit }: { id: FieldId; label: string; unit: string }) {
  const spec = fieldSpec(id);
  const active = activeField.value === id;
  const editing = active && buffer.value !== null;
  const text = displayValue(id);
  const drag = useRef<{ x: number; acc: number; moved: boolean; pointerId: number } | null>(null);

  const step = (dir: 1 | -1): void => {
    tick();
    nudge(id, dir);
  };

  return (
    <div class={active ? 'field is-active' : 'field'} data-field={id}>
      <HoldButton label={`${label}: минус ${spec.step}`} onStep={() => step(-1)}>
        <IconMinus />
      </HoldButton>
      <div
        class="field-body"
        role="spinbutton"
        tabIndex={0}
        aria-label={label}
        aria-valuenow={spec.get()}
        aria-valuemin={spec.min}
        aria-valuemax={spec.max}
        aria-valuetext={`${text} ${unit}`.trim()}
        onFocus={() => focusField(id)}
        onKeyDown={(e) => {
          if (activeField.value !== id) focusField(id);
          if (e.key === 'ArrowUp') step(1);
          else if (e.key === 'ArrowDown') step(-1);
          else if (e.key === 'Backspace') pressKey('backspace');
          else if (/^[0-9.]$/.test(e.key)) pressKey(e.key as Key);
          else if (e.key === ',') pressKey('.');
          else return;
          e.preventDefault();
        }}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          drag.current = { x: e.clientX, acc: 0, moved: false, pointerId: e.pointerId };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d?.pointerId !== e.pointerId) return;
          d.acc += e.clientX - d.x;
          d.x = e.clientX;
          while (Math.abs(d.acc) >= SWIPE_PX) {
            const dir = d.acc > 0 ? 1 : -1;
            d.acc -= dir * SWIPE_PX;
            d.moved = true;
            step(dir);
          }
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (d && !d.moved) focusField(id);
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <span class="field-label">{label}</span>
        <span class="field-value">
          <span class="num">{text}</span>
          {editing && <span class="caret" aria-hidden="true" />}
          {unit && <span class="field-unit">{unit}</span>}
        </span>
      </div>
      <HoldButton label={`${label}: плюс ${spec.step}`} onStep={() => step(1)}>
        <IconPlus />
      </HoldButton>
    </div>
  );
}
