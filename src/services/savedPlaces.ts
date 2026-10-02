import type { RouteLocation } from './api';

const STORAGE_KEY = 'greLines_savedPlaces_v1';

export type SavedPlaceKind = 'home' | 'work';

export interface SavedPlaces {
  home?: RouteLocation;
  work?: RouteLocation;
}

function read(): SavedPlaces {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SavedPlaces;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function getSavedPlaces(): SavedPlaces {
  return read();
}

export function setSavedPlace(kind: SavedPlaceKind, location: RouteLocation | null): SavedPlaces {
  const places = read();
  if (location) places[kind] = location;
  else delete places[kind];

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(places));
  } catch {
  }
  notify(places);
  return places;
}

type Listener = (places: SavedPlaces) => void;
const listeners = new Set<Listener>();

function notify(places: SavedPlaces) {
  for (const listener of listeners) listener(places);
}

export function subscribeSavedPlaces(listener: Listener): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener(read());
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}
