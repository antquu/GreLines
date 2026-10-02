import type { RouteLocation } from '../services/api';

export const haversineMeters = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

export const CURRENT_POSITION_ID = 'position';

export const formatCoordinates = (lat: number, lon: number): string =>
  `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

export const currentPositionLocation = (position: { lat: number; lon: number }): RouteLocation => ({
  id: CURRENT_POSITION_ID,
  label: 'Ma position',
  lat: position.lat,
  lon: position.lon,
  kind: 'address',
});

export const formatDistance = (meters: number, language: 'fr' | 'en' = 'fr'): string => {
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return language === 'fr'
    ? `${km.toFixed(km < 10 ? 1 : 0).replace('.', ',')} km`
    : `${km.toFixed(km < 10 ? 1 : 0)} km`;
};

export interface StopWithDistance<T extends { lat: number; lon: number }> {
  stop: T;
  meters: number;
}

export function findClosestStops<T extends { lat: number; lon: number }>(
  stops: T[],
  refLat: number,
  refLon: number,
  limit: number = 6
): StopWithDistance<T>[] {
  if (limit <= 0) return [];
  const best: StopWithDistance<T>[] = [];
  let worstDegrees = Infinity;
  for (const stop of stops) {
    if (best.length >= limit) {
      const dLat = Math.abs(stop.lat - refLat);
      if (dLat > worstDegrees) continue;
    }
    const meters = haversineMeters(refLat, refLon, stop.lat, stop.lon);
    if (best.length >= limit && meters >= best[best.length - 1].meters) continue;
    let index = best.length;
    while (index > 0 && best[index - 1].meters > meters) index -= 1;
    best.splice(index, 0, { stop, meters });
    if (best.length > limit) best.pop();
    if (best.length >= limit) worstDegrees = best[best.length - 1].meters / 111_000;
  }
  return best;
}