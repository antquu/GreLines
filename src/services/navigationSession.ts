/**
 * Guidage en cours, conservé entre deux ouvertures de l'application.
 *
 * Un téléphone interrompt : un appel arrive, l'écran s'éteint, le système
 * récupère la mémoire de l'onglet. Retrouver son trajet en cours au retour évite
 * de tout ressaisir au milieu d'un quai. La reprise a une date de péremption :
 * revenir deux heures après pour un trajet de vingt minutes, ce n'est plus le
 * même voyage.
 */

import type { RouteItinerary } from './api';

const STORAGE_KEY = 'greLines_navigationSession_v1';

/**
 * Marge après l'arrivée prévue.
 *
 * Un trajet déborde : correspondance manquée, bus en retard. Un quart d'heure
 * couvre ces aléas sans ressusciter un trajet de la veille.
 */
const GRACE_MS = 15 * 60 * 1000;

/** Plafond de reprise, quand la durée annoncée est inexploitable. */
const MAX_SESSION_MS = 3 * 60 * 60 * 1000;

interface StoredSession {
  itinerary: RouteItinerary;
  /** Dernière étape affichée dans le guidage. */
  currentStepIndex?: number;
  /** Horodatage de démarrage du guidage. */
  startedAt: number;
  /** Au-delà, la session ne vaut plus rien. */
  expiresAt: number;
}

function durationMs(itinerary: RouteItinerary): number {
  const minutes = Number(String(itinerary.dur ?? '').match(/\d+/)?.[0] ?? 0);
  if (!Number.isFinite(minutes) || minutes <= 0) return MAX_SESSION_MS;
  return Math.min(minutes * 60_000 + GRACE_MS, MAX_SESSION_MS);
}

/** Mémorise le trajet guidé. Sans effet si le stockage est plein ou refusé. */
export function saveNavigationSession(itinerary: RouteItinerary): void {
  try {
    const startedAt = Date.now();
    const session: StoredSession = {
      itinerary,
      currentStepIndex: 0,
      startedAt,
      expiresAt: startedAt + durationMs(itinerary),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
  }
}

function sameItinerary(a: RouteItinerary, b: RouteItinerary): boolean {
  const aFirstLeg: any = a.allLegs?.[0];
  const bFirstLeg: any = b.allLegs?.[0];
  return (
    a.depName === b.depName &&
    a.arrName === b.arrName &&
    aFirstLeg?.startTime === bFirstLeg?.startTime
  );
}

/** Met à jour l'étape sans prolonger la durée de vie de la session. */
export function saveNavigationStep(itinerary: RouteItinerary, currentStepIndex: number): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const session = JSON.parse(raw) as StoredSession;
    if (!session?.itinerary || !sameItinerary(session.itinerary, itinerary)) return;
    session.currentStepIndex = Math.max(0, Math.floor(currentStepIndex));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
  }
}

export function loadNavigationStep(itinerary: RouteItinerary): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return 0;
    const session = JSON.parse(raw) as StoredSession;
    if (!session?.itinerary || !sameItinerary(session.itinerary, itinerary)) return 0;
    return Math.max(0, Math.floor(Number(session.currentStepIndex) || 0));
  } catch {
    return 0;
  }
}

export function clearNavigationSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* rien à nettoyer */
  }
}

/**
 * Trajet à reprendre, ou `null` s'il n'y en a pas — ou s'il est périmé, auquel
 * cas l'entrée est effacée au passage.
 */
export function loadNavigationSession(): RouteItinerary | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const session = JSON.parse(raw) as StoredSession;
    if (!session?.itinerary || !Array.isArray(session.itinerary.allLegs)) {
      clearNavigationSession();
      return null;
    }
    if (!Number.isFinite(session.expiresAt) || Date.now() > session.expiresAt) {
      clearNavigationSession();
      return null;
    }
    return session.itinerary;
  } catch {
    clearNavigationSession();
    return null;
  }
}
