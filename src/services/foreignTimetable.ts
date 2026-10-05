import type { Departure } from '../types';
import type { Timetable, TimetableDirection } from './timetable';
import { idbGet, idbSet } from './persistentCache';

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

const SNCF_FICHE_KEY = 'sncfFiche_v1_';
const SNCF_FICHE_TTL_MS = 3 * 24 * 60 * 60 * 1000;

const downloadFiche = (network: string, code: string): Promise<Fiche | null> =>
  fetch(ficheUrl(network, code))
    .then(response => (response.ok && (response.headers.get('content-type') ?? '').includes('json') ? response.json() as Promise<Fiche> : null))
    .catch(() => null);

async function loadSncfFiche(code: string): Promise<Fiche | null> {
  const key = `${SNCF_FICHE_KEY}${code}`;
  const fresh = await downloadFiche('SNC', code);
  if (fresh) {
    void idbSet(key, fresh, SNCF_FICHE_TTL_MS).catch(() => {});
    return fresh;
  }
  const stored = await idbGet<Fiche>(key, { allowStale: true }).catch(() => null);
  return stored?.value ?? null;
}

export async function keepSncfFicheOffline(lineId: string): Promise<void> {
  const { network, code } = splitLineId(lineId);
  if (network !== 'SNC') return;
  const stored = await idbGet<Fiche>(`${SNCF_FICHE_KEY}${code}`).catch(() => null);
  if (!stored) await getLineFiche(lineId);
}

export function getLineFiche(lineId: string): Promise<Fiche | null> {
  const { network, code } = splitLineId(lineId);
  if (network !== 'SNC' && !ficheBase(network)) return Promise.resolve(null);
  if (!fiches.has(lineId)) {
    const pending = network === 'SNC' ? loadSncfFiche(code) : downloadFiche(network, code);
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
  if (network === 'SNC') return trainDirections(lineId, fiche, bit);

  const directions: TimetableDirection[] = fiche.directions
    .map((direction, i) => {
      const trips = direction.trips.filter(trip => trip.d & bit);
      const ends = trips.map(trip => {
        const last = trip.t.reduce<number>((found, time, s) => (typeof time === 'number' ? s : found), -1);
        return direction.stops[last]?.name ?? '';
      });
      const counts = new Map<string, number>();
      for (const end of ends) if (end) counts.set(end, (counts.get(end) ?? 0) + 1);
      const several = counts.size > 1;
      const main = several ? [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0] : null;
      return {
        key: `${i}-${direction.headsign}`,
        headsign: main ?? (direction.headsign || direction.stops.at(-1)?.name || ''),
        ...(several ? { trips: ends.map(destination => ({ destination })), destinations: [...counts.keys()] } : {}),
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

type TrainCall = { id: string; name: string; at: number };
type TrainRun = { calls: TrainCall[]; label: string };

export function trainDirections(lineId: string, fiche: Fiche, bit: number): Timetable | null {
  const seen = new Set<string>();
  const runs: TrainRun[] = [];
  for (const direction of fiche.directions) {
    for (const trip of direction.trips) {
      if (!(trip.d & bit)) continue;
      const calls = direction.stops
        .flatMap((stop, s) => {
          const at = trip.t[s];
          return typeof at === 'number' ? [{ id: stop.id, name: stop.name, at }] : [];
        })
        .sort((a, b) => a.at - b.at);
      if (calls.length < 2) continue;
      const key = `${trip.i ?? ''}|${calls.map(call => `${call.id}@${call.at}`).join(',')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      runs.push({ calls, label: trip.i ?? '' });
    }
  }
  if (runs.length === 0) return null;

  const axis = runs.reduce((best, run) => (run.calls.length > best.calls.length ? run : best)).calls.map(call => call.id);
  const axisPosition = new Map(axis.map((id, position) => [id, position]));
  const forward: TrainRun[] = [];
  const backward: TrainRun[] = [];
  for (const run of runs) {
    const known = run.calls.filter(call => axisPosition.has(call.id)).map(call => axisPosition.get(call.id)!);
    let isForward = true;
    if (known.length >= 2) {
      isForward = known[known.length - 1] > known[0];
    } else if (known.length === 1) {
      const early = known[0] < (axis.length - 1) / 2;
      isForward = axisPosition.has(run.calls[0].id) ? early : !early;
    }
    (isForward ? forward : backward).push(run);
  }

  const directions = [trainDirection(forward, '0'), trainDirection(backward, '1')]
    .filter((direction): direction is TimetableDirection => direction !== null);
  return directions.length > 0 ? { routeId: lineId, directions } : null;
}

function trainDirection(runs: TrainRun[], key: string): TimetableDirection | null {
  if (runs.length === 0) return null;
  const longest = runs.reduce((best, run) => (run.calls.length > best.calls.length ? run : best));
  const progress = new Map(longest.calls.map(call => [call.id, call.at - longest.calls[0].at]));

  for (let pass = 0; pass < 4; pass += 1) {
    const samples = new Map<string, number[]>();
    for (const run of runs) {
      const anchor = run.calls.find(call => progress.has(call.id));
      if (!anchor) continue;
      const offset = progress.get(anchor.id)! - anchor.at;
      for (const call of run.calls) {
        if (progress.has(call.id)) continue;
        samples.set(call.id, [...(samples.get(call.id) ?? []), call.at + offset]);
      }
    }
    if (samples.size === 0) break;
    for (const [id, values] of samples) progress.set(id, values.reduce((sum, value) => sum + value, 0) / values.length);
  }
  for (const run of runs) {
    for (const call of run.calls) if (!progress.has(call.id)) progress.set(call.id, call.at - run.calls[0].at);
  }

  const names = new Map(runs.flatMap(run => run.calls.map(call => [call.id, call.name] as const)));
  const order = [...progress.keys()].sort((a, b) => progress.get(a)! - progress.get(b)!);
  const startOf = (run: TrainRun) => run.calls[0].at - progress.get(run.calls[0].id)!;
  const sorted = [...runs].sort((a, b) => startOf(a) - startOf(b));

  const counts = new Map<string, number>();
  for (const run of sorted) {
    const destination = run.calls[run.calls.length - 1].name;
    counts.set(destination, (counts.get(destination) ?? 0) + 1);
  }
  const headsign = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];

  return {
    key: `${key}-${headsign}`,
    headsign,
    stops: order.map(id => ({
      id: `SNC:${id}`,
      name: names.get(id) ?? '',
      times: sorted.map(run => {
        const call = run.calls.find(item => item.id === id);
        return call ? call.at * 60 : null;
      }),
    })),
    tripCount: sorted.length,
    trips: sorted.map(run => ({ destination: run.calls[run.calls.length - 1].name, label: run.label || undefined })),
    destinations: [...counts.keys()],
  };
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
