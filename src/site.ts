export type SiteId = 'grenoble' | 'nancy' | 'lyon' | 'saint-etienne' | 'clermont';

export interface CitySite {
  id: Exclude<SiteId, 'grenoble'>;
  name: string;
  host: string;
  network: string;
  networkLabel: string;
  center: [number, number];
  areaRadiusMeters: number;
  sncf: boolean;
  logo: { light: string; dark: string; width: number };
}

export const CITY_SITES: Record<CitySite['id'], CitySite> = {
  nancy: {
    id: 'nancy',
    name: 'Nancy',
    host: 'nancy.grelines.fr',
    network: 'STAN',
    networkLabel: 'Stan',
    center: [48.6921, 6.1844],
    areaRadiusMeters: 35_000,
    sncf: false,
    logo: { light: '/assets/stan-logo.svg', dark: '/assets/stan-logo-white.svg', width: 112 },
  },
  lyon: {
    id: 'lyon',
    name: 'Lyon',
    host: 'lyon.grelines.fr',
    network: 'TCL',
    networkLabel: 'TCL',
    center: [45.7578, 4.832],
    areaRadiusMeters: 35_000,
    sncf: true,
    logo: { light: '/assets/tcl-logo.svg', dark: '/assets/tcl-logo-white.svg', width: 96 },
  },
  'saint-etienne': {
    id: 'saint-etienne',
    name: 'Saint-Étienne',
    host: 'sainte.grelines.fr',
    network: 'STAS',
    networkLabel: 'STAS',
    center: [45.4397, 4.3872],
    areaRadiusMeters: 30_000,
    sncf: true,
    logo: { light: '/assets/stas-logo.svg', dark: '/assets/stas-logo.svg', width: 96 },
  },
  clermont: {
    id: 'clermont',
    name: 'Clermont-Ferrand',
    host: 'clermont.grelines.fr',
    network: 'T2C',
    networkLabel: 'T2C',
    center: [45.7772, 3.087],
    areaRadiusMeters: 30_000,
    sncf: true,
    logo: { light: '/assets/t2c-logo.svg', dark: '/assets/t2c-logo.svg', width: 72 },
  },
};

export function siteOf(value: string | undefined): SiteId {
  return value && value in CITY_SITES ? (value as SiteId) : 'grenoble';
}

export const SITE: SiteId = siteOf(import.meta.env.VITE_SITE);

export const IS_NANCY = SITE === 'nancy';

// nancy, lyon, saint-etienne, clermont: one network, no tag/oura/vitrine
export const IS_CITY_SITE = SITE !== 'grenoble';

export const CITY_SITE: CitySite | null = SITE === 'grenoble' ? null : CITY_SITES[SITE];

export const SITE_NETWORK: string | null = CITY_SITE?.network ?? null;

export const SITE_CENTER: { lat: number; lon: number } = CITY_SITE
  ? { lat: CITY_SITE.center[0], lon: CITY_SITE.center[1] }
  : { lat: 45.1885, lon: 5.7245 };

export const SITE_HAS_SNCF = CITY_SITE ? CITY_SITE.sncf : true;

export const GUIDANCE_ENABLED = false;
