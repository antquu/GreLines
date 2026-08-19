/**
 * Les arrêts consultés récemment.
 *
 * La section « Récents » de la feuille d'accueil montrait les arrêts *proches*,
 * ce qui est déjà l'objet de la carte juste au-dessus. Or ce qu'on rouvre le plus
 * n'est pas le plus près : c'est celui d'hier, celui du travail, celui qu'on a
 * regardé trois fois ce matin. Un historique dit cela ; la distance non.
 *
 * Gardé sur l'appareil : c'est une commodité, pas une donnée. Personne n'a besoin
 * de savoir sur un serveur quels arrêts quelqu'un consulte.
 */

const KEY = 'greLines_recentStops';
/**
 * Huit, parce que la liste doit rester lisible sans défiler.
 *
 * Au-delà, on n'y cherche plus : on scrolle, et autant repasser par la recherche.
 */
const LIMIT = 8;

export interface RecentStop {
  id: string;
  name: string;
  city?: string;
  lat: number;
  lon: number;
  /** Dernière consultation, pour trier et pour dater la ligne. */
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

/**
 * Note qu'on vient d'ouvrir un arrêt.
 *
 * Une consultation remonte l'arrêt en tête au lieu d'en ajouter une seconde
 * ligne : rouvrir trois fois le même quai dans la matinée ne doit pas remplir la
 * liste avec lui seul.
 */
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
    // Navigation privée : la liste vaudra pour cette session.
  }
  return next;
}
