/**
 * Option d'itinéraire en taxi (Taxis Grenoblois).
 *
 * L'opérateur ne publie pas d'API : sa grille est un tableau de prix par
 * destination. On en tire un modèle — prise en charge plus prix au kilomètre —
 * qui reproduit ce tableau à quelques euros près, appliqué à la distance
 * calculée par le routeur. Le résultat est annoncé comme une fourchette : le
 * compteur, lui, mesure aussi le temps passé aux feux.
 */

import { planDirectItinerary, type RouteItinerary, type TaxiJourneyInfo } from './api';
import { haversineMeters } from '../utils/geo';

/**
 * Modèle tarifaire, calé sur la grille publiée.
 *
 * Source : https://taxi-grenoble38.fr/tarifs-2026/grenoble-alentours-aeroports/
 * (relevée le 15/08/2026). Le tableau donne des prix de la gare de Grenoble vers
 * une trentaine de communes, de jour et de nuit. Une régression sur ces points
 * donne une prise en charge d'environ 15 € et 2,40 € du kilomètre ; la colonne
 * de nuit se retrouve en majorant le seul prix kilométrique de moitié — la
 * prise en charge, elle, ne bouge pas. Écart au tableau : deux à trois euros sur
 * les trajets d'agglomération.
 */
const PICKUP_FEE = 15;
const DAY_RATE_PER_KM = 2.4;
const NIGHT_RATE_MULTIPLIER = 1.5;

/** Course minimale relevée dans la grille (La Tronche, 10 min). */
const MINIMUM_DAY_FARE = 19;

/**
 * Tarif de nuit : 19 h – 7 h, dimanches et jours fériés.
 *
 * Les jours fériés ne sont pas calculés : il faudrait un calendrier pour douze
 * dates par an, et se tromper coûterait moins cher que de le laisser croire
 * exact — l'estimation est de toute façon annoncée comme telle.
 */
function isNightRate(when: Date): boolean {
  const hour = when.getHours();
  return hour >= 19 || hour < 7 || when.getDay() === 0;
}

/** Incertitude affichée autour de l'estimation : trafic, attente, itinéraire. */
const FARE_SPREAD = 0.12;

/** Réservation et renseignements, tels que publiés par l'opérateur. */
const TAXI_PHONE = '+33476544254';
const TAXI_BOOKING_URL = 'https://taxi-grenoble38.fr/';

/** Délai d'approche typique en agglomération, réservation comprise. */
const PICKUP_DELAY_MIN = 10;

/**
 * Au-delà, on sort de l'agglomération : la grille bascule sur des forfaits
 * (aéroports, longue distance) que ce modèle ne reproduit pas.
 */
const MAX_MODELLED_METERS = 40_000;

/** En deçà, on y va à pied. */
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

/**
 * Construit l'option taxi d'un trajet, ou `null` quand elle n'a pas lieu d'être
 * (trajet trop court, hors zone modélisée, routeur muet).
 */
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
