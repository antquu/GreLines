













export const DEFAULT_ATMO_POSTAL_CODE = '38000';

export interface AtmoDefinition {
  indice: number;
  qualificatif: string;
  couleur: string;
  picto_url: string;
  recommandations?: Array<{
    categorie: string;
    texte: string;
    picto_url: string;
    lien: string | null;
  }>;
}

export interface AtmoForecast {
  
  echeance: number;
  date_echeance: string;
  indice: number;
  qualificatif: string;
  couleur_html: string;
  commune_insee: string;
  commune_nom: string;
  polluants_majoritaires?: string[];
}

export interface AtmoReport {
  insee: string;
  communeName: string | null;
  
  current: AtmoForecast | null;
  forecasts: AtmoForecast[];
  comment: string;
  
  definition: AtmoDefinition | null;
  definitions: AtmoDefinition[];
}

const ENDPOINT = 'https://data.mobilites-m.fr/api/dyn/indiceAtmoCommunal';
const TTL_MS = 60 * 60 * 1000;

const cache = new Map<string, { report: AtmoReport; timestamp: number }>();
const inflight = new Map<string, Promise<AtmoReport | null>>();


export function isValidPostalCode(value: string): boolean {
  return /^\d{5}$/.test(value.trim());
}

function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Prévision à afficher : celle du jour si elle existe, sinon l'échéance la plus
 * proche — en fin de journée l'API ne renvoie parfois que les jours suivants,
 * et une carte vide serait moins utile qu'une prévision datée.
 */
function pickCurrent(forecasts: AtmoForecast[]): AtmoForecast | null {
  if (forecasts.length === 0) return null;
  const today = todayIso();
  return (
    forecasts.find(forecast => forecast.date_echeance === today) ??
    forecasts.reduce((best, forecast) => (forecast.echeance < best.echeance ? forecast : best))
  );
}

export async function getAtmoReport(
  insee: string,
  options?: { signal?: AbortSignal }
): Promise<AtmoReport | null> {
  const code = insee.trim().toUpperCase();

  const cached = cache.get(code);
  if (cached && Date.now() - cached.timestamp < TTL_MS) return cached.report;
  const pending = inflight.get(code);
  if (pending) return pending;

  const promise: Promise<AtmoReport | null> = (async () => {
    try {
      const response = await fetch(`${ENDPOINT}/${encodeURIComponent(code)}/json`, {
        signal: options?.signal,
      });
      if (!response.ok) return null;
      const data = await response.json();

      // `indices` est un tableau quand la commune est couverte, et un objet
      // vide quand elle ne l'est pas (par exemple si on passe un code postal).
      const forecasts: AtmoForecast[] = Array.isArray(data?.indices) ? data.indices : [];
      const definitions: AtmoDefinition[] = Array.isArray(data?.definitions) ? data.definitions : [];
      const current = pickCurrent(forecasts);

      const report: AtmoReport = {
        insee: code,
        communeName: current?.commune_nom ?? null,
        current,
        forecasts,
        comment: typeof data?.commentaire === 'string' ? data.commentaire.trim() : '',
        definition: current
          ? definitions.find(definition => definition.indice === current.indice) ?? null
          : null,
        definitions,
      };

      cache.set(code, { report, timestamp: Date.now() });
      return report;
    } catch {
      return null;
    } finally {
      inflight.delete(code);
    }
  })();

  inflight.set(code, promise);
  return promise;
}

// ─────────────────────────────────────────────────────────────────────────────
// Recherche par code postal
//
// L'API ATMO est indexée sur le code INSEE, que personne ne connaît par cœur.
// On part donc du code postal — celui qu'on lit sur son courrier — et on le
// traduit via l'API Découpage administratif de l'État. Un code postal peut
// couvrir plusieurs communes (38360 : Sassenage, Noyarey, Engins) : on les
// essaie de la plus peuplée à la plus petite et on garde la première pour
// laquelle Atmo publie une prévision.
// ─────────────────────────────────────────────────────────────────────────────

const GEO_ENDPOINT = 'https://geo.api.gouv.fr/communes';
/** Au-delà, on interrogerait l'API ATMO pour des hameaux sans intérêt. */
const MAX_COMMUNES_TRIED = 4;

export interface Commune {
  nom: string;
  code: string;
  population?: number;
  /** Premier code postal de la commune, montré en indice dans les suggestions. */
  postalCode?: string;
  departement?: string;
}

const searchCache = new Map<string, Commune[]>();

const communesCache = new Map<string, Commune[]>();

/**
 * Communes dont le nom approche la saisie, les plus peuplées d'abord.
 *
 * On cherche par nom et non par code postal : personne ne connaît le code INSEE
 * de sa commune, et beaucoup hésitent déjà sur son code postal. Le tri par
 * population met « Grenoble » devant les hameaux homonymes.
 */
export async function searchCommunes(query: string, limit = 6): Promise<Commune[]> {
  const term = query.trim();
  if (term.length < 2) return [];

  const cached = searchCache.get(term.toLowerCase());
  if (cached) return cached;

  try {
    const params = new URLSearchParams({
      nom: term,
      fields: 'nom,code,codesPostaux,population,departement',
      boost: 'population',
      limit: String(limit),
    });
    const response = await fetch(`${GEO_ENDPOINT}?${params.toString()}`);
    if (!response.ok) return [];
    const data = await response.json();
    if (!Array.isArray(data)) return [];

    const communes: Commune[] = data
      .filter((entry: any) => typeof entry?.code === 'string' && typeof entry?.nom === 'string')
      .map((entry: any) => ({
        nom: entry.nom,
        code: entry.code,
        population: typeof entry.population === 'number' ? entry.population : 0,
        postalCode: Array.isArray(entry.codesPostaux) ? entry.codesPostaux[0] : undefined,
        departement: entry.departement?.nom,
      }));

    searchCache.set(term.toLowerCase(), communes);
    return communes;
  } catch {
    return [];
  }
}

/**
 * La commune sous un point de la carte.
 *
 * L'API géo sait répondre à l'envers : on lui donne des coordonnées, elle rend
 * la commune qui les contient. C'est ce qui permet à l'indice de qualité de
 * l'air de suivre ce qu'on regarde plutôt qu'un lieu choisi une fois pour
 * toutes — on déplace la carte sur Voiron, l'indice devient celui de Voiron.
 *
 * Le résultat est mis en cache au millième de degré : déplacer la carte de
 * quelques mètres ne redemande rien.
 */
const reverseCache = new Map<string, Commune | null>();

export async function getCommuneAtCoords(lat: number, lon: number): Promise<Commune | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  if (reverseCache.has(key)) return reverseCache.get(key) ?? null;

  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      fields: 'nom,code,codesPostaux,population,departement',
    });
    const response = await fetch(`${GEO_ENDPOINT}?${params.toString()}`);
    if (!response.ok) {
      reverseCache.set(key, null);
      return null;
    }
    const data = await response.json();
    const entry = Array.isArray(data) ? data[0] : null;
    if (!entry?.code || !entry?.nom) {
      reverseCache.set(key, null);
      return null;
    }
    const commune: Commune = {
      nom: entry.nom,
      code: entry.code,
      population: typeof entry.population === 'number' ? entry.population : 0,
      postalCode: Array.isArray(entry.codesPostaux) ? entry.codesPostaux[0] : undefined,
      departement: entry.departement?.nom,
    };
    reverseCache.set(key, commune);
    return commune;
  } catch {
    reverseCache.set(key, null);
    return null;
  }
}

/** Communes desservies par un code postal, de la plus peuplée à la plus petite. */
export async function getCommunesByPostalCode(postalCode: string): Promise<Commune[]> {
  const code = postalCode.trim();
  const cached = communesCache.get(code);
  if (cached) return cached;

  try {
    const response = await fetch(
      `${GEO_ENDPOINT}?codePostal=${encodeURIComponent(code)}&fields=nom,code,population`
    );
    if (!response.ok) return [];
    const data = await response.json();
    if (!Array.isArray(data)) return [];

    const communes: Commune[] = data
      .filter((entry: any) => typeof entry?.code === 'string' && typeof entry?.nom === 'string')
      .map((entry: any) => ({
        nom: entry.nom,
        code: entry.code,
        population: typeof entry.population === 'number' ? entry.population : 0,
      }))
      .sort((a: Commune, b: Commune) => (b.population ?? 0) - (a.population ?? 0));

    communesCache.set(code, communes);
    return communes;
  } catch {
    return [];
  }
}

/**
 * Indice ATMO d'une commune désignée par son code INSEE. Renvoie `null` quand
 * Atmo ne la couvre pas — c'est le cas hors région grenobloise.
 */
export async function getAtmoReportForCommune(commune: Commune): Promise<AtmoReport | null> {
  const report = await getAtmoReport(commune.code);
  if (!report) return null;
  return { ...report, communeName: report.communeName || commune.nom };
}

/**
 * Indice ATMO d'un code postal. Renvoie `null` si aucune des communes du code
 * postal n'est couverte par Atmo (c'est le cas hors région grenobloise).
 */
export async function getAtmoReportByPostalCode(postalCode: string): Promise<AtmoReport | null> {
  const communes = await getCommunesByPostalCode(postalCode);
  if (communes.length === 0) return null;

  let fallback: AtmoReport | null = null;
  for (const commune of communes.slice(0, MAX_COMMUNES_TRIED)) {
    const report = await getAtmoReport(commune.code);
    if (report?.current) {
      // Le nom vient de l'API ATMO quand elle le donne, du référentiel sinon.
      return { ...report, communeName: report.communeName || commune.nom };
    }
    if (report && !fallback) fallback = { ...report, communeName: commune.nom };
  }
  return fallback;
}
