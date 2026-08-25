/**
 * Les arrêts accessibles en fauteuil, extraits du GTFS.
 *
 * L'API JSON du réseau ne dit rien de l'accessibilité : ni `/index/routes/*
 * /clusters`, ni `/linesNear`, ni `stoptimes` ne portent le renseignement. Le
 * GTFS, lui, le porte — c'est la colonne `wheelchair_boarding` de `stops.txt`,
 * renseignée pour près de la moitié des poteaux du réseau urbain.
 *
 * On ne peut pas la lire depuis le navigateur : l'archive fait six mégaoctets,
 * pour trois kilo-octets d'information utile. Ce script la lit ici, une fois,
 * et dépose dans `public/` la seule liste des arrêts accessibles. L'application
 * la charge comme un fichier statique, sans dépendre du réseau.
 *
 *   node scripts/accessible-stops.mjs
 *
 * À relancer quand le réseau change — une station rendue accessible, un quai
 * repris. Le fichier porte sa date de fabrication pour qu'on sache quand il a
 * été relevé.
 */

import { inflateRawSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Les jeux GTFS du territoire, par préfixe d'identifiant.
 *
 * Le préfixe est celui que l'application met devant les identifiants d'arrêt —
 * `SEM:2109` pour un poteau du réseau urbain. Il ne se déduit pas du GTFS, qui
 * ne connaît que `2109` : c'est le nom du jeu qui le donne.
 *
 * Les jeux muets — le Grésivaudan ne renseigne aucun de ses arrêts — se
 * traversent sans rien produire. On les garde dans la liste tout de même : le
 * jour où ils renseigneront leurs quais, il n'y aura rien à changer ici.
 */
const FEEDS = ['SEM', 'C38', 'MCO'];

const ENDPOINT = feed => `https://data.mobilites-m.fr/api/gtfs/${feed}`;

/* -------------------------------------------------------------------------- */
/*  Lire une archive zip sans dépendance                                      */
/* -------------------------------------------------------------------------- */

/**
 * Extrait un fichier d'une archive zip tenue en mémoire.
 *
 * On passe par le répertoire central plutôt que par les en-têtes locaux : lui
 * seul donne les tailles de façon fiable, les en-têtes locaux pouvant les
 * renvoyer à un descripteur placé après les données.
 */
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

/* -------------------------------------------------------------------------- */
/*  Lire stops.txt                                                            */
/* -------------------------------------------------------------------------- */

/** Découpe une ligne de CSV en tenant compte des guillemets. */
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

/* -------------------------------------------------------------------------- */

async function collect(feed) {
  const response = await fetch(ENDPOINT(feed), { headers: { Origin: 'https://grelines.fr' } });
  if (!response.ok) {
    console.warn(`  ${feed} : ${response.status}, jeu ignoré`);
    return [];
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const rows = parseCsv(readFromZip(buffer, 'stops.txt').toString('utf8'));

  /*
   * Deux niveaux dans le même fichier : les stations (`location_type = 1`) et
   * les poteaux qui leur appartiennent. Seuls les poteaux sont renseignés ; la
   * station porte toujours zéro, c'est-à-dire « on ne sait pas ».
   */
  const poles = rows.filter(row => row.location_type !== '1');
  /*
   * Le mnémonique de chaque station, à côté de son identifiant.
   *
   * L'application désigne un arrêt tantôt par l'un — `SEM:LP` —, tantôt par
   * l'autre — `SEM:GENLP`, celui que rend `/clusters`. Les deux sont écrits
   * dans la liste, faute de quoi la moitié des arrêts ne se reconnaîtraient
   * pas selon l'endroit d'où on les regarde.
   */
  const stationCodes = new Map(
    rows.filter(row => row.location_type === '1').map(row => [row.stop_id, row.stop_code]),
  );

  const accessible = new Set();
  /** Par station : ce que disent ses poteaux. */
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

  /*
   * Une station vaut pour accessible si l'un de ses quais l'est et qu'aucun ne
   * porte le contraire.
   *
   * Le « et » compte. Un arrêt de bus a souvent un quai repris et l'autre non :
   * afficher le fauteuil sur le nom de l'arrêt reviendrait alors à promettre
   * qu'on peut monter, quel que soit le sens — ce qui est faux la moitié du
   * temps, et cette moitié-là est celle où quelqu'un se retrouve devant une
   * bordure infranchissable. On préfère ne rien dire.
   */
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
