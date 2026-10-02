const SESSION_KEY = 'greLines_ipArea';

export interface IpArea {
  lat: number;
  lon: number;
}

function readSession(): IpArea | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IpArea;
    return Number.isFinite(parsed?.lat) && Number.isFinite(parsed?.lon) ? parsed : null;
  } catch {
    return null;
  }
}

function writeSession(area: IpArea) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(area));
  } catch {
  }
}

async function fetchJson(url: string, timeoutMs: number): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) return null;
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

let inflight: Promise<IpArea | null> | null = null;

export function locateByIp(): Promise<IpArea | null> {
  const known = readSession();
  if (known) return Promise.resolve(known);
  if (inflight) return inflight;

  inflight = (async () => {
    const own = await fetchJson('/api/where', 4000);
    let area: IpArea | null =
      own && typeof own.lat === 'number' && typeof own.lon === 'number' ? { lat: own.lat, lon: own.lon } : null;

    if (!area && import.meta.env.DEV) {
      const geo = await fetchJson('https://get.geojs.io/v1/ip/geo.json', 4000);
      const lat = Number(geo?.latitude);
      const lon = Number(geo?.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lon)) area = { lat, lon };
    }

    if (area) writeSession(area);
    inflight = null;
    return area;
  })();
  return inflight;
}
