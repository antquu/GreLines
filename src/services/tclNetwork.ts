
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

  const work = (async (): Promise<T | null> => {
    const cached = await idbGet<T>(cacheKey, { allowStale: true });
    if (cached?.value && !cached.stale) return cached.value;

    try {
      const response = await fetch(`${ENDPOINT}?${query}`);
      if (!response.ok) return cached?.value ?? null;
      const payload = (await response.json()) as T;
      void idbSet(cacheKey, payload, ttl);
      return payload;
    } catch {
      return cached?.value ?? null;
    }
  })();

  memory.set(cacheKey, work);
  void work.then(value => { if (value === null) memory.delete(cacheKey); });
  return work;
}

/**
 * Identifiant d'une ligne TCL dans l'application.
 *
 * Préfixé par le réseau, comme les identifiants MTAG : c'est ce qui permet à la
 * couche fournisseur de reconnaître à qui appartient une ligne sans que
 * l'appelant ait à le préciser.
 */
export const tclLineId = (code: string) => `${TCL_NETWORK}:${code}`;
export const tclStopId = (id: string) => `${TCL_NETWORK}:${id}`;

/**
 * Le noir ou le blanc, selon ce qui se lit sur la couleur de la ligne.
 *
 * TCL ne publie pas de couleur de texte. La luminance perçue tranche mieux que
 * la moyenne des composantes : l'œil est bien plus sensible au vert qu'au bleu.
 */
function readableTextColor(hex: string | null): string {
  if (!hex || hex.length !== 7) return '#ffffff';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.6 ? '#111827' : '#ffffff';
}

/** Catalogue des lignes, converti au format de l'application. */
export async function getTclLines(options?: { includeSchool?: boolean }): Promise<TclLine[]> {
  const raw = await fetchResource<RawLine[]>('ressource=lignes', 'tclLines_v2', CATALOG_TTL_MS);
  if (!raw) return [];

  const kept = options?.includeSchool ? raw : raw.filter(line => !line.school);

  return kept.map(line => ({
    id: tclLineId(line.code),
    routeId: tclLineId(line.code),
    name: line.terminuses.length >= 2
      ? `${line.terminuses[0]} ↔ ${line.terminuses[line.terminuses.length - 1]}`
      : line.code,
    shortName: line.code,
    type: line.mode,
    color: line.color ?? undefined,
    textColor: readableTextColor(line.color),
    stopCount: line.stopCount,
    hasShape: line.hasShape,
    school: line.school,
  }));
}

/**
 * Quais rattachés à chaque arrêt affiché, et lignes qu'ils desservent.
 *
 * Un arrêt de l'application est un groupe de quais TCL. Sans ce registre, on
 * saurait dessiner le point mais pas quoi lui demander : les passages se
 * publient par quai, jamais par groupe.
 */
const stopMembers = new Map<string, string[]>();
const stopLines = new Map<string, string[]>();

/** Arrêts du réseau, convertis au format de l'application. */
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

  return groups.map(group => group[0]);
}

/** Retire le préfixe réseau : « TCL:2531 » → « 2531 ». */
const localTclId = (id: string) => (id.startsWith(`${TCL_NETWORK}:`) ? id.slice(4) : id);

/** Vrai si cet identifiant désigne un arrêt ou une ligne du réseau lyonnais. */
export const isTclId = (id: string) => String(id).startsWith(`${TCL_NETWORK}:`);

/**
 * Lignes desservant un arrêt.
 *
 * Séparé de la fiche complète parce que la carte en a besoin pour ses
 * étiquettes, et qu'elle n'a que faire des horaires : afficher les badges d'un
 * arrêt ne doit pas déclencher une requête de temps réel par arrêt visible.
 */
let catalogByCode: Map<string, TclLine> | null = null;

/**
 * Catalogue indexé par code, construit une seule fois.
 *
 * Il était reconstruit à chaque ouverture de fiche et à chaque étiquette de la
 * carte — mille entrées réindexées pour lire trois lignes.
 */
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

/**
 * Fiche d'un arrêt : lignes desservies et prochains passages.
 *
 * Les passages sont demandés pour **tous les quais du groupe** en un seul
 * appel — c'est le serveur qui éclate la requête, pas le navigateur.
 */
export async function getTclStopDetail(stopId: string): Promise<StopDetail | null> {
  if (stopMembers.size === 0) await getTclStops();

  const stops = await getTclStops();
  const stop = stops.find(candidate => candidate.id === stopId);
  if (!stop) return null;

  const members = stopMembers.get(stopId) ?? [localTclId(stopId)];
  const byCode = await linesByCode();
  const served = await getTclLinesForStop(stopId);

  let departures: Departure[] = [];
  try {
    const raw = await fetch(`${ENDPOINT}?ressource=passages&arret=${members.join(',')}`);
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

/**
 * Tracé d'une ligne.
 *
 * Demandé à l'unité : la couche complète des bus fait 26 Mo, une ligne en fait
 * vingt kilo-octets. Le filtre est appliqué par le serveur du Grand Lyon.
 */
export async function getTclShape(lineCode: string): Promise<TclShape | null> {
  const code = lineCode.startsWith(`${TCL_NETWORK}:`) ? lineCode.slice(4) : lineCode;
  return fetchResource<TclShape>(
    `ressource=trace&ligne=${encodeURIComponent(code)}`,
    `tclShape_v1_${code}`,
    SHAPE_TTL_MS,
  );
}

/**
 * Tracés au format attendu par la carte.
 *
 * Chaque ligne est demandée à l'unité — vingt kilo-octets contre vingt-six
 * mégaoctets pour la couche entière. Une ligne sans tracé publié est
 * silencieusement absente : `hasShape` du catalogue le disait déjà, et une
 * erreur ici n'apprendrait rien de plus à l'utilisateur.
 */
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

/**
 * Arrêts desservis par des lignes lyonnaises.
 *
 * C'est ce qui permet à la carte de ne garder que la ligne filtrée et ses
 * arrêts, comme à Grenoble. L'information est déjà là — la desserte de chaque
 * arrêt —, il suffit de la lire à l'envers.
 */
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
