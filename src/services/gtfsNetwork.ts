import type { Departure, Line, Stop, StopDetail } from '../types';
import networkConfigs from '../data/gtfsNetworks.json';
import { decodeTripUpdates, type RealtimeTrip } from './gtfsRealtime';
import { getLineFiche } from './foreignTimetable';

export interface GtfsNetworkConfig {
  code: string;
  label: string;
  city: string;
  center: [number, number];
  gtfs: string;
  tripUpdates?: string;
  alerts?: string;
  alertsFromStanSite?: boolean;
  shortNames?: Record<string, string>;
}

export const GTFS_NETWORKS = networkConfigs as GtfsNetworkConfig[];
const CONFIG_BY_CODE = new Map(GTFS_NETWORKS.map(config => [config.code, config]));

const BASE = '/data/networks';

const REALTIME_TTL_MS = 20_000;

const HORIZON_MS = 2 * 60 * 60 * 1000;

const REALTIME_OVERLAP_MS = 4 * 60 * 1000;

interface RawLine {
  id: string;
  short: string;
  name: string;
  mode: Line['type'];
  color: string;
  textColor: string;
}

interface RawStop {
  id: string;
  name: string;
  lat: number;
  lon: number;
  members: string[];
  names: string[];
  lines: string[];
}

interface Network {
  code: string;
  lines: RawLine[];
  stops: RawStop[];
  accessible: string[];
}

export function gtfsNetworkOf(id: string | null | undefined): GtfsNetworkConfig | null {
  const raw = String(id ?? '');
  const at = raw.indexOf(':');
  return at > 0 ? CONFIG_BY_CODE.get(raw.slice(0, at)) ?? null : null;
}

export const isGtfsNetworkId = (id: string | null | undefined) => gtfsNetworkOf(id) !== null;

const local = (id: string) => {
  const raw = String(id);
  return isGtfsNetworkId(raw) ? raw.slice(raw.indexOf(':') + 1) : raw;
};
const prefixed = (code: string, id: string) => `${code}:${id}`;

const lineById = new Map<string, RawLine>();
const stopById = new Map<string, RawStop>();
const stationOfPlatform = new Map<string, RawStop>();
const stationNameOfPlatformName = new Map<string, string>();
const networks = new Map<string, Promise<Network | null>>();

function loadNetwork(code: string): Promise<Network | null> {
  if (!networks.has(code)) {
    const pending = fetch(`${BASE}/${encodeURIComponent(code)}/network.json`)
      .then(response => (response.ok && (response.headers.get('content-type') ?? '').includes('json') ? response.json() as Promise<Network> : null))
      .then(network => {
        if (!network) return null;
        for (const line of network.lines) lineById.set(prefixed(code, line.id), line);
        for (const stop of network.stops) {
          stopById.set(prefixed(code, stop.id), stop);
          for (const member of stop.members) stationOfPlatform.set(prefixed(code, member), stop);
          for (const name of stop.names) stationNameOfPlatformName.set(prefixed(code, name), stop.name);
        }
        if (network.accessible?.length) {
          void import('./stopAccessibility').then(module =>
            module.registerAccessibleIds(network.accessible.map(id => prefixed(code, id))));
        }
        return network;
      })
      .catch(() => null);
    networks.set(code, pending);
    void pending.then(network => { if (!network) networks.delete(code); });
  }
  return networks.get(code)!;
}

export function gtfsLineStyle(lineId: string): { backgroundColor: string; color: string } | null {
  const line = lineById.get(String(lineId));
  return line ? { backgroundColor: line.color, color: line.textColor } : null;
}

export function gtfsShortName(lineId: string): string {
  return lineById.get(String(lineId))?.short ?? local(lineId);
}

export function gtfsLineMode(lineId: string): Line['type'] | null {
  return lineById.get(String(lineId))?.mode ?? null;
}

export async function gtfsLineIdForName(code: string, name: string): Promise<string | null> {
  const network = await loadNetwork(code);
  if (!network) return null;
  const wanted = name.trim().toLowerCase();
  const aliases = Object.fromEntries(
    Object.entries(CONFIG_BY_CODE.get(code)?.shortNames ?? {}).map(([raw, short]) => [raw.toLowerCase(), short.toLowerCase()]),
  );
  const target = aliases[wanted] ?? wanted;
  const line = network.lines.find(item => item.short.toLowerCase() === target);
  return line ? prefixed(code, line.id) : null;
}

const toLine = (code: string, line: RawLine): Line => ({
  id: prefixed(code, line.id),
  routeId: prefixed(code, line.id),
  name: line.name,
  shortName: line.short,
  type: line.mode ?? 'BUS',
  color: line.color,
  textColor: line.textColor,
});

export async function getGtfsLines(code: string): Promise<Line[]> {
  const network = await loadNetwork(code);
  return network ? network.lines.map(line => toLine(code, line)) : [];
}

export async function getGtfsStops(code: string): Promise<Stop[]> {
  const network = await loadNetwork(code);
  if (!network) return [];
  const city = CONFIG_BY_CODE.get(code)?.city;
  return network.stops.map(stop => ({ id: prefixed(code, stop.id), name: stop.name, lat: stop.lat, lon: stop.lon, city }));
}

export async function getGtfsLinesForStop(stopId: string): Promise<Line[]> {
  const config = gtfsNetworkOf(stopId);
  if (!config) return [];
  await loadNetwork(config.code);
  const stop = stopById.get(String(stopId));
  if (!stop) return [];
  return stop.lines
    .map(id => lineById.get(prefixed(config.code, id)))
    .filter((line): line is RawLine => Boolean(line))
    .map(line => toLine(config.code, line));
}

const linesForStopCache = new Map<string, Line[]>();

export function getGtfsLinesForStopSync(stopId: string): Line[] | null {
  const key = String(stopId);
  const cached = linesForStopCache.get(key);
  if (cached) return cached;
  const config = gtfsNetworkOf(key);
  const stop = config ? stopById.get(key) : undefined;
  if (!config || !stop) return null;
  const lines = stop.lines
    .map(id => lineById.get(prefixed(config.code, id)))
    .filter((line): line is RawLine => Boolean(line))
    .map(line => toLine(config.code, line));
  linesForStopCache.set(key, lines);
  return lines;
}

const realtime = new Map<string, { at: number; trips: Promise<RealtimeTrip[]> }>();

function loadRealtime(config: GtfsNetworkConfig): Promise<RealtimeTrip[]> {
  if (!config.tripUpdates) return Promise.resolve([]);
  const cached = realtime.get(config.code);
  if (cached && Date.now() - cached.at < REALTIME_TTL_MS) return cached.trips;
  const trips = fetch(`/api/gtfsrt?reseau=${encodeURIComponent(config.code)}&flux=passages`)
    .then(response => (response.ok ? response.arrayBuffer() : null))
    .then(buffer => (buffer && buffer.byteLength > 0 ? decodeTripUpdates(buffer) : []))
    .catch(() => [] as RealtimeTrip[]);
  realtime.set(config.code, { at: Date.now(), trips });
  return trips;
}

export async function getGtfsStopDetail(stopId: string): Promise<StopDetail | null> {
  const config = gtfsNetworkOf(stopId);
  if (!config) return null;
  const code = config.code;
  const network = await loadNetwork(code);
  const stop = stopById.get(String(stopId));
  if (!network || !stop) return null;

  const { withForeignTraffic } = await import('./foreignTraffic');
  const [lines, trips] = await Promise.all([
    getGtfsLinesForStop(stopId).then(withForeignTraffic),
    loadRealtime(config),
  ]);

  const now = Date.now();
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const members = new Set(stop.members);
  const names = new Set(stop.names.concat(stop.name));

  type Planned = { lineId: string; destination: string; time: number; tripId?: string };
  const planned: Planned[] = [];
  const scheduleOfTrip = new Map<string, Planned>();
  await Promise.all(stop.lines.map(async id => {
    const fiche = await getLineFiche(prefixed(code, id));
    if (!fiche) return;
    const first = new Date(+fiche.firstDay.slice(0, 4), +fiche.firstDay.slice(4, 6) - 1, +fiche.firstDay.slice(6, 8));
    const index = Math.round((midnight.getTime() - first.getTime()) / 86400000);
    if (index < 0 || index >= fiche.days) return;
    const bit = 1 << index;
    for (const direction of fiche.directions) {
      const at = direction.stops.findIndex(item => names.has(item.name));
      if (at === -1 || at === direction.stops.length - 1) continue;
      const lastStop = direction.stops[direction.stops.length - 1].name;
      const destination = stationNameOfPlatformName.get(prefixed(code, lastStop)) ?? direction.headsign;
      for (const trip of direction.trips) {
        const minutes = trip.t[at];
        if (!(trip.d & bit) || minutes === null) continue;
        const entry = { lineId: id, destination, time: midnight.getTime() + minutes * 60_000, tripId: trip.i };
        planned.push(entry);
        if (trip.i) scheduleOfTrip.set(trip.i, entry);
      }
    }
  }));

  const departures: Departure[] = [];
  const liveTrips = new Set<string>();
  const realtimeUntil = new Map<string, number>();

  for (const trip of trips) {
    if (trip.canceled) continue;
    const at = trip.stops.findIndex(item => members.has(item.stopId));
    if (at === -1 || at === trip.stops.length - 1) continue;
    const passage = trip.stops[at];
    if (passage.skipped) continue;
    const schedule = scheduleOfTrip.get(trip.tripId);
    const time = passage.time ?? (schedule && passage.delay !== null ? schedule.time + passage.delay * 1000 : null);
    if (!time || time < now - 30_000) continue;
    const lineKey = trip.routeId || schedule?.lineId || '';
    const line = lineById.get(prefixed(code, lineKey));
    if (!line) continue;
    const terminus = stationOfPlatform.get(prefixed(code, trip.stops[trip.stops.length - 1].stopId))?.name
      ?? schedule?.destination ?? '';
    departures.push(departure(code, line, terminus, time, now, true));
    liveTrips.add(trip.tripId);
    realtimeUntil.set(line.id, Math.max(realtimeUntil.get(line.id) ?? 0, time));
  }

  for (const entry of planned) {
    if (entry.time < now || entry.time > now + HORIZON_MS) continue;
    if (entry.tripId && liveTrips.has(entry.tripId)) continue;
    if (!entry.tripId && entry.time <= (realtimeUntil.get(entry.lineId) ?? 0) + REALTIME_OVERLAP_MS) continue;
    const line = lineById.get(prefixed(code, entry.lineId));
    if (!line) continue;
    departures.push({ ...departure(code, line, entry.destination, entry.time, now, false), theoretical: true });
  }

  departures.sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  return {
    id: prefixed(code, stop.id),
    name: stop.name,
    lat: stop.lat,
    lon: stop.lon,
    city: config.city,
    lines,
    departures,
    lastUpdate: new Date(),
  };
}

function departure(code: string, line: RawLine, destination: string, time: number, now: number, live: boolean): Departure {
  return {
    lineId: prefixed(code, line.id),
    routeId: prefixed(code, line.id),
    lineName: line.name,
    lineShortName: line.short,
    destination,
    departureTime: Math.max(0, Math.round((time - now) / 60_000)),
    at: time,
    realtime: live,
    type: line.mode ?? 'BUS',
  };
}

export async function getGtfsLineGeometries(
  lines: Array<{ id: string }>,
): Promise<Array<{ code: string; geojson: GeoJSON.FeatureCollection }>> {
  const wanted = lines.filter(line => isGtfsNetworkId(line.id));
  const shapes = await Promise.all(wanted.map(async line => {
    const config = gtfsNetworkOf(line.id)!;
    await loadNetwork(config.code);
    const id = local(line.id);
    const response = await fetch(`${BASE}/${encodeURIComponent(config.code)}/shapes/${encodeURIComponent(id)}.json`).catch(() => null);
    if (!response?.ok || !(response.headers.get('content-type') ?? '').includes('json')) return null;
    const shape = await response.json() as { code: string; segments: Array<Array<[number, number]>> };
    const color = lineById.get(String(line.id))?.color ?? '#6B7280';
    return {
      code: String(line.id),
      geojson: {
        type: 'FeatureCollection' as const,
        features: shape.segments.map(segment => ({
          type: 'Feature' as const,
          properties: { color },
          geometry: { type: 'LineString' as const, coordinates: segment },
        })),
      },
    };
  }));
  return shapes.filter((shape): shape is NonNullable<typeof shape> => shape !== null);
}

export async function getGtfsStopsServedByLines(
  lines: Array<{ id: string }>,
): Promise<Array<{ lat: number; lon: number; name: string }>> {
  const byNetwork = new Map<string, Set<string>>();
  for (const line of lines) {
    const config = gtfsNetworkOf(line.id);
    if (!config) continue;
    if (!byNetwork.has(config.code)) byNetwork.set(config.code, new Set());
    byNetwork.get(config.code)!.add(local(line.id));
  }
  const served: Array<{ lat: number; lon: number; name: string }> = [];
  for (const [code, ids] of byNetwork) {
    const network = await loadNetwork(code);
    for (const stop of network?.stops ?? []) {
      if (stop.lines.some(id => ids.has(id))) served.push({ lat: stop.lat, lon: stop.lon, name: stop.name });
    }
  }
  return served;
}

let agencyIndex: Promise<Map<string, string>> | null = null;

export function gtfsNetworkOfAgency(): Promise<Map<string, string>> {
  agencyIndex ??= fetch(`${BASE}/index.json`)
    .then(response => (response.ok && (response.headers.get('content-type') ?? '').includes('json') ? response.json() : {}))
    .then((index: Record<string, { agencies?: string[] }>) => {
      const map = new Map<string, string>();
      for (const [code, entry] of Object.entries(index)) {
        if (!CONFIG_BY_CODE.has(code)) continue;
        for (const agency of entry.agencies ?? []) map.set(agency.trim().toLowerCase(), code);
      }
      return map;
    })
    .catch(() => new Map<string, string>());
  return agencyIndex;
}

export const preloadGtfsNetwork = (code: string) => loadNetwork(code);

export function gtfsLineIdForShort(code: string, short: string): string | null {
  const wanted = short.trim().toLowerCase();
  for (const [id, line] of lineById) {
    if (id.startsWith(`${code}:`) && line.short.toLowerCase() === wanted) return id;
  }
  return null;
}

export async function gtfsStationNames(stopId: string): Promise<Set<string>> {
  const config = gtfsNetworkOf(stopId);
  if (!config) return new Set();
  await loadNetwork(config.code);
  const stop = stopById.get(String(stopId));
  return new Set(stop ? stop.names.concat(stop.name) : []);
}
