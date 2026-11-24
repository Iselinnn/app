import { describe, expect, it } from 'vitest';
import {
  BETA_SODA_LIME,
  C35_15_0,
  DEFAULT_OPTIONS,
  HYDROMETER,
  conductivity,
  dDensityDS,
  density,
  densityToReading,
  expectedReading,
  measure,
  readingCorridor,
  readingToDensity,
  roundToScale,
  rt68,
  salinityFromDensity,
  salinityFromRt,
  toT68,
  warningsFor,
  type CalcOptions,
} from '../../src/calc';

const SAL_TOL = 0.01; // ‰
const RHO_TOL = 0.01; // кг/м³ = 0.00001 г/см³

const noGlass: CalcOptions = { ...DEFAULT_OPTIONS, glassCorrection: false };
const sg2525: CalcOptions = { ...DEFAULT_OPTIONS, scale: 'sg2525' };
const sg254: CalcOptions = { ...DEFAULT_OPTIONS, scale: 'sg254' };

describe('EOS-80: плотность', () => {
  it('переводит ITS-90 в IPTS-68', () => {
    expect(toT68(25)).toBeCloseTo(25.006, 6);
    expect(toT68(0)).toBe(0);
  });

  it('проверочные значения UNESCO', () => {
    expect(density(0, 5)).toBeCloseTo(999.967, 2);
    expect(Math.abs(density(0, 5) - 999.967)).toBeLessThan(RHO_TOL);
    expect(Math.abs(density(35, 5) - 1027.675)).toBeLessThan(RHO_TOL);
    expect(Math.abs(density(35, 25) - 1023.34)).toBeLessThan(RHO_TOL);
  });

  it('плотность растёт с солёностью и имеет максимум пресной воды около 4 °C', () => {
    expect(density(35, 20)).toBeGreaterThan(density(30, 20));
    expect(density(0, 4)).toBeGreaterThan(density(0, 0));
    expect(density(0, 4)).toBeGreaterThan(density(0, 10));
  });

  it('аналитическая производная совпадает с численной', () => {
    for (const S of [0.5, 10, 35, 42]) {
      for (const t of [0, 12.5, 25, 40]) {
        const h = 1e-4;
        const numeric = (density(S + h, t) - density(S - h, t)) / (2 * h);
        expect(dDensityDS(S, t)).toBeCloseTo(numeric, 6);
      }
    }
  });
});

describe('Метод Ньютона: солёность по плотности', () => {
  it('возвращает исходную солёность', () => {
    expect(salinityFromDensity(density(35, 25), 25)).toBeCloseTo(35, 6);
    expect(salinityFromDensity(density(10, 3), 3)).toBeCloseTo(10, 6);
    expect(salinityFromDensity(density(42, 40), 40)).toBeCloseTo(42, 6);
  });

  it('ниже пресной воды — линейная экстраполяция в отрицательную область', () => {
    const s = salinityFromDensity(density(0, 25) - 0.5, 25);
    expect(s).toBeLessThan(0);
    expect(s).toBeGreaterThan(-1);
    expect(salinityFromDensity(density(0, 25), 25)).toBe(0);
  });

  it('NaN на мусорном входе и при расходимости', () => {
    expect(salinityFromDensity(1e300, 25)).toBeNaN();
    expect(salinityFromDensity(NaN, 25)).toBeNaN();
    expect(salinityFromDensity(1023, NaN)).toBeNaN();
    expect(salinityFromDensity(Infinity, 25)).toBeNaN();
    expect(salinityFromDensity(1023, 25, NaN)).toBeNaN();
  });

  it('сходится из плохого старта и при очень малой солёности', () => {
    expect(salinityFromDensity(density(0.001, 25), 25, 60)).toBeCloseTo(0.001, 5);
    expect(salinityFromDensity(density(35, 25), 25, 0)).toBeCloseTo(35, 6);
    expect(salinityFromDensity(density(35, 25), 25, 200)).toBeCloseTo(35, 6);
  });

  it('сходится на всём диапазоне ареометра (R 1.000–1.040 × t 0–40 °C, все шкалы)', () => {
    let nonFinite = 0;
    let worstResidual = 0;
    let count = 0;
    for (const opts of [DEFAULT_OPTIONS, sg2525, sg254, noGlass]) {
      for (let R = 1.0; R <= 1.0400001; R += 0.0005) {
        for (let t = 0; t <= 40.0001; t += 0.5) {
          const rho = readingToDensity(R, t, opts);
          const S = salinityFromDensity(rho, t);
          count++;
          if (!Number.isFinite(S)) nonFinite++;
          else if (S > 0) worstResidual = Math.max(worstResidual, Math.abs(density(S, t) - rho));
        }
      }
    }
    expect(count).toBe(4 * 81 * 81);
    expect(nonFinite).toBe(0);
    expect(worstResidual).toBeLessThan(1e-6);
  });

  it('property: прямой и обратный расчёт дают исходное значение (S 0–42 × t 0–40)', () => {
    let worst = 0;
    for (let S = 0; S <= 42.0001; S += 0.25) {
      for (let t = 0; t <= 40.0001; t += 0.25) {
        const back = salinityFromDensity(density(S, t), t);
        worst = Math.max(worst, Math.abs(back - S));
      }
    }
    expect(worst).toBeLessThan(0.001);
  });

  it('property: показание → солёность → показание (все шкалы, с поправкой и без)', () => {
    let worst = 0;
    for (const opts of [DEFAULT_OPTIONS, sg2525, sg254, noGlass]) {
      for (let S = 1; S <= 42.0001; S += 0.5) {
        for (let t = 0; t <= 40.0001; t += 0.5) {
          const R = expectedReading(S, t, opts).reading;
          const back = measure(R, t, opts).salinity;
          worst = Math.max(worst, Math.abs(back - S));
        }
      }
    }
    expect(worst).toBeLessThan(0.001);
  });
});

describe('Замер: показание ареометра → солёность', () => {
  const cases: [number, number, number, number][] = [
    [1.023, 25, 34.55, 1.023],
    [1.023, 22, 33.5, 1.02221],
    [1.023, 28, 35.7, 1.02387],
    [1.024, 26, 36.25, 1.02428],
    [1.02, 24, 30.22, 1.01973],
    [1.0255, 23.5, 37.31, 1.02509],
  ];
  it.each(cases)('R %s, t %s °C → %s ‰, ρ25 %s', (R, t, S, rho25) => {
    const r = measure(R, t);
    expect(Math.abs(r.salinity - S)).toBeLessThan(SAL_TOL);
    expect(Math.abs(r.density25 / 1000 - rho25)).toBeLessThan(0.00001);
  });

  it('шкала SG 25/25, R 1.0230, 25 °C → 30.55 ‰', () => {
    expect(Math.abs(measure(1.023, 25, sg2525).salinity - 30.55)).toBeLessThan(SAL_TOL);
  });

  it('шкала SG 25/4 близка к плотности в г/см³', () => {
    const a = measure(1.023, 25, sg254).salinity;
    const b = measure(1.023, 25).salinity;
    expect(Math.abs(a - b)).toBeLessThan(0.05);
    expect(a).toBeLessThan(b);
  });

  it('при 25 °C поправка на стекло не влияет', () => {
    expect(measure(1.023, 25).salinity).toBeCloseTo(measure(1.023, 25, noGlass).salinity, 9);
  });

  it('поправка на стекло: при t < 25 показание занижено, истинная плотность выше', () => {
    expect(readingToDensity(1.023, 13.1, DEFAULT_OPTIONS)).toBeGreaterThan(1023);
    expect(readingToDensity(1.023, 13.1, noGlass)).toBeCloseTo(1023, 9);
    expect(readingToDensity(1.023, 30, DEFAULT_OPTIONS)).toBeLessThan(1023);
    const boro = { ...DEFAULT_OPTIONS, beta: 1e-5 };
    expect(readingToDensity(1.023, 13.1, boro)).toBeLessThan(readingToDensity(1.023, 13.1, DEFAULT_OPTIONS));
    expect(readingToDensity(1.023, 13.1, boro)).toBeGreaterThan(1023);
  });

  it('погрешность из ±0.0005 около ±0.65 ‰', () => {
    const r = measure(1.023, 25);
    expect(r.uncertainty).toBeGreaterThan(0.6);
    expect(r.uncertainty).toBeLessThan(0.7);
    expect(measure(1.023, 25, sg2525).uncertainty).toBeGreaterThan(0.6);
  });

  it('абсолютная солёность и электропроводность при 25 °C', () => {
    const r = measure(1.023, 25);
    expect(r.absoluteSalinity).toBeCloseTo(r.salinity * 1.00472, 3);
    expect(r.conductivity25).toBeGreaterThan(52);
    expect(r.conductivity25).toBeLessThan(53);
  });

  it('граничные значения шкалы и температуры', () => {
    for (const R of [HYDROMETER.min, HYDROMETER.max]) {
      for (const t of [0, 40]) {
        for (const opts of [DEFAULT_OPTIONS, sg2525, sg254, noGlass]) {
          const r = measure(R, t, opts);
          expect(Number.isFinite(r.salinity)).toBe(true);
          expect(Number.isFinite(r.density25)).toBe(true);
          expect(Number.isFinite(r.uncertainty)).toBe(true);
        }
      }
    }
    expect(measure(1.04, 25).salinity).toBeGreaterThan(55);
    expect(measure(1.0, 25).salinity).toBeGreaterThan(3);
    expect(measure(1.0, 25).salinity).toBeLessThan(5);
  });

  it('ниже пресной воды: отрицательная солёность, плотность при 25 — пресная', () => {
    const r = measure(1.0, 0, sg2525);
    expect(r.salinity).toBeLessThan(0);
    expect(r.density25).toBeCloseTo(density(0, 25), 6);
    expect(r.warnings).toContain('salinity-below-zero');
    expect(r.conductivity25).toBeNaN();
  });

  it('мусорный ввод → NaN без исключений', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(measure(bad, 25).salinity).toBeNaN();
      expect(measure(1.023, bad).salinity).toBeNaN();
      expect(measure(1.023, bad).density25).toBeNaN();
    }
    expect(measure(1.023, 25).warnings).toEqual([]);
    expect(readingToDensity(NaN, 25, DEFAULT_OPTIONS)).toBeNaN();
    const badBeta = measure(1.023, 25, { ...DEFAULT_OPTIONS, beta: NaN });
    expect(badBeta.salinity).toBeNaN();
    expect(badBeta.densityAtT).toBeNaN();
    expect(densityToReading(NaN, 25, DEFAULT_OPTIONS)).toBeNaN();
    expect(densityToReading(1023, Infinity, DEFAULT_OPTIONS)).toBeNaN();
  });

  it('предупреждения', () => {
    expect(warningsFor(0.999, 25, 30)).toContain('reading-out-of-scale');
    expect(warningsFor(1.041, 25, 30)).toContain('reading-out-of-scale');
    expect(warningsFor(1.02, -1, 30)).toContain('temperature-out-of-range');
    expect(warningsFor(1.02, 41, 30)).toContain('temperature-out-of-range');
    expect(warningsFor(1.02, 41, 30)).not.toContain('outside-green-zone');
    expect(warningsFor(1.02, 19.9, 30)).toContain('outside-green-zone');
    expect(warningsFor(1.02, 28.1, 30)).toContain('outside-green-zone');
    expect(warningsFor(1.02, 20, 30)).toEqual([]);
    expect(warningsFor(1.02, 28, 30)).toEqual([]);
    expect(warningsFor(1.02, 25, 43)).toContain('salinity-above-eos80');
    expect(warningsFor(1.02, 25, NaN)).toEqual([]);
  });
});

describe('Обратный режим: что должен показать ареометр', () => {
  it('S 32 ‰, t 13.1 °C, поправка выкл → ρ(t) 1024.05, ρ25 1021.08 (wpcalc.com)', () => {
    const r = expectedReading(32, 13.1, noGlass);
    expect(Math.abs(r.densityAtT - 1024.05)).toBeLessThan(RHO_TOL);
    expect(Math.abs(r.density25 - 1021.08)).toBeLessThan(RHO_TOL);
    expect(r.reading.toFixed(4)).toBe('1.0241');
  });

  it('S 32 ‰, t 13.1 °C, поправка вкл → показание 1.0237', () => {
    const r = expectedReading(32, 13.1);
    expect(r.reading.toFixed(4)).toBe('1.0237');
    expect(Math.abs(r.reading - 1.0237)).toBeLessThan(0.00005);
    expect(r.readingOnScale).toBeCloseTo(1.0235, 6);
  });

  it('S 35 ‰, t 25 °C → показание 1.0233', () => {
    const r = expectedReading(35, 25);
    expect(r.reading.toFixed(4)).toBe('1.0233');
    expect(r.readingOnScale).toBeCloseTo(1.0235, 6);
    expect(r.densityAtT).toBeCloseTo(r.density25, 9);
    expect(r.warnings).toEqual([]);
  });

  it('учитывает тип шкалы', () => {
    expect(expectedReading(35, 25, sg2525).reading).toBeCloseTo(1023.341 / 997.047, 4);
    expect(expectedReading(35, 25, sg254).reading).toBeCloseTo(1023.341 / 999.972, 4);
  });

  it('коридор для целевого диапазона', () => {
    const c = readingCorridor(36, 34, 25);
    expect(c.from).toBeLessThan(c.to);
    expect(c.from.toFixed(4)).toBe(expectedReading(34, 25).reading.toFixed(4));
    expect(c.to.toFixed(4)).toBe(expectedReading(36, 25).reading.toFixed(4));
  });

  it('округление к полуделению', () => {
    expect(roundToScale(1.02374)).toBeCloseTo(1.0235, 6);
    expect(roundToScale(1.02376)).toBeCloseTo(1.024, 6);
    expect(roundToScale(1.0)).toBeCloseTo(1.0, 6);
    expect(roundToScale(NaN)).toBeNaN();
  });

  it('мусорный ввод → NaN, предупреждения на выходе за шкалу', () => {
    expect(expectedReading(NaN, 25).reading).toBeNaN();
    expect(expectedReading(35, NaN).reading).toBeNaN();
    expect(expectedReading(-1, 25).reading).toBeNaN();
    expect(expectedReading(60, 25).warnings).toContain('reading-out-of-scale');
    expect(expectedReading(35, 10).warnings).toContain('outside-green-zone');
  });
});

describe('PSS-78: электропроводность', () => {
  it('S 35, t 15 → R_t = 1, C = 42.914 мС/см', () => {
    expect(salinityFromRt(1, 15)).toBeCloseTo(35, 6);
    expect(rt68(15)).toBeCloseTo(1, 5);
    expect(Math.abs(conductivity(35, 15) - C35_15_0)).toBeLessThan(0.01);
  });

  it('S 35, t 25 → около 53.07 мС/см; монотонно по S и t', () => {
    const c = conductivity(35, 25);
    expect(c).toBeGreaterThan(53.0);
    expect(c).toBeLessThan(53.15);
    expect(conductivity(36, 25)).toBeGreaterThan(c);
    expect(conductivity(35, 26)).toBeGreaterThan(c);
    expect(conductivity(2, 25)).toBeGreaterThan(0);
  });

  it('NaN вне области и при расходимости', () => {
    expect(conductivity(1e300, 25)).toBeNaN();
    expect(conductivity(1e100, 25)).toBeNaN();
    expect(conductivity(1e-7, 25)).toBeNaN();
    expect(conductivity(0, 25)).toBeNaN();
    expect(conductivity(-1, 25)).toBeNaN();
    expect(conductivity(NaN, 25)).toBeNaN();
    expect(conductivity(35, Infinity)).toBeNaN();
  });

  it('обратимость: S → C → S через прямую формулу', () => {
    for (let S = 2; S <= 42; S += 2) {
      for (const t of [0, 10, 25, 40]) {
        const C = conductivity(S, t);
        const Rt = C / C35_15_0 / rt68(toT68(t));
        expect(salinityFromRt(Rt, toT68(t))).toBeCloseTo(S, 6);
      }
    }
  });
});

describe('Константы', () => {
  it('β стекла и допуски', () => {
    expect(BETA_SODA_LIME).toBe(2.5e-5);
    expect(HYDROMETER.tolerance).toBe(0.0005);
  });
});
