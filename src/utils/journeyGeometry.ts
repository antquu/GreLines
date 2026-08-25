
import type { LineGeometry } from '../services/lineShapes';
import { haversineMeters } from './geo';

export type Coordinate = [number, number];

export interface JourneyStopRef {
  lat: number;
  lon: number;
  name?: string;
  id?: string;
}

const SNAP_DISTANCE_M = 90;

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

interface NearestVertex {
  index: number;
  meters: number;
}

function nearestVertex(coords: Coordinate[], point: JourneyStopRef | null | undefined): NearestVertex | null {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return null;

  let index = -1;
  let meters = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const distance = haversineMeters(point.lat, point.lon, coords[i][1], coords[i][0]);
    if (distance < meters) {
      meters = distance;
      index = i;
    }
  }
  return index >= 0 ? { index, meters } : null;
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

function cutReferenceSegment(
  variants: Coordinate[][],
  boarding: JourneyStopRef,
  alighting: JourneyStopRef,
  intermediates: JourneyStopRef[]
): Coordinate[] | null {
  let best: { coords: Coordinate[]; score: number } | null = null;

  for (const variant of variants) {
    const from = nearestVertex(variant, boarding);
    const to = nearestVertex(variant, alighting);
    if (!from || !to) continue;
    if (from.meters > VARIANT_ENDPOINT_TOLERANCE_M || to.meters > VARIANT_ENDPOINT_TOLERANCE_M) continue;
    if (from.index === to.index) continue;

    const start = Math.min(from.index, to.index);
    const end = Math.max(from.index, to.index);
    const segment = variant.slice(start, end + 1);
    if (segment.length < 2) continue;
    if (from.index > to.index) segment.reverse();

    let stopPenalty = 0;
    let rejected = false;
    for (const stop of intermediates) {
      const nearest = nearestVertex(segment, stop);
      if (!nearest || nearest.meters > VARIANT_STOP_TOLERANCE_M) {
        rejected = true;
        break;
      }
      stopPenalty += nearest.meters;
    }
    if (rejected) continue;

    const score =
      from.meters + to.meters + (intermediates.length > 0 ? stopPenalty / intermediates.length : 0);
    if (!best || score < best.score) best = { coords: segment, score };
  }

  return best?.coords ?? null;
}

function magnetize(coords: Coordinate[], stops: JourneyStopRef[]): Coordinate[] {
  if (coords.length < 2) return coords;
  const result = coords.slice();

  for (const stop of stops) {
    const nearest = nearestVertex(result, stop);
    if (nearest && nearest.meters <= SNAP_DISTANCE_M) {
      result[nearest.index] = [stop.lon, stop.lat];
    }
  }
  return result;
}

export interface JourneyLegGeometry {
  index: number;
  isWalk: boolean;
  /**
   * Tronçon qui ne suit ni ligne ni arrêt (marche, véhicule partagé, VTC) :
   * son tracé est celui du routeur et ne doit être recalé sur rien.
   */
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
  /**
   * Le tracé tronçon par tronçon, tel qu'il a été corrigé.
   *
   * La carte n'en a pas besoin — elle dessine la collection `lines` — mais le
   * guidage, si : il suit un tronçon à la fois pour dire où tourner. Sans cela
   * il redécodait la polyligne brute du routeur de son côté, et suivait donc un
   * chemin différent de celui qu'on lui montrait à l'écran.
   */
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

/**
 * Construit le tracé complet d'un itinéraire ainsi que les pastilles à poser
 * dessus. Renvoie `null` si aucun tronçon n'est exploitable.
 */
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
        const segment = cutReferenceSegment(extractVariants(reference), boarding, alighting, intermediates);
        if (segment && segment.length >= 2) {
          coordinates = segment;
          precise = true;
        }
      }
    }

    if (coordinates.length < 2) return;

    if (!freeform) {
      coordinates = magnetize(coordinates, [...intermediates, ...(boarding ? [boarding] : []), ...(alighting ? [alighting] : [])]);
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
