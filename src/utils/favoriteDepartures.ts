/**
 * Les passages d'un arrêt favori, regroupés par ligne et par direction.
 *
 * L'API rend une liste plate de départs ; ce qu'on lit, ce sont des couples
 * « ligne + destination », chacun avec son prochain passage et le suivant. Deux
 * suffisent : celui qu'on attrape, et celui qu'on prendra si on le manque. Le
 * troisième ne change plus la décision.
 */

import type { FavoriteDetail } from '../hooks/useFavoriteDetails';
import type { AllLinesLine, LineFamily } from '../services/allLines';
import { getCachedStopLines } from '../services/api';

/**
 * L'ordre dans lequel on lit les lignes d'un arrêt.
 *
 * Le tram d'abord — c'est lui qu'on cherche, il passe souvent et il ne dévie
 * pas —, puis les Chrono, les Proximo, les Flexo, et le reste ensuite. C'est
 * l'ordre du réseau lui-même, du plus structurant au plus occasionnel, et c'est
 * celui dans lequel un voyageur cherche : on ne parcourt pas dix lignes pour
 * trouver le A.
 */
const FAMILY_RANK: Record<LineFamily, number> = {
  tram: 0,
  chrono: 1,
  proximo: 2,
  flexo: 3,
  other: 4,
};

function familyRank(
  group: { lineId: string; shortName: string },
  lineLookup?: Map<string, AllLinesLine> | null,
): number {
  if (!lineLookup) return FAMILY_RANK.other;
  const line =
    lineLookup.get(group.lineId.toUpperCase().trim()) ??
    lineLookup.get(group.shortName.toUpperCase().trim());
  return line ? FAMILY_RANK[line.family] : FAMILY_RANK.other;
}

export interface DepartureGroup {
  lineId: string;
  shortName: string;
  color?: string | null;
  textColor?: string | null;
  destination: string;
  times: number[];
}

export function groupFavoriteDepartures(
  detail: FavoriteDetail | undefined,
  lineLookup?: Map<string, AllLinesLine> | null,
): DepartureGroup[] {
  const departures = detail?.detail?.departures;
  const lines = detail?.detail?.lines;
  if (!detail || !departures || !lines) return [];

  const filter = detail.favorite.lines;
  const accepts = (lineId: string) => filter === 'all' || filter.includes(lineId);
  const map = new Map<string, DepartureGroup>();

  for (const departure of departures) {
    if (!accepts(departure.lineId) || departure.departureTime < 0) continue;
    const key = `${departure.lineId}|${departure.destination}`;
    if (!map.has(key)) {
      const line = lines.find(entry => entry.id === departure.lineId);
      map.set(key, {
        lineId: departure.lineId,
        shortName: departure.lineShortName || line?.shortName || departure.lineId,
        color: line?.color,
        textColor: line?.textColor,
        destination: departure.destination,
        times: [],
      });
    }
    const group = map.get(key)!;
    if (group.times.length < 2 && group.times[0] !== departure.departureTime) {
      group.times.push(departure.departureTime);
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const byFamily = familyRank(a, lineLookup) - familyRank(b, lineLookup);
    if (byFamily !== 0) return byFamily;
    const byLine = a.shortName.localeCompare(b.shortName, undefined, { numeric: true });
    return byLine !== 0 ? byLine : a.destination.localeCompare(b.destination);
  });
}

/** Une ligne d'arrêt, réduite à ce qu'il faut pour dessiner son badge. */
export interface StopLine {
  lineId: string;
  shortName: string;
  color?: string | null;
  textColor?: string | null;
}

/**
 * Les lignes qui desservent l'arrêt, une seule fois chacune, dans l'ordre.
 *
 * Elles viennent de la fiche de l'arrêt et non de ses départs : une ligne
 * dessert un arrêt même quand elle n'y passe plus de la nuit. Les déduire des
 * passages faisait disparaître les badges au moment où l'on en avait le plus
 * besoin — le soir, quand on vérifie s'il reste quelque chose.
 */
export function favoriteStopLines(
  detail: FavoriteDetail | undefined,
  lineLookup?: Map<string, AllLinesLine> | null,
): StopLine[] {
  const filter = detail?.favorite.lines;
  const accepts = (lineId: string) => !filter || filter === 'all' || filter.includes(lineId);

  const stopId = detail?.favorite.stopId;
  const known = detail?.detail?.lines ?? (stopId ? getCachedStopLines(stopId) : null) ?? [];

  const declared = known
    .filter(line => accepts(line.id))
    .map(line => ({
      lineId: line.id,
      shortName: line.shortName || line.id,
      color: line.color,
      textColor: line.textColor,
    }));

  const source: StopLine[] =
    declared.length > 0 ? declared : groupFavoriteDepartures(detail, lineLookup);

  const seen = new Set<string>();
  const unique = source.filter(line => {
    if (seen.has(line.lineId)) return false;
    seen.add(line.lineId);
    return true;
  });

  return unique.sort((a, b) => {
    const byFamily = familyRank(a, lineLookup) - familyRank(b, lineLookup);
    if (byFamily !== 0) return byFamily;
    return a.shortName.localeCompare(b.shortName, undefined, { numeric: true });
  });
}

/**
 * Minutes d'ici à une heure « HH:MM » d'aujourd'hui, ou `null` si illisible.
 *
 * Un départ passé de plus d'une heure est celui de demain à la même heure ;
 * passé de peu, c'est bien celui d'aujourd'hui, qu'on vient de rater.
 */
export function minutesUntilClock(clock: string): number | null {
  const match = /^(\d{1,2})[:h](\d{2})$/.exec(clock.trim());
  if (!match) return null;
  const target = new Date();
  target.setHours(Number(match[1]), Number(match[2]), 0, 0);
  const minutes = Math.round((target.getTime() - Date.now()) / 60_000);
  return minutes < -60 ? minutes + 24 * 60 : minutes;
}

/**
 * Un temps d'attente, écrit en toutes lettres courtes.
 *
 * « ARR » plutôt que « 0 min » : à zéro minute le véhicule est à quai, et c'est
 * une information différente — on court, on n'attend plus.
 */
export function formatWait(minutes: number | undefined, language: 'fr' | 'en'): string {
  if (minutes == null) return '–';
  if (minutes < 0) return '–';
  if (minutes === 0) return language === 'fr' ? 'ARR' : 'NOW';
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours}h${String(rest).padStart(2, '0')}` : `${hours}h`;
}
