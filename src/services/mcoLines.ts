export interface McoLine {
  id: string;
  code: string;
  shortName: string;
  longName: string;
  color: string;
  textColor: string;
  geometry: GeoJSON.MultiLineString | GeoJSON.LineString | null;
}

const GEOMETRY_ENDPOINT = 'https://data.mobilites-m.fr/api/lines/json?types=ligne&reseaux=MCO';
const ROUTES_ENDPOINT = 'https://data.mobilites-m.fr/api/routers/default/index/routes';

const FALLBACK_COLOR = '#49B170';

let cache: McoLine[] | null = null;
let inflight: Promise<McoLine[]> | null = null;

function withHash(value: unknown, fallback: string): string {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  return raw.startsWith('#') ? raw : `#${raw}`;
}

export async function getMcoLines(): Promise<McoLine[]> {
  if (cache) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const [geoResponse, routesResponse] = await Promise.all([
        fetch(GEOMETRY_ENDPOINT),
        fetch(ROUTES_ENDPOINT),
      ]);

      const geo = geoResponse.ok ? await geoResponse.json() : null;
      const routes = routesResponse.ok ? await routesResponse.json() : [];

      const meta = new Map<string, any>();
      if (Array.isArray(routes)) {
        for (const route of routes) {
          const id = String(route?.id ?? '');
          if (id.startsWith('MCO:')) meta.set(id, route);
        }
      }

      const features: any[] = Array.isArray(geo?.features) ? geo.features : [];
      const lines: McoLine[] = features.map(feature => {
        const rawCode = String(feature?.properties?.CODE ?? feature?.properties?.id ?? '');
        const id = rawCode.replace('_', ':');
        const code = id.split(':')[1] ?? id;
        const route = meta.get(id);
        return {
          id,
          code,
          shortName: route?.shortName || code,
          longName: route?.longName || '',
          color: withHash(route?.color, FALLBACK_COLOR),
          textColor: withHash(route?.textColor, '#ffffff'),
          geometry: feature?.geometry ?? null,
        };
      });

      cache = lines;
      return lines;
    } catch {
      return [];
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export function midpointOf(geometry: McoLine['geometry']): [number, number] | null {
  if (!geometry) return null;
  const parts: number[][][] =
    geometry.type === 'MultiLineString'
      ? (geometry.coordinates as number[][][])
      : [geometry.coordinates as number[][]];

  let longest: number[][] = [];
  for (const part of parts) if (part.length > longest.length) longest = part;
  if (longest.length === 0) return null;

  let total = 0;
  const spans: number[] = [];
  for (let i = 1; i < longest.length; i += 1) {
    const dx = longest[i][0] - longest[i - 1][0];
    const dy = longest[i][1] - longest[i - 1][1];
    const span = Math.hypot(dx, dy);
    spans.push(span);
    total += span;
  }
  if (total === 0) return [longest[0][0], longest[0][1]];

  let walked = 0;
  for (let i = 0; i < spans.length; i += 1) {
    if (walked + spans[i] >= total / 2) {
      const ratio = spans[i] === 0 ? 0 : (total / 2 - walked) / spans[i];
      const from = longest[i];
      const to = longest[i + 1];
      return [from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio];
    }
    walked += spans[i];
  }
  const last = longest[longest.length - 1];
  return [last[0], last[1]];
}
