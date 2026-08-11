import type { Departure, Line, StopDetail } from '../types';
import { normalizeMode } from '../utils/transportMode';










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

    const destination = departure.destination?.trim() || 'Direction inconnue';
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


export function buildScreenUrl(stopId: string, layout: ScreenLayout): string {
  const path = `${SCREEN_BASE}/${stopId}`;
  return layout === 'rows' ? `${path}?vue=${ROWS_QUERY_VALUE}` : path;
}

/** Racine de l'affichage écran. Tout ce qui suit est l'identifiant d'arrêt. */
export const SCREEN_BASE = '/app/screen';

/**
 * Extrait l'identifiant d'arrêt de l'URL.
 *
 *   /app/screen            → null (page de choix)
 *   /app/screen/           → null
 *   /app/screen/SEM:CHAVANT → "SEM:CHAVANT"
 *   /app/screen/Sem%3ACHAVANT → "SEM:CHAVANT"
 *
 * Le code réseau est remis en majuscules : les URL saisies à la main sur un
 * téléviseur arrivent rarement dans la bonne casse, alors que l'API, elle, ne
 * connaît que « SEM: » ou « TCL: ».
 */
export function parseScreenStopId(pathname: string): string | null {
  if (!pathname.startsWith(SCREEN_BASE)) return null;
  const rest = pathname.slice(SCREEN_BASE.length).replace(/^\/+/, '').replace(/\/+$/, '');
  if (!rest) return null;

  let decoded = rest;
  try {
    decoded = decodeURIComponent(rest);
  } catch {
    // Séquence d'échappement invalide : on garde la valeur telle quelle.
  }

  const separator = decoded.indexOf(':');
  if (separator > 0) {
    return `${decoded.slice(0, separator).toUpperCase()}${decoded.slice(separator)}`;
  }
  return decoded;
}
