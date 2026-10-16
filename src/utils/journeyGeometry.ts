import type { LineGeometry } from '../services/lineShapes';
import { haversineMeters } from './geo';

export type Coordinate = [number, number];

export interface JourneyStopRef {
  lat: number;
  lon: number;
  name?: string;
  id?: string;
}

const VARIANT_ENDPOINT_TOLERANCE_M = 220;

const VARIANT_STOP_TOLERANCE_M = 260;

export function decodePolyline(encoded: string): Coordinate[] {
  const coordinates: Coordinate[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += (result & 1) !== 0 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += (result & 1) !== 0 ? ~(result >> 1) : result >> 1;

    coordinates.push([lng / 1e5, lat / 1e5]);
  }

  return coordinates;
}

function extractVariants(geometry: LineGeometry): Coordinate[][] {
  const variants: Coordinate[][] = [];
  for (const feature of geometry.geojson.features) {
    const geom = feature.geometry;
    if (!geom) continue;
    if (geom.type === 'LineString') {
      variants.push(geom.coordinates as Coordinate[]);
    } else if (geom.type === 'MultiLineString') {
      for (const part of geom.coordinates as Coordinate[][]) variants.push(part);
    }
  }
  return variants.filter(coords => coords.length >= 2);
}


function toStopRef(raw: any): JourneyStopRef | null {
  const lat = typeof raw?.lat === 'number' ? raw.lat : typeof raw?.latitude === 'number' ? raw.latitude : null;
  const lon = typeof raw?.lon === 'number' ? raw.lon : typeof raw?.longitude === 'number' ? raw.longitude : null;
  if (lat === null || lon === null) return null;
  return {
    lat,
    lon,
    name: typeof raw?.name === 'string' ? raw.name : undefined,
    id: typeof raw?.stopId === 'string' ? raw.stopId : typeof raw?.id === 'string' ? raw.id : undefined,
  };
}

const METERS_PER_DEG_LAT = 110540;
const MISSED_STOP_PENALTY_M = 150;
const DETOUR_RATIO = 2.5;

interface MeasuredLine {
  coords: Coordinate[];
  along: number[];
}

interface Projection {
  along: number;
  error: number;
}

function measure(coords: Coordinate[]): MeasuredLine {
  const along = [0];
  for (let i = 1; i < coords.length; i++) {
    along.push(along[i - 1] + haversineMeters(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]));
  }
  return { coords, along };
}

// every place where the line passes close to the stop, measured along the line
function projectStop(line: MeasuredLine, stop: JourneyStopRef, tolerance: number): Projection[] {
  const kx = Math.cos((stop.lat * Math.PI) / 180) * 111320;
  const ky = METERS_PER_DEG_LAT;
  const found: Projection[] = [];
  let run: Projection | null = null;

  for (let i = 1; i < line.coords.length; i++) {
    const ax = (line.coords[i - 1][0] - stop.lon) * kx;
    const ay = (line.coords[i - 1][1] - stop.lat) * ky;
    const bx = (line.coords[i][0] - stop.lon) * kx;
    const by = (line.coords[i][1] - stop.lat) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSq)) : 0;
    const error = Math.hypot(ax + dx * t, ay + dy * t);

    if (error <= tolerance) {
      const along = line.along[i - 1] + (line.along[i] - line.along[i - 1]) * t;
      if (!run || error < run.error) run = { along, error };
    } else if (run) {
      found.push(run);
      run = null;
    }
  }
  if (run) found.push(run);
  return found;
}

function pointAt(line: MeasuredLine, along: number): Coordinate {
  const { coords, along: cum } = line;
  if (along <= 0) return coords[0];
  for (let i = 1; i < coords.length; i++) {
    if (cum[i] >= along) {
      const span = cum[i] - cum[i - 1];
      const t = span > 0 ? (along - cum[i - 1]) / span : 0;
      return [coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * t, coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * t];
    }
  }
  return coords[coords.length - 1];
}

function sliceLine(line: MeasuredLine, from: number, to: number): Coordinate[] {
  const result: Coordinate[] = [pointAt(line, from)];
  for (let i = 0; i < line.coords.length; i++) {
    if (line.along[i] > from && line.along[i] < to) result.push(line.coords[i]);
  }
  result.push(pointAt(line, to));
  return result;
}

// follow the stops in riding order along one shape variant
function matchVariant(
  line: MeasuredLine,
  boarding: JourneyStopRef,
  alighting: JourneyStopRef,
  intermediates: JourneyStopRef[]
): { coords: Coordinate[]; score: number } | null {
  const stops = [boarding, ...intermediates, alighting];
  const options = stops.map((stop, i) =>
    projectStop(line, stop, i === 0 || i === stops.length - 1 ? VARIANT_ENDPOINT_TOLERANCE_M : VARIANT_STOP_TOLERANCE_M)
  );
  if (options[0].length === 0 || options[options.length - 1].length === 0) return null;

  let layer = options[0].map(option => ({ along: option.along, cost: option.error, start: option.along }));
  let missed = 0;

  for (let i = 1; i < stops.length; i++) {
    const last = i === stops.length - 1;
    const next: typeof layer = [];
    for (const option of options[i]) {
      let best: (typeof layer)[number] | null = null;
      for (const previous of layer) {
        if (previous.along > option.along + 5) continue;
        if (!best || previous.cost < best.cost) best = previous;
      }
      if (best) next.push({ along: option.along, cost: best.cost + option.error, start: best.start });
    }
    if (next.length === 0) {
      if (last) return null;
      missed += 1;
      continue;
    }
    layer = next;
  }

  let end: (typeof layer)[number] | null = null;
  for (const candidate of layer) {
    if (candidate.along - candidate.start < 20) continue;
    if (!end || candidate.cost < end.cost) end = candidate;
  }
  if (!end) return null;

  const coords = sliceLine(line, end.start, end.along);
  const straight = haversineMeters(boarding.lat, boarding.lon, alighting.lat, alighting.lon);
  const ridden = end.along - end.start;
  const detour = straight > 0 ? Math.max(0, ridden / straight - DETOUR_RATIO) * 100 : 0;
  const score = (end.cost + missed * MISSED_STOP_PENALTY_M) / stops.length + detour;
  return { coords, score };
}

const GOOD_DENSITY_PER_KM = 15;
const GOOD_STOP_GAP_M = 40;

interface TraceQuality {
  density: number;
  stopGap: number;
}

function traceQuality(coords: Coordinate[], stops: JourneyStopRef[]): TraceQuality {
  const line = measure(coords);
  const km = line.along[line.along.length - 1] / 1000;
  let stopGap = 0;
  for (const stop of stops) {
    const nearest = projectStop(line, stop, Infinity);
    const gap = nearest.length > 0 ? Math.min(...nearest.map(option => option.error)) : Infinity;
    stopGap = Math.max(stopGap, gap);
  }
  return { density: km > 0 ? coords.length / km : 0, stopGap };
}

// keep the planner trace when it already follows the streets, else the line shape
function pickTrace(planned: Coordinate[], shape: Coordinate[] | null, stops: JourneyStopRef[]): Coordinate[] | null {
  if (!shape || shape.length < 2) return null;
  if (planned.length < 2) return shape;
  const plan = traceQuality(planned, stops);
  if (plan.density >= GOOD_DENSITY_PER_KM && plan.stopGap <= GOOD_STOP_GAP_M) return null;
  const ref = traceQuality(shape, stops);
  if (ref.stopGap > Math.max(GOOD_STOP_GAP_M * 1.5, plan.stopGap)) return null;
  return ref.density > plan.density ? shape : null;
}

function cutReferenceSegment(
  variants: Coordinate[][],
  boarding: JourneyStopRef,
  alighting: JourneyStopRef,
  intermediates: JourneyStopRef[]
): Coordinate[] | null {
  let best: { coords: Coordinate[]; score: number } | null = null;

  for (const variant of variants) {
    for (const coords of [variant, [...variant].reverse()]) {
      const match = matchVariant(measure(coords), boarding, alighting, intermediates);
      if (match && match.coords.length >= 2 && (!best || match.score < best.score)) best = match;
    }
  }

  return best?.coords ?? null;
}

export interface JourneyLegGeometry {
  index: number;
  isWalk: boolean;
  freeform: boolean;
  lineKey: string;
  color: string;
  coordinates: Coordinate[];

  precise: boolean;
  boarding: JourneyStopRef | null;
  alighting: JourneyStopRef | null;
  intermediates: JourneyStopRef[];
}

export interface JourneyBadge {
  lon: number;
  lat: number;
  lineKey: string;
  color: string;
  legIndex: number;
}

export interface JourneyGeometry {

  lines: GeoJSON.FeatureCollection;

  points: GeoJSON.FeatureCollection;

  badges: JourneyBadge[];
  legGeometries: JourneyLegGeometry[];
}

export interface BuildJourneyGeometryOptions {
  legs: any[];

  getLineColor: (leg: any) => string;

  getLineKey: (leg: any) => string;

  referenceGeometries?: Map<string, LineGeometry>;

  resolveCluster?: (stop: JourneyStopRef) => JourneyStopRef | null;
}

function midpoint(coords: Coordinate[]): Coordinate | null {
  if (coords.length === 0) return null;
  return coords[Math.floor(coords.length / 2)];
}

function pointKey(point: JourneyStopRef): string {
  return `${point.lon.toFixed(5)},${point.lat.toFixed(5)}`;
}

export function buildJourneyGeometry({
  legs,
  getLineColor,
  getLineKey,
  referenceGeometries,
  resolveCluster,
}: BuildJourneyGeometryOptions): JourneyGeometry | null {
  if (!Array.isArray(legs) || legs.length === 0) return null;

  const resolve = (raw: any): JourneyStopRef | null => {
    const stop = toStopRef(raw);
    if (!stop) return null;
    return resolveCluster?.(stop) ?? stop;
  };

  const legGeometries: JourneyLegGeometry[] = [];

  legs.forEach((leg, index) => {
    const points = leg?.legGeometry?.points;
    const otpCoords = typeof points === 'string' && points.length > 0 ? decodePolyline(points) : [];

    const isWalk = leg?.mode === 'WALK';
    const freeform =
      isWalk || Boolean(leg?.sharedOperator) || Boolean(leg?.uberProduct) || Boolean(leg?.taxiCompany);
    const boarding = freeform ? toStopRef(leg?.from) : resolve(leg?.from);
    const alighting = freeform ? toStopRef(leg?.to) : resolve(leg?.to);
    const intermediates = !freeform && Array.isArray(leg?.intermediateStops)
      ? (leg.intermediateStops.map(resolve).filter(Boolean) as JourneyStopRef[])
      : [];

    const lineKey = freeform ? '' : getLineKey(leg);
    const color = isWalk ? '#94a3b8' : getLineColor(leg);

    let coordinates = otpCoords;
    let precise = false;

    if (!freeform && boarding && alighting) {
      const reference = referenceGeometries?.get(lineKey);
      if (reference) {
        const segment = pickTrace(
          otpCoords,
          cutReferenceSegment(extractVariants(reference), boarding, alighting, intermediates),
          [boarding, ...intermediates, alighting],
        );
        if (segment) {
          coordinates = segment;
          precise = true;
        }
      }
    }

    if (coordinates.length < 2) return;

    if (!freeform && !precise) {
      coordinates = coordinates.slice();
      if (boarding) coordinates[0] = [boarding.lon, boarding.lat];
      if (alighting) coordinates[coordinates.length - 1] = [alighting.lon, alighting.lat];
    }

    legGeometries.push({
      index,
      isWalk,
      freeform,
      lineKey,
      color,
      coordinates,
      precise,
      boarding,
      alighting,
      intermediates,
    });
  });

  if (legGeometries.length === 0) return null;

  const lines: GeoJSON.Feature[] = legGeometries.map(leg => ({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: leg.coordinates },
    properties: {
      mode: leg.isWalk ? 'WALK' : 'TRANSIT',
      isWalk: leg.isWalk,
      routeShortName: leg.lineKey,
      color: leg.color,
      precise: leg.precise,
      index: leg.index,
    },
  }));

  const RANK: Record<string, number> = { stop: 0, transfer: 1, endpoint: 2 };
  const pointsByKey = new Map<string, GeoJSON.Feature>();

  const addPoint = (
    stop: JourneyStopRef | null,
    kind: 'stop' | 'transfer' | 'endpoint',
    color: string
  ) => {
    if (!stop) return;
    const key = pointKey(stop);
    const existing = pointsByKey.get(key);
    if (existing && RANK[(existing.properties as any).kind] >= RANK[kind]) return;
    pointsByKey.set(key, {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [stop.lon, stop.lat] },
      properties: { kind, color, name: stop.name || '' },
    });
  };

  const transitLegs = legGeometries.filter(leg => !leg.freeform);

  for (const leg of transitLegs) {
    addPoint(leg.boarding, 'transfer', leg.color);
    addPoint(leg.alighting, 'transfer', leg.color);
  }

  const first = legGeometries[0];
  const last = legGeometries[legGeometries.length - 1];
  addPoint(
    first.boarding ?? { lon: first.coordinates[0][0], lat: first.coordinates[0][1] },
    'endpoint',
    '#0f172a'
  );
  addPoint(
    last.alighting ?? {
      lon: last.coordinates[last.coordinates.length - 1][0],
      lat: last.coordinates[last.coordinates.length - 1][1],
    },
    'endpoint',
    '#0f172a'
  );

  const badges: JourneyBadge[] = transitLegs
    .map(leg => {
      const mid = midpoint(leg.coordinates);
      if (!mid || !leg.lineKey) return null;
      return { lon: mid[0], lat: mid[1], lineKey: leg.lineKey, color: leg.color, legIndex: leg.index };
    })
    .filter((badge): badge is JourneyBadge => badge !== null);

  return {
    lines: { type: 'FeatureCollection', features: lines },
    points: { type: 'FeatureCollection', features: [...pointsByKey.values()] },
    badges,
    legGeometries,
  };
}
