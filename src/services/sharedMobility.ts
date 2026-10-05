import { idbGet, idbSet } from './persistentCache';
import { IS_NANCY } from '../site';
import { tx, type Messages } from '../i18n';

const GBFS_BASE = 'https://data.mobilites-m.fr/api/gbfs';
const CITIZ_GRAND_EST_BASE = 'https://backend.citiz.fr/public/provider/1/gbfs/v3.0';
const VELOSTANLIB_BASE = 'https://api.cyclocity.fr/contracts/nancy/gbfs/v2';

export const SHARED_MOBILITY_TTL_MS = 5 * 60 * 1000;

export type SharedOperator = 'citiz' | 'voi' | 'velostan';

export interface SharedVehicle {
  id: string;
  operator: SharedOperator;

  formFactor: string;

  model?: string;

  batteryPercent?: number;

  batteryEstimated?: boolean;

  rangeMeters?: number;

  propulsion?: string;

  rentalUrl?: string;
}

export interface SharedVehiclePoint {
  id: string;
  operator: SharedOperator;
  lat: number;
  lon: number;

  name?: string;

  address?: string;
  vehicles: SharedVehicle[];

  docksAvailable?: number;
}

export interface SharedMobilityData {
  citiz: SharedVehiclePoint[];
  voi: SharedVehiclePoint[];
  velostan: SharedVehiclePoint[];
}

export const EMPTY_SHARED_MOBILITY: SharedMobilityData = { citiz: [], voi: [], velostan: [] };

export const SHARED_OPERATORS: SharedOperator[] = IS_NANCY ? ['citiz', 'velostan'] : ['citiz', 'voi', 'velostan'];

export const SHARED_OPERATOR_COLORS: Record<SharedOperator, string> = {
  citiz: '#2563eb',
  voi: '#f46c63',
  velostan: '#ee3424',
};

export const SHARED_OPERATOR_LABELS: Record<SharedOperator, string> = {
  citiz: 'Citiz',
  voi: 'Voi',
  velostan: 'vélOstan’lib',
};

const AREA = IS_NANCY
  ? { minLat: 48.55, maxLat: 48.8, minLon: 6.0, maxLon: 6.35 }
  : { minLat: 44.9, maxLat: 45.5, minLon: 5.2, maxLon: 6.3 };

const NANCY_AREA = { minLat: 48.55, maxLat: 48.8, minLon: 6.0, maxLon: 6.35 };

export const FULL_BATTERY_PERCENT = 90;

const TANK_LITERS: Array<[string, number]> = [
  ['308 hybride rechargeable', 40],
  ['clio hybride', 39],
  ['yaris cross', 36],
  ['grand scenic', 53],
  ['grand c4', 57],
  ['308 break', 52],
  ['megane break', 50],
  ['berlingo', 50],
  ['jumpy', 69],
  ['jogger', 50],
  ['lodgy', 50],
  ['logan', 50],
  ['sandero', 50],
  ['talento', 80],
  ['500c', 35],
  ['tourneo', 70],
  ['focus', 52],
  ['i20', 40],
  ['mazda2', 44],
  ['mini one', 40],
  ['micra', 41],
  ['combo', 50],
  ['corsa', 44],
  ['vivaro', 70],
  ['108', 35],
  ['208', 44],
  ['3008', 53],
  ['308', 52],
  ['expert', 69],
  ['partner', 50],
  ['clio iv', 45],
  ['clio', 42],
  ['kangoo', 54],
  ['express', 50],
  ['megane', 50],
  ['trafic', 80],
  ['twingo', 35],
  ['symbioz', 39],
  ['fabia', 40],
  ['octavia', 45],
  ['forfour', 35],
  ['s-cross', 47],
  ['swace', 43],
  ['swift', 37],
  ['proace', 70],
  ['aygo', 35],
  ['corolla', 43],
  ['yaris', 36],
  ['caddy', 50],
  ['c3', 45],
];

const FUEL_PROPULSIONS = new Set(['combustion', 'combustion_diesel', 'hybrid', 'plug_in_hybrid']);

export function usesFuel(vehicle: Pick<SharedVehicle, 'propulsion'>): boolean {
  return FUEL_PROPULSIONS.has(String(vehicle.propulsion || ''));
}

export function fuelLiters(vehicle: Pick<SharedVehicle, 'propulsion' | 'model' | 'batteryPercent'>): number | null {
  if (!usesFuel(vehicle) || typeof vehicle.batteryPercent !== 'number' || !vehicle.model) return null;
  const model = vehicle.model.toLowerCase();
  const tank = TANK_LITERS.find(([key]) => model.includes(key))?.[1];
  return tank ? Math.round((tank * vehicle.batteryPercent) / 100) : null;
}

export function energyLevelLabel(vehicle: Pick<SharedVehicle, 'propulsion' | 'model' | 'batteryPercent'>): string | null {
  if (typeof vehicle.batteryPercent !== 'number') return null;
  const liters = fuelLiters(vehicle);
  return liters !== null ? `${liters} L` : `${vehicle.batteryPercent} %`;
}

export function hasFullBattery(point: SharedVehiclePoint): boolean {
  return point.vehicles.some(
    vehicle => typeof vehicle.batteryPercent === 'number' && vehicle.batteryPercent >= FULL_BATTERY_PERCENT,
  );
}

export function propulsionLabel(propulsion: string | undefined, language: 'fr' | 'en'): string {
  const fr = language === 'fr';
  switch (propulsion) {
    case 'electric':
    case 'electric_assist':
      return tx(fr).sharedMobility.electric;
    case 'combustion':
    case 'combustion_diesel':
      return tx(fr).sharedMobility.combustion;
    case 'hybrid':
    case 'plug_in_hybrid':
      return tx(fr).sharedMobility.hybrid;
    default:
      return '';
  }
}

export function dominantFormFactor(point: SharedVehiclePoint): string {
  const counts = new Map<string, number>();
  for (const vehicle of point.vehicles) {
    counts.set(vehicle.formFactor, (counts.get(vehicle.formFactor) ?? 0) + 1);
  }
  let best = point.vehicles[0]?.formFactor ?? 'scooter';
  let bestCount = 0;
  for (const [formFactor, count] of counts) {
    if (count > bestCount) { best = formFactor; bestCount = count; }
  }
  return best;
}

function isInArea(lat: unknown, lon: unknown, area = AREA): boolean {
  return (
    typeof lat === 'number' && typeof lon === 'number' &&
    lat >= area.minLat && lat <= area.maxLat &&
    lon >= area.minLon && lon <= area.maxLon
  );
}

interface GbfsResponse<T> {
  data?: T;
}

type GbfsText = string | Array<{ language?: string; text?: string }>;

interface GbfsStation {
  station_id?: string;
  lat?: number;
  lon?: number;
  name?: GbfsText;

  address?: string;
}

interface GbfsVehicle {
  bike_id?: string;
  vehicle_id?: string;
  lat?: number;
  lon?: number;
  is_disabled?: boolean;
  is_reserved?: boolean;
  station_id?: string;

  home_station_id?: string;
  vehicle_type_id?: string;
  current_range_meters?: number;
  current_fuel_percent?: number;
  rental_uris?: { android?: string; ios?: string; web?: string };
}

interface GbfsVehicleType {
  vehicle_type_id?: string;
  form_factor?: string;
  propulsion_type?: string;
  max_range_meters?: number;
  name?: GbfsText;
  model?: GbfsText;
  make?: GbfsText;
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  try {
    const response = await fetch(url, { signal });

    if (!response.ok || response.status === 204) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function readText(value: GbfsText | undefined): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const fr = value.find(entry => entry?.language === 'fr') ?? value[0];
    return typeof fr?.text === 'string' ? fr.text : undefined;
  }
  return undefined;
}

async function fetchVehicleTypes(
  url: string,
  signal?: AbortSignal,
): Promise<Map<string, GbfsVehicleType>> {
  const payload = await fetchJson<GbfsResponse<{ vehicle_types?: GbfsVehicleType[] }>>(url, signal);
  const map = new Map<string, GbfsVehicleType>();
  for (const type of payload?.data?.vehicle_types ?? []) {
    if (type?.vehicle_type_id) map.set(type.vehicle_type_id, type);
  }
  return map;
}

function toAppLink(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\/lqfa\.adj\.st(?:\/|$)/.test(url)) {
    return 'https://lqfa.adj.st/';
  }
  return url;
}

function toVehicle(
  raw: GbfsVehicle,
  operator: SharedOperator,
  types: Map<string, GbfsVehicleType>,
): SharedVehicle {
  const type = raw.vehicle_type_id ? types.get(raw.vehicle_type_id) : undefined;
  const maxRange = type?.max_range_meters;

  let batteryPercent: number | undefined;
  let batteryEstimated = false;
  if (typeof raw.current_fuel_percent === 'number') {
    batteryPercent = Math.round(raw.current_fuel_percent * 100);
  } else if (typeof raw.current_range_meters === 'number' && typeof maxRange === 'number' && maxRange > 0) {
    batteryPercent = Math.min(100, Math.round((raw.current_range_meters / maxRange) * 100));
    batteryEstimated = true;
  }

  const model = readText(type?.model)
    ? [readText(type?.make), readText(type?.model)].filter(Boolean).join(' ')
    : readText(type?.name);

  return {
    id: String(raw.bike_id ?? raw.vehicle_id ?? ''),
    operator,
    formFactor: type?.form_factor ?? (operator === 'citiz' ? 'car' : 'scooter'),
    model: model && model !== type?.form_factor ? model : undefined,
    batteryPercent,
    batteryEstimated: batteryEstimated || undefined,
    rangeMeters: raw.current_range_meters,
    propulsion: type?.propulsion_type,
    rentalUrl: toAppLink(raw.rental_uris?.web ?? raw.rental_uris?.android ?? raw.rental_uris?.ios),
  };
}

function isAvailable(vehicle: GbfsVehicle): boolean {

  return !vehicle?.is_disabled && !vehicle?.is_reserved;
}

async function fetchCitiz(signal?: AbortSignal): Promise<SharedVehiclePoint[]> {
  const [info, fleet, types] = await Promise.all([
    fetchJson<GbfsResponse<{ stations?: GbfsStation[] }>>(
      IS_NANCY ? `${CITIZ_GRAND_EST_BASE}/station_information.json` : `${GBFS_BASE}/citiz_grenoble/station_information`,
      signal,
    ),
    fetchJson<GbfsResponse<{ vehicles?: GbfsVehicle[] }>>(
      IS_NANCY ? `${CITIZ_GRAND_EST_BASE}/vehicle_status.json` : `${GBFS_BASE}/citiz_grenoble/vehicle_status`,
      signal,
    ),
    fetchVehicleTypes(
      IS_NANCY ? `${CITIZ_GRAND_EST_BASE}/vehicle_types.json` : `${GBFS_BASE}/citiz_grenoble/vehicle_types`,
      signal,
    ),
  ]);

  const stations = info?.data?.stations;
  if (!Array.isArray(stations)) return [];

  const byStation = new Map<string, SharedVehicle[]>();
  for (const vehicle of fleet?.data?.vehicles ?? []) {
    if (!isAvailable(vehicle)) continue;
    const stationId = String(vehicle.station_id ?? vehicle.home_station_id ?? '');
    if (!stationId) continue;
    const list = byStation.get(stationId);
    const entry = toVehicle(vehicle, 'citiz', types);
    if (list) list.push(entry);
    else byStation.set(stationId, [entry]);
  }

  const points: SharedVehiclePoint[] = [];
  for (const station of stations) {
    if (!isInArea(station?.lat, station?.lon)) continue;
    const id = String(station.station_id ?? '');
    if (!id) continue;
    const vehicles = byStation.get(id) ?? [];
    if (vehicles.length === 0) continue;
    points.push({
      id,
      operator: 'citiz',
      lat: station.lat as number,
      lon: station.lon as number,
      name: readText(station.name),
      address: typeof station.address === 'string' ? station.address : undefined,
      vehicles,
    });
  }
  return points;
}

function stationName(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return raw
    .replace(/\s*\(CB\)\s*$/i, '')
    .toLowerCase()
    .replace(/(^|[\s'’(-])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toUpperCase())
    .replace(/\s+-\s+/g, ' · ')
    .trim();
}

interface GbfsStationStatus {
  station_id?: string;
  num_bikes_available?: number;
  num_docks_available?: number;
  is_renting?: boolean;
}

async function fetchBikeStations(signal?: AbortSignal): Promise<SharedVehiclePoint[]> {
  const [info, status] = await Promise.all([
    fetchJson<GbfsResponse<{ stations?: GbfsStation[] }>>(`${VELOSTANLIB_BASE}/station_information.json`, signal),
    fetchJson<GbfsResponse<{ stations?: GbfsStationStatus[] }>>(`${VELOSTANLIB_BASE}/station_status.json`, signal),
  ]);
  const stations = info?.data?.stations;
  if (!Array.isArray(stations)) return [];
  const statusById = new Map<string, GbfsStationStatus>();
  for (const entry of status?.data?.stations ?? []) {
    if (entry?.station_id) statusById.set(String(entry.station_id), entry);
  }

  const points: SharedVehiclePoint[] = [];
  for (const station of stations) {
    if (!isInArea(station?.lat, station?.lon, NANCY_AREA)) continue;
    const id = String(station.station_id ?? '');
    const state = statusById.get(id);
    if (!id || !state || state.is_renting === false) continue;
    const count = Math.max(0, state.num_bikes_available ?? 0);
    if (count === 0) continue;
    points.push({
      id,
      operator: 'velostan',
      lat: station.lat as number,
      lon: station.lon as number,
      name: stationName(readText(station.name)),
      docksAvailable: Math.max(0, state.num_docks_available ?? 0),
      vehicles: Array.from({ length: count }, (_, index) => ({
        id: `${id}-${index + 1}`,
        operator: 'velostan' as const,
        formFactor: 'bicycle',
        model: 'vélOstan’lib',
        propulsion: 'human',
      })),
    });
  }
  return points;
}

async function fetchVoi(signal?: AbortSignal): Promise<SharedVehiclePoint[]> {
  if (IS_NANCY) return [];
  type VoiPayload = GbfsResponse<{ vehicles?: GbfsVehicle[]; bikes?: GbfsVehicle[] }>;
  const [modern, types] = await Promise.all([
    fetchJson<VoiPayload>(`${GBFS_BASE}/voi_grenoble/vehicle_status`, signal),
    fetchVehicleTypes(`${GBFS_BASE}/voi_grenoble/vehicle_types`, signal),
  ]);
  const legacy = modern?.data?.vehicles
    ? null
    : await fetchJson<VoiPayload>(`${GBFS_BASE}/voi_grenoble/free_bike_status`, signal);

  const vehicles = modern?.data?.vehicles ?? legacy?.data?.bikes ?? legacy?.data?.vehicles;
  if (!Array.isArray(vehicles)) return [];

  const points: SharedVehiclePoint[] = [];
  for (const raw of vehicles) {
    if (!isAvailable(raw)) continue;
    if (!isInArea(raw?.lat, raw?.lon)) continue;
    const vehicle = toVehicle(raw, 'voi', types);
    if (!vehicle.id) continue;
    points.push({
      id: vehicle.id,
      operator: 'voi',
      lat: raw.lat as number,
      lon: raw.lon as number,
      vehicles: [vehicle],
    });
  }
  return points;
}

export async function fetchSharedMobility(
  options: { signal?: AbortSignal } = {},
): Promise<SharedMobilityData> {
  const [citiz, voi, velostan] = await Promise.all([
    loadOperator('citiz', options.signal),
    IS_NANCY ? Promise.resolve([]) : loadOperator('voi', options.signal),
    loadOperator('velostan', options.signal),
  ]);
  return { citiz, voi, velostan };
}

async function loadOperator(
  operator: SharedOperator,
  signal?: AbortSignal,
): Promise<SharedVehiclePoint[]> {
  const cacheKey = operator === 'velostan'
    ? 'sharedMobility_velostan_v1'
    : IS_NANCY ? `sharedMobility_nancy_v3_${operator}` : `sharedMobility_v1_${operator}`;

  const cached = await idbGet<SharedVehiclePoint[]>(cacheKey);
  if (cached && cached.value.length > 0) return cached.value;

  const points = operator === 'citiz'
    ? await fetchCitiz(signal)
    : operator === 'velostan' ? await fetchBikeStations(signal) : await fetchVoi(signal);
  if (points.length > 0) void idbSet(cacheKey, points, SHARED_MOBILITY_TTL_MS);
  return points;
}

const RANGE_LANDMARKS: Array<{ meters: number; key: keyof Messages['sharedMobility']['landmarks'] }> = IS_NANCY ? [
  { meters: 1_500,   key: 'stanislasToStation' },
  { meters: 6_000,   key: 'acrossNancy' },
  { meters: 15_000,  key: 'nancyMetropolisLoop' },
  { meters: 57_000,  key: 'nancyMetz' },
  { meters: 140_000, key: 'nancyStrasbourg' },
] : [
  { meters: 1_800,   key: 'bastilleClimb' },
  { meters: 5_400,   key: 'acrossGrenoble' },
  { meters: 12_000,  key: 'ringRoadLoop' },
  { meters: 31_000,  key: 'chamrousseClimb' },
  { meters: 110_000, key: 'grenobleLyon' },
];

export function rangeComparison(rangeMeters: number, language: 'fr' | 'en'): string | null {
  if (!Number.isFinite(rangeMeters) || rangeMeters <= 0) return null;
  const fr = language === 'fr';

  const candidates = RANGE_LANDMARKS
    .map(landmark => ({ landmark, times: rangeMeters / landmark.meters }))
    .filter(entry => entry.times >= 1.5)
    .sort((a, b) => a.times - b.times);

  const best = candidates[0];
  if (!best) return null;

  const times = Math.round(best.times);
  return tx(fr).sharedMobility.enoughForTimesTimes(times, tx(fr).sharedMobility.landmarks[best.landmark.key]);
}

export function formFactorLabel(formFactor: string, language: 'fr' | 'en'): string {
  const fr = language === 'fr';
  switch (formFactor) {
    case 'car':      return '';
    case 'truck':    return tx(fr).sharedMobility.van;
    case 'scooter':
    case 'scooter_standing':
    case 'scooter_seated': return tx(fr).sharedMobility.scooter;
    case 'bicycle': return tx(fr).sharedMobility.bike;
    case 'moped':   return tx(fr).sharedMobility.moped;
    default:        return tx(fr).sharedMobility.vehicle;
  }
}


export type VoiZoneKind = 'no-ride' | 'no-parking' | 'parking' | 'limit';

const CITY_SCALE_DEGREES = 0.1;
const SURROUNDING_SCALE_DEGREES = 0.25;

function spanDegrees(geometry: GeoJSON.Geometry): number {
  let minLon = Infinity; let maxLon = -Infinity; let minLat = Infinity; let maxLat = -Infinity;
  const visit = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === 'number' && typeof value[1] === 'number') {
      minLon = Math.min(minLon, value[0]); maxLon = Math.max(maxLon, value[0]);
      minLat = Math.min(minLat, value[1]); maxLat = Math.max(maxLat, value[1]);
      return;
    }
    for (const item of value) visit(item);
  };
  visit((geometry as { coordinates?: unknown }).coordinates);
  return Math.max(maxLon - minLon, maxLat - minLat);
}

interface GbfsZoneRule {
  ride_allowed?: boolean;
  ride_through_allowed?: boolean;
  maximum_speed_kph?: number;
  station_parking?: boolean;
}

const VOI_ZONES_TTL_MS = 60 * 60 * 1000;
let voiZones: { at: number; value: Promise<GeoJSON.FeatureCollection | null> } | null = null;

function zoneKind(rules: GbfsZoneRule[]): VoiZoneKind | null {
  const rule = rules[0];
  if (!rule) return null;
  if (rule.ride_allowed === false && rule.ride_through_allowed === false) return 'no-ride';
  if (rule.ride_allowed === false) return 'no-parking';
  if (rule.station_parking) return 'parking';
  return null;
}

export function getVoiZones(): Promise<GeoJSON.FeatureCollection | null> {
  if (IS_NANCY) return Promise.resolve(null);
  if (voiZones && Date.now() - voiZones.at < VOI_ZONES_TTL_MS) return voiZones.value;
  const value = fetchJson<{ data?: { geofencing_zones?: GeoJSON.FeatureCollection } }>(`${GBFS_BASE}/voi_grenoble/geofencing_zones`)
    .then(payload => {
      const collection = payload?.data?.geofencing_zones;
      if (!collection?.features) return null;
      const features = collection.features.flatMap(feature => {
        const rules = ((feature.properties as { rules?: GbfsZoneRule[] } | null)?.rules) ?? [];
        let kind = zoneKind(rules);
        const span = feature.geometry ? spanDegrees(feature.geometry) : 0;
        if ((kind === 'no-ride' || kind === 'no-parking') && span > SURROUNDING_SCALE_DEGREES) return [];
        if (kind === 'parking' && span > CITY_SCALE_DEGREES) kind = 'limit';
        return kind ? [{ ...feature, properties: { kind, speed: rules[0]?.maximum_speed_kph ?? null } }] : [];
      });
      return { type: 'FeatureCollection' as const, features };
    })
    .then(result => {
      if (!result) voiZones = null;
      return result;
    });
  voiZones = { at: Date.now(), value };
  return value;
}
