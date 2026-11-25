/** Стеклянная «командная строка»: поля показания и температуры, кнопка →, чипы быстрых значений, выезжающая клавиатура. */
import { useRef, useState } from 'preact/hooks';
import { fixed } from '../calc';
import { categories } from '../store/categories';
import { addMeasurement } from '../store/measurements';
import { settings } from '../store/settings';
import { tick } from './haptics';
import { IconArrow, IconBackspace, IconCheck, IconMinus, IconPlus } from './icons';
import {
  activeField,
  buffer,
  closeKeypad,
  displayValue,
  fieldSpec,
  focusField,
  keypadOpen,
  mode,
  nudge,
  pressKey,
  reading,
  recentReadings,
  result,
  setQuickReading,
  setQuickTemp,
  sheet,
  tempC,
  type FieldId,
  type Key,
} from './state';
import { SAL_UNIT } from './strings';
import { showToast } from './toast';

const SWIPE_PX = 14;

function Field({ id, label, unit }: { id: FieldId; label: string; unit: string }) {
  const spec = fieldSpec(id);
  const active = activeField.value === id && keypadOpen.value;
  const editing = active && buffer.value !== null;
  const text = displayValue(id);
  const drag = useRef<{ x: number; acc: number; moved: boolean; pointerId: number } | null>(null);
  const step = (dir: 1 | -1): void => {
    tick();
    nudge(id, dir);
  };
  return (
    <div
      class={active ? 'field is-active' : 'field'}
      data-field={id}
      role="spinbutton"
      tabIndex={0}
      aria-label={label}
      aria-valuenow={spec.get()}
      aria-valuemin={spec.min}
      aria-valuemax={spec.max}
      aria-valuetext={`${text} ${unit}`.trim()}
      onKeyDown={(e) => {
        if (activeField.value !== id) focusField(id);
        if (e.key === 'ArrowUp') step(1);
        else if (e.key === 'ArrowDown') step(-1);
        else if (e.key === 'Backspace') pressKey('backspace');
        else if (e.key === 'Enter' || e.key === 'Escape') closeKeypad();
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
        if (d && !d.moved) {
          tick();
          focusField(id);
        }
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
  );
}

const KEYS: Key[] = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', 'backspace'];

function Keypad() {
  const id = activeField.value;
  const spec = fieldSpec(id);
  return (
    <div class="keypad" role="group" aria-label="Клавиатура" data-testid="keypad">
      <button type="button" class="key" aria-label={`Минус ${spec.step}`} onClick={() => { tick(); nudge(id, -1); }}>
        <IconMinus />
      </button>
      <button type="button" class="key" aria-label={`Плюс ${spec.step}`} onClick={() => { tick(); nudge(id, 1); }}>
        <IconPlus />
      </button>
      <button type="button" class="key key-text key-done" onClick={() => { tick(); closeKeypad(); }}>
        готово
      </button>
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

const QUICK_TEMPS = [22, 24, 25, 26];

/** Чипы: быстрые температуры и последние показания. */
export function QuickChips() {
  const s = settings.value;
  const m = mode.value;
  const t = tempC.value;
  const r = reading.value;
  const recent = recentReadings.value;
  const tempLabel = (c: number): string => (s.tempUnit === 'f' ? `${fixed((c * 9) / 5 + 32, 0)} °F` : `${c} °C`);
  return (
    <div class="chips-row" role="group" aria-label="Быстрые значения">
      {QUICK_TEMPS.map((c) => (
        <button
          key={c}
          type="button"
          class="chip"
          aria-pressed={Math.abs(t - c) < 0.05}
          onClick={() => {
            tick();
            setQuickTemp(c);
          }}
        >
          {tempLabel(c)}
        </button>
      ))}
      {m === 'measure' &&
        recent.map((v) => (
          <button
            key={v}
            type="button"
            class="chip chip-muted"
            aria-pressed={Math.abs(r - v) < 1e-9}
            aria-label={`Последнее показание ${fixed(v, 4)}`}
            onClick={() => {
              tick();
              setQuickReading(v);
            }}
          >
            ↺ {fixed(v, 4)}
          </button>
        ))}
    </div>
  );
}

export function CommandLine() {
  const m = mode.value;
  const s = settings.value;
  const open = keypadOpen.value;
  const [saved, setSaved] = useState(false);
  const tempUnit = s.tempUnit === 'f' ? '°F' : '°C';

  const save = async (): Promise<void> => {
    tick();
    if (categories.value.length > 0) {
      sheet.value = 'save';
      return;
    }
    try {
      await addMeasurement({
        reading: reading.value,
        temperature: tempC.value,
        scale: s.scale,
        glassCorrection: s.glassCorrection,
        beta: s.beta,
        categoryId: null,
      });
      setSaved(true);
      showToast('Замер сохранён');
      setTimeout(() => setSaved(false), 1400);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Не удалось сохранить');
    }
  };

  return (
    <section class="cmd glass" aria-label="Ввод">
      <div class="cmd-row">
        {m === 'measure' ? (
          <Field id="reading" label="показание" unit="" />
        ) : (
          <Field id="target" label="солёность" unit={SAL_UNIT[s.salinityUnit]} />
        )}
        <Field id="temp" label="температура" unit={tempUnit} />
        {m === 'measure' && (
          <button
            type="button"
            class={saved ? 'go is-done' : 'go'}
            aria-label="Сохранить замер"
            disabled={!Number.isFinite(result.value.salinity)}
            onClick={() => void save()}
          >
            {saved ? <IconCheck /> : <IconArrow />}
          </button>
        )}
      </div>
      {open && <Keypad />}
    </section>
  );
}
