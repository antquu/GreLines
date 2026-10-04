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


const ENDPOINT = 'https://data.mobilites-m.fr/api/ficheHoraires/json';
const REGISTRY_KEY = 'greLines_offlineLines_v5';
const FRESH_FOR_MS = 7 * 24 * 60 * 60 * 1000;
const PAUSE_MS = 400;
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
  }
}

const sleep = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

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

function stationName(stop: RawStop): string {
  return stop.stopName || stop.name || stop.parentStation?.name || '';
}

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

export async function hasOfflineSchedules(): Promise<boolean> {
  if (Object.keys(readRegistry()).length > 0) return true;
  return (await idbCountPrefix('offsched_v2_')) > 0;
}

export function restartNetworkScheduleDownload(): void {
  writeRegistry({});
  started = false;
  startNetworkScheduleDownload();
}
