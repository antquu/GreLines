/**
 * Fetch the full SEM line catalogue from MTAG once and cache it.
 *
 * Endpoint: `/api/routers/default/index/routes`
 *
 * Returns a flat array of routes (no FeatureCollection wrapping). Each entry
 * has `id`, `shortName`, `longName`, `color`, `textColor`, and a `type` field
 * we map onto our own category buckets (tram / chrono / proximo / flexo).
 *
 * Used by the infotrafic panel so the line badges show their official MTAG
 * colours and shapes (round for tram + chrono, rectangle for the rest),
 * matching the look of the Sidebar.
 */

export type LineFamily = 'tram' | 'chrono' | 'proximo' | 'flexo' | 'other';

export interface AllLinesLine {
  id: string;        // "SEM:A", "SEM:C1", "SEM:16"
  shortName: string; // "A", "C1", "16"
  color: string;     // "#3376B8" (always with leading '#')
  textColor: string; // "#FFFFFF"
  family: LineFamily;
}

const ENDPOINT = 'https://data.mobilites-m.fr/api/routers/default/index/routes';

let cache: AllLinesLine[] | null = null;
let inflight: Promise<AllLinesLine[]> | null = null;

/** Normalize a hex string ("3376B8" or "#3376B8") to "#3376B8". */
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
          color: withHash(r?.color, '#3b82f6'),
          textColor: withHash(r?.textColor, '#FFFFFF'),
          family: familyFromType(r?.type),
        }))
        .filter(l => l.shortName);
      cache = lines;
      return lines;
    } catch (err) {
      void 0 && console.error('Failed to fetch all SEM lines:', err);
      return [];
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
export function buildLineLookup(lines: AllLinesLine[]): Map<string, AllLinesLine> {
  const m = new Map<string, AllLinesLine>();
  for (const line of lines) {
    const shortName = line.shortName.toUpperCase().trim();
    const id = line.id.toUpperCase().trim();
    const normalizedId = id.replace(/^(?:SEM:|SEM_)/, '');
    m.set(shortName, line);
    m.set(id, line);
    m.set(normalizedId, line);
  }
  return m;
}
