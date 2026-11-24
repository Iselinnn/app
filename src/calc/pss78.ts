/**
 * PSS-78 — практическая шкала солёности (UNESCO 1981).
 * Здесь нужна только обратная задача: удельная электропроводность
 * при заданных S и t (p = 0), мС/см — для сверки с кондуктометром.
 */
import { toT68 } from './eos80';

/** Пары коэффициентов (a_i, b_i) при R_t^(i/2), i = 0…5. */
const AB: readonly (readonly [number, number])[] = [
  [0.008, 0.0005],
  [-0.1692, -0.0056],
  [25.3851, -0.0066],
  [14.0941, -0.0375],
  [-7.0261, 0.0636],
  [2.7081, -0.0144],
];
const K = 0.0162;
const c = [0.6766097, 2.00564e-2, 1.104259e-4, -6.9698e-7, 1.0031e-9] as const;

/** Электропроводность стандартной морской воды C(35, 15, 0), мС/см. */
export const C35_15_0 = 42.914;

/** r_t(t) — температурная функция отношения проводимостей; t — °C IPTS-68. */
export function rt68(t68: number): number {
  return c[0] + t68 * (c[1] + t68 * (c[2] + t68 * (c[3] + t68 * c[4])));
}

/** Солёность по R_t и температуре (прямая формула PSS-78). */
export function salinityFromRt(Rt: number, t68: number): number {
  const x = Math.sqrt(Rt);
  const dt = t68 - 15;
  const k = dt / (1 + K * dt);
  let s = 0;
  let p = 1;
  for (const [a, b] of AB) {
    s += (a + k * b) * p;
    p *= x;
  }
  return s;
}

/** dS/dR_t — для метода Ньютона. */
function dSalinityDRt(Rt: number, t68: number): number {
  const x = Math.sqrt(Rt);
  const dt = t68 - 15;
  const k = dt / (1 + K * dt);
  let d = 0;
  AB.forEach(([a, b], i) => {
    if (i > 0) d += (a + k * b) * (i / 2) * Math.pow(x, i - 2);
  });
  return d;
}

/**
 * Удельная электропроводность C(S, t, 0), мС/см.
 * Решается уравнение S(R_t, t) = S методом Ньютона, затем C = R_t · r_t(t) · C(35,15,0).
 * NaN при S ≤ 0 (ниже предела применимости) или некорректном входе.
 */
export function conductivity(S: number, t: number): number {
  if (!Number.isFinite(S) || !Number.isFinite(t) || S <= 0) return NaN;
  const t68 = toT68(t);
  let Rt = Math.max(S / 35, 1e-4);
  for (let i = 0; i < 60; i++) {
    const f = salinityFromRt(Rt, t68) - S;
    const d = dSalinityDRt(Rt, t68);
    if (!(d > 0)) return NaN;
    let step = f / d;
    if (Rt - step <= 0) step = Rt / 2;
    Rt -= step;
    if (Math.abs(step) < 1e-9) return Rt * rt68(t68) * C35_15_0;
  }
  return NaN;
}
