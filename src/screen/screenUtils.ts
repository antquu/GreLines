import type { Departure, Line, StopDetail } from '../types';
import { normalizeMode } from '../utils/transportMode';
import { appLanguage } from '../utils/appLanguage';
import { tx } from '../i18n';

export const TIMES_PER_DIRECTION = 2;

export const DIRECTIONS_PER_LINE = 2;

export interface ScreenDirection {
  destination: string;
  departures: Departure[];
}

export interface ScreenLineGroup {
  lineId: string;
  label: string;
  longName: string;
  color?: string;
  textColor?: string;
  hasTraffic?: boolean;

  mode: string;
  directions: ScreenDirection[];
}

const TRAM_LABELS = new Set(['A', 'B', 'C', 'D', 'E']);

function lineRank(label: string, mode: string): [number, number, string] {
  const code = label.toUpperCase().trim();
  if (normalizeMode(mode) === 'RAIL') return [0, 0, code];
  if (TRAM_LABELS.has(code)) return [1, code.charCodeAt(0), code];
  const chrono = /^C(\d+)$/.exec(code);
  if (chrono) return [2, Number(chrono[1]), code];
  const numeric = /^(\d+)/.exec(code);
  if (numeric) return [3, Number(numeric[1]), code];
  return [4, 0, code];
}

function compareLines(a: ScreenLineGroup, b: ScreenLineGroup): number {
  const ra = lineRank(a.label, a.mode);
  const rb = lineRank(b.label, b.mode);
  if (ra[0] !== rb[0]) return ra[0] - rb[0];
  if (ra[1] !== rb[1]) return ra[1] - rb[1];
  return ra[2].localeCompare(rb[2], 'fr');
}

export function groupDeparturesForScreen(detail: StopDetail): ScreenLineGroup[] {

  const lineByRef = new Map<string, Line>();
  for (const line of detail.lines ?? []) {
    lineByRef.set(line.id, line);
    if (line.routeId) lineByRef.set(line.routeId, line);
  }

  const groups = new Map<string, ScreenLineGroup>();

  for (const departure of detail.departures ?? []) {
    if (departure.departureTime < 0) continue;

    const lineRef = departure.routeId || departure.lineId;
    let group = groups.get(lineRef);
    if (!group) {
      const meta = lineByRef.get(lineRef) ?? lineByRef.get(departure.lineId);
      group = {
        lineId: lineRef,
        label: meta?.shortName || departure.lineShortName || departure.lineId,
        longName: meta?.name || departure.lineName || '',
        color: meta?.color,
        textColor: meta?.textColor,
        hasTraffic: meta?.hasTraffic,
        mode: meta?.type || departure.type,
        directions: [],
      };
      groups.set(lineRef, group);
    }

    const destination = departure.destination?.trim() || tx(appLanguage() === 'fr').screenBoard.unknownDirection;
    let direction = group.directions.find(d => d.destination === destination);
    if (!direction) {
      direction = { destination, departures: [] };
      group.directions.push(direction);
    }

    const alreadyListed = direction.departures.some(d => d.departureTime === departure.departureTime);
    if (!alreadyListed && direction.departures.length < TIMES_PER_DIRECTION) {
      direction.departures.push(departure);
    }
  }

  const result = Array.from(groups.values());
  for (const group of result) {

    group.directions.sort(
      (a, b) => (a.departures[0]?.departureTime ?? Infinity) - (b.departures[0]?.departureTime ?? Infinity),
    );
    group.directions = group.directions.slice(0, DIRECTIONS_PER_LINE);
  }
  result.sort(compareLines);
  return result;
}

export const TRAIN_ROWS = 14;

// trains of a station, in departure order, like a station board
export function trainBoard(detail: StopDetail, now: number = Date.now()): Departure[] {
  return (detail.departures ?? [])
    .filter(departure => (departure.at ?? now + departure.departureTime * 60_000) >= now - 60_000)
    .sort((a, b) => scheduledAt(a, now) - scheduledAt(b, now))
    .slice(0, TRAIN_ROWS);
}

function scheduledAt(departure: Departure, now: number): number {
  return (departure.at ?? now + departure.departureTime * 60_000) - (departure.delayMinutes ?? 0) * 60_000;
}

export function scheduledClock(departure: Departure, now: Date = new Date()): string {
  const at = departure.at ?? now.getTime() + departure.departureTime * 60_000;
  const base = at - (departure.delayMinutes ?? 0) * 60_000;
  return new Date(base).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
}

export function departureClockTime(minutes: number, now: Date = new Date()): string {
  const at = new Date(now.getTime() + minutes * 60_000);
  return at.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export const CLOCK_TIME_THRESHOLD_MIN = 60;

export interface DepartureDisplay {

  value: string;

  isArrival: boolean;

  isClockTime: boolean;
}

export function departureDisplay(departure: Departure, now: Date = new Date()): DepartureDisplay {
  const minutes = departure.departureTime;
  if (minutes <= 0) return { value: '0', isArrival: true, isClockTime: false };
  if (minutes >= CLOCK_TIME_THRESHOLD_MIN) {
    return { value: departureClockTime(minutes, now), isArrival: false, isClockTime: true };
  }
  return { value: String(minutes), isArrival: false, isClockTime: false };
}

export type ScreenLayout = 'cards' | 'rows';

const ROWS_QUERY_VALUE = 'lignes';

export function parseScreenLayout(search: string): ScreenLayout {
  return new URLSearchParams(search).get('vue') === ROWS_QUERY_VALUE ? 'rows' : 'cards';
}

export interface ScreenPlace {
  name: string;
  city?: string;
}

// the stop name rides along in the link, so the screen can find its stop again if an id ever changes
export function buildScreenUrl(stopId: string, layout: ScreenLayout, place?: ScreenPlace | null): string {
  const params = new URLSearchParams();
  if (layout === 'rows') params.set('vue', ROWS_QUERY_VALUE);
  if (place?.name) params.set('nom', place.name);
  if (place?.city) params.set('ville', place.city);
  const query = params.toString();
  return `${SCREEN_BASE}/${stopId}${query ? `?${query}` : ''}`;
}

export function parseScreenPlace(search: string): ScreenPlace | null {
  const params = new URLSearchParams(search);
  const name = params.get('nom')?.trim();
  if (!name) return null;
  return { name, city: params.get('ville')?.trim() || undefined };
}

export const SCREEN_BASE = '/app/screen';

export function parseScreenStopId(pathname: string): string | null {
  if (!pathname.startsWith(SCREEN_BASE)) return null;
  const rest = pathname.slice(SCREEN_BASE.length).replace(/^\/+/, '').replace(/\/+$/, '');
  if (!rest) return null;

  let decoded = rest;
  try {
    decoded = decodeURIComponent(rest);
  } catch {
  }

  const separator = decoded.indexOf(':');
  if (separator > 0) {
    return `${decoded.slice(0, separator).toUpperCase()}${decoded.slice(separator)}`;
  }
  return decoded;
}
