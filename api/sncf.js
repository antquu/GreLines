const NAVITIA = 'https://api.sncf.com/v1/coverage/sncf';
const TTL_MS = 30_000;
const CATALOG_TTL_MS = 12 * 60 * 60 * 1000;
const HOME_NETWORK = 'regionaura';
const PAGE_SIZE = 1000;
const TRACE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TRANSITOUS = 'https://api.transitous.org/api/v5/plan';
const MAX_BRANCHES = 8;
const MERGE_RADIUS_METERS = 400;
const memory = new Map();

function sendJson(response, status, payload, headers = {}) {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
  response.end(JSON.stringify(payload));
}

function parisOffsetMs(utcGuess) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(utcGuess));
  const value = type => Number(parts.find(part => part.type === type)?.value);
  const asUtc = Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second'));
  return asUtc - utcGuess;
}

function parseNavitiaDate(text) {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(String(text || ''));
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match.map(Number);
  const naive = Date.UTC(y, mo - 1, d, h, mi, s);
  return naive - parisOffsetMs(naive);
}

function navitiaDate(epochMs) {
  const local = new Date(epochMs + parisOffsetMs(epochMs));
  const pad = value => String(value).padStart(2, '0');
  return `${local.getUTCFullYear()}${pad(local.getUTCMonth() + 1)}${pad(local.getUTCDate())}T${pad(local.getUTCHours())}${pad(local.getUTCMinutes())}00`;
}

async function navitia(path, key) {
  const response = await fetch(`${NAVITIA}${path}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`SNCF ${response.status}`);
  return response.json();
}

async function mapLimit(items, limit, task) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index]);
    }
  }));
  return results;
}

const slug = text => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

function brandOf(commercial) {
  if (/ouigo/i.test(commercial)) return 'OUIGO';
  if (/tgv|lyria|inoui/i.test(commercial)) return 'TGV';
  if (/intercit/i.test(commercial)) return 'IC';
  return null;
}

const BRAND_NAMES = { TGV: 'TGV INOUI', OUIGO: 'OUIGO', IC: 'Intercités', TER: 'TER' };

function lineKey(code, commercial, network) {
  const brand = brandOf(commercial);
  if (brand) return brand;
  if (!code) return 'TER';
  const scope = slug(network);
  return !scope || scope === HOME_NETWORK ? code : `${code}.${scope}`;
}

const isCoach = physical => /autocar|bus|\bcar\b|coach/i.test(String(physical || ''));
const stationName = name => String(name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
const uicOf = id => /(87\d{6})/.exec(String(id || ''))?.[1] ?? null;

async function allPages(path, field, key) {
  const first = await navitia(`${path}&count=${PAGE_SIZE}&start_page=0`, key);
  const total = Number(first?.pagination?.total_result ?? 0);
  const pages = Math.ceil(total / PAGE_SIZE);
  const rest = await mapLimit(Array.from({ length: Math.max(0, pages - 1) }, (_, index) => index + 1), 3,
    page => navitia(`${path}&count=${PAGE_SIZE}&start_page=${page}`, key).catch(() => null));
  return [first, ...rest].flatMap(data => data?.[field] ?? []);
}

const isExtraService = line => /additional service/i.test(line?.commercial_mode?.name ?? '');

async function buildCatalog(key) {
  const areas = await allPages('/stop_areas?depth=3', 'stop_areas', key);

  const lines = new Map();
  const keyOfLine = line => {
    const commercial = line.commercial_mode?.name ?? '';
    const id = lineKey(String(line.code || '').trim(), commercial, line.network?.name);
    if (!lines.has(id)) {
      const physicals = (line.physical_modes ?? []).map(mode => mode.name);
      lines.set(id, {
        id,
        code: BRAND_NAMES[id] ? id : String(line.code || '').trim() || id,
        name: BRAND_NAMES[id] ?? String(line.name || id),
        brand: commercial,
        coach: physicals.length > 0 && physicals.every(isCoach),
        color: line.color ? `#${line.color}` : null,
      });
    }
    return id;
  };

  const trainLinks = new Map();
  const trainLinkOf = line => {
    const physicals = (line.physical_modes ?? []).map(mode => mode.name);
    if (physicals.length > 0 && physicals.every(isCoach)) return null;
    if (!trainLinks.has(line.id)) trainLinks.set(line.id, trainLinks.size);
    return trainLinks.get(line.id);
  };

  const stations = [];
  for (const area of areas) {
    const uic = uicOf(area.id);
    const name = stationName(area.name);
    const lat = Number(area.coord?.lat);
    const lon = Number(area.coord?.lon);
    if (!uic || !name || !Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) continue;
    const usable = (area.lines ?? []).filter(line => !isExtraService(line));
    const served = [...new Set(usable.map(keyOfLine))];
    if (served.length === 0) continue;
    const links = [...new Set(usable.map(trainLinkOf).filter(index => index !== null))];
    const rail = (area.physical_modes ?? []).some(mode => !isCoach(mode.name) && !/bike|car$/i.test(mode.id ?? ''));
    stations.push({
      rail,
      uic,
      name,
      city: stationName(area.administrative_regions?.[0]?.name) || null,
      lat: Math.round(lat * 1e5) / 1e5,
      lon: Math.round(lon * 1e5) / 1e5,
      lines: served,
      links,
    });
  }

  const railStations = stations.filter(station => station.rail);
  const merged = new Set();
  for (const station of stations) {
    if (station.rail) continue;
    let nearest = null;
    for (const candidate of railStations) {
      if (Math.abs(candidate.lat - station.lat) > 0.01 || Math.abs(candidate.lon - station.lon) > 0.015) continue;
      const gap = distanceMeters(station.lat, station.lon, candidate.lat, candidate.lon);
      if (gap <= MERGE_RADIUS_METERS && (!nearest || gap < nearest.gap)) nearest = { gap, candidate };
    }
    if (!nearest) continue;
    const target = nearest.candidate;
    target.also = [...(target.also ?? []), station.uic];
    for (const id of station.lines) if (!target.lines.includes(id)) target.lines.push(id);
    for (const link of station.links) if (!target.links.includes(link)) target.links.push(link);
    merged.add(station.uic);
  }
  const kept = stations.filter(station => !merged.has(station.uic)).map(({ rail, ...station }) => station);

  const servedBy = new Map();
  for (const station of kept) {
    for (const id of station.lines) servedBy.set(id, [...(servedBy.get(id) ?? []), station]);
  }
  for (const [id, entry] of lines) {
    if (BRAND_NAMES[id]) continue;
    const served = servedBy.get(id) ?? [];
    let best = null;
    for (let i = 0; i < served.length; i += 1) {
      for (let j = i + 1; j < served.length; j += 1) {
        const a = served[i];
        const b = served[j];
        const spread = (a.lat - b.lat) ** 2 + ((a.lon - b.lon) * Math.cos((a.lat * Math.PI) / 180)) ** 2;
        if (!best || spread > best.spread) best = { spread, a, b };
      }
    }
    if (best) entry.name = `${best.a.name} / ${best.b.name}`;
  }

  return {
    builtAt: new Date().toISOString(),
    lines: [...lines.values()],
    stations: kept,
  };
}

async function departures(uic, key) {
  const from = navitiaDate(Date.now() - 10 * 60_000);
  const data = await navitia(
    `/stop_areas/stop_area:SNCF:${uic}/departures?from_datetime=${from}&duration=14400&count=80&data_freshness=realtime&depth=1`,
    key,
  );
  const alerts = new Map((data?.disruptions ?? []).map(disruption => [disruption.id, {
    effect: String(disruption.severity?.effect || ''),
    text: String(disruption.messages?.[0]?.text || disruption.cause || '').trim(),
    end: parseNavitiaDate(disruption.application_periods?.[0]?.end),
  }]));
  return (data?.departures ?? []).map(entry => {
    const info = entry.display_informations ?? {};
    const linked = [...(info.links ?? []), ...(entry.links ?? [])]
      .filter(link => link.type === 'disruption')
      .map(link => alerts.get(link.id))
      .filter(Boolean);
    const times = entry.stop_date_time ?? {};
    const base = parseNavitiaDate(times.base_departure_date_time ?? times.departure_date_time);
    const real = parseNavitiaDate(times.departure_date_time);
    return {
      train: String(info.trip_short_name || info.headsign || ''),
      direction: stationName(info.direction),
      mode: String(info.commercial_mode || ''),
      network: String(info.network || ''),
      code: String(info.code || '').trim(),
      line: lineKey(String(info.code || '').trim(), String(info.commercial_mode || ''), String(info.network || '')),
      coach: isCoach(info.physical_mode),
      base,
      real,
      live: times.data_freshness === 'realtime',
      deleted: (times.additional_informations ?? []).some(flag => /deleted/i.test(String(flag))),
      alert: linked[0] ?? null,
    };
  }).filter(entry => entry.base !== null && entry.real !== null);
}

function decodePolyline(encoded, precision) {
  const factor = 10 ** precision;
  const points = [];
  let index = 0;
  let lat = 0;
  let lon = 0;
  while (index < encoded.length) {
    for (const axis of [0, 1]) {
      let shift = 0;
      let result = 0;
      let byte;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += delta;
      else lon += delta;
    }
    points.push([Math.round((lon / factor) * 1e5) / 1e5, Math.round((lat / factor) * 1e5) / 1e5]);
  }
  return points;
}

function thin(points, minMeters = 40) {
  if (points.length <= 2) return points;
  const kept = [points[0]];
  for (let index = 1; index < points.length - 1; index += 1) {
    const [lon, lat] = points[index];
    const [lastLon, lastLat] = kept[kept.length - 1];
    if (distanceMeters(lat, lon, lastLat, lastLon) >= minMeters) kept.push(points[index]);
  }
  kept.push(points[points.length - 1]);
  return kept;
}

function distanceMeters(latA, lonA, latB, lonB) {
  const rad = Math.PI / 180;
  const x = (lonB - lonA) * rad * Math.cos(((latA + latB) / 2) * rad);
  const y = (latB - latA) * rad;
  return Math.sqrt(x * x + y * y) * 6_371_000;
}

async function navitiaLinesOf(lineId, key) {
  const brand = Object.keys(BRAND_NAMES).includes(lineId);
  if (brand) return [];
  const [code] = lineId.split('.');
  const data = await navitia(`/lines?count=50&depth=1&filter=${encodeURIComponent(`line.code="${code}"`)}`, key);
  return (data?.lines ?? []).filter(line =>
    !isExtraService(line) && lineKey(String(line.code || '').trim(), line.commercial_mode?.name ?? '', line.network?.name) === lineId);
}

async function branchesOf(navitiaLine, key) {
  const journeys = await allPages(`/lines/${encodeURIComponent(navitiaLine.id)}/vehicle_journeys?depth=1`, 'vehicle_journeys', key).catch(() => []);
  const branches = new Map();
  for (const journey of journeys) {
    const stops = (journey.stop_times ?? [])
      .map(time => ({ lat: Number(time.stop_point?.coord?.lat), lon: Number(time.stop_point?.coord?.lon), at: time.departure_time ?? time.arrival_time }))
      .filter(stop => Number.isFinite(stop.lat) && Number.isFinite(stop.lon) && stop.lat !== 0);
    if (stops.length < 2) continue;
    const first = stops[0];
    const last = stops[stops.length - 1];
    const pair = [first, last].map(stop => `${stop.lat.toFixed(2)},${stop.lon.toFixed(2)}`).sort().join('|');
    const known = branches.get(pair);
    if (!known || stops.length > known.stops.length) branches.set(pair, { stops, first, last, at: first.at });
  }
  return [...branches.values()];
}

function nextServiceTime(hhmmss) {
  const match = /^(\d{2})(\d{2})/.exec(String(hhmmss || ''));
  const hours = match ? Number(match[1]) % 24 : 8;
  const minutes = match ? Number(match[2]) : 0;
  const now = Date.now();
  for (let days = 1; days <= 7; days += 1) {
    const local = new Date(now + parisOffsetMs(now) + days * 86_400_000);
    if (local.getUTCDay() === 0 || local.getUTCDay() === 6) continue;
    const naive = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hours, minutes) - 2 * 60_000;
    return naive - parisOffsetMs(naive);
  }
  return now;
}

async function traceOfBranch(branch, coach) {
  const params = new URLSearchParams({
    fromPlace: `${branch.first.lat},${branch.first.lon}`,
    toPlace: `${branch.last.lat},${branch.last.lon}`,
    time: new Date(nextServiceTime(branch.at)).toISOString(),
    transitModes: coach ? 'COACH,BUS' : 'RAIL',
    maxTransfers: '0',
    numItineraries: '3',
    maxPreTransitTime: '2400',
    maxPostTransitTime: '2400',
  });
  const response = await fetch(`${TRANSITOUS}?${params}`, {
    headers: { 'User-Agent': 'GreLines (grelines.fr)' },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!response?.ok) return null;
  const data = await response.json().catch(() => null);
  let best = null;
  for (const itinerary of data?.itineraries ?? []) {
    for (const leg of itinerary.legs ?? []) {
      if (leg.mode === 'WALK' || !leg.legGeometry?.points) continue;
      const startGap = distanceMeters(leg.from.lat, leg.from.lon, branch.first.lat, branch.first.lon);
      const endGap = distanceMeters(leg.to.lat, leg.to.lon, branch.last.lat, branch.last.lon);
      if (startGap > 3000 || endGap > 3000) continue;
      const points = decodePolyline(leg.legGeometry.points, leg.legGeometry.precision ?? 6);
      if (startGap > 150) points.unshift([branch.first.lon, branch.first.lat]);
      if (endGap > 150) points.push([branch.last.lon, branch.last.lat]);
      if (!best || points.length > best.length) best = points;
    }
  }
  return best ? thin(best) : null;
}

async function buildTrace(lineId, key) {
  const lines = await navitiaLinesOf(lineId, key);
  if (lines.length === 0) return { line: lineId, segments: [] };
  const coach = lines.every(line => (line.physical_modes ?? []).every(mode => isCoach(mode.name)));
  const candidates = (await Promise.all(lines.slice(0, 3).map(line => branchesOf(line, key)))).flat();
  const covered = new Set();
  const branches = [];
  while (branches.length < MAX_BRANCHES) {
    let best = null;
    for (const branch of candidates) {
      if (branches.includes(branch)) continue;
      const gain = branch.stops.filter(stop => !covered.has(`${stop.lat.toFixed(3)},${stop.lon.toFixed(3)}`)).length;
      if (!best || gain > best.gain) best = { gain, branch };
    }
    if (!best || best.gain < 2) break;
    branches.push(best.branch);
    for (const stop of best.branch.stops) covered.add(`${stop.lat.toFixed(3)},${stop.lon.toFixed(3)}`);
  }
  const traces = await mapLimit(branches, 4, async branch =>
    (await traceOfBranch(branch, coach)) ?? branch.stops.map(stop => [stop.lon, stop.lat]));
  return { line: lineId, segments: traces.filter(trace => trace && trace.length >= 2) };
}

const FICHE_DAYS = 7;
const FICHE_TTL_MS = 6 * 60 * 60 * 1000;
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const ymd = date => `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`;

function parisToday() {
  const now = Date.now();
  const local = new Date(now + parisOffsetMs(now));
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

function daysMask(journey, firstDay) {
  let mask = 0;
  for (let index = 0; index < FICHE_DAYS; index += 1) {
    const day = new Date(firstDay.getTime() + index * 86_400_000);
    const stamp = ymd(day);
    let runs = false;
    for (const calendar of journey.calendars ?? []) {
      const inPeriod = (calendar.active_periods ?? []).some(period => stamp >= period.begin && stamp < period.end);
      if (inPeriod && calendar.week_pattern?.[WEEKDAYS[day.getUTCDay()]]) runs = true;
      for (const exception of calendar.exceptions ?? []) {
        if (String(exception.datetime || '').slice(0, 8) !== stamp) continue;
        runs = exception.type === 'add';
      }
    }
    if (runs) mask |= 1 << index;
  }
  return mask;
}

const minutesOf = hhmmss => {
  const match = /^(\d{2})(\d{2})/.exec(String(hhmmss || ''));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

function mergeSequence(order, stops) {
  for (let index = 0; index < stops.length; index += 1) {
    if (order.some(entry => entry.id === stops[index].id)) continue;
    const previous = index > 0 ? order.findIndex(entry => entry.id === stops[index - 1].id) : -1;
    const next = stops.slice(index + 1).find(stop => order.some(entry => entry.id === stop.id));
    const at = previous >= 0 ? previous + 1 : next ? order.findIndex(entry => entry.id === next.id) : order.length;
    order.splice(at, 0, stops[index]);
  }
}

async function buildFiche(lineId, key) {
  const lines = await navitiaLinesOf(lineId, key);
  const firstDay = parisToday();
  const groups = new Map();
  for (const line of lines.slice(0, 3)) {
    const journeys = await allPages(`/lines/${encodeURIComponent(line.id)}/vehicle_journeys?depth=1`, 'vehicle_journeys', key).catch(() => []);
    for (const journey of journeys) {
      const mask = daysMask(journey, firstDay);
      if (!mask) continue;
      const calls = (journey.stop_times ?? [])
        .map(time => ({ uic: uicOf(time.stop_point?.id), name: stationName(time.stop_point?.name), at: minutesOf(time.departure_time ?? time.arrival_time) }))
        .filter(call => call.uic && call.at !== null);
      if (calls.length < 2) continue;
      for (let index = 1; index < calls.length; index += 1) {
        while (calls[index].at < calls[index - 1].at) calls[index].at += 1440;
      }
      const headsign = calls[calls.length - 1].name;
      const group = groups.get(headsign) ?? { headsign, order: [], trips: [] };
      mergeSequence(group.order, calls.map(call => ({ id: `OCE${call.uic}`, name: call.name })));
      group.trips.push({ d: mask, calls, i: String(journey.name || '') });
      groups.set(headsign, group);
    }
  }
  const directions = [...groups.values()]
    .sort((a, b) => b.trips.length - a.trips.length)
    .map(group => {
      const position = new Map(group.order.map((stop, index) => [stop.id, index]));
      const trips = group.trips
        .map(trip => {
          const times = new Array(group.order.length).fill(null);
          for (const call of trip.calls) times[position.get(`OCE${call.uic}`)] = call.at;
          return { d: trip.d, t: times, i: trip.i };
        })
        .sort((a, b) => (a.t.find(time => time !== null) ?? 0) - (b.t.find(time => time !== null) ?? 0));
      return { headsign: group.headsign, stops: group.order, trips };
    });
  return { firstDay: ymd(firstDay), days: FICHE_DAYS, directions };
}

async function cached(cacheKey, ttl, build) {
  const hit = memory.get(cacheKey);
  if (hit && Date.now() < hit.expires) return hit.payload;
  const payload = await build();
  memory.set(cacheKey, { payload, expires: Date.now() + ttl });
  if (memory.size > 500) memory.clear();
  return payload;
}

export default async function handler(request, response) {
  const key = process.env.SNCF_API_KEY;
  if (!key) {
    sendJson(response, 501, { error: 'SNCF_API_KEY manquante' });
    return;
  }

  const url = new URL(request.url, 'http://localhost');
  const resource = url.searchParams.get('ressource') ?? 'passages';

  try {
    if (resource === 'reseau') {
      const payload = await cached('catalog-v2', CATALOG_TTL_MS, () => buildCatalog(key));
      sendJson(response, 200, payload, { 'Cache-Control': 'public, s-maxage=43200, stale-while-revalidate=86400' });
      return;
    }

    if (resource === 'fiche') {
      const lineId = url.searchParams.get('ligne') ?? '';
      if (!/^[A-Za-z0-9 +]{1,12}(\.[a-z0-9]{1,40})?$/.test(lineId)) {
        sendJson(response, 400, { error: 'Ligne inconnue' });
        return;
      }
      const payload = await cached(`fiche:${lineId}:${ymd(parisToday())}`, FICHE_TTL_MS, () => buildFiche(lineId, key));
      sendJson(response, 200, payload, { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=43200' });
      return;
    }

    if (resource === 'trace') {
      const lineId = url.searchParams.get('ligne') ?? '';
      if (!/^[A-Za-z0-9 +]{1,12}(\.[a-z0-9]{1,40})?$/.test(lineId)) {
        sendJson(response, 400, { error: 'Ligne inconnue' });
        return;
      }
      const payload = await cached(`trace4:${lineId}`, TRACE_TTL_MS, () => buildTrace(lineId, key));
      sendJson(response, 200, payload, { 'Cache-Control': 'public, s-maxage=604800, stale-while-revalidate=1209600' });
      return;
    }

    const uic = url.searchParams.get('gare') ?? '';
    if (resource !== 'passages' || !/^87\d{6}$/.test(uic)) {
      sendJson(response, 400, { error: 'Requête inconnue', ressources: ['reseau', 'passages&gare=87xxxxxx', 'trace&ligne=K6', 'fiche&ligne=K6'] });
      return;
    }
    const payload = await cached(`departures:${uic}`, TTL_MS, () => departures(uic, key));
    sendJson(response, 200, payload, { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' });
  } catch {
    sendJson(response, 502, { error: 'API SNCF injoignable' });
  }
}
