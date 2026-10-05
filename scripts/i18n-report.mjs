import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SOURCE = join(ROOT, 'src');
const SKIPPED = new Set(['i18n', 'landing']);
const INLINE = /\b(?:fr|isFr|en|isEn|language === 'fr'|language === 'en')\s*\?(?![.?])/g;

function filesOf(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return SKIPPED.has(name) ? [] : filesOf(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const counts = filesOf(SOURCE)
  .map(path => ({ path: relative(ROOT, path), count: (readFileSync(path, 'utf8').match(INLINE) ?? []).length }))
  .filter(entry => entry.count > 0)
  .sort((a, b) => b.count - a.count);

const total = counts.reduce((sum, entry) => sum + entry.count, 0);
for (const entry of counts) console.log(`${String(entry.count).padStart(5)}  ${entry.path}`);
console.log(`\n${total} traductions encore écrites dans ${counts.length} fichiers (à déplacer vers src/i18n).`);
