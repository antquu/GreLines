import type { Stop } from '../types';

export interface PrintedStop {
  name: string;
  city?: string;
}

export const PRINTED_STOP_IDS: Record<string, PrintedStop> = {
  'SEM:GARES': { name: 'Gares', city: 'Grenoble' },
  'SEM:CHAVANT': { name: 'Chavant', city: 'Grenoble' },
};

export function normalizeStopId(id: string | null | undefined): string | null {
  if (!id) return null;
  const trimmed = id.trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  return /^SEM[:_]/.test(upper) ? upper.replace('SEM_', 'SEM:') : `SEM:${upper}`;
}

export function normalizeStopName(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

export function resolveStopFromUrlId(
  rawId: string | null | undefined,
  stops: Stop[],
): Stop | undefined {
  const id = normalizeStopId(rawId);
  if (!id || stops.length === 0) return undefined;

  const exact = stops.find(stop => normalizeStopId(stop.id) === id);
  if (exact) return exact;

  const printed = PRINTED_STOP_IDS[id];
  if (!printed) return undefined;

  const wanted = normalizeStopName(printed.name);
  const byName = stops.filter(stop => normalizeStopName(stop.name) === wanted);
  if (byName.length === 1) return byName[0];
  if (byName.length > 1 && printed.city) {
    const wantedCity = normalizeStopName(printed.city);
    const byCity = byName.filter(stop => normalizeStopName(stop.city) === wantedCity);
    if (byCity.length === 1) return byCity[0];
  }
  return undefined;
}

export function printableStopId(stop: Stop): string {
  const wanted = normalizeStopName(stop.name);
  const wantedCity = normalizeStopName(stop.city);
  for (const [printedId, printed] of Object.entries(PRINTED_STOP_IDS)) {
    if (normalizeStopName(printed.name) !== wanted) continue;
    if (printed.city && normalizeStopName(printed.city) !== wantedCity) continue;
    return printedId;
  }
  return normalizeStopId(stop.id) ?? stop.id;
}
