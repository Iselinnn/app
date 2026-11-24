/**
 * EOS-80 — международное уравнение состояния морской воды (UNESCO 1981),
 * плотность при атмосферном давлении (p = 0).
 *
 * Все плотности — в кг/м³, солёность — практическая (PSS-78),
 * температура на входе — ITS-90, внутри переводится в IPTS-68.
 */

/** ITS-90 → IPTS-68 (коэффициенты EOS-80 заданы для шкалы 1968 года). */
export const toT68 = (t90: number): number => 1.00024 * t90;

/** Плотность чистой воды, кг/м³ (полином Бигга в редакции UNESCO), t — °C IPTS-68. */
export function rhoWater68(t68: number): number {
  return (
    999.842594 +
    t68 *
      (6.793952e-2 +
        t68 * (-9.09529e-3 + t68 * (1.001685e-4 + t68 * (-1.120083e-6 + t68 * 6.536332e-9))))
  );
}

/** Солёностные коэффициенты A(t), B(t), C при p = 0; t — °C IPTS-68. */
export function salinityCoefficients(t68: number): { A: number; B: number; C: number } {
  const A =
    8.24493e-1 + t68 * (-4.0899e-3 + t68 * (7.6438e-5 + t68 * (-8.2467e-7 + t68 * 5.3875e-9)));
  const B = -5.72466e-3 + t68 * (1.0227e-4 + t68 * -1.6546e-6);
  const C = 4.8314e-4;
  return { A, B, C };
}

/**
 * ρ(S, t, 0), кг/м³.
 * @param S практическая солёность, ‰ (должна быть ≥ 0)
 * @param t температура, °C (ITS-90)
 */
export function density(S: number, t: number): number {
  const t68 = toT68(t);
  const { A, B, C } = salinityCoefficients(t68);
  return rhoWater68(t68) + A * S + B * S * Math.sqrt(S) + C * S * S;
}

/** ∂ρ/∂S при постоянной температуре, кг/м³ на ‰. */
export function dDensityDS(S: number, t: number): number {
  const { A, B, C } = salinityCoefficients(toT68(t));
  return A + 1.5 * B * Math.sqrt(S) + 2 * C * S;
}

/**
 * Обратная задача: солёность по плотности при температуре t, метод Ньютона.
 * Старт S = 35, критерий сходимости |ΔS| < 1e-6.
 * Если плотность ниже плотности пресной воды при t — линейная экстраполяция
 * (отрицательное значение, чтобы интерфейс мог показать «ниже 0 ‰»).
 * NaN — при некорректном входе или отсутствии сходимости.
 */
export function salinityFromDensity(rho: number, t: number, start = 35): number {
  if (!Number.isFinite(rho) || !Number.isFinite(t) || !Number.isFinite(start)) return NaN;
  const rhoFresh = density(0, t);
  if (rho <= rhoFresh) return (rho - rhoFresh) / dDensityDS(0, t);
  let S = Math.max(start, 0);
  for (let i = 0; i < 60; i++) {
    const f = density(S, t) - rho;
    let dS = f / dDensityDS(S, t);
    // Защита от выхода в отрицательную область, где S^1.5 не определено.
    if (S - dS < 0) dS = S / 2;
    S -= dS;
    if (Math.abs(dS) < 1e-6) return S;
  }
  return NaN;
}
