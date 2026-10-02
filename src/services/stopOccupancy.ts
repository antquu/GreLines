const OCCUPANCY_URL = 'https://data.mobilites-m.fr/api/stops/occupancy';

export interface OccupancyReading {
  capacity: number;
  occupancy: number;
  percent: number;
  label: string;
  rank: number;
}

interface OccupancyDataset {
  step: number;
  stops: Record<string, Record<string, Record<string, { times: Record<string, any> }>>>;
}

let dataset: OccupancyDataset | null = null;
let loadedAt = 0;
let inflight: Promise<OccupancyDataset | null> | null = null;

const TTL_MS = 24 * 60 * 60 * 1000;

export async function loadOccupancy(): Promise<OccupancyDataset | null> {
  if (dataset && Date.now() - loadedAt < TTL_MS) return dataset;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const response = await fetch(OCCUPANCY_URL);
      if (!response.ok) return null;
      const json = (await response.json()) as OccupancyDataset;
      if (!json?.stops) return null;
      dataset = json;
      loadedAt = Date.now();
      return dataset;
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export function getOccupancyAt(
  stopId: string | undefined,
  routeId: string | undefined,
  when: Date,
  direction?: number
): OccupancyReading | null {
  if (!dataset || !stopId || !routeId) return null;

  const byRoute = dataset.stops[stopId];
  if (!byRoute) return null;

  const byDirection = byRoute[routeId];
  if (!byDirection) return null;

  const directions = Object.keys(byDirection);
  if (directions.length === 0) return null;
  const key =
    direction != null && byDirection[String(direction)] ? String(direction) : directions[0];

  const times = byDirection[key]?.times;
  if (!times) return null;

  const stepSeconds = Math.max(1, (dataset.step || 15) * 60);
  const seconds = when.getHours() * 3600 + when.getMinutes() * 60;
  const bucket = Math.floor(seconds / stepSeconds) * stepSeconds;

  const entry = times[String(bucket)];
  if (!entry) return null;

  const percent = Number(entry.percent);
  if (!Number.isFinite(percent)) return null;

  return {
    capacity: Number(entry.capacity) || 0,
    occupancy: Number(entry.occupancy) || 0,
    percent,
    label: String(entry.label ?? ''),
    rank: Number(entry.id) || 0,
  };
}

export function occupancyLevel(reading: OccupancyReading | null): 0 | 1 | 2 | 3 {
  if (!reading) return 0;
  if (reading.rank === 1 || reading.rank === 2 || reading.rank === 3) return reading.rank;
  if (reading.percent >= 50) return 3;
  if (reading.percent >= 20) return 2;
  return 1;
}
