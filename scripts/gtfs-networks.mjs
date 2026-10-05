import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFiches, downloadGtfs, eachRow, parisToday, writeFiches, readAgencyContacts } from './lib/gtfs.mjs';
import { PLATFORM_RADIUS_M, distanceM, platformGroups } from './lib/stations.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = join(ROOT, 'public/data/networks');
const ALL_NETWORKS = JSON.parse(readFileSync(join(ROOT, 'src/data/gtfsNetworks.json'), 'utf8'));
const NETWORKS = process.env.VITE_SITE === 'nancy'
  ? ALL_NETWORKS.filter(network => network.code === 'STAN')
  : ALL_NETWORKS;

const MERGE_RADIUS_M = 250;

const NETWORK_RADIUS_M = 150_000;

const round = value => Math.round(value * 1e5) / 1e5;


const nameKey = name => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function modeOf(routeType) {
  const type = Number(routeType);
  if (type === 0 || type === 5 || type === 7 || (type >= 900 && type < 1000)) return 'TRAM';
  if (type === 1 || (type >= 400 && type < 500)) return 'METRO';
  if (type === 2 || (type >= 100 && type < 200)) return 'RAIL';
  return 'BUS';
}

function rank(line) {
  if (line.mode === 'METRO') return [0, line.short];
  if (line.mode === 'TRAM') return [1, line.short];
  if (/^[TC]\d+$/i.test(line.short)) return [2, line.short];
  if (line.short === 'Corol') return [3, line.short];
  if (/^\d+/.test(line.short)) return [4, line.short.padStart(4, '0')];
  return [5, line.short];
}

const cleanLongName = long => long.replace(/\s*<>\s*/g, ' ↔ ').trim();

async function buildNetwork(config, today) {
  const files = await downloadGtfs(config.gtfs, [
    'agency.txt', 'routes.txt', 'trips.txt', 'calendar.txt', 'calendar_dates.txt', 'stops.txt', 'stop_times.txt', 'shapes.txt',
  ]);
  if (!files['stops.txt'] || !files['stop_times.txt']) throw new Error('GTFS incomplet');

  const agencies = [];
  eachRow(files['agency.txt'], (row, col) => { if (row[col.agency_name]) agencies.push(row[col.agency_name]); });
  const contacts = readAgencyContacts(files['agency.txt']);

  const shortNames = config.shortNames ?? {};
  const routes = [];
  eachRow(files['routes.txt'], (row, col) => {
    const code = (row[col.route_short_name] || row[col.route_id]).trim();
    const short = shortNames[code] ?? code;
    routes.push({
      id: row[col.route_id],
      short,
      name: cleanLongName(row[col.route_long_name] || short),
      mode: modeOf(row[col.route_type]),
      color: `#${(row[col.route_color] || '6B7280').toUpperCase()}`,
      textColor: `#${(row[col.route_text_color] || 'FFFFFF').toUpperCase()}`,
    });
  });
  routes.sort((a, b) => {
    const [ra, ka] = rank(a);
    const [rb, kb] = rank(b);
    return ra - rb || ka.localeCompare(kb, 'fr', { numeric: true });
  });

  const { fiches, trips } = buildFiches(files, {
    today,
    codeOf: routeId => routeId,
    withTripIds: Boolean(config.tripUpdates),
  });

  const stops = new Map();
  eachRow(files['stops.txt'], (row, col) => {
    stops.set(row[col.stop_id], {
      id: row[col.stop_id],
      name: row[col.stop_name],
      lat: Number(row[col.stop_lat]),
      lon: Number(row[col.stop_lon]),
      parent: row[col.parent_station] || '',
      type: row[col.location_type] || '0',
      wheelchair: row[col.wheelchair_boarding] || '',
    });
  });

  const stations = new Map();
  const stationOf = new Map();
  const newStation = stop => ({ ...stop, members: [], names: new Set(), lines: new Set(), yes: false, no: false });
  for (const stop of stops.values()) if (stop.type === '1') stations.set(stop.id, newStation(stop));

  const center = { lat: config.center[0], lon: config.center[1] };
  const isMisplaced = stop =>
    !Number.isFinite(stop.lat) || !Number.isFinite(stop.lon) || distanceM(center, stop) > NETWORK_RADIUS_M;
  const misplaced = [];

  const loose = new Map();
  for (const stop of stops.values()) {
    if (stop.type !== '0' && stop.type !== '') continue;
    if (isMisplaced(stop) && !isMisplaced(stations.get(stop.parent) ?? stop)) {
      stationOf.set(stop.id, stations.get(stop.parent));
      stations.get(stop.parent).members.push(stop.id);
      continue;
    }
    if (isMisplaced(stop)) {
      misplaced.push(stop);
      continue;
    }
    let station = stations.get(stop.parent);
    if (!station) {
      const key = nameKey(stop.name);
      const candidates = loose.get(key) ?? [];
      station = candidates.find(candidate => distanceM(candidate, stop) <= (config.separateStops ? PLATFORM_RADIUS_M : MERGE_RADIUS_M));
      if (!station) {
        station = newStation(stop);
        stations.set(stop.id, station);
        candidates.push(station);
        loose.set(key, candidates);
      }
    }
    station.members.push(stop.id);
    station.names.add(stop.name);
    if (stop.wheelchair === '1') station.yes = true;
    if (stop.wheelchair === '2') station.no = true;
    stationOf.set(stop.id, station);
  }

  for (const stop of misplaced) {
    const siblings = loose.get(nameKey(stop.name)) ?? [];
    const station = siblings.reduce((best, candidate) => (!best || candidate.members.length > best.members.length ? candidate : best), null);
    if (!station) continue;
    station.members.push(stop.id);
    station.names.add(stop.name);
    stationOf.set(stop.id, station);
  }

  const sameName = (a, b) => {
    if (a === b) return true;
    const wordsA = a.split(' ');
    const wordsB = b.split(' ');
    if (wordsA.at(-1) === wordsB.at(-1)) return true;
    const [shorter, longer] = wordsA.length <= wordsB.length ? [wordsA, new Set(wordsB)] : [wordsB, new Set(wordsA)];
    return shorter.every(word => longer.has(word));
  };

  for (const station of new Set(stationOf.values())) {
    const keys = [...new Set(station.members.map(memberId => nameKey(stops.get(memberId).name)))];
    if (keys.length < 2) continue;
    const family = new Map(keys.map(key => [key, key]));
    const root = key => (family.get(key) === key ? key : root(family.get(key)));
    for (let i = 0; i < keys.length; i += 1) {
      for (let j = i + 1; j < keys.length; j += 1) {
        if (sameName(keys[i], keys[j])) family.set(root(keys[j]), root(keys[i]));
      }
    }
    const groups = new Map();
    for (const memberId of station.members) {
      const stop = stops.get(memberId);
      const key = root(nameKey(stop.name));
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(stop);
    }
    if (groups.size < 2) continue;
    const [kept, ...detached] = [...groups.values()].sort((a, b) => b.length - a.length);
    station.members = kept.map(stop => stop.id);
    station.names = new Set(kept.map(stop => stop.name));
    if (!kept.some(stop => sameName(nameKey(stop.name), nameKey(station.name)))) station.name = kept[0].name;
    for (const group of detached) {
      const lat = group.reduce((sum, stop) => sum + stop.lat, 0) / group.length;
      const lon = group.reduce((sum, stop) => sum + stop.lon, 0) / group.length;
      const split = newStation({ ...group[0], lat, lon });
      for (const stop of group) {
        split.members.push(stop.id);
        split.names.add(stop.name);
        if (stop.wheelchair === '1') split.yes = true;
        if (stop.wheelchair === '2') split.no = true;
        stationOf.set(stop.id, split);
      }
      stations.set(split.id, split);
    }
  }

  const linesOfStop = new Map();
  for (const trip of trips.values()) {
    for (const [, stopId] of trip.stops) {
      if (!linesOfStop.has(stopId)) linesOfStop.set(stopId, new Set());
      linesOfStop.get(stopId).add(trip.code);
    }
  }
  for (const station of new Set(stationOf.values())) {
    const served = station.members.map(memberId => stops.get(memberId)).filter(stop => linesOfStop.has(stop.id));
    const split = platformGroups(served, linesOfStop, { separateStops: config.separateStops });
    if (!split) continue;
    const { groups: ordered, centers } = split;
    const [kept, ...detached] = ordered;
    const moved = new Set(detached.flat().map(stop => stop.id));
    station.members = station.members.filter(memberId => !moved.has(memberId));
    station.names = new Set(station.members.map(memberId => stops.get(memberId).name));
    Object.assign(station, centers[0]);
    detached.forEach((group, index) => {
      const split = newStation({ ...group[0], ...centers[index + 1], parent: '' });
      for (const stop of group) {
        split.members.push(stop.id);
        split.names.add(stop.name);
        if (stop.wheelchair === '1') split.yes = true;
        if (stop.wheelchair === '2') split.no = true;
        stationOf.set(stop.id, split);
      }
      stations.set(split.id, split);
    });
  }

  const shapesOfLine = new Map();
  for (const trip of trips.values()) {
    for (const [, stopId] of trip.stops) stationOf.get(stopId)?.lines.add(trip.code);
    if (trip.shapeId) {
      if (!shapesOfLine.has(trip.code)) shapesOfLine.set(trip.code, new Set());
      shapesOfLine.get(trip.code).add(trip.shapeId);
    }
  }

  const shapePoints = new Map();
  eachRow(files['shapes.txt'], (row, col) => {
    const id = row[col.shape_id];
    if (!shapePoints.has(id)) shapePoints.set(id, []);
    shapePoints.get(id).push([Number(row[col.shape_pt_sequence]), round(Number(row[col.shape_pt_lon])), round(Number(row[col.shape_pt_lat]))]);
  });

  for (const route of routes) {
    const main = fiches.get(route.id)?.directions
      .slice()
      .sort((a, b) => b.trips.length - a.trips.length)[0];
    const first = main?.stops[0]?.name;
    const last = main?.stops.at(-1)?.name;
    if (first && last && first !== last) route.name = `${first} ↔ ${last}`;
  }

  const order = new Map(routes.map((route, index) => [route.id, index]));
  const servedStations = [...stations.values()].filter(station => station.lines.size > 0);
  const network = {
    code: config.code,
    firstDay: today,
    agencies,
    lines: routes.filter(route => fiches.has(route.id)),
    stops: servedStations.map(station => ({
      id: station.id,
      name: station.name,
      lat: round(station.lat),
      lon: round(station.lon),
      members: station.members,
      names: [...station.names],
      lines: [...station.lines].sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999)),
    })),
    accessible: servedStations
      .filter(station => (station.yes || station.wheelchair === '1') && !station.no)
      .map(station => station.id),
  };

  const dir = join(TARGET, config.code);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'shapes'), { recursive: true });
  writeFileSync(join(dir, 'network.json'), JSON.stringify(network));

  for (const route of network.lines) {
    let segments = [...(shapesOfLine.get(route.id) ?? [])]
      .map(id => (shapePoints.get(id) ?? []).sort((a, b) => a[0] - b[0]).map(([, lon, lat]) => [lon, lat]))
      .filter(segment => segment.length > 1);
    if (segments.length === 0) {
      segments = (fiches.get(route.id)?.directions ?? [])
        .map(direction => direction.stops
          .map(stop => stops.get(stop.id))
          .filter(Boolean)
          .map(stop => [round(stop.lon), round(stop.lat)]))
        .filter(segment => segment.length > 1);
    }
    writeFileSync(join(dir, 'shapes', `${encodeURIComponent(route.id)}.json`), JSON.stringify({ code: route.id, segments }));
  }
  const total = writeFiches(join(dir, 'fiches'), fiches);

  return {
    agencies,
    contacts,
    summary: `${network.lines.length} lignes, ${network.stops.length} arrêts (${network.accessible.length} accessibles), fiches ${(total / 1e6).toFixed(1)} Mo`,
  };
}

async function main() {
  const wanted = process.argv.slice(2);
  const today = parisToday();
  mkdirSync(TARGET, { recursive: true });

  const indexPath = join(TARGET, 'index.json');
  let index = {};
  try { index = JSON.parse(readFileSync(indexPath, 'utf8')); } catch { }

  for (const config of NETWORKS) {
    if (wanted.length > 0 && !wanted.includes(config.code)) continue;
    try {
      const { agencies, contacts, summary } = await buildNetwork(config, today);
      index[config.code] = { agencies, contacts, generatedFor: today };
      console.log(`${config.code.padEnd(11)} ${summary}`);
    } catch (error) {
      console.warn(`${config.code.padEnd(11)} non généré : ${error.message}`);
    }
  }

  writeFileSync(indexPath, JSON.stringify(index));
}

main().catch(error => {
  console.warn(`Réseaux GTFS non générés : ${error.message}`);
});
