import type { AllLinesLine } from './allLines';

const STORAGE_KEY = 'greLines_favoriteLines';

export interface FavoriteLine {
  lineId: string;
  shortName: string;
  longName: string;
  color: string;
  textColor: string;
  addedAt: number;
}

function read(): FavoriteLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (f): f is FavoriteLine =>
        f && typeof f.lineId === 'string' && typeof f.shortName === 'string'
    );
  } catch {
    return [];
  }
}

function write(favorites: FavoriteLine[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  } catch { }
}

export function getFavoriteLines(): FavoriteLine[] {
  return read().sort((a, b) => a.addedAt - b.addedAt);
}

export function isFavoriteLine(lineId: string): boolean {
  return read().some(f => f.lineId === lineId);
}

export function setFavoriteLine(line: AllLinesLine): void {
  const all = read();
  if (all.some(f => f.lineId === line.id)) return;
  all.push({
    lineId: line.id,
    shortName: line.shortName,
    longName: line.longName,
    color: line.color,
    textColor: line.textColor,
    addedAt: Date.now(),
  });
  write(all);
}

export function removeFavoriteLine(lineId: string): void {
  write(read().filter(f => f.lineId !== lineId));
}

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeFavoriteLines(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function notify() { listeners.forEach(fn => fn()); }

export function setFavoriteLineAndNotify(line: AllLinesLine): void {
  setFavoriteLine(line);
  notify();
}

export function removeFavoriteLineAndNotify(lineId: string): void {
  removeFavoriteLine(lineId);
  notify();
}
