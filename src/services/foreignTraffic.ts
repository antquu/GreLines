import type { Line, TrafficDetail } from '../types';
import { decodeAlerts } from './gtfsRealtime';
import { GTFS_NETWORKS, gtfsLineIdForName, getGtfsLinesForStop, type GtfsNetworkConfig } from './gtfsNetwork';
import { gtfsCodeOf } from './gtfsNetworkIds';
import { stripHtml } from '../utils/stripHtml';


const TTL_MS = 5 * 60 * 1000;

type Cache = { at: number; value: Promise<Map<string, TrafficDetail[]>> };
const caches = new Map<string, Cache>();

function remember(network: string, load: () => Promise<Map<string, TrafficDetail[]>>) {
  const cached = caches.get(network);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  const value = load().catch(() => new Map<string, TrafficDetail[]>());
  caches.set(network, { at: Date.now(), value });
  return value;
}

function add(map: Map<string, TrafficDetail[]>, lineId: string, raw: TrafficDetail) {
  const detail = { ...raw, titre: stripHtml(raw.titre), description: stripHtml(raw.description) };
  const list = map.get(lineId) ?? [];
  if (!list.some(item => item.titre === detail.titre && item.description === detail.description)) list.push(detail);
  map.set(lineId, list);
}

const isoDate = (value: string) => (value ? value.replace(' ', 'T') : '');

function loadTcl() {
  return remember('TCL', async () => {
    const response = await fetch('/api/tcl?ressource=alertes');
    if (!response.ok) return new Map();
    const alerts = await response.json() as Array<{ ligne: string; titre: string; message: string; fin: string }>;
    const map = new Map<string, TrafficDetail[]>();
    for (const alert of alerts) {
      add(map, `TCL:${alert.ligne}`, {
        titre: alert.titre,
        description: alert.message,
        dateFin: isoDate(alert.fin),
        listeLigne: alert.ligne,
      });
    }
    return map;
  });
}

const isoEnd = (end: number | null) => (end ? new Date(end).toISOString() : '');

const STAN_SITE_NAMES: Record<string, string> = { '14ex': '14exp' };

function loadStan() {
  return remember('STAN', async () => {
    const response = await fetch('/api/stan?ressource=alertes');
    if (!response.ok) return new Map();
    const alerts = await response.json() as Array<{ lignes: string[]; titre: string; message: string }>;
    const map = new Map<string, TrafficDetail[]>();
    for (const alert of alerts) {
      for (const name of alert.lignes) {
        const lineId = await gtfsLineIdForName('STAN', STAN_SITE_NAMES[name.trim().toLowerCase()] ?? name);
        if (!lineId) continue;
        add(map, lineId, {
          titre: alert.titre,
          description: alert.message,
          dateFin: '',
          listeLigne: alert.lignes.join('_'),
        });
      }
    }
    return map;
  });
}

function loadGtfsAlerts(config: GtfsNetworkConfig) {
  return remember(config.code, async () => {
    const response = await fetch(`/api/gtfsrt?reseau=${encodeURIComponent(config.code)}&flux=alertes`);
    if (!response.ok) return new Map();
    const alerts = decodeAlerts(await response.arrayBuffer());
    const map = new Map<string, TrafficDetail[]>();
    const now = Date.now();
    for (const alert of alerts) {
      if (alert.end && alert.end < now) continue;
      const lineIds = new Set(alert.routeIds.map(id => `${config.code}:${id}`));
      if (lineIds.size === 0) {
        for (const stopId of alert.stopIds) {
          for (const line of await getGtfsLinesForStop(`${config.code}:${stopId}`)) lineIds.add(line.id);
        }
      }
      for (const lineId of lineIds) {
        add(map, lineId, {
          titre: alert.title,
          description: alert.description,
          dateFin: isoEnd(alert.end),
          listeLigne: alert.routeIds.join('_'),
        });
      }
    }
    return map;
  });
}

function loadNetworkTraffic(code: string): Promise<Map<string, TrafficDetail[]>> {
  if (code === 'TCL') return loadTcl();
  const config = GTFS_NETWORKS.find(network => network.code === code);
  if (config?.alertsFromStanSite) return loadStan();
  if (config?.alerts) return loadGtfsAlerts(config);
  return Promise.resolve(new Map());
}

export async function getForeignTraffic(networks: string[]): Promise<Map<string, TrafficDetail[]>> {
  const parts = await Promise.all(networks.map(code => loadNetworkTraffic(code)));
  return new Map(parts.flatMap(part => [...part]));
}

export async function withForeignTraffic<T extends Line>(lines: T[]): Promise<T[]> {
  const first = lines.find(line => String(line.id).startsWith('TCL:') || gtfsCodeOf(line.id));
  const network = first ? (String(first.id).startsWith('TCL:') ? 'TCL' : gtfsCodeOf(first.id)) : null;
  if (!network) return lines;
  const traffic = await Promise.race([
    loadNetworkTraffic(network),
    new Promise<Map<string, TrafficDetail[]>>(resolve => window.setTimeout(() => resolve(new Map()), 600)),
  ]);
  return lines.map(line => {
    const details = traffic.get(line.id) ?? [];
    return details.length > 0 ? { ...line, hasTraffic: true, trafficDetails: details } : line;
  });
}
