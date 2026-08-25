
const DB_NAME = 'greLines';
const DB_VERSION = 1;
const STORE = 'cache';

type Entry<T> = { value: T; expires: number };

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  return dbPromise;
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest,
): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;

  return new Promise<T | null>((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const request = run(tx.objectStore(STORE));
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => resolve(null);
      tx.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function idbGet<T>(
  key: string,
  options?: { allowStale?: boolean },
): Promise<{ value: T; stale: boolean } | null> {
  const entry = await withStore<Entry<T>>('readonly', (store) => store.get(key));
  if (!entry || typeof entry.expires !== 'number') return null;

  const stale = Date.now() > entry.expires;
  if (stale && !options?.allowStale) {
    void idbDelete(key);
    return null;
  }
  return { value: entry.value, stale };
}

export async function idbSet<T>(key: string, value: T, ttlMs: number): Promise<void> {
  const entry: Entry<T> = { value, expires: Date.now() + ttlMs };
  await withStore('readwrite', (store) => store.put(entry, key));
}

export async function idbDelete(key: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(key));
}

export async function idbClear(): Promise<void> {
  await withStore('readwrite', (store) => store.clear());
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}
