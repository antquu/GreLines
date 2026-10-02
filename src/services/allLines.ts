export type LineFamily = 'tram' | 'chrono' | 'proximo' | 'flexo' | 'other';

export interface AllLinesLine {
  id: string;
  shortName: string;
  longName: string;
  color: string;
  textColor: string;
  family: LineFamily;
}

const ENDPOINT = 'https://data.mobilites-m.fr/api/routers/default/index/routes';
const STORAGE_KEY = 'greLines_allLinesCache_v1';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

let cache: AllLinesLine[] | null = null;
let inflight: Promise<AllLinesLine[]> | null = null;
let cacheHydrated = false;

function canUseLocalStorageAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function hydrateCache(): void {
  if (cacheHydrated) return;
  cacheHydrated = true;
  if (!canUseLocalStorageAvailable()) return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { timestamp?: number; data?: AllLinesLine[] } | null;
    if (!parsed || !Array.isArray(parsed.data) || typeof parsed.timestamp !== 'number') return;
    if (Date.now() - parsed.timestamp > CACHE_TTL_MS) return;
    cache = parsed.data;
  } catch {

  }
}

function persistCache(lines: AllLinesLine[]): void {
  if (!canUseLocalStorageAvailable()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      timestamp: Date.now(),
      data: lines,
    }));
  } catch {

  }
}

function withHash(hex: string | undefined, fallback: string): string {
  if (!hex) return fallback;
  return hex.startsWith('#') ? hex : `#${hex}`;
}

function familyFromType(type: string | undefined): LineFamily {
  switch ((type || '').toUpperCase()) {
    case 'TRAM':         return 'tram';
    case 'CHRONO':
    case 'CHRONO_PERI':  return 'chrono';
    case 'PROXIMO':      return 'proximo';
    case 'FLEXO':        return 'flexo';
    default:             return 'other';
  }
}

export async function getAllSemLines(): Promise<AllLinesLine[]> {
  hydrateCache();
  if (cache) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const resp = await fetch(ENDPOINT);
      if (!resp.ok) return [];
      const data = await resp.json();
      if (!Array.isArray(data)) return [];
      const lines: AllLinesLine[] = data
        .map((r: any) => ({
          id: String(r?.id || ''),
          shortName: String(r?.shortName || ''),
          longName: String(r?.longName || ''),
          color: withHash(r?.color, '#3b82f6'),
          textColor: withHash(r?.textColor, '#FFFFFF'),
          family: familyFromType(r?.type),
        }))
        .filter(l => l.shortName);
      cache = lines;
      persistCache(lines);
      return lines;
    } catch (err) {
      return cache || [];
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

const NETWORK_PRIORITY = ['SEM', 'SE2', 'GSV', 'TPV', 'BUL', 'FUN', 'TRA', 'MCO', 'SNC', 'C38'];

function networkRank(id: string): number {
  const rank = NETWORK_PRIORITY.indexOf(id.slice(0, 3).toUpperCase());
  return rank === -1 ? NETWORK_PRIORITY.length : rank;
}

export function buildLineLookup(lines: AllLinesLine[]): Map<string, AllLinesLine> {
  const m = new Map<string, AllLinesLine>();

  for (const line of lines) {
    m.set(line.id.toUpperCase().trim(), line);
  }

  for (const line of [...lines].sort((a, b) => networkRank(a.id) - networkRank(b.id))) {
    const id = line.id.toUpperCase().trim();
    for (const key of [line.shortName.toUpperCase().trim(), id.replace(/^(?:SEM:|SEM_)/, '')]) {
      if (key && !m.has(key)) m.set(key, line);
    }
  }

  return m;
}
