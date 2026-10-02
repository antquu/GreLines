import networks from '../src/data/gtfsNetworks.json' with { type: 'json' };

const TTL_MS = { passages: 20_000, alertes: 5 * 60_000 };

const memory = new Map();

function send(response, status, body, headers = {}) {
  response.statusCode = status;
  for (const [key, value] of Object.entries(headers)) response.setHeader(key, value);
  response.end(body);
}

export default async function handler(request, response) {
  const url = new URL(request.url, 'http://localhost');
  const code = url.searchParams.get('reseau');
  const feed = url.searchParams.get('flux');
  const network = networks.find(entry => entry.code === code);
  const target = feed === 'passages' ? network?.tripUpdates : feed === 'alertes' ? network?.alerts : null;

  if (!network || !target) {
    send(response, 404, JSON.stringify({ error: 'Flux inconnu', reseau: code, flux: feed }), {
      'content-type': 'application/json; charset=utf-8',
    });
    return;
  }

  const key = `${code}:${feed}`;
  const cached = memory.get(key);
  try {
    let body = cached && Date.now() < cached.expires ? cached.body : null;
    if (!body) {
      const upstream = await fetch(target, { redirect: 'follow', headers: { 'User-Agent': 'GreLines (temps reel)' } });
      body = upstream.status === 204 ? Buffer.alloc(0) : upstream.ok ? Buffer.from(await upstream.arrayBuffer()) : null;
      if (!body) throw new Error(`HTTP ${upstream.status}`);
      memory.set(key, { body, expires: Date.now() + TTL_MS[feed] });
    }
    send(response, 200, body, {
      'content-type': 'application/octet-stream',
      'Cache-Control': feed === 'passages'
        ? 'public, s-maxage=15, stale-while-revalidate=30'
        : 'public, s-maxage=300, stale-while-revalidate=600',
    });
  } catch {
    send(response, 502, JSON.stringify({ error: 'Réseau injoignable', reseau: code }), {
      'content-type': 'application/json; charset=utf-8',
    });
  }
}
