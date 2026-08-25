/**
 * Ce à quoi sert chaque trajet.
 *
 * Le titre d'une carte de résultat, et celui que reprend la fiche quand on
 * l'ouvre : les deux doivent dire la même chose, ce qui suppose de le calculer
 * au même endroit. Le calcul porte sur la liste entière et non sur un trajet
 * isolé, puisqu'il s'agit de qualités comparatives.
 */

import { SHARED_OPERATOR_LABELS } from '../services/sharedMobility';
import type { RouteItinerary } from '../services/api';

const BIKE_MODES = new Set(['BICYCLE', 'BICYCLE_RENT']);

/** Deux trajets sont le même s'ils partent, arrivent et durent pareil. */
export function sameJourney(a: RouteItinerary | null | undefined, b: RouteItinerary): boolean {
  return Boolean(a && a.dep === b.dep && a.arr === b.arr && a.dur === b.dur);
}

/**
 * Les tronçons qu'on ne fait pas par ses propres moyens.
 *
 * Ni la marche ni le vélo : ce sont eux qui comptent pour dire « direct » ou
 * « deux changements », et un trajet qui n'en a aucun se nomme par le moyen
 * qu'il demande, pas par le nombre de correspondances qu'il évite.
 */
export function transitLegs(journey: RouteItinerary): Array<Record<string, unknown>> {
  return (journey.allLegs || []).filter((leg: Record<string, unknown>) => {
    const mode = String(leg.mode ?? '').toUpperCase();
    return mode !== 'WALK' && !BIKE_MODES.has(mode);
  });
}

function walkMinutes(journey: RouteItinerary): number {
  return (journey.allLegs || [])
    .filter((leg: Record<string, unknown>) => String(leg.mode ?? '').toUpperCase() === 'WALK')
    .reduce((total: number, leg: Record<string, unknown>) => total + Number(leg.duration ?? 0), 0) / 60;
}

/**
 * Ce à quoi sert chaque trajet.
 *
 * Un titre par carte, et jamais deux fois le même : « Arrive en premier » sur
 * deux lignes de suite ne distingue rien. On attribue donc les qualités une
 * seule fois, au trajet qui les mérite, et les autres cartes se décrivent par
 * ce qu'elles sont : directes, ou le nombre de changements qu'elles demandent.
 *
 * L'ordre des qualités est celui des questions qu'on se pose : arriver tôt,
 * marcher peu, ne pas changer.
 */
export function journeyLabels(journeys: RouteItinerary[], language: 'fr' | 'en'): string[] {
  const fr = language === 'fr';
  const labels: string[] = journeys.map(() => '');
  const taken = new Set<number>();

  const claim = (index: number, label: string) => {
    if (index < 0 || taken.has(index)) return;
    taken.add(index);
    labels[index] = label;
  };

  const durationOf = (journey: RouteItinerary) => parseInt(journey.dur, 10) || Number.MAX_SAFE_INTEGER;
  /*
   * Le meilleur de ceux qui n'ont pas encore de nom.
   *
   * Chercher le meilleur dans la liste entière ne servait à rien : le trajet
   * le plus court était souvent le taxi, déjà nommé, et « Arrive en premier »
   * n'était alors attribué à personne. La qualité revient donc au meilleur des
   * trajets encore anonymes, qui est bien celui à qui elle apprend quelque
   * chose.
   */
  const bestIndex = (score: (journey: RouteItinerary) => number) => {
    let best = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    journeys.forEach((journey, index) => {
      if (taken.has(index)) return;
      const value = score(journey);
      if (value < bestScore) {
        bestScore = value;
        best = index;
      }
    });
    return best;
  };

  /* Les options qui ne sont pas du réseau se nomment d'elles-mêmes : leur
     opérateur est le titre, et aucune qualité comparative ne leur convient. */
  journeys.forEach((journey, index) => {
    /* La marque, pas la catégorie. « Véhicule partagé » ne dit ni quelle
       application ouvrir, ni ce qu'on va trouver au bout de la rue : Voi et
       Citiz, si. */
    if (journey.uber) claim(index, String(journey.uber.productName || 'VTC'));
    else if (journey.taxi) claim(index, journey.taxi.company);
    else if (journey.shared) claim(index, SHARED_OPERATOR_LABELS[journey.shared.operator]);
    else if (journey.bikeTransit) claim(index, fr ? 'Vélo et transports' : 'Bike and transit');
    else if (transitLegs(journey).length === 0) {
      /* Aucune ligne dans le trajet : il se fait à pied ou à vélo, et c'est
         cela qu'il faut annoncer. « Arrive en premier » sur une marche de deux
         minutes ne dit pas qu'il n'y a pas de tram à prendre. */
      const bike = (journey.allLegs || []).some((leg: Record<string, unknown>) =>
        BIKE_MODES.has(String(leg.mode ?? '').toUpperCase()),
      );
      claim(index, bike ? (fr ? 'À vélo' : 'By bike') : fr ? 'À pied' : 'On foot');
    }
  });

  claim(bestIndex(durationOf), fr ? 'Arrive en premier' : 'Arrives first');
  claim(bestIndex(walkMinutes), fr ? 'Le moins de marche' : 'Least walking');
  claim(
    bestIndex(journey => transitLegs(journey).length),
    fr ? 'Le moins de changements' : 'Fewest changes',
  );

  journeys.forEach((journey, index) => {
    if (labels[index]) return;
    const changes = Math.max(0, transitLegs(journey).length - 1);
    labels[index] = changes === 0
      ? fr ? 'Direct' : 'Direct'
      : fr
        ? `${changes} changement${changes > 1 ? 's' : ''}`
        : `${changes} change${changes > 1 ? 's' : ''}`;
  });

  return labels;
}

/**
 * Le titre d'un trajet donné, cherché dans la liste où il figure.
 *
 * Rend `null` pour un trajet absent de la liste : la fiche affiche alors son
 * titre générique plutôt qu'une qualité qui ne se rapporterait à rien.
 */
export function journeyLabelFor(
  journeys: RouteItinerary[],
  journey: RouteItinerary,
  language: 'fr' | 'en',
): string {
  const index = journeys.findIndex(entry => sameJourney(journey, entry));
  if (index >= 0) return journeyLabels(journeys, language)[index] || describeJourney(journey, language);
  /* Trajet absent de la liste : les résultats se sont rafraîchis pendant qu'on
     lisait la fiche, et les horaires ne concordent plus. On perd la qualité
     comparative, pas le titre — le trajet se décrit toujours lui-même. */
  return describeJourney(journey, language);
}

/**
 * Ce qu'un trajet est, sans le comparer à d'autres.
 *
 * Direct, deux changements, à pied, à vélo : rien qui suppose de connaître la
 * liste dont il vient.
 */
export function describeJourney(journey: RouteItinerary, language: 'fr' | 'en'): string {
  const fr = language === 'fr';
  if (journey.uber) return String(journey.uber.productName || 'VTC');
  if (journey.taxi) return journey.taxi.company;
  if (journey.shared) return SHARED_OPERATOR_LABELS[journey.shared.operator];

  const rides = transitLegs(journey);
  if (rides.length === 0) {
    const bike = (journey.allLegs || []).some((leg: Record<string, unknown>) =>
      BIKE_MODES.has(String(leg.mode ?? '').toUpperCase()),
    );
    return bike ? (fr ? 'À vélo' : 'By bike') : fr ? 'À pied' : 'On foot';
  }

  const changes = rides.length - 1;
  if (changes === 0) return 'Direct';
  return fr
    ? `${changes} changement${changes > 1 ? 's' : ''}`
    : `${changes} change${changes > 1 ? 's' : ''}`;
}
