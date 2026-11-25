/** Состояние интерфейса: экран, режим, вводимые значения, клавиатура, листы, вычисленные результаты. */
import { computed, signal } from '@preact/signals';
import {
  SCALE_FACTOR,
  clamp,
  density,
  expectedReading,
  fixed,
  measure,
  parseDecimal,
  readingCorridor,
  roundToStep,
  type CalcOptions,
} from '../calc';
import { measurements } from '../store/measurements';
import { settings, type HeroUnit, type Settings } from '../store/settings';

export type Screen = 'measure' | 'history' | 'water' | 'settings';
export type Mode = 'measure' | 'reverse';
export type FieldId = 'reading' | 'temp' | 'target';
export type Sheet = 'save' | 'onboard' | null;

export const screen = signal<Screen>('measure');
export const mode = signal<Mode>('measure');
/** Показание ареометра. */
export const reading = signal(1.023);
/** Температура воды, всегда в °C. */
export const tempC = signal(25);
/** Целевая солёность для обратного режима; null — брать из настроек. */
export const targetInput = signal<number | null>(null);
export const activeField = signal<FieldId>('reading');
/** Буфер набора с клавиатуры для активного поля; null — набор не начат. */
export const buffer = signal<string | null>(null);
/** Выезжающая клавиатура открыта. */
export const keypadOpen = signal(false);
/** Открытый лист: выбор категории при сохранении или предложение создать категории. */
export const sheet = signal<Sheet>(null);

export const calcOptions = computed<CalcOptions>(() => {
  const s = settings.value;
  return { scale: s.scale, glassCorrection: s.glassCorrection, beta: s.beta };
});
export const effectiveTarget = computed(() => targetInput.value ?? settings.value.target);
export const result = computed(() => measure(reading.value, tempC.value, calcOptions.value));
export const reverse = computed(() => expectedReading(effectiveTarget.value, tempC.value, calcOptions.value));
export const corridor = computed(() =>
  readingCorridor(settings.value.targetMin, settings.value.targetMax, tempC.value, calcOptions.value),
);

export const cToF = (c: number): number => (c * 9) / 5 + 32;
export const fToC = (f: number): number => ((f - 32) * 5) / 9;

/** Солёность → значение в единице hero (‰, SG 25/25 или ρ25). */
export function salinityToHero(S: number, unit: HeroUnit, s: Settings): number {
  if (!Number.isFinite(S)) return NaN;
  if (unit === 'permille') return S;
  const rho25 = density(Math.max(S, 0), 25);
  if (unit === 'sg') return rho25 / SCALE_FACTOR.sg2525;
  return s.densityUnit === 'kgm3' ? rho25 : rho25 / 1000;
}

export function heroDigits(unit: HeroUnit, s: Settings): number {
  if (unit === 'permille') return 1;
  if (unit === 'sg') return 4;
  return s.densityUnit === 'kgm3' ? 2 : 4;
}

export interface FieldSpec {
  id: FieldId;
  step: number;
  decimals: number;
  min: number;
  max: number;
  maxLen: number;
  get: () => number;
  set: (v: number) => void;
}

export function fieldSpec(id: FieldId): FieldSpec {
  switch (id) {
    case 'reading':
      return {
        id,
        step: 0.0005,
        decimals: 4,
        min: 0.9,
        max: 1.1,
        maxLen: 6,
        get: () => reading.value,
        set: (v) => {
          reading.value = v;
        },
      };
    case 'temp':
      if (settings.value.tempUnit === 'f') {
        return {
          id,
          step: 0.1,
          decimals: 1,
          min: 23,
          max: 140,
          maxLen: 5,
          get: () => roundToStep(cToF(tempC.value), 0.1),
          set: (v) => {
            tempC.value = roundToStep(fToC(v), 0.01);
          },
        };
      }
      return {
        id,
        step: 0.1,
        decimals: 1,
        min: -5,
        max: 60,
        maxLen: 4,
        get: () => tempC.value,
        set: (v) => {
          tempC.value = v;
        },
      };
    case 'target':
      return {
        id,
        step: 0.1,
        decimals: 1,
        min: 0,
        max: 60,
        maxLen: 4,
        get: () => effectiveTarget.value,
        set: (v) => {
          targetInput.value = v;
        },
      };
  }
}

export function commitBuffer(): void {
  buffer.value = null;
}

/** Тап по полю: сделать активным, начать ввод заново и открыть клавиатуру. */
export function focusField(id: FieldId): void {
  commitBuffer();
  activeField.value = id;
  keypadOpen.value = true;
}

export function closeKeypad(): void {
  commitBuffer();
  keypadOpen.value = false;
}

/** Авто-точка: «10235» → «1.0235», «245» → «24.5». */
export function autoDot(id: FieldId, b: string): string {
  if (b.includes('.')) return b;
  if (id === 'reading') return b.length === 2 && b.startsWith('1') ? `1.${b[1] ?? ''}` : b;
  return b.length === 3 ? `${b.slice(0, 2)}.${b[2] ?? ''}` : b;
}

export type Key = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | 'backspace';

export function pressKey(key: Key): void {
  const spec = fieldSpec(activeField.value);
  let b = buffer.value ?? '';
  if (key === 'backspace') {
    b = b.slice(0, -1);
  } else if (key === '.') {
    if (b.includes('.')) return;
    b = (b === '' ? '0' : b) + '.';
  } else {
    if (b.length >= spec.maxLen) return;
    b = autoDot(spec.id, b + key);
  }
  buffer.value = b;
  const n = parseDecimal(b);
  if (n !== null) spec.set(clamp(n, -999, 999));
}

export function nudge(id: FieldId, dir: 1 | -1): void {
  const spec = fieldSpec(id);
  commitBuffer();
  activeField.value = id;
  spec.set(clamp(roundToStep(spec.get() + dir * spec.step, spec.step), spec.min, spec.max));
}

/** Быстрые значения: температура (°C) или показание. */
export function setQuickTemp(c: number): void {
  commitBuffer();
  tempC.value = c;
}
export function setQuickReading(r: number): void {
  commitBuffer();
  reading.value = r;
  activeField.value = 'reading';
}

export function displayValue(id: FieldId): string {
  const spec = fieldSpec(id);
  if (activeField.value === id && buffer.value !== null) return buffer.value;
  return fixed(spec.get(), spec.decimals);
}

/** Последние уникальные показания из истории — для чипов быстрого ввода. */
export const recentReadings = computed<number[]>(() => {
  const out: number[] = [];
  for (const m of measurements.value) {
    if (!out.includes(m.reading)) out.push(m.reading);
    if (out.length >= 3) break;
  }
  return out;
});

export function setMode(m: Mode): void {
  if (mode.value === m) return;
  commitBuffer();
  keypadOpen.value = false;
  mode.value = m;
  if (m === 'reverse' && activeField.value === 'reading') activeField.value = 'target';
  if (m === 'measure' && activeField.value === 'target') activeField.value = 'reading';
}

/** Навигация с поддержкой кнопки «назад» на Android. */
export function go(next: Screen): void {
  if (screen.value === next) return;
  commitBuffer();
  keypadOpen.value = false;
  if (typeof history !== 'undefined') {
    if (next !== 'measure') {
      if (screen.value === 'measure') history.pushState({ screen: next }, '');
      else history.replaceState({ screen: next }, '');
    } else if ((history.state as { screen?: string } | null)?.screen) {
      history.back();
      return;
    }
  }
  screen.value = next;
}

export function handlePopState(): void {
  const st = history.state as { screen?: Screen } | null;
  const s = st?.screen;
  screen.value = s && s !== 'measure' ? s : 'measure';
}

export function resetUiState(): void {
  screen.value = 'measure';
  mode.value = 'measure';
  reading.value = 1.023;
  tempC.value = 25;
  targetInput.value = null;
  activeField.value = 'reading';
  buffer.value = null;
  keypadOpen.value = false;
  sheet.value = null;
}
