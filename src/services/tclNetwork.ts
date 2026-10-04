import { tclSolidStyle } from '../utils/tclLogos';
import { idbGet, idbSet } from './persistentCache';
import { groupNearbyStopsByName } from './api';
import type { Departure, Line, Stop, StopDetail } from '../types';

const ENDPOINT = '/api/tcl';

const CATALOG_TTL_MS = 24 * 60 * 60 * 1000;

const SHAPE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const TCL_NETWORK = 'TCL';

interface RawLine {
  code: string;
  color: string | null;
  mode: 'BUS' | 'TRAM' | 'RAIL';
  terminuses: string[];
  stopCount: number;

  hasShape: boolean;
  school: boolean;
}

interface RawStop {
  id: string;
  name: string;
  lat: number;
  lon: number;
  city: string;
  lines: string[];
}

export interface TclLine extends Line {

  stopCount: number;
  hasShape: boolean;
  school: boolean;
}

export interface TclShape {
  code: string;
  segments: Array<Array<[number, number]>>;
}

const memory = new Map<string, Promise<unknown>>();

async function fetchResource<T>(query: string, cacheKey: string, ttl: number): Promise<T | null> {
  const inflight = memory.get(cacheKey);
  if (inflight) return inflight as Promise<T | null>;

  const download = async (): Promise<T | null> => {
    try {
      const response = await fetch(`${ENDPOINT}?${query}`);
      if (!response.ok) return null;
      const payload = (await response.json()) as T;
      void idbSet(cacheKey, payload, ttl);
      return payload;
    } catch {
      return null;
    }
  };

  const work = (async (): Promise<T | null> => {
    const cached = await idbGet<T>(cacheKey, { allowStale: true });
    if (cached?.value && !cached.stale) return cached.value;
    if (cached?.value) {
      void download();
      return cached.value;
    }
    return download();
  })();

  memory.set(cacheKey, work);
  void work.then(value => { if (value === null) memory.delete(cacheKey); });
  return work;
}

export const tclLineId = (code: string) => `${TCL_NETWORK}:${code}`;
export const tclStopId = (id: string) => `${TCL_NETWORK}:${id}`;

function readableTextColor(hex: string | null): string {
  if (!hex || hex.length !== 7) return '#ffffff';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.6 ? '#111827' : '#ffffff';
}

function terminusPair(terminuses: string[]): string | null {
  const distinct: string[] = [];
  const seen = new Set<string>();
  for (const raw of terminuses) {
    const label = raw.replace(/[.\s]+$/, '').trim();
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    distinct.push(label);
  }
  return distinct.length >= 2 ? `${distinct[0]} ↔ ${distinct[1]}` : null;
}

export async function getTclLines(options?: { includeSchool?: boolean }): Promise<TclLine[]> {
  const raw = await fetchResource<RawLine[]>('ressource=lignes', 'tclLines_v2', CATALOG_TTL_MS);
  if (!raw) return [];

  const kept = options?.includeSchool ? raw : raw.filter(line => !line.school);

  return kept.map(line => ({
    id: tclLineId(line.code),
    routeId: tclLineId(line.code),
    name: terminusPair(line.terminuses) ?? line.code,
    shortName: line.code,
    type: line.mode,
    color: tclSolidStyle(tclLineId(line.code))?.backgroundColor ?? line.color ?? undefined,
    textColor: tclSolidStyle(tclLineId(line.code))?.color ?? readableTextColor(line.color),
    stopCount: line.stopCount,
    hasShape: line.hasShape,
    school: line.school,
  }));
}

const stopMembers = new Map<string, string[]>();
const stopLines = new Map<string, string[]>();

export async function getTclStops(): Promise<Stop[]> {
  const raw = await fetchResource<RawStop[]>('ressource=arrets', 'tclStops_v1', CATALOG_TTL_MS);
  if (!raw) return [];

  const stops: Stop[] = raw.map(stop => ({
    id: tclStopId(stop.id),
    name: stop.name,
    lat: stop.lat,
    lon: stop.lon,
    city: stop.city,
  }));

  const byId = new Map(raw.map(stop => [tclStopId(stop.id), stop]));
  const groups = groupNearbyStopsByName(stops);

  stopMembers.clear();
  stopLines.clear();

  for (const group of groups) {
    const representative = group[0].id;
    stopMembers.set(representative, group.map(member => localTclId(member.id)));

    const lines = new Set<string>();
    for (const member of group) {
      for (const code of byId.get(member.id)?.lines ?? []) lines.add(code);
    }
    stopLines.set(representative, [...lines]);
  }

  void import('./stopAccessibility').then(module =>
    module.registerTclStopGroups(groups.map(group => group.map(member => member.id))));

  return groups.map(group => group[0]);
}

const localTclId = (id: string) => (id.startsWith(`${TCL_NETWORK}:`) ? id.slice(4) : id);

export const isTclId = (id: string) => String(id).startsWith(`${TCL_NETWORK}:`);

let catalogByCode: Map<string, TclLine> | null = null;

async function linesByCode(): Promise<Map<string, TclLine>> {
  if (catalogByCode) return catalogByCode;
  const catalog = await getTclLines({ includeSchool: true });
  catalogByCode = new Map(catalog.map(line => [line.shortName ?? '', line]));
  return catalogByCode;
}

export async function getTclLinesForStop(stopId: string): Promise<Line[]> {
  if (stopLines.size === 0) await getTclStops();

  const codes = stopLines.get(stopId);
  if (!codes || codes.length === 0) return [];

  const byCode = await linesByCode();
  return codes
    .map(code => byCode.get(code))
    .filter((line): line is TclLine => Boolean(line));
}

export async function getTclStopDetail(stopId: string): Promise<StopDetail | null> {
  const { withTrainsNearby } = await import('./sncfNetwork');
  return withTrainsNearby(await loadTclStopDetail(stopId));
}

async function loadTclStopDetail(stopId: string): Promise<StopDetail | null> {
  if (stopMembers.size === 0) await getTclStops();

  const stops = await getTclStops();
  const stop = stops.find(candidate => candidate.id === stopId);
  if (!stop) return null;

  const members = stopMembers.get(stopId) ?? [localTclId(stopId)];
  const passages = fetch(`${ENDPOINT}?ressource=passages&arret=${members.join(',')}`).catch(() => null);
  const byCode = await linesByCode();
  const { withForeignTraffic } = await import('./foreignTraffic');
  const served = await withForeignTraffic(await getTclLinesForStop(stopId));

  let departures: Departure[] = [];
  try {
    const raw = await passages;
    if (!raw) throw new Error('passages');
    if (raw.ok) {
      const rows = (await raw.json()) as Array<{
        line: string; destination: string; minutes: number; realtime: boolean;
      }>;
      departures = rows.map(row => {
        const line = byCode.get(row.line);
        return {
          lineId: tclLineId(row.line),
          lineName: line?.name ?? row.line,
          lineShortName: row.line,
          destination: row.destination,
          departureTime: row.minutes,
          realtime: row.realtime,
          type: line?.type ?? 'BUS',
        };
      });
    }
  } catch {
  }

  return { ...stop, lines: served, departures, lastUpdate: new Date() };
}

export async function getTclShape(lineCode: string): Promise<TclShape | null> {
  const code = lineCode.startsWith(`${TCL_NETWORK}:`) ? lineCode.slice(4) : lineCode;
  return fetchResource<TclShape>(
    `ressource=trace&ligne=${encodeURIComponent(code)}`,
    `tclShape_v1_${code}`,
    SHAPE_TTL_MS,
  );
}

export async function getTclLineGeometries(
  lines: Array<{ id: string; shortName?: string }>,
): Promise<Array<{ code: string; geojson: GeoJSON.FeatureCollection }>> {
  const codes = [...new Set(
    lines.filter(line => isTclId(line.id)).map(line => line.shortName || localTclId(line.id)),
  )];
  if (codes.length === 0) return [];

  const catalog = await getTclLines({ includeSchool: true });
  const colorByCode = new Map(catalog.map(line => [line.shortName ?? '', line.color]));

  const shapes = await Promise.all(codes.map(code => getTclShape(code)));

  return shapes
    .filter((shape): shape is TclShape => Boolean(shape) && shape!.segments.length > 0)
    .map(shape => ({
      code: shape.code,
      geojson: {
        type: 'FeatureCollection' as const,
        features: shape.segments.map(segment => ({
          type: 'Feature' as const,
          properties: { color: colorByCode.get(shape.code) ?? '#3b82f6' },
          geometry: { type: 'LineString' as const, coordinates: segment },
        })),
      },
    }));
}

export async function getTclStopsServedByLines(
  lines: Array<{ id: string; shortName?: string }>,
): Promise<Array<{ lat: number; lon: number; name: string }>> {
  const codes = new Set(
    lines.filter(line => isTclId(line.id)).map(line => line.shortName || localTclId(line.id)),
  );
  if (codes.size === 0) return [];

  const stops = await getTclStops();
  if (stopLines.size === 0) return [];

  const served: Array<{ lat: number; lon: number; name: string }> = [];
  for (const stop of stops) {
    const stopCodes = stopLines.get(stop.id);
    if (!stopCodes) continue;
    if (stopCodes.some(code => codes.has(code))) {
      served.push({ lat: stop.lat, lon: stop.lon, name: stop.name });
    }
  }
  return served;
}
