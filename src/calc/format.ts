/** Разбор и форматирование чисел для ввода пользователя. */

const NUMBER_RE = /^[+-]?(\d+([.,]\d*)?|[.,]\d+)$/;

/**
 * Строгий разбор десятичного числа: допускается запятая как разделитель,
 * пробелы по краям. Буквы, пустая строка, Infinity, NaN → null.
 */
export function parseDecimal(input: unknown): number | null {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  if (typeof input !== 'string') return null;
  const s = input.trim().replace(/\s+/g, '');
  if (!NUMBER_RE.test(s)) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Фиксированное число знаков, без «-0.0». */
export function fixed(n: number, digits: number): string {
  if (!Number.isFinite(n)) return '—';
  const s = n.toFixed(digits);
  return s === (-0).toFixed(digits) || /^-0(\.0+)?$/.test(s) ? s.slice(1) : s;
}

/** Со знаком: «+0.4», «−0.4» (типографский минус). */
export function signed(n: number, digits: number): string {
  if (!Number.isFinite(n)) return '—';
  const r = Number(n.toFixed(digits));
  if (r === 0) return '0' + (digits > 0 ? '.' + '0'.repeat(digits) : '');
  return (r > 0 ? '+' : '−') + Math.abs(r).toFixed(digits);
}

/** Округление к шагу с защитой от двоичного мусора. */
export function roundToStep(n: number, step: number): number {
  if (!Number.isFinite(n) || !(step > 0)) return NaN;
  const decimals = Math.max(0, Math.ceil(-Math.log10(step)) + 1);
  return Number((Math.round(n / step) * step).toFixed(decimals));
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
