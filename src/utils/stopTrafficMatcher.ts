import type { Stop, Line, TrafficDetail } from '../types';

function normalize(value: string | undefined | null): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

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

function textMentionsStopName(text: string, stopName: string): boolean {
  const normalizedText = ` ${normalize(text)} `;
  const normalizedName = normalize(stopName);
  if (!normalizedName) return false;

  if (normalizedText.includes(` ${normalizedName} `)) {
    return true;
  }

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

  const stopLineIdsByCode = new Map<string, Line>();
  for (const line of stopLines) {
    const id = (line.id || '').toUpperCase();
    const short = (line.shortName || '').toUpperCase();
    if (id) stopLineIdsByCode.set(id, line);
    if (short) stopLineIdsByCode.set(short, line);
  }

  /*
   * Une perturbation, une carte.
   *
   * Le réseau publie le même événement autant de fois qu'il touche de lignes :
   * même titre, même texte, même date de fin, seul le `listeLigne` change. La
   * clé de déduplication le contenait, si bien que sept copies d'une même
   * déviation devenaient sept cartes identiques à l'écran — on lisait sept fois
   * la même phrase pour n'apprendre qu'une chose, la liste des lignes touchées.
   *
   * On regroupe donc sur le contenu seul, et l'on réunit les lignes de toutes
   * les copies : la liste des lignes redevient ce qu'elle est, un attribut de
   * la perturbation, et non le motif qui la multiplie.
   */
  const byContent = new Map<string, { detail: TrafficDetail; codes: Set<string> }>();
  for (const line of stopLines) {
    if (!line.trafficDetails) continue;
    for (const d of line.trafficDetails) {
      const key = `${d.titre}|${d.description}|${d.dateFin}`;
      const existing = byContent.get(key);
      const codes = existing?.codes ?? new Set<string>();
      for (const code of parseTrafficLineCodes(d.listeLigne)) codes.add(code);
      if (!existing) byContent.set(key, { detail: d, codes });
    }
  }

  const alerts: StopTrafficAlert[] = [];
  for (const { detail, codes } of byContent.values()) {
    const haystack = `${detail.titre || ''} ${detail.description || ''}`;
    if (!textMentionsStopName(haystack, stop.name)) continue;

    const matchedLines: Line[] = [];
    for (const code of codes) {
      const line = stopLineIdsByCode.get(code);
      if (line && !matchedLines.includes(line)) matchedLines.push(line);
    }
    if (matchedLines.length === 0) continue;

    alerts.push({ detail, matchedLines });
  }

  return alerts;
}

/**
 * Restreint les perturbations aux lignes retenues par le filtre de la fiche.
 *
 * Filtrer un arrêt sur une ligne, c'est dire « je ne prends que celle-là » : les
 * déviations des huit autres n'ont alors plus rien à faire au-dessus des
 * départs. Les badges se réduisent eux aussi aux lignes retenues — une carte qui
 * en montrerait sept alors qu'on n'en regarde qu'une redirait le désordre qu'on
 * vient d'écarter.
 *
 * Sans filtre, rien ne change : tout l'arrêt est concerné.
 */
export function filterAlertsBySelectedLines(
  alerts: StopTrafficAlert[],
  selectedLineIds: Set<string>,
): StopTrafficAlert[] {
  if (selectedLineIds.size === 0) return alerts;
  return alerts.flatMap(alert => {
    const matchedLines = alert.matchedLines.filter(line => selectedLineIds.has(line.id));
    return matchedLines.length > 0 ? [{ detail: alert.detail, matchedLines }] : [];
  });
}

export const __test = { normalize, tokenizeStopName, textMentionsStopName, parseTrafficLineCodes };