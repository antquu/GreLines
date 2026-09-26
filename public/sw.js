




















const VERSION = 'v2';
const STATIC_CACHE = `grelines-static-${VERSION}`;
const TILE_CACHE = `grelines-tiles-${VERSION}`;
/* La page elle-même et les petits fichiers de données publics. */
const SHELL_CACHE = 'grelines-shell-v1';

/* Assez pour le fond de carte gardé d'avance et ce qu'on parcourt ensuite. */
const TILE_MAX_ENTRIES = 2000;
const TILE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/* Les fichiers publics que l'application lit au démarrage. */
const SHELL_DATA = ['/grelines.json', '/accessible-stops.json'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(precacheApp());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('grelines-')
            && name !== STATIC_CACHE && name !== TILE_CACHE && name !== SHELL_CACHE)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

/**
 * Garde toute l'application sur l'appareil.
 *
 * Jusqu'ici, seuls les fichiers déjà ouverts étaient gardés : une page jamais
 * visitée (la fiche horaire, le portefeuille) manquait hors connexion, et la
 * page d'accueil elle-même n'était pas gardée du tout. Sans réseau, rien ne
 * s'ouvrait.
 *
 * La construction publie la liste de ses fichiers ; on la lit, et l'on garde
 * chaque script et chaque feuille de style qui n'y est pas encore. Les images
 * restent gardées à mesure qu'on les voit. Les scripts de l'ancienne version
 * sont retirés au passage : leurs noms changent à chaque version.
 *
 * Relancé à chaque ouverture en ligne, au plus une fois par heure, pour
 * suivre les mises en ligne sans attendre un nouveau service worker.
 */
let lastPrecache = 0;
const PRECACHE_EVERY_MS = 60 * 60 * 1000;

async function precacheApp() {
  lastPrecache = Date.now();
  try {
    const shell = await caches.open(SHELL_CACHE);
    const page = await fetch('/', { cache: 'no-cache' });
    if (page.ok) await shell.put('/', await storable(page));
    await Promise.all(SHELL_DATA.map(async (path) => {
      try {
        const response = await fetch(path, { cache: 'no-cache' });
        if (response.ok) await shell.put(path, response);
      } catch {
      }
    }));

    const manifestResponse = await fetch('/asset-manifest.json', { cache: 'no-cache' });
    if (!manifestResponse.ok) return;
    let manifest;
    try {
      manifest = await manifestResponse.json();
    } catch {
      /* En développement, l'adresse rend la page : pas de liste à lire. */
      return;
    }

    const wanted = new Set();
    for (const entry of Object.values(manifest)) {
      if (!entry || typeof entry !== 'object') continue;
      if (typeof entry.file === 'string' && /\.(js|css)$/.test(entry.file)) wanted.add(`/${entry.file}`);
      for (const css of entry.css || []) wanted.add(`/${css}`);
    }

    const cache = await caches.open(STATIC_CACHE);
    const keys = await cache.keys();
    const present = new Set(keys.map((request) => new URL(request.url).pathname));

    /* Les scripts d'une version passée : plus aucune page ne les demandera. */
    await Promise.all(keys
      .filter((request) => {
        const path = new URL(request.url).pathname;
        return path.startsWith('/assets/') && /\.(js|css)$/.test(path) && !wanted.has(path);
      })
      .map((request) => cache.delete(request)));

    const missing = [...wanted].filter((path) => !present.has(path));
    for (let index = 0; index < missing.length; index += 4) {
      await Promise.all(missing.slice(index, index + 4).map(async (path) => {
        try {
          const response = await fetch(path);
          if (response.ok) await cache.put(path, response);
        } catch {
        }
      }));
    }
  } catch {
  }
}

/**
 * La page : le réseau d'abord, pour avoir toujours la dernière version, et la
 * copie gardée quand il ne répond pas. Toutes les adresses de l'application
 * servent la même page ; la copie de « / » vaut donc pour toutes.
 */
/**
 * Une réponse qu'on peut resservir à une navigation. Une réponse issue d'une
 * redirection est refusée par le navigateur quand elle revient du cache : on
 * en recopie le contenu dans une réponse neuve.
 */
async function storable(response) {
  if (!response.redirected) return response;
  return new Response(await response.blob(), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

/* Un réseau qui ne répond pas est pire qu'un réseau absent : passé ce délai,
   la copie gardée s'affiche, et la vraie page la remplacera au prochain
   chargement. */
const PAGE_TIMEOUT_MS = 4000;

async function networkFirstPage(request, waitUntil) {
  const cachedPage = () => caches.match('/', { cacheName: SHELL_CACHE });

  const network = fetch(request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      waitUntil(caches.open(SHELL_CACHE)
        .then(async (cache) => cache.put('/', await storable(copy)))
        .catch(() => {}));
      if (Date.now() - lastPrecache > PRECACHE_EVERY_MS) waitUntil(precacheApp());
    }
    return response;
  });
  waitUntil(network.catch(() => {}));

  const timeout = new Promise((resolve) => setTimeout(resolve, PAGE_TIMEOUT_MS, null));
  try {
    const winner = await Promise.race([network, timeout]);
    if (winner) return winner;
    const cached = await cachedPage();
    return cached || network;
  } catch (error) {
    const cached = await cachedPage();
    if (cached) return cached;
    throw error;
  }
}

/** Les données publiques : la copie gardée tout de suite, rafraîchie derrière. */
async function staleWhileRevalidate(request, waitUntil) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok) void cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  if (cached) {
    waitUntil(refresh);
    return cached;
  }
  const response = await refresh;
  if (response) return response;
  return Response.error();
}

function isTileRequest(url) {
  return url.hostname === 'api.maptiler.com';
}

function isStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  return (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/fonts/') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.png')
  );
}

/**
 * Supprime les entrées les plus anciennes quand le cache dépasse la limite.
 *
 * Le Cache Storage ne conserve pas de date : on évince les premières entrées,
 * l'ordre d'insertion étant préservé par la spécification.
 *
 * Appelé rarement, et jamais sur le trajet d'une tuile : `cache.keys()` énumère
 * jusqu'à huit cents entrées. Le faire après chaque mise en cache — donc des
 * dizaines de fois pendant un zoom — retardait l'affichage des rues bien plus
 * sûrement que le rendu lui-même.
 */
let putsSinceTrim = 0;
const TRIM_EVERY_N_PUTS = 100;

async function trimTileCache() {
  const cache = await caches.open(TILE_CACHE);
  const keys = await cache.keys();
  if (keys.length <= TILE_MAX_ENTRIES) return;
  const excess = keys.length - TILE_MAX_ENTRIES;
  await Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)));
}

function maybeTrim() {
  putsSinceTrim += 1;
  if (putsSinceTrim < TRIM_EVERY_N_PUTS) return;
  putsSinceTrim = 0;
  void trimTileCache();
}

function isExpired(response) {
  const dateHeader = response.headers.get('date');
  if (!dateHeader) return false;
  const age = Date.now() - new Date(dateHeader).getTime();
  return Number.isFinite(age) && age > TILE_MAX_AGE_MS;
}

/**
 * Range une réponse sans faire attendre celui qui l'a demandée.
 *
 * Écrire dans le Cache Storage touche le disque. Attendre cette écriture avant
 * de rendre la tuile ajoutait sa latence à chaque tuile de chaque déplacement,
 * pour un bénéfice nul : le contenu est déjà en main.
 */
function storeInBackground(cacheName, request, response, options) {
  if (!response.ok || response.type === 'opaque') return;
  const copy = response.clone();
  const write = caches
    .open(cacheName)
    .then((cache) => cache.put(request, copy))
    .then(() => { if (options && options.trim) options.trim(); })
    .catch(() => {});
  // `waitUntil` garde le worker en vie le temps de l'écriture, sans retenir la
  // réponse.
  if (options && options.waitUntil) options.waitUntil(write);
}

async function cacheFirst(request, cacheName, options = {}) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  if (cached) {
    if (!(options.checkExpiry && isExpired(cached))) return cached;

    // Périmée mais présente : on la rend tout de suite et on rafraîchit
    // derrière. Une tuile d'une semaine dessine les mêmes rues qu'aujourd'hui —
    // attendre le réseau pour s'en assurer, c'est l'attente que l'on voit.
    const refresh = fetch(request)
      .then((response) => {
        storeInBackground(cacheName, request, response, options);
        return response;
      })
      .catch(() => null);
    if (options.waitUntil) options.waitUntil(refresh);
    return cached;
  }

  try {
    const response = await fetch(request);
    storeInBackground(cacheName, request, response, options);
    return response;
  } catch (error) {
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  const waitUntil = (promise) => event.waitUntil(promise);

  if (request.mode === 'navigate' && url.origin === self.location.origin && !url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstPage(request, waitUntil));
    return;
  }

  if (url.origin === self.location.origin && SHELL_DATA.includes(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, waitUntil));
    return;
  }

  if (isTileRequest(url)) {
    event.respondWith(cacheFirst(request, TILE_CACHE, {
      checkExpiry: true,
      trim: maybeTrim,
      waitUntil,
    }));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE, { waitUntil }));
  }
});
