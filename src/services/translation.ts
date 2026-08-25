/**
 * La traduction des textes du réseau.
 *
 * L'infotrafic et le message du bandeau arrivent en français, écrits par les
 * exploitants. Pour qui lit l'anglais, les afficher tels quels revient à ne rien
 * afficher — et c'est justement le moment où l'information compte, puisqu'une
 * perturbation change un trajet.
 *
 * Trois précautions, dans cet ordre :
 *
 *   1. On ne traduit que ce qui est à l'écran. Le réseau publie près de trois
 *      cents perturbations, dont on lit trois. Les demandes viennent donc des
 *      cartes affichées, jamais d'un balayage du catalogue.
 *
 *   2. On ne traduit qu'une fois. Le résultat est rangé dans la base du projet,
 *      indexé sur l'empreinte du texte : la deuxième personne qui ouvre la même
 *      perturbation la lit sans qu'aucun appel ne parte. Deux perturbations au
 *      libellé identique partagent leur traduction, ce qui arrive souvent.
 *
 *   3. On ne dépasse pas le quota. Le service compte les mots et refuse au-delà ;
 *      les demandes partent une par une, espacées, et le texte d'origine reste
 *      affiché tant que la traduction n'est pas revenue. Une traduction qui
 *      manque n'a jamais pour effet de masquer l'information.
 *
 * En cas d'échec — quota atteint, service en panne, base injoignable — la
 * fonction rend le texte français. C'est un repli acceptable : on comprend une
 * perturbation dans une langue qu'on ne parle pas mieux qu'on ne comprend un
 * écran vide.
 */

import { supabase } from './supabase';

/** La langue des textes publiés par les réseaux. */
const SOURCE_LANG = 'fr';

const ENDPOINT = 'https://api.mymemory.translated.net/get';

/**
 * L'adresse déclarée auprès du service de traduction.
 *
 * Anonyme, la limite est de mille mots par jour ; déclarée, elle passe à
 * cinquante mille. C'est la même adresse que celle des mentions légales.
 */
const CONTACT = 'ant.adam468@gmail.com';

/**
 * Longueur maximale d'une requête.
 *
 * Le service refuse au-delà de cinq cents octets. Les descriptions de
 * perturbation les dépassent régulièrement, alors on les découpe par phrases —
 * jamais au milieu d'un mot, ce qui rendrait la traduction absurde.
 */
const MAX_CHUNK = 450;

/** Pause entre deux appels, pour ne pas se faire fermer la porte. */
const CALL_SPACING_MS = 350;

/**
 * Combien de traductions on accepte de demander dans une même page.
 *
 * Personne ne lit trente perturbations d'affilée. Ce plafond n'est pas là pour
 * économiser : il est là pour qu'une erreur d'aiguillage — une condition mal
 * écrite qui rend tout le monde éligible d'un coup — ne se traduise pas par
 * quatre cents appels et un service qui claque la porte pour la journée.
 */
const SESSION_BUDGET = 30;
let spent = 0;

/**
 * Le service a dit non : on se tait un moment.
 *
 * Un « 429 » veut dire qu'on a demandé trop vite ou trop souvent. Continuer
 * d'insister ne fait qu'allonger la punition, et chaque appel refusé compte
 * quand même. On s'arrête donc pour un quart d'heure, en rendant le texte
 * français — qui reste lisible.
 */
const COOLDOWN_MS = 15 * 60 * 1000;
let coolingUntil = 0;

/** Ce qu'on a déjà, dans cette page. */
const memory = new Map<string, string>();
/** Ce qu'on a déjà demandé, pour ne pas le demander deux fois. */
const pending = new Map<string, Promise<string>>();
/** Les textes dont on sait qu'ils sont intraduisibles pour l'instant. */
const failed = new Set<string>();

type Listener = () => void;
const listeners = new Set<Listener>();

/** Prévient les composants qu'une traduction vient d'arriver. */
export function subscribeTranslations(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function announce(): void {
  for (const listener of listeners) listener();
}

/**
 * L'empreinte d'un texte et de sa langue cible.
 *
 * FNV-1a sur 32 bits : court, stable d'une machine à l'autre, et sans
 * dépendance. Une collision donnerait une traduction fausse plutôt qu'une
 * fuite ; la longueur du texte entre dans la clé pour la rendre improbable.
 */
function keyOf(text: string, target: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${target}:${text.length}:${hash.toString(16)}`;
}

/** Découpe un texte long en morceaux traduisibles, aux fins de phrase. */
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

/** Un appel au service de traduction, espacé du précédent. */
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

/** Lit le cache de la base pour une série de clés. */
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
    /* Base injoignable : on traduira, c'est tout. */
  }
  return found;
}

/** Range une traduction, et rafraîchit la date de dernière vue. */
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
    /* L'écriture est un confort : la traduction est déjà en mémoire. */
  }
}

/**
 * Signale que ces traductions servent encore.
 *
 * C'est ce qui les préserve de la purge : une perturbation terminée cesse
 * d'être publiée, donc cesse d'être demandée, et sa ligne finit par s'effacer
 * d'elle-même. On ne supprime jamais depuis un navigateur — il n'affiche que
 * les réseaux qu'il a cochés, et il effacerait le travail fait pour les autres.
 */
async function touch(keys: string[]): Promise<void> {
  if (!supabase || keys.length === 0) return;
  try {
    await supabase
      .from('translations')
      .update({ last_seen_at: new Date().toISOString() })
      .in('key', keys);
  } catch {
    /* Sans conséquence : la purge attend quatorze jours. */
  }
}

/**
 * La traduction d'un texte, si elle existe déjà.
 *
 * Rend `null` quand elle n'est pas encore là — l'appelant affiche alors
 * l'original, et sera prévenu par `subscribeTranslations` quand elle arrivera.
 */
export function cachedTranslation(text: string, target: string): string | null {
  if (!text.trim() || target === SOURCE_LANG) return null;
  return memory.get(keyOf(text, target)) ?? null;
}

/**
 * Demande la traduction d'un texte.
 *
 * Sans effet si elle est déjà connue, déjà demandée, ou déjà tombée en échec
 * dans cette page : on ne s'acharne pas sur un service qui a dit non.
 */
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
