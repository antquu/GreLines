import networkConfigs from '../data/siteNetworks';

const CODES = new Set((networkConfigs as Array<{ code: string }>).map(network => network.code));

export function gtfsCodeOf(id: string | null | undefined): string | null {
  const raw = String(id ?? '');
  const at = raw.indexOf(':');
  return at > 0 && CODES.has(raw.slice(0, at)) ? raw.slice(0, at) : null;
}

export const isGtfsNetworkId = (id: string | null | undefined) => gtfsCodeOf(id) !== null;
