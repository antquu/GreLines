import type { Stop, Line, TrafficDetail } from '../types';

/**
 * Normalize a string for comparison:
 * - Lowercase
 * - Remove accents (NFD + strip combining marks)
 * - Replace any non-alphanumeric run by a single space
 * - Trim and collapse spaces
 */
function normalize(value: string | undefined | null): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Split a stop name into "significant" tokens for matching.
 * - Drops short connector words ("de", "la", "le", "du", "des", "et", "aux", "a", "au", "l", "d")
 * - Drops generic transport words that produce false positives ("arret", "station", "gare" alone is kept though)
 *
 * Returns an array like ["grenoble", "verdun", "preference"] for "Grenoble - Verdun-Préfecture".
 * If after filtering there are no tokens left (e.g. name was only stopwords), falls back to all tokens.
 */
function tokenizeStopName(name: string): string[] {
  const STOPWORDS = new Set([
    'de', 'des', 'du', 'la', 'le', 'les', 'l', 'd',
    'et', 'a', 'au', 'aux', 'en', 'sur', 'sous',
    'arret', 'station',
  ]);
  const tokens = normalize(name)
    .split(' ')
    .filter(t => t.length >= 2);

  const filtered = tokens.filter(t => !STOPWORDS.has(t));
  return filtered.length > 0 ? filtered : tokens;
}

/**
 * Check whether the stop name appears in a piece of text.
 * Strategy:
 *   1. Try the full normalized name as a single substring (covers exact match).
 *   2. Otherwise, require ALL significant tokens to appear as whole words.
 *
 * "Whole word" is enforced by checking that surrounding chars in the normalized
 * text are spaces (the normalization already converted punctuation to spaces).
 */
function textMentionsStopName(text: string, stopName: string): boolean {
  const normalizedText = ` ${normalize(text)} `;
  const normalizedName = normalize(stopName);
  if (!normalizedName) return false;

  // 1) Full-name substring (with word boundaries via spaces)
  if (normalizedText.includes(` ${normalizedName} `)) {
    return true;
  }

  // 2) All significant tokens must appear as whole words
  const tokens = tokenizeStopName(stopName);
  if (tokens.length === 0) return false;

  return tokens.every(token => normalizedText.includes(` ${token} `));
}

/**
 * Parse the `listeLigne` field of a TrafficDetail.
 * Format observed: lines separated by "_" with optional "SEM:" prefix.
 * Example: "SEM:A_SEM:B_SEM:C5" → ["A", "B", "C5"]
 */
function parseTrafficLineCodes(listeLigne: string | undefined | null): string[] {
  if (!listeLigne) return [];
  return String(listeLigne)
    .split('_')
    .map(s => s.trim())
    .filter(Boolean)
    .map(code => {
      if (code.startsWith('SEM:') || code.startsWith('SEM_')) return code.substring(4);
      return code;
    })
    .map(c => c.toUpperCase());
}

export interface StopTrafficAlert {
  /** The matching traffic detail, deduplicated */
  detail: TrafficDetail;
  /** The intersection between the alert's lines and the stop's lines */
  matchedLines: Line[];
}

/**
 * Find all traffic alerts that concern this stop.
 *
 * Double check:
 *   1. The stop name (normalized) appears in the alert description or title
 *   2. At least one line from the alert's listeLigne is served by this stop
 *
 * Both conditions must be true. The returned alerts include only the lines
 * that actually intersect (so the UI can show relevant badges).
 *
 * Each detail is deduplicated by (titre + description + dateFin) so that
 * the same disruption coming from multiple lines isn't shown N times.
 */
export function getStopTrafficAlerts(
  stop: Pick<Stop, 'name'>,
  stopLines: Line[],
): StopTrafficAlert[] {
  if (!stop?.name || !stopLines || stopLines.length === 0) return [];

  // Build set of line codes served by this stop (uppercased)
  const stopLineIdsByCode = new Map<string, Line>();
  for (const line of stopLines) {
    const id = (line.id || '').toUpperCase();
    const short = (line.shortName || '').toUpperCase();
    if (id) stopLineIdsByCode.set(id, line);
    if (short) stopLineIdsByCode.set(short, line);
  }

  // Collect all unique trafficDetails attached to the stop's lines
  // (avoids duplicate processing when the same disruption is attached to
  // several lines of this stop)
  const seenKeys = new Set<string>();
  const allDetails: TrafficDetail[] = [];
  for (const line of stopLines) {
    if (!line.trafficDetails) continue;
    for (const d of line.trafficDetails) {
      const key = `${d.titre}|${d.description}|${d.dateFin}|${d.listeLigne}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      allDetails.push(d);
    }
  }

  const alerts: StopTrafficAlert[] = [];
  for (const detail of allDetails) {
    // Check 1: stop name in description (or title as fallback)
    const haystack = `${detail.titre || ''} ${detail.description || ''}`;
    if (!textMentionsStopName(haystack, stop.name)) continue;

    // Check 2: at least one line from the alert is served by this stop
    const alertCodes = parseTrafficLineCodes(detail.listeLigne);
    const matchedLines: Line[] = [];
    for (const code of alertCodes) {
      const line = stopLineIdsByCode.get(code);
      if (line && !matchedLines.includes(line)) matchedLines.push(line);
    }
    if (matchedLines.length === 0) continue;

    alerts.push({ detail, matchedLines });
  }

  return alerts;
}

// Exposed for testing only
export const __test = { normalize, tokenizeStopName, textMentionsStopName, parseTrafficLineCodes };