import type { Stop } from '../types';
import { haversineMeters } from './geo';

const SNCF_ZONE_RADIUS_METERS = 2500;
const ZONE_CELL_DEGREES = 0.05;
const FAR_STOP_KM = 50;

export interface StopSearchEntry {
  stop: Stop;
  name: string;
  city: string;
  id: string;
}

export function buildStopSearchIndex(stops: Stop[]): StopSearchEntry[] {
  return stops.map(stop => ({
    stop,
    name: stop.name.toLowerCase(),
    city: stop.city?.toLowerCase() ?? '',
    id: stop.id.toLowerCase(),
  }));
}

export function matchStops(
  index: StopSearchEntry[],
  query: string,
  distanceKm: (lat: number, lon: number) => number,
  limit: number,
): Stop[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: Array<{ stop: Stop; tier: number; km: number }> = [];
  for (const entry of index) {
    const tier = entry.name === q ? 0
      : entry.name.startsWith(q) ? 1
        : entry.name.includes(q) || entry.city.includes(q) || entry.id.includes(q) ? 2
          : -1;
    if (tier >= 0) hits.push({ stop: entry.stop, tier, km: distanceKm(entry.stop.lat, entry.stop.lon) });
  }
  return hits
    .sort((a, b) => Number(a.km > FAR_STOP_KM) - Number(b.km > FAR_STOP_KM) || a.tier - b.tier || a.km - b.km)
    .slice(0, limit)
    .map(hit => hit.stop);
}

export function inServedZones(stations: Stop[], references: Stop[]): Stop[] {
  const cellOf = (lat: number, lon: number) => `${Math.floor(lat / ZONE_CELL_DEGREES)}:${Math.floor(lon / ZONE_CELL_DEGREES)}`;
  const grid = new Map<string, Stop[]>();
  for (const stop of references) {
    const key = cellOf(stop.lat, stop.lon);
    const cell = grid.get(key);
    if (cell) cell.push(stop);
    else grid.set(key, [stop]);
  }
  return stations.filter(station => {
    const row = Math.floor(station.lat / ZONE_CELL_DEGREES);
    const column = Math.floor(station.lon / ZONE_CELL_DEGREES);
    for (let dRow = -1; dRow <= 1; dRow += 1) {
      for (let dColumn = -1; dColumn <= 1; dColumn += 1) {
        const cell = grid.get(`${row + dRow}:${column + dColumn}`);
        if (cell?.some(stop => haversineMeters(station.lat, station.lon, stop.lat, stop.lon) <= SNCF_ZONE_RADIUS_METERS)) return true;
      }
    }
    return false;
  });
}
