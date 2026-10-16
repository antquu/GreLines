const AIRWEB_ENDPOINT = 'https://api.grenoble.run.airweb.fr/shop/medias';
const NETWORK_PREFIX = '2';
const SAVES_PER_HOUR = 20;

function send(response, status, body) {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'private, no-store');
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  if (request.body && typeof request.body === 'object') return request.body;
  if (typeof request.body === 'string') return JSON.parse(request.body || '{}');
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function clientIp(request) {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim();
  return request.socket?.remoteAddress ?? null;
}

function cardCode(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.length >= 10 ? digits.slice(-10) : digits.padStart(10, '0');
}

function text(value, max) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
}

function database() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json' };
  return {
    rpc: async (fn, args) => {
      const result = await fetch(`${url}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args) });
      if (!result.ok) throw new Error(`${fn} ${result.status}`);
      const body = await result.text();
      return body ? JSON.parse(body) : null;
    },
    select: async path => {
      const result = await fetch(`${url}/rest/v1/${path}`, { headers });
      if (!result.ok) throw new Error(`${path} ${result.status}`);
      return result.json();
    },
  };
}

function currentContract(contracts) {
  const now = Date.now();
  const running = contracts.find(contract => {
    const start = contract.startingAt ? new Date(contract.startingAt).getTime() : -Infinity;
    const end = contract.endingAt ? new Date(contract.endingAt).getTime() : Infinity;
    return start <= now && now <= end;
  });
  if (running) return running;
  return [...contracts].sort((a, b) => new Date(b.endingAt ?? 0).getTime() - new Date(a.endingAt ?? 0).getTime())[0];
}

// ask the network itself, so a browser cannot invent a card or its status
async function lookupCard(code) {
  const mediaId = `${NETWORK_PREFIX}-${code}`;
  const media = await fetch(`${AIRWEB_ENDPOINT}/${mediaId}`, { signal: AbortSignal.timeout(8000) })
    .then(result => (result.ok ? result.json() : null))
    .catch(() => null);
  if (!media || typeof media !== 'object' || !media.code) return null;

  const contracts = await fetch(`${AIRWEB_ENDPOINT}/${mediaId}/contracts`, { signal: AbortSignal.timeout(8000) })
    .then(result => (result.ok ? result.json() : []))
    .catch(() => []);
  const list = Array.isArray(contracts) ? contracts : [];
  const contract = currentContract(list);

  return {
    birthDate: media.holderBirthDate ? String(media.holderBirthDate).slice(0, 10) : null,
    expiresAt: media.expiresAt ? String(media.expiresAt) : null,
    isExpired: Boolean(media.isExpired),
    isBlacklisted: Boolean(media.isBlackListed),
    isLocked: Boolean(media.isLocked),
    isInvalid: Boolean(media.isInvalid),
    contractLabel: contract?.label ? String(contract.label) : null,
    contractStartingAt: contract?.startingAt ? String(contract.startingAt) : null,
    contractEndingAt: contract?.endingAt ? String(contract.endingAt) : null,
    networkLabel: contract?.networkLabel ? String(contract.networkLabel) : null,
  };
}

async function isLinked(db, deviceId, code) {
  if (!deviceId) return false;
  const rows = await db.select(
    `oura_cards?select=card_code&device_id=eq.${encodeURIComponent(deviceId)}&card_code=eq.${code}&limit=1`,
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function holderExists(db, code) {
  const rows = await db.select(`oura_holders?select=card_code&card_code=eq.${code}&limit=1`);
  return Array.isArray(rows) && rows.length > 0;
}

async function saveHolder(db, code, network, identity) {
  await db.rpc('oura_holder_save', {
    p_code: code,
    p_first_name: identity.firstName,
    p_last_name: identity.lastName,
    p_birth_date: network.birthDate,
    p_expires_at: network.expiresAt,
    p_contract_label: network.contractLabel,
    p_contract_starting_at: network.contractStartingAt,
    p_contract_ending_at: network.contractEndingAt,
    p_network_label: network.networkLabel,
    p_photo_path: identity.photoPath,
    p_is_expired: network.isExpired,
    p_is_blacklisted: network.isBlacklisted,
    p_is_locked: network.isLocked,
    p_is_invalid: network.isInvalid,
  });
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return send(response, 405, { error: 'method' });

  const db = database();
  if (!db) return send(response, 503, { error: 'unavailable' });

  let body;
  try {
    body = await readBody(request);
  } catch {
    return send(response, 400, { error: 'body' });
  }

  const deviceId = text(body.deviceId, 100);
  const ip = clientIp(request);

  try {
    if (body.action === 'save' || body.action === 'refresh') {
      const code = cardCode(body.code);
      if (!code) return send(response, 400, { error: 'code' });

      const allowed = await db
        .rpc('api_rate_check', {
          p_ip: ip ?? 'unknown',
          p_bucket: `oura-${body.action}`,
          p_max: body.action === 'save' ? SAVES_PER_HOUR : SAVES_PER_HOUR * 5,
          p_window_seconds: 3600,
        })
        .catch(() => true);
      if (allowed === false) return send(response, 429, { error: 'rate' });

      const network = await lookupCard(code);
      if (!network) return send(response, 404, { error: 'unknown' });

      if (body.action === 'refresh') {
        if (!(await holderExists(db, code))) return send(response, 404, { error: 'unknown' });
        await saveHolder(db, code, network, { firstName: null, lastName: null, photoPath: null });
        return send(response, 200, { ok: true });
      }

      // only a device that already holds the card may rename it or change its photo
      const known = await holderExists(db, code);
      const owner = !known || (await isLinked(db, deviceId, code));
      const photoPath = text(body.photoPath, 200);
      await saveHolder(db, code, network, {
        firstName: owner ? text(body.firstName, 80) : null,
        lastName: owner ? text(body.lastName, 80) : null,
        photoPath: owner && photoPath && /^[\w./-]+$/.test(photoPath) && !photoPath.includes('..') ? photoPath : null,
      });
      if (deviceId) await db.rpc('oura_card_link', { p_device: deviceId, p_code: code });
      return send(response, 200, { ok: true });
    }

    if (body.action === 'transfer') {
      const fromCode = cardCode(body.fromCode);
      const toCode = cardCode(body.toCode);
      if (!fromCode || !toCode || fromCode === toCode || !deviceId) return send(response, 400, { error: 'code' });
      const [holdsOld, holdsNew] = await Promise.all([isLinked(db, deviceId, fromCode), isLinked(db, deviceId, toCode)]);
      if (!holdsOld || !holdsNew) return send(response, 403, { error: 'not-holder' });
      await db.rpc('oura_holder_disable', { p_code: fromCode });
      return send(response, 200, { ok: true });
    }

    return send(response, 400, { error: 'action' });
  } catch {
    return send(response, 502, { error: 'database' });
  }
}
