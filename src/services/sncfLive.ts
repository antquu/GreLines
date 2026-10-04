import type { Departure } from '../types';

export interface SncfDeparture {
  train: string;
  direction: string;
  mode: string;
  network: string;
  line: string;
  base: number;
  real: number;
  live: boolean;
}

const TTL_MS = 30_000;
const MATCH_WINDOW_MS = 3 * 60_000;
const cache = new Map<string, { at: number; value: Promise<SncfDeparture[] | null> }>();
let unavailable = false;

export function stationUicOf(id: string | null | undefined): string | null {
  return /(87\d{6})/.exec(String(id ?? ''))?.[1] ?? null;
}

export function getSncfDepartures(uic: string): Promise<SncfDeparture[] | null> {
  if (unavailable) return Promise.resolve(null);
  const cached = cache.get(uic);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  const value = fetch(`/api/sncf?gare=${encodeURIComponent(uic)}`)
    .then(response => {
      if (response.status === 501) unavailable = true;
      return response.ok ? (response.json() as Promise<SncfDeparture[]>) : null;
    })
    .catch(() => null);
  cache.set(uic, { at: Date.now(), value });
  return value;
}

const normalize = (text: string) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const wordsOf = (text: string) => new Set(normalize(text).split(/[^a-z]+/).filter(word => word.length >= 4));

function sameDirection(destination: string, direction: string): boolean {
  if (!destination || !direction) return true;
  const target = wordsOf(direction);
  return [...wordsOf(destination)].some(word => target.has(word));
}

function closest(entries: SncfDeparture[], used: Set<SncfDeparture>, at: number, destination: string, train?: string | null) {
  if (train) {
    const exact = entries.find(entry => !used.has(entry) && entry.train === train && Math.abs(entry.base - at) < 6 * 60 * 60_000);
    if (exact) return exact;
  }
  let best: { entry: SncfDeparture; gap: number } | null = null;
  for (const entry of entries) {
    if (used.has(entry) || !sameDirection(destination, entry.direction)) continue;
    const gap = Math.min(Math.abs(entry.base - at), Math.abs(entry.real - at));
    if (gap <= MATCH_WINDOW_MS && (!best || gap < best.gap)) best = { entry, gap };
  }
  return best?.entry ?? null;
}

export async function withSncfLive(departures: Departure[], stationIds: string[]): Promise<Departure[]> {
  const uics = [...new Set(stationIds.map(stationUicOf).filter((uic): uic is string => Boolean(uic)))];
  if (uics.length === 0 || !departures.some(dep => dep.type === 'RAIL')) return departures;
  const lists = await Promise.all(uics.map(getSncfDepartures));
  const entries = lists.flatMap(list => list ?? []);
  if (entries.length === 0) return departures;

  const now = Date.now();
  const used = new Set<SncfDeparture>();
  return departures.map(dep => {
    if (dep.type !== 'RAIL') return dep;
    const at = dep.at ?? now + dep.departureTime * 60_000;
    const match = closest(entries, used, at, dep.destination);
    if (!match) return dep;
    used.add(match);
    return {
      ...dep,
      at: match.real,
      departureTime: Math.max(0, Math.round((match.real - now) / 60_000)),
      realtime: match.live || dep.realtime,
      theoretical: match.live ? false : dep.theoretical,
    };
  });
}

type RawLeg = {
  mode?: string;
  startTime?: number;
  endTime?: number;
  realTime?: boolean;
  departureDelay?: number;
  tripShortName?: string;
  headsign?: string;
  from?: { stopId?: string; name?: string };
  to?: { name?: string };
};

type RawItinerary = { startTime?: number; endTime?: number; duration?: number; legs: RawLeg[] };

export async function applySncfToItineraries<T extends RawItinerary>(itineraries: T[]): Promise<T[]> {
  const trainLegs = itineraries.flatMap(itinerary =>
    itinerary.legs.filter(leg => leg.mode === 'RAIL' && stationUicOf(leg.from?.stopId) && typeof leg.startTime === 'number'),
  );
  if (trainLegs.length === 0) return itineraries;
  const uics = [...new Set(trainLegs.map(leg => stationUicOf(leg.from?.stopId)!))];
  const byStation = new Map<string, SncfDeparture[]>();
  await Promise.all(uics.map(async uic => {
    const list = await getSncfDepartures(uic);
    if (list) byStation.set(uic, list);
  }));
  if (byStation.size === 0) return itineraries;

  for (const itinerary of itineraries) {
    const used = new Set<SncfDeparture>();
    itinerary.legs.forEach((leg, index) => {
      const uic = stationUicOf(leg.from?.stopId);
      if (leg.mode !== 'RAIL' || !uic || typeof leg.startTime !== 'number') return;
      const entries = byStation.get(uic);
      if (!entries) return;
      const match = closest(entries, used, leg.startTime, leg.headsign || leg.to?.name || '', leg.tripShortName?.trim() || null);
      if (!match) return;
      used.add(match);
      const delay = match.real - match.base;
      const shift = match.real - leg.startTime;
      leg.startTime = match.real;
      if (typeof leg.endTime === 'number') leg.endTime += shift;
      leg.realTime = leg.realTime || match.live;
      leg.departureDelay = Math.round(delay / 1000);
      const isLastTransit = !itinerary.legs.slice(index + 1).some(next => next.mode && next.mode !== 'WALK' && next.mode !== 'BICYCLE');
      if (isLastTransit && shift !== 0) {
        for (const next of itinerary.legs.slice(index + 1)) {
          if (typeof next.startTime === 'number') next.startTime += shift;
          if (typeof next.endTime === 'number') next.endTime += shift;
        }
        if (typeof itinerary.endTime === 'number') itinerary.endTime += shift;
        if (typeof itinerary.duration === 'number') itinerary.duration += Math.round(shift / 1000);
      }
    });
  }
  return itineraries;
}
