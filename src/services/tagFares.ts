/**
 * Tarification des trajets en transport en commun (réseau M / TAG).
 *
 * L'API OTP de Mobilités M renvoie bien un bloc `fare`, mais il est vide : le
 * routeur n'embarque aucune grille tarifaire. Le prix est donc calculé ici, à
 * partir de la grille publiée par M réso, et de la seule règle qui compte pour
 * un trajet ponctuel : un titre vaut une heure, correspondances illimitées.
 */

import { NETWORKS } from './api';
import { networkOf } from './providers';

/** Un titre reste valable une heure à partir de la première validation. */
const TICKET_VALIDITY_MS = 60 * 60 * 1000;

interface FareTable {
  /** Date d'entrée en vigueur, au format ISO (comparaison lexicographique). */
  validFrom: string;
  /** Ticket 1 voyage, acheté hors du véhicule. */
  single: number;
  /** Carnet 10 voyages, prix du carnet entier. */
  carnet10: number;
  /** Pass 1 jour, tout le réseau. */
  day: number;
}

/**
 * Grille M réso, de la plus récente à la plus ancienne.
 *
 * Source : https://www.reso-m.fr/67-catalogue.htm (relevé le 15/08/2026).
 * Les tarifs changent au 1er septembre 2026 : les deux grilles cohabitent pour
 * qu'un trajet planifié en août affiche le prix d'août, et un trajet planifié
 * en septembre celui de septembre.
 */
const FARE_TABLES: FareTable[] = [
  { validFrom: '2026-09-01', single: 2.0, carnet10: 17.0, day: 6.6 },
  { validFrom: '0000-01-01', single: 2.0, carnet10: 16.7, day: 6.4 },
];

/**
 * Réseaux compris dans un titre M réso.
 *
 * SEM et SE2 (Tag), TPV (Pays Voironnais) et GSV (Le Grésivaudan) partagent la
 * même billettique. Le reste — TER (SNC), cars de la Région (C38), navettes —
 * se paie à part : on le signale plutôt que de l'ignorer, sinon le prix affiché
 * serait plus bas que celui réellement payé.
 */
const MRESO_NETWORKS = new Set(['SEM', 'SE2', 'TPV', 'GSV']);

/** Nom lisible d'un réseau, pour la mention « hors … ». */
export function networkLabel(code: string): string {
  return NETWORKS.find(network => network.code === code)?.label ?? code;
}

function fareTableFor(date: Date): FareTable {
  const iso = date.toISOString().slice(0, 10);
  return FARE_TABLES.find(table => iso >= table.validFrom) ?? FARE_TABLES[FARE_TABLES.length - 1];
}

export interface TransitFareEstimate {
  /** Nombre de titres à valider (un par heure entamée de trajet). */
  tickets: number;
  /** Prix au ticket 1 voyage. */
  total: number;
  /** Prix au carnet 10 voyages, toujours plus avantageux. */
  carnetTotal: number;
  /** Prix du pass 1 jour, quand il devient moins cher que les titres. */
  dayPassPrice: number | null;
  /**
   * Réseaux empruntés qui ne sont pas couverts par le titre : le total affiché
   * est alors un minimum.
   */
  uncoveredNetworks: string[];
}

/** Ce que le calcul du prix lit d'un tronçon d'itinéraire. */
interface FareLeg {
  mode?: string;
  startTime?: number;
  routeId?: string;
  route?: string;
  agencyId?: string;
}

function legNetwork(leg: FareLeg): string | null {
  return networkOf(String(leg.routeId ?? leg.agencyId ?? leg.route ?? ''));
}

/**
 * Estime le prix d'un itinéraire en transport en commun.
 *
 * Le compte des titres suit la validation : le premier couvre une heure, et
 * chaque montée au-delà de cette heure en consomme un nouveau. Renvoie `null`
 * quand l'itinéraire est entièrement à pied — il n'y a alors rien à payer.
 */
export function estimateTransitFare(legs: FareLeg[] | undefined): TransitFareEstimate | null {
  const transitLegs = (legs ?? [])
    .filter(leg => leg?.mode && leg.mode !== 'WALK' && leg.mode !== 'BICYCLE' && leg.mode !== 'CAR')
    .sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));

  if (transitLegs.length === 0) return null;

  const table = fareTableFor(
    transitLegs[0].startTime ? new Date(transitLegs[0].startTime) : new Date(),
  );

  let tickets = 1;
  let windowStart = Number(transitLegs[0].startTime ?? 0);
  for (const leg of transitLegs.slice(1)) {
    const boarding = Number(leg.startTime ?? 0);
    if (!windowStart || !boarding) continue;
    if (boarding - windowStart > TICKET_VALIDITY_MS) {
      tickets += 1;
      windowStart = boarding;
    }
  }

  const uncovered = new Set<string>();
  for (const leg of transitLegs) {
    const network = legNetwork(leg);
    if (network && !MRESO_NETWORKS.has(network)) uncovered.add(network);
  }

  const total = round2(tickets * table.single);
  const carnetTotal = round2((tickets * table.carnet10) / 10);

  return {
    tickets,
    total,
    carnetTotal,
    dayPassPrice: table.day < total ? table.day : null,
    uncoveredNetworks: [...uncovered],
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
