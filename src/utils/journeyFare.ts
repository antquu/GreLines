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
  if (journey.taxi) {
    const { lowEstimate, highEstimate } = journey.taxi;
    return `${lowEstimate}–${highEstimate} €`;
  }

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
  return fare.uncoveredNetworks.length > 0
    ? `${language === 'fr' ? 'dès' : 'from'} ${price}`
    : price;
}
