import { getAllSemLines, type AllLinesLine, type LineFamily } from './allLines';
import { saveOfflineTimetable } from './timetable';
import { idbCountPrefix } from './persistentCache';
import { prefetchLineForOffline } from './lineShapes';
import {
  dayKindOf,
  isOffline,
  mergeLineSchedule,
  midnight,
  type DayKind,
  type SchedulePattern,
} from './offlineSchedule';

/**
 * Tout le réseau, gardé sur l'appareil, petit à petit.
 *
 * À chaque ouverture, en tâche de fond, on télécharge la fiche horaire de
 * chaque ligne : les trams d'abord, puis les Chrono, les Proximo et les Flexo.
 * Une fiche couvre toute la journée d'une ligne, dans les deux sens, en une
 * seule requête : une cinquantaine de lignes, trois sortes de jour, environ
 * cent cinquante requêtes pour le réseau entier. C'est bien moins que d'aller
 * chercher les arrêts un par un.
 *
 * Aujourd'hui passe avant le reste : la journée en cours est celle dont on a
 * besoin si le réseau tombe dans l'heure. Le samedi et le dimanche suivent.
 *
 * Une fiche téléchargée vaut une semaine. Le travail reprend là où il s'était
 * arrêté si l'application est fermée en chemin, et s'interrompt dès que le
 * réseau manque.
 */

const ENDPOINT = 'https://data.mobilites-m.fr/api/ficheHoraires/json';
const REGISTRY_KEY = 'greLines_offlineLines_v4';
const FRESH_FOR_MS = 7 * 24 * 60 * 60 * 1000;
/* Une pause entre deux lignes : le téléchargement ne doit jamais se sentir. */
const PAUSE_MS = 400;
/* Assez de courses pour couvrir toute une journée, même d'un tram. */
const TRIPS_PER_DIRECTION = 400;

const FAMILY_ORDER: LineFamily[] = ['tram', 'chrono', 'proximo', 'flexo'];

interface RawStop {
  name?: string;
  stopName?: string;
  trips?: Array<number | string>;
  parentStation?: { code?: string; name?: string };
}

type Registry = Record<string, number>;

function readRegistry(): Registry {
  try {
    const parsed = JSON.parse(localStorage.getItem(REGISTRY_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed as Registry : {};
  } catch {
    return {};
  }
}

function writeRegistry(registry: Registry): void {
  try {
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
  } catch {
    /* Plein ou refusé : on retéléchargera, rien de plus. */
  }
}

const sleep = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

/** Un jour de chaque sorte dans la semaine qui vient, aujourd'hui en tête. */
function upcomingDayKinds(): Date[] {
  const days: Date[] = [];
  const kinds = new Set<DayKind>();
  for (let offset = 0; offset < 7 && kinds.size < 3; offset += 1) {
    const day = midnight(new Date(), offset);
    const kind = dayKindOf(day);
    if (kinds.has(kind)) continue;
    kinds.add(kind);
    days.push(day);
  }
  return days;
}

/**
 * Le nom du terminus, écrit comme le temps réel l'écrit : « Fontaine, La
 * Poya », commune comprise. C'est à ce nom que les deux se reconnaissent.
 */
function stationName(stop: RawStop): string {
  return stop.stopName || stop.name || stop.parentStation?.name || '';
}

/**
 * Découpe la fiche d'une ligne en passages par arrêt.
 *
 * La destination se lit course par course : c'est le dernier arrêt où elle a
 * une heure. Une course qui s'arrête à mi-parcours annonce ainsi son vrai
 * terminus, comme le fait le temps réel, et les deux se reconnaissent. Le
 * terminus lui-même n'est pas un départ et n'est pas gardé.
 */
function splitByStop(line: AllLinesLine, payload: Record<string, { arrets?: RawStop[] }>): Map<string, SchedulePattern[]> {
  const lineId = line.id.split(':')[1] || line.shortName;
  const type = line.family === 'tram' ? 'TRAM' : 'BUS';
  const byStop = new Map<string, Map<string, SchedulePattern>>();

  for (const direction of Object.values(payload)) {
    const stops = Array.isArray(direction?.arrets) ? direction.arrets : [];
    const tripCount = stops.reduce((max, stop) => Math.max(max, stop.trips?.length ?? 0), 0);

    const lastStopOf: number[] = [];
    for (let trip = 0; trip < tripCount; trip += 1) {
      for (let index = stops.length - 1; index >= 0; index -= 1) {
        if (typeof stops[index].trips?.[trip] === 'number') {
          lastStopOf[trip] = index;
          break;
        }
      }
    }

    stops.forEach((stop, index) => {
      const clusterId = stop.parentStation?.code;
      if (!clusterId) return;
      let patterns = byStop.get(clusterId);
      if (!patterns) {
        patterns = new Map();
        byStop.set(clusterId, patterns);
      }
      for (let trip = 0; trip < tripCount; trip += 1) {
        const seconds = stop.trips?.[trip];
        if (typeof seconds !== 'number' || lastStopOf[trip] === index) continue;
        const destination = stationName(stops[lastStopOf[trip]]);
        const key = `${lineId}::${destination}`;
        let pattern = patterns.get(key);
        if (!pattern) {
          pattern = { lineId, lineName: '', lineShortName: lineId, destination, type, times: [] };
          patterns.set(key, pattern);
        }
        pattern.times.push(seconds);
      }
    });
  }

  const result = new Map<string, SchedulePattern[]>();
  for (const [clusterId, patterns] of byStop) {
    result.set(clusterId, Array.from(patterns.values()).map(pattern => ({
      ...pattern,
      times: Array.from(new Set(pattern.times)).sort((a, b) => a - b),
    })));
  }
  return result;
}

async function downloadLine(line: AllLinesLine, day: Date): Promise<boolean> {
  /* Quatre heures du matin : après la dernière course de la veille, avant la
     première du jour. La fiche rend alors toute la journée, dans les deux
     sens. À trois heures, elle prenait la dernière course de nuit pour modèle
     et ne rendait qu'elle. */
  const start = new Date(day);
  start.setHours(4, 0, 0, 0);
  const params = new URLSearchParams({
    route: line.id,
    time: String(start.getTime()),
    nbTrips: String(TRIPS_PER_DIRECTION),
  });
  try {
    const response = await fetch(`${ENDPOINT}?${params.toString()}`);
    if (response.status === 204) return true;
    if (!response.ok) return false;
    const payload = await response.json();
    /* La même fiche sert deux fois : découpée par arrêt pour les passages, et
       entière pour la fiche horaire de la ligne. */
    await saveOfflineTimetable(line.id, day, payload);
    const byStop = splitByStop(line, payload);
    const lineId = line.id.split(':')[1] || line.shortName;
    for (const [clusterId, patterns] of byStop) {
      await mergeLineSchedule(clusterId, day, lineId, patterns);
    }
    return true;
  } catch {
    return false;
  }
}

let started = false;

/**
 * Lance le téléchargement, une fois par session. Il s'arrête de lui-même
 * quand le réseau manque, et reprend à l'ouverture suivante.
 */
export function startNetworkScheduleDownload(): void {
  if (started) return;
  started = true;

  void (async () => {
    const all = await getAllSemLines();
    const lines = all
      .filter(line => line.id.startsWith('SEM:') && FAMILY_ORDER.includes(line.family))
      .sort((a, b) => FAMILY_ORDER.indexOf(a.family) - FAMILY_ORDER.indexOf(b.family));

    for (const day of upcomingDayKinds()) {
      const kind = dayKindOf(day);
      for (const line of lines) {
        if (isOffline()) {
          started = false;
          return;
        }
        const key = `${line.id}_${kind}`;
        if (Date.now() - (readRegistry()[key] ?? 0) < FRESH_FOR_MS) continue;

        if (await downloadLine(line, day)) {
          writeRegistry({ ...readRegistry(), [key]: Date.now() });
        }
        await sleep(PAUSE_MS);

        /* Le tracé et la liste des arrêts de la ligne, une fois par semaine :
           c'est ce que montre la fiche d'une ligne, hors connexion comme en
           ligne. */
        const shapeKey = `${line.id}_shape`;
        if (Date.now() - (readRegistry()[shapeKey] ?? 0) >= FRESH_FOR_MS && !isOffline()) {
          if (await prefetchLineForOffline(line.shortName)) {
            writeRegistry({ ...readRegistry(), [shapeKey]: Date.now() });
          }
          await sleep(PAUSE_MS);
        }
      }
    }
  })();
}

/**
 * Vrai quand des horaires sont déjà gardés sur cet appareil : c'est ce qui
 * décide si l'app a de quoi servir hors connexion.
 *
 * On regarde ce qui est réellement rangé, pas le registre des téléchargements.
 * Le registre change de nom à chaque révision du format, et les arrêts
 * ouverts se gardent aussi sans lui : l'écran annonçait « aucun horaire »
 * alors que la fiche d'un arrêt montrait bien ses passages.
 */
export async function hasOfflineSchedules(): Promise<boolean> {
  if (Object.keys(readRegistry()).length > 0) return true;
  return (await idbCountPrefix('offsched_v1_')) > 0;
}

/**
 * Oublie ce qui a été téléchargé et recommence tout, du tram au Flexo. Pour
 * la console développeur : les fiches déjà gardées restent en place jusqu'à
 * être remplacées.
 */
export function restartNetworkScheduleDownload(): void {
  writeRegistry({});
  started = false;
  startNetworkScheduleDownload();
}
