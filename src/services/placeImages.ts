/**
 * Les photographies des lieux, servies selon ce que la ligne peut porter.
 *
 * Une image de sept mégaoctets ouverte en 3G, c'est un écran noir pendant une
 * demi-minute. On en tient donc deux versions : une petite, de quelques
 * dizaines de kilooctets, qui s'affiche tout de suite, et la vraie, qui se
 * télécharge pendant qu'on regarde. Quand elle arrive, elle prend la place —
 * et comme le service worker la garde, elle ne se redemande jamais.
 *
 * Sur une bonne connexion, rien de tout cela ne se voit : la vraie image part
 * d'emblée, et la petite ne sert pas.
 */

/**
 * Les images déjà obtenues, notées d'une session à l'autre.
 *
 * Le service worker met `/assets/` en cache d'abord, si bien qu'une image
 * obtenue une fois est servie du disque ensuite. Cette liste ne fait que le
 * dire à l'avance : sans elle, on repartirait de la petite version à chaque
 * lancement, le temps de vérifier — et l'on verrait l'image se préciser sous
 * les yeux alors qu'elle était déjà là.
 */
const STORE_KEY = 'grelines.placeImages.full';

/** Le format d'une photographie : la vraie, et celle qui la remplace en attendant. */
export interface PlaceImageSet {
  full: string;
  low: string;
}

/**
 * La petite version se déduit du nom de la grande.
 *
 * Les fichiers vont par paires — `bastille.jpg` et `bastille-low.jpg` —, et
 * les nommer deux fois dans la liste des lieux n'aurait fait qu'ouvrir la
 * possibilité de les dépareiller.
 */
export function placeImageSet(full: string): PlaceImageSet {
  return { full, low: full.replace(/\.(jpe?g|png|webp)$/i, '-low.$1') };
}

function readStore(): Set<string> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Tenue en mémoire autant qu'au disque : la lire à chaque image serait absurde. */
let stored: Set<string> | null = null;

function store(): Set<string> {
  if (!stored) stored = readStore();
  return stored;
}

export function hasFullImage(src: string): boolean {
  return store().has(src);
}

function markFullImage(src: string): void {
  const set = store();
  if (set.has(src)) return;
  set.add(src);
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify([...set]));
  } catch {
    /* Mode privé, quota plein : on garde la note en mémoire pour la session. */
  }
}

interface NetworkInformation {
  effectiveType?: string;
  saveData?: boolean;
  downlink?: number;
}

function connection(): NetworkInformation | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { connection?: NetworkInformation }).connection;
}

/**
 * La ligne est-elle trop courte pour une grande image ?
 *
 * Trois signes, dans cet ordre : l'économiseur de données, que l'on respecte
 * sans discuter ; le type de réseau annoncé, qui vaut ce qu'il vaut mais
 * distingue au moins la 3G du reste ; et le débit estimé, en dernier recours.
 *
 * Un navigateur qui ne dit rien — Safari n'a pas cette interface — est réputé
 * rapide. C'est le pari le moins coûteux : sur une bonne ligne, on aurait
 * dégradé l'image pour rien, et sur une mauvaise, on perd quelques secondes
 * une seule fois, après quoi l'image est en cache.
 */
export function isNarrowConnection(): boolean {
  const info = connection();
  if (!info) return false;
  if (info.saveData) return true;
  if (info.effectiveType && /^(slow-2g|2g|3g)$/.test(info.effectiveType)) return true;
  return typeof info.downlink === 'number' && info.downlink > 0 && info.downlink < 1.5;
}

/**
 * Par où commencer pour cette image.
 *
 * Déjà obtenue : la vraie, sans détour — elle est au cache, elle ne coûte
 * rien. Sinon, la petite si la ligne est courte, la vraie autrement.
 */
export function initialPlaceSrc(set: PlaceImageSet): string {
  if (hasFullImage(set.full)) return set.full;
  return isNarrowConnection() ? set.low : set.full;
}

/** Les téléchargements déjà lancés, pour ne pas en lancer deux fois le même. */
const inFlight = new Map<string, Promise<void>>();

/**
 * Obtenir la vraie image, une fois pour toutes.
 *
 * On la demande par `fetch` plutôt qu'en la posant dans une balise : le
 * service worker l'intercepte et la range dans son cache d'actifs, d'où elle
 * sera servie ensuite sans réseau. La balise, elle, ne reçoit son adresse
 * qu'après — l'image y apparaît alors d'un coup, déjà complète.
 */
export function fetchFullImage(src: string): Promise<void> {
  if (hasFullImage(src)) return Promise.resolve();
  const running = inFlight.get(src);
  if (running) return running;

  const task = fetch(src, { cache: 'force-cache' })
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      /* Le corps est lu jusqu'au bout : une réponse laissée en suspens n'est
         pas mise en cache par le service worker. */
      return response.blob();
    })
    .then(() => {
      markFullImage(src);
    })
    .catch(() => {
      /* Réseau coupé, image absente : on garde la petite version et l'on
         réessaiera au prochain passage. Rien à signaler à qui regarde. */
    })
    .finally(() => {
      inFlight.delete(src);
    });

  inFlight.set(src, task);
  return task;
}

/**
 * Le téléchargement de fond.
 *
 * Les images partent une par une, dans les moments où le navigateur n'a rien
 * d'autre à faire : c'est du temps qu'on prend pendant que l'utilisateur lit
 * ses horaires, pas au moment où il ouvre une photographie. Les lancer toutes
 * ensemble aurait encombré la ligne qu'on essaie précisément de ménager.
 *
 * Rend de quoi tout arrêter — quitter l'écran annule ce qui n'est pas parti.
 */
export function prefetchFullImages(sources: string[]): () => void {
  let cancelled = false;
  let handle: number | undefined;

  const idle = (run: () => void) => {
    const request = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
      .requestIdleCallback;
    handle = request ? request(run, { timeout: 4000 }) : window.setTimeout(run, 1200);
  };

  const next = (index: number) => {
    if (cancelled || index >= sources.length) return;
    const src = sources[index];
    if (hasFullImage(src)) {
      next(index + 1);
      return;
    }
    idle(() => {
      if (cancelled) return;
      void fetchFullImage(src).then(() => next(index + 1));
    });
  };

  next(0);

  return () => {
    cancelled = true;
    const cancel = (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
    if (handle === undefined) return;
    if (cancel) cancel(handle);
    else window.clearTimeout(handle);
  };
}
