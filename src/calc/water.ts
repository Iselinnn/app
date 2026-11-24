/**
 * Подмена воды и долив: баланс массы соли с плотностями по EOS-80.
 * Объёмы — литры, солёность — ‰ (г/кг), масса соли — граммы.
 */
import { density } from './eos80';

const finite = (...xs: number[]): boolean => xs.every((x) => Number.isFinite(x));

/** Масса воды в аквариуме, кг. */
function waterMass(volumeL: number, S: number, t: number): number {
  return (volumeL * density(Math.max(S, 0), t)) / 1000;
}

/**
 * Сколько пресной воды (осмос) долить, л, чтобы снизить солёность с current до target.
 * Предполагается, что в аквариуме есть место (например, после испарения).
 */
export function freshWaterToAdd(volumeL: number, current: number, target: number, t: number): number {
  if (!finite(volumeL, current, target, t) || volumeL <= 0 || target <= 0 || current <= target) return NaN;
  const m = waterMass(volumeL, current, t);
  const addedKg = m * (current / target - 1);
  return (addedKg * 1000) / density(0, t);
}

/**
 * Сколько сухой соли добавить, г, чтобы поднять солёность с current до target.
 * Считается, что соль — это растворённые вещества целиком (реальные смеси содержат
 * немного кристаллизационной воды, поэтому результат — нижняя оценка).
 */
export function saltToAdd(volumeL: number, current: number, target: number, t: number): number {
  if (!finite(volumeL, current, target, t) || volumeL <= 0 || target >= 1000 || current >= target) return NaN;
  const m = waterMass(volumeL, current, t);
  return (m * (target - current)) / (1000 - target) * 1000;
}

/**
 * Сколько рассола солёностью brine добавить, л, чтобы поднять солёность с current до target.
 */
export function brineToAdd(
  volumeL: number,
  current: number,
  target: number,
  t: number,
  brine: number,
): number {
  if (!finite(volumeL, current, target, t, brine) || volumeL <= 0 || current >= target || brine <= target) {
    return NaN;
  }
  const m = waterMass(volumeL, current, t);
  const addedKg = (m * (target - current)) / (brine - target);
  return (addedKg * 1000) / density(brine, t);
}

/**
 * Подмена: сколько литров воды заменить водой солёностью newWater, чтобы прийти к target.
 * Работает в обе стороны (осмос при пересоле, крепкая вода при недосоле).
 */
export function waterChangeVolume(
  volumeL: number,
  current: number,
  target: number,
  t: number,
  newWater: number,
): number {
  if (!finite(volumeL, current, target, t, newWater) || volumeL <= 0 || newWater < 0) return NaN;
  if (current === target) return 0;
  // Новая вода должна лежать по другую сторону цели от текущей.
  if ((current - target) * (target - newWater) <= 0) return NaN;
  const rhoCur = density(Math.max(current, 0), t);
  const rhoNew = density(newWater, t);
  // Оба слагаемых знаменателя положительны, поэтому результат всегда меньше объёма.
  return (volumeL * rhoCur * (current - target)) / (rhoNew * (target - newWater) + rhoCur * (current - target));
}

/** Солёность после смешивания двух объёмов (для проверок и предпросмотра). */
export function mixSalinity(v1: number, s1: number, v2: number, s2: number, t: number): number {
  if (!finite(v1, s1, v2, s2, t) || v1 < 0 || v2 < 0 || v1 + v2 === 0) return NaN;
  const m1 = (v1 * density(Math.max(s1, 0), t)) / 1000;
  const m2 = (v2 * density(Math.max(s2, 0), t)) / 1000;
  return (m1 * s1 + m2 * s2) / (m1 + m2);
}
