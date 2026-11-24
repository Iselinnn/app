import { describe, expect, it } from 'vitest';
import { brineToAdd, freshWaterToAdd, mixSalinity, saltToAdd, waterChangeVolume } from '../../src/calc';

describe('Подмена и долив', () => {
  it('долив осмоса снижает солёность до цели (баланс массы)', () => {
    const v = freshWaterToAdd(100, 36, 35, 25);
    expect(v).toBeGreaterThan(2.5);
    expect(v).toBeLessThan(3.2);
    expect(mixSalinity(100, 36, v, 0, 25)).toBeCloseTo(35, 6);
  });

  it('соль: масса в граммах, проверка балансом', () => {
    const g = saltToAdd(100, 34, 35, 25);
    expect(g).toBeGreaterThan(100);
    expect(g).toBeLessThan(110);
    // После добавления g граммов соли: соль/(масса) = 35 ‰
    const m = (100 * 1022.6) / 1000; // ≈ масса воды, кг (грубая)
    const salt = (m * 34) / 1000 + g / 1000;
    expect((salt / (m + g / 1000)) * 1000).toBeCloseTo(35, 1);
  });

  it('рассол', () => {
    const v = brineToAdd(100, 34, 35, 25, 70);
    expect(v).toBeGreaterThan(2);
    expect(v).toBeLessThan(3.5);
    expect(mixSalinity(100, 34, v, 70, 25)).toBeCloseTo(35, 6);
  });

  it('подмена на осмос и на крепкую воду', () => {
    const down = waterChangeVolume(100, 36, 35, 25, 0);
    expect(down).toBeGreaterThan(2.5);
    expect(down).toBeLessThan(3.2);
    expect(mixSalinity(100 - down, 36, down, 0, 25)).toBeCloseTo(35, 6);
    const up = waterChangeVolume(100, 34, 35, 25, 40);
    expect(up).toBeGreaterThan(15);
    expect(up).toBeLessThan(18);
    expect(mixSalinity(100 - up, 34, up, 40, 25)).toBeCloseTo(35, 6);
    expect(waterChangeVolume(100, 35, 35, 25, 0)).toBe(0);
    const big = waterChangeVolume(100, 40, 0.5, 25, 0);
    expect(big).toBeLessThan(100);
    expect(mixSalinity(100 - big, 40, big, 0, 25)).toBeCloseTo(0.5, 6);
  });

  it('невозможные и мусорные случаи → NaN', () => {
    expect(freshWaterToAdd(100, 34, 35, 25)).toBeNaN();
    expect(freshWaterToAdd(0, 36, 35, 25)).toBeNaN();
    expect(freshWaterToAdd(100, 36, 0, 25)).toBeNaN();
    expect(freshWaterToAdd(NaN, 36, 35, 25)).toBeNaN();
    expect(saltToAdd(100, 36, 35, 25)).toBeNaN();
    expect(saltToAdd(100, 34, 1000, 25)).toBeNaN();
    expect(saltToAdd(-1, 34, 35, 25)).toBeNaN();
    expect(brineToAdd(100, 34, 35, 25, 35)).toBeNaN();
    expect(brineToAdd(100, 36, 35, 25, 70)).toBeNaN();
    expect(brineToAdd(100, 34, 35, Infinity, 70)).toBeNaN();
    expect(waterChangeVolume(100, 36, 35, 25, 36)).toBeNaN();
    expect(waterChangeVolume(100, 34, 35, 25, 0)).toBeNaN();
    expect(waterChangeVolume(100, 36, 35, 25, -1)).toBeNaN();
    expect(waterChangeVolume(0, 36, 35, 25, 0)).toBeNaN();
    expect(mixSalinity(0, 35, 0, 35, 25)).toBeNaN();
    expect(mixSalinity(-1, 35, 1, 35, 25)).toBeNaN();
    expect(mixSalinity(NaN, 35, 1, 35, 25)).toBeNaN();
  });
});
