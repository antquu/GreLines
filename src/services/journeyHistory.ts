/**
 * Les trajets qu'on a faits.
 *
 * Un favori se choisit ; un historique se constate. Chaque fois qu'on ouvre la
 * fiche d'un itinéraire dans le planificateur, le couple départ-arrivée se
 * range ici — c'est le geste qui dit « celui-là, je le prends », et c'est de
 * cette liste qu'on tire ses favoris plutôt que de tout ressaisir.
 *
 * Un trajet refait ne s'empile pas : il remonte en tête et son compteur avance.
 * Ce qui intéresse, c'est « où je vais souvent », pas « combien de fois j'ai
 * touché l'écran ».
 */

import type { RouteLocation } from './api';

const STORAGE_KEY = 'greLines_journeyHistory_v1';

/** Vingt trajets : au-delà, ce n'est plus un historique mais une archive. */
const MAX_ENTRIES = 20;

export interface JourneyHistoryEntry {
  /** Même clé que les favoris : les deux bouts, au mètre près. */
  id: string;
  from: RouteLocation;
  to: RouteLocation;
  /** Les lignes empruntées la dernière fois — « C1 », « A »… */
  lines: string[];
  /** Durée annoncée la dernière fois, telle quelle : « 24 min ». */
  duration?: string;
  lastAt: number;
  count: number;
}

function point(location: RouteLocation): string {
  return `${location.lat.toFixed(5)},${location.lon.toFixed(5)}`;
}

export function historyKey(from: RouteLocation, to: RouteLocation): string {
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

function read(): JourneyHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is JourneyHistoryEntry =>
        entry && typeof entry.id === 'string' && isLocation(entry.from) && isLocation(entry.to),
    );
  } catch {
    return [];
  }
}

function write(entries: JourneyHistoryEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
  }
}

/** Du plus récent au plus ancien — l'ordre dans lequel on les relit. */
export function getJourneyHistory(): JourneyHistoryEntry[] {
  return read().sort((a, b) => b.lastAt - a.lastAt);
}

/**
 * Note un trajet consulté.
 *
 * La position courante n'y entre pas : « Ma position » d'hier n'est pas celle
 * d'aujourd'hui, et un historique qui pointe vers un endroit où l'on n'est plus
 * ne sert à rien.
 */
export function recordJourney(
  from: RouteLocation,
  to: RouteLocation,
  options: { lines?: string[]; duration?: string } = {},
): void {
  if (!from || !to) return;
  const key = historyKey(from, to);
  const all = read();
  const existing = all.findIndex(entry => entry.id === key);

  if (existing >= 0) {
    all[existing] = {
      ...all[existing],
      from,
      to,
      lines: options.lines ?? all[existing].lines,
      duration: options.duration ?? all[existing].duration,
      lastAt: Date.now(),
      count: all[existing].count + 1,
    };
  } else {
    all.push({
      id: key,
      from,
      to,
      lines: options.lines ?? [],
      duration: options.duration,
      lastAt: Date.now(),
      count: 1,
    });
  }

  const kept = all.sort((a, b) => b.lastAt - a.lastAt).slice(0, MAX_ENTRIES);
  write(kept);
  notify();
}

export function removeJourneyHistoryEntry(id: string): void {
  write(read().filter(entry => entry.id !== id));
  notify();
}

export function clearJourneyHistory(): void {
  write([]);
  notify();
}

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach(listener => listener());
}

export function subscribeJourneyHistory(listener: Listener): () => void {
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
