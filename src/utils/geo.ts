



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


/**
 * Identifiant du point « position courante » dans le planificateur.
 *
 * Il ne désigne pas un lieu du référentiel : ni arrêt, ni adresse géocodée.
 */
export const CURRENT_POSITION_ID = 'position';

/**
 * Libellé d'un point repéré par ses seules coordonnées.
 *
 * La position courante s'affichait « Ma position » : un texte que le
 * planificateur traitait ensuite comme une adresse à géocoder, sans succès. Les
 * coordonnées, elles, désignent le point sans ambiguïté.
 */
export const formatCoordinates = (lat: number, lon: number): string =>
  `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

/**
 * Point « position courante » du planificateur.
 *
 * Il se nomme, et ne s'écrit pas en coordonnées : « 45.18821, 5.72452 » ne
 * dit rien à personne, là où « Ma position » se lit d'un coup d'œil. Les
 * coordonnées restent dessous — ce sont elles qui calculent le trajet.
 */
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