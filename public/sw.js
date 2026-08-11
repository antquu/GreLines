




















const VERSION = 'v2';
const STATIC_CACHE = `grelines-static-${VERSION}`;
const TILE_CACHE = `grelines-tiles-${VERSION}`;

const TILE_MAX_ENTRIES = 800;
const TILE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(STATIC_CACHE));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('grelines-') && name !== STATIC_CACHE && name !== TILE_CACHE)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

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
