/** Настройки приложения: сигнал + сохранение в IndexedDB (зеркало в localStorage для мгновенного старта). */
import { signal } from '@preact/signals';
import { BETA_SODA_LIME, type ScaleType } from '../calc';
import { dbGet, dbPut, hasIndexedDb } from './db';

export type Species = 'shark' | 'hammerhead' | 'ray' | 'clownfish' | 'turtle' | 'moray';
export const ALL_SPECIES: readonly Species[] = ['shark', 'hammerhead', 'ray', 'clownfish', 'turtle', 'moray'];

export type Theme = 'fog' | 'depth' | 'auto';
export type AccentName = 'wine' | 'coral' | 'teal' | 'lime' | 'custom';
export type PixelPalette = 'mono' | 'warm' | 'natural';
export type SalinityUnit = 'permille' | 'psu' | 'ppt';
export type DensityUnit = 'gcm3' | 'kgm3';
export type TempUnit = 'c' | 'f';

export const ACCENTS: Record<Exclude<AccentName, 'custom'>, string> = {
  wine: '#8B1E2D',
  coral: '#D9573B',
  teal: '#157F86',
  lime: '#5E8A1F',
};

export interface Settings {
  scale: ScaleType;
  glassCorrection: boolean;
  beta: number;
  showExtra: boolean;
  target: number;
  targetMin: number;
  targetMax: number;
  targetColor: string;
  salinityUnit: SalinityUnit;
  densityUnit: DensityUnit;
  tempUnit: TempUnit;
  theme: Theme;
  accent: AccentName;
  accentCustom: string;
  appName: string;
  species: Species[];
  creatureCount: number;
  creatureSpeed: number;
  pixelSize: number;
  pixelPalette: PixelPalette;
  haptics: boolean;
  sound: boolean;
  /** Объём аквариума для подмены воды, л. */
  tankVolume: number;
}

export const DEFAULT_SETTINGS: Settings = {
  scale: 'density',
  glassCorrection: true,
  beta: BETA_SODA_LIME,
  showExtra: false,
  target: 35,
  targetMin: 34,
  targetMax: 36,
  targetColor: '#157F86',
  salinityUnit: 'permille',
  densityUnit: 'gcm3',
  tempUnit: 'c',
  theme: 'fog',
  accent: 'wine',
  accentCustom: '#8B1E2D',
  appName: 'соле.мер',
  species: [...ALL_SPECIES],
  creatureCount: 3,
  creatureSpeed: 1,
  pixelSize: 6,
  pixelPalette: 'warm',
  haptics: true,
  sound: false,
  tankVolume: 100,
};

const LS_KEY = 'salimeter.settings';
const DB_KEY = 'app';

const HEX = /^#[0-9a-fA-F]{6}$/;

function pick<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}
function num(v: unknown, lo: number, hi: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : fallback;
}
function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}
function hex(v: unknown, fallback: string): string {
  return typeof v === 'string' && HEX.test(v) ? v.toUpperCase() : fallback;
}

/** Строгая валидация произвольного объекта → корректные настройки. */
export function sanitizeSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  if (typeof raw !== 'object' || raw === null) return { ...d, species: [...d.species] };
  const r = raw as Record<string, unknown>;
  const species = Array.isArray(r.species)
    ? ALL_SPECIES.filter((s) => (r.species as unknown[]).includes(s))
    : [...d.species];
  let targetMin = num(r.targetMin, 0, 60, d.targetMin);
  let targetMax = num(r.targetMax, 0, 60, d.targetMax);
  if (targetMin > targetMax) [targetMin, targetMax] = [targetMax, targetMin];
  const appName =
    typeof r.appName === 'string' && r.appName.trim().length > 0
      ? r.appName.replace(/[\p{Cc}]/gu, '').slice(0, 24)
      : d.appName;
  return {
    scale: pick(r.scale, ['density', 'sg2525', 'sg254'], d.scale),
    glassCorrection: bool(r.glassCorrection, d.glassCorrection),
    beta: num(r.beta, 0, 1e-3, d.beta),
    showExtra: bool(r.showExtra, d.showExtra),
    target: num(r.target, 0, 60, d.target),
    targetMin,
    targetMax,
    targetColor: hex(r.targetColor, d.targetColor),
    salinityUnit: pick(r.salinityUnit, ['permille', 'psu', 'ppt'], d.salinityUnit),
    densityUnit: pick(r.densityUnit, ['gcm3', 'kgm3'], d.densityUnit),
    tempUnit: pick(r.tempUnit, ['c', 'f'], d.tempUnit),
    theme: pick(r.theme, ['fog', 'depth', 'auto'], d.theme),
    accent: pick(r.accent, ['wine', 'coral', 'teal', 'lime', 'custom'], d.accent),
    accentCustom: hex(r.accentCustom, d.accentCustom),
    appName,
    species,
    creatureCount: Math.round(num(r.creatureCount, 0, 6, d.creatureCount)),
    creatureSpeed: num(r.creatureSpeed, 0.25, 3, d.creatureSpeed),
    pixelSize: Math.round(num(r.pixelSize, 4, 10, d.pixelSize)),
    pixelPalette: pick(r.pixelPalette, ['mono', 'warm', 'natural'], d.pixelPalette),
    haptics: bool(r.haptics, d.haptics),
    sound: bool(r.sound, d.sound),
    tankVolume: num(r.tankVolume, 1, 1_000_000, d.tankVolume),
  };
}

export function accentColor(s: Settings): string {
  return s.accent === 'custom' ? s.accentCustom : ACCENTS[s.accent];
}

interface Stored {
  value: unknown;
  updatedAt: number;
}

function readMirror(): Stored | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'object' && parsed !== null && 'updatedAt' in parsed && 'value' in parsed) {
      return { value: parsed.value, updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0 };
    }
    return { value: parsed, updatedAt: 0 };
  } catch {
    return null;
  }
}

function writeMirror(value: Settings, updatedAt: number): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ value, updatedAt }));
  } catch {
    /* нет localStorage — IndexedDB остаётся источником истины */
  }
}

export const settings = signal<Settings>(sanitizeSettings(readMirror()?.value));

let inFlight: Promise<void> | null = null;
let queued: { value: Settings; updatedAt: number } | null = null;

/** Запись в IndexedDB сразу; если запись уже идёт — последнее значение встаёт в очередь. */
function writeDb(value: Settings, updatedAt: number): void {
  if (!hasIndexedDb()) return;
  if (inFlight) {
    queued = { value, updatedAt };
    return;
  }
  inFlight = dbPut('settings', { key: DB_KEY, value, updatedAt })
    .then(
      () => undefined,
      (e: unknown) => {
        console.warn('Не удалось сохранить настройки', e);
      },
    )
    .finally(() => {
      inFlight = null;
      if (queued) {
        const next = queued;
        queued = null;
        writeDb(next.value, next.updatedAt);
      }
    });
}

function persist(value: Settings): void {
  const updatedAt = Date.now();
  writeMirror(value, updatedAt);
  writeDb(value, updatedAt);
}

export function updateSettings(patch: Partial<Settings>): void {
  const next = sanitizeSettings({ ...settings.value, ...patch });
  settings.value = next;
  persist(next);
}

export function resetSettings(): void {
  updateSettings(DEFAULT_SETTINGS);
}

/**
 * Загрузка при старте: зеркало в localStorage уже применено синхронно.
 * Побеждает более свежая запись (по updatedAt); отставшее хранилище догоняется.
 */
export async function loadSettings(): Promise<void> {
  if (!hasIndexedDb()) return;
  try {
    const row = await dbGet<{ key: string; value: unknown; updatedAt?: number }>('settings', DB_KEY);
    const mirror = readMirror();
    const rowAt = row ? (row.updatedAt ?? 0) : -1;
    const mirrorAt = mirror ? mirror.updatedAt : -1;
    if (row && rowAt >= mirrorAt) {
      settings.value = sanitizeSettings(row.value);
      if (mirrorAt < rowAt) writeMirror(settings.value, rowAt);
    } else if (mirror) {
      settings.value = sanitizeSettings(mirror.value);
      await dbPut('settings', { key: DB_KEY, value: settings.value, updatedAt: mirrorAt });
    } else {
      await dbPut('settings', { key: DB_KEY, value: settings.value, updatedAt: Date.now() });
    }
  } catch (e) {
    console.warn('Не удалось загрузить настройки', e);
  }
}

/** Дождаться завершения всех записей (для тестов). */
export async function flushSettings(): Promise<void> {
  while (inFlight) await inFlight;
}
