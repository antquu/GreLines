import { IS_NANCY } from '../site';

export interface AddressResult {

  label: string;

  name: string;

  context: string;

  lat: number;

  lon: number;

  score: number;

  id: string;

  category?: string;
}

const BAN_ENDPOINT = 'https://api-adresse.data.gouv.fr/search/';
const BAN_REVERSE_ENDPOINT = 'https://api-adresse.data.gouv.fr/reverse/';

const GRENOBLE_LAT = IS_NANCY ? 48.6921 : 45.1885;
const GRENOBLE_LON = IS_NANCY ? 6.1844 : 5.7245;

let focus = { lat: GRENOBLE_LAT, lon: GRENOBLE_LON };

export function setSearchFocus(lat: number, lon: number): void {
  if (Number.isFinite(lat) && Number.isFinite(lon)) focus = { lat, lon };
}

interface BanFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    label: string;
    score: number;
    id: string;
    name: string;
    postcode?: string;
    city?: string;
    context?: string;
    type?: string;
  };
}

interface BanResponse {
  type: 'FeatureCollection';
  features: BanFeature[];
}

const PHOTON_ENDPOINT = 'https://photon.komoot.io/api/';
const PLACE_TAGS = ['amenity', 'shop', 'tourism', 'leisure', 'railway:station', 'office', 'healthcare'];
const PLACE_RADIUS_KM = 60;
const PLACE_LIMIT = 3;
const PLACE_NAMES: Record<string, string> = {
  'osm-W198949118': 'Pharmacie de Monestier-de-Clermont',
};

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    osm_type?: string;
    osm_id?: number;
    osm_key?: string;
    osm_value?: string;
    name?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    city?: string;
  };
}

const distanceKm = (lat: number, lon: number) => {
  const dLat = (lat - focus.lat) * 111;
  const dLon = (lon - focus.lon) * 111 * Math.cos((focus.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
};

export const distanceFromFocusKm = distanceKm;

const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function relevance(result: AddressResult, query: string): number {
  const name = normalize(result.name);
  const wanted = normalize(query);
  const words = wanted.split(/\s+/).filter(Boolean);
  let score = 0;
  if (name === wanted) score += 3;
  else if (name.startsWith(wanted)) score += 2;
  else if (words.every(word => name.includes(word))) score += 1;
  return score - Math.log1p(distanceKm(result.lat, result.lon)) * 0.6;
}

const searchPlaces = async (query: string, signal?: AbortSignal): Promise<AddressResult[]> => {
  const params = new URLSearchParams({
    q: query,
    lat: String(focus.lat),
    lon: String(focus.lon),
    limit: String(PLACE_LIMIT * 3),
    lang: 'fr',
    zoom: '14',
    location_bias_scale: '0.1',
  });
  for (const tag of PLACE_TAGS) params.append('osm_tag', tag);
  try {
    const resp = await fetch(`${PHOTON_ENDPOINT}?${params.toString()}`, { signal });
    if (!resp.ok) return [];
    const data = (await resp.json()) as { features?: PhotonFeature[] };
    return (data.features ?? [])
      .filter(feature => feature.properties.name && distanceKm(feature.geometry.coordinates[1], feature.geometry.coordinates[0]) <= PLACE_RADIUS_KM)
      .slice(0, PLACE_LIMIT)
      .map(feature => {
        const [lon, lat] = feature.geometry.coordinates;
        const { osm_type, osm_id, osm_key, osm_value, street, housenumber, postcode, city } = feature.properties;
        const id = `osm-${osm_type ?? ''}${osm_id ?? `${lat},${lon}`}`;
        const name = PLACE_NAMES[id] ?? feature.properties.name;
        const streetLine = [housenumber, street].filter(Boolean).join(' ');
        const town = [postcode, city].filter(Boolean).join(' ');
        const context = [streetLine, town].filter(Boolean).join(', ');
        return {
          label: [name, context].filter(Boolean).join(', '),
          name: name!,
          context,
          lat,
          lon,
          score: 1,
          id,
          category: [osm_key, osm_value].filter(Boolean).join(':') || 'place',
        };
      });
  } catch {
    return [];
  }
};

export const searchAddresses = async (
  query: string,
  options?: { limit?: number; signal?: AbortSignal }
): Promise<AddressResult[]> => {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];
  const [places, addresses] = await Promise.all([
    searchPlaces(trimmed, options?.signal),
    searchStreetAddresses(trimmed, options),
  ]);
  if (/^\d/.test(trimmed)) return [...addresses, ...places];
  const ranked = [...places, ...addresses]
    .map((result, order) => ({ result, order, rank: relevance(result, trimmed), near: distanceKm(result.lat, result.lon) <= PLACE_RADIUS_KM }))
    .sort((a, b) => b.rank - a.rank || a.order - b.order);
  const near = ranked.filter(entry => entry.near);
  return (near.length >= 3 ? near : ranked).map(entry => entry.result);
};

const searchStreetAddresses = async (
  query: string,
  options?: { limit?: number; signal?: AbortSignal }
): Promise<AddressResult[]> => {
  const trimmed = query.trim();

  if (trimmed.length < 3) return [];

  const limit = options?.limit ?? 5;

  const params = new URLSearchParams({
    q: trimmed,
    limit: String(limit),
    lat: String(focus.lat),
    lon: String(focus.lon),
  });

  try {
    const resp = await fetch(`${BAN_ENDPOINT}?${params.toString()}`, {
      signal: options?.signal,
    });
    if (!resp.ok) return [];
    const data: BanResponse = await resp.json();
    return data.features.map(feature => {
      const [lon, lat] = feature.geometry.coordinates;
      const { label, score, id, name, postcode, city, context } = feature.properties;
      const ctx = [postcode, city].filter(Boolean).join(' ') || context || '';
      return {
        label,
        name: name || label,
        context: ctx,
        lat,
        lon,
        score,
        id,
      };
    });
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') return [];    return [];
  }
};

export const reverseGeocode = async (
  lat: number,
  lon: number
): Promise<AddressResult | null> => {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    limit: '1',
  });
  try {
    const resp = await fetch(`${BAN_REVERSE_ENDPOINT}?${params.toString()}`);
    if (!resp.ok) return null;
    const data: BanResponse = await resp.json();
    const feat = data?.features?.[0];
    if (!feat) return null;
    const [rLon, rLat] = feat.geometry.coordinates;
    const props = feat.properties || {};
    const label = props.label || props.name || `${rLat.toFixed(5)}, ${rLon.toFixed(5)}`;
    const context = [props.postcode, props.city].filter(Boolean).join(' ') || props.context || '';
    return {
      label,
      name: props.name || label,
      context,
      lat: rLat,
      lon: rLon,
      score: props.score ?? 1,
      id: props.id || `reverse-${rLat}-${rLon}`,
    };
  } catch (err) {
    return null;
  }
};