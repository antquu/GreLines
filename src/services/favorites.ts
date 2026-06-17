/**
 * Favorite stops — persisted in localStorage. Capped at 4 per user so the
 * home sheet stays snappy (we fetch live departures for each on open and
 * every 30s).
 */

const STORAGE_KEY = 'greLines_favorites';
export const FAVORITES_MAX = 4;

export interface Favorite {
  /** Stop id from the MTAG /bbox endpoint, e.g. "SEM:CHAVANT". */
  stopId: string;
  /** Display name at the time it was favorited (so we can render even before
   *  the live `stops` array is loaded). */
  stopName: string;
  /** Optional city tag for the secondary line under the name. */
  city?: string;
  /**
   * Which lines to track for this favorite.
   *   "all"      → every line that serves the stop
   *   string[]   → explicit list of line ids the user picked
   */
  lines: 'all' | string[];
  /** Unix ms when the favorite was added (used for stable ordering). */
  addedAt: number;
}

function read(): Favorite[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (f): f is Favorite =>
        f &&
        typeof f.stopId === 'string' &&
        typeof f.stopName === 'string' &&
        (f.lines === 'all' || Array.isArray(f.lines))
    );
  } catch {
    return [];
  }
}

function write(favorites: Favorite[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  } catch (err) {
    void 0 && console.warn('Failed to persist favorites:', err);
  }
}

export function getFavorites(): Favorite[] {
  return read().sort((a, b) => a.addedAt - b.addedAt);
}

export function isFavorite(stopId: string): boolean {
  return read().some(f => f.stopId === stopId);
}

export function getFavorite(stopId: string): Favorite | null {
  return read().find(f => f.stopId === stopId) ?? null;
}

/**
 * Add or replace a favorite. Returns `false` if the cap is reached and the
 * stop isn't already a favorite (caller should show a message).
 */
export function setFavorite(fav: Favorite): boolean {
  const all = read();
  const existingIdx = all.findIndex(f => f.stopId === fav.stopId);
  if (existingIdx >= 0) {
    all[existingIdx] = fav;
    write(all);
    return true;
  }
  if (all.length >= FAVORITES_MAX) return false;
  all.push(fav);
  write(all);
  return true;
}

export function removeFavorite(stopId: string): void {
  const all = read().filter(f => f.stopId !== stopId);
  write(all);
}

/** Listen for changes to favorites across React state in the same tab. */
type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeFavorites(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function notify() { listeners.forEach(fn => fn()); }

// Wrap the mutating exports so subscribers get notified.
export function setFavoriteAndNotify(fav: Favorite): boolean {
  const ok = setFavorite(fav);
  if (ok) notify();
  return ok;
}

export function removeFavoriteAndNotify(stopId: string): void {
  removeFavorite(stopId);
  notify();
}