/**
 * Les liaisons de covoiturage M'Covoit ligne+.
 *
 * Quatre liaisons, toutes vertes, tracées sur les grands axes de la cuvette.
 * Elles se chargent à part du reste du réseau : leur tracé n'est publié que par
 * l'API géographique, tandis que leur nom et leur couleur viennent de l'API des
 * lignes. Ni l'une ni l'autre ne suffit seule, alors on les réunit ici, une
 * fois, et l'on garde le résultat pour la session.
 *
 * Le tracé pèse plusieurs dizaines de milliers de points : on ne le recharge
 * pas à chaque ouverture d'un point d'arrêt.
 */

export interface McoLine {
  /** « MCO:VOIR ». */
  id: string;
  /** « VOIR ». */
  code: string;
  shortName: string;
  longName: string;
  /** Avec le dièse, prête à peindre. */
  color: string;
  textColor: string;
  /** Le tracé, en MultiLineString GeoJSON. */
  geometry: GeoJSON.MultiLineString | GeoJSON.LineString | null;
}

const GEOMETRY_ENDPOINT = 'https://data.mobilites-m.fr/api/lines/json?types=ligne&reseaux=MCO';
const ROUTES_ENDPOINT = 'https://data.mobilites-m.fr/api/routers/default/index/routes';

/** Le vert du covoiturage, si l'API des lignes ne répond pas. */
const FALLBACK_COLOR = '#49B170';

let cache: McoLine[] | null = null;
let inflight: Promise<McoLine[]> | null = null;

function withHash(value: unknown, fallback: string): string {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  return raw.startsWith('#') ? raw : `#${raw}`;
}

/**
 * Toutes les liaisons de covoiturage, tracé compris.
 *
 * Rend une liste vide plutôt que d'échouer : un point de covoiturage sans ses
 * liaisons reste un point de covoiturage, et la fiche a de quoi le dire.
 */
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

/**
 * Le point milieu d'un tracé, où poser son étiquette.
 *
 * Le centre du rectangle englobant tomberait souvent à côté de la route — une
 * liaison qui contourne un massif dessine un arc, dont le centre est dans le
 * massif. On prend donc le point situé à la moitié de la longueur parcourue,
 * qui est toujours sur le tracé.
 */
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
