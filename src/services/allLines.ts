
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

/**
 * Map the MTAG `type` field to our internal family. The remote API uses many
 * fine-grained tags (CHRONO, CHRONO_PERI, SCOL, NATURE, C38_*, MCO…); we only
 * surface the four families our infotrafic filter cares about and bucket
 * everything else into "other".
 */
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

/**
 * Returns every SEM line with its id, shortName, official color and family.
 * Cached: subsequent calls return the in-memory list. Returns an empty array
 * on failure so callers can still render with default colours.
 */
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

/**
 * Build a lookup map keyed by uppercase shortName ("A", "C1", "16") so the
 * infotrafic panel can resolve a traffic-info line name to its colour and
 * family.
 */
/**
 * Réseaux prioritaires pour un code de ligne ambigu.
 *
 * Trois codes existent sur deux réseaux à la fois : `C1` et `C6` (SEM et SNC),
 * `C11` (SE2 et SNC). Ce sont les lignes TER qui portent les mêmes numéros que
 * des lignes urbaines. Sans arbitrage, le dernier arrivé dans le catalogue
 * l'emportait — d'où une ligne C1 affichée avec la couleur du TER.
 *
 * L'ordre dit ce que désigne un code nu : dans une application centrée sur
 * l'agglomération, « C1 » veut dire la ligne urbaine.
 */
const NETWORK_PRIORITY = ['SEM', 'SE2', 'GSV', 'TPV', 'BUL', 'FUN', 'TRA', 'MCO', 'SNC', 'C38'];

function networkRank(id: string): number {
  const rank = NETWORK_PRIORITY.indexOf(id.slice(0, 3).toUpperCase());
  return rank === -1 ? NETWORK_PRIORITY.length : rank;
}

/**
 * Index des lignes, par identifiant complet et par code nu.
 *
 * L'identifiant complet est toujours exact. Le code nu ne l'est pas quand deux
 * réseaux le partagent : il désigne alors la ligne du réseau le plus
 * prioritaire, et les appelants qui connaissent l'identifiant complet doivent
 * le passer plutôt que le code.
 */
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
