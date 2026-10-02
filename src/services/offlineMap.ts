import { DARK_MODE_MAP_STYLE_URL, LIGHT_MODE_MAP_STYLE_URL } from '../utils/mapStyles';
import { isOffline } from './offlineSchedule';


const LAST_RUN_KEY = 'greLines_offlineMapMonth';

const AREA: [number, number, number, number] = [5.55, 45.08, 5.95, 45.3];
const CENTER: [number, number, number, number] = [5.68, 45.15, 5.78, 45.21];

const PAUSE_MS = 150;
const sleep = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

function thisMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth()}`;
}

function tileX(lon: number, zoom: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** zoom);
}

function tileY(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** zoom);
}

function tilesIn([west, south, east, north]: typeof AREA, zoom: number): Array<[number, number, number]> {
  const tiles: Array<[number, number, number]> = [];
  for (let x = tileX(west, zoom); x <= tileX(east, zoom); x += 1) {
    for (let y = tileY(north, zoom); y <= tileY(south, zoom); y += 1) {
      tiles.push([zoom, x, y]);
    }
  }
  return tiles;
}

interface MapStyle {
  sprite?: unknown;
  sources?: Record<string, { type?: string; url?: string; tiles?: string[] }>;
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url);
    return response.ok ? (await response.json()) as T : null;
  } catch {
    return null;
  }
}

async function warm(url: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    await response.arrayBuffer();
    return response.ok;
  } catch {
    return false;
  }
}

let running = false;

export async function precacheOfflineMap(options?: { force?: boolean }): Promise<void> {
  if (running) return;
  running = true;
  try {
    await precache(options?.force ?? false);
  } finally {
    running = false;
  }
}

async function precache(force: boolean): Promise<void> {
  if (isOffline() || !navigator.serviceWorker?.controller) return;
  try {
    if (!force && localStorage.getItem(LAST_RUN_KEY) === thisMonth()) return;
  } catch {
    return;
  }

  const tileTemplates = new Set<string>();
  for (const styleUrl of [DARK_MODE_MAP_STYLE_URL, LIGHT_MODE_MAP_STYLE_URL]) {
    const style = await getJson<MapStyle>(styleUrl);
    if (!style) return;
    if (typeof style.sprite === 'string') {
      for (const suffix of ['.json', '.png', '@2x.json', '@2x.png']) await warm(`${style.sprite}${suffix}`);
    }
    for (const source of Object.values(style.sources ?? {})) {
      if (source?.type !== 'vector') continue;
      const tiles: string[] = Array.isArray(source.tiles)
        ? source.tiles
        : source.url ? (await getJson<{ tiles?: string[] }>(source.url))?.tiles ?? [] : [];
      tiles.forEach(template => tileTemplates.add(template));
    }
  }

  const coordinates = [
    ...[8, 9, 10, 11, 12, 13, 14].flatMap(zoom => tilesIn(AREA, zoom)),
    ...tilesIn(CENTER, 15),
  ];

  let failures = 0;
  for (const template of tileTemplates) {
    for (const [z, x, y] of coordinates) {
      if (isOffline()) return;
      const url = template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
      if (!(await warm(url))) failures += 1;
      await sleep(PAUSE_MS);
    }
  }

  if (failures < coordinates.length / 10) {
    try {
      localStorage.setItem(LAST_RUN_KEY, thisMonth());
    } catch {
    }
  }
}
