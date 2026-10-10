import gtfsNetworks from '../data/siteNetworks';
import { IS_CITY_SITE, SITE_HAS_SNCF, SITE_NETWORK } from '../site';
import type { SharedOperator } from './sharedMobility';
import axios from 'axios';
import { stripHtml } from '../utils/stripHtml';
import { localCode, networkOf, providerOf, type ProviderId } from './providers';
import { isSncfLine } from '../utils/lineColors';
import type { Stop, Line, TrafficDetail, Departure, StopDetail } from '../types';
import { idbGet, idbSet, mapWithConcurrency } from './persistentCache';
import { buildLineLookup, getAllSemLines } from './allLines';
import {
  dayKindOf,
  isOffline,
  midnight,
  readDaySchedule,
  saveDaySchedule,
  scheduleDepartures,
  toScheduleDate,
  type DaySchedule,
  type SchedulePattern,
} from './offlineSchedule';

import { isInGrenobleArea, planTransitousOtp } from './transitous';
import { haversineMeters } from '../utils/geo';
import { applySncfToItineraries } from './sncfLive';
import { clockOf, keepCatchable } from './catchable';
import { getSncfStationLines, getSncfStopDetail } from './sncfNetwork';
import { tx } from '../i18n';

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

export interface SharedJourneyInfo {
  operator: SharedOperator;
  formFactor: string;
  accessMeters: number;
  rideMinutes: number;
  rideMeters: number;
  pickupName?: string;
  batteryPercent?: number;
  batteryEstimated?: boolean;
  model?: string;
  propulsion?: string;
  rentalUrl?: string;
  price: {
    total: number;
    unlock: number | null;
    usageRate: number | null;
    usageIntervalMinutes: number;
    perKmRate: number | null;
  } | null;
}

export interface UberJourneyInfo {
  productName: string | null;
  priceLabel: string | null;
  lowEstimate: number | null;
  highEstimate: number | null;
  currency: string | null;
  rideMinutes: number;
  rideMeters: number;
  deeplink: string;
}

export interface TaxiJourneyInfo {
  company: string;
  lowEstimate: number;
  highEstimate: number;
  nightRate: boolean;
  rideMinutes: number;
  rideMeters: number;
  pickupDelayMinutes: number;
  phone: string;
  bookingUrl: string;
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
  tight?: boolean;
  rush?: boolean;
  busDelayMinutes?: number;
  shared?: SharedJourneyInfo;
  uber?: UberJourneyInfo;
  taxi?: TaxiJourneyInfo;
  bikeTransit?: boolean;
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
    mode?: string;
    wheelchair?: boolean;
    numItineraries?: number;
  },
): Promise<URLSearchParams> {
  const queryTime = new Date();
  const localDate = `${queryTime.getFullYear()}-${String(queryTime.getMonth() + 1).padStart(2, '0')}-${String(queryTime.getDate()).padStart(2, '0')}`;
  const params = new URLSearchParams({
    fromPlace: `${fromLatitude},${fromLongitude}`,
    toPlace: `${toLatitude},${toLongitude}`,
    arriveBy: options?.arriveBy ? 'true' : 'false',
    time: options?.time || queryTime.toTimeString().slice(0, 5),
    date: options?.date || localDate,
    routerId: 'default',
    optimize: 'QUICK',
    walkReluctance: String(options?.walkReluctance ?? 5),
    locale: 'fr',
    mode: options?.mode ?? 'WALK,TRANSIT',
    showIntermediateStops: 'true',
    minTransferTime: '20',
    transferPenalty: '60',
    walkBoardCost: '300',
    bannedAgencies: 'MCO:MC,SNC:SNC',
    walkSpeed: String(options?.walkSpeed ?? 1.4),
    numItineraries: String(options?.numItineraries ?? 4),
    wheelchair: options?.wheelchair ? 'true' : 'false',
  });
  return params;
}

const SELF_POWERED_MODES = new Set([
  'BICYCLE',
  'BICYCLE_RENT',
  'CAR',
  'CAR_PARK',
  'CAR_POOL',
  'SCOOTER',
  'MICROMOBILITY',
  'MICROMOBILITY_RENT',
]);

function parseOtpItinerary(it: any, depName: string, arrName: string): RouteItinerary {
  const depTime = new Date(it.startTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const arrTime = new Date(it.endTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const duration = Math.round((it.duration ?? 0) / 60);
  const transitLegs = Array.isArray(it.legs) ? it.legs.filter((leg: any) => leg.mode !== 'WALK') : [];
  const lineKeys = transitLegs
    .filter((leg: any) => !SELF_POWERED_MODES.has(String(leg.mode ?? '').toUpperCase()))
    .map((leg: any) => {
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
  mode?: string;
  wheelchair?: boolean;
  departNow?: boolean;
}): Promise<RouteItinerary[]> {
  const departNow = options.departNow ?? (!options.time && !options.arriveBy);
  if (departNow) {
    const earlier = new Date(Date.now() - LOOKBACK_MS);
    const pad = (value: number) => String(value).padStart(2, '0');
    options = {
      ...options,
      arriveBy: false,
      date: `${earlier.getFullYear()}-${pad(earlier.getMonth() + 1)}-${pad(earlier.getDate())}`,
      time: `${pad(earlier.getHours())}:${pad(earlier.getMinutes())}`,
    };
  }
  const catchable = async (found: RouteItinerary[]) => (departNow ? keepCatchable(await withLiveBoarding(found, Date.now()), Date.now()) : found);
  if (
    !isInGrenobleArea(options.fromLatitude, options.fromLongitude) ||
    !isInGrenobleArea(options.toLatitude, options.toLongitude)
  ) {
    try {
      const itineraries = await applySncfToItineraries(await planTransitousOtp(options));
      return await catchable(itineraries.map(it => {
        const parsed = parseOtpItinerary(it, options.fromName, options.toName);
        parsed.bikeTransit =
          it.legs.some(leg => leg.mode === 'BICYCLE') &&
          it.legs.some(leg => leg.mode !== 'BICYCLE' && leg.mode !== 'WALK');
        return parsed;
      }));
    } catch {
      return [];
    }
  }

  const trainCandidates = !options.mode?.includes('BICYCLE')
    && haversineMeters(options.fromLatitude, options.fromLongitude, options.toLatitude, options.toLongitude) >= TRAIN_RELEVANT_METERS
    ? planTransitousOtp(options)
        .then(applySncfToItineraries)
        .then(found => found
          .filter(it => it.legs.some(leg => leg.mode === 'RAIL'))
          .map(it => parseOtpItinerary(it, options.fromName, options.toName)))
        .catch(() => [] as RouteItinerary[])
    : Promise.resolve([] as RouteItinerary[]);

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
      mode: options.mode,
      wheelchair: options.wheelchair,
      numItineraries: departNow ? 6 : 4,
    },
  );

  try {
    const url = `${TAG_API_BASE}/plan?${params.toString()}`;
    const response = await axios.get(url, { headers: TAG_HEADERS });
    const data = response.data;
    const itineraries = await applySncfToItineraries(Array.isArray(data?.plan?.itineraries) ? data.plan.itineraries : []);
    const local = itineraries.map((it: any) => {
      const parsed = parseOtpItinerary(it, options.fromName, options.toName);
      const legs: any[] = Array.isArray(it.legs) ? it.legs : [];
      parsed.bikeTransit =
        legs.some(leg => leg?.mode === 'BICYCLE') &&
        legs.some(leg => leg?.mode && leg.mode !== 'BICYCLE' && leg.mode !== 'WALK');
      return parsed;
    });
    return await catchable(withLiveTrains(local, await trainCandidates));
  } catch (error) {
    return await catchable(await trainCandidates);
  }
}

const LOOKBACK_MS = 5 * 60_000;
const LIVE_CHECK_WINDOW_MS = 20 * 60_000;

async function liveBoardingTime(stopId: string, tripId: string): Promise<number | null> {
  try {
    const response = await axios.get(`${TAG_API_BASE}/index/stops/${encodeURIComponent(stopId)}/stoptimes`, { headers: TAG_HEADERS });
    for (const group of Array.isArray(response.data) ? response.data : []) {
      for (const time of group?.times ?? []) {
        if (time?.tripId === tripId && time.realtime && typeof time.serviceDay === 'number' && typeof time.realtimeDeparture === 'number') {
          return (time.serviceDay + time.realtimeDeparture) * 1000;
        }
      }
    }
  } catch {
  }
  return null;
}

async function withLiveBoarding(itineraries: RouteItinerary[], now: number): Promise<RouteItinerary[]> {
  const lookups = new Map<string, Promise<number | null>>();
  return Promise.all(itineraries.map(async itinerary => {
    const legs: any[] = itinerary.allLegs ?? [];
    const boardIndex = legs.findIndex(leg => leg?.mode && leg.mode !== 'WALK');
    const leg = legs[boardIndex];
    const board = Number(leg?.startTime);
    const stopId = String(leg?.from?.stopId ?? '');
    const tripId = String(leg?.tripId ?? '');
    if (boardIndex < 0 || !stopId.startsWith('SEM:') || !tripId || !Number.isFinite(board) || board - now > LIVE_CHECK_WINDOW_MS) return itinerary;
    const key = `${stopId}|${tripId}`;
    if (!lookups.has(key)) lookups.set(key, liveBoardingTime(stopId, tripId));
    const live = await lookups.get(key);
    if (live === null || live === undefined || Math.abs(live - board) < 60_000) return itinerary;
    const shift = live - board;
    const allLegs = legs.map((item, index) => {
      if (index < boardIndex) return { ...item, startTime: Number(item.startTime) + shift, endTime: Number(item.endTime) + shift };
      if (index === boardIndex) return { ...item, startTime: live };
      return item;
    });
    return {
      ...itinerary,
      allLegs,
      dep: clockOf(Number(allLegs[0].startTime)),
      busDelayMinutes: Math.round(shift / 60_000),
    };
  }));
}


const TRAIN_RELEVANT_METERS = 6000;

const usesTrain = (itinerary: RouteItinerary) => itinerary.legs.some(leg => leg?.mode === 'RAIL');

const startOf = (itinerary: RouteItinerary) =>
  Number(itinerary.allLegs[0]?.startTime ?? 0) || Number(itinerary.dep.replace(':', '')) || 0;

function withLiveTrains(local: RouteItinerary[], trains: RouteItinerary[]): RouteItinerary[] {
  if (trains.length === 0) return local;
  const merged = [...local.filter(itinerary => !usesTrain(itinerary)), ...trains];
  const seen = new Set<string>();
  return merged
    .sort((a, b) => startOf(a) - startOf(b))
    .filter(itinerary => {
      const key = `${itinerary.dep}|${itinerary.arr}|${itinerary.lineKeys?.join(',') ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
}

export async function planDirectItinerary(options: {
  fromLatitude: number;
  fromLongitude: number;
  toLatitude: number;
  toLongitude: number;
  mode: 'WALK' | 'BICYCLE' | 'CAR';
  walkSpeed?: number;
}): Promise<{
  durationSeconds: number;
  distanceMeters: number;
  points: string;
  coordinates: Array<[number, number]>;
} | null> {
  const params = new URLSearchParams({
    fromPlace: `${options.fromLatitude},${options.fromLongitude}`,
    toPlace: `${options.toLatitude},${options.toLongitude}`,
    mode: options.mode,
    numItineraries: '1',
    locale: 'fr',
    routerId: 'default',
  });
  if (options.mode === 'WALK' && options.walkSpeed) {
    params.set('walkSpeed', String(options.walkSpeed));
  }

  try {
    const response = await axios.get(`${TAG_API_BASE}/plan?${params.toString()}`, { headers: TAG_HEADERS });
    const itinerary = response.data?.plan?.itineraries?.[0];
    if (!itinerary) return null;

    const legs: any[] = Array.isArray(itinerary.legs) ? itinerary.legs : [];
    const encoded = legs
      .map(leg => String(leg?.legGeometry?.points ?? ''))
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);
    const coordinates = legs.flatMap(leg => {
      const points = String(leg?.legGeometry?.points ?? '');
      return points ? decodePolyline(points) : [];
    });

    return {
      durationSeconds: Number(itinerary.duration ?? 0),
      distanceMeters: legs.reduce((total, leg) => total + Number(leg?.distance ?? 0), 0),
      points: encoded[0] ?? '',
      coordinates,
    };
  } catch {
    return null;
  }
}

const occupancyCache = new Map<string, 'EMPTY' | 'LIGHT' | 'MODERATE' | 'CROWDED'>();

const getRandomOccupancy = (): 'EMPTY' | 'LIGHT' | 'MODERATE' | 'CROWDED' => {
  const rand = Math.random();
  if (rand < 0.25) return 'EMPTY';
  if (rand < 0.6) return 'LIGHT';
  if (rand < 0.85) return 'MODERATE';
  return 'CROWDED';
};

function getTramOccupancy(lineId: string, destination: string): 'EMPTY' | 'LIGHT' | 'MODERATE' | 'CROWDED' {
  const key = `${lineId}::${destination}`;
  if (!occupancyCache.has(key)) {
    occupancyCache.set(key, getRandomOccupancy());
  }
  return occupancyCache.get(key)!;
}

const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 2 * 60 * 1000;
const DEPARTURES_CACHE_DURATION = 30 * 1000;
const NEXT_SERVICE_CACHE_DURATION = 30 * 60 * 1000;
const ROUTES_CACHE_DURATION = 6 * 60 * 60 * 1000;
const STOPS_SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;
const STOPS_SNAPSHOT_KEY = 'stopsSnapshot_v4';
const ROUTES_SNAPSHOT_KEY = 'routes_v3';
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
const STOP_LINES_CACHE_STORAGE_KEY = 'greLines_stopLinesCache_v3';
const STOP_LINES_CACHE_MAX_ENTRIES = 500;
let stopLinesCacheHydrated = false;

export interface NetworkDefinition {
  code: string;
  label: string;
  provider: ProviderId;
  defaultEnabled: boolean;
  addedInRevision?: number;
  usesGenClusterPrefix?: boolean;
}

const GRENOBLE_NETWORKS: NetworkDefinition[] = [
  { code: 'SEM', provider: 'mtag', label: 'M réso — Tag', defaultEnabled: true, usesGenClusterPrefix: true },
  { code: 'SE2', provider: 'mtag', label: 'M réso — Tag (suite)', defaultEnabled: true },
  { code: 'GSV', provider: 'mtag', label: 'M réso — Grésivaudan', defaultEnabled: true },
  { code: 'TPV', provider: 'mtag', label: 'M réso — Pays Voironnais', defaultEnabled: true },
  { code: 'BUL', provider: 'mtag', label: 'Bulles de Grenoble', defaultEnabled: true },
  { code: 'FUN', provider: 'mtag', label: 'Funiculaire des Petites Roches', defaultEnabled: true },
  { code: 'TRA', provider: 'mtag', label: 'Transaltitude', defaultEnabled: true },
  { code: 'MCO', provider: 'mtag', label: "M'Covoit ligne+", defaultEnabled: true },
  { code: 'SNC', provider: 'sncf', label: 'SNCF', defaultEnabled: true, addedInRevision: 7 },
  { code: 'C38', provider: 'mtag', label: 'Cars Région (C38)', defaultEnabled: false },

  { code: 'TCL', provider: 'tcl', label: 'TCL — Lyon', defaultEnabled: true, addedInRevision: 6 },
  ...(gtfsNetworks as Array<{ code: string; label: string }>).map(network => ({
    code: network.code,
    provider: 'gtfs' as const,
    label: network.label,
    defaultEnabled: true,
    addedInRevision: 5,
  })),
];

const CITY_NETWORKS: NetworkDefinition[] = [
  ...(SITE_NETWORK === 'TCL'
    ? [{ code: 'TCL', provider: 'tcl' as const, label: 'TCL', defaultEnabled: true }]
    : (gtfsNetworks as Array<{ code: string; label: string }>).map(network => ({
        code: network.code,
        provider: 'gtfs' as const,
        label: network.label,
        defaultEnabled: true,
      }))),
  ...(SITE_HAS_SNCF ? [{ code: 'SNC', provider: 'sncf' as const, label: 'SNCF', defaultEnabled: true }] : []),
];

export const NETWORKS: NetworkDefinition[] = IS_CITY_SITE ? CITY_NETWORKS : GRENOBLE_NETWORKS;

export function networksOfProvider(provider: ProviderId): NetworkDefinition[] {
  return NETWORKS.filter(network => network.provider === provider);
}

function activeMtagNetworks(): string[] {
  const mtag = new Set(networksOfProvider('mtag').map(network => network.code));
  return activeNetworkCodes.filter(code => mtag.has(code));
}

export const DEFAULT_NETWORK_CODES = NETWORKS.filter(n => n.defaultEnabled).map(n => n.code);

let activeNetworkCodes: string[] = [...DEFAULT_NETWORK_CODES];

export function setActiveNetworks(codes: string[]): void {
  if (codes.length === 0) return;
  activeNetworkCodes = [...codes];
}

export function getActiveNetworks(): string[] {
  return activeNetworkCodes;
}

const routeModes = new Map<string, string>();

function rememberRouteModes(routes: any[]): void {
  for (const route of routes) {
    const id = String(route?.id ?? '');
    const mode = route?.mode ?? route?.type;
    if (id && typeof mode === 'string') routeModes.set(id, mode);
  }
}

function routeIdOfPattern(pattern: any): string | null {
  if (pattern?.routeId) return String(pattern.routeId);
  const id = typeof pattern?.id === 'string' ? pattern.id : '';
  const parts = id.split(':');
  return parts.length >= 2 ? `${parts[0]}:${parts[1]}` : null;
}

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

const GEN_PREFIX_NETWORKS = new Set(
  NETWORKS.filter(n => n.usesGenClusterPrefix).map(n => n.code),
);

function normalizeRouteCode(value: string): string {
  return localCode(value);
}

function formatRouteId(value: string, network: string = 'SEM'): string {
  const raw = String(value);
  return networkOf(raw) ? raw : `${network}:${raw}`;
}

function formatClusterId(stopId: string): string {
  const raw = String(stopId);
  if (providerOf(raw)?.id === 'tcl') return raw;

  const network = networkOf(raw);

  if (!network) return `SEM:GEN${raw}`;
  if (!GEN_PREFIX_NETWORKS.has(network)) return raw;
  return raw.startsWith(`${network}:GEN`) ? raw : `${network}:GEN${raw.substring(4)}`;
}

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
  }
}

function getStopLinesCacheEntry(stopId: string): StopLinesCacheEntry | null {
  hydrateStopLinesCache();
  return stopLinesCache.get(stopId) ?? null;
}

export function getCachedStopLines(stopId: string): Line[] | null {
  const data = getStopLinesCacheEntry(stopId)?.data;
  return data && data.length > 0 ? data : null;
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

function normalizeStopName(value: string | undefined | null): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const STOP_MERGE_RADIUS_METERS = 300;
const METRES_PER_DEG_LAT = 111320;
const METRES_PER_DEG_LON_AT_45 = 78710;

function stopDistanceMeters(a: Stop, b: Stop): number {
  const dLat = (a.lat - b.lat) * METRES_PER_DEG_LAT;
  const dLon = (a.lon - b.lon) * METRES_PER_DEG_LON_AT_45;
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

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
        titre: stripHtml(String(info.titre || '')),
        description: stripHtml(String(info.description || '')),
        dateFin: String(info.dateFin || ''),
        listeLigne: String(info.listeLigne || ''),
      };
      const existing = trafficMap.get(line) || [];
      existing.push(details);
      trafficMap.set(line, existing);
    };

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
        if (Array.isArray(info.listeLigne)) {
          (info.listeLigne as string[]).forEach((lineCode) => addDetail(lineCode, info));
        }
      }
    }

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

async function loadRoutes(): Promise<Line[]> {
  const cacheKey = 'routes';
  const cached = getFromCache<Line[]>(cacheKey, ROUTES_CACHE_DURATION);
  if (cached) return cached;

  const persisted = await idbGet<Line[]>(ROUTES_SNAPSHOT_KEY);
  if (persisted && Array.isArray(persisted.value) && persisted.value.length > 0) {
    setCache(cacheKey, persisted.value);
    return persisted.value;
  }

  try {    const res = await axios.get(`${TAG_API_BASE}/index/routes`, { headers: TAG_HEADERS });
    const routes = res.data || [];

    const trafficLines = await getTrafficLines();

    const lines = routes
      .filter((r: any) => providerOf(String(r?.id || ''))?.id === 'mtag' && !isSchoolRoute(r?.type))
      .map((route: any) => {
        const routeId = String(route.id);
        const id = normalizeRouteCode(routeId);
        const details = isSncfLine(routeId) ? [] : (trafficLines.get(id) || []);
        return {
          id,
          routeId,
          name: route.longName || route.shortName || id,
          shortName: route.shortName || id,
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
  if (cached) {
    rememberRouteModes(cached);
    return cached;
  }
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
      rememberRouteModes(routes);
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

type StopWithCluster = { stop: Stop; clusterIds: string[] };
let stopsWithClusterCache = new Map<string, StopWithCluster>();

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
  }
}

export async function getAllStops(prefixes: string[] = activeMtagNetworks()): Promise<Stop[]> {
  try {
    return await getStopsByPrefixes(prefixes);
  } catch {
    return [];
  }
}

export async function getDepartures(stopId: string, skipCache: boolean = false): Promise<Departure[]> {
  const cacheKey = `departures_${stopId}`;

  if (!skipCache) {
    const cached = getFromCache<Departure[]>(cacheKey, DEPARTURES_CACHE_DURATION);
    if (cached) {
      return cached;
    }
  }

  try {
    let clusterIds = [stopId];

    if (stopsWithClusterCache.has(stopId)) {
      clusterIds = getClusterIdsForStopId(stopId);
    } else {
      await getAllStops();
      if (stopsWithClusterCache.has(stopId)) {
        clusterIds = getClusterIdsForStopId(stopId);
      } else {
        clusterIds = [formatClusterId(stopId)];
      }
    }
    const departures: Departure[] = [];
    const seen = new Set<string>();

    const responses = isOffline() ? [] : await Promise.all(
      clusterIds.map(async (clusterId) => {
        try {
          const [res] = await Promise.all([
            axios.get(`${TAG_API_BASE}/index/clusters/${clusterId}/stoptimes`, { headers: TAG_HEADERS }),
            loadClusterRoutes(clusterId).catch(() => []),
          ]);
          return { clusterId, data: res.data };
        } catch {
          return { clusterId, data: null };
        }
      }),
    );

    for (const { data } of responses) {
      collectDepartures(data, departures, seen);
    }

    const reached = responses.some(({ data }) => data !== null);
    let result: Departure[];
    if (!reached) {
      result = await theoreticalDepartures(clusterIds, 3);
    } else {
      result = await withMissingLines(departures, clusterIds);
      void refreshTodaySchedules(clusterIds);
    }

    setCache(cacheKey, result);
    return result;
  } catch {
    return [];
  }
}


function trimDaySchedule(data: any, date: string): DaySchedule {
  const patterns = new Map<string, SchedulePattern>();
  if (!Array.isArray(data)) return { date, patterns: [] };

  for (const patternGroup of data) {
    const meta = readPattern(patternGroup.pattern ?? {});
    const times = patternGroup.times ?? patternGroup.stoptimes ?? [];
    if (!Array.isArray(times)) continue;

    const key = `${meta.lineId}::${meta.destination}`;
    let pattern = patterns.get(key);
    if (!pattern) {
      pattern = {
        lineId: meta.lineId,
        routeId: meta.routeId,
        lineName: meta.lineName,
        lineShortName: meta.lineShortName,
        destination: meta.destination,
        type: meta.type,
        times: [],
      };
      patterns.set(key, pattern);
    }
    for (const t of times) {
      if (endsHere(patternGroup.pattern, t)) continue;
      const seconds = t?.scheduledDeparture;
      if (typeof seconds === 'number') pattern.times.push(seconds);
    }
  }

  for (const pattern of patterns.values()) {
    pattern.times = Array.from(new Set(pattern.times)).sort((a, b) => a - b);
  }
  return { date, patterns: Array.from(patterns.values()).filter(p => p.times.length > 0) };
}

async function fetchDaySchedule(clusterId: string, day: Date): Promise<DaySchedule | null> {
  const date = toScheduleDate(day);
  try {
    await loadClusterRoutes(clusterId).catch(() => []);
    const response = await axios.get(
      `${TAG_API_BASE}/index/clusters/${clusterId}/stoptimes/${date}`,
      { headers: TAG_HEADERS },
    );
    const schedule = trimDaySchedule(response.data, date);
    if (schedule.patterns.length === 0) return null;
    await saveDaySchedule(clusterId, schedule);
    return schedule;
  } catch {
    return null;
  }
}

const scheduleAttempts = new Set<string>();

async function ensureDaySchedule(clusterId: string, day: Date): Promise<void> {
  const date = toScheduleDate(day);
  const attempt = `${clusterId}_${date}`;
  if (scheduleAttempts.has(attempt)) return;
  scheduleAttempts.add(attempt);
  const stored = await readDaySchedule(clusterId, day);
  if (stored?.date === date && !stored.partial) return;
  await fetchDaySchedule(clusterId, day);
}

async function refreshTodaySchedules(clusterIds: string[]): Promise<void> {
  const today = midnight();
  await Promise.all(clusterIds.map(clusterId => ensureDaySchedule(clusterId, today)));
}

async function theoreticalDepartures(clusterIds: string[], perPattern: number): Promise<Departure[]> {
  const yesterday = midnight(new Date(), -1);
  const today = midnight();
  const entries: Array<{ schedule: DaySchedule; day: Date }> = [];

  await Promise.all(clusterIds.map(async (clusterId) => {
    const [before, current] = await Promise.all([
      readDaySchedule(clusterId, yesterday),
      readDaySchedule(clusterId, today),
    ]);
    if (before) entries.push({ schedule: before, day: yesterday });
    if (current) entries.push({ schedule: current, day: today });
  }));

  if (entries.length === 0) return [];
  return scheduleDepartures(entries, {
    from: Date.now() - 60 * 1000,
    until: today.getTime() + (24 + SERVICE_DAY_START_HOUR) * 3600 * 1000,
    perPattern,
  });
}

async function withMissingLines(departures: Departure[], clusterIds: string[]): Promise<Departure[]> {
  const theoretical = await theoreticalDepartures(clusterIds, 1);
  if (theoretical.length === 0) return departures;

  const present = new Set(departures.map(d => `${d.lineId}::${d.destination}`));
  const missing = theoretical.filter(d => !present.has(`${d.lineId}::${d.destination}`));
  if (missing.length === 0) return departures;

  return [...departures, ...missing].sort((a, b) => a.departureTime - b.departureTime);
}

export async function prefetchOfflineSchedules(
  stopIds: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  if (isOffline()) return 0;
  const ids = Array.from(new Set(stopIds.filter(id => id && providerOf(id)?.id !== 'tcl')));
  if (ids.length === 0) return 0;

  await getAllStops().catch(() => []);

  const days: Date[] = [];
  const kinds = new Set<string>();
  for (let offset = 0; offset < 7 && kinds.size < 3; offset += 1) {
    const day = midnight(new Date(), offset);
    const kind = dayKindOf(day);
    if (kinds.has(kind)) continue;
    kinds.add(kind);
    days.push(day);
  }

  let done = 0;
  let stored = 0;
  await mapWithConcurrency(ids, 3, async (stopId) => {
    let any = false;
    for (const clusterId of getClusterIdsForStopId(stopId)) {
      for (const day of days) {
        const current = await readDaySchedule(clusterId, day);
        const fresh = current?.date === toScheduleDate(day) && !current.partial;
        if (fresh || await fetchDaySchedule(clusterId, day)) any = true;
      }
    }
    if (any) stored += 1;
    done += 1;
    onProgress?.(done, ids.length);
  });
  return stored;
}


const SERVICE_DAY_START_HOUR = 4;

function nextServiceDate(from: Date = new Date()): Date {
  const date = new Date(from);
  if (date.getHours() >= SERVICE_DAY_START_HOUR) date.setDate(date.getDate() + 1);
  date.setHours(0, 0, 0, 0);
  return date;
}


function toApiDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

export interface NextServiceDepartures {
  date: Date;
  tomorrow: boolean;
  later?: boolean;
  departures: Departure[];
}

export async function getNextServiceDayDepartures(
  stopId: string,
  perDirection: number = 2,
): Promise<NextServiceDepartures | null> {
  if (!stopId) return null;

  const provider = providerOf(stopId)?.id;
  if (provider === 'tcl' || provider === 'gtfs') {
    const { nextDeparturesFromFiches } = await import('./foreignTimetable');
    if (provider === 'tcl') {
      const tcl = await import('./tclNetwork');
      const [lines, stops] = await Promise.all([tcl.getTclLinesForStop(stopId), tcl.getTclStops()]);
      const name = stops.find(stop => stop.id === stopId)?.name;
      return name ? nextDeparturesFromFiches(lines, new Set([name]), perDirection) : null;
    }
    const gtfs = await import('./gtfsNetwork');
    const [lines, names] = await Promise.all([gtfs.getGtfsLinesForStop(stopId), gtfs.gtfsStationNames(stopId)]);
    return nextDeparturesFromFiches(lines, names, perDirection);
  }

  const date = nextServiceDate();
  const dateParam = toApiDate(date);
  const cacheKey = `departures_next_${stopId}_${dateParam}`;

  const cached = getFromCache<NextServiceDepartures>(cacheKey, NEXT_SERVICE_CACHE_DURATION);
  if (cached) return cached;

  let clusterIds = [stopId];
  if (stopsWithClusterCache.has(stopId)) {
    clusterIds = getClusterIdsForStopId(stopId);
  } else {
    await getAllStops().catch(() => []);
    clusterIds = stopsWithClusterCache.has(stopId)
      ? getClusterIdsForStopId(stopId)
      : [formatClusterId(stopId)];
  }

  const collected: Departure[] = [];
  const seen = new Set<string>();

  const responses: any[] = isOffline() ? clusterIds.map(() => null) : await Promise.all(
    clusterIds.map(async (clusterId) => {
      try {
        const [res] = await Promise.all([
          axios.get(
            `${TAG_API_BASE}/index/clusters/${clusterId}/stoptimes/${dateParam}`,
            { headers: TAG_HEADERS },
          ),
          loadClusterRoutes(clusterId).catch(() => []),
        ]);
        return res.data;
      } catch {
        return null;
      }
    }),
  );

  responses.forEach((data, index) => {
    collectDepartures(data, collected, seen);
    if (Array.isArray(data)) void saveDaySchedule(clusterIds[index], trimDaySchedule(data, dateParam));
  });

  const offline = responses.every(data => data === null);
  if (offline) {
    const entries: Array<{ schedule: DaySchedule; day: Date }> = [];
    for (const clusterId of clusterIds) {
      const schedule = await readDaySchedule(clusterId, date);
      if (schedule) entries.push({ schedule, day: date });
    }
    collected.push(...scheduleDepartures(entries, {
      from: Date.now(),
      until: date.getTime() + 48 * 3600 * 1000,
      perPattern: perDirection,
    }));
  }

  const perKey = new Map<string, number>();
  const departures: Departure[] = [];
  for (const departure of collected) {
    if (departure.departureTime < 0) continue;
    const key = `${departure.lineId}::${departure.destination}`;
    const taken = perKey.get(key) ?? 0;
    if (taken >= perDirection) continue;
    perKey.set(key, taken + 1);
    departures.push(departure);
  }

  if (departures.length === 0) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const result: NextServiceDepartures = {
    date,
    tomorrow: date.getTime() !== today.getTime(),
    departures,
  };
  if (!offline) setCache(cacheKey, result);
  return result;
}

export async function getStopPointDepartures(
  stopPointId: string,
  skipCache: boolean = false
): Promise<Departure[]> {
  if (!stopPointId) return [];
  const cacheKey = `departures_point_${stopPointId}`;

  if (!skipCache) {
    const cached = getFromCache<Departure[]>(cacheKey, DEPARTURES_CACHE_DURATION);
    if (cached) return cached;
  }

  try {
    const url = `${TAG_API_BASE}/index/stops/${encodeURIComponent(stopPointId)}/stoptimes`;
    const response = await axios.get(url, { headers: TAG_HEADERS });
    const departures: Departure[] = [];
    collectDepartures(response.data, departures, new Set<string>());
    setCache(cacheKey, departures);
    return departures;
  } catch {
    return [];
  }
}

const sameStopName = (a: unknown, b: unknown) =>
  typeof a === 'string' && typeof b === 'string' && a.trim().toLowerCase() === b.trim().toLowerCase();

function endsHere(pattern: any, time: any): boolean {
  return String(time?.pickupType ?? '') === '1' || sameStopName(pattern?.lastStopName, time?.stopName);
}

function readPattern(pattern: any): {
  lineId: string;
  routeId?: string;
  patternRouteId: string | null | undefined;
  lineName: string;
  lineShortName: string;
  destination: string;
  type: Departure['type'];
} {
  const patternRouteId = routeIdOfPattern(pattern);

  let lineId = '??';
  if (pattern.routeId) {
    lineId = normalizeRouteCode(String(pattern.routeId));
  } else if (typeof pattern.id === 'string') {
    const parts = pattern.id.split(':');
    if (parts.length > 1) lineId = parts[1];
  }

  return {
    lineId,
    routeId: pattern.routeId ? String(pattern.routeId) : undefined,
    patternRouteId,
    lineName: pattern.longName ?? pattern.name ?? '',
    lineShortName: pattern.shortName ?? lineId,
    destination: pattern.headsign || pattern.lastStopName || pattern.name || 'Direction inconnue',
    type: patternRouteId && isSncfLine(patternRouteId)
      ? 'RAIL'
      : modeToDepartureType(
          (patternRouteId ? routeModes.get(patternRouteId) : undefined) ?? pattern.mode,
        ),
  };
}

function collectDepartures(data: any, departures: Departure[], seen: Set<string>): void {
  {
    {
      if (!Array.isArray(data)) {        return;
      }

      const now = Date.now() / 1000;

      for (const patternGroup of data) {
        const pattern = patternGroup.pattern ?? {};
        const times = patternGroup.times ?? patternGroup.stoptimes ?? [];

        if (!Array.isArray(times)) continue;

        const meta = readPattern(pattern);
        if (meta.patternRouteId && isSncfLine(meta.patternRouteId)) continue;
        const { lineId, destination } = meta;

        for (const t of times) {
          if (endsHere(pattern, t)) continue;
          const serviceDay = t.serviceDay ?? 0;
          const scheduled = t.scheduledDeparture ?? 0;
          const realtime = t.realtimeDeparture ?? scheduled;

          const depUnix = serviceDay + realtime;
          const minutes = Math.round((depUnix - now) / 60);

          if (depUnix < now - 300) continue;

          const key = `${lineId}|${destination}|${depUnix}|${meta.patternRouteId ?? ''}`;
          if (seen.has(key)) continue;
          seen.add(key);

          departures.push({
            lineId,
            routeId: meta.routeId,
            lineName: meta.lineName,
            lineShortName: meta.lineShortName,
            destination,
            departureTime: minutes,
            at: depUnix * 1000,
            realtime: typeof t.realtime === 'boolean'
              ? t.realtime
              : t.realtimeArrival !== undefined || t.realtimeDeparture !== undefined,
            type: meta.type,
            occupancy: getTramOccupancy(lineId, destination),
          });
        }
      }
    }
  }

  departures.sort((a, b) => a.departureTime - b.departureTime);
}

async function linesFromSchedule(clusterIds: string[]): Promise<Line[]> {
  const today = midnight();
  const patterns = (await Promise.all(clusterIds.map(id => readDaySchedule(id, today))))
    .flatMap(schedule => schedule?.patterns ?? []);
  if (patterns.length === 0) return [];

  const lookup = buildLineLookup(await getAllSemLines().catch(() => []));
  const lines = new Map<string, Line>();
  for (const pattern of patterns) {
    if (lines.has(pattern.lineId)) continue;
    const known = lookup.get((pattern.routeId ?? `SEM:${pattern.lineId}`).toUpperCase())
      ?? lookup.get(pattern.lineId.toUpperCase());
    lines.set(pattern.lineId, {
      id: pattern.lineId,
      routeId: known?.id ?? pattern.routeId,
      name: known?.longName || pattern.lineName || pattern.lineShortName,
      shortName: known?.shortName || pattern.lineShortName,
      type: pattern.type,
      color: known?.color,
      textColor: known?.textColor,
    });
  }
  return Array.from(lines.values());
}

export async function getStopLines(stopId: string): Promise<Line[]> {
  if (providerOf(stopId)?.id === 'tcl') {
    const { getTclLinesForStop } = await import('./tclNetwork');
    return getTclLinesForStop(stopId);
  }
  if (providerOf(stopId)?.id === 'gtfs') {
    const { getGtfsLinesForStop } = await import('./gtfsNetwork');
    return getGtfsLinesForStop(stopId);
  }
  if (providerOf(stopId)?.id === 'sncf') return getSncfStationLines(stopId);

  const cached = getStopLinesCacheEntry(stopId);
  if (cached && cached.data.length > 0) return cached.data;
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
            if (isSncfLine(routeId)) continue;
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
      if (lines.length === 0) return linesFromSchedule(clusterIds);
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
  if (isOffline()) return { lines: previous, changed: false };

  try {
    const clusterIds = getClusterIdsForStopId(stopId);
    const trafficLines = await getTrafficLines();
    const routeMap = new Map<string, Line>();

    for (const clusterId of clusterIds) {
      try {
        const routes = await loadClusterRoutes(clusterId);

        for (const route of routes) {
          const routeId = String(route.id);
          if (isSncfLine(routeId)) continue;
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
    if (lines.length === 0) return { lines: previous, changed: false };
    const changed = !areStopLinesEqual(previous, lines);
    setStopLinesCache(stopId, lines);
    return { lines, changed };
  } catch {
    return { lines: previous, changed: false };
  }
}

export async function getStopDetail(stopId: string, prefixes: string[] = activeMtagNetworks()): Promise<StopDetail | null> {
  if (providerOf(stopId)?.id === 'sncf') return getSncfStopDetail(stopId);
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

export async function refreshStopDepartures(stopDetail: StopDetail): Promise<StopDetail> {
  if (providerOf(stopDetail.id)?.id === 'tcl') {
    const { getTclStopDetail } = await import('./tclNetwork');
    return (await getTclStopDetail(stopDetail.id)) ?? stopDetail;
  }
  if (providerOf(stopDetail.id)?.id === 'gtfs') {
    const { getGtfsStopDetail } = await import('./gtfsNetwork');
    return (await getGtfsStopDetail(stopDetail.id)) ?? stopDetail;
  }
  if (providerOf(stopDetail.id)?.id === 'sncf') {
    return (await getSncfStopDetail(stopDetail.id)) ?? stopDetail;
  }

  try {
    const departures = await getDepartures(stopDetail.id, true);

    return {
      ...stopDetail,
      departures,
      lastUpdate: new Date(),
    };
  } catch (err) {    return stopDetail;
  }
}

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

export function formatDepartureTime(departure: Departure, locale: 'fr' | 'en' = 'en'): string {
  const minutes = departure.departureTime;

  if (minutes < 0) {
    return tx(locale === 'fr').api.passed;
  } else if (minutes === 0) {
    return tx(locale === 'fr').api.now;
  } else if (minutes < 60) {
    return `${minutes}m`;
  } else {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h${mins.toString().padStart(2, '0')}` : `${hours}h`;
  }
}
