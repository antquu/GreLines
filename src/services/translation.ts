import { supabase } from './supabase';

const SOURCE_LANG = 'fr';

const ENDPOINT = 'https://api.mymemory.translated.net/get';

const CONTACT = 'ant.adam468@gmail.com';

const MAX_CHUNK = 450;

const CALL_SPACING_MS = 350;

const SESSION_BUDGET = 30;
let spent = 0;

const COOLDOWN_MS = 15 * 60 * 1000;
let coolingUntil = 0;

const memory = new Map<string, string>();
const pending = new Map<string, Promise<string>>();
const failed = new Set<string>();

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeTranslations(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function announce(): void {
  for (const listener of listeners) listener();
}

function keyOf(text: string, target: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${target}:${text.length}:${hash.toString(16)}`;
}

function chunk(text: string): string[] {
  if (text.length <= MAX_CHUNK) return [text];
  const parts: string[] = [];
  let current = '';
  for (const sentence of text.split(/(?<=[.!?…])\s+/)) {
    if (current && current.length + sentence.length + 1 > MAX_CHUNK) {
      parts.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) parts.push(current);
  return parts.flatMap(part => {
    if (part.length <= MAX_CHUNK) return [part];
    const words = part.split(' ');
    const pieces: string[] = [];
    let piece = '';
    for (const word of words) {
      if (piece && piece.length + word.length + 1 > MAX_CHUNK) {
        pieces.push(piece);
        piece = word;
      } else {
        piece = piece ? `${piece} ${word}` : word;
      }
    }
    if (piece) pieces.push(piece);
    return pieces;
  });
}

let lastCall = 0;

async function translateChunk(text: string, target: string): Promise<string | null> {
  if (Date.now() < coolingUntil) return null;

  const wait = Math.max(0, lastCall + CALL_SPACING_MS - Date.now());
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
  lastCall = Date.now();

  const params = new URLSearchParams({
    q: text,
    langpair: `${SOURCE_LANG}|${target}`,
    de: CONTACT,
  });

  try {
    const response = await fetch(`${ENDPOINT}?${params.toString()}`);
    if (response.status === 429) {
      coolingUntil = Date.now() + COOLDOWN_MS;
      return null;
    }
    if (!response.ok) return null;
    const payload = await response.json();
    const translated = payload?.responseData?.translatedText;
    if (typeof translated !== 'string' || !translated.trim()) return null;
    if (/^(MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID)/i.test(translated)) return null;
    return translated;
  } catch {
    return null;
  }
}

async function readCache(keys: string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  if (!supabase || keys.length === 0) return found;
  try {
    const { data, error } = await supabase
      .from('translations')
      .select('key, translated_text')
      .in('key', keys);
    if (error || !Array.isArray(data)) return found;
    for (const row of data) {
      if (row?.key && typeof row.translated_text === 'string') {
        found.set(row.key, row.translated_text);
      }
    }
  } catch {
  }
  return found;
}

async function writeCache(
  key: string,
  target: string,
  source: string,
  translated: string,
): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from('translations').upsert(
      {
        key,
        source_lang: SOURCE_LANG,
        target_lang: target,
        source_text: source,
        translated_text: translated,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    );
  } catch {
  }
}

async function touch(keys: string[]): Promise<void> {
  if (!supabase || keys.length === 0) return;
  try {
    await supabase
      .from('translations')
      .update({ last_seen_at: new Date().toISOString() })
      .in('key', keys);
  } catch {
  }
}

export function cachedTranslation(text: string, target: string): string | null {
  if (!text.trim() || target === SOURCE_LANG) return null;
  return memory.get(keyOf(text, target)) ?? null;
}

export function requestTranslation(text: string, target: string): void {
  const trimmed = text.trim();
  if (!trimmed || target === SOURCE_LANG) return;

  const key = keyOf(trimmed, target);
  if (memory.has(key) || pending.has(key) || failed.has(key)) return;
  if (Date.now() < coolingUntil) return;

  const work = (async () => {
    const cached = await readCache([key]);
    const known = cached.get(key);
    if (known) {
      memory.set(key, known);
      void touch([key]);
      announce();
      return known;
    }

    if (spent >= SESSION_BUDGET) {
      failed.add(key);
      return trimmed;
    }
    spent += 1;

    const pieces = chunk(trimmed);
    const translatedPieces: string[] = [];
    for (const piece of pieces) {
      const result = await translateChunk(piece, target);
      if (result === null) {
        failed.add(key);
        return trimmed;
      }
      translatedPieces.push(result);
    }

    const translated = translatedPieces.join(' ');
    memory.set(key, translated);
    void writeCache(key, target, trimmed, translated);
    announce();
    return translated;
  })();

  pending.set(key, work);
  void work.finally(() => pending.delete(key));
}
