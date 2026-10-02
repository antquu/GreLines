import gtfsNetworks from '../data/gtfsNetworks.json';

export type ProviderId = 'mtag' | 'tcl' | 'gtfs';

export interface TransitProvider {
  id: ProviderId;
  label: string;

  owns(value: string): boolean;

  networkOf(value: string): string | null;

  localCode(value: string): string;
}

const FOREIGN_NETWORK_CODES = new Set(['TCL', ...(gtfsNetworks as Array<{ code: string }>).map(network => network.code)]);

const MTAG: TransitProvider = {
  id: 'mtag',
  label: 'Mobilités M — Grenoble',

  owns(value) {
    const raw = String(value);
    if (raw.length < 4) return false;
    const separator = raw[3];
    if (separator !== ':' && separator !== '_') return false;
    return !FOREIGN_NETWORK_CODES.has(raw.slice(0, 3));
  },

  networkOf(value) {
    return MTAG.owns(value) ? String(value).slice(0, 3) : null;
  },

  localCode(value) {
    const raw = String(value);
    return MTAG.owns(raw) ? raw.substring(4) : raw;
  },
};

const TCL_CODE_FIELD = 3;

const TCL: TransitProvider = {
  id: 'tcl',
  label: 'TCL — Lyon',

  owns(value) {
    const raw = String(value);

    return raw.startsWith('ActIV:') || raw.startsWith('TCL:');
  },

  networkOf(value) {
    return TCL.owns(value) ? 'TCL' : null;
  },

  localCode(value) {
    const raw = String(value);
    if (!TCL.owns(raw)) return raw;
    if (raw.startsWith('TCL:')) return raw.slice(4);
    const fields = raw.split(':');

    return fields[TCL_CODE_FIELD] || raw;
  },
};

const GTFS_CODES = new Set((gtfsNetworks as Array<{ code: string }>).map(network => network.code));
const gtfsCodeOf = (value: string) => {
  const raw = String(value);
  const at = raw.indexOf(':');
  return at > 0 && GTFS_CODES.has(raw.slice(0, at)) ? raw.slice(0, at) : null;
};

const GTFS: TransitProvider = {
  id: 'gtfs',
  label: 'Réseaux GTFS',

  owns(value) {
    return gtfsCodeOf(value) !== null;
  },

  networkOf(value) {
    return gtfsCodeOf(value);
  },

  localCode(value) {
    const code = gtfsCodeOf(value);
    return code ? String(value).slice(code.length + 1) : String(value);
  },
};

export const PROVIDERS: TransitProvider[] = [MTAG, TCL, GTFS];

export function providerOf(value: string): TransitProvider | null {
  for (const provider of PROVIDERS) {
    if (provider.owns(value)) return provider;
  }
  return null;
}

export function networkOf(value: string): string | null {
  return providerOf(value)?.networkOf(value) ?? null;
}

export function localCode(value: string): string {
  return providerOf(value)?.localCode(value) ?? String(value);
}

export function providerOfNetwork(networkCode: string): ProviderId {
  if (networkCode === 'TCL') return 'tcl';
  if ((gtfsNetworks as Array<{ code: string }>).some(network => network.code === networkCode)) return 'gtfs';
  return 'mtag';
}
