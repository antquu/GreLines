import type { AllLinesLine } from '../services/allLines';
import gtfsNetworks from '../data/siteNetworks';
import { gtfsCodeOf } from '../services/gtfsNetworkIds';
import { gtfsLineMode, gtfsShortName } from '../services/gtfsNetwork';
import { tclCode, tclLogoEntry } from './tclLogos';
import { CITY_SITE, IS_NANCY } from '../site';
import { tx } from '../i18n';

export type MetroFamily = 'tram' | 'chrono' | 'proximo' | 'flexo';

export const NETWORK_FILTERS: Array<{ code: string; label: string }> = [
  { code: 'GSV', label: 'Grésivaudan' },
  { code: 'TPV', label: 'Pays Voironnais' },
  { code: 'BUL', label: 'Bulles' },
  { code: 'C38', label: 'Cars Région' },
  { code: 'MCO', label: "M'Covoit" },
  { code: 'TRA', label: 'Transaltitude' },
  { code: 'FUN', label: 'Funiculaire' },
  { code: 'TCL', label: 'Lyon' },
  ...(gtfsNetworks as Array<{ code: string; city: string }>).map(network => ({ code: network.code, label: network.city })),
];

const STAN_FAMILIES = ['stan-tempo', 'stan-corol', 'stan-urbain', 'stan-suburbain', 'stan-autres'];

function stanFamily(line: string): string | null {
  if (gtfsCodeOf(line) !== 'STAN' || gtfsLineMode(line) === null) return null;
  const short = gtfsShortName(line).trim().toUpperCase();
  if (/^T\d+$/.test(short)) return 'stan-tempo';
  if (short === 'COROL') return 'stan-corol';
  const num = parseInt(short, 10);
  if (/^\d+/.test(short) && num < 30) return 'stan-urbain';
  if (/^\d+/.test(short)) return 'stan-suburbain';
  return 'stan-autres';
}

export function getMetroFamily(line: string): MetroFamily | null {
  const n = line.trim().toUpperCase();
  if (['A', 'B', 'C', 'D', 'E'].includes(n)) return 'tram';
  if (/^C\d+$/.test(n)) {
    const num = Number(n.substring(1));
    return num >= 1 && num <= 14 ? 'chrono' : null;
  }
  const asNum = Number(n);
  if (!isNaN(asNum)) {
    if (asNum >= 11 && asNum <= 29) return 'proximo';
    if (asNum >= 30 && asNum <= 99) return 'flexo';
  }
  return null;
}

const NO_LOOKUP = {};
const categoryCache = new WeakMap<object, Map<string, string>>();

export function trafficCategory(
  line: string,
  lineLookup?: Map<string, AllLinesLine> | null,
): string {
  const cacheKey = lineLookup ?? NO_LOOKUP;
  let cache = categoryCache.get(cacheKey);
  if (!cache) { cache = new Map(); categoryCache.set(cacheKey, cache); }
  const known = cache.get(line);
  if (known !== undefined) return known;
  const category = computeTrafficCategory(line, lineLookup);
  if (!IS_NANCY || gtfsCodeOf(line) !== 'STAN' || category !== 'STAN') cache.set(line, category);
  return category;
}

function computeTrafficCategory(
  line: string,
  lineLookup?: Map<string, AllLinesLine> | null,
): string {
  if (line.startsWith('TCL:')) return 'TCL';
  if (IS_NANCY) {
    const family = stanFamily(line);
    if (family) return family;
  }
  const gtfsCode = gtfsCodeOf(line);
  if (gtfsCode) return gtfsCode;
  const family = getMetroFamily(line);
  if (family) return family;
  const full = lineLookup?.get(line.toUpperCase().trim())?.id ?? '';
  const network = full.slice(0, 3).toUpperCase();
  return NETWORK_FILTERS.some(entry => entry.code === network) ? network : 'other';
}

export function categoryRank(category: string): number {
  const rank: Record<string, number> = {
    tram: 0, chrono: 1, proximo: 2, flexo: 3,
    'stan-tempo': 0, 'stan-corol': 1, 'stan-urbain': 2, 'stan-suburbain': 3, 'stan-autres': 4,
  };
  return rank[category] ?? 90;
}

export function trafficFilters(
  present: Set<string>,
  language: 'fr' | 'en',
): Array<{ key: string; label: string }> {
  const isFr = language === 'fr';
  if (IS_NANCY) {
    return [
      { key: 'all', label: tx(isFr).trafficFilters.all },
      ...STAN_FAMILIES.filter(family => present.has(family)).map(family => ({
        key: family,
        label: tx(isFr).trafficFilters.families[family],
      })),
    ];
  }
  if (CITY_SITE) {
    return [
      { key: 'all', label: tx(isFr).trafficFilters.all },
      ...NETWORK_FILTERS.filter(entry => present.has(entry.code)).map(entry => ({
        key: entry.code,
        label: entry.code === CITY_SITE?.network ? CITY_SITE.networkLabel : entry.label,
      })),
    ];
  }
  return [
    { key: 'all', label: tx(isFr).trafficFilters.all },
    { key: 'tram', label: tx(isFr).trafficFilters.trams },
    { key: 'chrono', label: 'Chrono' },
    { key: 'proximo', label: 'Proximo' },
    { key: 'flexo', label: 'Flexo' },
    ...NETWORK_FILTERS.filter(entry => present.has(entry.code)).map(entry => ({
      key: entry.code,
      label: entry.label,
    })),
  ];
}


const MODE_ORDER = ['metro', 'tram', 'trambus', 'chrono', 'funi', 'train', 'bus'];

const TCL_MODES: Record<string, string> = {
  M: 'metro', T: 'tram', TB: 'trambus', C: 'chrono', F: 'funi', BUS: 'bus', RELAIS: 'relais',
};
const GTFS_MODES: Record<string, string> = { METRO: 'metro', TRAM: 'tram', RAIL: 'train' };

function nameGroup(shortName: string): string {
  const name = shortName.trim();
  if (/^\d+[A-Za-z]?$/.test(name)) return 'num';
  const prefix = /^([A-Za-zÀ-ÿ]+)[\s-]*\d/.exec(name);
  if (prefix) return `name:${prefix[1].toUpperCase()}`;
  return 'other';
}

const subCategoryCache = new WeakMap<object, Map<string, string | null>>();

export function trafficSubCategory(
  line: string,
  lineLookup?: Map<string, AllLinesLine> | null,
): string | null {
  const cacheKey = lineLookup ?? NO_LOOKUP;
  let cache = subCategoryCache.get(cacheKey);
  if (!cache) { cache = new Map(); subCategoryCache.set(cacheKey, cache); }
  if (cache.has(line)) return cache.get(line)!;
  const sub = computeSubCategory(line, lineLookup);
  if (!gtfsCodeOf(line) || gtfsLineMode(line) !== null) cache.set(line, sub);
  return sub;
}

function computeSubCategory(
  line: string,
  lineLookup?: Map<string, AllLinesLine> | null,
): string | null {
  const tcl = tclCode(line);
  if (tcl) {
    const mode = tclLogoEntry(tcl)?.mode;
    if (mode && TCL_MODES[mode]) return `mode:${TCL_MODES[mode]}`;
    if (/^[A-D]$/.test(tcl)) return 'mode:metro';
    if (/^T\d+$/.test(tcl)) return 'mode:tram';
    if (/^C\d+$/.test(tcl)) return 'mode:chrono';
    if (/^F\d+$/.test(tcl)) return 'mode:funi';
    return 'mode:bus';
  }
  if (gtfsCodeOf(line)) {
    const mode = GTFS_MODES[gtfsLineMode(line) ?? 'BUS'];
    return mode ? `mode:${mode}` : nameGroup(gtfsShortName(line));
  }
  if (getMetroFamily(line)) return null;
  const short = lineLookup?.get(line.toUpperCase().trim())?.shortName ?? line.replace(/^[A-Z0-9]{3}[:_]/, '');
  return nameGroup(short);
}

const NAME_PREFIXES: Record<string, string> = { CIT: 'Citadine', NAV: 'Navette', EXP: 'Express' };

function subLabel(key: string, language: 'fr' | 'en'): string {
  if (key.startsWith('mode:')) return tx(language === 'fr').trafficFilters.modes[key.slice(5)] ?? key.slice(5);
  if (key === 'num') return tx(language === 'fr').trafficFilters.numbered;
  if (key === 'other') return tx(language === 'fr').trafficFilters.other;
  const prefix = key.slice(5);
  if (NAME_PREFIXES[prefix]) return NAME_PREFIXES[prefix];
  if (prefix.length <= 2) return tx(language === 'fr').trafficFilters.prefixLines(prefix);
  return prefix.charAt(0) + prefix.slice(1).toLowerCase();
}

export function subCategoryRank(sub: string | null): number {
  if (!sub) return 999;
  if (sub === 'mode:relais') return 900;
  if (sub.startsWith('mode:')) {
    const index = MODE_ORDER.indexOf(sub.slice(5));
    return index === -1 ? 99 : index;
  }
  if (sub.startsWith('name:')) return 100;
  if (sub === 'num') return 200;
  return 300;
}

function compareSubs(a: string, b: string): number {
  return subCategoryRank(a) - subCategoryRank(b) || a.localeCompare(b);
}

export function trafficSubFilters(
  category: string,
  lines: string[],
  lineLookup: Map<string, AllLinesLine> | null | undefined,
  language: 'fr' | 'en',
): Array<{ key: string; label: string }> {
  if (category === 'all') return [];
  const present = new Set(
    lines
      .filter(line => trafficCategory(line, lineLookup) === category)
      .map(line => trafficSubCategory(line, lineLookup))
      .filter((sub): sub is string => sub !== null),
  );
  if (present.size < 2) return [];
  return [...present].sort(compareSubs).map(key => ({ key, label: subLabel(key, language) }));
}

export function matchesTrafficFilter(
  line: string,
  filter: string,
  sub: string | null,
  lineLookup: Map<string, AllLinesLine> | null | undefined,
): boolean {
  if (filter === 'all') return true;
  if (trafficCategory(line, lineLookup) !== filter) return false;
  return sub === null || trafficSubCategory(line, lineLookup) === sub;
}

export function compareTrafficLines(
  a: string,
  b: string,
  lineLookup: Map<string, AllLinesLine> | null | undefined,
): number {
  const ra = categoryRank(trafficCategory(a, lineLookup));
  const rb = categoryRank(trafficCategory(b, lineLookup));
  if (ra !== rb) return ra - rb;
  const sa = subCategoryRank(trafficSubCategory(a, lineLookup));
  const sb = subCategoryRank(trafficSubCategory(b, lineLookup));
  if (sa !== sb) return sa - sb;
  return a.localeCompare(b, undefined, { numeric: true });
}
