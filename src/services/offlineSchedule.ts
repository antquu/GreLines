import type { Departure } from '../types';
import { idbGet, idbSet } from './persistentCache';
import { isSimulatedOffline } from './networkSimulation';

/**
 * Les horaires théoriques gardés sur l'appareil, arrêt par arrêt.
 *
 * Sans réseau, le temps réel ne rend rien et la fiche d'un arrêt restait vide.
 * Le réseau publie pourtant la journée entière d'un arrêt en une seule
 * réponse : on la garde, et hors connexion on en tire les prochains passages
 * à partir de l'heure qu'il est.
 *
 * On ne garde pas une journée par date, mais une par sorte de jour : semaine,
 * samedi, dimanche. Une fiche de mardi dit à peu près ce que fera jeudi ; c'est
 * ce qui permet de rester utile des semaines sans avoir rien rechargé. Ces
 * heures sont une estimation, et l'interface les marque comme telles.
 *
 * Ce qui est gardé est réduit au strict nécessaire : une ligne, une
 * destination, une liste d'heures. La réponse brute pèse dix fois plus.
 */

export interface SchedulePattern {
  lineId: string;
  routeId?: string;
  lineName: string;
  lineShortName: string;
  destination: string;
  type: Departure['type'];
  /** Secondes depuis minuit du jour de service. Peut dépasser 24 h. */
  times: number[];
}

export interface DaySchedule {
  /** La date réellement chargée, au format `YYYYMMDD`. */
  date: string;
  /** Assemblée ligne par ligne : il peut manquer des lignes d'autres réseaux. */
  partial?: boolean;
  patterns: SchedulePattern[];
}

export type DayKind = 'wd' | 'sat' | 'sun';

const KEY_PREFIX = 'offsched_v1_';
/* Un mois et demi : assez pour survivre à des vacances sans réseau, pas au
   changement d'horaires de la rentrée suivante. */
const SCHEDULE_TTL_MS = 45 * 24 * 60 * 60 * 1000;

const memory = new Map<string, DaySchedule | null>();

export function dayKindOf(date: Date): DayKind {
  const day = date.getDay();
  if (day === 0) return 'sun';
  if (day === 6) return 'sat';
  return 'wd';
}

export function toScheduleDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/** Minuit du jour donné, décalé de `offset` jours. */
export function midnight(from: Date = new Date(), offset = 0): Date {
  const date = new Date(from);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date;
}

function keyOf(clusterId: string, kind: DayKind): string {
  return `${KEY_PREFIX}${clusterId}_${kind}`;
}

/** La journée gardée pour ce genre de jour, exacte ou non. */
export async function readDaySchedule(clusterId: string, date: Date): Promise<DaySchedule | null> {
  const key = keyOf(clusterId, dayKindOf(date));
  if (memory.has(key)) return memory.get(key) ?? null;
  const stored = await idbGet<DaySchedule>(key);
  const value = stored?.value ?? null;
  memory.set(key, value);
  return value;
}

export async function saveDaySchedule(clusterId: string, schedule: DaySchedule): Promise<void> {
  if (schedule.patterns.length === 0) return;
  const year = Number(schedule.date.slice(0, 4));
  const month = Number(schedule.date.slice(4, 6)) - 1;
  const day = Number(schedule.date.slice(6, 8));
  const key = keyOf(clusterId, dayKindOf(new Date(year, month, day)));
  memory.set(key, schedule);
  await idbSet(key, schedule, SCHEDULE_TTL_MS);
}

/**
 * Remplace, dans la journée gardée d'un arrêt, les passages d'une seule ligne.
 *
 * Le téléchargement du réseau avance ligne par ligne : chaque fiche horaire
 * touche une quarantaine d'arrêts, et chacun reçoit sa part sans perdre celle
 * des autres lignes. La journée est marquée partielle : les lignes d'autres
 * réseaux qui s'y arrêtent n'y sont pas, et l'arrêt se complètera de lui-même
 * à sa prochaine ouverture en ligne.
 */
export async function mergeLineSchedule(
  clusterId: string,
  day: Date,
  lineId: string,
  patterns: SchedulePattern[],
): Promise<void> {
  const existing = await readDaySchedule(clusterId, day);
  const kept = existing?.patterns.filter(pattern => pattern.lineId !== lineId) ?? [];
  const merged: DaySchedule = {
    date: existing?.date ?? toScheduleDate(day),
    partial: existing ? existing.partial : true,
    patterns: [...kept, ...patterns],
  };
  if (merged.patterns.length === 0) return;
  const key = keyOf(clusterId, dayKindOf(day));
  memory.set(key, merged);
  await idbSet(key, merged, SCHEDULE_TTL_MS);
}

/**
 * Les passages d'une journée gardée, posés sur un jour donné.
 *
 * `from` et `until` bornent la fenêtre, en millisecondes. Au plus
 * `perPattern` passages par ligne et destination.
 */
export function scheduleDepartures(
  entries: Array<{ schedule: DaySchedule; day: Date }>,
  options: { from: number; until: number; perPattern: number },
): Departure[] {
  const now = Date.now();
  const taken = new Map<string, number>();
  const seen = new Set<string>();
  const candidates: Departure[] = [];

  for (const { schedule, day } of entries) {
    const base = day.getTime();
    for (const pattern of schedule.patterns) {
      for (const seconds of pattern.times) {
        const at = base + seconds * 1000;
        if (at < options.from || at > options.until) continue;
        const dedupe = `${pattern.lineId}|${pattern.destination}|${at}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        candidates.push({
          lineId: pattern.lineId,
          routeId: pattern.routeId,
          lineName: pattern.lineName,
          lineShortName: pattern.lineShortName,
          destination: pattern.destination,
          departureTime: Math.round((at - now) / 60000),
          at,
          realtime: false,
          theoretical: true,
          type: pattern.type,
        });
      }
    }
  }

  candidates.sort((a, b) => (a.at ?? 0) - (b.at ?? 0));

  const result: Departure[] = [];
  for (const departure of candidates) {
    const key = `${departure.lineId}::${departure.destination}`;
    const count = taken.get(key) ?? 0;
    if (count >= options.perPattern) continue;
    taken.set(key, count + 1);
    result.push(departure);
  }
  return result;
}

/**
 * Vrai quand le navigateur se sait sans réseau, ou que le mode développeur
 * simule la coupure. Un faux « en ligne » reste possible : les requêtes qui
 * échouent sont traitées comme une coupure.
 */
export function isOffline(): boolean {
  if (isSimulatedOffline()) return true;
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}
