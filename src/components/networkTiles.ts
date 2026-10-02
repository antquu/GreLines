import { NETWORKS } from '../services/api';
import gtfsNetworks from '../data/gtfsNetworks.json';

export const NETWORK_ASSETS = '/assets/network';

export const networkAssetUrl = (asset: string) =>
  `${NETWORK_ASSETS}/${/\.[a-z]+$/.test(asset) ? asset : `${asset}.png`}`;

export type NetworkTile = {
  asset: string;
  selectedAsset: string;
  codes: string[];
  label: string;
};

export const NETWORK_TILES: NetworkTile[] = [
  { asset: 'Metropole', selectedAsset: 'Metropole-selectioned', codes: ['SEM', 'SE2'], label: 'Métropole' },
  { asset: 'Gresivaudan', selectedAsset: 'Gresivaudan-selectioned', codes: ['GSV'], label: 'Grésivaudan' },
  { asset: 'Voironnais', selectedAsset: 'Voironnais-selected', codes: ['TPV'], label: 'Pays Voironnais' },
  { asset: 'Region', selectedAsset: 'Region-selectioned', codes: ['C38'], label: 'Cars Région' },
];

export const OPERATOR_TILES: NetworkTile[] = [
  { asset: 'Bulle', selectedAsset: 'Bulle-selectionned', codes: ['BUL'], label: 'Bulles' },
  { asset: 'Transaltitude', selectedAsset: 'Transaltitude-selectionned', codes: ['TRA'], label: 'Transaltitude' },
  { asset: 'MCovoit', selectedAsset: 'MCovoit-selectionned', codes: ['MCO'], label: "M'Covoit" },
  { asset: 'TER', selectedAsset: 'TER-selectionned', codes: ['SNC'], label: 'TER' },
];

export const LYON_TILE: NetworkTile = { asset: 'TCL', selectedAsset: 'TCL-selectionned', codes: ['TCL'], label: 'Lyon' };

const CITY_ASSETS: Record<string, string> = {
  STAN: 'STAN',
  STAS: 'STAS',
  T2C: 'T2C',
  SIBRA: 'SIBRA',
  SYNCHRO: 'synchro',
  RUBIS: 'rubis',
  ONDEA: 'ondea',
  TACM: 'TAC',
  LVA: 'Lva',
  STARR: 'STAR',
  START: 'START',
  MAELIS: 'maelis',
  MOBIVIE: 'mobivie',
  MONTELIBUS: 'montelibus',
  VELAY: 'velay',
  TRANSCAB: 'transcab',
};

export const CITY_TILES: NetworkTile[] = (gtfsNetworks as Array<{ code: string; city: string }>)
  .filter(network => CITY_ASSETS[network.code])
  .map(network => ({
    asset: CITY_ASSETS[network.code],
    selectedAsset: `${CITY_ASSETS[network.code]}-selectionned`,
    codes: [network.code],
    label: network.city,
  }));

export const SHARED_TILES: Array<{
  asset: string;
  selectedAsset: string;
  setting: 'citiz' | 'voi';
  label: string;
}> = [
  { asset: 'citiz', selectedAsset: 'Citiz-selectionned', setting: 'citiz', label: 'Citiz' },
  { asset: 'voi', selectedAsset: 'voi-selectionned', setting: 'voi', label: 'Voi' },
];

export const TILE_CODES = new Set([...NETWORK_TILES, ...OPERATOR_TILES, LYON_TILE, ...CITY_TILES].flatMap(tile => tile.codes));
export const SECONDARY_NETWORKS = NETWORKS.filter(network => !TILE_CODES.has(network.code) && network.provider !== 'gtfs');

export const CITY_NETWORKS = NETWORKS.filter(network => !TILE_CODES.has(network.code) && network.provider === 'gtfs');

export function toggleNetworkCodes(current: string[], codes: string[]): string[] {
  const active = codes.every(code => current.includes(code));
  const next = active
    ? current.filter(code => !codes.includes(code))
    : [...new Set([...current, ...codes])];
  return next.length > 0 ? next : ['SEM', 'SE2'];
}
