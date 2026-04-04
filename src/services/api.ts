import axios from 'axios';
import type { Stop, Line, TrafficDetail, Departure, StopDetail } from '../types';

const TAG_API_BASE = 'https://data.mobilites-m.fr/api/routers/default';

// Headers obligatoires (sinon 403 ou 400 souvent) - maintenant géré par le proxy Vite
const TAG_HEADERS = {
  // origin: 'mon_appli',           // maintenant géré par le proxy
};

// Cache pour stocker l'occupancy par tram (ligne + destination)
const occupancyCache = new Map<string, 'EMPTY' | 'LIGHT' | 'MODERATE' | 'CROWDED'>();

// Helper: Generate random occupancy for mock data
const getRandomOccupancy = (): 'EMPTY' | 'LIGHT' | 'MODERATE' | 'CROWDED' => {
  const rand = Math.random();
  if (rand < 0.25) return 'EMPTY';
  if (rand < 0.6) return 'LIGHT';
  if (rand < 0.85) return 'MODERATE';
  return 'CROWDED';
};

// Helper: Get occupancy for a specific tram (cached)
function getTramOccupancy(lineId: string, destination: string): 'EMPTY' | 'LIGHT' | 'MODERATE' | 'CROWDED' {
  const key = `${lineId}::${destination}`;
  if (!occupancyCache.has(key)) {
    occupancyCache.set(key, getRandomOccupancy());
  }
  return occupancyCache.get(key)!;
}

// Cache simple avec génériques
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 2 * 60 * 1000; // 2 min (plus court pour avoir des données plus fraîches)

const NETWORK_PREFIXES = ['SEM'] as const;

function hasNetworkPrefix(value: string): boolean {
  return value.startsWith('SEM:') || value.startsWith('SEM_');
}

function normalizeRouteCode(value: string): string {
  const raw = String(value);
  if (raw.startsWith('SEM:') || raw.startsWith('SEM_')) {
    return raw.substring(4);
  }
  return raw;
}

function formatRouteId(value: string): string {
  const raw = String(value);
  if (raw.startsWith('SEM:') || raw.startsWith('SEM_')) return raw;
  return `SEM:${raw}`;
}

function formatClusterId(stopId: string): string {
  const raw = String(stopId);

  if (raw.startsWith('SEM:GEN')) return raw;
  if (raw.startsWith('SEM:')) return `SEM:GEN${raw.substring(4)}`;
  return `SEM:GEN${raw}`;
}

function getClusterIdsForStopId(stopId: string): string[] {
  const entry = stopsWithClusterCache.get(stopId);
  if (entry?.clusterIds?.length) {
    return Array.from(new Set(entry.clusterIds));
  }
  return [formatClusterId(stopId)];
}

function getFromCache<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_DURATION) {
    return entry.data as T;
  }
  cache.delete(key);
  return null;
}

function setCache(key: string, data: any) {
  cache.set(key, { data, timestamp: Date.now() });
}

function normalizeStopName(value: string | undefined | null): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function getStopGroupKey(stop: Stop): string {
  return `${normalizeStopName(stop.name)}|${normalizeStopName(stop.city)}`;
}

/**
 * Récupère les lignes sous impact trafic à partir de l'API de trafic
 */
export async function getTrafficLines(): Promise<Map<string, TrafficDetail[]>> {
  try {
    const resp = await axios.get('https://data.mobilites-m.fr/api/dyn/evtTC/json');
    const data = resp.data || {};

    const trafficMap = new Map<string, TrafficDetail[]>();

    const addDetail = (lineCode: string, info: any) => {
      const line = normalizeRouteCode(String(lineCode));
      if (!line) return;
      const details: TrafficDetail = {
        titre: String(info.titre || ''),
        description: String(info.description || ''),
        dateFin: String(info.dateFin || ''),
        listeLigne: String(info.listeLigne || ''),
      };
      const existing = trafficMap.get(line) || [];
      existing.push(details);
      trafficMap.set(line, existing);
    };

    // cas 1: format object de clés dynamiques
    if (typeof data === 'object' && !Array.isArray(data)) {
      for (const key of Object.keys(data)) {
        if (!data[key] || typeof data[key] !== 'object') continue;
        const info = data[key];
        if (info.listeLigne) {
          const raw = String(info.listeLigne).split('_').map((s: string) => s.trim()).filter(Boolean);
          for (const lineCode of raw) {
            addDetail(lineCode, info);
          }
        }
        // parfois la propriété peut venir de listeInfos
        if (Array.isArray(info.listeLigne)) {
          (info.listeLigne as string[]).forEach((lineCode) => addDetail(lineCode, info));
        }
      }
    }

    // cas 2: format générique tableau
    const listeInfos = data?.listeInfos;
    if (Array.isArray(listeInfos)) {
      for (const info of listeInfos) {
        if (!info?.listeLigne) continue;
        const raw = String(info.listeLigne).split('_').map((s: string) => s.trim()).filter(Boolean);
        raw.forEach((lineCode: string) => addDetail(lineCode, info));
      }
    }

    console.log(`⚠️ Trafic : lignes concernées = ${Array.from(trafficMap.keys()).join(', ')}`);
    return trafficMap;
  } catch (err) {
    console.warn('⚠️ Impossibles de charger le trafic:', err);
    return new Map();
  }
}

/**
 * Charge toutes les lignes
 */
async function loadRoutes(): Promise<Line[]> {
  const cacheKey = 'routes';
  const cached = getFromCache<Line[]>(cacheKey);
  if (cached) return cached;

  try {
    console.log(`📡 Chargement des lignes...`);
    const res = await axios.get(`${TAG_API_BASE}/index/routes`, { headers: TAG_HEADERS });
    const routes = res.data || [];

    const trafficLines = await getTrafficLines();

    const lines = routes
      .filter((r: any) => hasNetworkPrefix(String(r?.id || '')))
      .map((route: any) => {
        const routeId = String(route.id);
        const id = normalizeRouteCode(routeId);
        const details = trafficLines.get(id) || [];
        return {
          id,
          routeId,
          name: route.longName || route.shortName || id,
          shortName: route.shortName || id,
          type: route.type || 'BUS',
          color: route.color || '#666666',
          hasTraffic: details.length > 0,
          trafficDetails: details,
        } satisfies Line;
      });

    setCache(cacheKey, lines);
    console.log(`✓ ${lines.length} lignes chargées`);
    return lines;
  } catch (err) {
    console.error('❌ Erreur loadRoutes:', err);
    return [];
  }
}
function lineMatchesPrefixes(line: Line, prefixes: string[]): boolean {
  if (!line.routeId) return false;
  return prefixes.some(prefix => line.routeId?.startsWith(`${prefix}:`) || line.routeId?.startsWith(`${prefix}_`));
}

async function buildStopsFromLines(lines: Line[]): Promise<Stop[]> {
  const stopsMap = new Map<string, Stop>();
  stopsWithClusterCache.clear();

  for (const line of lines) {
    try {
      const routeRef = line.routeId ?? formatRouteId(line.id);
      const url = `${TAG_API_BASE}/index/routes/${routeRef}/clusters`;
      const res = await axios.get(url, { headers: TAG_HEADERS });
      const clusters = res.data || [];

      for (const c of clusters) {
        const stopId = c.id;
        const clusterId = formatClusterId(stopId);

        if (!stopId || stopsMap.has(stopId)) continue;

        const stop: Stop = {
          id: stopId,
          name: c.name || 'Sans nom',
          lat: c.lat ?? 0,
          lon: c.lon ?? 0,
          city: c.city || 'Grenoble',
          clusterGtfsId: clusterId,
        };

        stopsMap.set(stopId, stop);
        stopsWithClusterCache.set(stopId, { stop, clusterIds: [clusterId] } as any);
      }
    } catch (err) {
      console.warn(`  ⚠️ Ligne ${line.id} clusters échouée`, err);
    }
  }

  const stopGroups = new Map<string, { stopIds: string[]; clusterIds: Set<string> }>();
  for (const stop of stopsMap.values()) {
    const key = getStopGroupKey(stop);
    const group = stopGroups.get(key) || { stopIds: [], clusterIds: new Set<string>() };
    group.stopIds.push(stop.id);
    if (stop.clusterGtfsId) {
      group.clusterIds.add(stop.clusterGtfsId);
    }
    stopGroups.set(key, group);
  }

  const mergedStops: Stop[] = [];
  const newCache = new Map<string, StopWithCluster>();

  for (const group of stopGroups.values()) {
    const canonicalStop = stopsMap.get(group.stopIds[0])!;
    const mergedClusterIds = Array.from(group.clusterIds).filter(Boolean);

    if (group.stopIds.length > 1) {
      // Combine similar stops into one without extra console noise
    }

    if (mergedClusterIds.length > 0) {
      canonicalStop.clusterGtfsId = mergedClusterIds[0];
    }

    mergedStops.push(canonicalStop);

    const entry: StopWithCluster = {
      stop: canonicalStop,
      clusterIds: mergedClusterIds.length > 0 ? mergedClusterIds : [canonicalStop.clusterGtfsId || canonicalStop.id],
    } as any;

    for (const stopId of group.stopIds) {
      newCache.set(stopId, entry);
    }
  }

  stopsWithClusterCache = newCache;
  return mergedStops;
}

export async function getStopsByPrefixes(prefixes: string[]): Promise<Stop[]> {
  const lines = await loadRoutes();
  const filtered = lines.filter((line) => lineMatchesPrefixes(line, prefixes));
  return await buildStopsFromLines(filtered);
}
// Cache global : stopId → { stop, clusterIds }
type StopWithCluster = { stop: Stop; clusterIds: string[] };
let stopsWithClusterCache = new Map<string, StopWithCluster>();

/**
 * Charge tous les arrêts + leur clusterId réel
 * → c'est ici qu'on corrige le principal problème
 */
export async function getAllStops(prefixes: string[] = [...NETWORK_PREFIXES]): Promise<Stop[]> {
  const sortedPrefixes = [...prefixes].sort();
  const cacheKey = `all_stops_${sortedPrefixes.join(',')}`;
  const cached = getFromCache<Stop[]>(cacheKey);
  if (cached) {
    console.log(`💾 ${cached.length} arrêts depuis cache (${sortedPrefixes.join(',')})`);
    return cached;
  }

  try {
    console.log(`📡 Chargement arrêts (via clusters des lignes)... ${sortedPrefixes.join(', ')}`);
    const stops = await getStopsByPrefixes(sortedPrefixes);
    setCache(cacheKey, stops);
    console.log(`✓ ${stops.length} arrêts uniques chargés`);
    return stops;
  } catch (err) {
    console.error('❌ Erreur getAllStops:', err);
    return [];
  }
}

/**
 * Récupère les prochains passages pour un arrêt
 * @param skipCache - Si true, ignore le cache et force une mise à jour
 */
export async function getDepartures(stopId: string, skipCache: boolean = false): Promise<Departure[]> {
  const cacheKey = `departures_${stopId}`;
  
  if (!skipCache) {
    const cached = getFromCache<Departure[]>(cacheKey);
    if (cached) {
      console.log(`💾 Départs cache pour ${stopId}`);
      return cached;
    }
  } else {
    console.log(`🔄 Bypassing cache pour ${stopId}`);
  }

  try {
    // Étape critique : trouver les BONNES cluster IDs
    let clusterIds = [stopId];

    if (stopsWithClusterCache.has(stopId)) {
      clusterIds = getClusterIdsForStopId(stopId);
    } else {
      // fallback : on recharge tout (pas idéal mais évite plantage)
      await getAllStops();
      if (stopsWithClusterCache.has(stopId)) {
        clusterIds = getClusterIdsForStopId(stopId);
      } else {
        clusterIds = [formatClusterId(stopId)];
      }
    }

    console.log(`📡 Départs → clusterIds : ${clusterIds.join(', ')}`);

    const departures: Departure[] = [];
    const seen = new Set<string>();

    for (const clusterId of clusterIds) {
      let url = `${TAG_API_BASE}/index/clusters/${clusterId}/stoptimes`;
      console.log(`📡 getDepartures URL: ${url}`);
      const res = await axios.get(url, { headers: TAG_HEADERS });
      const data = res.data;

      if (!Array.isArray(data)) {
        console.warn(`Réponse stoptimes non-array pour ${clusterId}`, data);
        continue;
      }

      const now = Date.now() / 1000;

      for (const patternGroup of data) {
        const pattern = patternGroup.pattern ?? {};
        const times = patternGroup.times ?? patternGroup.stoptimes ?? [];

        if (!Array.isArray(times)) continue;

        let lineId = '??';
        if (pattern.routeId) {
          lineId = normalizeRouteCode(String(pattern.routeId));
        } else if (typeof pattern.id === 'string') {
          const parts = pattern.id.split(':');
          if (parts.length > 1) lineId = parts[1];
        }

        const destination = pattern.headsign || pattern.lastStopName || pattern.name || 'Direction inconnue';

        for (const t of times) {
          const serviceDay = t.serviceDay ?? 0;
          const scheduled = t.scheduledDeparture ?? 0;
          const realtime = t.realtimeDeparture ?? scheduled;

          const depUnix = serviceDay + realtime;
          const minutes = Math.round((depUnix - now) / 60);

          if (depUnix < now - 300) continue;

          const key = `${clusterId}|${lineId}|${destination}|${depUnix}|${pattern.mode}`;
          if (seen.has(key)) continue;
          seen.add(key);

          departures.push({
            lineId,
            lineName: pattern.longName ?? pattern.name ?? '',
            lineShortName: pattern.shortName ?? lineId,
            destination,
            departureTime: minutes,
            realtime: t.realtimeArrival !== undefined || t.realtimeDeparture !== undefined,
            type: pattern.mode === 'TRAM' ? 'TRAM' : 'BUS',
            occupancy: getTramOccupancy(lineId, destination),
          });
        }
      }
    }

    departures.sort((a, b) => a.departureTime - b.departureTime);

    setCache(cacheKey, departures);
    console.log(`→ ${departures.length} départs trouvés pour ${stopId}`);

    return departures;
  } catch (err: any) {
    console.error(`❌ getDepartures(${stopId}) failed:`, err?.message ?? err);
    return [];
  }
}

/**
 * Get all lines serving a specific stop
 */
export async function getStopLines(stopId: string): Promise<Line[]> {
  try {
    const clusterIds = getClusterIdsForStopId(stopId);
    const trafficLines = await getTrafficLines();
    const routeMap = new Map<string, Line>();

    for (const clusterId of clusterIds) {
      try {
        console.log(`📡 Récupération lignes pour: ${clusterId}`);
        const response = await axios.get(
          `${TAG_API_BASE}/index/clusters/${clusterId}/routes`,
          { headers: TAG_HEADERS }
        );
        const routes = response.data || [];

        for (const route of routes) {
          const lineId = normalizeRouteCode(String(route.id));
          if (routeMap.has(lineId)) continue;

          const details = trafficLines.get(lineId) || [];
          routeMap.set(lineId, {
            id: lineId,
            name: route.longName || route.shortName || lineId,
            shortName: route.shortName || lineId,
            type: route.type || 'BUS',
            color: route.color || '#666666',
            hasTraffic: details.length > 0,
            trafficDetails: details,
          } satisfies Line);
        }
      } catch (error) {
        console.warn(`⚠️ Erreur chargement lignes pour ${clusterId}:`, error);
      }
    }

    const lines = Array.from(routeMap.values());
    console.log(`✓ ${lines.length} lignes pour ${stopId}`);
    return lines;
  } catch (error) {
    console.warn(`⚠️ Erreur chargement lignes pour ${stopId}:`, error);
    return [];
  }
}

export async function getStopDetail(stopId: string, prefixes: string[] = [...NETWORK_PREFIXES]): Promise<StopDetail | null> {
  try {
    const stops = await getAllStops(prefixes);
    let stop = stops.find(s => s.id === stopId);
    if (!stop) {
      const candidates = new Set<string>([stopId]);
      for (const prefix of NETWORK_PREFIXES) {
        if (!stopId.startsWith(`${prefix}:`)) {
          candidates.add(`${prefix}:${stopId}`);
        }
      }
      stop = stops.find(s => candidates.has(s.id) || s.clusterGtfsId === stopId);
    }
    if (!stop && stopsWithClusterCache.has(stopId)) {
      stop = stopsWithClusterCache.get(stopId)!.stop;
    }
    if (!stop) return null;

    const lines = await getStopLines(stop.id);
    console.log(`✓ Chargement ${lines.length} lignes pour arrêt ${stop.name}:`, lines.map(l => l.id).join(', '));

    // Requête unique au cluster pour récupérer TOUS les bus (sans filtrer par ligne)
    const departures = await getDepartures(stop.id);
    console.log(`✓ ${departures.length} départs chargés pour ${stop.name}`);

    return {
      ...stop,
      lines,
      departures,
      lastUpdate: new Date(),
    };
  } catch (err) {
    console.error('getStopDetail error:', err);
    return null;
  }
}

/**
 * Rafraîchit UNIQUEMENT les départs pour un arrêt connu
 * (sans recharger les routes) - utilisé pour la mise à jour périodique
 */
export async function refreshStopDepartures(stopDetail: StopDetail): Promise<StopDetail> {
  try {
    console.log(`🔄 Refresh départs pour ${stopDetail.name}`);

    // Bypass le cache pour avoir les données fraiches
    const departures = await getDepartures(stopDetail.id, true);

    // L'occupancy est déjà fixée dans getDepartures, pas besoin de la régénérer

    return {
      ...stopDetail,
      departures,
      lastUpdate: new Date(),
    };
  } catch (err) {
    console.error('refreshStopDepartures error:', err);
    return stopDetail;
  }
}

/**
 * Search stops by name
 */
export async function searchStops(query: string): Promise<Stop[]> {
  if (!query.trim()) {
    return [];
  }

  try {
    const allStops = await getAllStops();
    const lowerQuery = query.toLowerCase();

    return allStops.filter(
      stop =>
        stop.name.toLowerCase().includes(lowerQuery) ||
        (stop.city?.toLowerCase().includes(lowerQuery) ?? false)
    );
  } catch (error) {
    console.error('❌ Erreur recherche arrêts:', error);
    return [];
  }
}

/**
 * Format departure time for display
 */
export function formatDepartureTime(departure: Departure, locale: 'fr' | 'en' = 'en'): string {
  const minutes = departure.departureTime;

  if (minutes < 0) {
    return locale === 'fr' ? 'Passé' : 'Passed';
  } else if (minutes === 0) {
    return locale === 'fr' ? 'ARR' : 'Now';
  } else if (minutes < 60) {
    return `${minutes}m`;
  } else {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h${mins.toString().padStart(2, '0')}` : `${hours}h`;
  }
}
