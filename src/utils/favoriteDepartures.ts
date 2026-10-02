import type { FavoriteDetail } from '../hooks/useFavoriteDetails';
import type { AllLinesLine, LineFamily } from '../services/allLines';
import { getCachedStopLines } from '../services/api';

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
  theoretical?: boolean;
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
        theoretical: departure.theoretical,
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

export interface StopLine {
  lineId: string;
  shortName: string;
  color?: string | null;
  textColor?: string | null;
}

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

export function minutesUntilClock(clock: string): number | null {
  const match = /^(\d{1,2})[:h](\d{2})$/.exec(clock.trim());
  if (!match) return null;
  const target = new Date();
  target.setHours(Number(match[1]), Number(match[2]), 0, 0);
  const minutes = Math.round((target.getTime() - Date.now()) / 60_000);
  return minutes < -60 ? minutes + 24 * 60 : minutes;
}

export function formatWait(minutes: number | undefined, language: 'fr' | 'en'): string {
  if (minutes == null) return '–';
  if (minutes < 0) return '–';
  if (minutes === 0) return language === 'fr' ? 'ARR' : 'NOW';
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours}h${String(rest).padStart(2, '0')}` : `${hours}h`;
}
