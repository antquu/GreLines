const STORAGE_KEY = 'greLines_routeNetworks';

export interface RouteNetwork {
  code: string;
  label: string;
  aliases?: string[];
}

export const ROUTE_NETWORKS: RouteNetwork[] = [
  { code: 'SEM', label: 'Métropole (Tag)', aliases: ['SE2'] },
  { code: 'GSV', label: 'Grésivaudan' },
  { code: 'TPV', label: 'Pays Voironnais' },
  { code: 'BUL', label: 'Bulles de Grenoble' },
  { code: 'FUN', label: 'Funiculaire des Petites Roches' },
  { code: 'TRA', label: 'Transaltitude' },
  { code: 'MCO', label: "M'Covoit ligne+" },
  { code: 'SNC', label: 'TER' },
  { code: 'C38', label: 'Cars Région' },
];

export function networkCodes(network: RouteNetwork): string[] {
  return [network.code, ...(network.aliases ?? [])];
}

export function defaultRouteNetworks(): string[] {
  return ROUTE_NETWORKS.map(network => network.code);
}

export function loadRouteNetworks(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultRouteNetworks();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaultRouteNetworks();
    const known = parsed.filter(
      (code): code is string => typeof code === 'string' && ROUTE_NETWORKS.some(n => n.code === code),
    );
    return known.length > 0 ? known : defaultRouteNetworks();
  } catch {
    return defaultRouteNetworks();
  }
}

export function saveRouteNetworks(codes: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(codes));
  } catch {
  }
}

export function legNetworkCode(leg: unknown): string | null {
  const source = leg as { routeId?: unknown; agencyId?: unknown; route?: unknown } | null;
  if (!source) return null;
  for (const value of [source.routeId, source.agencyId, source.route]) {
    if (typeof value !== 'string') continue;
    const prefix = value.includes(':') ? value.slice(0, value.indexOf(':')) : '';
    if (prefix) return prefix.toUpperCase();
  }
  return null;
}

export function itineraryUsesOnly(legs: unknown[], accepted: Set<string>): boolean {
  return legs.every(leg => {
    const code = legNetworkCode(leg);
    if (!code) return true;
    const network = ROUTE_NETWORKS.find(n => networkCodes(n).includes(code));
    if (!network) return true;
    return accepted.has(network.code);
  });
}
