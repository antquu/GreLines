





const STORAGE_KEY = 'greLines_favorites';
export const FAVORITES_MAX = 4;

export interface Favorite {
  
  stopId: string;
  

  stopName: string;
  
  city?: string;
  




  lines: 'all' | string[];
  
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
  } catch (err) {  }
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


type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeFavorites(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function notify() { listeners.forEach(fn => fn()); }


export function setFavoriteAndNotify(fav: Favorite): boolean {
  const ok = setFavorite(fav);
  if (ok) notify();
  return ok;
}

export function removeFavoriteAndNotify(stopId: string): void {
  removeFavorite(stopId);
  notify();
}