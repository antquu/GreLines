import type { RouteLocation } from './api';

const STORAGE_KEY = 'greLines_favoriteJourneys_v1';

export const FAVORITE_JOURNEYS_MAX = 10;

export interface FavoriteJourney {
  id: string;
  name?: string;
  from: RouteLocation;
  to: RouteLocation;
  lines?: string[];
  addedAt: number;
}

export function journeyKey(from: RouteLocation, to: RouteLocation): string {
  const point = (location: RouteLocation) =>
    `${location.lat.toFixed(5)},${location.lon.toFixed(5)}`;
  return `${point(from)}>${point(to)}`;
}

function isLocation(value: any): value is RouteLocation {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.label === 'string' &&
    Number.isFinite(value.lat) &&
    Number.isFinite(value.lon)
  );
}

function read(): FavoriteJourney[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is FavoriteJourney =>
        entry &&
        typeof entry.id === 'string' &&
        isLocation(entry.from) &&
        isLocation(entry.to),
    );
  } catch {
    return [];
  }
}

function write(journeys: FavoriteJourney[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(journeys));
  } catch {
  }
}

export function getFavoriteJourneys(): FavoriteJourney[] {
  return read().sort((a, b) => a.addedAt - b.addedAt);
}

export function isFavoriteJourney(from: RouteLocation, to: RouteLocation): boolean {
  const key = journeyKey(from, to);
  return read().some(entry => entry.id === key);
}

export function addFavoriteJourney(
  from: RouteLocation,
  to: RouteLocation,
  options: { name?: string; lines?: string[] } = {},
): boolean {
  const key = journeyKey(from, to);
  const all = read();
  const existing = all.findIndex(entry => entry.id === key);
  if (existing >= 0) {
    all[existing] = {
      ...all[existing],
      from,
      to,
      name: options.name ?? all[existing].name,
      lines: options.lines ?? all[existing].lines,
    };
    write(all);
    notify();
    return true;
  }
  if (all.length >= FAVORITE_JOURNEYS_MAX) return false;
  all.push({ id: key, name: options.name, lines: options.lines, from, to, addedAt: Date.now() });
  write(all);
  notify();
  return true;
}

export function removeFavoriteJourney(id: string): void {
  write(read().filter(entry => entry.id !== id));
  notify();
}

export function renameFavoriteJourney(id: string, name: string): void {
  const all = read();
  const index = all.findIndex(entry => entry.id === id);
  if (index < 0) return;
  const trimmed = name.trim();
  all[index] = { ...all[index], name: trimmed || undefined };
  write(all);
  notify();
}

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach(listener => listener());
}

export function subscribeFavoriteJourneys(listener: Listener): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}
