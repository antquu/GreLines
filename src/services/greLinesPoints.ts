/**
 * Les GreLines Points : ce que rapporte le fait d'avoir voyagé en aidant.
 *
 * L'application demande beaucoup à ses usagers — répondre à une question dans
 * le tram, laisser leur guidage ouvert pour que les horaires d'autrui se
 * précisent — et ne leur rendait rien. Les points ferment cette boucle : ils ne
 * s'achètent pas et ne donnent droit à rien, ils constatent une contribution.
 *
 * Ils vivront un jour sur la carte OURA, avec le compte qui va avec. En
 * attendant ce compte, ils sont gardés sur l'appareil : un total remis à zéro
 * par un changement de téléphone vaut mieux qu'une fausse promesse de compte.
 */

const STORAGE_KEY = 'greLines_points';

export interface PointsLedger {
  points: number;
  trips: number;
  /** Cumul des voyageurs que les contributions de l'usager ont renseignés. */
  travellersHelped: number;
}

const EMPTY: PointsLedger = { points: 0, trips: 0, travellersHelped: 0 };

/** Ce que rapporte un trajet, avant de compter les contributions. */
const POINTS_PER_TRIP = 10;
/** Une observation de passage, ou un avis : même valeur, même effort. */
const POINTS_PER_CONTRIBUTION = 5;

export function loadPoints(): PointsLedger {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw);
    return {
      points: Number(parsed?.points) || 0,
      trips: Number(parsed?.trips) || 0,
      travellersHelped: Number(parsed?.travellersHelped) || 0,
    };
  } catch {
    return { ...EMPTY };
  }
}

export interface TripAward {
  /** Points gagnés sur ce trajet. */
  points: number;
  /** Voyageurs renseignés par ce trajet. */
  travellersHelped: number;
  /** Le total après ce trajet. */
  total: PointsLedger;
}

/**
 * Solde un trajet terminé.
 *
 * `travellersHelped` ne descend jamais en dessous de un, et c'est délibéré :
 * même sans observation publiée ni question répondue, avoir suivi un trajet de
 * bout en bout confirme qu'il est praticable tel que l'application le propose.
 * Annoncer « zéro voyageur aidé » à quelqu'un qui vient de faire le trajet
 * serait faux autant que décourageant.
 */
export function awardTrip(contributions: {
  observations: number;
  answers: number;
  /** Compteur affiché pendant le guidage, conservé même après un rechargement. */
  travellersHelped?: number;
}): TripAward {
  const useful = Math.max(0, contributions.observations) + Math.max(0, contributions.answers);
  const points = POINTS_PER_TRIP + useful * POINTS_PER_CONTRIBUTION;
  const travellersHelped = Math.max(1, contributions.travellersHelped ?? useful);

  const previous = loadPoints();
  const total: PointsLedger = {
    points: previous.points + points,
    trips: previous.trips + 1,
    travellersHelped: previous.travellersHelped + travellersHelped,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(total));
  } catch {
  }

  return { points, travellersHelped, total };
}
