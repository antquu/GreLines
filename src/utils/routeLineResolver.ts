import type { AllLinesLine } from '../services/allLines';
import { resolveLineStyle } from './lineColors';

export interface ResolvedRouteLine {
  id: string;
  shortName: string;
  color: string;
  textColor: string;
  normalized: string;
}

export const normalizeRouteRef = (value?: string | null): string | null => {
  if (!value) return null;
  const code = String(value)
    .toUpperCase()
    .replace(/^(?:SEM|SE2):?/, '')
    .replace(/^(?:SEM|SE2)_/, '')
    .trim();
  return code || null;
};

export const getRouteCandidates = (...values: Array<string | undefined | null>): string[] => {
  const candidates = values
    .map(normalizeRouteRef)
    .filter((value): value is string => Boolean(value));
  return Array.from(new Set(candidates));
};

export const resolveRouteLine = ({
  routeShortName,
  route,
  routeId,
  lineKey,
  lineLookup,
  stops = [],
}: {
  routeShortName?: string | null;
  route?: string | null;
  routeId?: string | null;
  lineKey?: string | null;
  lineLookup?: Map<string, AllLinesLine> | null;
  stops?: any[];
}): ResolvedRouteLine | null => {
  const candidates = getRouteCandidates(routeShortName, route, routeId, lineKey);
  const normalized = candidates[0] || null;
  if (!normalized) return null;

  const resolved = candidates
    .map(candidate => lineLookup?.get(candidate))
    .find((line): line is AllLinesLine => Boolean(line));

  let rawColor = resolved?.color;
  let rawTextColor = resolved?.textColor;

  if (!rawColor || !rawTextColor) {
    for (const stop of stops) {
      for (const line of (stop.lines || [])) {
        const lineId = normalizeRouteRef(line.id);
        const shortName = normalizeRouteRef(line.shortName);
        const matches =
          (lineId && candidates.some(candidate => lineId === candidate || lineId.includes(candidate))) ||
          (shortName && candidates.includes(shortName));
        if (matches) {
          rawColor ||= line.color;
          rawTextColor ||= line.textColor;
          break;
        }
      }
      if (rawColor && rawTextColor) break;
    }
  }

  const style = resolveLineStyle(normalized, rawColor, rawTextColor);

  return {
    id: resolved?.id || normalized,
    shortName: resolved?.shortName || normalized,
    color: style.backgroundColor,
    textColor: style.color,
    normalized,
  };
};
