import { planDirectItinerary, type RouteItinerary, type TaxiJourneyInfo } from './api';
import { haversineMeters } from '../utils/geo';

const PICKUP_FEE = 15;
const DAY_RATE_PER_KM = 2.4;
const NIGHT_RATE_MULTIPLIER = 1.5;

const MINIMUM_DAY_FARE = 19;

function isNightRate(when: Date): boolean {
  const hour = when.getHours();
  return hour >= 19 || hour < 7 || when.getDay() === 0;
}

const FARE_SPREAD = 0.12;

const TAXI_PHONE = '+33476544254';
const TAXI_BOOKING_URL = 'https://taxi-grenoble38.fr/';

const PICKUP_DELAY_MIN = 10;

const MAX_MODELLED_METERS = 40_000;

const MIN_TRIP_METERS = 900;

const formatClock = (value: number): string =>
  new Date(value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

function estimateFare(meters: number, when: Date): { low: number; high: number; night: boolean } {
  const night = isNightRate(when);
  const perKm = night ? DAY_RATE_PER_KM * NIGHT_RATE_MULTIPLIER : DAY_RATE_PER_KM;
  const minimum = night ? MINIMUM_DAY_FARE * NIGHT_RATE_MULTIPLIER : MINIMUM_DAY_FARE;

  const total = Math.max(minimum, PICKUP_FEE + perKm * (meters / 1000));
  return {
    low: Math.round(total * (1 - FARE_SPREAD)),
    high: Math.round(total * (1 + FARE_SPREAD)),
    night,
  };
}

export async function planTaxiJourney(options: {
  fromLatitude: number;
  fromLongitude: number;
  toLatitude: number;
  toLongitude: number;
  fromName: string;
  toName: string;
  departAt?: Date;
}): Promise<RouteItinerary | null> {
  const straightLine = haversineMeters(
    options.fromLatitude,
    options.fromLongitude,
    options.toLatitude,
    options.toLongitude,
  );
  if (straightLine < MIN_TRIP_METERS) return null;

  const ride = await planDirectItinerary({
    fromLatitude: options.fromLatitude,
    fromLongitude: options.fromLongitude,
    toLatitude: options.toLatitude,
    toLongitude: options.toLongitude,
    mode: 'CAR',
  });
  if (!ride || ride.durationSeconds <= 0) return null;
  if (ride.distanceMeters > MAX_MODELLED_METERS) return null;

  const departAt = (options.departAt ?? new Date()).getTime();

  const rideSeconds = ride.durationSeconds;
  const arrival = departAt + (rideSeconds + PICKUP_DELAY_MIN * 60) * 1000;
  const rideMinutes = Math.max(1, Math.round(rideSeconds / 60));

  const fare = estimateFare(ride.distanceMeters, new Date(departAt));

  const taxi: TaxiJourneyInfo = {
    company: 'Taxis Grenoblois',
    lowEstimate: fare.low,
    highEstimate: fare.high,
    nightRate: fare.night,
    rideMinutes,
    rideMeters: Math.round(ride.distanceMeters),
    pickupDelayMinutes: PICKUP_DELAY_MIN,
    phone: TAXI_PHONE,
    bookingUrl: TAXI_BOOKING_URL,
  };

  const rideLeg = {
    mode: 'CAR',
    taxiCompany: taxi.company,
    startTime: departAt + PICKUP_DELAY_MIN * 60 * 1000,
    endTime: arrival,
    duration: rideSeconds,
    distance: ride.distanceMeters,
    from: { name: options.fromName, lat: options.fromLatitude, lon: options.fromLongitude },
    to: { name: options.toName, lat: options.toLatitude, lon: options.toLongitude },
    legGeometry: { points: ride.points },
  };

  const totalMinutes = Math.max(1, Math.round((arrival - departAt) / 60000));

  return {
    dep: formatClock(departAt),
    arr: formatClock(arrival),
    depName: options.fromName,
    arrName: options.toName,
    dur: `${totalMinutes} min`,
    direction: options.toName,
    lineKeys: [],
    legs: [],
    allLegs: [rideLeg],
    routePath: ride.coordinates,
    taxi,
  };
}
