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

/**
 * Récupère les lignes sous impact trafic à partir de l'API de trafic
 */
export async function getTrafficLines(): Promise<Map<string, TrafficDetail[]>> {
  try {
    const resp = await axios.get('https://data.mobilites-m.fr/api/dyn/evtTC/json');
    const data = resp.data || {};

    const trafficMap = new Map<string, TrafficDetail[]>();

    const addDetail = (lineCode: string, info: any) => {
      const line = lineCode.replace(/^SEM_/, '').replace(/^SEM:/, '');
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
      .filter((r: any) => r?.id?.startsWith('SEM:'))
      .map((route: any) => {
        const id = route.id.substring(4);
        const details = trafficLines.get(id) || [];
        return {
          id,
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

// Cache global : stopId → { stop, clusterId }
type StopWithCluster = { stop: Stop; clusterId: string };
let stopsWithClusterCache = new Map<string, StopWithCluster>();

/**
 * Charge tous les arrêts + leur clusterId réel
 * → c'est ici qu'on corrige le principal problème
 */
export async function getAllStops(): Promise<Stop[]> {
  const cacheKey = 'all_stops';
  const cached = getFromCache<Stop[]>(cacheKey);
  if (cached) {
    console.log(`💾 ${cached.length} arrêts depuis cache`);
    return cached;
  }

  try {
    console.log(`📡 Chargement arrêts (via clusters des lignes)...`);
    const lines = await loadRoutes();
    const stopsMap = new Map<string, Stop>();
    stopsWithClusterCache.clear();

    for (const line of lines) {
      try {
        const url = `${TAG_API_BASE}/index/routes/SEM:${line.id}/clusters`;
        const res = await axios.get(url, { headers: TAG_HEADERS });
        const clusters = res.data || [];

        for (const c of clusters) {
          const stopId = c.id;                 // souvent SEM:XXXXXX
          // Formater le clusterId comme SEM:GEN(clusterId)
          const clusterId = c.id.startsWith('SEM:') 
            ? `SEM:GEN${c.id.substring(4)}`  // Si déjà SEM:XXXXX → SEM:GENXXXXX
            : `SEM:GEN${c.id}`;              // Sinon → SEM:GENXXXXX

          if (!stopId || stopsMap.has(stopId)) continue;

          const stop: Stop = {
            id: stopId,
            name: c.name || 'Sans nom',
            lat: c.lat ?? 0,
            lon: c.lon ?? 0,
            city: c.city || 'Grenoble',
            clusterGtfsId: clusterId, // on garde pour compat
          };

          stopsMap.set(stopId, stop);
          stopsWithClusterCache.set(stopId, { stop, clusterId });

          // Debug utile au début
          // console.log(`  ${line.shortName.padEnd(5)} → ${c.name.padEnd(30)} ${clusterId}`);
        }
      } catch (err) {
        console.warn(`  ⚠️ Ligne ${line.id} clusters échouée`);
      }
    }

    const allStops = Array.from(stopsMap.values());
    setCache(cacheKey, allStops);
    console.log(`✓ ${allStops.length} arrêts uniques chargés`);

    return allStops;
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
    // Étape critique : trouver le BON cluster ID
    let clusterId = stopId;

    if (stopsWithClusterCache.has(stopId)) {
      clusterId = stopsWithClusterCache.get(stopId)!.clusterId;
    } else {
      // fallback : on recharge tout (pas idéal mais évite plantage)
      await getAllStops();
      if (stopsWithClusterCache.has(stopId)) {
        clusterId = stopsWithClusterCache.get(stopId)!.clusterId;
      }
    }

    console.log(`📡 Départs → cluster : ${clusterId}`);

    let url = `${TAG_API_BASE}/index/clusters/${clusterId}/stoptimes`;
    console.log(`📡 getDepartures URL: ${url}`);
    const res = await axios.get(url, { headers: TAG_HEADERS });

    const data = res.data;
    console.log(`Raw API response for ${clusterId}:`, JSON.stringify(data, null, 2));
    
    if (!Array.isArray(data)) {
      console.warn(`Réponse stoptimes non-array pour ${clusterId}`, data);
      return [];
    }

    const now = Date.now() / 1000;
    const departures: Departure[] = [];

    for (const patternGroup of data) {
      const pattern = patternGroup.pattern ?? {};
      const times = patternGroup.times ?? patternGroup.stoptimes ?? [];

      if (!Array.isArray(times)) continue;

      // Ligne: utiliser routeId si fourni, sinon pattern.id (ex. SEM:B:0:...) -> B
      let lineId = '??';
      if (pattern.routeId) {
        lineId = pattern.routeId.replace(/^SEM:/, '');
      } else if (typeof pattern.id === 'string') {
        const parts = pattern.id.split(':');
        if (parts.length > 1) lineId = parts[1];
      }

      // Destination: preference headsign -> lastStopName -> name -> unknown
      const destination = pattern.headsign || pattern.lastStopName || pattern.name || 'Direction inconnue';

      console.log(`Pattern ${lineId} -> ${destination}, ${times.length} times (pattern.id=${pattern.id})`);

      for (const t of times) {
        const serviceDay = t.serviceDay ?? 0;
        const scheduled = t.scheduledDeparture ?? 0;
        const realtime = t.realtimeDeparture ?? scheduled;

        const depUnix = serviceDay + realtime;
        const minutes = Math.round((depUnix - now) / 60);

        console.log(`  Time: serviceDay=${serviceDay}, scheduled=${scheduled}, realtime=${realtime}, depUnix=${depUnix}, now=${now}, minutes=${minutes}`);

        if (depUnix < now - 300) {
          console.log(`  Skipping past departure: ${minutes} min ago`);
          continue; // déjà parti depuis >5min
        }

        departures.push({
          lineId,
          lineName: pattern.longName ?? pattern.name ?? '',
          lineShortName: pattern.shortName ?? lineId,
          destination,
          departureTime: minutes,
          realtime: t.realtimeArrival !== undefined || t.realtimeDeparture !== undefined,
          type: pattern.mode === 'TRAM' ? 'TRAM' : 'BUS',
          occupancy: getTramOccupancy(lineId, destination), // Occupancy fixe par tram
        });
      }
    }

    departures.sort((a, b) => a.departureTime - b.departureTime);

    setCache(cacheKey, departures);
    console.log(`→ ${departures.length} départs trouvés pour ${stopId} (${clusterId})`);

    return departures;
  } catch (err: any) {
    console.error(`❌ getDepartures(${stopId}) failed:`, err?.message ?? err);
    return [];
  }
}

/**
 * Get all lines serving a specific stop
 */
async function getStopRoutes(stopId: string): Promise<Line[]> {
  try {
    // Formater le stopId comme SEM:GEN(stopId)
    const cleanStopId = stopId.startsWith('SEM:') ? stopId.substring(4) : stopId;
    const fullStopId = `SEM:GEN${cleanStopId}`;
    
    console.log(`📡 Récupération lignes pour: ${fullStopId}`);
    
    const response = await axios.get(
      `${TAG_API_BASE}/index/clusters/${fullStopId}/routes`,
      { headers: TAG_HEADERS }
    );
    const routes = response.data || [];

    const trafficLines = await getTrafficLines();

    const lines: Line[] = routes.map((route: any) => {
      const lineId = route.id.startsWith('SEM:') ? route.id.substring(4) : route.id;
      const details = trafficLines.get(lineId) || [];
      return {
        id: lineId,
        name: route.longName || route.shortName || lineId,
        shortName: route.shortName || lineId,
        type: route.type || 'BUS',
        color: route.color || '#666666',
        hasTraffic: details.length > 0,
        trafficDetails: details,
      } satisfies Line;
    });

    console.log(`✓ ${lines.length} lignes pour ${stopId}`);
    return lines;
  } catch (error) {
    console.warn(`⚠️ Erreur chargement lignes pour ${stopId}:`, error);
    return [];
  }
}

export async function getStopDetail(stopId: string): Promise<StopDetail | null> {
  try {
    const stops = await getAllStops();
    let stop = stops.find(s => s.id === stopId);
    if (!stop) {
      // tentative avec prefix
      stop = stops.find(s => s.id === `SEM:${stopId}` || s.clusterGtfsId === stopId);
    }
    if (!stop) return null;

    const lines = await getStopRoutes(stop.id);
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
export function formatDepartureTime(departure: Departure): string {
  const minutes = departure.departureTime;

  if (minutes < 0) {
    return 'Passed';
  } else if (minutes === 0) {
    return 'Now';
  } else if (minutes < 60) {
    return `${minutes}m`;
  } else {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h${mins.toString().padStart(2, '0')}` : `${hours}h`;
  }
}
