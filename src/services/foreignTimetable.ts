import type { Departure } from '../types';
import type { Timetable, TimetableDirection } from './timetable';

const ficheBase = (network: string) =>
  network === 'TCL' ? '/data/tcl-fiches' : network && /^[A-Z0-9]+$/.test(network) ? `/data/networks/${network}/fiches` : null;

const ficheUrl = (network: string, code: string) =>
  network === 'SNC'
    ? `/api/sncf?ressource=fiche&ligne=${encodeURIComponent(code)}`
    : `${ficheBase(network)}/${encodeURIComponent(code)}.json`;

const splitLineId = (lineId: string) => {
  const raw = String(lineId);
  const at = raw.indexOf(':');
  return at === -1 ? { network: '', code: raw } : { network: raw.slice(0, at), code: raw.slice(at + 1) };
};

const ENDPOINT = 'https://api.transitous.org/api/v5/stoptimes';

const MAX_PAGES = 4;

type StopTime = {
  place: { name?: string; stopId?: string; departure?: string };
  headsign?: string;
  tripTo?: { name?: string };
  routeId?: string;
  routeShortName?: string;
  pickupDropoffType?: string;
};

const cache = new Map<string, Promise<Timetable | null>>();

export type Fiche = {
  firstDay: string;
  days: number;
  directions: Array<{
    headsign: string;
    stops: Array<{ id: string; name: string }>;
    trips: Array<{ d: number; t: Array<number | null>; i?: string }>;
  }>;
};

export function getForeignTimetable(lineId: string, stopId?: string | null, stopName?: string): Promise<Timetable | null> {
  const { network, code } = splitLineId(lineId);
  const stop = stopId ? splitLineId(stopId).code : '';
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  const key = `${lineId}|${stop}|${day.getTime()}`;
  if (!cache.has(key)) {
    const pending = loadFiche(lineId, day)
      .catch(() => null)
      .then(fiche => fiche ?? (network === 'TCL' && stop ? load(code, stop, day, stopName) : null))
      .catch(() => null);
    cache.set(key, pending);
    pending.then(result => { if (!result) cache.delete(key); });
  }
  return cache.get(key)!;
}

const fiches = new Map<string, Promise<Fiche | null>>();

export function getLineFiche(lineId: string): Promise<Fiche | null> {
  const { network, code } = splitLineId(lineId);
  if (network !== 'SNC' && !ficheBase(network)) return Promise.resolve(null);
  if (!fiches.has(lineId)) {
    const pending = fetch(ficheUrl(network, code))
      .then(response => (response.ok && (response.headers.get('content-type') ?? '').includes('json') ? response.json() as Promise<Fiche> : null))
      .catch(() => null);
    fiches.set(lineId, pending);
    pending.then(fiche => { if (!fiche) fiches.delete(lineId); });
  }
  return fiches.get(lineId)!;
}

async function loadFiche(lineId: string, day: Date): Promise<Timetable | null> {
  const { network } = splitLineId(lineId);
  const fiche = await getLineFiche(lineId);
  if (!fiche) return null;

  const first = new Date(+fiche.firstDay.slice(0, 4), +fiche.firstDay.slice(4, 6) - 1, +fiche.firstDay.slice(6, 8));
  const index = Math.round((day.getTime() - first.getTime()) / 86400000);
  if (index < 0 || index >= fiche.days) return null;
  const bit = 1 << index;

  const directions: TimetableDirection[] = fiche.directions
    .map((direction, i) => {
      const trips = direction.trips.filter(trip => trip.d & bit);
      return {
        key: `${i}-${direction.headsign}`,
        headsign: direction.headsign || direction.stops.at(-1)?.name || '',
        stops: direction.stops
          .map((stop, s) => ({
            id: `${network}:${stop.id}`,
            name: stop.name,
            times: trips.map(trip => (trip.t[s] === null ? null : trip.t[s]! * 60)),
          }))
          .filter(stop => stop.times.some(time => time !== null)),
        tripCount: trips.length,
      };
    })
    .filter(direction => direction.tripCount > 0);
  return directions.length > 0 ? { routeId: lineId, directions } : null;
}

async function load(code: string, stop: string, day: Date, stopName?: string): Promise<Timetable | null> {
  const end = day.getTime() + 24 * 3600 * 1000;
  const params = new URLSearchParams({
    stopId: `fr-lyon-tcl_${stop}`,
    time: day.toISOString(),
    n: '1000',
  });

  const rows: StopTime[] = [];
  let url = `${ENDPOINT}?${params.toString()}`;
  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await fetch(url);
    if (!response.ok) break;
    const data = await response.json() as { stopTimes?: StopTime[]; nextPageCursor?: string };
    const batch = data.stopTimes ?? [];
    rows.push(...batch);
    const last = batch.at(-1)?.place.departure;
    if (!data.nextPageCursor || batch.length === 0 || !last || new Date(last).getTime() >= end) break;
    params.set('pageCursor', data.nextPageCursor);
    url = `${ENDPOINT}?${params.toString()}`;
  }

  const byDirection = new Map<string, number[]>();
  for (const row of rows) {
    if (row.routeShortName !== code && row.routeId !== `fr-lyon-tcl_${code}`) continue;
    if (/NOT_ALLOWED/.test(row.pickupDropoffType ?? '')) continue;
    const departure = row.place.departure ? new Date(row.place.departure).getTime() : NaN;
    if (!Number.isFinite(departure) || departure < day.getTime() || departure >= end) continue;
    const headsign = row.headsign || row.tripTo?.name || '';
    const list = byDirection.get(headsign) ?? [];
    list.push(Math.round((departure - day.getTime()) / 1000));
    byDirection.set(headsign, list);
  }

  const name = stopName || rows[0]?.place.name || '';
  const directions: TimetableDirection[] = [...byDirection.entries()].map(([headsign, seconds]) => {
    const trips = [...new Set(seconds)].sort((a, b) => a - b);
    return {
      key: headsign,
      headsign,
      stops: [{ id: `TCL:${stop}`, name, times: trips }],
      tripCount: trips.length,
    };
  });
  if (directions.length === 0) return null;
  return { routeId: `TCL:${code}`, directions };
}

export async function nextDeparturesFromFiches(
  lines: Array<{ id: string; shortName?: string; name?: string; type?: Departure['type'] }>,
  names: Set<string>,
  perDirection = 2,
): Promise<{ date: Date; tomorrow: boolean; later: boolean; departures: Departure[] } | null> {
  const now = Date.now();
  const fiches = await Promise.all(lines.map(line => getLineFiche(line.id).then(fiche => ({ line, fiche }))));

  for (const offset of [0, 1, 2]) {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() + offset);
    const departures: Departure[] = [];
    for (const { line, fiche } of fiches) {
      if (!fiche) continue;
      const first = new Date(+fiche.firstDay.slice(0, 4), +fiche.firstDay.slice(4, 6) - 1, +fiche.firstDay.slice(6, 8));
      const index = Math.round((day.getTime() - first.getTime()) / 86400000);
      if (index < 0 || index >= fiche.days) continue;
      const bit = 1 << index;
      for (const direction of fiche.directions) {
        const at = direction.stops.findIndex(stop => names.has(stop.name));
        if (at === -1 || at === direction.stops.length - 1) continue;
        const times = direction.trips
          .filter(trip => trip.d & bit && trip.t[at] !== null)
          .map(trip => day.getTime() + trip.t[at]! * 60_000)
          .filter(time => time > now)
          .sort((a, b) => a - b)
          .slice(0, perDirection);
        for (const time of times) {
          departures.push({
            lineId: line.id,
            routeId: line.id,
            lineName: line.name ?? '',
            lineShortName: line.shortName,
            destination: direction.headsign || direction.stops[direction.stops.length - 1].name,
            departureTime: Math.max(0, Math.round((time - now) / 60_000)),
            at: time,
            realtime: false,
            theoretical: true,
            type: line.type ?? 'BUS',
          });
        }
      }
    }
    if (departures.length > 0) {
      departures.sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
      return { date: day, tomorrow: offset > 0, later: offset === 0, departures };
    }
  }
  return null;
}
