const PAGE_URL = 'https://www.reseau-stan.com/se-deplacer/infos-trafic';

const TTL_MS = 5 * 60 * 1000;

let memory = null;

const decodeEntities = text => text
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#0?39;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));

function parseAlerts(html) {
  const alerts = [];
  const items = html.match(/<li class="infotrafic-ligne[\s\S]*?<\/li>(?=<li class="infotrafic-ligne|<\/ul><\/div>)/g) ?? [];
  for (const item of items) {
    const lines = [...item.matchAll(/<span[^>]*class="ui-ligne[^"]*"[^>]*>([^<]*)<\/span>/g)]
      .map(match => decodeEntities(match[1]).trim())
      .filter(Boolean);
    const title = decodeEntities(item.match(/<span class="section-titre">([^<]*)<\/span>/)?.[1] ?? '').trim();
    const body = item.split(/<span class="section-titre">[^<]*<\/span>/)[1] ?? '';
    const message = decodeEntities(body.replace(/<\/li>$/, '')).trim();
    if (lines.length > 0 && (title || message)) alerts.push({ lignes: [...new Set(lines)], titre: title, message });
  }
  return alerts;
}

async function loadAlerts() {
  const response = await fetch(PAGE_URL, { headers: { 'User-Agent': 'GreLines (infos trafic)' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return parseAlerts(await response.text());
}

function sendJson(response, status, payload, headers = {}) {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  for (const [key, value] of Object.entries(headers)) response.setHeader(key, value);
  response.end(JSON.stringify(payload));
}

export default async function handler(request, response) {
  const url = new URL(request.url, 'http://localhost');
  if (url.searchParams.get('ressource') !== 'alertes') {
    sendJson(response, 400, { error: 'Ressource inconnue', allowed: ['alertes'] });
    return;
  }

  try {
    if (!memory || Date.now() > memory.expires) {
      memory = { value: await loadAlerts(), expires: Date.now() + TTL_MS };
    }
    sendJson(response, 200, memory.value, {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    });
  } catch {
    sendJson(response, 502, { error: 'Site Stan injoignable' });
  }
}
