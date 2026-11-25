/** Экспорт и импорт журнала в CSV со строгой валидацией и защитой от формульных инъекций. */
import { LIMITS, sanitizeMeasurement, type Measurement } from './measurements';

export const CSV_COLUMNS = [
  'date',
  'reading',
  'temperature_c',
  'scale',
  'glass_correction',
  'beta',
  'salinity_permille',
  'density25_kg_m3',
  'note',
  'category',
] as const;

export const CSV_MAX_BYTES = 2 * 1024 * 1024;

const NUMERIC = /^-?\d+(\.\d+)?$/;
const INJECTION = /^[=+\-@]/;

/** Ячейка: управляющие символы (в т.ч. табуляция и CR) заменяются пробелом; текст, начинающийся с = + - @, получает защитный апостроф; кавычки удваиваются. */
export function escapeCell(value: string): string {
  let v = value.replace(/[\p{Cc}]/gu, ' ');
  if (INJECTION.test(v)) v = `'${v}`;
  return /[",\n\r;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function numberCell(n: number, digits: number): string {
  const s = n.toFixed(digits);
  return NUMERIC.test(s) ? s : '';
}

export function toCsv(list: Measurement[], categoryNameOf: (id: string | null) => string | null = () => null): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const m of [...list].sort((a, b) => a.at - b.at)) {
    lines.push(
      [
        new Date(m.at).toISOString(),
        numberCell(m.reading, 4),
        numberCell(m.temperature, 1),
        m.scale,
        m.glassCorrection ? 'true' : 'false',
        m.beta.toExponential(2),
        numberCell(m.salinity, 2),
        numberCell(m.density25, 2),
        escapeCell(m.note),
        escapeCell(categoryNameOf(m.categoryId) ?? ''),
      ].join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
}

/** Разбор CSV (RFC 4180): кавычки, переносы в кавычках, разделитель «,» или «;». */
export function splitCsv(text: string, delimiter: ',' | ';'): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

function detectDelimiter(header: string): ',' | ';' {
  return (header.match(/;/g) ?? []).length > (header.match(/,/g) ?? []).length ? ';' : ',';
}

function parseNum(s: string | undefined, allowComma: boolean): number | null {
  if (s === undefined) return null;
  let v = s.trim();
  if (v.startsWith("'")) v = v.slice(1);
  if (allowComma) v = v.replace(',', '.');
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseDate(s: string | undefined): number | null {
  if (s === undefined) return null;
  const v = s.trim();
  if (/^\d{10,13}$/.test(v)) {
    const n = Number(v);
    return v.length === 10 ? n * 1000 : n;
  }
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

export interface CsvImportRow {
  measurement: Measurement;
  /** Название категории из файла (пусто — без категории); сопоставляется при импорте. */
  categoryName: string;
}

export interface CsvImportResult {
  rows: CsvImportRow[];
  skipped: number;
  error?: string;
}

export function parseCsv(text: string): CsvImportResult {
  if (typeof text !== 'string') return { rows: [], skipped: 0, error: 'Файл не является текстом' };
  if (text.length > CSV_MAX_BYTES) return { rows: [], skipped: 0, error: 'Файл больше 2 МБ' };
  const clean = text.replace(/^\uFEFF/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = detectDelimiter(firstLine);
  const table = splitCsv(clean, delimiter);
  const header = table[0];
  if (!header) return { rows: [], skipped: 0, error: 'Пустой файл' };
  const idx = new Map<string, number>();
  header.forEach((h, i) => idx.set(h.trim().toLowerCase(), i));
  const required = ['date', 'reading', 'temperature_c'] as const;
  for (const col of required) {
    if (!idx.has(col)) return { rows: [], skipped: 0, error: `Нет колонки «${col}»` };
  }
  if (table.length - 1 > LIMITS.maxRows) return { rows: [], skipped: 0, error: 'Слишком много строк' };
  const col = (row: string[], name: string): string | undefined => {
    const i = idx.get(name);
    return i === undefined ? undefined : row[i];
  };
  /** Колонка отсутствует или пуста → значение по умолчанию. */
  const colOr = (row: string[], name: string, fallback: string): string => {
    const v = col(row, name)?.trim();
    return v === undefined || v === '' ? fallback : v;
  };
  const allowComma = delimiter === ';';
  const rows: CsvImportRow[] = [];
  let skipped = 0;
  for (const row of table.slice(1)) {
    const glassRaw = colOr(row, 'glass_correction', 'true').toLowerCase();
    const glass = ['true', '1', 'yes', 'да'].includes(glassRaw)
      ? true
      : ['false', '0', 'no', 'нет'].includes(glassRaw)
        ? false
        : null;
    const m = sanitizeMeasurement({
      at: parseDate(col(row, 'date')),
      reading: parseNum(col(row, 'reading'), allowComma),
      temperature: parseNum(col(row, 'temperature_c'), allowComma),
      scale: colOr(row, 'scale', 'density'),
      glassCorrection: glass,
      beta: parseNum(colOr(row, 'beta', '2.5e-5'), false),
      note: col(row, 'note') ?? '',
    });
    if (m) {
      let categoryName = (col(row, 'category') ?? '').replace(/[\p{Cc}]/gu, ' ').trim().slice(0, 32);
      if (categoryName.startsWith("'")) categoryName = categoryName.slice(1);
      rows.push({ measurement: m, categoryName });
    } else skipped++;
  }
  return { rows, skipped };
}
