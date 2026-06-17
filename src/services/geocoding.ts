/**
 * Address geocoding via the French Base Adresse Nationale (BAN).
 *
 * Free, no API key, excellent for French addresses. Docs:
 *   https://adresse.data.gouv.fr/api-doc/adresse
 *
 * We bias the search around Grenoble (45.1885, 5.7245) so partial queries like
 * "rue de la république" return Grenoble results first instead of Paris.
 */

export interface AddressResult {
  /** Formatted full label, e.g. "12 Rue de la République 38000 Grenoble" */
  label: string;
  /** Short street/place name, e.g. "Rue de la République" */
  name: string;
  /** Postal code + city, e.g. "38000 Grenoble" */
  context: string;
  /** Latitude in WGS84 (EPSG:4326). */
  lat: number;
  /** Longitude in WGS84 (EPSG:4326). */
  lon: number;
  /**
   * BAN confidence score, 0–1. Higher is better. We sort results by this
   * descending and keep the top results.
   */
  score: number;
  /** Stable id for React keys / deduplication. */
  id: string;
}

const BAN_ENDPOINT = 'https://api-adresse.data.gouv.fr/search/';

// Grenoble city centre — used to bias geocoding toward local results.
const GRENOBLE_LAT = 45.1885;
const GRENOBLE_LON = 5.7245;

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

/**
 * Search addresses near Grenoble.
 *
 * Returns at most `limit` results (default 5), sorted by relevance.
 * Returns an empty array on network error rather than throwing — the search
 * UI shouldn't crash if the geocoder is briefly unreachable.
 */
export const searchAddresses = async (
  query: string,
  options?: { limit?: number; signal?: AbortSignal }
): Promise<AddressResult[]> => {
  const trimmed = query.trim();
  // BAN rejects queries shorter than 3 characters.
  if (trimmed.length < 3) return [];

  const limit = options?.limit ?? 5;

  const params = new URLSearchParams({
    q: trimmed,
    limit: String(limit),
    lat: String(GRENOBLE_LAT),
    lon: String(GRENOBLE_LON),
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
    if ((err as { name?: string }).name === 'AbortError') return [];
    void 0 && console.error('Address geocoding failed:', err);
    return [];
  }
};

/**
 * Reverse geocode a lat/lon to the nearest BAN address.
 * Returns null on error or if no result is found.
 */
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
    const resp = await fetch(`https://api-adresse.data.gouv.fr/reverse?${params.toString()}`);
    if (!resp.ok) return null;
    const data = await resp.json();
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
    void 0 && console.error('Reverse geocoding failed:', err);
    return null;
  }
};