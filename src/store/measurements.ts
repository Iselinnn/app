/** Журнал замеров: сигнал (по убыванию времени) + IndexedDB. */
import { signal } from '@preact/signals';
import { measure, type ScaleType } from '../calc';
import { dbClear, dbDelete, dbGetAll, dbPut, dbPutMany } from './db';

export interface Measurement {
  id: string;
  /** Время замера, мс от эпохи. */
  at: number;
  reading: number;
  temperature: number;
  scale: ScaleType;
  glassCorrection: boolean;
  beta: number;
  salinity: number;
  /** кг/м³ */
  density25: number;
  note: string;
  /** Категория (например, аквариум или система); null — без категории. */
  categoryId: string | null;
}

export const measurements = signal<Measurement[]>([]);
export const measurementsError = signal<string | null>(null);

export const LIMITS = {
  reading: [0.9, 1.1],
  temperature: [-5, 60],
  beta: [0, 1e-3],
  noteLength: 200,
  maxRows: 20_000,
} as const;

const SCALES: readonly ScaleType[] = ['density', 'sg2525', 'sg254'];

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function cleanNote(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.replace(/[\p{Cc}]/gu, ' ').trim().slice(0, LIMITS.noteLength);
}

function inRange(v: unknown, [lo, hi]: readonly [number, number]): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
}

/**
 * Строгая проверка произвольного объекта. Солёность и плотность пересчитываются
 * из входных данных — внешним числам не доверяем.
 */
export function sanitizeMeasurement(raw: unknown): Measurement | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!inRange(r.reading, LIMITS.reading) || !inRange(r.temperature, LIMITS.temperature)) return null;
  if (typeof r.at !== 'number' || !Number.isFinite(r.at) || r.at < 0 || r.at > 4102444800000) return null;
  const scale = SCALES.includes(r.scale as ScaleType) ? (r.scale as ScaleType) : null;
  if (!scale) return null;
  if (typeof r.glassCorrection !== 'boolean') return null;
  if (!inRange(r.beta, LIMITS.beta)) return null;
  const res = measure(r.reading, r.temperature, { scale, glassCorrection: r.glassCorrection, beta: r.beta });
  if (!Number.isFinite(res.salinity) || !Number.isFinite(res.density25)) return null;
  const id = typeof r.id === 'string' && /^[\w-]{1,64}$/.test(r.id) ? r.id : newId();
  const categoryId = typeof r.categoryId === 'string' && /^[\w-]{1,64}$/.test(r.categoryId) ? r.categoryId : null;
  return {
    id,
    categoryId,
    at: Math.round(r.at),
    reading: r.reading,
    temperature: r.temperature,
    scale,
    glassCorrection: r.glassCorrection,
    beta: r.beta,
    salinity: res.salinity,
    density25: res.density25,
    note: cleanNote(r.note),
  };
}

const byTimeDesc = (a: Measurement, b: Measurement): number => b.at - a.at;

function fail(e: unknown): never {
  const msg = e instanceof Error ? e.message : 'Ошибка хранилища';
  measurementsError.value = msg;
  throw e instanceof Error ? e : new Error(msg);
}

export async function loadMeasurements(): Promise<void> {
  try {
    const rows = await dbGetAll<unknown>('measurements');
    const ok: Measurement[] = [];
    for (const row of rows) {
      const m = sanitizeMeasurement(row);
      if (m) ok.push(m);
    }
    measurements.value = ok.sort(byTimeDesc);
    measurementsError.value = null;
  } catch (e) {
    fail(e);
  }
}

export async function addMeasurement(
  input: Omit<Measurement, 'id' | 'at' | 'salinity' | 'density25' | 'note' | 'categoryId'> & {
    at?: number;
    note?: string;
    categoryId?: string | null;
  },
): Promise<Measurement> {
  const m = sanitizeMeasurement({ ...input, at: input.at ?? Date.now(), id: newId() });
  if (!m) throw new Error('Некорректный замер');
  try {
    await dbPut('measurements', m);
  } catch (e) {
    fail(e);
  }
  measurements.value = [m, ...measurements.value].sort(byTimeDesc);
  return m;
}

export async function removeMeasurement(id: string): Promise<Measurement | undefined> {
  const m = measurements.value.find((x) => x.id === id);
  if (!m) return undefined;
  try {
    await dbDelete('measurements', id);
  } catch (e) {
    fail(e);
  }
  measurements.value = measurements.value.filter((x) => x.id !== id);
  return m;
}

/** Вернуть удалённый замер (отмена удаления). */
export async function restoreMeasurement(m: Measurement): Promise<void> {
  try {
    await dbPut('measurements', m);
  } catch (e) {
    fail(e);
  }
  measurements.value = [m, ...measurements.value.filter((x) => x.id !== m.id)].sort(byTimeDesc);
}

/** Импорт: дубликаты (то же время, показание и температура) пропускаются. */
export async function importMeasurements(list: Measurement[]): Promise<{ added: number; skipped: number }> {
  const key = (m: Measurement): string => `${m.at}|${m.reading}|${m.temperature}`;
  const existing = new Set(measurements.value.map(key));
  const ids = new Set(measurements.value.map((m) => m.id));
  const fresh: Measurement[] = [];
  for (const m of list) {
    const k = key(m);
    if (existing.has(k)) continue;
    existing.add(k);
    const row = ids.has(m.id) ? { ...m, id: newId() } : m;
    ids.add(row.id);
    fresh.push(row);
  }
  if (fresh.length + measurements.value.length > LIMITS.maxRows) {
    throw new Error(`Слишком много записей (максимум ${LIMITS.maxRows})`);
  }
  try {
    await dbPutMany('measurements', fresh);
  } catch (e) {
    fail(e);
  }
  measurements.value = [...fresh, ...measurements.value].sort(byTimeDesc);
  return { added: fresh.length, skipped: list.length - fresh.length };
}

/** Снять категорию со всех замеров (при удалении категории). */
export async function detachCategory(categoryId: string): Promise<void> {
  const affected = measurements.value.filter((m) => m.categoryId === categoryId).map((m) => ({ ...m, categoryId: null }));
  if (affected.length === 0) return;
  try {
    await dbPutMany('measurements', affected);
  } catch (e) {
    fail(e);
  }
  measurements.value = measurements.value.map((m) => (m.categoryId === categoryId ? { ...m, categoryId: null } : m));
}

export async function clearMeasurements(): Promise<void> {
  try {
    await dbClear('measurements');
  } catch (e) {
    fail(e);
  }
  measurements.value = [];
}
