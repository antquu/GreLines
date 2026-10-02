import { NETWORKS } from './api';
import { networkOf } from './providers';

const TICKET_VALIDITY_MS = 60 * 60 * 1000;

interface FareTable {
  validFrom: string;
  single: number;
  carnet10: number;
  day: number;
}

const FARE_TABLES: FareTable[] = [
  { validFrom: '2026-09-01', single: 2.0, carnet10: 17.0, day: 6.6 },
  { validFrom: '0000-01-01', single: 2.0, carnet10: 16.7, day: 6.4 },
];

const MRESO_NETWORKS = new Set(['SEM', 'SE2', 'TPV', 'GSV']);

export function networkLabel(code: string): string {
  return NETWORKS.find(network => network.code === code)?.label ?? code;
}

function fareTableFor(date: Date): FareTable {
  const iso = date.toISOString().slice(0, 10);
  return FARE_TABLES.find(table => iso >= table.validFrom) ?? FARE_TABLES[FARE_TABLES.length - 1];
}

export interface TransitFareEstimate {
  tickets: number;
  total: number;
  carnetTotal: number;
  dayPassPrice: number | null;
  uncoveredNetworks: string[];
}

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

export function estimateTransitFare(legs: FareLeg[] | undefined): TransitFareEstimate | null {
  const transitLegs = (legs ?? [])
    .filter(leg => leg?.mode && leg.mode !== 'WALK' && leg.mode !== 'BICYCLE' && leg.mode !== 'CAR')
    .sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));

  if (transitLegs.length === 0) return null;

  if (!transitLegs.some(leg => MRESO_NETWORKS.has(legNetwork(leg) ?? ''))) return null;

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
