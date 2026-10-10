import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFiches, downloadGtfs, eachRow, parisToday, readAgencyContacts, writeFiches } from './lib/gtfs.mjs';
import { SITE, SITE_NETWORK } from './lib/site.mjs';

if (SITE_NETWORK && SITE_NETWORK !== 'TCL') {
  console.log(`tcl-timetables : site ${SITE}, rien à générer.`);
  process.exit(0);
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = join(ROOT, 'public/data/tcl-fiches');
const ACCESSIBILITY = join(ROOT, 'public/data/tcl-accessibility.json');

const GTFS_URL = 'https://www.data.gouv.fr/api/1/datasets/r/abebedc6-28cf-4e2e-9c64-db57a40156f8';

async function main() {
  const files = await downloadGtfs(GTFS_URL, ['agency.txt', 'routes.txt', 'trips.txt', 'calendar.txt', 'calendar_dates.txt', 'stops.txt', 'stop_times.txt']);

  const networksDir = join(ROOT, 'public/data/networks');
  mkdirSync(networksDir, { recursive: true });
  const indexPath = join(networksDir, 'index.json');
  let index = {};
  try { index = JSON.parse(readFileSync(indexPath, 'utf8')); } catch { }
  index.TCL = { ...(index.TCL ?? {}), contacts: readAgencyContacts(files['agency.txt']) };
  writeFileSync(indexPath, JSON.stringify(index));
  const today = parisToday();

  const routeCode = new Map();
  eachRow(files['routes.txt'], (row, col) => routeCode.set(row[col.route_id], row[col.route_short_name] || row[col.route_id]));

  const { fiches } = buildFiches(files, { today, codeOf: routeId => routeCode.get(routeId) });
  const total = writeFiches(TARGET, fiches);
  console.log(`Fiches TCL : ${fiches.size} lignes, ${(total / 1e6).toFixed(1)} Mo, à partir du ${today}.`);

  const yes = [];
  const no = [];
  eachRow(files['stops.txt'], (row, col) => {
    const value = row[col.wheelchair_boarding];
    if (value === '1') yes.push(row[col.stop_id]);
    else if (value === '2') no.push(row[col.stop_id]);
  });
  writeFileSync(ACCESSIBILITY, JSON.stringify({ generatedFor: today, yes, no }));
  console.log(`Accessibilité TCL : ${yes.length} quais accessibles, ${no.length} non accessibles.`);
}

main().catch(error => {
  console.warn(`Fiches TCL non générées : ${error.message}`);
});
