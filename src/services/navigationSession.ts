import type { RouteItinerary } from './api';

const STORAGE_KEY = 'greLines_navigationSession_v1';

const GRACE_MS = 15 * 60 * 1000;

const MAX_SESSION_MS = 3 * 60 * 60 * 1000;

interface StoredSession {
  itinerary: RouteItinerary;
  currentStepIndex?: number;
  startedAt: number;
  expiresAt: number;
}

function durationMs(itinerary: RouteItinerary): number {
  const minutes = Number(String(itinerary.dur ?? '').match(/\d+/)?.[0] ?? 0);
  if (!Number.isFinite(minutes) || minutes <= 0) return MAX_SESSION_MS;
  return Math.min(minutes * 60_000 + GRACE_MS, MAX_SESSION_MS);
}

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
  }
}

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
