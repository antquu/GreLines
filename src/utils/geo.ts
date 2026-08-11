



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

/**
 * Sort stops by distance from a reference point and return the closest N.
 */
export function findClosestStops<T extends { lat: number; lon: number }>(
  stops: T[],
  refLat: number,
  refLon: number,
  limit: number = 6
): StopWithDistance<T>[] {
  return stops
    .map(stop => ({
      stop,
      meters: haversineMeters(refLat, refLon, stop.lat, stop.lon),
    }))
    .sort((a, b) => a.meters - b.meters)
    .slice(0, limit);
}