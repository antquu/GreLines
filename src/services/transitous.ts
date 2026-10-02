import { rememberRouteColor } from '../utils/routeLineResolver';
import { GTFS_NETWORKS, gtfsLineIdForShort, gtfsNetworkOfAgency, preloadGtfsNetwork } from './gtfsNetwork';

const ENDPOINT = 'https://api.transitous.org/api/v5/plan';

const TCL_PREFIX = 'fr-lyon-tcl_';
const TAG_PREFIX = 'fr-horaires-theoriques-du-reseau-tag_';

type NetworkMatcher = (agencyName: string | undefined) => string | null;

const normalizeName = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function networkMatcher(): Promise<NetworkMatcher> {
  const byAgency = await gtfsNetworkOfAgency();
  const brands = GTFS_NETWORKS.map(network => ({
    code: network.code,
    brand: normalizeName(network.label.split('—')[0]),
    city: normalizeName(network.city),
  }));
  return agencyName => {
    if (!agencyName) return null;
    const agency = normalizeName(agencyName);
    if (/\b(region|sncf|ter|ouigo|flixbus|blablacar)\b/.test(agency)) return null;
    const exact = byAgency.get(agencyName.trim().toLowerCase());
    if (exact) return exact;
    return brands.find(entry => agency.includes(entry.brand) || agency.includes(entry.city))?.code ?? null;
  };
}

type MotisPlace = {
  name?: string;
  stopId?: string;
  lat: number;
  lon: number;
  departure?: string;
  arrival?: string;
};

type MotisLeg = {
  mode: string;
  from: MotisPlace;
  to: MotisPlace;
  startTime: string;
  endTime: string;
  duration: number;
  distance?: number;
  realTime?: boolean;
  headsign?: string;
  routeId?: string;
  routeShortName?: string;
  routeLongName?: string;
  routeColor?: string;
  routeTextColor?: string;
  agencyName?: string;
  agencyId?: string;
  displayName?: string;
  tripShortName?: string;
  tripFrom?: MotisPlace;
  tripTo?: MotisPlace;
  intermediateStops?: MotisPlace[];
  legGeometry?: { points: string; precision?: number };
};

type MotisItinerary = {
  duration: number;
  startTime: string;
  endTime: string;
  legs: MotisLeg[];
};

const GRENOBLE_AREA = { south: 44.95, north: 45.4, west: 5.45, east: 6.1 };

export const isInGrenobleArea = (lat: number, lon: number) =>
  lat >= GRENOBLE_AREA.south && lat <= GRENOBLE_AREA.north && lon >= GRENOBLE_AREA.west && lon <= GRENOBLE_AREA.east;

const MODE: Record<string, string> = {
  SUBWAY: 'SUBWAY',
  METRO: 'RAIL',
  HIGHSPEED_RAIL: 'RAIL',
  LONG_DISTANCE: 'RAIL',
  NIGHT_RAIL: 'RAIL',
  REGIONAL_RAIL: 'RAIL',
  REGIONAL_FAST_RAIL: 'RAIL',
  RAIL: 'RAIL',
  COACH: 'BUS',
  AERIAL_LIFT: 'GONDOLA',
  BIKE: 'BICYCLE',
};

function decode(encoded: string, precision: number): Array<[number, number]> {
  const factor = 10 ** precision;
  const points: Array<[number, number]> = [];
  let index = 0;
  let lat = 0;
  let lon = 0;
  while (index < encoded.length) {
    for (const axis of [0, 1]) {
      let result = 0;
      let shift = 0;
      let byte = 0;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += delta; else lon += delta;
    }
    points.push([lat / factor, lon / factor]);
  }
  return points;
}

function encode(points: Array<[number, number]>): string {
  let out = '';
  let prevLat = 0;
  let prevLon = 0;
  const push = (value: number) => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    while (v >= 0x20) {
      out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    out += String.fromCharCode(v + 63);
  };
  for (const [lat, lon] of points) {
    const la = Math.round(lat * 1e5);
    const lo = Math.round(lon * 1e5);
    push(la - prevLat);
    push(lo - prevLon);
    prevLat = la;
    prevLon = lo;
  }
  return out;
}

const ms = (iso?: string) => (iso ? new Date(iso).getTime() : undefined);

type SncfRoute = { code: string; ends: string[] };

const normalizeStation = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(gare( de)?|re)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

let sncfRoutes: Promise<SncfRoute[]> | null = null;

function loadSncfRoutes(): Promise<SncfRoute[]> {
  sncfRoutes ??= fetch('https://data.mobilites-m.fr/api/routers/default/index/routes')
    .then(response => (response.ok ? response.json() : []))
    .then((routes: Array<{ id: string; shortName?: string; longName?: string }>) =>
      routes
        .filter(route => route.id.startsWith('SNC:') && route.shortName && route.longName)
        .map(route => ({
          code: route.shortName!,
          ends: route.longName!.split(/\s[-/]\s/).map(normalizeStation).filter(Boolean),
        })),
    )
    .catch(() => {
      sncfRoutes = null;
      return [];
    });
  return sncfRoutes;
}

function trainLineCode(leg: MotisLeg, routes: SncfRoute[]): string | null {
  const origin = normalizeStation(leg.tripFrom?.name ?? '');
  const terminus = normalizeStation(leg.tripTo?.name ?? '');
  if (!origin || !terminus) return null;
  const score = (station: string, ends: string[]) =>
    ends.includes(station) ? 2 : ends.some(end => end.includes(station) || station.includes(end)) ? 1 : 0;
  let best: { code: string; points: number } | null = null;
  for (const route of routes) {
    const a = score(origin, route.ends);
    const b = score(terminus, route.ends);
    if (!a || !b) continue;
    if (!best || a + b > best.points) best = { code: route.code, points: a + b };
  }
  return best?.code ?? null;
}

function lineOf(leg: MotisLeg, routes: SncfRoute[], matchNetwork: NetworkMatcher): { routeId: string; routeShortName: string } {
  const rawId = leg.routeId ?? '';
  const short = (leg.routeShortName || '').trim();
  if (rawId.startsWith(TCL_PREFIX)) return { routeId: `TCL:${short || rawId.slice(TCL_PREFIX.length)}`, routeShortName: short };
  if (rawId.startsWith(TAG_PREFIX)) return { routeId: `SEM:${short}`, routeShortName: short };
  const network = matchNetwork(leg.agencyName);
  if (network) {
    const routeId = gtfsLineIdForShort(network, short) ?? `${network}:${rawId.slice(rawId.lastIndexOf('_') + 1)}`;
    return { routeId, routeShortName: short };
  }
  const isSncf = /SNCF|\bTER\b|OUIGO/i.test(leg.agencyName ?? '') || /^TER\b/i.test(leg.displayName ?? '');
  if (isSncf) {
    const shortIsLine = /^[A-Z]{1,2}\d{1,3}[A-Z]?$/i.test(short);
    const code = (shortIsLine ? short : '') || trainLineCode(leg, routes);
    if (code) return { routeId: `SNC:${code}`, routeShortName: code };
    const kind = leg.mode === 'HIGHSPEED_RAIL' ? 'TGV' : 'TER';
    return { routeId: `SNC:${kind}`, routeShortName: kind };
  }
  const name = short || leg.displayName || leg.agencyName || '?';
  return { routeId: `EXT:${leg.agencyName ?? ''}:${name}`, routeShortName: name };
}

function toOtpLeg(leg: MotisLeg, fromName: string, toName: string, routes: SncfRoute[], matchNetwork: NetworkMatcher) {
  const place = (p: MotisPlace, fallback: string) => ({
    name: p.name === 'START' || p.name === 'END' ? fallback : p.name,
    stopId: p.stopId,
    lat: p.lat,
    lon: p.lon,
    departure: ms(p.departure),
    arrival: ms(p.arrival),
  });
  const isTransit = leg.mode !== 'WALK' && leg.mode !== 'BIKE' && leg.mode !== 'CAR';
  const line = isTransit ? lineOf(leg, routes, matchNetwork) : null;
  if (line && leg.routeColor) {
    rememberRouteColor(line.routeId, `#${leg.routeColor}`, leg.routeTextColor ? `#${leg.routeTextColor}` : undefined);
  }
  const geometry = leg.legGeometry?.points
    ? encode(decode(leg.legGeometry.points, leg.legGeometry.precision ?? 6))
    : '';

  return {
    mode: MODE[leg.mode] ?? leg.mode,
    startTime: ms(leg.startTime),
    endTime: ms(leg.endTime),
    duration: leg.duration,
    distance: leg.distance ?? 0,
    realTime: Boolean(leg.realTime),
    from: place(leg.from, fromName),
    to: place(leg.to, toName),
    legGeometry: { points: geometry },
    ...(line
      ? {
          routeId: line.routeId,
          route: line.routeShortName,
          routeShortName: line.routeShortName,
          routeLongName: leg.routeLongName,
          routeColor: leg.routeColor,
          routeTextColor: leg.routeTextColor,
          agencyName: leg.agencyName,
          headsign: leg.headsign,
          tripShortName: leg.tripShortName,
          intermediateStops: (leg.intermediateStops ?? []).map(stop => place(stop, stop.name ?? '')),
        }
      : {}),
  };
}

export type OtpItinerary = {
  duration: number;
  startTime?: number;
  endTime?: number;
  legs: ReturnType<typeof toOtpLeg>[];
};

export async function planTransitousOtp(options: {
  fromLatitude: number;
  fromLongitude: number;
  toLatitude: number;
  toLongitude: number;
  fromName: string;
  toName: string;
  arriveBy?: boolean;
  date?: string;
  time?: string;
  walkSpeed?: number;
  mode?: string;
  wheelchair?: boolean;
}): Promise<OtpItinerary[]> {
  const when = options.date && options.time ? new Date(`${options.date}T${options.time}:00`) : new Date();
  const params = new URLSearchParams({
    fromPlace: `${options.fromLatitude},${options.fromLongitude}`,
    toPlace: `${options.toLatitude},${options.toLongitude}`,
    time: when.toISOString(),
    arriveBy: options.arriveBy ? 'true' : 'false',
    numItineraries: '4',
    detailedTransfers: 'false',
  });
  if (options.walkSpeed) params.set('pedestrianSpeed', String(options.walkSpeed));
  if (options.wheelchair) params.set('pedestrianProfile', 'WHEELCHAIR');
  if (options.mode?.includes('BICYCLE')) params.set('preTransitModes', 'BIKE');

  const [response, routes, matchNetwork] = await Promise.all([
    fetch(`${ENDPOINT}?${params.toString()}`),
    loadSncfRoutes(),
    networkMatcher(),
  ]);
  if (!response.ok) return [];
  const data = await response.json() as { itineraries?: MotisItinerary[] };

  const codes = new Set((data.itineraries ?? []).flatMap(itinerary => itinerary.legs.map(leg => matchNetwork(leg.agencyName))));
  await Promise.all([...codes].filter((code): code is string => Boolean(code)).map(code => preloadGtfsNetwork(code)));

  return (data.itineraries ?? []).map(itinerary => ({
    duration: itinerary.duration,
    startTime: ms(itinerary.startTime),
    endTime: ms(itinerary.endTime),
    legs: itinerary.legs.map(leg => toOtpLeg(leg, options.fromName, options.toName, routes, matchNetwork)),
  }));
}
