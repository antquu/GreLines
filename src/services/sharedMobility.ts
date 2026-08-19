
















import { idbGet, idbSet } from './persistentCache';

const GBFS_BASE = 'https://data.mobilites-m.fr/api/gbfs';


export const SHARED_MOBILITY_TTL_MS = 5 * 60 * 1000;

export type SharedOperator = 'citiz' | 'voi';


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
}

export interface SharedMobilityData {
  citiz: SharedVehiclePoint[];
  voi: SharedVehiclePoint[];
}

export const EMPTY_SHARED_MOBILITY: SharedMobilityData = { citiz: [], voi: [] };

/** Couleur d'identification de chaque opérateur, reprise de la carte. */
export const SHARED_OPERATOR_COLORS: Record<SharedOperator, string> = {
  citiz: '#2563eb',
  voi: '#ec4899',
};

/** Nom commercial de l'opérateur. */
export const SHARED_OPERATOR_LABELS: Record<SharedOperator, string> = {
  citiz: 'Citiz',
  voi: 'Voi',
};


const AREA = { minLat: 44.9, maxLat: 45.5, minLon: 5.2, maxLon: 6.3 };


export const FULL_BATTERY_PERCENT = 90;


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
      return fr ? 'Électrique' : 'Electric';
    case 'combustion':
    case 'combustion_diesel':
      return fr ? 'Thermique' : 'Combustion';
    case 'hybrid':
    case 'plug_in_hybrid':
      return fr ? 'Hybride' : 'Hybrid';
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

function isInArea(lat: unknown, lon: unknown): boolean {
  return (
    typeof lat === 'number' && typeof lon === 'number' &&
    lat >= AREA.minLat && lat <= AREA.maxLat &&
    lon >= AREA.minLon && lon <= AREA.maxLon
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
  producer: string,
  signal?: AbortSignal,
): Promise<Map<string, GbfsVehicleType>> {
  const payload = await fetchJson<GbfsResponse<{ vehicle_types?: GbfsVehicleType[] }>>(
    `${GBFS_BASE}/${producer}/vehicle_types`,
    signal,
  );
  const map = new Map<string, GbfsVehicleType>();
  for (const type of payload?.data?.vehicle_types ?? []) {
    if (type?.vehicle_type_id) map.set(type.vehicle_type_id, type);
  }
  return map;
}

/**
 * Compose la fiche d'un véhicule.
 *
 * Le pourcentage de batterie est repris tel quel quand l'opérateur le publie
 * (Citiz), sinon déduit de l'autonomie restante rapportée au maximum du modèle
 * (Voi) — et alors marqué comme estimé, pour ne pas afficher un chiffre inventé
 * comme une donnée constructeur.
 */
/**
 * Bascule un lien de location vers l'application de l'opérateur.
 *
 * Voi publie une adresse `https:
 * qui passe par une page web avant d'atteindre l'application. On ouvre
 * directement l'application, sans chemin ni paramètre — ceux du lien d'origine
 * ne servaient qu'au suivi de campagne du redirecteur, et l'application
 * s'ouvre de toute façon sur la carte.
 */
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
    fetchJson<GbfsResponse<{ stations?: GbfsStation[] }>>(`${GBFS_BASE}/citiz_grenoble/station_information`, signal),
    fetchJson<GbfsResponse<{ vehicles?: GbfsVehicle[] }>>(`${GBFS_BASE}/citiz_grenoble/vehicle_status`, signal),
    fetchVehicleTypes('citiz_grenoble', signal),
  ]);

  const stations = info?.data?.stations;
  if (!Array.isArray(stations)) return [];

  // Les voitures sont rattachées à leur station : on les regroupe avant de
  // construire les points, pour que chaque station porte sa flotte.
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
    // Une station sans voiture disponible n'a rien à proposer.
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

async function fetchVoi(signal?: AbortSignal): Promise<SharedVehiclePoint[]> {
  // `vehicle_status` d'abord (GBFS 3.0), `free_bike_status` ensuite : c'est
  // aujourd'hui le second qui porte la flotte, mais l'ordre suit la norme pour
  // rester correct le jour où l'opérateur migrera.
  type VoiPayload = GbfsResponse<{ vehicles?: GbfsVehicle[]; bikes?: GbfsVehicle[] }>;
  const [modern, types] = await Promise.all([
    fetchJson<VoiPayload>(`${GBFS_BASE}/voi_grenoble/vehicle_status`, signal),
    fetchVehicleTypes('voi_grenoble', signal),
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
  // Aucune fusion ici : le regroupement dépend du zoom et se fait à
  // l'affichage, pour que les véhicules se séparent quand on approche et qu'on
  // voie où chacun est garé.
  return points;
}

/**
 * Charge les opérateurs demandés. Un opérateur non demandé n'est pas appelé du
 * tout : le flux Voi pèse environ 1 Mo.
 */
export async function fetchSharedMobility(
  options: { citiz: boolean; voi: boolean; signal?: AbortSignal },
): Promise<SharedMobilityData> {
  const [citiz, voi] = await Promise.all([
    options.citiz ? loadOperator('citiz', options.signal) : Promise.resolve([]),
    options.voi ? loadOperator('voi', options.signal) : Promise.resolve([]),
  ]);
  return { citiz, voi };
}

/**
 * Charge un opérateur en passant par IndexedDB.
 *
 * Les positions ne valent que quelques minutes, mais le trajet vaut la peine
 * d'être évité au rechargement de page : le flux Voi pèse près d'un mégaoctet
 * et son traitement (filtrage puis fusion des tas) prend deux cents
 * millisecondes. On sert donc l'instantané tant qu'il est frais, et on ne
 * repart en réseau qu'après.
 */
async function loadOperator(
  operator: SharedOperator,
  signal?: AbortSignal,
): Promise<SharedVehiclePoint[]> {
  const cacheKey = `sharedMobility_v1_${operator}`;

  const cached = await idbGet<SharedVehiclePoint[]>(cacheKey);
  if (cached && cached.value.length > 0) return cached.value;

  const points = operator === 'citiz' ? await fetchCitiz(signal) : await fetchVoi(signal);
  if (points.length > 0) void idbSet(cacheKey, points, SHARED_MOBILITY_TTL_MS);
  return points;
}

/**
 * Repères de distance pour rendre une autonomie parlante.
 *
 * Des trajets grenoblois réels plutôt que des unités abstraites : « 68 km »
 * ne dit rien, « quatre fois la montée de la Bastille » se visualise.
 */
const RANGE_LANDMARKS: Array<{ meters: number; fr: string; en: string }> = [
  { meters: 1_800,   fr: 'la montée à la Bastille', en: 'the climb to the Bastille' },
  { meters: 5_400,   fr: 'la traversée de Grenoble', en: 'a crossing of Grenoble' },
  { meters: 12_000,  fr: 'le tour de la rocade', en: 'a loop of the ring road' },
  { meters: 31_000,  fr: 'la montée à Chamrousse', en: 'the climb to Chamrousse' },
  { meters: 110_000, fr: 'un Grenoble–Lyon', en: 'a Grenoble–Lyon run' },
];

/**
 * Traduit une autonomie en nombre de fois un repère local.
 *
 * On retient le repère le plus long qui tient au moins une fois et demie :
 * « 1,2 fois » n'apprend rien, « 5 fois » se retient.
 */
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
  const label = fr ? best.landmark.fr : best.landmark.en;
  return fr
    ? `De quoi faire ${times} fois ${label}.`
    : `Enough for ${times} times ${label}.`;
}

/** Libellé lisible d'un type de véhicule. */
export function formFactorLabel(formFactor: string, language: 'fr' | 'en'): string {
  const fr = language === 'fr';
  switch (formFactor) {
    // Les voitures n'ont pas de libellé : leur modèle (« Citroën C3 ») dit déjà
    // ce que c'est, et « Voiture » ne ferait que l'alourdir.
    case 'car':      return '';
    case 'truck':    return fr ? 'Utilitaire' : 'Van';
    case 'scooter':
    case 'scooter_standing':
    case 'scooter_seated': return fr ? 'Trottinette' : 'Scooter';
    case 'bicycle': return fr ? 'Vélo' : 'Bike';
    case 'moped':   return fr ? 'Scooter' : 'Moped';
    default:        return fr ? 'Véhicule' : 'Vehicle';
  }
}
