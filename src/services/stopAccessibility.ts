/**
 * Les arrêts où l'on peut monter en fauteuil.
 *
 * Le renseignement n'existe pas dans l'API du réseau : ni les clusters, ni les
 * horaires, ni les arrêts proches ne le portent. Il vit dans le GTFS, dont
 * l'archive pèse six mégaoctets — trop pour le navigateur, et pour trois
 * kilo-octets utiles. `scripts/accessible-stops.mjs` l'en extrait et dépose la
 * liste dans `public/accessible-stops.json` ; c'est ce fichier qu'on lit ici.
 *
 * La liste ne contient que les arrêts accessibles. Ne pas y figurer ne veut donc
 * pas dire « inaccessible » mais « on ne l'affirme pas » — la moitié du réseau
 * n'est pas renseignée, et l'absence de pictogramme ne doit jamais se lire
 * comme un refus.
 *
 * Un arrêt s'y trouve sous tous les noms que l'application lui donne : son
 * identifiant de cluster (`SEM:LP`), son mnémonique (`SEM:GENLP`) et ceux de ses
 * quais (`SEM:2109`). Le pictogramme s'affiche donc quel que soit l'endroit
 * d'où l'arrêt est regardé.
 */

const URL = '/accessible-stops.json';

let cache: Set<string> | null = null;
let inflight: Promise<Set<string>> | null = null;

/**
 * Charge la liste, une fois pour toute la session.
 *
 * L'échec est silencieux et rend un ensemble vide : un fichier manquant retire
 * des pictogrammes, il n'empêche pas de consulter un horaire.
 */
export function loadAccessibleStops(): Promise<Set<string>> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;

  inflight = fetch(URL)
    .then(response => (response.ok ? response.json() : null))
    .then((data: { stops?: string[] } | null) => {
      cache = new Set(Array.isArray(data?.stops) ? data.stops : []);
      return cache;
    })
    .catch(() => {
      cache = new Set<string>();
      return cache;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

/** Ce qu'il faut d'un arrêt pour le reconnaître dans la liste. */
export interface AccessibleStopRef {
  id?: string | null;
  clusterGtfsId?: string | null;
}

/**
 * Vrai si l'arrêt est annoncé accessible.
 *
 * `stops` vient de `loadAccessibleStops`. Tant qu'elle n'est pas chargée,
 * l'ensemble est vide et la réponse est « non » : le pictogramme apparaît une
 * fraction de seconde après le nom, ce qui vaut mieux qu'un nom qui saute pour
 * lui faire de la place.
 */
export function isStopAccessible(
  stops: Set<string> | null | undefined,
  stop: AccessibleStopRef | null | undefined,
): boolean {
  if (!stops || stops.size === 0 || !stop) return false;
  if (stop.id && stops.has(stop.id)) return true;
  if (stop.clusterGtfsId && stops.has(stop.clusterGtfsId)) return true;
  return false;
}

/**
 * Vrai si tout le trajet se fait par des arrêts annoncés accessibles.
 *
 * On regarde les seules étapes en véhicule, et pour chacune l'arrêt où l'on
 * monte et celui où l'on descend : ce sont les endroits où il faut franchir
 * une bordure. La marche entre les deux ne se juge pas ici — le calculateur
 * s'en charge quand on lui demande un trajet praticable en fauteuil.
 *
 * Un seul arrêt non renseigné suffit à ne rien annoncer. Le pictogramme dit
 * « tout le trajet se fait en fauteuil » ; il ne peut pas le dire à moitié.
 */
export function isJourneyStepFree(
  stops: Set<string> | null | undefined,
  legs: Array<{ mode?: string; from?: { stopId?: string }; to?: { stopId?: string } }> | null | undefined,
): boolean {
  if (!stops || stops.size === 0 || !Array.isArray(legs)) return false;
  const transit = legs.filter(leg => String(leg?.mode ?? '').toUpperCase() !== 'WALK');
  if (transit.length === 0) return false;
  return transit.every(leg => {
    const from = leg.from?.stopId;
    const to = leg.to?.stopId;
    return Boolean(from && stops.has(from) && to && stops.has(to));
  });
}
