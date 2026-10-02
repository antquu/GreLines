const KEY = 'greLines_recentStops';
const LIMIT = 8;

export interface RecentStop {
  id: string;
  name: string;
  city?: string;
  lat: number;
  lon: number;
  at: number;
}

export function loadRecentStops(): RecentStop[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry) => entry && typeof entry.id === 'string' && typeof entry.name === 'string')
      .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
      .slice(0, LIMIT);
  } catch {
    return [];
  }
}

export function rememberStop(stop: { id: string; name: string; city?: string; lat: number; lon: number }): RecentStop[] {
  const entry: RecentStop = {
    id: stop.id,
    name: stop.name,
    city: stop.city,
    lat: stop.lat,
    lon: stop.lon,
    at: Date.now(),
  };
  const next = [entry, ...loadRecentStops().filter((item) => item.id !== stop.id)].slice(0, LIMIT);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
  }
  return next;
}
