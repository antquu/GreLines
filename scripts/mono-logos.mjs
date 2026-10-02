import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'public/assets/homepage/svg');
const TARGET = join(SOURCE, 'mono');

function luminance(hex) {
  let value = hex.replace('#', '').trim();
  if (value.length === 3) value = [...value].map(c => c + c).join('');
  if (value.length !== 6) return 0;
  const [r, g, b] = [0, 2, 4].map(i => parseInt(value.slice(i, i + 2), 16));
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

const isCounterForm = fill => fill.startsWith('#') && luminance(fill) > 0.92;

function convert(svg) {
  const header = svg.match(/<svg[^>]*>/);
  if (!header) return null;
  const viewBox = header[0].match(/viewBox="([^"]+)"/);
  if (!viewBox) return null;
  const [, , width, height] = viewBox[1].split(/\s+/).map(Number);

  const paths = svg.match(/<path[^>]*\/?>/g) ?? [];
  const ink = [];
  const holes = [];
  for (const path of paths) {
    const fill = path.match(/fill="([^"]*)"/)?.[1] ?? '#000000';
    const d = path.match(/\sd="([^"]*)"/)?.[1];
    if (!d) continue;
    (isCounterForm(fill) ? holes : ink).push(d);
  }
  if (ink.length === 0) return null;

  const mask = holes.length
    ? `<mask id="k" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}">` +
      `<rect width="${width}" height="${height}" fill="#fff"/>` +
      holes.map(d => `<path d="${d}" fill="#000"/>`).join('') +
      `</mask>`
    : '';

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox[1]}" width="${width}" height="${height}">` +
    mask +
    `<g${holes.length ? ' mask="url(#k)"' : ''} fill="#000">` +
    ink.map(d => `<path d="${d}"/>`).join('') +
    `</g></svg>\n`
  );
}

mkdirSync(TARGET, { recursive: true });
let done = 0;
for (const file of readdirSync(SOURCE)) {
  if (!file.endsWith('.svg')) continue;
  const converted = convert(readFileSync(join(SOURCE, file), 'utf8'));
  if (!converted) {
    console.warn(`  ignoré (structure inattendue) : ${file}`);
    continue;
  }
  writeFileSync(join(TARGET, file), converted);
  done += 1;
}
console.log(`${done} logotypes écrits dans public/assets/homepage/svg/mono/`);
