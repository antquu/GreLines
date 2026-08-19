/**
 * Estimation de course Uber.
 *
 * Le jeton reste côté serveur : il autorise des appels facturés au compte du
 * développeur, et un jeton posé dans le bundle serait lisible par n'importe
 * quel visiteur. Le navigateur ne voit que le résultat, déjà normalisé.
 */

const UBER_API_BASE = 'https://api.uber.com/v1.2';

/** Le tarif d'une course ne bouge pas à la seconde ; une minute suffit. */
const CACHE_SECONDS = 60;

function sendJson(response, status, payload, headers = {}) {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
  response.end(JSON.stringify(payload));
}

function readCoordinate(params, name) {
  const value = Number(params.get(name));
  return Number.isFinite(value) ? value : null;
}

/**
 * Uber accepte deux formes d'autorisation selon l'origine du jeton : `Token`
 * pour un jeton serveur, `Bearer` pour un jeton OAuth. Plutôt que d'imposer un
 * réglage de plus, on essaie la seconde forme quand la première est refusée.
 */
async function requestUber(path, token) {
  const schemes = process.env.UBER_AUTH_SCHEME
    ? [process.env.UBER_AUTH_SCHEME]
    : ['Token', 'Bearer'];

  let last = null;
  for (const scheme of schemes) {
    const upstream = await fetch(`${UBER_API_BASE}${path}`, {
      headers: {
        Authorization: `${scheme} ${token}`,
        'Accept-Language': 'fr_FR',
        Accept: 'application/json',
      },
    });
    if (upstream.ok) return upstream;
    last = upstream;
    if (upstream.status !== 401 && upstream.status !== 403) break;
  }
  return last;
}

export default async function handler(request, response) {
  const token = process.env.UBER_API_TOKEN;
  if (!token) {
    // « Mal configuré » et « fournisseur en panne » se soignent à deux endroits
    // différents : autant les distinguer dès la réponse.
    sendJson(response, 501, {
      error: 'Jeton Uber absent',
      detail: 'Définir UBER_API_TOKEN dans les variables d’environnement.',
    });
    return;
  }

  const params = new URL(request.url, 'http://localhost').searchParams;
  const startLatitude = readCoordinate(params, 'startLatitude');
  const startLongitude = readCoordinate(params, 'startLongitude');
  const endLatitude = readCoordinate(params, 'endLatitude');
  const endLongitude = readCoordinate(params, 'endLongitude');

  if (
    startLatitude === null || startLongitude === null ||
    endLatitude === null || endLongitude === null
  ) {
    sendJson(response, 400, {
      error: 'Requête incomplète',
      detail: 'Indiquer startLatitude, startLongitude, endLatitude et endLongitude.',
    });
    return;
  }

  const query = new URLSearchParams({
    start_latitude: String(startLatitude),
    start_longitude: String(startLongitude),
    end_latitude: String(endLatitude),
    end_longitude: String(endLongitude),
  });

  try {
    const upstream = await requestUber(`/estimates/price?${query.toString()}`, token);

    if (!upstream || !upstream.ok) {
      // Jamais le corps de l'erreur amont : il peut refléter la requête, jeton
      // compris selon le mode de journalisation.
      sendJson(response, upstream?.status ?? 502, {
        error: 'Uber a refusé la requête',
        status: upstream?.status ?? 502,
      });
      return;
    }

    const payload = await upstream.json();
    const prices = Array.isArray(payload?.prices) ? payload.prices : [];

    sendJson(
      response,
      200,
      {
        products: prices.map(price => ({
          productId: price?.product_id ?? null,
          displayName: price?.display_name ?? null,
          // `estimate` est déjà mis en forme par Uber dans la devise locale
          // (« 12–15 € ») : c'est la valeur qu'affichent leurs propres écrans.
          estimate: price?.estimate ?? null,
          lowEstimate: typeof price?.low_estimate === 'number' ? price.low_estimate : null,
          highEstimate: typeof price?.high_estimate === 'number' ? price.high_estimate : null,
          currency: price?.currency_code ?? null,
          durationSeconds: typeof price?.duration === 'number' ? price.duration : null,
          distanceMiles: typeof price?.distance === 'number' ? price.distance : null,
        })),
      },
      { 'Cache-Control': `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS * 4}` },
    );
  } catch {
    sendJson(response, 502, { error: 'Uber injoignable' });
  }
}
