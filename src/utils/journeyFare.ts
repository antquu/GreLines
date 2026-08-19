/**
 * Prix résumé d'un itinéraire, pour la pastille des cartes de résultats.
 */

import type { RouteItinerary } from '../services/api';
import { formatEuro } from '../services/sharedPricing';
import { estimateTransitFare } from '../services/tagFares';

/**
 * Renvoie `null` quand il n'y a rien à annoncer : trajet entièrement à pied, ou
 * opérateur qui ne publie pas sa grille tarifaire. Mieux vaut pas de prix
 * qu'un prix inventé.
 */
export function journeyFareChip(journey: RouteItinerary, language: 'fr' | 'en'): string | null {
  // Taxi : une fourchette, parce que le compteur compte aussi le temps passé à
  // l'arrêt. Annoncer un montant unique laisserait croire à un forfait.
  if (journey.taxi) {
    const { lowEstimate, highEstimate } = journey.taxi;
    return `${lowEstimate}–${highEstimate} €`;
  }

  // Uber met déjà sa fourchette en forme dans la devise locale (« 12–15 € ») ;
  // la réécrire ne ferait que risquer de la trahir.
  if (journey.uber) {
    const { priceLabel, lowEstimate } = journey.uber;
    if (priceLabel) return priceLabel;
    return typeof lowEstimate === 'number' ? formatEuro(lowEstimate, language) : null;
  }

  if (journey.shared) {
    const total = journey.shared.price?.total;
    return typeof total === 'number' ? formatEuro(total, language) : null;
  }

  const fare = estimateTransitFare(journey.allLegs);
  if (!fare) return null;

  const price = formatEuro(fare.total, language);
  // Un TER ou un car Région dans le trajet demande un titre de plus : le prix
  // affiché n'est alors qu'un plancher.
  return fare.uncoveredNetworks.length > 0
    ? `${language === 'fr' ? 'dès' : 'from'} ${price}`
    : price;
}
