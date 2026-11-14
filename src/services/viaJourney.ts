import { planItineraries, type RouteItinerary } from './api';

export interface JourneyPoint {
  label: string;
  lat: number;
  lon: number;
}

export interface ViaPlanOptions {
  arriveBy?: boolean;
  date?: string;
  time?: string;
  departNow?: boolean;
  walkReluctance?: number;
  walkSpeed?: number;
  mode?: string;
  wheelchair?: boolean;
}

const MAX_CANDIDATES = 3;

const pad = (value: number) => String(value).padStart(2, '0');

const dateOf = (at: number) => {
  const date = new Date(at);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const timeOf = (at: number) => {
  const date = new Date(at);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const clockOf = (at: number) => new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

const startOf = (itinerary: RouteItinerary) => Number(itinerary.allLegs?.[0]?.startTime);

const endOf = (itinerary: RouteItinerary) => Number(itinerary.allLegs?.[itinerary.allLegs.length - 1]?.endTime);

const usable = (itinerary: RouteItinerary) =>
  (itinerary.allLegs?.length ?? 0) > 0 && Number.isFinite(startOf(itinerary)) && Number.isFinite(endOf(itinerary));

function mergeParts(parts: RouteItinerary[], points: JourneyPoint[]): RouteItinerary {
  const allLegs: RouteItinerary['allLegs'] = [];
  const viaStops: NonNullable<RouteItinerary['viaStops']> = [];

  parts.forEach((part, partIndex) => {
    const legs = part.allLegs ?? [];
    const isLastPart = partIndex === parts.length - 1;
    legs.forEach((leg, legIndex) => {
      let next = leg;
      if (partIndex > 0 && legIndex === 0) {
        const via = points[partIndex];
        viaStops.push({ label: via.label, lat: via.lat, lon: via.lon, legIndex: allLegs.length });
        next = { ...next, viaStop: via.label };
        if (next.mode === 'WALK') next = { ...next, from: { ...next.from, name: via.label } };
      }
      if (!isLastPart && legIndex === legs.length - 1 && next.mode === 'WALK') {
        next = { ...next, to: { ...next.to, name: points[partIndex + 1].label } };
      }
      allLegs.push(next);
    });
  });

  const first = parts[0];
  const last = parts[parts.length - 1];
  const start = Number(allLegs[0]?.startTime);
  const end = Number(allLegs[allLegs.length - 1]?.endTime);
  const minutes = Math.max(0, Math.round((end - start) / 60_000));

  return {
    ...first,
    dep: clockOf(start),
    arr: clockOf(end),
    depName: points[0].label,
    arrName: points[points.length - 1].label,
    dur: `${minutes} min`,
    direction: last.direction,
    lineKeys: parts.flatMap(part => part.lineKeys ?? []),
    legs: parts.flatMap(part => part.legs ?? []),
    allLegs,
    routePath: parts.flatMap(part => part.routePath ?? []),
    tight: first.tight,
    rush: first.rush,
    bikeTransit: parts.some(part => part.bikeTransit),
    viaStops,
  };
}

export async function planViaItineraries(points: JourneyPoint[], options: ViaPlanOptions = {}): Promise<RouteItinerary[]> {
  if (points.length < 2) return [];

  const segment = (index: number, timing: ViaPlanOptions) =>
    planItineraries({
      fromLatitude: points[index].lat,
      fromLongitude: points[index].lon,
      toLatitude: points[index + 1].lat,
      toLongitude: points[index + 1].lon,
      fromName: points[index].label,
      toName: points[index + 1].label,
      walkReluctance: options.walkReluctance,
      walkSpeed: options.walkSpeed,
      mode: options.mode,
      wheelchair: options.wheelchair,
      ...timing,
    }).then(found => found.filter(usable));

  const timing = { arriveBy: options.arriveBy, date: options.date, time: options.time, departNow: options.departNow };
  const segmentCount = points.length - 1;
  if (segmentCount === 1) return segment(0, timing);

  const lookups = new Map<string, Promise<RouteItinerary | null>>();
  const follow = (index: number, at: number, backwards: boolean) => {
    const key = `${index}|${Math.floor(at / 60_000)}`;
    let pending = lookups.get(key);
    if (!pending) {
      pending = segment(index, { arriveBy: backwards, date: dateOf(at), time: timeOf(at), departNow: false })
        .then(found => {
          const fitting = backwards ? found.filter(item => endOf(item) <= at + 60_000) : found.filter(item => startOf(item) >= at - 60_000);
          if (fitting.length === 0) return null;
          return fitting.reduce((best, item) =>
            backwards ? (startOf(item) > startOf(best) ? item : best) : (endOf(item) < endOf(best) ? item : best));
        })
        .catch(() => null);
      lookups.set(key, pending);
    }
    return pending;
  };

  const backwards = Boolean(options.arriveBy);
  const anchors = (await segment(backwards ? segmentCount - 1 : 0, timing)).slice(0, MAX_CANDIDATES);

  const chained = await Promise.all(anchors.map(async anchor => {
    const parts = [anchor];
    if (backwards) {
      for (let index = segmentCount - 2; index >= 0; index -= 1) {
        const previous = await follow(index, startOf(parts[0]), true);
        if (!previous) return null;
        parts.unshift(previous);
      }
    } else {
      for (let index = 1; index < segmentCount; index += 1) {
        const next = await follow(index, endOf(parts[parts.length - 1]), false);
        if (!next) return null;
        parts.push(next);
      }
    }
    return mergeParts(parts, points);
  }));

  const seen = new Set<string>();
  return chained.filter((itinerary): itinerary is RouteItinerary => {
    if (!itinerary) return false;
    const key = `${itinerary.dep}|${itinerary.arr}|${itinerary.lineKeys.join(',')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
