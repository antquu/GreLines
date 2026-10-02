const ALLOWED_HOSTS = new Set([
  'www.tag.fr',
  'tag.fr',
  'www.reso-m.fr',
  'reso-m.fr',
  'www.mobilites-m.fr',
  'mobilites-m.fr',
  'data.mobilites-m.fr',
]);

const MAX_BYTES = 25 * 1024 * 1024;

function fail(response, status, message) {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify({ error: message }));
}

export default async function handler(request, response) {
  const requested = new URL(request.url, 'http://localhost').searchParams.get('url');
  let target;
  try {
    target = new URL(requested ?? '');
  } catch {
    fail(response, 400, 'Adresse attendue : ?url=');
    return;
  }
  if (target.protocol !== 'https:' || !ALLOWED_HOSTS.has(target.hostname)) {
    fail(response, 403, 'Site non autorisé');
    return;
  }

  try {
    const upstream = await fetch(target.toString(), { redirect: 'follow' });
    if (!upstream.ok) {
      fail(response, upstream.status, 'Plan introuvable');
      return;
    }
    const finalHost = new URL(upstream.url).hostname;
    if (!ALLOWED_HOSTS.has(finalHost)) {
      fail(response, 403, 'Redirection vers un site non autorisé');
      return;
    }
    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.length > MAX_BYTES) {
      fail(response, 413, 'Fichier trop lourd');
      return;
    }
    if (buffer.subarray(0, 4).toString('latin1') !== '%PDF') {
      fail(response, 415, 'Ce n’est pas un PDF');
      return;
    }
    response.statusCode = 200;
    response.setHeader('content-type', 'application/pdf');
    response.setHeader('cache-control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    response.end(buffer);
  } catch {
    fail(response, 502, 'Site du réseau injoignable');
  }
}
