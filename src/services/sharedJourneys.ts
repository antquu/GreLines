/**
 * Options d'itinéraire en véhicule partagé (Voi, Citiz).
 *
 * Le routeur de Mobilités M ne connaît pas les flottes en libre-service : il
 * sait tracer un trajet à vélo ou en voiture, pas dire où se trouve la
 * trottinette la plus proche. On assemble donc l'option ici — véhicule
 * disponible le plus proche du départ, marche jusqu'à lui, puis course jusqu'à
 * l'arrivée — pour la proposer à côté des itinéraires en transport en commun.
 */

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

/**
 * Distance de marche acceptable jusqu'au véhicule.
 *
 * Une trottinette se prend au coin de la rue : au-delà, autant marcher tout
 * court. Une voiture Citiz se mérite un peu plus — les stations sont plus
 * rares, et le gain sur un long trajet compense l'approche.
 */
const MAX_ACCESS_METERS: Record<SharedOperator, number> = { voi: 700, citiz: 1_100 };

/**
 * En deçà, le véhicule partagé n'a pas de sens : le temps de le rejoindre et de
 * le déverrouiller, on serait arrivé à pied.
 */
const MIN_TRIP_METERS = 900;

/** Temps de prise en charge : déverrouillage, réglages, sortie de station. */
const PICKUP_OVERHEAD_MIN: Record<SharedOperator, number> = { voi: 1, citiz: 4 };

const RIDE_MODE: Record<SharedOperator, 'BICYCLE' | 'CAR'> = { voi: 'BICYCLE', citiz: 'CAR' };

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

/**
 * Coût d'une course : déverrouillage, puis temps et distance selon ce que
 * l'opérateur facture. Les minutes entamées se paient entières.
 */
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

/**
 * Construit les options en véhicule partagé pour un trajet donné.
 *
 * Renvoie une liste vide — sans jamais échouer — quand aucun véhicule n'est
 * assez proche ou que les flux opérateurs sont indisponibles : ces options
 * complètent les itinéraires en transport en commun, elles ne les conditionnent
 * pas.
 */
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
    const fleet = await fetchSharedMobility({ citiz: true, voi: true, signal: options.signal });
    const built = await Promise.all([
      buildOption('voi', fleet.voi, { ...options, departAt }),
      buildOption('citiz', fleet.citiz, { ...options, departAt }),
    ]);
    return built.filter((option): option is RouteItinerary => option !== null);
  } catch {
    return [];
  }
}
