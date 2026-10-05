import type { RouteItinerary } from './api';

export const BRISK_WALK_RATIO = 0.75;
export const RUN_WALK_RATIO = 0.5;
const MISSED_GRACE_MS = 30_000;

export const clockOf = (at: number) => new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

export function keepCatchable(itineraries: RouteItinerary[], now: number): RouteItinerary[] {
  const kept: RouteItinerary[] = [];
  for (const itinerary of itineraries) {
    const legs = itinerary.allLegs ?? [];
    const start = Number(legs[0]?.startTime);
    if (!Number.isFinite(start) || start >= now) {
      kept.push(itinerary);
      continue;
    }
    const boardIndex = legs.findIndex(leg => leg?.mode && leg.mode !== 'WALK');
    const leadIn = boardIndex < 0 ? legs : legs.slice(0, boardIndex);
    if (boardIndex <= 0 || leadIn.some(leg => leg?.mode !== 'WALK')) {
      if (start >= now - MISSED_GRACE_MS) kept.push(itinerary);
      continue;
    }
    const board = Number(legs[boardIndex].startTime);
    const walkMs = leadIn.reduce((sum, leg) => sum + Number(leg.endTime) - Number(leg.startTime), 0);
    if (!Number.isFinite(board) || board - now < walkMs * RUN_WALK_RATIO) continue;
    const rush = board - now < walkMs * BRISK_WALK_RATIO;
    const end = Number(legs[legs.length - 1]?.endTime);
    const first = { ...legs[0], startTime: now, duration: Math.max(0, (Number(legs[0].endTime) - now) / 1000) };
    const allLegs = [first, ...legs.slice(1)];
    const minutes = Number.isFinite(end) ? Math.round((end - now) / 60_000) : null;
    kept.push({
      ...itinerary,
      allLegs,
      dep: clockOf(now),
      dur: minutes !== null ? `${minutes} min` : itinerary.dur,
      tight: true,
      ...(rush ? { rush: true } : {}),
    });
  }
  return kept;
}
