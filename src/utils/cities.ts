import { haversineMeters } from './geo';
import { IS_CITY_SITE, SITE_CENTER, SITE_NETWORK } from '../site';
import gtfsNetworks from '../data/siteNetworks';

export interface City {
  id: string;
  lat: number;
  lon: number;
  network: string | null;
}

export const CITIES: City[] = [
  ...(IS_CITY_SITE ? [] : [{ id: 'grenoble', lat: 45.1885, lon: 5.7245, network: null }]),
  ...(!SITE_NETWORK || SITE_NETWORK === 'TCL' ? [{ id: 'lyon', lat: SITE_NETWORK ? SITE_CENTER.lat : 45.7578, lon: SITE_NETWORK ? SITE_CENTER.lon : 4.832, network: 'TCL' }] : []),
  ...(gtfsNetworks as Array<{ code: string; city: string; center: number[] }>).map(network => ({
    id: network.city,
    lat: network.center[0],
    lon: network.center[1],
    network: network.code,
  })),
];

export function cityOfNetwork(code: string): City | null {
  const own = CITIES.find(city => city.network === code);
  if (own) return own;
  if (IS_CITY_SITE) return null;
  return CITIES.find(city => city.id === 'grenoble') ?? null;
}

const RADIUS_METERS = 30_000;

export function cityNear(lat: number, lon: number): City | null {
  let best: { city: City; distance: number } | null = null;
  for (const city of CITIES) {
    const distance = haversineMeters(lat, lon, city.lat, city.lon);
    if (distance <= RADIUS_METERS && (!best || distance < best.distance)) best = { city, distance };
  }
  return best?.city ?? null;
}
