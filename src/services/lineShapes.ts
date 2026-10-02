import { isGtfsNetworkId } from './gtfsNetworkIds';
import type { Line } from '../types';
import { idbGet, idbSet } from './persistentCache';
import { isOffline } from './offlineSchedule';

const GEOMETRY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface LineGeometry {

  code: string;

  geojson: GeoJSON.FeatureCollection;
}

const ENDPOINT = 'https://data.mobilites-m.fr/api/lines/json';

const inflightCache = new Map<string, Promise<LineGeometry | null>>();
const resultCache = new Map<string, LineGeometry | null>();

function toSemCode(lineId: string): string {
  let id = lineId.trim();
  if (id.startsWith('SEM:')) id = id.slice(4);
  if (id.startsWith('SEM_')) id = id.slice(4);
  return `SEM_${id.toUpperCase()}`;
}

export async function getLineGeometry(
  lineId: string,
  options?: { signal?: AbortSignal }
): Promise<LineGeometry | null> {
  const semCode = toSemCode(lineId);

  if (resultCache.has(semCode)) return resultCache.get(semCode) ?? null;
  if (inflightCache.has(semCode)) return inflightCache.get(semCode)!;

  const params = new URLSearchParams({ types: 'ligne', codes: semCode });
  const url = `${ENDPOINT}?${params.toString()}`;

  const promise: Promise<LineGeometry | null> = (async () => {
    try {
      const resp = await fetch(url, { signal: options?.signal });
      if (!resp.ok) {
        resultCache.set(semCode, null);
        return null;
      }
      const data = await resp.json();

      let fc: GeoJSON.FeatureCollection;
      if (data?.type === 'FeatureCollection') {
        fc = data;
      } else if (data?.type === 'Feature') {
        fc = { type: 'FeatureCollection', features: [data] };
      } else if (Array.isArray(data?.features)) {
        fc = { type: 'FeatureCollection', features: data.features };
      } else {
        resultCache.set(semCode, null);
        return null;
      }

      fc = {
        type: 'FeatureCollection',
        features: fc.features.filter(
          f => f.geometry?.type === 'LineString' || f.geometry?.type === 'MultiLineString'
        ),
      };

      if (fc.features.length === 0) {
        resultCache.set(semCode, null);
        return null;
      }

      const result: LineGeometry = { code: semCode, geojson: fc };
      resultCache.set(semCode, result);
      return result;
    } catch (err) {
      return null;
    } finally {
      inflightCache.delete(semCode);
    }
  })();

  inflightCache.set(semCode, promise);
  return promise;
}

export async function getLinesGeometry(
  lines: Pick<Line, 'id' | 'shortName'>[]
): Promise<LineGeometry[]> {
  const ids = lines
    .map(l => l.shortName || l.id)
    .filter(Boolean) as string[];
  const results = await Promise.all(ids.map(id => getLineGeometry(id)));
  return results.filter((r): r is LineGeometry => r !== null);
}

const PLAN_ENDPOINT = 'https://data.mobilites-m.fr/api/routers/default/plan';

function decodePolyline(encoded: string): [number, number][] {
  let index = 0;
  let lat = 0;
  let lon = 0;
  const coords: [number, number][] = [];
  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lon += result & 1 ? ~(result >> 1) : result >> 1;
    coords.push([lon / 1e5, lat / 1e5]);
  }
  return coords;
}

function normalizeLineKey(value: string): string {
  let id = value.trim();
  if (id.startsWith('SEM:')) id = id.slice(4);
  if (id.startsWith('SEM_')) id = id.slice(4);
  return id.toUpperCase();
}

const planGeometryCache = new Map<string, LineGeometry | null>();
const planGeometryInflight = new Map<string, Promise<LineGeometry | null>>();
const ENDPOINT_MATCH_THRESHOLD_METERS = 300;

const STOP_COVERAGE_THRESHOLD_METERS = 200;

const MIN_STOP_COVERAGE_RATIO = 0.9;

function distanceToPolylineMetres(
  point: { lat: number; lon: number },
  coords: [number, number][]
): number {
  let bestSq = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const r = projectOntoSegmentMetres(point, a[1], a[0], b[1], b[0]);
    if (r.distSq < bestSq) bestSq = r.distSq;
  }
  return Math.sqrt(bestSq);
}

function distanceMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const dLat = (a.lat - b.lat) * METRES_PER_DEG_LAT;
  const dLon = (a.lon - b.lon) * METRES_PER_DEG_LON_AT_45;
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

export async function getLineGeometryViaPlan(
  lineId: string,
  options?: { signal?: AbortSignal }
): Promise<LineGeometry | null> {
  const key = normalizeLineKey(lineId);
  if (planGeometryCache.has(key)) return planGeometryCache.get(key) ?? null;
  if (planGeometryInflight.has(key)) return planGeometryInflight.get(key)!;

  const promise: Promise<LineGeometry | null> = (async () => {
    try {
      const stops = await getStopsServedByLine(lineId, { signal: options?.signal });
      if (!stops || stops.length < 2) {
        planGeometryCache.set(key, null);
        return null;
      }
      const from = stops[0];
      const to = stops[stops.length - 1];

      const params = new URLSearchParams({
        fromPlace: `${from.lat},${from.lon}`,
        toPlace: `${to.lat},${to.lon}`,
        mode: 'TRANSIT,WALK',
        numItineraries: '3',
      });
      const resp = await fetch(`${PLAN_ENDPOINT}?${params.toString()}`, {
        signal: options?.signal,
      });
      if (!resp.ok) {
        planGeometryCache.set(key, null);
        return null;
      }
      const data = await resp.json();
      const itineraries: any[] = data?.plan?.itineraries || [];
      if (itineraries.length === 0) {
        planGeometryCache.set(key, null);
        return null;
      }

      let bestCoords: [number, number][] | null = null;
      for (const it of itineraries) {
        const legs: any[] = it?.legs || [];
        for (const leg of legs) {
          if (leg?.mode === 'WALK') continue;
          const legLineKey = normalizeLineKey(
            String(leg?.routeShortName || leg?.route || leg?.routeId || '')
          );
          if (legLineKey !== key) continue;
          const pts = leg?.legGeometry?.points;
          if (!pts) continue;
          const coords = decodePolyline(pts);
          if (!bestCoords || coords.length > bestCoords.length) {
            bestCoords = coords;
          }
        }
      }

      if (!bestCoords || bestCoords.length < 2) {
        planGeometryCache.set(key, null);
        return null;
      }

      const planStart = { lon: bestCoords[0][0], lat: bestCoords[0][1] };
      const planEnd = { lon: bestCoords[bestCoords.length - 1][0], lat: bestCoords[bestCoords.length - 1][1] };
      const startMatches = Math.min(
        distanceMeters(planStart, from),
        distanceMeters(planStart, to)
      );
      const endMatches = Math.min(
        distanceMeters(planEnd, from),
        distanceMeters(planEnd, to)
      );
      const aligned =
        startMatches <= ENDPOINT_MATCH_THRESHOLD_METERS &&
        endMatches <= ENDPOINT_MATCH_THRESHOLD_METERS;
      if (!aligned) {
        planGeometryCache.set(key, null);
        return null;
      }

      const covered = stops.filter(
        stop => distanceToPolylineMetres(stop, bestCoords!) <= STOP_COVERAGE_THRESHOLD_METERS
      ).length;
      if (covered / stops.length < MIN_STOP_COVERAGE_RATIO) {
        planGeometryCache.set(key, null);
        return null;
      }

      const result: LineGeometry = {
        code: `SEM_${key}`,
        geojson: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: bestCoords },
            },
          ],
        },
      };
      planGeometryCache.set(key, result);
      return result;
    } catch (err) {
      return null;
    } finally {
      planGeometryInflight.delete(key);
    }
  })();

  planGeometryInflight.set(key, promise);
  return promise;
}

export async function getLinesGeometryPrecise(
  lines: Pick<Line, 'id' | 'shortName'>[]
): Promise<LineGeometry[]> {
  const tclLines = lines.filter(line => String(line.id).startsWith('TCL:'));
  const gtfsLines = lines.filter(line => isGtfsNetworkId(line.id));
  const mtagLines = lines.filter(line => !String(line.id).startsWith('TCL:') && !isGtfsNetworkId(line.id));

  const ids = mtagLines
    .map(l => l.shortName || l.id)
    .filter(Boolean) as string[];

  const [results, tclGeometries, gtfsGeometries] = await Promise.all([
    Promise.all(ids.map(id => resolveLineGeometry(id))),
    tclLines.length > 0
      ? import('./tclNetwork').then(module => module.getTclLineGeometries(tclLines))
      : Promise.resolve([]),
    gtfsLines.length > 0
      ? import('./gtfsNetwork').then(module => module.getGtfsLineGeometries(gtfsLines))
      : Promise.resolve([]),
  ]);

  return [...results.filter((r): r is LineGeometry => r !== null), ...tclGeometries, ...gtfsGeometries];
}

async function resolveLineGeometry(id: string): Promise<LineGeometry | null> {
  const cacheKey = `lineGeometry_v2_${normalizeLineKey(id)}`;
  const cached = await idbGet<LineGeometry>(cacheKey, { allowStale: true });
  if (cached && (!cached.stale || isOffline())) return cached.value;

  const geometry = await computeLineGeometry(id);
  if (geometry) void idbSet(cacheKey, geometry, GEOMETRY_TTL_MS);
  return geometry ?? cached?.value ?? null;
}

async function computeLineGeometry(id: string): Promise<LineGeometry | null> {
  {
    {
      const [viaPlan, staticGeom] = await Promise.all([
        getLineGeometryViaPlan(id),
        getLineGeometry(id),
      ]);

      if (!viaPlan) return staticGeom;
      if (!staticGeom) return viaPlan;

      const planLen = totalPolylineLength(viaPlan);
      const staticLen = totalPolylineLength(staticGeom);
      const COVERAGE_THRESHOLD = 0.8;
      if (staticLen > 0 && planLen / staticLen < COVERAGE_THRESHOLD) {
        return staticGeom;
      }
      return viaPlan;
    }
  }
}

function totalPolylineLength(g: LineGeometry): number {
  let total = 0;
  for (const feat of g.geojson.features) {
    const geom = feat.geometry;
    if (!geom) continue;
    if (geom.type === 'LineString') {
      total += polylineLengthDeg(geom.coordinates as [number, number][]);
    } else if (geom.type === 'MultiLineString') {
      for (const part of geom.coordinates as [number, number][][]) {
        total += polylineLengthDeg(part);
      }
    }
  }
  return total;
}

function polylineLengthDeg(coords: [number, number][]): number {
  let s = 0;
  for (let i = 1; i < coords.length; i++) {
    const dx = coords[i][0] - coords[i - 1][0];
    const dy = coords[i][1] - coords[i - 1][1];
    s += Math.sqrt(dx * dx + dy * dy);
  }
  return s;
}

const STOPS_ENDPOINT_BASE = 'https://data.mobilites-m.fr/api/routers/default/index/routes';

export interface ServedStopPoint {
  lat: number;
  lon: number;
  name?: string;
}

const stopsResultCache = new Map<string, ServedStopPoint[] | null>();
const stopsInflightCache = new Map<string, Promise<ServedStopPoint[] | null>>();

function toSemRouteId(lineId: string): string {
  let id = lineId.trim();
  if (id.startsWith('SEM:')) return id;
  if (id.startsWith('SEM_')) id = id.slice(4);
  return `SEM:${id.toUpperCase()}`;
}

function extractLatLon(s: any): ServedStopPoint | null {
  const lat =
    typeof s?.lat === 'number' ? s.lat :
    typeof s?.latitude === 'number' ? s.latitude :
    typeof s?.y === 'number' ? s.y :
    null;
  const lon =
    typeof s?.lon === 'number' ? s.lon :
    typeof s?.lng === 'number' ? s.lng :
    typeof s?.longitude === 'number' ? s.longitude :
    typeof s?.x === 'number' ? s.x :
    null;
  if (lat === null || lon === null) return null;
  const name = typeof s?.name === 'string' ? s.name : undefined;
  return { lat, lon, name };
}

export async function getStopsServedByLine(
  lineId: string,
  options?: { signal?: AbortSignal }
): Promise<ServedStopPoint[] | null> {
  const routeId = toSemRouteId(lineId);

  if (stopsResultCache.has(routeId)) return stopsResultCache.get(routeId) ?? null;
  if (stopsInflightCache.has(routeId)) return stopsInflightCache.get(routeId)!;

  const url = `${STOPS_ENDPOINT_BASE}/${encodeURIComponent(routeId)}/stops`;
  const cacheKey = `servedStops_v2_${routeId}`;

  const promise: Promise<ServedStopPoint[] | null> = (async () => {
    try {
      const persisted = await idbGet<ServedStopPoint[]>(cacheKey, { allowStale: true });
      const usable = persisted && persisted.value.length > 0 ? persisted.value : null;
      if (usable && (!persisted!.stale || isOffline())) {
        stopsResultCache.set(routeId, usable);
        return usable;
      }
      if (usable && isOffline()) return usable;

      let resp: Response;
      try {
        resp = await fetch(url, { signal: options?.signal });
      } catch (error) {
        if (usable) return usable;
        throw error;
      }
      if (!resp.ok) {
        stopsResultCache.set(routeId, null);
        return null;
      }
      const data = await resp.json();
      if (!Array.isArray(data)) {
        stopsResultCache.set(routeId, null);
        return null;
      }
      const points: ServedStopPoint[] = [];
      for (const s of data) {
        const pt = extractLatLon(s);
        if (pt) points.push(pt);
      }
      stopsResultCache.set(routeId, points);
      if (points.length > 0) void idbSet(cacheKey, points, GEOMETRY_TTL_MS);
      return points;
    } catch (err) {
      return null;
    } finally {
      stopsInflightCache.delete(routeId);
    }
  })();

  stopsInflightCache.set(routeId, promise);
  return promise;
}

export async function prefetchLineForOffline(shortName: string): Promise<boolean> {
  const [geometries, stops] = await Promise.all([
    getLinesGeometryPrecise([{ id: shortName, shortName }]).catch(() => []),
    getStopsServedByLine(shortName).catch(() => null),
  ]);
  return geometries.length > 0 && !!stops && stops.length > 0;
}

export async function getStopsServedByLines(
  lines: Pick<Line, 'id' | 'shortName'>[]
): Promise<ServedStopPoint[] | null> {
  const tclLines = lines.filter(line => String(line.id).startsWith('TCL:'));
  const gtfsLines = lines.filter(line => isGtfsNetworkId(line.id));
  const mtagLines = lines.filter(line => !String(line.id).startsWith('TCL:') && !isGtfsNetworkId(line.id));

  const ids = mtagLines
    .map(l => l.shortName || l.id)
    .filter(Boolean) as string[];

  const [results, tclServed, gtfsServed] = await Promise.all([
    Promise.all(ids.map(id => getStopsServedByLine(id))),
    tclLines.length > 0
      ? import('./tclNetwork').then(module => module.getTclStopsServedByLines(tclLines))
      : Promise.resolve([] as ServedStopPoint[]),
    gtfsLines.length > 0
      ? import('./gtfsNetwork').then(module => module.getGtfsStopsServedByLines(gtfsLines))
      : Promise.resolve([] as ServedStopPoint[]),
  ]);

  const successful = results.filter((r): r is ServedStopPoint[] => r !== null);
  if (successful.length === 0 && tclServed.length === 0 && gtfsServed.length === 0) return null;
  return [...successful.flat(), ...tclServed, ...gtfsServed];
}

const METRES_PER_DEG_LAT = 111320;
const METRES_PER_DEG_LON_AT_45 = 78710;

export function stopNameKey(value: string | undefined | null): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function stopIsNearAny(
  stop: { lat: number; lon: number; name?: string },
  points: ServedStopPoint[],
  thresholdMeters: number = 35
): boolean {
  const key = stopNameKey(stop.name);
  const t2 = thresholdMeters * thresholdMeters;

  for (const p of points) {
    if (key && p.name && stopNameKey(p.name) === key) return true;

    const dLat = (p.lat - stop.lat) * METRES_PER_DEG_LAT;
    const dLon = (p.lon - stop.lon) * METRES_PER_DEG_LON_AT_45;
    if (dLat * dLat + dLon * dLon <= t2) return true;
  }
  return false;
}

interface ProjectionResult {
  distSq: number;
  lat: number;
  lon: number;
}

function projectOntoSegmentMetres(
  point: { lat: number; lon: number },
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number
): ProjectionResult {
  const ax = (aLon - point.lon) * METRES_PER_DEG_LON_AT_45;
  const ay = (aLat - point.lat) * METRES_PER_DEG_LAT;
  const bx = (bLon - point.lon) * METRES_PER_DEG_LON_AT_45;
  const by = (bLat - point.lat) * METRES_PER_DEG_LAT;

  const dx = bx - ax;
  const dy = by - ay;
  const segLenSq = dx * dx + dy * dy;

  let t: number;
  if (segLenSq === 0) {
    t = 0;
  } else {
    t = -(ax * dx + ay * dy) / segLenSq;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
  }
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  const distSq = cx * cx + cy * cy;

  const lat = point.lat + cy / METRES_PER_DEG_LAT;
  const lon = point.lon + cx / METRES_PER_DEG_LON_AT_45;
  return { distSq, lat, lon };
}

export function snapStopToLines(
  stop: { lat: number; lon: number },
  geometries: LineGeometry[],
  maxSnapMeters: number = 80
): { lat: number; lon: number; color: string } | null {
  if (geometries.length === 0) return null;

  const maxSq = maxSnapMeters * maxSnapMeters;
  let bestDistSq = Infinity;
  let bestLat = stop.lat;
  let bestLon = stop.lon;
  let bestColor = '';

  for (const geometry of geometries) {
    for (const feature of geometry.geojson.features) {
      const geom = feature.geometry;
      if (!geom) continue;
      const parts: [number, number][][] =
        geom.type === 'LineString'
          ? [geom.coordinates as [number, number][]]
          : geom.type === 'MultiLineString'
          ? (geom.coordinates as [number, number][][])
          : [];
      const color = String((feature.properties as any)?.color || '');

      for (const coords of parts) {
        for (let i = 0; i < coords.length - 1; i++) {
          const a = coords[i];
          const b = coords[i + 1];
          const r = projectOntoSegmentMetres(stop, a[1], a[0], b[1], b[0]);
          if (r.distSq < bestDistSq) {
            bestDistSq = r.distSq;
            bestLat = r.lat;
            bestLon = r.lon;
            bestColor = color;
          }
        }
      }
    }
  }

  if (bestDistSq > maxSq) return null;
  return { lat: bestLat, lon: bestLon, color: bestColor.slice(0, 7) };
}
