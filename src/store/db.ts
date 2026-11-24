/** Тонкая обёртка над IndexedDB: одна база, два хранилища. */

const DB_NAME = 'salimeter';
const DB_VERSION = 1;

export type StoreName = 'measurements' | 'settings';

let dbPromise: Promise<IDBDatabase> | null = null;

export function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  const p = new Promise<IDBDatabase>((resolve, reject) => {
    if (!hasIndexedDb()) {
      reject(new Error('IndexedDB недоступна'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('measurements')) {
        db.createObjectStore('measurements', { keyPath: 'id' }).createIndex('at', 'at');
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error('Не удалось открыть IndexedDB'));
    req.onblocked = () => reject(new Error('IndexedDB заблокирована другой вкладкой'));
  });
  dbPromise = p;
  p.catch(() => {
    dbPromise = null;
  });
  return p;
}

/** Для тестов: закрыть соединение, чтобы следующая операция открыла базу заново. */
export async function closeDb(): Promise<void> {
  if (!dbPromise) return;
  try {
    (await dbPromise).close();
  } catch {
    /* соединение уже закрыто */
  }
  dbPromise = null;
}

function run<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('Ошибка IndexedDB'));
        tx.onabort = () => reject(tx.error ?? new Error('Транзакция прервана'));
      }),
  );
}

export const dbGetAll = <T>(store: StoreName): Promise<T[]> =>
  run<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>);

export const dbGet = <T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> =>
  run<T | undefined>(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>);

export const dbPut = (store: StoreName, value: unknown): Promise<IDBValidKey> =>
  run(store, 'readwrite', (s) => s.put(value));

export const dbDelete = (store: StoreName, key: IDBValidKey): Promise<undefined> =>
  run(store, 'readwrite', (s) => s.delete(key));

export const dbClear = (store: StoreName): Promise<undefined> =>
  run(store, 'readwrite', (s) => s.clear());

/** Несколько записей в одной транзакции. */
export function dbPutMany(store: StoreName, values: unknown[]): Promise<void> {
  if (values.length === 0) return Promise.resolve();
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        const s = tx.objectStore(store);
        for (const v of values) s.put(v);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Ошибка IndexedDB'));
        tx.onabort = () => reject(tx.error ?? new Error('Транзакция прервана'));
      }),
  );
}
