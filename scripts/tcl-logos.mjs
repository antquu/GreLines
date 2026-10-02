import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'public/assets/lignes');
const TARGET = join(ROOT, 'src/data/tclLogos.json');

const TABS = [
  ['M20.693 23.307', 'M'],
  ['M17.496 8.469', 'T'],
  ['M13.5 5.1h10.3', 'F'],
  ['M20.3705,4.3', 'C'],
  ['M3.578,8.213', 'BUS'],
  ['M5.871 8.355', 'BUS'],
  ['M19.155,12.499', 'TB'],
];

const TAB_WIDTH = 35;
const RELAIS_TAB_WIDTH = 44.337;


const lines = {};
const tabs = {};
const tabWidths = {};

for (const file of readdirSync(SOURCE).filter(name => name.endsWith('.svg')).sort()) {
  const code = file.replace(/\.svg$/, '');
  const svg = readFileSync(join(SOURCE, file), 'utf8');
  const box = svg.match(/viewBox="([^"]+)"/)?.[1].split(/[\s,]+/).map(Number);
  if (!box || box[3] !== 28) continue;

  const paths = [...svg.matchAll(/<path([^>]*)>/g)].map(match => match[1]);
  const pathD = attrs => attrs.match(/\sd="([^"]+)"/)?.[1] ?? '';

  const relais = /^M0,\.063h44\.337/.test(pathD(paths[0] ?? ''));
  if (!relais && !/^M3(\.5|5,0H3\.6|\.6)/.test(pathD(paths[0] ?? ''))) continue;

  const letter = pathD(paths[1] ?? '');
  const mode = relais ? 'RELAIS' : TABS.find(([prefix]) => letter.startsWith(prefix))?.[1];
  if (!mode) continue;

  const starts = paths
    .map(pathD)
    .map(d => d.match(/^M(\d+(?:\.\d+)?)[ ,]/)?.[1])
    .map(Number)
    .filter(x => x >= 38 && x <= (relais ? 48 : 42));
  if (starts.length === 0) continue;
  const x = Math.min(...starts);

  const colour = attrs => attrs.match(/\sfill="([^"]+)"/)?.[1] ?? null;
  const stroke = attrs => attrs.match(/\sstroke="([^"]+)"/)?.[1] ?? null;
  const at = paths.findIndex(attrs => Number(pathD(attrs).match(/^M(\d+(?:\.\d+)?)/)?.[1]) === x);
  const square = paths[at];
  const next = paths[at + 1] ?? '';
  let bg = colour(square);
  let fg = colour(next) ?? '#FFFFFF';
  let border = null;
  if (stroke(square)) {
    border = stroke(square);
    bg = '#FFFFFF';
    fg = border;
  } else if (/^M[\d.]+,1\.4h41\.3v25\.2h-41\.3/.test(pathD(next))) {
    border = bg;
    bg = '#FFFFFF';
    fg = colour(paths[at + 2] ?? '') ?? border;
  } else if (/^M[4-6][0-9.]+,1\.4/.test(pathD(next))) {
    fg = '#FFFFFF';
  }

  const label = relais ? code.replace(/^BR(T?)/, (_, tram) => (tram ? 'T' : '')) : null;

  lines[code] = { mode, x, w: box[2], bg, fg, ...(border ? { border } : {}), ...(label ? { label } : {}) };
  tabs[mode] ??= code;
  tabWidths[mode] = relais ? RELAIS_TAB_WIDTH : TAB_WIDTH;
}

const whole = readdirSync(SOURCE)
  .filter(name => name.endsWith('.svg'))
  .map(name => name.replace(/\.svg$/, ''))
  .filter(code => !lines[code]);

mkdirSync(dirname(TARGET), { recursive: true });
writeFileSync(TARGET, JSON.stringify({ tabs, tabWidths, whole, lines }, null, 0) + '\n');

console.log(`${Object.keys(lines).length} logos découpés, ${whole.length} laissés entiers : ${whole.join(', ')}`);
