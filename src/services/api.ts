import axios from 'axios';
import { localCode, networkOf, providerOf, type ProviderId } from './providers';
import { isSncfLine } from '../utils/lineColors';
import type { Stop, Line, TrafficDetail, Departure, StopDetail } from '../types';
import { idbGet, idbSet, mapWithConcurrency } from './persistentCache';

const TAG_API_BASE = 'https://data.mobilites-m.fr/api/routers/default';


const TAG_HEADERS = {
  
};

export interface RouteLocation {
  id: string;
  label: string;
  lat: number;
  lon: number;
  kind: 'stop' | 'address';
  raw?: any;
}

export interface RouteItinerary {
  dep: string;
  arr: string;
  depName: string;
  arrName: string;
  dur: string;
  direction: string;
  lineKeys: string[];
  legs: Array<{
    mode: string;
    routeShortName?: string;
    route?: string;
    routeId?: string;
    from?: { name?: string };
    to?: { name?: string };
    duration?: number;
  }>;
  allLegs: any[];
  routePath: Array<[number, number]>;
  rawDep?: string;
  rawArr?: string;
}

function decodePolyline(encoded: string): Array<[number, number]> {
  const coordinates: Array<[number, number]> = [];
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
    const deltaLat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    coordinates.push([lng / 1e5, lat / 1e5]);
  }

  return coordinates;
}

async function buildOtpParams(
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number,
  options?: {
    arriveBy?: boolean;
    date?: string;
    time?: string;
    walkReluctance?: number;
    walkSpeed?: number;
  },
): Promise<URLSearchParams> {
  const queryTime = new Date();
  const params = new URLSearchParams({
    fromPlace: `${fromLatitude},${fromLongitude}`,
    toPlace: `${toLatitude},${toLongitude}`,
    arriveBy: options?.arriveBy ? 'true' : 'false',
    time: options?.time || queryTime.toTimeString().slice(0, 5),
    date: options?.date || queryTime.toISOString().slice(0, 10),
    routerId: 'default',
    optimize: 'QUICK',
    walkReluctance: String(options?.walkReluctance ?? 5),
    locale: 'fr',
    mode: 'WALK,TRANSIT',
    showIntermediateStops: 'true',
    minTransferTime: '20',
    transferPenalty: '60',
    walkBoardCost: '300',
    bannedAgencies: 'MCO:MC',
    walkSpeed: String(options?.walkSpeed ?? 1.4),
    numItineraries: '4',
    wheelchair: 'false',
  });
  return params;
}

function parseOtpItinerary(it: any, depName: string, arrName: string): RouteItinerary {
  const depTime = new Date(it.startTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const arrTime = new Date(it.endTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const duration = Math.round((it.duration ?? 0) / 60);
  const transitLegs = Array.isArray(it.legs) ? it.legs.filter((leg: any) => leg.mode !== 'WALK') : [];
  const lineKeys = transitLegs.map((leg: any) => {
    const routeShortName = String(leg.routeShortName || leg.route || leg.routeId || '').replace(/^SEM:/, '').toUpperCase();
    return routeShortName || '?';
  });

  const routePath: Array<[number, number]> = [];
  if (Array.isArray(it.legs)) {
    for (const leg of it.legs) {
      const points = leg?.legGeometry?.points;
      if (typeof points === 'string' && points.length > 0) {
        const decoded = decodePolyline(points);
        routePath.push(...decoded);
      }
    }
  }

  return {
    dep: depTime,
    arr: arrTime,
    depName,
    arrName,
    dur: duration > 0 ? `${duration} min` : '0 min',
    direction: transitLegs.length > 0 ? transitLegs[transitLegs.length - 1]?.to?.name || '?' : '?',
    lineKeys,
    legs: transitLegs,
    allLegs: Array.isArray(it.legs) ? it.legs : [],
    routePath,
  };
}

export async function planItineraries(options: {
  fromLatitude: number;
  fromLongitude: number;
  toLatitude: number;
  toLongitude: number;
  fromName: string;
  toName: string;
  arriveBy?: boolean;
  date?: string;
  time?: string;
  walkReluctance?: number;
  walkSpeed?: number;
}): Promise<RouteItinerary[]> {
  const params = await buildOtpParams(
    options.fromLatitude,
    options.fromLongitude,
    options.toLatitude,
    options.toLongitude,
    {
      arriveBy: options.arriveBy,
      date: options.date,
      time: options.time,
      walkReluctance: options.walkReluctance,
      walkSpeed: options.walkSpeed,
    },
  );

  try {
    const url = `${TAG_API_BASE}/plan?${params.toString()}`;
    const response = await axios.get(url, { headers: TAG_HEADERS });
    const data = response.data;
    const itineraries = Array.isArray(data?.plan?.itineraries) ? data.plan.itineraries : [];
    return itineraries.map((it: any) => parseOtpItinerary(it, options.fromName, options.toName));
  } catch (error) {    return [];
  }
}

// Cache pour stocker l'occupancy par tram (ligne + destination)
const occupancyCache = new Map<string, 'EMPTY' | 'LIGHT' | 'MODERATE' | 'CROWDED'>();

// Helper: Generate random occupancy for mock data
const getRandomOccupancy = (): 'EMPTY' | 'LIGHT' | 'MODERATE' | 'CROWDED' => {
  const rand = Math.random();
  if (rand < 0.25) return 'EMPTY';
  if (rand < 0.6) return 'LIGHT';
  if (rand < 0.85) return 'MODERATE';
  return 'CROWDED';
};

// Helper: Get occupancy for a specific tram (cached)
function getTramOccupancy(lineId: string, destination: string): 'EMPTY' | 'LIGHT' | 'MODERATE' | 'CROWDED' {
  const key = `${lineId}::${destination}`;
  if (!occupancyCache.has(key)) {
    occupancyCache.set(key, getRandomOccupancy());
  }
  return occupancyCache.get(key)!;
}

// Cache simple avec génériques
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 2 * 60 * 1000; // 2 min (plus court pour avoir des données plus fraîches)
// Les départs bougent en permanence : TTL court, indépendant du reste.
const DEPARTURES_CACHE_DURATION = 30 * 1000;
// Le catalogue des lignes ne change qu'au changement de service : TTL long.
const ROUTES_CACHE_DURATION = 6 * 60 * 60 * 1000;
// Snapshot des arrêts en IndexedDB : frais 24 h, réutilisable périmé 7 jours
// (on affiche l'ancien immédiatement et on rafraîchit en tâche de fond).
const STOPS_SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;
const STOPS_SNAPSHOT_KEY = 'stopsSnapshot_v3';
// v2 : les entrées v1 ne contenaient que le réseau SEM et excluaient les
// autres réseaux ainsi que le filtrage des lignes scolaires.
const ROUTES_SNAPSHOT_KEY = 'routes_v2';
const TRAFFIC_LINES_STORAGE_KEY = 'greLines_trafficLinesCache_v1';
const TRAFFIC_LINES_CACHE_TTL_MS = 15 * 60 * 1000;
let trafficLinesCache: Map<string, TrafficDetail[]> | null = null;
let trafficLinesInflight: Promise<Map<string, TrafficDetail[]>> | null = null;
let trafficLinesCacheHydrated = false;
type ClusterRoutesCacheEntry = { routes: any[]; timestamp: number };
const clusterRoutesCache = new Map<string, ClusterRoutesCacheEntry>();
const clusterRoutesInflight = new Map<string, Promise<any[]>>();
const CLUSTER_ROUTES_CACHE_TTL_MS = 30 * 60 * 1000;
type RouteClustersCacheEntry = { clusters: any[]; timestamp: number };
const routeClustersCache = new Map<string, RouteClustersCacheEntry>();
const routeClustersInflight = new Map<string, Promise<any[]>>();
const ROUTE_CLUSTERS_CACHE_TTL_MS = 30 * 60 * 1000;
type StopLinesCacheEntry = { data: Line[]; timestamp: number };
type StopLinesCacheStore = { version: 1; entries: Record<string, StopLinesCacheEntry> };
const stopLinesCache = new Map<string, StopLinesCacheEntry>();
const stopLinesInflight = new Map<string, Promise<Line[]>>();
// v2 : les entrées v1 ne portaient pas `routeId`, sans lequel deux lignes
// homonymes de réseaux différents (« C1 » Chrono et « C1 » TER) se confondent.
const STOP_LINES_CACHE_STORAGE_KEY = 'greLines_stopLinesCache_v2';
const STOP_LINES_CACHE_MAX_ENTRIES = 500;
let stopLinesCacheHydrated = false;

/**
 * Réseaux exposés par l'API MTAG.
 *
 * `defaultEnabled` reflète le rapport intérêt / coût de chargement, mesuré sur
 * l'API (lignes non scolaires → arrêts) :
 *
 *   SEM 54 → 767   C38 24 → 518   TPV 17 → 244   SE2 11 → 238
 *   GSV 20 → 223   SNC 20 → 131   MCO  4 →  46   TRA 14 →  38
 *   BUL  1 →   2   FUN  1 →   2
 *
 * Chaque ligne coûte une requête `/clusters` au tout premier chargement, ensuite
 * tout vient d'IndexedDB.
 */
export interface NetworkDefinition {
  code: string;
  label: string;
  /**
   * Fournisseur qui sert ce réseau. C'est lui qui décide de la forme des
   * identifiants et des endpoints ; le code appelant n'a plus à le deviner.
   */
  provider: ProviderId;
  defaultEnabled: boolean;
  /**
   * Révision du catalogue à laquelle ce réseau est apparu. Sert à n'ajouter
   * qu'un réseau réellement nouveau dans une sélection déjà enregistrée, sans
   * réactiver ceux que l'utilisateur a décochés.
   */
  addedInRevision?: number;
  /**
   * Le seul réseau dont l'endpoint horaires attend un identifiant préfixé
   * « GEN » est SEM ; partout ailleurs l'identifiant de cluster s'utilise tel
   * quel (vérifié sur les dix réseaux).
   */
  usesGenClusterPrefix?: boolean;
}

export const NETWORKS: NetworkDefinition[] = [
  { code: 'SEM', provider: 'mtag', label: 'M réso — Tag', defaultEnabled: true, usesGenClusterPrefix: true },
  { code: 'SE2', provider: 'mtag', label: 'M réso — Tag (suite)', defaultEnabled: true },
  { code: 'GSV', provider: 'mtag', label: 'M réso — Grésivaudan', defaultEnabled: true },
  { code: 'TPV', provider: 'mtag', label: 'M réso — Pays Voironnais', defaultEnabled: true },
  { code: 'BUL', provider: 'mtag', label: 'Bulles de Grenoble', defaultEnabled: true },
  { code: 'FUN', provider: 'mtag', label: 'Funiculaire des Petites Roches', defaultEnabled: true },
  { code: 'TRA', provider: 'mtag', label: 'Transaltitude', defaultEnabled: true },
  { code: 'MCO', provider: 'mtag', label: "M'Covoit ligne+", defaultEnabled: true },
  { code: 'SNC', provider: 'mtag', label: 'TER — SNCF', defaultEnabled: true, addedInRevision: 2 },
  // 222 lignes dont 198 scolaires : de loin le réseau le plus lourd, et le
  // moins utile au quotidien dans l'agglomération. Proposé, mais éteint.
  { code: 'C38', provider: 'mtag', label: 'Cars Région (C38)', defaultEnabled: false },

  // Lyon. Déclaré pour que la couche fournisseur soit exercée par du réel, mais
  // éteint : rien ne le charge encore. L'activer aujourd'hui n'afficherait
  // qu'un réseau vide.
  { code: 'TCL', provider: 'tcl', label: 'TCL — Lyon', defaultEnabled: false, addedInRevision: 3 },
];

/** Réseaux servis par un fournisseur donné. */
export function networksOfProvider(provider: ProviderId): NetworkDefinition[] {
  return NETWORKS.filter(network => network.provider === provider);
}

/**
 * Réseaux actifs relevant de MTAG.
 *
 * Toutes les fonctions de ce fichier interrogent l'API MTAG : leur passer un
 * code qu'elle ne connaît pas produirait des requêtes vouées à l'échec. Ce
 * filtre est le point où les deux mondes se séparent proprement.
 */
function activeMtagNetworks(): string[] {
  const mtag = new Set(networksOfProvider('mtag').map(network => network.code));
  return activeNetworkCodes.filter(code => mtag.has(code));
}

export const DEFAULT_NETWORK_CODES = NETWORKS.filter(n => n.defaultEnabled).map(n => n.code);

/**
 * Réseaux réellement chargés, définis par les réglages au démarrage.
 *
 * Cette valeur sert de défaut à toutes les fonctions qui résolvent un arrêt
 * (`getStopDetail`, `getAllStops`…). Sans elle, ouvrir un favori appartenant à
 * un réseau que l'utilisateur vient d'activer renvoyait `null` — donc aucun
 * prochain passage — parce que la recherche se faisait dans la sélection par
 * défaut et non dans la sienne.
 */
let activeNetworkCodes: string[] = [...DEFAULT_NETWORK_CODES];

export function setActiveNetworks(codes: string[]): void {
  if (codes.length === 0) return;
  activeNetworkCodes = [...codes];
}

export function getActiveNetworks(): string[] {
  return activeNetworkCodes;
}

/**
 * Traduit le mode GTFS en type d'affichage.
 *
 * `RAIL` couvre les TER et les TGV ; le funiculaire et la télécabine sont
 * rangés avec le tramway, dont ils partagent le principe — une voie dédiée,
 * des horaires cadencés.
 */
function modeToDepartureType(mode: string | undefined): 'BUS' | 'TRAM' | 'RAIL' | 'METRO' {
  switch (String(mode ?? '').toUpperCase()) {
    case 'SUBWAY':
      return 'METRO';
    case 'RAIL':
      return 'RAIL';
    case 'TRAM':
    case 'FUNICULAR':
    case 'CABLE_CAR':
    case 'GONDOLA':
      return 'TRAM';
    default:
      return 'BUS';
  }
}

const HIDDEN_TRAFFIC_LINES = new Set(['C38']);

/** Réseaux dont les identifiants d'arrêt prennent le préfixe « GEN ». */
const GEN_PREFIX_NETWORKS = new Set(
  NETWORKS.filter(n => n.usesGenClusterPrefix).map(n => n.code),
);

function normalizeRouteCode(value: string): string {
  // Le dépouillement dépend du fournisseur : MTAG retire « SEM: », TCL isole
  // le code au milieu d'un identifiant NeTEx.
  return localCode(value);
}

function formatRouteId(value: string, network: string = 'SEM'): string {
  const raw = String(value);
  return networkOf(raw) ? raw : `${network}:${raw}`;
}

function formatClusterId(stopId: string): string {
  const raw = String(stopId);
  // Un identifiant d'un autre fournisseur ne se réécrit pas : la notion de
  // cluster préfixé n'existe que chez MTAG.
  if (providerOf(raw)?.id === 'tcl') return raw;

  const network = networkOf(raw);

  if (!network) return `SEM:GEN${raw}`;
  if (!GEN_PREFIX_NETWORKS.has(network)) return raw;
  return raw.startsWith(`${network}:GEN`) ? raw : `${network}:GEN${raw.substring(4)}`;
}

/**
 * Les lignes scolaires (type `SCOL`) ne circulent que deux fois par jour en
 * période scolaire. Elles représentent 271 des 437 lignes du réseau et environ
 * 1 500 arrêts : les écarter divise par deux le chargement initial sans rien
 * retirer d'utile à une appli de temps réel.
 */
function isSchoolRoute(type: unknown): boolean {
  return String(type || '').toUpperCase().includes('SCOL');
}

function getClusterIdsForStopId(stopId: string): string[] {
  const entry = stopsWithClusterCache.get(stopId);
  if (entry?.clusterIds?.length) {
    return Array.from(new Set(entry.clusterIds));
  }
  return [formatClusterId(stopId)];
}

function getFromCache<T>(key: string, ttlMs: number = CACHE_DURATION): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < ttlMs) {
    return entry.data as T;
  }
  cache.delete(key);
  return null;
}

function setCache(key: string, data: any) {
  cache.set(key, { data, timestamp: Date.now() });
}

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function getCachedClusterRoutes(clusterId: string): any[] | null {
  const entry = clusterRoutesCache.get(clusterId);
  if (entry && Date.now() - entry.timestamp < CLUSTER_ROUTES_CACHE_TTL_MS) {
    return entry.routes;
  }
  clusterRoutesCache.delete(clusterId);
  return null;
}

function setCachedClusterRoutes(clusterId: string, routes: any[]): void {
  clusterRoutesCache.set(clusterId, { routes, timestamp: Date.now() });
}

function getCachedRouteClusters(routeRef: string): any[] | null {
  const entry = routeClustersCache.get(routeRef);
  if (entry && Date.now() - entry.timestamp < ROUTE_CLUSTERS_CACHE_TTL_MS) {
    return entry.clusters;
  }
  routeClustersCache.delete(routeRef);
  return null;
}

function setCachedRouteClusters(routeRef: string, clusters: any[]): void {
  routeClustersCache.set(routeRef, { clusters, timestamp: Date.now() });
}

function hydrateTrafficLinesCache(): void {
  if (trafficLinesCacheHydrated) return;
  trafficLinesCacheHydrated = true;
  if (!canUseLocalStorage()) return;
  try {
    const raw = window.localStorage.getItem(TRAFFIC_LINES_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { timestamp?: number; entries?: Array<[string, TrafficDetail[]]> } | null;
    if (!parsed || typeof parsed.timestamp !== 'number' || !Array.isArray(parsed.entries)) return;
    if (Date.now() - parsed.timestamp > TRAFFIC_LINES_CACHE_TTL_MS) return;
    trafficLinesCache = new Map(
      parsed.entries.filter(([key, value]) => typeof key === 'string' && Array.isArray(value))
    );
  } catch {
    // Ignore corrupted cache and rebuild lazily.
  }
}

function persistTrafficLinesCache(map: Map<string, TrafficDetail[]>): void {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.setItem(TRAFFIC_LINES_STORAGE_KEY, JSON.stringify({
      timestamp: Date.now(),
      entries: Array.from(map.entries()),
    }));
  } catch {
    // Ignore quota issues.
  }
}

function hydrateStopLinesCache(): void {
  if (stopLinesCacheHydrated) return;
  stopLinesCacheHydrated = true;
  if (!canUseLocalStorage()) return;
  try {
    const raw = window.localStorage.getItem(STOP_LINES_CACHE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<StopLinesCacheStore> | null;
    if (!parsed || parsed.version !== 1 || !parsed.entries || typeof parsed.entries !== 'object') return;
    stopLinesCache.clear();
    for (const [stopId, entry] of Object.entries(parsed.entries)) {
      if (!entry || !Array.isArray(entry.data) || typeof entry.timestamp !== 'number') continue;
      stopLinesCache.set(stopId, { data: entry.data as Line[], timestamp: entry.timestamp });
    }
  } catch {
    // Ignore corrupted cache and rebuild lazily.
  }
}

function persistStopLinesCache(): void {
  if (!canUseLocalStorage()) return;
  try {
    const entries = Array.from(stopLinesCache.entries())
      .sort((a, b) => b[1].timestamp - a[1].timestamp)
      .slice(0, STOP_LINES_CACHE_MAX_ENTRIES);
    const payload: StopLinesCacheStore = {
      version: 1,
      entries: Object.fromEntries(entries),
    };
    window.localStorage.setItem(STOP_LINES_CACHE_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // If storage is full or unavailable, we simply keep the in-memory cache.
  }
}

function getStopLinesCacheEntry(stopId: string): StopLinesCacheEntry | null {
  hydrateStopLinesCache();
  return stopLinesCache.get(stopId) ?? null;
}

export function getCachedStopLines(stopId: string): Line[] | null {
  return getStopLinesCacheEntry(stopId)?.data ?? null;
}

function setStopLinesCache(stopId: string, data: Line[]): void {
  hydrateStopLinesCache();
  stopLinesCache.set(stopId, { data, timestamp: Date.now() });
  persistStopLinesCache();
}

function stopLineSignature(line: Line): string {
  return [
    line.id,
    line.shortName || '',
    line.name || '',
    line.type || '',
    line.color || '',
    line.textColor || '',
  ].join('|');
}

function areStopLinesEqual(a: Line[], b: Line[]): boolean {
  if (a.length !== b.length) return false;
  const sigA = a.map(stopLineSignature).sort();
  const sigB = b.map(stopLineSignature).sort();
  return sigA.every((sig, idx) => sig === sigB[idx]);
}

/**
 * Clé de comparaison des noms d'arrêts : sans accents, sans casse et sans
 * ponctuation. « Berriat-Le Magasin », « Berriat - Le Magasin » et « BERRIAT LE
 * MAGASIN » donnent la même clé, ce qui compte maintenant que les réseaux
 * n'écrivent pas leurs arrêts de la même façon (le Pays Voironnais est tout en
 * capitales, la SNCF préfixe ses gares).
 */
function normalizeStopName(value: string | undefined | null): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Rayon de fusion de deux arrêts homonymes, en mètres. */
const STOP_MERGE_RADIUS_METERS = 300;
const METRES_PER_DEG_LAT = 111320;
const METRES_PER_DEG_LON_AT_45 = 78710;

function stopDistanceMeters(a: Stop, b: Stop): number {
  const dLat = (a.lat - b.lat) * METRES_PER_DEG_LAT;
  const dLon = (a.lon - b.lon) * METRES_PER_DEG_LON_AT_45;
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

/**
 * Regroupe les arrêts qui portent le même nom **et** se trouvent à moins de
 * 300 m l'un de l'autre.
 *
 * L'ancienne règle comparait nom + ville, ce qui échouait dès qu'on a ouvert
 * les autres réseaux : la même gare renvoyée par Tag et par la SNCF ne porte
 * pas la même ville, et deux arrêts homonymes distants de vingt kilomètres
 * (« Mairie », « Église ») pouvaient fusionner s'ils partageaient la ville.
 * La distance tranche les deux cas d'un coup.
 */
/**
 * Regroupe les arrêts de même nom situés à moins de 300 m.
 *
 * Exporté parce que la règle vaut pour tout réseau, quel qu'en soit le
 * fournisseur : un quai n'est pas un arrêt, et « Bellecour A. Poncet » n'a pas
 * à apparaître cinq fois sur la carte parce que cinq lignes s'y arrêtent.
 */
export function groupNearbyStopsByName(stops: Stop[]): Stop[][] {
  const byName = new Map<string, Stop[]>();
  for (const stop of stops) {
    const key = normalizeStopName(stop.name);
    const bucket = byName.get(key);
    if (bucket) bucket.push(stop);
    else byName.set(key, [stop]);
  }

  const groups: Stop[][] = [];
  for (const bucket of byName.values()) {
    if (bucket.length === 1) {
      groups.push(bucket);
      continue;
    }
    // Agrégation gloutonne : chaque arrêt rejoint le premier groupe dont un
    // membre est assez proche, sinon il en ouvre un nouveau.
    const clusters: Stop[][] = [];
    for (const stop of bucket) {
      const target = clusters.find(cluster =>
        cluster.some(member => stopDistanceMeters(member, stop) <= STOP_MERGE_RADIUS_METERS));
      if (target) target.push(stop);
      else clusters.push([stop]);
    }
    groups.push(...clusters);
  }
  return groups;
}

/**
 * Récupère les lignes sous impact trafic à partir de l'API de trafic
 */
export async function getTrafficLines(): Promise<Map<string, TrafficDetail[]>> {
  hydrateTrafficLinesCache();
  if (trafficLinesCache) return new Map(trafficLinesCache);
  if (trafficLinesInflight) return trafficLinesInflight;

  trafficLinesInflight = (async () => {
    try {
    const resp = await axios.get('https://data.mobilites-m.fr/api/dyn/evtTC/json');
    const data = resp.data || {};

    const trafficMap = new Map<string, TrafficDetail[]>();

    const addDetail = (lineCode: string, info: any) => {
      const line = normalizeRouteCode(String(lineCode)).trim().toUpperCase();
      if (!line) return;
      if (HIDDEN_TRAFFIC_LINES.has(line)) return;
      const details: TrafficDetail = {
        titre: String(info.titre || ''),
        description: String(info.description || ''),
        dateFin: String(info.dateFin || ''),
        listeLigne: String(info.listeLigne || ''),
      };
      const existing = trafficMap.get(line) || [];
      existing.push(details);
      trafficMap.set(line, existing);
    };

    // cas 1: format object de clés dynamiques
    if (typeof data === 'object' && !Array.isArray(data)) {
      for (const key of Object.keys(data)) {
        if (!data[key] || typeof data[key] !== 'object') continue;
        const info = data[key];
        if (info.listeLigne) {
          const raw = String(info.listeLigne).split('_').map((s: string) => s.trim()).filter(Boolean);
          for (const lineCode of raw) {
            addDetail(lineCode, info);
          }
        }
        // parfois la propriété peut venir de listeInfos
        if (Array.isArray(info.listeLigne)) {
          (info.listeLigne as string[]).forEach((lineCode) => addDetail(lineCode, info));
        }
      }
    }

    // cas 2: format générique tableau
    const listeInfos = data?.listeInfos;
    if (Array.isArray(listeInfos)) {
      for (const info of listeInfos) {
        if (!info?.listeLigne) continue;
        const raw = String(info.listeLigne).split('_').map((s: string) => s.trim()).filter(Boolean);
        raw.forEach((lineCode: string) => addDetail(lineCode, info));
      }
    }

    trafficLinesCache = trafficMap;
    persistTrafficLinesCache(trafficMap);
    return new Map(trafficMap);
  } catch (err) {
    return trafficLinesCache ? new Map(trafficLinesCache) : new Map();
  } finally {
    trafficLinesInflight = null;
  }
  })();

  return trafficLinesInflight;
}

/**
 * Charge toutes les lignes
 */
async function loadRoutes(): Promise<Line[]> {
  const cacheKey = 'routes';
  const cached = getFromCache<Line[]>(cacheKey, ROUTES_CACHE_DURATION);
  if (cached) return cached;

  // Deuxième niveau : IndexedDB. Évite de refaire la requête à chaque
  // rechargement de page, pas seulement pendant la session courante.
  const persisted = await idbGet<Line[]>(ROUTES_SNAPSHOT_KEY);
  if (persisted && Array.isArray(persisted.value) && persisted.value.length > 0) {
    setCache(cacheKey, persisted.value);
    return persisted.value;
  }

  try {    const res = await axios.get(`${TAG_API_BASE}/index/routes`, { headers: TAG_HEADERS });
    const routes = res.data || [];

    const trafficLines = await getTrafficLines();

    const lines = routes
      // Toutes les lignes de tous les réseaux sont conservées ici : le tri par
      // réseau se fait plus tard, selon la sélection de l'utilisateur. Seules
      // les lignes scolaires sont écartées d'emblée.
      .filter((r: any) => networkOf(String(r?.id || '')) !== null && !isSchoolRoute(r?.type))
      .map((route: any) => {
        const routeId = String(route.id);
        const id = normalizeRouteCode(routeId);
        const details = isSncfLine(routeId) ? [] : (trafficLines.get(id) || []);
        return {
          id,
          routeId,
          name: route.longName || route.shortName || id,
          shortName: route.shortName || id,
          // Une ligne SNCF est un train, même quand l'API l'annonce en autocar :
          // c'est un quai de gare et un autre titre de transport.
          type: isSncfLine(routeId) ? 'RAIL' : (route.type || 'BUS'),
          color: route.color || '#666666',
          hasTraffic: details.length > 0,
          trafficDetails: details,
        } satisfies Line;
      });

    setCache(cacheKey, lines);
    void idbSet(ROUTES_SNAPSHOT_KEY, lines, ROUTES_CACHE_DURATION);
    return lines;
  } catch (err) {    return [];
  }
}

async function loadClusterRoutes(clusterId: string): Promise<any[]> {
  const cached = getCachedClusterRoutes(clusterId);
  if (cached) return cached;
  if (clusterRoutesInflight.has(clusterId)) {
    return clusterRoutesInflight.get(clusterId)!;
  }

  const promise = (async () => {
    try {
      const response = await axios.get(
        `${TAG_API_BASE}/index/clusters/${clusterId}/routes`,
        { headers: TAG_HEADERS }
      );
      const routes = Array.isArray(response.data) ? response.data : [];
      setCachedClusterRoutes(clusterId, routes);
      return routes;
    } catch {
      return getCachedClusterRoutes(clusterId) || [];
    } finally {
      clusterRoutesInflight.delete(clusterId);
    }
  })();

  clusterRoutesInflight.set(clusterId, promise);
  return promise;
}

async function loadRouteClusters(routeRef: string): Promise<any[]> {
  const cached = getCachedRouteClusters(routeRef);
  if (cached) return cached;
  if (routeClustersInflight.has(routeRef)) {
    return routeClustersInflight.get(routeRef)!;
  }

  const promise = (async () => {
    try {
      const res = await axios.get(`${TAG_API_BASE}/index/routes/${routeRef}/clusters`, {
        headers: TAG_HEADERS,
      });
      const clusters = Array.isArray(res.data) ? res.data : [];
      setCachedRouteClusters(routeRef, clusters);
      return clusters;
    } catch {
      return getCachedRouteClusters(routeRef) || [];
    } finally {
      routeClustersInflight.delete(routeRef);
    }
  })();

  routeClustersInflight.set(routeRef, promise);
  return promise;
}

function lineMatchesPrefixes(line: Line, prefixes: string[]): boolean {
  if (!line.routeId) return false;
  return prefixes.some(prefix => line.routeId?.startsWith(`${prefix}:`) || line.routeId?.startsWith(`${prefix}_`));
}

async function buildStopsFromLines(lines: Line[]): Promise<Stop[]> {
  const stopsMap = new Map<string, Stop>();

  // Auparavant cette boucle était séquentielle : une centaine de requêtes
  // `/clusters` enchaînées une par une, soit plusieurs dizaines de secondes
  // avant le premier arrêt affiché. On les lance par paquets de 8.
  const clustersPerLine = await mapWithConcurrency(lines, 8, async (line) => {
    try {
      const routeRef = line.routeId ?? formatRouteId(line.id, networkOf(line.routeId || '') || 'SEM');
      return await loadRouteClusters(routeRef);
    } catch {
      return [];
    }
  });

  for (const clusters of clustersPerLine) {
    for (const c of clusters) {
      const stopId = c.id;
      const clusterId = formatClusterId(stopId);

      if (!stopId || stopsMap.has(stopId)) continue;

      const stop: Stop = {
        id: stopId,
        name: c.name || 'Sans nom',
        lat: c.lat ?? 0,
        lon: c.lon ?? 0,
        city: c.city || 'Grenoble',
        clusterGtfsId: clusterId,
      };

      stopsMap.set(stopId, stop);
    }
  }

  const stopGroups = groupNearbyStopsByName([...stopsMap.values()]).map(members => ({
    stopIds: members.map(stop => stop.id),
    clusterIds: new Set(members.map(stop => stop.clusterGtfsId).filter(Boolean) as string[]),
  }));

  const mergedStops: Stop[] = [];
  const newCache = new Map<string, StopWithCluster>();

  for (const group of stopGroups.values()) {
    const canonicalStop = stopsMap.get(group.stopIds[0])!;
    const mergedClusterIds = Array.from(group.clusterIds).filter(Boolean);

    if (group.stopIds.length > 1) {
      // Combine similar stops into one without extra console noise
    }

    if (mergedClusterIds.length > 0) {
      canonicalStop.clusterGtfsId = mergedClusterIds[0];
    }

    mergedStops.push(canonicalStop);

    const entry: StopWithCluster = {
      stop: canonicalStop,
      clusterIds: mergedClusterIds.length > 0 ? mergedClusterIds : [canonicalStop.clusterGtfsId || canonicalStop.id],
    } as any;

    for (const stopId of group.stopIds) {
      newCache.set(stopId, entry);
    }
  }

  stopsWithClusterCache = newCache;
  return mergedStops;
}

// Cache global : stopId → { stop, clusterIds }
type StopWithCluster = { stop: Stop; clusterIds: string[] };
let stopsWithClusterCache = new Map<string, StopWithCluster>();

/**
 * Forme sérialisable de l'état "arrêts + clusters".
 *
 * `stopsWithClusterCache` fait pointer plusieurs stopId vers une même entrée
 * canonique (les arrêts homonymes sont fusionnés). On sépare donc la liste des
 * arrêts canoniques, leurs clusterIds, et la table d'alias — sinon chaque arrêt
 * fusionné serait dupliqué dans le JSON.
 */
type StopsSnapshot = {
  stops: Stop[];
  clusterIdsByStop: Record<string, string[]>;
  aliases: Record<string, string>;
};

function snapshotFromState(stops: Stop[]): StopsSnapshot {
  const clusterIdsByStop: Record<string, string[]> = {};
  const aliases: Record<string, string> = {};
  for (const [stopId, entry] of stopsWithClusterCache) {
    aliases[stopId] = entry.stop.id;
    clusterIdsByStop[entry.stop.id] = entry.clusterIds;
  }
  return { stops, clusterIdsByStop, aliases };
}

function restoreSnapshot(snapshot: StopsSnapshot): Stop[] | null {
  if (!snapshot || !Array.isArray(snapshot.stops) || snapshot.stops.length === 0) return null;

  const byId = new Map(snapshot.stops.map((stop) => [stop.id, stop]));
  const restored = new Map<string, StopWithCluster>();

  for (const [stopId, canonicalId] of Object.entries(snapshot.aliases || {})) {
    const stop = byId.get(canonicalId);
    if (!stop) continue;
    const clusterIds = snapshot.clusterIdsByStop?.[canonicalId];
    restored.set(stopId, {
      stop,
      clusterIds: clusterIds?.length ? clusterIds : [stop.clusterGtfsId || stop.id],
    });
  }

  if (restored.size === 0) return null;
  stopsWithClusterCache = restored;
  return snapshot.stops;
}

const stopsInflight = new Map<string, Promise<Stop[]>>();

async function fetchStopsByPrefixes(prefixes: string[]): Promise<Stop[]> {
  const lines = await loadRoutes();
  const filtered = lines.filter((line) => lineMatchesPrefixes(line, prefixes));
  return await buildStopsFromLines(filtered);
}

/**
 * Point d'entrée unique pour le catalogue d'arrêts.
 *
 * Trois niveaux, du plus rapide au plus lent :
 *   1. mémoire (instantané, durée de session)
 *   2. IndexedDB (quelques ms, survit au rechargement) — servi même périmé,
 *      avec revalidation en tâche de fond
 *   3. réseau (~100 requêtes MTAG, plusieurs secondes)
 *
 * Les appels concurrents partagent la même promesse : ouvrir la carte et la
 * recherche en même temps ne déclenche plus deux fois le même travail.
 */
export async function getStopsByPrefixes(prefixes: string[]): Promise<Stop[]> {
  const sorted = [...prefixes].sort();
  const memoryKey = `all_stops_${sorted.join(',')}`;
  const persistKey = `${STOPS_SNAPSHOT_KEY}_${sorted.join(',')}`;

  const cached = getFromCache<Stop[]>(memoryKey, STOPS_SNAPSHOT_TTL_MS);
  if (cached) return cached;

  const inflight = stopsInflight.get(memoryKey);
  if (inflight) return inflight;

  const promise = (async () => {
    const persisted = await idbGet<StopsSnapshot>(persistKey, { allowStale: true });
    if (persisted) {
      const stops = restoreSnapshot(persisted.value);
      if (stops) {
        setCache(memoryKey, stops);
        if (persisted.stale) {
          // Snapshot périmé : on rend la main tout de suite avec les anciennes
          // données et on rafraîchit derrière.
          void revalidateStops(memoryKey, persistKey, sorted);
        }
        return stops;
      }
    }

    const stops = await fetchStopsByPrefixes(sorted);
    if (stops.length > 0) {
      setCache(memoryKey, stops);
      void idbSet(persistKey, snapshotFromState(stops), STOPS_SNAPSHOT_TTL_MS);
    }
    return stops;
  })().finally(() => {
    stopsInflight.delete(memoryKey);
  });

  stopsInflight.set(memoryKey, promise);
  return promise;
}

async function revalidateStops(memoryKey: string, persistKey: string, prefixes: string[]): Promise<void> {
  try {
    const fresh = await fetchStopsByPrefixes(prefixes);
    if (fresh.length === 0) return;
    setCache(memoryKey, fresh);
    void idbSet(persistKey, snapshotFromState(fresh), STOPS_SNAPSHOT_TTL_MS);
  } catch {
    // On garde le snapshot périmé : mieux que rien.
  }
}

/**
 * Charge tous les arrêts + leur clusterId réel
 * → c'est ici qu'on corrige le principal problème
 */
export async function getAllStops(prefixes: string[] = activeMtagNetworks()): Promise<Stop[]> {
  try {
    // Toute la logique de cache (mémoire → IndexedDB → réseau) et la
    // déduplication des appels concurrents vivent dans getStopsByPrefixes.
    return await getStopsByPrefixes(prefixes);
  } catch {
    return [];
  }
}

/**
 * Récupère les prochains passages pour un arrêt
 * @param skipCache - Si true, ignore le cache et force une mise à jour
 */
export async function getDepartures(stopId: string, skipCache: boolean = false): Promise<Departure[]> {
  const cacheKey = `departures_${stopId}`;
  
  if (!skipCache) {
    const cached = getFromCache<Departure[]>(cacheKey, DEPARTURES_CACHE_DURATION);
    if (cached) {      return cached;
    }
  } else {  }

  try {
    // Étape critique : trouver les BONNES cluster IDs
    let clusterIds = [stopId];

    if (stopsWithClusterCache.has(stopId)) {
      clusterIds = getClusterIdsForStopId(stopId);
    } else {
      // fallback : on recharge tout (pas idéal mais évite plantage)
      await getAllStops();
      if (stopsWithClusterCache.has(stopId)) {
        clusterIds = getClusterIdsForStopId(stopId);
      } else {
        clusterIds = [formatClusterId(stopId)];
      }
    }const departures: Departure[] = [];
    const seen = new Set<string>();

    // Un arrêt fusionné peut couvrir plusieurs clusters : on interroge tous
    // les clusters en parallèle plutôt qu'en file d'attente.
    const responses = await Promise.all(
      clusterIds.map(async (clusterId) => {
        try {
          const url = `${TAG_API_BASE}/index/clusters/${clusterId}/stoptimes`;
          const res = await axios.get(url, { headers: TAG_HEADERS });
          return { clusterId, data: res.data };
        } catch {
          return { clusterId, data: null };
        }
      }),
    );

    for (const { clusterId, data } of responses) {
      if (!Array.isArray(data)) {        continue;
      }

      const now = Date.now() / 1000;

      for (const patternGroup of data) {
        const pattern = patternGroup.pattern ?? {};
        const times = patternGroup.times ?? patternGroup.stoptimes ?? [];

        if (!Array.isArray(times)) continue;

        let lineId = '??';
        if (pattern.routeId) {
          lineId = normalizeRouteCode(String(pattern.routeId));
        } else if (typeof pattern.id === 'string') {
          const parts = pattern.id.split(':');
          if (parts.length > 1) lineId = parts[1];
        }

        const destination = pattern.headsign || pattern.lastStopName || pattern.name || 'Direction inconnue';

        for (const t of times) {
          const serviceDay = t.serviceDay ?? 0;
          const scheduled = t.scheduledDeparture ?? 0;
          const realtime = t.realtimeDeparture ?? scheduled;

          const depUnix = serviceDay + realtime;
          const minutes = Math.round((depUnix - now) / 60);

          if (depUnix < now - 300) continue;

          const key = `${clusterId}|${lineId}|${destination}|${depUnix}|${pattern.mode}`;
          if (seen.has(key)) continue;
          seen.add(key);

          departures.push({
            lineId,
            routeId: pattern.routeId ? String(pattern.routeId) : undefined,
            lineName: pattern.longName ?? pattern.name ?? '',
            lineShortName: pattern.shortName ?? lineId,
            destination,
            departureTime: minutes,
            realtime: t.realtimeArrival !== undefined || t.realtimeDeparture !== undefined,
            // Le mode vient du réseau, pas du préfixe : le TER exploite aussi
            // des autocars de substitution, qui restent des bus.
            // Un TER reste un train même si l'API annonce l'autocar de
            // substitution : le voyageur va en gare, pas à un arrêt de bus.
            type: pattern.routeId && isSncfLine(String(pattern.routeId))
              ? 'RAIL'
              : modeToDepartureType(pattern.mode),
            occupancy: getTramOccupancy(lineId, destination),
          });
        }
      }
    }

    departures.sort((a, b) => a.departureTime - b.departureTime);

    setCache(cacheKey, departures);    return departures;
  } catch (err: any) {return [];
  }
}


/**
 * Get all lines serving a specific stop
 */
export async function getStopLines(stopId: string): Promise<Line[]> {
  // Lyon a son propre fournisseur : les lignes d'un arrêt lyonnais ne se
  // demandent pas à l'API grenobloise. Cette porte unique évite d'avoir à y
  // penser à chaque appelant — carte, fiche d'arrêt, favoris.
  if (providerOf(stopId)?.id === 'tcl') {
    const { getTclLinesForStop } = await import('./tclNetwork');
    return getTclLinesForStop(stopId);
  }

  const cached = getStopLinesCacheEntry(stopId);
  if (cached) return cached.data;
  if (stopLinesInflight.has(stopId)) {
    return stopLinesInflight.get(stopId)!;
  }

  const promise = (async () => {
    try {
      const clusterIds = getClusterIdsForStopId(stopId);
      const trafficLines = await getTrafficLines();
      const routeMap = new Map<string, Line>();

      for (const clusterId of clusterIds) {
        try {
          const routes = await loadClusterRoutes(clusterId);

          for (const route of routes) {
            const routeId = String(route.id);
            const lineId = normalizeRouteCode(routeId);
            // Indexé sur l'identifiant complet : « SEM:C1 » (Chrono 1) et
            // « SNC:C1 » (car TER) desservent tous deux la gare de Grenoble,
            // et le code nu les confondrait en une seule ligne.
            if (routeMap.has(routeId)) continue;

            // L'infotrafic MTAG ne couvre que le réseau grenoblois : sans ce
            // garde-fou, la « C1 » du TER héritait des perturbations de la
            // Chrono 1, qu'elle ne croise qu'en gare.
            const details = isSncfLine(routeId) ? [] : (trafficLines.get(lineId) || []);
            routeMap.set(routeId, {
              id: lineId,
              routeId,
              name: route.longName || route.shortName || lineId,
              shortName: route.shortName || lineId,
              type: isSncfLine(routeId) ? 'RAIL' : (route.type || 'BUS'),
              color: route.color || '#666666',
              hasTraffic: details.length > 0,
              trafficDetails: details,
            } satisfies Line);
          }
        } catch (error) {}
      }

      const lines = Array.from(routeMap.values());
      setStopLinesCache(stopId, lines);
      return lines;
    } catch (error) {
      return getStopLinesCacheEntry(stopId)?.data ?? [];
    } finally {
      stopLinesInflight.delete(stopId);
    }
  })();

  stopLinesInflight.set(stopId, promise);
  return promise;
}

export async function refreshStopLines(stopId: string): Promise<{ lines: Line[]; changed: boolean }> {
  const previous = getStopLinesCacheEntry(stopId)?.data ?? [];

  try {
    const clusterIds = getClusterIdsForStopId(stopId);
    const trafficLines = await getTrafficLines();
    const routeMap = new Map<string, Line>();

    for (const clusterId of clusterIds) {
      try {
        const routes = await loadClusterRoutes(clusterId);

        for (const route of routes) {
          const routeId = String(route.id);
          const lineId = normalizeRouteCode(routeId);
          if (routeMap.has(routeId)) continue;

          const details = isSncfLine(routeId) ? [] : (trafficLines.get(lineId) || []);
          routeMap.set(routeId, {
            id: lineId,
            routeId,
            name: route.longName || route.shortName || lineId,
            shortName: route.shortName || lineId,
            type: isSncfLine(routeId) ? 'RAIL' : (route.type || 'BUS'),
            color: route.color || '#666666',
            hasTraffic: details.length > 0,
            trafficDetails: details,
          } satisfies Line);
        }
      } catch (error) {}
    }

    const lines = Array.from(routeMap.values());
    const changed = !areStopLinesEqual(previous, lines);
    setStopLinesCache(stopId, lines);
    return { lines, changed };
  } catch {
    return { lines: previous, changed: false };
  }
}

export async function getStopDetail(stopId: string, prefixes: string[] = activeMtagNetworks()): Promise<StopDetail | null> {
  try {
    const stops = await getAllStops(prefixes);
    let stop = stops.find(s => s.id === stopId);
    if (!stop) {
      const candidates = new Set<string>([stopId]);
      for (const prefix of activeMtagNetworks()) {
        if (!stopId.startsWith(`${prefix}:`)) {
          candidates.add(`${prefix}:${stopId}`);
        }
      }
      stop = stops.find(s => candidates.has(s.id) || s.clusterGtfsId === stopId);
    }
    if (!stop && stopsWithClusterCache.has(stopId)) {
      stop = stopsWithClusterCache.get(stopId)!.stop;
    }
    if (!stop) return null;

    // Lignes desservies et prochains passages sont indépendants : les deux
    // requêtes partent ensemble au lieu de s'attendre.
    const [lines, departures] = await Promise.all([
      getStopLines(stop.id),
      getDepartures(stop.id),
    ]);
    return {
      ...stop,
      lines,
      departures,
      lastUpdate: new Date(),
    };
  } catch (err) {    return null;
  }
}

/**
 * Rafraîchit UNIQUEMENT les départs pour un arrêt connu
 * (sans recharger les routes) - utilisé pour la mise à jour périodique
 */
export async function refreshStopDepartures(stopDetail: StopDetail): Promise<StopDetail> {
  // Un arrêt lyonnais ne se rafraîchit pas contre l'API grenobloise : elle ne
  // le connaît pas et rend une liste vide, qui effaçait les passages qu'on
  // venait d'obtenir. Le rafraîchissement passe par son propre fournisseur.
  if (providerOf(stopDetail.id)?.id === 'tcl') {
    const { getTclStopDetail } = await import('./tclNetwork');
    return (await getTclStopDetail(stopDetail.id)) ?? stopDetail;
  }

  try {    // Bypass le cache pour avoir les données fraiches
    const departures = await getDepartures(stopDetail.id, true);

    // L'occupancy est déjà fixée dans getDepartures, pas besoin de la régénérer

    return {
      ...stopDetail,
      departures,
      lastUpdate: new Date(),
    };
  } catch (err) {    return stopDetail;
  }
}

/**
 * Search stops by name
 */
export async function searchStops(query: string): Promise<Stop[]> {
  if (!query.trim()) {
    return [];
  }

  try {
    const allStops = await getAllStops();
    const lowerQuery = query.toLowerCase();

    return allStops.filter(
      stop =>
        stop.name.toLowerCase().includes(lowerQuery) ||
        (stop.city?.toLowerCase().includes(lowerQuery) ?? false)
    );
  } catch (error) {    return [];
  }
}

/**
 * Format departure time for display
 */
export function formatDepartureTime(departure: Departure, locale: 'fr' | 'en' = 'en'): string {
  const minutes = departure.departureTime;

  if (minutes < 0) {
    return locale === 'fr' ? 'Passé' : 'Passed';
  } else if (minutes === 0) {
    return locale === 'fr' ? 'ARR' : 'Now';
  } else if (minutes < 60) {
    return `${minutes}m`;
  } else {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h${mins.toString().padStart(2, '0')}` : `${hours}h`;
  }
}
