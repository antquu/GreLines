/**
 * Domicile et travail.
 *
 * Deux points qu'on saisit une fois et qu'on réutilise tous les jours : ils
 * vivent dans le stockage local, sans compte ni serveur. Le reste des lieux
 * fréquents se déduit déjà de l'historique de recherche.
 */

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

/** Enregistre — ou efface, avec `null` — un des deux lieux. */
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

/** S'abonne aux changements, y compris ceux d'un autre onglet. */
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
