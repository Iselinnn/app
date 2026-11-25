import { describe, expect, it } from 'vitest';
import { CSV_COLUMNS, CSV_MAX_BYTES, escapeCell, parseCsv, splitCsv, toCsv } from '../../src/store/csv';
import { sanitizeMeasurement, type Measurement } from '../../src/store/measurements';

const mk = (over: Partial<Measurement> & { at: number }): Measurement =>
  sanitizeMeasurement({
    reading: 1.023,
    temperature: 25,
    scale: 'density',
    glassCorrection: true,
    beta: 2.5e-5,
    note: '',
    ...over,
  })!;

describe('CSV', () => {
  it('экспорт → импорт без потерь', () => {
    const list = [
      mk({ at: Date.UTC(2026, 10, 24, 8, 5), note: 'утро' }),
      mk({ at: Date.UTC(2026, 10, 23, 8, 5), reading: 1.0255, temperature: 23.5, scale: 'sg2525', glassCorrection: false, beta: 1e-5, note: 'с "кавычками", и запятой' }),
    ];
    const csv = toCsv(list);
    expect(csv.split('\r\n')[0]).toBe(CSV_COLUMNS.join(','));
    const back = parseCsv(csv);
    expect(back.error).toBeUndefined();
    expect(back.skipped).toBe(0);
    expect(back.rows).toHaveLength(2);
    const sorted = back.rows.map((r) => r.measurement).sort((a, b) => a.at - b.at);
    const orig = [...list].sort((a, b) => a.at - b.at);
    sorted.forEach((r, i) => {
      const o = orig[i]!;
      expect(r.at).toBe(o.at);
      expect(r.reading).toBe(o.reading);
      expect(r.temperature).toBe(o.temperature);
      expect(r.scale).toBe(o.scale);
      expect(r.glassCorrection).toBe(o.glassCorrection);
      expect(r.beta).toBeCloseTo(o.beta, 9);
      expect(r.salinity).toBeCloseTo(o.salinity, 6);
      expect(r.note).toBe(o.note);
    });
  });

  it('защита от формульных инъекций при экспорте', () => {
    expect(escapeCell('=1+1')).toBe("'=1+1");
    expect(escapeCell('+cmd')).toBe("'+cmd");
    expect(escapeCell('-2')).toBe("'-2");
    expect(escapeCell('@SUM')).toBe("'@SUM");
    expect(escapeCell('\tx')).toBe(' x');
    expect(escapeCell('\r=x')).toBe(' =x');
    expect(escapeCell('обычная')).toBe('обычная');
    expect(escapeCell('a,b')).toBe('"a,b"');
    expect(escapeCell('a"b')).toBe('"a""b"');
    expect(escapeCell('x\u0000y')).toBe('x y');
    const csv = toCsv([mk({ at: 1, note: '=HYPERLINK("http://evil")' })]);
    const line = csv.split('\r\n')[1] ?? '';
    expect(line.endsWith(`"'=HYPERLINK(""http://evil"")",`)).toBe(true);
    const back = parseCsv(csv);
    expect(back.rows[0]?.measurement.note).toBe(`'=HYPERLINK("http://evil")`);
  });

  it('импорт: разделитель «;» и запятая в числах, BOM, разные форматы даты и булевых', () => {
    const text =
      '﻿date;reading;temperature_c;scale;glass_correction;beta;note\r\n' +
      '2026-11-24T08:05:00Z;1,0230;25,0;density;да;2.5e-5;привет\r\n' +
      '1700000000;1,0240;24,0;sg254;0;;\r\n' +
      '1700000000000;1,0240;24,0;;нет;;';
    const r = parseCsv(text);
    expect(r.error).toBeUndefined();
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0]?.measurement.glassCorrection).toBe(true);
    expect(r.rows[0]?.measurement.note).toBe('привет');
    expect(r.rows[1]?.measurement.at).toBe(1700000000000);
    expect(r.rows[1]?.measurement.glassCorrection).toBe(false);
    expect(r.rows[1]?.measurement.scale).toBe('sg254');
    expect(r.rows[1]?.measurement.beta).toBe(2.5e-5);
    expect(r.rows[2]?.measurement.scale).toBe('density');
  });

  it('импорт: мусорные строки пропускаются, ошибки структуры сообщаются', () => {
    const header = CSV_COLUMNS.join(',');
    const r = parseCsv(
      `${header}\n` +
        `2026-01-01T00:00:00Z,1.0230,25,density,true,2.5e-5,34.55,1023,ok\n` +
        `not-a-date,1.0230,25,density,true,2.5e-5,,,\n` +
        `2026-01-01T00:00:00Z,abc,25,density,true,2.5e-5,,,\n` +
        `2026-01-01T00:00:00Z,1.0230,25,density,maybe,2.5e-5,,,\n` +
        `2026-01-01T00:00:00Z,1.0230,25,density,true,'2.5e-5,,,\n` +
        `2026-01-01T00:00:00Z,9.9,25,density,true,2.5e-5,,,\n` +
        `2026-01-01T00:00:00Z,1.0230,Infinity,density,true,2.5e-5,,,\n`,
    );
    expect(r.rows).toHaveLength(2);
    expect(r.skipped).toBe(5);
    expect(parseCsv('').error).toMatch(/Пустой/);
    expect(parseCsv('a,b\n1,2').error).toMatch(/date/);
    expect(parseCsv('date,reading\n1,2').error).toMatch(/temperature_c/);
    expect(parseCsv('x'.repeat(CSV_MAX_BYTES + 1)).error).toMatch(/2 МБ/);
    expect(parseCsv(42 as unknown as string).error).toMatch(/текстом/);
    const tooMany = `${header}\n` + `2026-01-01T00:00:00Z,1.0230,25,density,true,2.5e-5,,,\n`.repeat(20_001);
    expect(parseCsv(tooMany).error).toMatch(/много строк/);
  });

  it('импорт: минимальный набор колонок, переполнение числа', () => {
    const r = parseCsv('date,reading,temperature_c\n2026-01-01T00:00:00Z,1.0230,25\n2026-01-01T00:00:00Z,' + '9'.repeat(400) + ',25\n');
    expect(r.rows).toHaveLength(1);
    expect(r.skipped).toBe(1);
    expect(r.rows[0]?.measurement.note).toBe('');
    expect(r.rows[0]?.measurement.beta).toBe(2.5e-5);
    expect(r.rows[0]?.measurement.scale).toBe('density');
    expect(r.rows[0]?.categoryName).toBe('');
  });

  it('категория: экспортируется по имени и читается при импорте (с защитой от инъекции)', () => {
    const names = new Map([['c1', 'Коллектор 6-17'], ['c2', '=SUM(1)']]);
    const list = [mk({ at: 1000, categoryId: 'c1' }), mk({ at: 2000, categoryId: 'c2' }), mk({ at: 3000 })];
    const csv = toCsv(list, (id) => (id ? (names.get(id) ?? null) : null));
    expect(csv.split('\r\n')[0]?.endsWith(',category')).toBe(true);
    expect(csv).toContain(',Коллектор 6-17');
    expect(csv).toContain(`'=SUM(1)`);
    const back = parseCsv(csv);
    const byAt = back.rows.sort((a, b) => a.measurement.at - b.measurement.at);
    expect(byAt.map((r) => r.categoryName)).toEqual(['Коллектор 6-17', '=SUM(1)', '']);
    expect(byAt[0]?.measurement.categoryId).toBeNull();
  });

  it('splitCsv: кавычки, переносы в ячейках, пустые строки', () => {
    expect(splitCsv('a,b\n"c,d","e""f"\n\n"g\nh",i', ',')).toEqual([
      ['a', 'b'],
      ['c,d', 'e"f'],
      ['g\nh', 'i'],
    ]);
    expect(splitCsv('a;b\r\nc;d\r\n', ';')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(splitCsv('', ',')).toEqual([]);
  });
});
