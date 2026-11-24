/**
 * Расчёт солёности по показанию стеклянного ареометра
 * (Aqua Medic Salimeter: шкала 1.000–1.040, деление 0.001, ±0.0005, градуирован при 25 °C)
 * и обратная задача «что должен показать ареометр».
 */
import { density, salinityFromDensity } from './eos80';
import { conductivity } from './pss78';

export type ScaleType = 'density' | 'sg2525' | 'sg254';

/** Множитель перевода показания шкалы в плотность, кг/м³. */
export const SCALE_FACTOR: Record<ScaleType, number> = {
  density: 1000, // «Плотность, г/см³»
  sg2525: 997.047, // SG 25/25 — относительно воды при 25 °C
  sg254: 999.972, // SG 25/4 — относительно воды при 4 °C
};

export const SCALE_LABEL: Record<ScaleType, string> = {
  density: 'г/см³',
  sg2525: 'SG 25/25',
  sg254: 'SG 25/4',
};

/** Объёмный коэффициент расширения стекла, 1/°C. */
export const BETA_SODA_LIME = 2.5e-5;
export const BETA_BOROSILICATE = 1.0e-5;

export const HYDROMETER = {
  min: 1.0,
  max: 1.04,
  division: 0.001,
  tolerance: 0.0005,
  referenceT: 25,
  greenZone: [20, 28] as const,
} as const;

export const TEMPERATURE_RANGE = [0, 40] as const;

/** Коэффициент TEOS-10: S_A ≈ S_R = (35.16504 / 35) · S_P. */
export const SA_FACTOR = 35.16504 / 35;

export interface CalcOptions {
  scale: ScaleType;
  /** Поправка на расширение стекла (выкл = как wpcalc.com). */
  glassCorrection: boolean;
  /** β стекла, 1/°C. */
  beta: number;
}

export const DEFAULT_OPTIONS: CalcOptions = {
  scale: 'density',
  glassCorrection: true,
  beta: BETA_SODA_LIME,
};

export type Warning =
  | 'reading-out-of-scale'
  | 'temperature-out-of-range'
  | 'outside-green-zone'
  | 'salinity-below-zero'
  | 'salinity-above-eos80';

function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

/** Коэффициент поправки на стекло при температуре t. */
export function glassFactor(t: number, opts: CalcOptions): number {
  return opts.glassCorrection ? 1 + opts.beta * (t - HYDROMETER.referenceT) : 1;
}

/** Показание R при температуре t → истинная плотность воды, кг/м³. */
export function readingToDensity(R: number, t: number, opts: CalcOptions): number {
  if (!isFiniteNumber(R) || !isFiniteNumber(t)) return NaN;
  return (R * SCALE_FACTOR[opts.scale]) / glassFactor(t, opts);
}

/** Истинная плотность при t → показание ареометра (без округления). */
export function densityToReading(rho: number, t: number, opts: CalcOptions): number {
  if (!isFiniteNumber(rho) || !isFiniteNumber(t)) return NaN;
  return (rho * glassFactor(t, opts)) / SCALE_FACTOR[opts.scale];
}

/** Округление к ближайшему полуделению шкалы (0.0005). */
export function roundToScale(R: number, step = HYDROMETER.tolerance): number {
  if (!isFiniteNumber(R)) return NaN;
  return Math.round(R / step) * step;
}

export function warningsFor(R: number, t: number, S: number): Warning[] {
  const w: Warning[] = [];
  if (R < HYDROMETER.min || R > HYDROMETER.max) w.push('reading-out-of-scale');
  if (t < TEMPERATURE_RANGE[0] || t > TEMPERATURE_RANGE[1]) w.push('temperature-out-of-range');
  else if (t < HYDROMETER.greenZone[0] || t > HYDROMETER.greenZone[1]) w.push('outside-green-zone');
  if (Number.isFinite(S) && S < 0) w.push('salinity-below-zero');
  if (Number.isFinite(S) && S > 42) w.push('salinity-above-eos80');
  return w;
}

export interface MeasureResult {
  /** Практическая солёность PSS-78, ‰ (может быть отрицательной — ниже пресной воды). */
  salinity: number;
  /** Плотность при 25 °C, кг/м³. */
  density25: number;
  /** Истинная плотность при температуре замера, кг/м³. */
  densityAtT: number;
  /** Погрешность солёности из ±0.0005 показания, ‰. */
  uncertainty: number;
  /** Абсолютная солёность TEOS-10 (приближение S_R), г/кг. */
  absoluteSalinity: number;
  /** Удельная электропроводность при 25 °C, мС/см. */
  conductivity25: number;
  warnings: Warning[];
}

/** Главный расчёт: показание + температура → солёность и плотность при 25 °C. */
export function measure(R: number, t: number, opts: CalcOptions = DEFAULT_OPTIONS): MeasureResult {
  const nan: MeasureResult = {
    salinity: NaN,
    density25: NaN,
    densityAtT: NaN,
    uncertainty: NaN,
    absoluteSalinity: NaN,
    conductivity25: NaN,
    warnings: [],
  };
  if (!isFiniteNumber(R) || !isFiniteNumber(t)) return nan;
  const densityAtT = readingToDensity(R, t, opts);
  const salinity = salinityFromDensity(densityAtT, t);
  if (!Number.isFinite(salinity)) return { ...nan, densityAtT };
  const sPlus = salinityFromDensity(readingToDensity(R + HYDROMETER.tolerance, t, opts), t);
  const sMinus = salinityFromDensity(readingToDensity(R - HYDROMETER.tolerance, t, opts), t);
  const uncertainty = Math.max(Math.abs(sPlus - salinity), Math.abs(salinity - sMinus));
  const sPos = Math.max(salinity, 0);
  return {
    salinity,
    density25: density(sPos, HYDROMETER.referenceT),
    densityAtT,
    uncertainty,
    absoluteSalinity: salinity * SA_FACTOR,
    conductivity25: conductivity(salinity, HYDROMETER.referenceT),
    warnings: warningsFor(R, t, salinity),
  };
}

export interface ReverseResult {
  /** ρ(S, t), кг/м³. */
  densityAtT: number;
  /** ρ(S, 25), кг/м³. */
  density25: number;
  /** Ожидаемое показание ареометра (точное, без округления). */
  reading: number;
  /** То же, округлённое до полуделения 0.0005. */
  readingOnScale: number;
  warnings: Warning[];
}

/** Обратный режим: солёность + температура → что должен показать ареометр. */
export function expectedReading(
  S: number,
  t: number,
  opts: CalcOptions = DEFAULT_OPTIONS,
): ReverseResult {
  if (!isFiniteNumber(S) || !isFiniteNumber(t) || S < 0) {
    return { densityAtT: NaN, density25: NaN, reading: NaN, readingOnScale: NaN, warnings: [] };
  }
  const densityAtT = density(S, t);
  const reading = densityToReading(densityAtT, t, opts);
  return {
    densityAtT,
    density25: density(S, HYDROMETER.referenceT),
    reading,
    readingOnScale: roundToScale(reading),
    warnings: warningsFor(reading, t, S),
  };
}

/** Коридор показаний для диапазона солёности [from, to] при температуре t. */
export function readingCorridor(
  from: number,
  to: number,
  t: number,
  opts: CalcOptions = DEFAULT_OPTIONS,
): { from: number; to: number } {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  return { from: expectedReading(lo, t, opts).reading, to: expectedReading(hi, t, opts).reading };
}
