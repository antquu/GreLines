import { idbGet, idbSet } from './persistentCache';
import { dayKindOf, isOffline } from './offlineSchedule';

const ENDPOINT = 'https://data.mobilites-m.fr/api/ficheHoraires/json';

const TIMETABLE_TTL_MS = 60 * 60 * 1000;

const TRIPS_PER_DIRECTION = 40;

export interface TimetableStop {
  id: string;
  name: string;
  city?: string;
  times: Array<number | null>;
}

export interface TimetableDirection {

  key: string;

  headsign: string;
  stops: TimetableStop[];

  tripCount: number;
}

export interface Timetable {
  routeId: string;
  directions: TimetableDirection[];
}

interface RawStop {
  stopId?: string;
  name?: string;
  stopName?: string;
  city?: string;
  trips?: Array<number | string>;
}

interface RawDirection {
  arrets?: RawStop[];
  trips?: Array<{ tripId?: string }>;
}

export function formatTimetableTime(secondsFromMidnight: number): string {

  const total = Math.floor(secondsFromMidnight) % 86400;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function parseTimetable(routeId: string, payload: Record<string, RawDirection>): Timetable {
  const directions: TimetableDirection[] = [];

  for (const [key, raw] of Object.entries(payload)) {
    const rawStops = Array.isArray(raw?.arrets) ? raw.arrets : [];
    if (rawStops.length === 0) continue;

    const stops: TimetableStop[] = rawStops.map((stop, index) => ({
      id: String(stop.stopId ?? `${key}-${index}`),
      name: stop.name || stop.stopName || '',
      city: stop.city,
      times: Array.isArray(stop.trips)
        ? stop.trips.map(time => (typeof time === 'number' ? time : null))
        : [],
    }));

    directions.push({
      key,
      headsign: stops[stops.length - 1]?.name || '',
      stops,
      tripCount: Array.isArray(raw?.trips) ? raw.trips.length : 0,
    });
  }

  return { routeId, directions };
}

export async function getTimetable(
  routeId: string,
  options?: { signal?: AbortSignal },
): Promise<Timetable | null> {
  const hourSlot = Math.floor(Date.now() / TIMETABLE_TTL_MS) * TIMETABLE_TTL_MS;
  const cacheKey = `timetable_v2_${routeId}_${hourSlot}`;

  const cached = await idbGet<Timetable>(cacheKey);
  if (cached) return cached.value;
  if (isOffline()) return readOfflineTimetable(routeId);

  const params = new URLSearchParams({
    route: routeId,
    time: String(Date.now()),
    nbTrips: String(TRIPS_PER_DIRECTION),
  });

  try {
    const response = await fetch(`${ENDPOINT}?${params.toString()}`, { signal: options?.signal });
    if (!response.ok) return readOfflineTimetable(routeId);
    if (response.status === 204) return null;

    const payload = (await response.json()) as Record<string, RawDirection>;
    const timetable = parseTimetable(routeId, payload);
    if (timetable.directions.length === 0) return null;

    void idbSet(cacheKey, timetable, TIMETABLE_TTL_MS);
    return timetable;
  } catch {
    return readOfflineTimetable(routeId);
  }
}


const OFFLINE_TTL_MS = 45 * 24 * 60 * 60 * 1000;

function offlineKey(routeId: string, day: Date): string {
  return `timetable_offline_v1_${routeId}_${dayKindOf(day)}`;
}

export async function saveOfflineTimetable(
  routeId: string,
  day: Date,
  payload: Record<string, RawDirection>,
): Promise<void> {
  const timetable = parseTimetable(routeId, payload);
  if (timetable.directions.length === 0) return;
  await idbSet(offlineKey(routeId, day), timetable, OFFLINE_TTL_MS);
}

async function readOfflineTimetable(routeId: string): Promise<Timetable | null> {
  const stored = await idbGet<Timetable>(offlineKey(routeId, new Date()), { allowStale: true });
  return stored?.value ?? null;
}

export function toTimetableRouteId(lineId: string, network: string = 'SEM'): string {
  const raw = String(lineId).trim();
  if (/^[A-Z]{3}[:_]/.test(raw)) return raw.replace('_', ':');
  return `${network}:${raw}`;
}

export function lastDepartureSeconds(timetable: Timetable): Map<string, number> {
  const last = new Map<string, number>();
  for (const direction of timetable.directions) {
    let latest = -1;
    for (const stop of direction.stops) {
      for (const time of stop.times) {
        if (time !== null && time > latest) latest = time;
      }
    }
    if (latest >= 0) last.set(direction.headsign, latest);
  }
  return last;
}

export function isLastDeparture(
  timetable: Timetable | null,
  headsign: string,
  departureInMinutes: number,
  toleranceMinutes: number = 4,
): boolean {
  if (!timetable) return false;

  const target = headsign.toLowerCase();
  const direction = timetable.directions.find(item => {
    const name = item.headsign.toLowerCase();
    return name && (target.includes(name) || name.includes(target));
  });
  if (!direction) return false;

  let latest = -1;
  for (const stop of direction.stops) {
    for (const time of stop.times) {
      if (time !== null && time > latest) latest = time;
    }
  }
  if (latest < 0) return false;

  const now = new Date();
  const nowSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const departureSeconds = nowSeconds + departureInMinutes * 60;
  const normalizedLatest = latest < nowSeconds ? latest + 86400 : latest;

  return Math.abs(normalizedLatest - departureSeconds) <= toleranceMinutes * 60;
}
