import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { closeDb, dbGetAll, dbPut, dbPutMany } from '../../src/store/db';
import {
  DEFAULT_SETTINGS,
  accentColor,
  flushSettings,
  loadSettings,
  resetSettings,
  sanitizeSettings,
  settings,
  updateSettings,
} from '../../src/store/settings';
import {
  LIMITS,
  addMeasurement,
  cleanNote,
  clearMeasurements,
  importMeasurements,
  loadMeasurements,
  measurements,
  newId,
  removeMeasurement,
  restoreMeasurement,
  sanitizeMeasurement,

} from '../../src/store/measurements';

async function freshDb(): Promise<void> {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  measurements.value = [];
}

const base = {
  reading: 1.023,
  temperature: 25,
  scale: 'density' as const,
  glassCorrection: true,
  beta: 2.5e-5,
};

describe('Настройки', () => {
  beforeEach(freshDb);

  it('sanitizeSettings: мусор → значения по умолчанию, валидное сохраняется', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('x')).toEqual(DEFAULT_SETTINGS);
    const s = sanitizeSettings({
      scale: 'sg2525',
      beta: 1e-5,
      target: 35.5,
      targetMin: 37,
      targetMax: 33,
      targetColor: '#abcdef',
      theme: 'nope',
      accent: 'teal',
      accentCustom: 'red',
      appName: 'Риф\u0000\u0007 ' + 'x'.repeat(40),
      species: ['shark', 'dragon', 'ray'],
      creatureCount: 99,
      creatureSpeed: 2.5,
      pixelSize: 7.4,
      pixelPalette: 'natural',
      haptics: 'yes',
      sound: true,
    });
    expect(s.scale).toBe('sg2525');
    expect(s.beta).toBe(1e-5);
    expect(s.target).toBe(35.5);
    expect(s.targetMin).toBe(33);
    expect(s.targetMax).toBe(37);
    expect(s.targetColor).toBe('#ABCDEF');
    expect(s.theme).toBe('fog');
    expect(s.accent).toBe('teal');
    expect(s.accentCustom).toBe(DEFAULT_SETTINGS.accentCustom);
    expect(s.appName.length).toBe(24);
    expect([...s.appName].some((ch) => ch.charCodeAt(0) < 32)).toBe(false);
    expect(s.species).toEqual(['shark', 'ray']);
    expect(s.creatureCount).toBe(DEFAULT_SETTINGS.creatureCount);
    expect(s.creatureSpeed).toBe(2.5);
    expect(s.pixelSize).toBe(7);
    expect(s.pixelPalette).toBe('natural');
    expect(s.haptics).toBe(true);
    expect(s.sound).toBe(true);
    expect(sanitizeSettings({ appName: '   ' }).appName).toBe(DEFAULT_SETTINGS.appName);
    expect(sanitizeSettings({ species: 'all' }).species).toEqual(DEFAULT_SETTINGS.species);
  });

  it('accentColor', () => {
    expect(accentColor(DEFAULT_SETTINGS)).toBe('#8B1E2D');
    expect(accentColor({ ...DEFAULT_SETTINGS, accent: 'custom', accentCustom: '#123456' })).toBe('#123456');
    expect(accentColor({ ...DEFAULT_SETTINGS, accent: 'lime' })).toBe('#5E8A1F');
  });

  it('updateSettings сохраняет в localStorage и IndexedDB, loadSettings читает', async () => {
    updateSettings({ theme: 'depth', target: 34.5 });
    updateSettings({ sound: true });
    updateSettings({ haptics: false });
    expect(settings.value.theme).toBe('depth');
    expect(JSON.parse(localStorage.getItem('salimeter.settings') ?? '{}')).toMatchObject({ value: { theme: 'depth', sound: true } });
    await flushSettings();
    const rows = await dbGetAll<{ key: string; value: unknown }>('settings');
    expect(rows).toHaveLength(1);
    settings.value = { ...DEFAULT_SETTINGS };
    await loadSettings();
    expect(settings.value.theme).toBe('depth');
    expect(settings.value.target).toBe(34.5);
    expect(settings.value.haptics).toBe(false);
    resetSettings();
    expect(settings.value).toEqual(DEFAULT_SETTINGS);
    await flushSettings();
    await flushSettings();
  });

  it('loadSettings без записи в базе создаёт её; повреждённая запись заменяется дефолтом', async () => {
    await loadSettings();
    expect(await dbGetAll('settings')).toHaveLength(1);
    await dbPut('settings', { key: 'app', value: { theme: 'nope', beta: -1 }, updatedAt: 5 });
    await loadSettings();
    expect(settings.value.theme).toBe('fog');
    expect(settings.value.beta).toBe(DEFAULT_SETTINGS.beta);
  });

  it('более свежее зеркало в localStorage побеждает устаревшую базу и записывается в неё', async () => {
    await dbPut('settings', { key: 'app', value: { ...DEFAULT_SETTINGS, theme: 'fog' }, updatedAt: 1000 });
    localStorage.setItem('salimeter.settings', JSON.stringify({ value: { ...DEFAULT_SETTINGS, theme: 'depth' }, updatedAt: 2000 }));
    await loadSettings();
    expect(settings.value.theme).toBe('depth');
    const rows = await dbGetAll<{ value: { theme: string }; updatedAt: number }>('settings');
    expect(rows[0]?.value.theme).toBe('depth');
    expect(rows[0]?.updatedAt).toBe(2000);
    // устаревшее зеркало догоняется из базы
    await dbPut('settings', { key: 'app', value: { ...DEFAULT_SETTINGS, theme: 'auto' }, updatedAt: 3000 });
    await loadSettings();
    expect(settings.value.theme).toBe('auto');
    expect(JSON.parse(localStorage.getItem('salimeter.settings') ?? '{}')).toMatchObject({ updatedAt: 3000 });
    // зеркало старого формата (без updatedAt) читается
    localStorage.setItem('salimeter.settings', JSON.stringify({ ...DEFAULT_SETTINGS, theme: 'depth' }));
    await loadSettings();
    expect(settings.value.theme).toBe('auto');
    localStorage.setItem('salimeter.settings', '{not json');
    await loadSettings();
    expect(settings.value.theme).toBe('auto');
    // зеркало с нечисловым updatedAt и запись в базе без updatedAt
    localStorage.setItem('salimeter.settings', JSON.stringify({ value: { ...DEFAULT_SETTINGS, theme: 'depth' }, updatedAt: 'x' }));
    await dbPut('settings', { key: 'app', value: { ...DEFAULT_SETTINGS, theme: 'fog' } });
    await loadSettings();
    expect(settings.value.theme).toBe('fog');
  });

  it('без IndexedDB настройки живут в localStorage', async () => {
    await closeDb();
    globalThis.indexedDB = undefined as unknown as IDBFactory;
    updateSettings({ theme: 'depth' });
    await flushSettings();
    await loadSettings();
    expect(settings.value.theme).toBe('depth');
    expect(JSON.parse(localStorage.getItem('salimeter.settings') ?? '{}')).toMatchObject({ value: { theme: 'depth' } });
  });

  it('loadSettings переживает ошибку базы', async () => {
    await closeDb();
    const broken = {
      open: () => {
        const req = { onerror: null as null | (() => void), error: new Error('boom') } as unknown as IDBOpenDBRequest;
        setTimeout(() => (req as unknown as { onerror: () => void }).onerror(), 0);
        return req;
      },
    } as unknown as IDBFactory;
    globalThis.indexedDB = broken;
    await expect(loadSettings()).resolves.toBeUndefined();
    updateSettings({ sound: true });
    await flushSettings();
    await closeDb();
  });
});

describe('Замеры', () => {
  beforeEach(freshDb);

  it('sanitizeMeasurement: пересчитывает солёность, отбрасывает мусор', () => {
    const m = sanitizeMeasurement({ ...base, at: 1_700_000_000_000, salinity: 999, note: 'ok\u0000' });
    expect(m).not.toBeNull();
    expect(m?.salinity).toBeCloseTo(34.55, 2);
    expect(m?.density25).toBeCloseTo(1023, 2);
    expect(m?.note).toBe('ok');
    expect(m?.id).toMatch(/^[\w-]+$/);
    expect(sanitizeMeasurement({ ...base, at: 1, id: 'abc-123' })?.id).toBe('abc-123');
    expect(sanitizeMeasurement({ ...base, at: 1, id: 'bad id!' })?.id).not.toBe('bad id!');
    for (const bad of [
      null,
      'x',
      { ...base, at: 1, reading: 2 },
      { ...base, at: 1, reading: '1.023' },
      { ...base, at: 1, temperature: 100 },
      { ...base, at: -1 },
      { ...base, at: NaN },
      { ...base, at: 1, scale: 'ppt' },
      { ...base, at: 1, glassCorrection: 'true' },
      { ...base, at: 1, beta: 1 },
      { ...base },
    ]) {
      expect(sanitizeMeasurement(bad)).toBeNull();
    }
  });

  it('cleanNote и newId', () => {
    expect(cleanNote(42)).toBe('');
    expect(cleanNote('  a\tb  ')).toBe('a b');
    expect(cleanNote('x'.repeat(500))).toHaveLength(LIMITS.noteLength);
    expect(newId()).not.toBe(newId());
    const orig = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(crypto) as object, 'randomUUID');
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    expect(newId()).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
    if (orig) Object.defineProperty(crypto, 'randomUUID', orig);
  });

  it('добавление, загрузка, удаление, восстановление, очистка', async () => {
    const a = await addMeasurement({ ...base, at: 1000 });
    const b = await addMeasurement({ ...base, reading: 1.024, at: 2000, note: 'после подмены' });
    expect(measurements.value.map((m) => m.id)).toEqual([b.id, a.id]);
    measurements.value = [];
    await loadMeasurements();
    expect(measurements.value.map((m) => m.id)).toEqual([b.id, a.id]);
    expect(measurements.value[0]?.note).toBe('после подмены');

    const removed = await removeMeasurement(a.id);
    expect(removed?.id).toBe(a.id);
    expect(measurements.value).toHaveLength(1);
    expect(await removeMeasurement('nope')).toBeUndefined();
    await restoreMeasurement(removed!);
    expect(measurements.value).toHaveLength(2);
    expect(measurements.value[1]?.id).toBe(a.id);
    await clearMeasurements();
    expect(measurements.value).toHaveLength(0);
    expect(await dbGetAll('measurements')).toHaveLength(0);
  });

  it('некорректный замер не сохраняется', async () => {
    await expect(addMeasurement({ ...base, reading: 5 })).rejects.toThrow();
    expect(measurements.value).toHaveLength(0);
  });

  it('loadMeasurements пропускает повреждённые записи', async () => {
    await dbPutMany('measurements', [
      { id: 'good', at: 5, ...base },
      { id: 'bad', at: 5, ...base, reading: 'oops' },
    ]);
    await loadMeasurements();
    expect(measurements.value.map((m) => m.id)).toEqual(['good']);
  });

  it('импорт: дубликаты и конфликт id', async () => {
    const a = await addMeasurement({ ...base, at: 1000 });
    const dupe = sanitizeMeasurement({ ...base, at: 1000, id: 'other' })!;
    const sameId = sanitizeMeasurement({ ...base, at: 3000, id: a.id })!;
    const fresh = sanitizeMeasurement({ ...base, at: 4000, reading: 1.025 })!;
    const r = await importMeasurements([dupe, sameId, fresh, fresh]);
    expect(r).toEqual({ added: 2, skipped: 2 });
    expect(measurements.value).toHaveLength(3);
    expect(new Set(measurements.value.map((m) => m.id)).size).toBe(3);
    expect(await importMeasurements([])).toEqual({ added: 0, skipped: 0 });
  });

  it('импорт: лимит строк', async () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      sanitizeMeasurement({ ...base, at: i + 1, temperature: 20 + i })!,
    );
    const saved = LIMITS.maxRows;
    (LIMITS as { maxRows: number }).maxRows = 3;
    await expect(importMeasurements(many)).rejects.toThrow(/Слишком много/);
    (LIMITS as { maxRows: number }).maxRows = saved;
  });

  it('ошибки IndexedDB поднимаются с текстом', async () => {
    await closeDb();
    globalThis.indexedDB = undefined as unknown as IDBFactory;
    await expect(loadMeasurements()).rejects.toThrow(/IndexedDB/);
    await expect(addMeasurement({ ...base })).rejects.toThrow();
    await expect(clearMeasurements()).rejects.toThrow();
    await expect(importMeasurements([sanitizeMeasurement({ ...base, at: 1 })!])).rejects.toThrow();
    measurements.value = [sanitizeMeasurement({ ...base, at: 1, id: 'x' })!];
    await expect(removeMeasurement('x')).rejects.toThrow();
    await expect(restoreMeasurement(measurements.value[0]!)).rejects.toThrow();
    await closeDb();
  });
});
