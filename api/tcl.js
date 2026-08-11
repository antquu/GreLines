

















const SIRI_BASE = 'https://data.grandlyon.com/siri-lite/2.0';


const RDATA_BASE = 'https://data.grandlyon.com/fr/datapusher/ws/rdata';








const ALLOWED_DATASET_PREFIX = 'tcl_sytral.';


const WFS_BASE = 'https://download.data.grandlyon.com/wfs/rdata';








const LINE_LAYERS = [
  'tcl_sytral.tcllignebus_2_0_0',
  'tcl_sytral.tcllignetram_2_0_0',
  'tcl_sytral.tcllignemf_2_0_0',
];

const STOP_LAYER = 'tcl_sytral.tclarret';


const LINE_FIELDS = 'ligne,code_ligne,couleur_hex,couleur,famille_transport,code_type_ligne,nom_trace,sens,nom_origine,nom_destination';









function publicLineCode(properties) {
  const label = String(properties?.ligne ?? '').trim();
  if (label) return label;
  return String(properties?.code_ligne ?? '').trim();
}

function wfsUrl(layer, extra = '') {
  const params = new URLSearchParams({
    SERVICE: 'WFS',
    VERSION: '2.0.0',
    request: 'GetFeature',
    outputFormat: 'application/json',
    SRSNAME: 'EPSG:4326',
    typename: layer,
  });
  return `${WFS_BASE}?${params}${extra}`;
}

/** « 140 54 140 » → « #8c368c ». Le WFS donne du RVB séparé par des espaces. */
function rgbToHex(value) {
  const parts = String(value ?? '').trim().split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return null;
  return '#' + parts.map(n => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')).join('');
}

/** Famille TCL → mode d'affichage de l'application. */
function familyToMode(family) {
  switch (String(family ?? '').toUpperCase()) {
    case 'TRA': return 'TRAM';
    case 'MET': return 'METRO';
    // Un funiculaire est plus proche du tramway que du métro : voie unique,
    // parcours court, et personne ne l'appelle un métro.
    case 'FUN': return 'TRAM';
    default: return 'BUS';
  }
}

/**
 * Flux autorisés.
 *
 * Une liste fermée, et non un chemin libre : sans elle, la fonction devient un
 * proxy ouvert que n'importe qui peut utiliser pour interroger le fournisseur
 * en notre nom, avec nos identifiants et sur notre quota.
 */
const ALLOWED_FEEDS = new Set([
  'stop-monitoring',
  'estimated-timetables',
  'vehicle-monitoring',
  'situation-exchange',
]);

/**
 * Durée de mise en cache par flux, en secondes.
 *
 * Le temps réel se périme en quelques dizaines de secondes ; les perturbations
 * bien plus lentement. `stale-while-revalidate` laisse servir la version
 * précédente pendant qu'on rafraîchit, pour qu'une requête lente ne se voie
 * jamais à l'écran.
 */
const CACHE_SECONDS = {
  'stop-monitoring': 20,
  'estimated-timetables': 20,
  'vehicle-monitoring': 15,
  'situation-exchange': 300,
  // Lignes, arrêts et horaires théoriques changent au changement de service.
  dataset: 3600,
};

/**
 * Reconnaît un code de ligne scolaire.
 *
 * TCL n'étiquette pas ces lignes ; leur code les trahit — une ou deux lettres
 * suivies de chiffres (`JD133`, `S12`), là où une ligne régulière est un nombre
 * seul, un `C`/`T` suivi d'un nombre, une lettre de métro ou un funiculaire.
 * Elles sont les trois quarts du réseau au nombre de codes, et ne circulent que
 * deux fois par jour : les distinguer permet de ne pas en encombrer la carte.
 */
function isSchoolLineByCode(code) {
  if (/^\d+$/.test(code)) return false;
  if (/^[CT]\d+$/.test(code)) return false;
  if (/^[A-D]$/.test(code)) return false;
  if (/^F\d$/.test(code)) return false;
  return true;
}

/**
 * Nature d'une ligne, d'après le fournisseur quand il la déclare.
 *
 * `code_type_ligne` vaut `SCO` pour les services scolaires, `REG` pour les
 * lignes régulières, plus quelques cas particuliers (`EVE`, `PRT`, `TAD`). Il
 * est bien plus fiable que la forme du code : l'heuristique classait comme
 * scolaires les lignes de nuit (`N83`), les navettes (`S1`), les dessertes de
 * zones industrielles (`ZI4`) — 58 lignes régulières écartées à tort.
 *
 * Le champ est vide sur les enregistrements les plus anciens : l'heuristique
 * reste alors le seul recours.
 */
function isSchoolLine(code, declaredType) {
  const type = String(declaredType ?? '').trim().toUpperCase();
  if (type === 'SCO') return true;
  if (type) return false;
  return isSchoolLineByCode(code);
}

/**
 * Catalogue des lignes.
 *
 * Deux sources, et aucune ne suffit seule :
 *
 *  - la **desserte des arrêts** dit ce qui circule réellement — c'est la seule
 *    source fidèle, mais elle ne donne ni couleur ni terminus ;
 *  - les **couches de tracés** donnent couleur, mode et terminus, mais elles
 *    contiennent des codes de tracé internes (438 codes n'apparaissent sur
 *    aucun arrêt) et il leur manque 39 lignes régulières.
 *
 * On part donc des arrêts et on enrichit avec les tracés quand ils existent.
 * `hasShape` dit franchement si la ligne pourra être dessinée, plutôt que de
 * laisser l'appelant le découvrir par une carte vide.
 */
async function buildLines(authorization) {
  const traced = new Map();

  for (const layer of LINE_LAYERS) {
    const response = await fetch(wfsUrl(layer, `&propertyName=${LINE_FIELDS}`), {
      headers: { Authorization: authorization },
    });
    if (!response.ok) continue;
    const collection = await response.json();

    for (const feature of collection.features ?? []) {
      const p = feature.properties ?? {};
      const code = publicLineCode(p);
      if (!code) continue;

      const existing = traced.get(code) ?? {
        // Le fournisseur publie la couleur en hexadécimal ; le RVB séparé par
        // des espaces n'est qu'un repli pour les enregistrements anciens.
        color: String(p.couleur_hex ?? '').trim().toLowerCase() || rgbToHex(p.couleur),
        mode: familyToMode(p.famille_transport),
        declaredType: p.code_type_ligne ?? null,
        terminuses: [],
      };
      for (const name of [p.nom_origine, p.nom_destination]) {
        const label = String(name ?? '').trim();
        if (label && !existing.terminuses.includes(label)) existing.terminuses.push(label);
      }
      traced.set(code, existing);
    }
  }

  const stops = await cached('arrets', MEMORY_TTL.catalog, () => buildStops(authorization));
  const served = new Map();
  for (const stop of stops ?? []) {
    for (const code of stop.lines) {
      served.set(code, (served.get(code) ?? 0) + 1);
    }
  }

  const lines = [];
  for (const [code, stopCount] of served) {
    const shape = traced.get(code);
    lines.push({
      code,
      color: shape?.color ?? null,
      mode: shape?.mode ?? 'BUS',
      terminuses: shape?.terminuses ?? [],
      stopCount,
      hasShape: Boolean(shape),
      school: isSchoolLine(code, shape?.declaredType),
    });
  }

  // Tri naturel : « 2 » avant « 10 », et les lettres après les chiffres.
  return lines.sort((a, b) => a.code.localeCompare(b.code, 'fr', { numeric: true }));
}

/**
 * Arrêts, réduits à ce que la carte dessine.
 *
 * La couche brute pèse 5,3 Mo pour 9 858 arrêts, dont adresse, accessibilité et
 * horodatages de mise à jour. On n'en garde que l'identité, la position et les
 * lignes desservies — le reste se demandera à l'ouverture d'un arrêt.
 */
async function buildStops(authorization) {
  const response = await fetch(wfsUrl(STOP_LAYER), { headers: { Authorization: authorization } });
  if (!response.ok) return null;
  const collection = await response.json();

  const stops = [];
  for (const feature of collection.features ?? []) {
    const p = feature.properties ?? {};
    const coordinates = feature.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) continue;

    // « 145:A,87:A » — code de ligne et sens. Seul le code nous intéresse ici.
    const served = String(p.desserte ?? '')
      .split(',')
      .map(entry => entry.split(':')[0].trim())
      .filter(Boolean);

    stops.push({
      id: String(p.id ?? ''),
      name: String(p.nom ?? ''),
      lon: Number(coordinates[0].toFixed(6)),
      lat: Number(coordinates[1].toFixed(6)),
      city: String(p.commune ?? ''),
      lines: [...new Set(served)],
    });
  }
  return stops;
}

/**
 * Tracé d'une seule ligne.
 *
 * Le filtre WFS est indispensable : la couche des bus fait 26 Mo, une ligne en
 * fait vingt kilo-octets. On la demande donc au serveur, jamais au navigateur.
 */
async function buildShape(authorization, lineCode) {
  // Même champ que la jointure du catalogue : filtrer sur `code_ligne` ne
  // trouvait rien pour les lignes périurbaines, dont le code public vit dans
  // `ligne`. On accepte les deux, le fournisseur ne remplissant pas toujours
  // les mêmes champs selon l'ancienneté de l'enregistrement.
  const safe = lineCode.replace(/[<>&'"]/g, '');
  const filter = '<Filter xmlns="http://www.opengis.net/fes/2.0"><Or>'
    + `<PropertyIsEqualTo><ValueReference>ligne</ValueReference><Literal>${safe}</Literal></PropertyIsEqualTo>`
    + `<PropertyIsEqualTo><ValueReference>code_ligne</ValueReference><Literal>${safe}</Literal></PropertyIsEqualTo>`
    + '</Or></Filter>';

  const segments = [];
  for (const layer of LINE_LAYERS) {
    const response = await fetch(wfsUrl(layer, `&FILTER=${encodeURIComponent(filter)}`), {
      headers: { Authorization: authorization },
    });
    if (!response.ok) continue;
    const collection = await response.json();

    for (const feature of collection.features ?? []) {
      const geometry = feature.geometry;
      if (!geometry) continue;
      const parts = geometry.type === 'MultiLineString'
        ? geometry.coordinates
        : geometry.type === 'LineString' ? [geometry.coordinates] : [];
      for (const part of parts) segments.push(part);
    }
    if (segments.length > 0) break; // Une ligne n'appartient qu'à une famille.
  }

  return segments.length > 0 ? { code: lineCode, segments } : null;
}

/**
 * Prochains passages à un ou plusieurs arrêts.
 *
 * Plusieurs, parce qu'un arrêt de l'application regroupe les quais que TCL
 * publie séparément : « Bellecour A. Poncet » en compte cinq. Interroger le
 * groupe d'un coup évite au navigateur autant d'allers-retours.
 *
 * `type` distingue l'horaire théorique (`T`) du temps réel estimé (`E`) — c'est
 * ce qui permet d'afficher la pastille « en direct » à bon escient.
 */
async function buildDepartures(authorization, stopIds) {
  const results = await Promise.all(stopIds.map(async id => {
    const url = `${RDATA_BASE}/tcl_sytral.tclpassagearret/all.json?field=id&value=${encodeURIComponent(id)}`;
    try {
      const response = await fetch(url, { headers: { Authorization: authorization } });
      if (!response.ok) return [];
      const payload = await response.json();
      return Array.isArray(payload?.values) ? payload.values : [];
    } catch {
      return [];
    }
  }));

  const now = Date.now();
  const departures = [];
  const seen = new Set();

  for (const row of results.flat()) {
    const line = String(row.ligne ?? '').trim();
    const destination = String(row.direction ?? '').trim();
    if (!line) continue;

    // « 2026-08-10 17:44:00 » — heure locale, sans fuseau. On la lit comme
    // telle : le réseau et l'usager sont dans le même.
    const stamp = String(row.heurepassage ?? '').replace(' ', 'T');
    const time = Date.parse(stamp);
    if (!Number.isFinite(time)) continue;

    const minutes = Math.round((time - now) / 60000);
    // Un passage déjà parti n'a plus rien à dire ; la marge d'une minute
    // absorbe l'écart entre l'horloge du serveur et celle du fournisseur.
    if (minutes < -1) continue;

    const key = `${line}|${destination}|${stamp}`;
    if (seen.has(key)) continue;
    seen.add(key);

    departures.push({
      line,
      destination,
      minutes: Math.max(0, minutes),
      realtime: String(row.type ?? '').toUpperCase() === 'E',
    });
  }

  return departures.sort((a, b) => a.minutes - b.minutes);
}

/**
 * Mémoire de l'instance.
 *
 * Les en-têtes `Cache-Control` ne servent qu'au cache d'un intermédiaire ; ils
 * ne font rien pour deux requêtes qui arrivent avant qu'il n'ait mémorisé quoi
 * que ce soit — ni en développement, où il n'y a aucun intermédiaire.
 *
 * Or construire le catalogue coûte cher : lire trois couches de tracés, puis la
 * couche des 9 858 arrêts. Le refaire à chaque visiteur était le principal
 * facteur de lenteur. On garde donc le résultat ici, et surtout la **promesse**
 * en cours : dix requêtes simultanées ne déclenchent qu'un seul calcul.
 */
const inMemory = new Map();

function cached(key, ttlMs, produce) {
  const entry = inMemory.get(key);
  if (entry && Date.now() < entry.expires) return entry.value;

  const value = produce();
  inMemory.set(key, { value, expires: Date.now() + ttlMs });

  // Un échec ne se garde pas : la requête suivante doit pouvoir réessayer.
  Promise.resolve(value).then(
    result => { if (result === null || result === undefined) inMemory.delete(key); },
    () => inMemory.delete(key),
  );
  return value;
}

/** Durées de mémorisation, en millisecondes. */
const MEMORY_TTL = {
  catalog: 60 * 60 * 1000,
  shape: 24 * 60 * 60 * 1000,
  departures: 15 * 1000,
};

/** Réponse JSON, en API Node brute : la même fonction sert Vercel et Vite. */
function sendJson(response, status, payload, headers = {}) {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
  response.end(JSON.stringify(payload));
}

export default async function handler(request, response) {
  const username = process.env.GRANDLYON_USERNAME;
  const password = process.env.GRANDLYON_PASSWORD;

  if (!username || !password) {
    // On distingue « mal configuré » de « fournisseur en panne » : les deux
    // donneraient sinon la même page vide, et on chercherait du mauvais côté.
    sendJson(response, 500, {
      error: 'Identifiants Grand Lyon absents',
      detail: 'Définir GRANDLYON_USERNAME et GRANDLYON_PASSWORD dans les variables d’environnement.',
    });
    return;
  }

  const url = new URL(request.url, 'http://localhost');
  const feed = url.searchParams.get('flux');
  const dataset = url.searchParams.get('dataset');

  // Tout le reste de la requête est retransmis : les filtres (ligne, arrêt,
  // horizon, pagination) sont l'affaire de l'appelant, pas du proxy.
  const forwarded = new URLSearchParams(url.searchParams);
  forwarded.delete('flux');
  forwarded.delete('dataset');
  forwarded.delete('ressource');
  forwarded.delete('ligne');
  forwarded.delete('arret');
  const query = forwarded.size > 0 ? `?${forwarded}` : '';

  const resource = url.searchParams.get('ressource');
  const credentialsHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  
  
  if (resource) {
    try {
      let payload = null;
      if (resource === 'lignes') {
        payload = await cached('lignes', MEMORY_TTL.catalog, () => buildLines(credentialsHeader));
      } else if (resource === 'arrets') {
        payload = await cached('arrets', MEMORY_TTL.catalog, () => buildStops(credentialsHeader));
      }
      else if (resource === 'passages') {
        const stops = (url.searchParams.get('arret') ?? '')
          .split(',')
          .map(value => value.trim())
          .filter(value => /^\d+$/.test(value))
          .slice(0, 12);
        if (stops.length === 0) {
          sendJson(response, 400, { error: 'Paramètre « arret » attendu (identifiants numériques)' });
          return;
        }
        const departures = await cached(
          `passages:${stops.join(',')}`,
          MEMORY_TTL.departures,
          () => buildDepartures(credentialsHeader, stops),
        );
        // Le temps réel ne se met pas en cache comme un catalogue.
        sendJson(response, 200, departures, {
          'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=40',
        });
        return;
      }
      else if (resource === 'trace') {
        const line = url.searchParams.get('ligne');
        if (!line) {
          sendJson(response, 400, { error: 'Paramètre « ligne » attendu' });
          return;
        }
        payload = await cached(
          `trace:${line}`,
          MEMORY_TTL.shape,
          () => buildShape(credentialsHeader, line),
        );
      } else {
        sendJson(response, 400, {
          error: 'Ressource inconnue',
          allowed: ['lignes', 'arrets', 'trace', 'passages'],
        });
        return;
      }

      if (!payload) {
        sendJson(response, 404, { error: 'Ressource introuvable', ressource: resource });
        return;
      }

      sendJson(response, 200, payload, {
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
      });
    } catch {
      sendJson(response, 502, { error: 'Fournisseur injoignable', ressource: resource });
    }
    return;
  }

  let target;
  let cacheKey;

  if (dataset) {
    if (!dataset.startsWith(ALLOWED_DATASET_PREFIX)) {
      sendJson(response, 400, {
        error: 'Jeu de données non autorisé',
        detail: `Seuls les jeux « ${ALLOWED_DATASET_PREFIX}* » sont servis.`,
      });
      return;
    }
    target = `${RDATA_BASE}/${dataset}/all.json${query}`;
    cacheKey = 'dataset';
  } else if (feed && ALLOWED_FEEDS.has(feed)) {
    target = `${SIRI_BASE}/${feed}.json${query}`;
    cacheKey = feed;
  } else {
    sendJson(response, 400, {
      error: 'Requête incomplète',
      detail: 'Indiquer « flux » (temps réel) ou « dataset » (données de référence).',
      flux: [...ALLOWED_FEEDS],
    });
    return;
  }
  try {
    const upstream = await fetch(target, {
      headers: {
        Authorization: credentialsHeader,
        Accept: 'application/json',
      },
    });

    if (!upstream.ok) {
      // On ne renvoie jamais le corps de l'erreur amont tel quel : il peut
      // contenir l'URL complète, identifiants compris.
      sendJson(response, upstream.status, {
        error: 'Le fournisseur a refusé la requête',
        status: upstream.status,
        source: cacheKey,
      });
      return;
    }

    const payload = await upstream.json();
    const maxAge = CACHE_SECONDS[cacheKey] ?? 30;

    sendJson(response, 200, payload, {
      'Cache-Control': `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 4}`,
    });
  } catch {
    sendJson(response, 502, { error: 'Fournisseur injoignable', source: cacheKey });
  }
}
