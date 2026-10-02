import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';

export const WINDOW_DAYS = 21;

export async function downloadGtfs(url, wanted) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GTFS : HTTP ${response.status}`);
  const zip = new Uint8Array(await response.arrayBuffer());
  const names = new Set(wanted);
  return unzipSync(zip, { filter: file => names.has(file.name) });
}

function parseCsvLine(line) {
  const out = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(field); field = ''; }
    else field += c;
  }
  out.push(field);
  return out;
}

export function eachRow(bytes, onRow) {
  if (!bytes) return;
  const text = strFromU8(bytes).replace(/^﻿/, '');
  let start = text.indexOf('\n') + 1;
  const header = parseCsvLine(text.slice(0, start).trim());
  const col = Object.fromEntries(header.map((name, index) => [name, index]));
  while (start < text.length) {
    let end = text.indexOf('\n', start);
    if (end === -1) end = text.length;
    const line = text.slice(start, end).replace(/\r$/, '');
    if (line) onRow(parseCsvLine(line), col);
    start = end + 1;
  }
}

const dayNumber = yyyymmdd => Date.UTC(+yyyymmdd.slice(0, 4), +yyyymmdd.slice(4, 6) - 1, +yyyymmdd.slice(6, 8)) / 86400000;

export function parisToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date())
    .replaceAll('-', '');
}

const toMinutes = hms => {
  const [h, m] = hms.split(':');
  return Number(h) * 60 + Number(m);
};

export function serviceMasks(files, today) {
  const firstDay = dayNumber(today);
  const weekday = new Date(firstDay * 86400000).getUTCDay();
  const WEEK_COLUMNS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const masks = new Map();
  eachRow(files['calendar.txt'], (row, col) => {
    const start = dayNumber(row[col.start_date]);
    const end = dayNumber(row[col.end_date]);
    let mask = 0;
    for (let d = 0; d < WINDOW_DAYS; d++) {
      const day = firstDay + d;
      if (day < start || day > end) continue;
      if (row[col[WEEK_COLUMNS[(weekday + d) % 7]]] === '1') mask |= 1 << d;
    }
    masks.set(row[col.service_id], mask);
  });
  eachRow(files['calendar_dates.txt'], (row, col) => {
    const d = dayNumber(row[col.date]) - firstDay;
    if (d < 0 || d >= WINDOW_DAYS) return;
    const id = row[col.service_id];
    const mask = masks.get(id) ?? 0;
    masks.set(id, row[col.exception_type] === '1' ? mask | (1 << d) : mask & ~(1 << d));
  });
  return masks;
}

export function buildFiches(files, { today, codeOf, withTripIds = false }) {
  const masks = serviceMasks(files, today);

  const stopName = new Map();
  eachRow(files['stops.txt'], (row, col) => stopName.set(row[col.stop_id], row[col.stop_name]));

  const trips = new Map();
  eachRow(files['trips.txt'], (row, col) => {
    const mask = masks.get(row[col.service_id]) ?? 0;
    if (!mask) return;
    trips.set(row[col.trip_id], {
      id: row[col.trip_id],
      code: codeOf(row[col.route_id]),
      direction: row[col.direction_id] || '0',
      headsign: row[col.trip_headsign] || '',
      shapeId: row[col.shape_id] || '',
      mask,
      stops: [],
    });
  });

  eachRow(files['stop_times.txt'], (row, col) => {
    const trip = trips.get(row[col.trip_id]);
    if (!trip) return;
    trip.stops.push([Number(row[col.stop_sequence]), row[col.stop_id], toMinutes(row[col.departure_time] || row[col.arrival_time])]);
  });

  const lines = new Map();
  for (const trip of trips.values()) {
    if (!trip.code || trip.stops.length < 2) continue;
    trip.stops.sort((a, b) => a[0] - b[0]);
    const key = `${trip.code}|${trip.direction}`;
    if (!lines.has(key)) lines.set(key, []);
    lines.get(key).push(trip);
  }

  const fiches = new Map();
  for (const [key, list] of lines) {
    const code = key.slice(0, key.lastIndexOf('|'));
    if (!fiches.has(code)) fiches.set(code, { firstDay: today, days: WINDOW_DAYS, directions: [] });
    fiches.get(code).directions.push(buildDirection(list, stopName, withTripIds));
  }
  return { fiches, trips, stopName };
}

function buildDirection(list, stopName, withTripIds) {
  const keyed = list.map(trip => {
    const seen = new Map();
    return trip.stops.map(([, stopId, minutes]) => {
      const name = stopName.get(stopId) ?? stopId;
      const n = (seen.get(name) ?? 0) + 1;
      seen.set(name, n);
      return [`${name}#${n}`, stopId, minutes];
    });
  });

  const base = [...keyed].sort((a, b) => b.length - a.length)[0];
  const order = base.map(([k]) => k);
  for (const pattern of keyed) {
    let previous = -1;
    for (const [k] of pattern) {
      const at = order.indexOf(k);
      if (at !== -1) { previous = at; continue; }
      order.splice(previous + 1, 0, k);
      previous += 1;
    }
  }
  const index = new Map(order.map((k, i) => [k, i]));
  const idCount = new Map();
  for (const pattern of keyed) for (const [k, stopId] of pattern) {
    const counts = idCount.get(k) ?? new Map();
    counts.set(stopId, (counts.get(stopId) ?? 0) + 1);
    idCount.set(k, counts);
  }

  const courses = keyed.map((pattern, i) => {
    const times = new Array(order.length).fill(null);
    for (const [k, , minutes] of pattern) times[index.get(k)] = minutes;
    return withTripIds ? { d: list[i].mask, t: times, i: list[i].id } : { d: list[i].mask, t: times };
  });
  const firstTime = times => times.find(value => value !== null) ?? 0;
  courses.sort((a, b) => firstTime(a.t) - firstTime(b.t));

  const headsigns = new Map();
  for (const trip of list) headsigns.set(trip.headsign, (headsigns.get(trip.headsign) ?? 0) + 1);
  const headsign = [...headsigns.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

  return {
    headsign,
    stops: order.map(k => {
      const id = [...idCount.get(k).entries()].sort((a, b) => b[1] - a[1])[0][0];
      return { id, name: k.slice(0, k.lastIndexOf('#')) };
    }),
    trips: courses,
  };
}

export function writeFiches(target, fiches) {
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  let total = 0;
  for (const [code, fiche] of fiches) {
    const body = JSON.stringify(fiche);
    total += body.length;
    writeFileSync(join(target, `${encodeURIComponent(code)}.json`), body);
  }
  return total;
}

const VENDOR_HOSTS = [/cityway\./i, /hanoverdisplays\./i];

export function readAgencyContacts(bytes) {
  const contacts = [];
  eachRow(bytes, (row, col) => {
    const name = (row[col.agency_name] || '').trim();
    if (!name) return;
    let url = (row[col.agency_url] || '').trim() || null;
    if (url && VENDOR_HOSTS.some(host => host.test(url))) url = null;
    let phone = (row[col.agency_phone] || '').trim() || null;
    if (phone && !/[1-9]/.test(phone.replace(/^\+33/, ''))) phone = null;
    if (url || phone) contacts.push({ name, url, phone });
  });
  return contacts;
}
