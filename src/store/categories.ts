/** Категории замеров (например, «Коллектор 6-17»): сигнал + IndexedDB. */
import { signal } from '@preact/signals';
import { dbDelete, dbGetAll, dbPut } from './db';
import { newId } from './measurements';

export interface Category {
  id: string;
  name: string;
  createdAt: number;
}

export const CATEGORY_NAME_MAX = 32;
export const CATEGORY_LIMIT = 50;

export const categories = signal<Category[]>([]);

export function cleanCategoryName(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.replace(/[\p{Cc}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, CATEGORY_NAME_MAX);
}

export function sanitizeCategory(raw: unknown): Category | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const name = cleanCategoryName(r.name);
  if (!name) return null;
  const id = typeof r.id === 'string' && /^[\w-]{1,64}$/.test(r.id) ? r.id : newId();
  const createdAt = typeof r.createdAt === 'number' && Number.isFinite(r.createdAt) && r.createdAt >= 0 ? r.createdAt : Date.now();
  return { id, name, createdAt };
}

const byName = (a: Category, b: Category): number => a.name.localeCompare(b.name, 'ru');

export async function loadCategories(): Promise<void> {
  const rows = await dbGetAll<unknown>('categories');
  const ok: Category[] = [];
  for (const row of rows) {
    const c = sanitizeCategory(row);
    if (c) ok.push(c);
  }
  categories.value = ok.sort(byName);
}

export function findCategoryByName(name: string): Category | undefined {
  const n = cleanCategoryName(name).toLowerCase();
  return categories.value.find((c) => c.name.toLowerCase() === n);
}

/** Создать категорию; если такая (без учёта регистра) уже есть — вернуть её. */
export async function addCategory(name: string): Promise<Category> {
  const clean = cleanCategoryName(name);
  if (!clean) throw new Error('Введите название категории');
  const existing = findCategoryByName(clean);
  if (existing) return existing;
  if (categories.value.length >= CATEGORY_LIMIT) throw new Error(`Не больше ${CATEGORY_LIMIT} категорий`);
  const c: Category = { id: newId(), name: clean, createdAt: Date.now() };
  await dbPut('categories', c);
  categories.value = [...categories.value, c].sort(byName);
  return c;
}

export async function renameCategory(id: string, name: string): Promise<void> {
  const clean = cleanCategoryName(name);
  const c = categories.value.find((x) => x.id === id);
  if (!c || !clean) throw new Error('Введите название категории');
  const dupe = findCategoryByName(clean);
  if (dupe && dupe.id !== id) throw new Error('Такая категория уже есть');
  const next = { ...c, name: clean };
  await dbPut('categories', next);
  categories.value = categories.value.map((x) => (x.id === id ? next : x)).sort(byName);
}

export async function removeCategory(id: string): Promise<void> {
  await dbDelete('categories', id);
  categories.value = categories.value.filter((x) => x.id !== id);
}

export function categoryName(id: string | null | undefined): string | null {
  if (!id) return null;
  return categories.value.find((c) => c.id === id)?.name ?? null;
}
