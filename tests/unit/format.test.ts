import { describe, expect, it } from 'vitest';
import { clamp, fixed, parseDecimal, roundToStep, signed } from '../../src/calc';

describe('parseDecimal', () => {
  it('принимает точку и запятую, пробелы по краям', () => {
    expect(parseDecimal('1.0235')).toBe(1.0235);
    expect(parseDecimal('1,0235')).toBe(1.0235);
    expect(parseDecimal(' 25.5 ')).toBe(25.5);
    expect(parseDecimal('.5')).toBe(0.5);
    expect(parseDecimal('5.')).toBe(5);
    expect(parseDecimal('-3')).toBe(-3);
    expect(parseDecimal(25)).toBe(25);
  });

  it('отклоняет мусор', () => {
    for (const bad of ['', '  ', 'abc', '1.0.2', '1e3', 'NaN', 'Infinity', '--1', '1,2,3', '9'.repeat(400), null, undefined, {}, NaN, Infinity]) {
      expect(parseDecimal(bad)).toBeNull();
    }
  });
});

describe('форматирование', () => {
  it('fixed без «-0»', () => {
    expect(fixed(1.02301, 4)).toBe('1.0230');
    expect(fixed(-0.00001, 1)).toBe('0.0');
    expect(fixed(-0.04, 1)).toBe('0.0');
    expect(fixed(-0.06, 1)).toBe('-0.1');
    expect(fixed(NaN, 1)).toBe('—');
  });

  it('signed с типографским минусом', () => {
    expect(signed(0.44, 1)).toBe('+0.4');
    expect(signed(-0.44, 1)).toBe('−0.4');
    expect(signed(0.01, 1)).toBe('0.0');
    expect(signed(0, 0)).toBe('0');
    expect(signed(NaN, 1)).toBe('—');
  });

  it('roundToStep и clamp', () => {
    expect(roundToStep(1.02349, 0.0005)).toBe(1.0235);
    expect(roundToStep(24.96, 0.1)).toBe(25);
    expect(roundToStep(1.1 + 0.1, 0.1)).toBe(1.2);
    expect(roundToStep(NaN, 0.1)).toBeNaN();
    expect(roundToStep(1, 0)).toBeNaN();
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
});
