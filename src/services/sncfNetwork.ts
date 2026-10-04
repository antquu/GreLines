import type { Departure, Line, Stop, StopDetail, TrafficDetail } from '../types';
import { SNCF_TER_COLOR } from '../utils/lineColors';
import { haversineMeters } from '../utils/geo';
import { idbGet, idbSet } from './persistentCache';
import { rerLine } from '../utils/rer';
import { appLanguage } from '../utils/appLanguage';

export interface SncfLineEntry {
  id: string;
  code: string;
  name: string;
  brand: string;
  coach: boolean;
  color: string | null;
}

export interface SncfStationEntry {
  uic: string;
  name: string;
  city: string | null;
  lat: number;
  lon: number;
  lines: string[];
  also?: string[];
}

interface SncfCatalog {
  builtAt: string;
  lines: SncfLineEntry[];
  stations: SncfStationEntry[];
}

interface SncfPassage {
  train: string;
  direction: string;
  line: string;
  code?: string;
  coach: boolean;
  base: number;
  real: number;
  live: boolean;
  alert?: { effect: string; text: string; end: number | null } | null;
}

const STORAGE_KEY = 'greLines_sncfCatalog_v3';
const TRACE_KEY = 'sncfTrace_v2_';
const CATALOG_TTL_MS = 12 * 60 * 60 * 1000;
const PASSAGES_TTL_MS = 30_000;

export const SNCF_PREFIX = 'SNC:';
export const sncfStopId = (uic: string) => `${SNCF_PREFIX}OCE${uic}`;
export const sncfLineId = (code: string) => `${SNCF_PREFIX}${code}`;
export const isSncfStopId = (id: string | null | undefined) => /^SNC:OCE87\d{6}$/.test(String(id ?? ''));
const uicOfStop = (id: string) => /(87\d{6})/.exec(id)?.[1] ?? null;

let catalog: Promise<SncfCatalog | null> | null = null;
const lineColors = new Map<string, string>();

function rememberColors(data: SncfCatalog | null) {
  for (const entry of data?.lines ?? []) if (entry.color) lineColors.set(entry.id, entry.color);
}

const readableText = (hex: string) => {
  const value = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(offset => parseInt(value.slice(offset, offset + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? '#25303B' : '#FFFFFF';
};

export function sncfLineStyle(id: string): { backgroundColor: string; color: string } {
  const rer = rerLine(id);
  if (rer) return rer.style;
  const color = lineColors.get(String(id).replace(SNCF_PREFIX, ''));
  return color ? { backgroundColor: color, color: readableText(color) } : { backgroundColor: SNCF_TER_COLOR, color: '#FFFFFF' };
}
const passages = new Map<string, { at: number; value: Promise<SncfPassage[] | null> }>();

function readStored(): SncfCatalog | null {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as SncfCatalog | null;
    rememberColors(stored);
    if (stored && Date.now() - Date.parse(stored.builtAt) < CATALOG_TTL_MS * 2) return stored;
  } catch {
  }
  return null;
}

export function loadSncfCatalog(): Promise<SncfCatalog | null> {
  if (!catalog) {
    const stored = readStored();
    catalog = fetch('/api/sncf?ressource=reseau')
      .then(response => (response.ok ? (response.json() as Promise<SncfCatalog>) : null))
      .then(fresh => {
        rememberColors(fresh);
        if (fresh?.stations) {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
          } catch {
          }
          return fresh;
        }
        return stored;
      })
      .catch(() => stored);
    void catalog.then(result => {
      if (!result) catalog = null;
    });
  }
  return catalog;
}

const lineType = (entry: SncfLineEntry | undefined): Line['type'] => (entry?.coach ? 'BUS' : 'RAIL');

function toLine(entry: SncfLineEntry): Line {
  const style = sncfLineStyle(sncfLineId(entry.id));
  return {
    id: sncfLineId(entry.id),
    routeId: sncfLineId(entry.id),
    shortName: entry.code,
    name: entry.name,
    type: lineType(entry),
    color: style.backgroundColor.replace('#', ''),
    textColor: style.color.replace('#', ''),
    hasTraffic: false,
    trafficDetails: [],
  };
}

export async function getSncfLines(): Promise<Line[]> {
  const data = await loadSncfCatalog();
  return (data?.lines ?? []).map(toLine);
}

export async function getSncfStops(): Promise<Stop[]> {
  const data = await loadSncfCatalog();
  return (data?.stations ?? []).map(station => ({
    id: sncfStopId(station.uic),
    name: station.name,
    lat: station.lat,
    lon: station.lon,
    city: station.city ?? undefined,
  }));
}

export async function sncfStopsOfLine(lineId: string): Promise<Stop[]> {
  const code = lineId.replace(SNCF_PREFIX, '');
  const data = await loadSncfCatalog();
  return (data?.stations ?? [])
    .filter(station => station.lines.includes(code))
    .map(station => ({ id: sncfStopId(station.uic), name: station.name, lat: station.lat, lon: station.lon, city: station.city ?? undefined }));
}

const NAME_MATCH_RADIUS_METERS = 2500;

const significantWords = (name: string) =>
  name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z]+/).filter(word => word.length >= 4);

export function sameStationName(stopName: string, stationName: string): boolean {
  const wanted = significantWords(stopName);
  if (wanted.length === 0) return false;
  const available = new Set(significantWords(stationName));
  return wanted.every(word => available.has(word));
}

export function isMergedStation(station: { name: string; lat: number; lon: number }, stop: { name: string; lat: number; lon: number }, radiusMeters = 250): boolean {
  const distance = haversineMeters(stop.lat, stop.lon, station.lat, station.lon);
  return distance <= radiusMeters || (distance <= NAME_MATCH_RADIUS_METERS && sameStationName(stop.name, station.name));
}

export async function sncfStationsNear(lat: number, lon: number, radiusMeters: number, name?: string): Promise<SncfStationEntry[]> {
  const data = await loadSncfCatalog();
  return (data?.stations ?? []).filter(station => isMergedStation(station, { name: name ?? '', lat, lon }, radiusMeters));
}

const stationOf = (data: SncfCatalog | null, uic: string) =>
  data?.stations.find(entry => entry.uic === uic) ?? data?.stations.find(entry => entry.also?.includes(uic));

function getPassages(uic: string): Promise<SncfPassage[] | null> {
  const cached = passages.get(uic);
  if (cached && Date.now() - cached.at < PASSAGES_TTL_MS) return cached.value;
  const value = fetch(`/api/sncf?ressource=passages&gare=${encodeURIComponent(uic)}`)
    .then(response => (response.ok ? (response.json() as Promise<SncfPassage[]>) : null))
    .catch(() => null);
  passages.set(uic, { at: Date.now(), value });
  return value;
}

export async function sncfDeparturesAt(uic: string): Promise<{ lines: Line[]; departures: Departure[] }> {
  const data = await loadSncfCatalog();
  const station = stationOf(data, uic);
  const lists = await Promise.all([station?.uic ?? uic, ...(station?.also ?? [])].map(getPassages));
  const list = lists.flatMap(entries => entries ?? []).sort((a, b) => a.real - b.real);
  const byCode = new Map((data?.lines ?? []).map(entry => [entry.id, entry]));
  const now = Date.now();

  const departures: Departure[] = list
    .filter(entry => entry.real >= now - 30_000)
    .map(entry => ({
      lineId: sncfLineId(entry.line),
      routeId: sncfLineId(entry.line),
      lineName: byCode.get(entry.line)?.name ?? '',
      lineShortName: byCode.get(entry.line)?.code ?? (entry.code || entry.line),
      destination: entry.direction,
      departureTime: Math.max(0, Math.round((entry.real - now) / 60_000)),
      at: entry.real,
      realtime: entry.live,
      type: entry.coach ? 'BUS' : 'RAIL',
    }));

  const alerts = new Map<string, TrafficDetail[]>();
  for (const entry of list) {
    if (!entry.alert || entry.real < now - 30_000) continue;
    const details = alerts.get(entry.line) ?? [];
    details.push(alertDetail(entry, byCode.get(entry.line)?.code ?? entry.line));
    alerts.set(entry.line, details);
  }

  const codes = new Set([...(station?.lines ?? []), ...departures.map(dep => String(dep.lineId).replace(SNCF_PREFIX, ''))]);
  const lines = [...codes]
    .map(code => byCode.get(code))
    .filter((entry): entry is SncfLineEntry => Boolean(entry))
    .map(entry => {
      const line = toLine(entry);
      const details = alerts.get(entry.id);
      return details ? { ...line, hasTraffic: true, trafficDetails: details } : line;
    });

  return { lines, departures };
}

const EFFECT_LABELS: Record<string, { fr: string; en: string }> = {
  NO_SERVICE: { fr: 'supprimé', en: 'cancelled' },
  REDUCED_SERVICE: { fr: 'parcours réduit', en: 'shortened' },
  SIGNIFICANT_DELAYS: { fr: 'retardé', en: 'delayed' },
  DETOUR: { fr: 'dévié', en: 'diverted' },
  ADDITIONAL_SERVICE: { fr: 'ajouté', en: 'added' },
  MODIFIED_SERVICE: { fr: 'horaires modifiés', en: 'schedule changed' },
};

const clock = (at: number) =>
  new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });

function alertDetail(entry: SncfPassage, code: string): TrafficDetail {
  const language = appLanguage();
  const delay = Math.round((entry.real - entry.base) / 60_000);
  const effect = EFFECT_LABELS[entry.alert?.effect ?? '']?.[language] ?? (language === 'fr' ? 'perturbé' : 'disrupted');
  const status = entry.alert?.effect === 'SIGNIFICANT_DELAYS' && delay > 0
    ? language === 'fr' ? `retardé de ${delay} min` : `delayed by ${delay} min`
    : effect;
  const train = entry.train || code;
  return {
    titre: language === 'fr'
      ? `Train ${train} de ${clock(entry.base)} vers ${entry.direction} : ${status}`
      : `Train ${train} at ${clock(entry.base)} to ${entry.direction}: ${status}`,
    description: entry.alert?.text || '',
    dateFin: entry.alert?.end ? new Date(entry.alert.end).toISOString() : '',
    listeLigne: code,
  };
}

export async function getSncfStopDetail(stopId: string): Promise<StopDetail | null> {
  const uic = uicOfStop(stopId);
  if (!uic) return null;
  const data = await loadSncfCatalog();
  const station = stationOf(data, uic);
  if (!station) return null;
  const { lines, departures } = await sncfDeparturesAt(station.uic);
  return {
    id: sncfStopId(station.uic),
    name: station.name,
    lat: station.lat,
    lon: station.lon,
    city: station.city ?? undefined,
    lines,
    departures,
    lastUpdate: new Date(),
  };
}

export async function withNearbySncf(detail: StopDetail, radiusMeters = 250): Promise<StopDetail> {
  const near = await sncfStationsNear(detail.lat, detail.lon, radiusMeters, detail.name);
  if (near.length === 0) return detail;
  const extras = await Promise.all(near.map(station => sncfDeparturesAt(station.uic)));
  const lineIds = new Set(detail.lines.map(line => line.id));
  const lines = [...detail.lines];
  for (const extra of extras) {
    for (const line of extra.lines) {
      if (!lineIds.has(line.id)) {
        lineIds.add(line.id);
        lines.push(line);
      }
    }
  }
  const departures = [...detail.departures, ...extras.flatMap(extra => extra.departures)]
    .sort((a, b) => a.departureTime - b.departureTime);
  return { ...detail, lines, departures };
}

const TRACE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function sncfTrace(code: string): Promise<[number, number][][]> {
  const cacheKey = `${TRACE_KEY}${code}`;
  const cached = await idbGet<[number, number][][]>(cacheKey, { allowStale: true });
  if (cached && !cached.stale) return cached.value;
  const fresh = await fetch(`/api/sncf?ressource=trace&ligne=${encodeURIComponent(code)}`)
    .then(response => (response.ok ? (response.json() as Promise<{ segments?: [number, number][][] }>) : null))
    .catch(() => null);
  if (fresh?.segments) {
    void idbSet(cacheKey, fresh.segments, TRACE_TTL_MS);
    return fresh.segments;
  }
  return cached?.value ?? [];
}

export async function getSncfLineGeometries(
  lines: Array<{ id: string }>,
): Promise<Array<{ code: string; geojson: GeoJSON.FeatureCollection }>> {
  const wanted = [...new Set(lines.map(line => String(line.id)).filter(id => id.startsWith(SNCF_PREFIX)))];
  const results = await Promise.all(wanted.map(async id => ({ id, segments: await sncfTrace(id.slice(SNCF_PREFIX.length)) })));
  return results
    .filter(result => result.segments.length > 0)
    .map(result => ({
      code: result.id,
      geojson: {
        type: 'FeatureCollection' as const,
        features: result.segments.map(segment => ({
          type: 'Feature' as const,
          properties: {},
          geometry: { type: 'LineString' as const, coordinates: segment },
        })),
      },
    }));
}

export async function sncfLineAlerts(lineId: string): Promise<TrafficDetail[]> {
  const key = lineId.replace(SNCF_PREFIX, '');
  const data = await loadSncfCatalog();
  const entry = data?.lines.find(line => line.id === key);
  const busiest = (data?.stations ?? [])
    .filter(station => station.lines.includes(key))
    .sort((a, b) => b.lines.length - a.lines.length)
    .slice(0, 3)
    .flatMap(station => [station.uic, ...(station.also ?? [])]);
  const uics = [...new Set([...busiest, ...passages.keys()])];
  const lists = await Promise.all(uics.map(getPassages));
  const now = Date.now();
  const seen = new Set<string>();
  const details: TrafficDetail[] = [];
  for (const item of lists.flatMap(list => list ?? [])) {
    if (item.line !== key || !item.alert || item.real < now - 30_000) continue;
    const id = `${item.train}|${item.base}`;
    if (seen.has(id)) continue;
    seen.add(id);
    details.push(alertDetail(item, entry?.code ?? key));
  }
  return details;
}

export async function sncfOrderedStops(lineId: string): Promise<Stop[] | null> {
  const [{ getLineFiche }, data] = await Promise.all([import('./foreignTimetable'), loadSncfCatalog()]);
  const fiche = await getLineFiche(lineId);
  if (!fiche || !data) return null;
  const directions = fiche.directions.slice().sort((a, b) => b.trips.length - a.trips.length);
  const order: string[] = [];
  for (const direction of directions) {
    let ids = direction.stops.map(stop => stop.id.replace(/^OCE/, ''));
    const known = ids.filter(id => order.includes(id));
    if (known.length >= 2 && order.indexOf(known[0]) > order.indexOf(known[known.length - 1])) ids = ids.slice().reverse();
    for (let index = 0; index < ids.length; index += 1) {
      if (order.includes(ids[index])) continue;
      const previous = index > 0 ? order.indexOf(ids[index - 1]) : -1;
      const next = ids.slice(index + 1).find(id => order.includes(id));
      const at = previous >= 0 ? previous + 1 : next ? order.indexOf(next) : order.length;
      order.splice(at, 0, ids[index]);
    }
  }
  const stops = order
    .map(uic => stationOf(data, uic))
    .filter((station): station is SncfStationEntry => Boolean(station))
    .filter((station, index, list) => list.findIndex(other => other.uic === station.uic) === index)
    .map(station => ({ id: sncfStopId(station.uic), name: station.name, lat: station.lat, lon: station.lon, city: station.city ?? undefined }));
  return stops.length >= 2 ? stops : null;
}

readStored();
