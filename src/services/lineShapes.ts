













import type { Line } from '../types';
import { idbGet, idbSet } from './persistentCache';







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

/**
 * Fetch the geometry of a single SEM line. Cached: subsequent calls for the
 * same line return the cached result (geometries don't change at runtime).
 */
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
      if ((err as { name?: string }).name !== 'AbortError') {      }
      return null;
    } finally {
      inflightCache.delete(semCode);
    }
  })();

  inflightCache.set(semCode, promise);
  return promise;
}

/**
 * Fetch geometries for multiple lines in parallel. Lines whose geometry is
 * unavailable are simply omitted from the result — no errors propagate up.
 */
export async function getLinesGeometry(
  lines: Pick<Line, 'id' | 'shortName'>[]
): Promise<LineGeometry[]> {
  const ids = lines
    .map(l => l.shortName || l.id)
    .filter(Boolean) as string[];
  const results = await Promise.all(ids.map(id => getLineGeometry(id)));
  return results.filter((r): r is LineGeometry => r !== null);
}

// ─────────────────────────────────────────────────────────────────────────────
// Terminus-to-terminus geometry via the routing engine
//
// The static `/api/lines/json` geometry merges *every* variant of a line
// (short turns, depot runs, special services) into one MultiLineString, so it
// visually "overshoots" the real terminus. The routing engine (`/plan`), on
// the other hand, returns the exact path the vehicle takes for a given trip.
//
// Strategy: ask the planner for a transit trip from the line's first stop to
// its last stop. We then keep only the transit leg(s) that belong to *this*
// line and stitch their geometries together. If the planner can't give us a
// clean single-line trip, we return null and the caller falls back to the
// static geometry.
// ─────────────────────────────────────────────────────────────────────────────

const PLAN_ENDPOINT = 'https://data.mobilites-m.fr/api/routers/default/plan';

/**
 * Decode a Google-encoded polyline string into an array of `[lon, lat]`
 * coordinate pairs (the order MapLibre GeoJSON sources expect).
 */
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

/**
 * Normalize a line code for loose comparison: strip the SEM prefix and
 * uppercase. So "SEM:C1", "SEM_C1", "c1" all become "C1".
 */
function normalizeLineKey(value: string): string {
  let id = value.trim();
  if (id.startsWith('SEM:')) id = id.slice(4);
  if (id.startsWith('SEM_')) id = id.slice(4);
  return id.toUpperCase();
}

const planGeometryCache = new Map<string, LineGeometry | null>();
const planGeometryInflight = new Map<string, Promise<LineGeometry | null>>();
const ENDPOINT_MATCH_THRESHOLD_METERS = 300;

/**
 * Distance maximale entre un arrêt desservi et le tracé pour le considérer
 * couvert. Large : l'écart entre le quai et le centroïde du groupe d'arrêts
 * atteint déjà 100 m sur les grands boulevards.
 */
const STOP_COVERAGE_THRESHOLD_METERS = 200;

/**
 * Proportion d'arrêts devant être couverts pour retenir le tracé du moteur
 * d'itinéraires. En dessous, il manque une branche ou un bout de ligne.
 */
const MIN_STOP_COVERAGE_RATIO = 0.9;

/** Distance d'un point à une polyligne, en mètres. */
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

/**
 * Fetch a single line's geometry terminus-to-terminus via the routing engine.
 * Returns `null` (so the caller can fall back to the static geometry) when:
 *   - we can't resolve the line's two terminus stops
 *   - the planner returns no itinerary
 *   - the planner's itinerary doesn't actually ride this line
 */
export async function getLineGeometryViaPlan(
  lineId: string,
  options?: { signal?: AbortSignal }
): Promise<LineGeometry | null> {
  const key = normalizeLineKey(lineId);
  if (planGeometryCache.has(key)) return planGeometryCache.get(key) ?? null;
  if (planGeometryInflight.has(key)) return planGeometryInflight.get(key)!;

  const promise: Promise<LineGeometry | null> = (async () => {
    try {
      // 1. Resolve the line's ordered list of served stops → first & last are
      //    the terminuses.
      const stops = await getStopsServedByLine(lineId, { signal: options?.signal });
      if (!stops || stops.length < 2) {
        planGeometryCache.set(key, null);
        return null;
      }
      const from = stops[0];
      const to = stops[stops.length - 1];

      // 2. Ask the planner for a transit trip between the two terminuses.
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

      // 3. Across all returned itineraries, collect every transit leg that
      //    rides *this* line, and pick the longest contiguous geometry. The
      //    longest leg on the right line is the best terminus-to-terminus
      //    candidate.
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

      // The planner occasionally returns a leg that stops early on a branch
      // even though the route catalogue knows a longer terminus. If the trace
      // doesn't end near the last served stop, it's safer to fall back to the
      // static geometry than to truncate the visible line.
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

      // Contrôle de couverture.
      //
      // Le test d'extrémités ci-dessus ne suffit pas : il compare le tracé aux
      // arrêts `stops[0]` et `stops[n-1]`, or MTAG ne renvoie pas forcément les
      // deux terminus à ces positions. Un trajet écourté passe alors le
      // contrôle — c'est ce qui arrivait à la ligne C pendant l'interruption
      // Condillac ↔ Les Taillées : le moteur d'itinéraires, qui raisonne sur le
      // service *du jour*, ne pouvait pas rouler jusqu'à Condillac, et le tracé
      // s'arrêtait à Hector Berlioz.
      //
      // On vérifie donc que le tracé passe bien à portée de *tous* les arrêts
      // desservis. Sinon il est incomplet, et la géométrie statique — qui, elle,
      // couvre toutes les variantes de la ligne — reprend la main.
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
      if ((err as { name?: string }).name !== 'AbortError') {      }
      return null;
    } finally {
      planGeometryInflight.delete(key);
    }
  })();

  planGeometryInflight.set(key, promise);
  return promise;
}

/**
 * Like `getLinesGeometry`, but uses the routing engine for a terminus-to-
 * terminus trace. For each line we try the planner first; if it can't give us
 * a clean trace — or if the trace covers significantly less ground than the
 * static geometry (typical sign of a multi-terminus line where one /plan call
 * can only see one branch) — we fall back to the static geometry so the user
 * always sees the full line, even if its endpoints are a bit messy.
 */
export async function getLinesGeometryPrecise(
  lines: Pick<Line, 'id' | 'shortName'>[]
): Promise<LineGeometry[]> {
  // Les lignes lyonnaises ont leur propre source : leurs tracés viennent du WFS
  // du Grand Lyon, pas de l'API grenobloise. On les traite à part et on rend
  // une seule liste — la carte ne fait pas la différence.
  const tclLines = lines.filter(line => String(line.id).startsWith('TCL:'));
  const mtagLines = lines.filter(line => !String(line.id).startsWith('TCL:'));

  const ids = mtagLines
    .map(l => l.shortName || l.id)
    .filter(Boolean) as string[];

  const [results, tclGeometries] = await Promise.all([
    Promise.all(ids.map(id => resolveLineGeometry(id))),
    tclLines.length > 0
      ? import('./tclNetwork').then(module => module.getTclLineGeometries(tclLines))
      : Promise.resolve([]),
  ]);

  return [...results.filter((r): r is LineGeometry => r !== null), ...tclGeometries];
}

/**
 * Résout la géométrie d'une ligne en passant d'abord par IndexedDB. Le résultat
 * est celui *après* arbitrage plan/statique : on ne rejoue ni le calcul ni les
 * requêtes au prochain affichage de la même ligne.
 */
async function resolveLineGeometry(id: string): Promise<LineGeometry | null> {
  // v2 : les entrées v1 ont pu être calculées avant le contrôle de couverture,
  // et contenir un tracé écourté par une interruption de service. Sans
  // changement de clé, elles resteraient affichées pendant sept jours.
  const cacheKey = `lineGeometry_v2_${normalizeLineKey(id)}`;
  const cached = await idbGet<LineGeometry>(cacheKey);
  if (cached) return cached.value;

  const geometry = await computeLineGeometry(id);
  if (geometry) void idbSet(cacheKey, geometry, GEOMETRY_TTL_MS);
  return geometry;
}

async function computeLineGeometry(id: string): Promise<LineGeometry | null> {
  {
    {
      // Fetch both candidates in parallel so the comparison is fast.
      const [viaPlan, staticGeom] = await Promise.all([
        getLineGeometryViaPlan(id),
        getLineGeometry(id),
      ]);

      // No plan-based geometry → just use whatever static one we have.
      if (!viaPlan) return staticGeom;
      // No static geometry → trust the plan-based one even if short.
      if (!staticGeom) return viaPlan;

      // Compare total polyline lengths (in degrees — fine for a ratio).
      // If the plan-based trace covers less than 80% of the static one, the
      // line probably has more than two terminuses and the plan can only
      // describe one branch. In that case we'd rather show the (slightly
      // overshooting) static trace than miss half the line.
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

/** Sum the lengths of every LineString/MultiLineString in a LineGeometry, in
 *  degrees (good enough for ratio comparisons). */
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

// ─────────────────────────────────────────────────────────────────────────────
// Stops served by a line
//
// The MTAG `/routes/<routeId>/stops` endpoint returns stops with internal
// numeric ids that DO NOT match the textual codes (e.g. "SEM:CHAVANT") that we
// get from the `/bbox` endpoint. To work around this id mismatch reliably, we
// match by **geographic proximity** instead.
// ─────────────────────────────────────────────────────────────────────────────

const STOPS_ENDPOINT_BASE = 'https://data.mobilites-m.fr/api/routers/default/index/routes';

export interface ServedStopPoint {
  lat: number;
  lon: number;
  /** Nom renvoyé par MTAG, utilisé pour rattraper les écarts de coordonnées. */
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

/**
 * Pull a coordinate from a stop record, accepting the various field names that
 * MTAG endpoints use (lat/lon, latitude/longitude, y/x).
 */
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

/**
 * Fetch the stops served by a single SEM line, as `{lat, lon}` points.
 */
export async function getStopsServedByLine(
  lineId: string,
  options?: { signal?: AbortSignal }
): Promise<ServedStopPoint[] | null> {
  const routeId = toSemRouteId(lineId);

  if (stopsResultCache.has(routeId)) return stopsResultCache.get(routeId) ?? null;
  if (stopsInflightCache.has(routeId)) return stopsInflightCache.get(routeId)!;

  const url = `${STOPS_ENDPOINT_BASE}/${encodeURIComponent(routeId)}/stops`;
  // v2 : les entrées v1 ne contenaient pas le nom de l'arrêt, sur lequel repose
  // désormais l'appariement. Changer de clé force leur reconstruction plutôt
  // que de laisser un cache muet dégrader le filtrage pendant sept jours.
  const cacheKey = `servedStops_v2_${routeId}`;

  const promise: Promise<ServedStopPoint[] | null> = (async () => {
    try {
      const persisted = await idbGet<ServedStopPoint[]>(cacheKey);
      if (persisted && persisted.value.length > 0) {
        stopsResultCache.set(routeId, persisted.value);
        return persisted.value;
      }

      const resp = await fetch(url, { signal: options?.signal });
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
      if ((err as { name?: string }).name !== 'AbortError') {      }
      return null;
    } finally {
      stopsInflightCache.delete(routeId);
    }
  })();

  stopsInflightCache.set(routeId, promise);
  return promise;
}

/**
 * Fetch the union of all stop points served by the given lines.
 * Returns `null` if every fetch failed.
 */
export async function getStopsServedByLines(
  lines: Pick<Line, 'id' | 'shortName'>[]
): Promise<ServedStopPoint[] | null> {
  // Les lignes lyonnaises tirent leurs arrêts de leur propre source. Sans cette
  // branche, filtrer une ligne de Lyon ne renvoyait rien : la carte gardait donc
  // tous les arrêts au lieu de ne garder que ceux de la ligne.
  const tclLines = lines.filter(line => String(line.id).startsWith('TCL:'));
  const mtagLines = lines.filter(line => !String(line.id).startsWith('TCL:'));

  const ids = mtagLines
    .map(l => l.shortName || l.id)
    .filter(Boolean) as string[];

  const [results, tclServed] = await Promise.all([
    Promise.all(ids.map(id => getStopsServedByLine(id))),
    tclLines.length > 0
      ? import('./tclNetwork').then(module => module.getTclStopsServedByLines(tclLines))
      : Promise.resolve([] as ServedStopPoint[]),
  ]);

  const successful = results.filter((r): r is ServedStopPoint[] => r !== null);
  if (successful.length === 0 && tclServed.length === 0) return null;
  return [...successful.flat(), ...tclServed];
}

// ─────────────────────────────────────────────────────────────────────────────
// Geometry helpers (proximity test + snap-to-polyline)
// ─────────────────────────────────────────────────────────────────────────────

// Approximate metres-per-degree at Grenoble's latitude (~45°). We use the
// equirectangular approximation because we only need to compare distances
// over a small radius (< 100m), not measure them precisely.
const METRES_PER_DEG_LAT = 111320;
const METRES_PER_DEG_LON_AT_45 = 78710;

/**
 * Clé de comparaison de noms d'arrêts : sans accents, sans casse et sans
 * ponctuation, pour que « Berriat-Le Magasin » et « Berriat - Le Magasin »
 * soient reconnus comme le même arrêt.
 */
function stopNameKey(value: string | undefined | null): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Détermine si `stop` fait partie des arrêts desservis (`points`).
 *
 * La comparaison géographique seule ne suffit pas : l'endpoint MTAG
 * `/routes/<id>/stops` renvoie la position des *quais*, alors que nos arrêts
 * portent le centroïde du groupe d'arrêts. L'écart atteint 100 m sur les
 * grands boulevards — mesuré sur la ligne A, 24 des 63 arrêts étaient rejetés
 * par le seuil de 35 m, dont Gares, Alsace-Lorraine et Victor Hugo, tous
 * pourtant homonymes exacts de nos arrêts.
 *
 * On teste donc le nom en premier. Le rayon, lui, reste volontairement serré :
 * élargi à 140 m il faisait entrer des arrêts voisins non desservis — « Colonel
 * Dumont », à 82 m d'un quai de la ligne E, apparaissait dans le filtre E alors
 * que seul le 25 y passe.
 */
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

/**
 * Extract every line segment from a `LineGeometry`'s GeoJSON, regardless of
 * whether the geometries are `LineString` or `MultiLineString`.
 * Returns arrays of `[lon, lat]` coordinate pairs.
 */
interface ProjectionResult {
  distSq: number;
  lat: number;
  lon: number;
}

/**
 * Project `point` onto the segment `[a, b]` and return the closest point on
 * the segment, in *projected metres* relative to `point`.
 */
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

/**
 * For a given stop, find the closest point on any segment of the provided
 * polylines. Returns `null` if the closest point is farther than
 * `maxSnapMeters` (so we don't drag stops absurdly far away).
 */
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
  /*
   * La couleur du tracé le plus proche voyage avec le point calé.
   *
   * Elle est lue sur la feature elle-même, où l'appelant l'a déjà posée pour
   * peindre la ligne : arrêt et tracé tirent ainsi leur couleur de la même
   * source, et ne peuvent pas diverger. La redéduire ici du code de la ligne
   * donnait une autre couleur que celle du trait.
   */
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
  // Un tracé « exceptionnel » porte sa couleur suivie d'un alpha (`#RRGGBBCC`).
  // La pastille, elle, se veut franche : on ne garde que les six chiffres.
  return { lat: bestLat, lon: bestLon, color: bestColor.slice(0, 7) };
}
