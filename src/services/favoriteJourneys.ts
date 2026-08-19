/**
 * Les trajets qu'on refait tous les jours.
 *
 * Un favori d'arrêt répond à « quand part le prochain ? ». Un favori de trajet
 * répond à « comment j'y vais, maintenant ? » — c'est la question qu'on pose le
 * matin, et la réponse change à chaque minute. On ne garde donc pas
 * l'itinéraire : on garde ses deux bouts, et on redemande le chemin à chaque
 * fois qu'on regarde.
 *
 * Comme les arrêts favoris, tout vit dans le stockage local : pas de compte,
 * pas de serveur, rien à synchroniser.
 */

import type { RouteLocation } from './api';

const STORAGE_KEY = 'greLines_favoriteJourneys_v1';

/**
 * Dix, comme chez GreGo.
 *
 * Ce n'est pas une limite technique mais une limite de lecture : au-delà, la
 * liste ne se parcourt plus d'un coup d'œil, et un favori qu'on doit chercher
 * n'est plus un favori.
 */
export const FAVORITE_JOURNEYS_MAX = 10;

export interface FavoriteJourney {
  /** Dérivé des deux extrémités : le même trajet ne s'ajoute pas deux fois. */
  id: string;
  /**
   * Nom donné par l'utilisateur — « Boulot », « Chez maman ».
   *
   * Absent par défaut : l'onglet s'intitule alors « Départ → Arrivée ». Un nom
   * ne s'impose pas au moment de l'ajout, il se donne plus tard, quand on sait
   * lequel des trajets on n'arrive plus à distinguer des autres.
   */
  name?: string;
  from: RouteLocation;
  to: RouteLocation;
  /**
   * Les lignes du trajet tel qu'on l'a ajouté — « C1 », « A »…
   *
   * Elles ne servent qu'à l'onglet : le chemin réel est recalculé à chaque
   * consultation, et rien ne garantit qu'il empruntera les mêmes.
   */
  lines?: string[];
  addedAt: number;
}

/**
 * L'identité d'un trajet, ce sont ses deux bouts.
 *
 * Les coordonnées sont arrondies au cent-millième de degré — le mètre : deux
 * saisies du même point n'en donnent jamais exactement les mêmes décimales, et
 * on ne veut pas de deux favoris pour un même trajet.
 */
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
    // Stockage plein ou refusé : le favori vaut pour la session, sans plus.
  }
}

/** Les trajets favoris, du plus ancien au plus récent — l'ordre d'ajout. */
export function getFavoriteJourneys(): FavoriteJourney[] {
  return read().sort((a, b) => a.addedAt - b.addedAt);
}

export function isFavoriteJourney(from: RouteLocation, to: RouteLocation): boolean {
  const key = journeyKey(from, to);
  return read().some(entry => entry.id === key);
}

/**
 * Ajoute un trajet. Rend `false` si la liste est pleine — l'appelant décide
 * quoi en dire ; un favori refusé en silence serait pire que pas de favori.
 */
export function addFavoriteJourney(
  from: RouteLocation,
  to: RouteLocation,
  options: { name?: string; lines?: string[] } = {},
): boolean {
  const key = journeyKey(from, to);
  const all = read();
  const existing = all.findIndex(entry => entry.id === key);
  if (existing >= 0) {
    // Déjà là : on ne le double pas, on rafraîchit seulement ses libellés, qui
    // ont pu changer de nom entre-temps (un arrêt renommé, une adresse
    // reformulée par le géocodeur).
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

/** Renomme un trajet — un nom vide le renvoie à ses deux libellés d'origine. */
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

/** S'abonne aux changements, y compris ceux venus d'un autre onglet. */
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
