import type { Stop, StopDetail } from '../types';
import { IS_CITY_SITE } from '../site';
import { getActiveNetworks, getStopDetail, getStopsByPrefixes } from '../services/api';
import { getTclStopDetail, getTclStops, isTclId, TCL_NETWORK } from '../services/tclNetwork';
import { getGtfsStopDetail, getGtfsStops, GTFS_NETWORKS, isGtfsNetworkId } from '../services/gtfsNetwork';
import { getSncfStopDetail, getSncfStops, isSncfStopId } from '../services/sncfNetwork';

export function loadScreenStop(stopId: string): Promise<StopDetail | null> {
  if (isSncfStopId(stopId)) return getSncfStopDetail(stopId);
  if (isTclId(stopId)) return getTclStopDetail(stopId);
  if (isGtfsNetworkId(stopId)) return getGtfsStopDetail(stopId);
  return getStopDetail(stopId);
}

export async function loadScreenStops(): Promise<Stop[]> {
  const networks = getActiveNetworks();
  const lists = await Promise.all([
    IS_CITY_SITE ? Promise.resolve([] as Stop[]) : getStopsByPrefixes(networks).catch(() => [] as Stop[]),
    networks.includes(TCL_NETWORK) ? getTclStops().catch(() => [] as Stop[]) : Promise.resolve([] as Stop[]),
    ...GTFS_NETWORKS.filter(network => networks.includes(network.code))
      .map(network => getGtfsStops(network.code).catch(() => [] as Stop[])),
    networks.includes('SNC') ? getSncfStops().catch(() => [] as Stop[]) : Promise.resolve([] as Stop[]),
  ]);
  return lists.flat();
}

const plain = (value: string | undefined) =>
  (value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

// find a stop by name when its id no longer exists, preferring the same network
export async function findScreenStopByName(oldId: string, place: { name: string; city?: string }): Promise<Stop | null> {
  const stops = await loadScreenStops();
  const network = oldId.split(':')[0].toUpperCase();
  const named = stops.filter(stop => plain(stop.name) === plain(place.name));
  const inCity = place.city ? named.filter(stop => plain(stop.city) === plain(place.city)) : named;
  const pool = inCity.length > 0 ? inCity : named;
  return pool.find(stop => stop.id.split(':')[0].toUpperCase() === network) ?? (pool.length === 1 ? pool[0] : null);
}
