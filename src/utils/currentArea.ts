import { cityNear, type City } from './cities';


let userPoint: { lat: number; lon: number } | null = null;
let mapPoint: { lat: number; lon: number } | null = null;
let ipPoint: { lat: number; lon: number } | null = null;
let currentCity: City | null = null;
let locatedCity: City | null = null;
let locatedKnown = false;
const listeners = new Set<() => void>();

function refresh() {
  const point = userPoint ?? mapPoint;
  const next = point ? cityNear(point.lat, point.lon) : null;
  const located = userPoint ?? ipPoint;
  const nextLocated = located ? cityNear(located.lat, located.lon) : null;
  const known = located !== null;
  if (next?.id === currentCity?.id && nextLocated?.id === locatedCity?.id && known === locatedKnown) return;
  currentCity = next;
  locatedCity = nextLocated;
  locatedKnown = known;
  for (const listener of listeners) listener();
}

export function setUserArea(lat: number, lon: number): void {
  userPoint = { lat, lon };
  refresh();
}

export function setIpArea(lat: number, lon: number): void {
  ipPoint = { lat, lon };
  refresh();
}

export function getLocatedCity(): { city: City | null; known: boolean } {
  return { city: locatedCity, known: locatedKnown };
}

export function setMapArea(lat: number, lon: number): void {
  mapPoint = { lat, lon };
  refresh();
}

export function getCurrentCity(): City | null {
  return currentCity;
}

export function subscribeCurrentCity(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
