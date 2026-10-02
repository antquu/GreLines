import { inflateRawSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const FEEDS = ['SEM', 'C38', 'MCO'];

const ENDPOINT = feed => `https://data.mobilites-m.fr/api/gtfs/${feed}`;


function readFromZip(buffer, wanted) {
  let end = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('archive illisible : fin de répertoire introuvable');

  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);

  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);

    if (name === wanted) {
      const localNameLength = buffer.readUInt16LE(localOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const raw = buffer.subarray(start, start + compressedSize);
      return method === 0 ? raw : inflateRawSync(raw);
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  throw new Error(`${wanted} absent de l'archive`);
}


function splitCsvLine(line) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      cells.push(cell);
      cell = '';
    } else cell += char;
  }
  cells.push(cell);
  return cells;
}

function parseCsv(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const cells = splitCsvLine(line);
    const row = {};
    header.forEach((key, index) => {
      row[key] = cells[index] ?? '';
    });
    return row;
  });
}


async function collect(feed) {
  const response = await fetch(ENDPOINT(feed), { headers: { Origin: 'https://grelines.fr' } });
  if (!response.ok) {
    console.warn(`  ${feed} : ${response.status}, jeu ignoré`);
    return [];
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const rows = parseCsv(readFromZip(buffer, 'stops.txt').toString('utf8'));

  const poles = rows.filter(row => row.location_type !== '1');
  const stationCodes = new Map(
    rows.filter(row => row.location_type === '1').map(row => [row.stop_id, row.stop_code]),
  );

  const accessible = new Set();
  const byStation = new Map();

  for (const pole of poles) {
    const value = pole.wheelchair_boarding;
    if (value === '1') accessible.add(`${feed}:${pole.stop_id}`);
    if (!pole.parent_station) continue;
    const seen = byStation.get(pole.parent_station) ?? { yes: false, no: false };
    if (value === '1') seen.yes = true;
    if (value === '2') seen.no = true;
    byStation.set(pole.parent_station, seen);
  }

  let stations = 0;
  for (const [station, seen] of byStation) {
    if (seen.yes && !seen.no) {
      accessible.add(`${feed}:${station}`);
      const code = stationCodes.get(station);
      if (code && code !== station) accessible.add(`${feed}:${code}`);
      stations++;
    }
  }

  const list = [...accessible];
  console.log(`  ${feed} : ${stations} arrêts accessibles, ${list.length} identifiants`);
  return list;
}

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, '..', 'public', 'accessible-stops.json');

console.log('Lecture des jeux GTFS…');
const all = [];
for (const feed of FEEDS) {
  try {
    all.push(...(await collect(feed)));
  } catch (error) {
    console.warn(`  ${feed} : ${error.message}, jeu ignoré`);
  }
}

all.sort();
writeFileSync(
  target,
  `${JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), stops: all })}\n`,
  'utf8',
);
console.log(`${all.length} identifiants écrits dans public/accessible-stops.json`);
