const STORE_KEY = 'grelines.placeImages.full';

export interface PlaceImageSet {
  full: string;
  low: string;
}

export function placeImageSet(full: string): PlaceImageSet {
  return { full, low: full.replace(/\.(jpe?g|png|webp)$/i, '-low.$1') };
}

function readStore(): Set<string> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

let stored: Set<string> | null = null;

function store(): Set<string> {
  if (!stored) stored = readStore();
  return stored;
}

export function hasFullImage(src: string): boolean {
  return store().has(src);
}

function markFullImage(src: string): void {
  const set = store();
  if (set.has(src)) return;
  set.add(src);
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify([...set]));
  } catch {
  }
}

interface NetworkInformation {
  effectiveType?: string;
  saveData?: boolean;
  downlink?: number;
}

function connection(): NetworkInformation | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { connection?: NetworkInformation }).connection;
}

export function isNarrowConnection(): boolean {
  const info = connection();
  if (!info) return false;
  if (info.saveData) return true;
  if (info.effectiveType && /^(slow-2g|2g|3g)$/.test(info.effectiveType)) return true;
  return typeof info.downlink === 'number' && info.downlink > 0 && info.downlink < 1.5;
}

export function initialPlaceSrc(set: PlaceImageSet): string {
  if (hasFullImage(set.full)) return set.full;
  return isNarrowConnection() ? set.low : set.full;
}

const inFlight = new Map<string, Promise<void>>();

export function fetchFullImage(src: string): Promise<void> {
  if (hasFullImage(src)) return Promise.resolve();
  const running = inFlight.get(src);
  if (running) return running;

  const task = fetch(src, { cache: 'force-cache' })
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.blob();
    })
    .then(() => {
      markFullImage(src);
    })
    .catch(() => {
    })
    .finally(() => {
      inFlight.delete(src);
    });

  inFlight.set(src, task);
  return task;
}

export function prefetchFullImages(sources: string[]): () => void {
  let cancelled = false;
  let handle: number | undefined;

  const idle = (run: () => void) => {
    const request = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
      .requestIdleCallback;
    handle = request ? request(run, { timeout: 4000 }) : window.setTimeout(run, 1200);
  };

  const next = (index: number) => {
    if (cancelled || index >= sources.length) return;
    const src = sources[index];
    if (hasFullImage(src)) {
      next(index + 1);
      return;
    }
    idle(() => {
      if (cancelled) return;
      void fetchFullImage(src).then(() => next(index + 1));
    });
  };

  next(0);

  return () => {
    cancelled = true;
    const cancel = (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
    if (handle === undefined) return;
    if (cancel) cancel(handle);
    else window.clearTimeout(handle);
  };
}
