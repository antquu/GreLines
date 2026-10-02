import type { AllLinesLine } from '../services/allLines';
import { isSncfLine, resolveLineStyle, SNCF_TER_COLOR } from './lineColors';
import { tclSolidStyle } from './tclLogos';
import { gtfsLineStyle } from '../services/gtfsNetwork';
import { isGtfsNetworkId } from '../services/gtfsNetworkIds';

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

const announcedColors = new Map<string, { color: string; textColor?: string }>();

export const rememberRouteColor = (routeId: string, color: string, textColor?: string) => {
  announcedColors.set(routeId, { color, textColor });
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
  if (routeId && String(routeId).startsWith('EXT:')) {
    const shortName = String(routeShortName || route || routeId.split(':').pop() || '?');
    const announced = announcedColors.get(routeId);
    return {
      id: routeId,
      shortName,
      color: announced?.color ?? '#6B7280',
      textColor: announced?.textColor ?? '#FFFFFF',
      normalized: shortName.toUpperCase(),
    };
  }

  if (routeId && isGtfsNetworkId(routeId)) {
    const shortName = String(routeShortName || route || routeId.slice(routeId.indexOf(':') + 1));
    const solid = gtfsLineStyle(routeId);
    const announced = announcedColors.get(routeId);
    return {
      id: routeId,
      shortName,
      color: solid?.backgroundColor ?? announced?.color ?? '#6B7280',
      textColor: solid?.color ?? announced?.textColor ?? '#FFFFFF',
      normalized: shortName.toUpperCase(),
    };
  }

  if (routeId && String(routeId).startsWith('TCL:')) {
    const shortName = String(routeShortName || route || routeId.slice(4));
    const solid = tclSolidStyle(routeId);
    const announced = announcedColors.get(routeId);
    return {
      id: routeId,
      shortName,
      color: solid?.backgroundColor ?? announced?.color ?? '#6B7280',
      textColor: solid?.color ?? announced?.textColor ?? '#FFFFFF',
      normalized: shortName.toUpperCase(),
    };
  }

  if (routeId && isSncfLine(String(routeId))) {
    const shortName = String(routeShortName || route || String(routeId).slice(4));
    const id = routeShortName ? `SNC:${routeShortName}` : String(routeId);
    return { id, shortName, color: SNCF_TER_COLOR, textColor: '#FFFFFF', normalized: shortName.toUpperCase() };
  }

  const candidates = getRouteCandidates(routeShortName, route, routeId, lineKey);
  const normalized = candidates[0] || null;
  if (!normalized) return null;

  const resolved = candidates
    .map(candidate => lineLookup?.get(candidate))
    .find((line): line is AllLinesLine => Boolean(line));

  const announced = routeId ? announcedColors.get(String(routeId)) : undefined;
  let rawColor = resolved?.color ?? announced?.color;
  let rawTextColor = resolved?.textColor ?? announced?.textColor;

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
