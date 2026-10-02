import { planDirectItinerary, type RouteItinerary, type SharedJourneyInfo } from './api';
import {
  fetchSharedMobility,
  formFactorLabel,
  SHARED_OPERATOR_LABELS,
  type SharedOperator,
  type SharedVehiclePoint,
} from './sharedMobility';
import { getSharedPricing } from './sharedPricing';
import { haversineMeters } from '../utils/geo';

const MAX_ACCESS_METERS: Record<SharedOperator, number> = { voi: 700, velostan: 700, citiz: 1_100 };

const MIN_TRIP_METERS = 900;

const PICKUP_OVERHEAD_MIN: Record<SharedOperator, number> = { voi: 1, velostan: 1, citiz: 4 };

const RIDE_MODE: Record<SharedOperator, 'BICYCLE' | 'CAR'> = { voi: 'BICYCLE', velostan: 'BICYCLE', citiz: 'CAR' };

const formatClock = (value: number): string =>
  new Date(value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

function nearestPoint(
  points: SharedVehiclePoint[],
  lat: number,
  lon: number,
  maxMeters: number,
): { point: SharedVehiclePoint; meters: number } | null {
  let best: { point: SharedVehiclePoint; meters: number } | null = null;
  for (const point of points) {
    const meters = haversineMeters(lat, lon, point.lat, point.lon);
    if (meters > maxMeters) continue;
    if (!best || meters < best.meters) best = { point, meters };
  }
  return best;
}

async function estimatePrice(
  operator: SharedOperator,
  formFactor: string,
  minutes: number,
  meters: number,
): Promise<SharedJourneyInfo['price']> {
  const pricing = await getSharedPricing(operator, formFactor);
  if (!pricing) return null;

  const unlock = pricing.unlockPrice ?? 0;
  const usage = pricing.usageRate
    ? pricing.usageRate * Math.ceil(minutes / pricing.usageIntervalMinutes)
    : 0;
  const distance = pricing.perKmRate ? pricing.perKmRate * (meters / 1000) : 0;

  return {
    total: Math.round((unlock + usage + distance) * 100) / 100,
    unlock: pricing.unlockPrice,
    usageRate: pricing.usageRate,
    usageIntervalMinutes: pricing.usageIntervalMinutes,
    perKmRate: pricing.perKmRate,
  };
}

async function buildOption(
  operator: SharedOperator,
  points: SharedVehiclePoint[],
  options: {
    fromLatitude: number;
    fromLongitude: number;
    toLatitude: number;
    toLongitude: number;
    fromName: string;
    toName: string;
    departAt: number;
    walkSpeed?: number;
  },
): Promise<RouteItinerary | null> {
  const nearest = nearestPoint(
    points,
    options.fromLatitude,
    options.fromLongitude,
    MAX_ACCESS_METERS[operator],
  );
  if (!nearest) return null;

  const vehicle = nearest.point.vehicles[0];
  const formFactor = vehicle?.formFactor ?? (operator === 'citiz' ? 'car' : 'scooter');

  const [access, ride] = await Promise.all([
    planDirectItinerary({
      fromLatitude: options.fromLatitude,
      fromLongitude: options.fromLongitude,
      toLatitude: nearest.point.lat,
      toLongitude: nearest.point.lon,
      mode: 'WALK',
      walkSpeed: options.walkSpeed,
    }),
    planDirectItinerary({
      fromLatitude: nearest.point.lat,
      fromLongitude: nearest.point.lon,
      toLatitude: options.toLatitude,
      toLongitude: options.toLongitude,
      mode: RIDE_MODE[operator],
    }),
  ]);
  if (!ride) return null;

  const accessSeconds = access?.durationSeconds ?? Math.round((nearest.meters / 1.4));
  const accessMeters = access?.distanceMeters ?? nearest.meters;
  const rideSeconds = ride.durationSeconds + PICKUP_OVERHEAD_MIN[operator] * 60;

  const walkEnd = options.departAt + accessSeconds * 1000;
  const arrival = walkEnd + rideSeconds * 1000;
  const rideMinutes = Math.max(1, Math.round(rideSeconds / 60));

  const pickupName =
    nearest.point.name ||
    [formFactorLabel(formFactor, 'fr'), SHARED_OPERATOR_LABELS[operator]].filter(Boolean).join(' ');

  const price = await estimatePrice(operator, formFactor, rideMinutes, ride.distanceMeters);

  const walkLeg = {
    mode: 'WALK',
    startTime: options.departAt,
    endTime: walkEnd,
    duration: accessSeconds,
    distance: accessMeters,
    from: { name: options.fromName, lat: options.fromLatitude, lon: options.fromLongitude },
    to: { name: pickupName, lat: nearest.point.lat, lon: nearest.point.lon },
    legGeometry: { points: access?.points ?? '' },
  };

  const rideLeg = {
    mode: RIDE_MODE[operator],
    sharedOperator: operator,
    sharedFormFactor: formFactor,
    startTime: walkEnd,
    endTime: arrival,
    duration: rideSeconds,
    distance: ride.distanceMeters,
    from: { name: pickupName, lat: nearest.point.lat, lon: nearest.point.lon },
    to: { name: options.toName, lat: options.toLatitude, lon: options.toLongitude },
    legGeometry: { points: ride.points },
  };

  const shared: SharedJourneyInfo = {
    operator,
    formFactor,
    accessMeters: Math.round(accessMeters),
    rideMinutes,
    rideMeters: Math.round(ride.distanceMeters),
    pickupName: nearest.point.name,
    batteryPercent: vehicle?.batteryPercent,
    propulsion: vehicle?.propulsion,
    batteryEstimated: vehicle?.batteryEstimated,
    model: vehicle?.model,
    rentalUrl: vehicle?.rentalUrl,
    price,
  };

  const totalMinutes = Math.max(1, Math.round((arrival - options.departAt) / 60000));

  return {
    dep: formatClock(options.departAt),
    arr: formatClock(arrival),
    depName: options.fromName,
    arrName: options.toName,
    dur: `${totalMinutes} min`,
    direction: options.toName,
    lineKeys: [],
    legs: [],
    allLegs: [walkLeg, rideLeg],
    routePath: [...(access?.coordinates ?? []), ...ride.coordinates],
    shared,
  };
}

export async function planSharedJourneys(options: {
  fromLatitude: number;
  fromLongitude: number;
  toLatitude: number;
  toLongitude: number;
  fromName: string;
  toName: string;
  departAt?: Date;
  walkSpeed?: number;
  signal?: AbortSignal;
}): Promise<RouteItinerary[]> {
  const straightLine = haversineMeters(
    options.fromLatitude,
    options.fromLongitude,
    options.toLatitude,
    options.toLongitude,
  );
  if (straightLine < MIN_TRIP_METERS) return [];

  const departAt = (options.departAt ?? new Date()).getTime();

  try {
    const fleet = await fetchSharedMobility({ signal: options.signal });
    const built = await Promise.all([
      buildOption('voi', fleet.voi, { ...options, departAt }),
      buildOption('velostan', fleet.velostan, { ...options, departAt }),
      buildOption('citiz', fleet.citiz, { ...options, departAt }),
    ]);
    return built.filter((option): option is RouteItinerary => option !== null);
  } catch {
    return [];
  }
}
