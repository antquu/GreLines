/**
 * Identité visuelle des options qui ne sont pas du transport en commun :
 * véhicules partagés et VTC.
 *
 * Ces itinéraires n'ont pas de ligne à afficher — c'est la marque qui les
 * identifie d'un coup d'œil dans la liste des résultats.
 */

import type { RouteItinerary } from '../services/api';
import { SHARED_OPERATOR_COLORS, SHARED_OPERATOR_LABELS } from '../services/sharedMobility';

export interface JourneyOperatorBrand {
  name: string;
  /** Logo adapté au thème : un logo sombre disparaît sur fond sombre. */
  logo: string;
  color: string;
  /**
   * Pastille de la frise : le rectangle qui, pour une ligne, porte son numéro.
   * Sa couleur ne suit pas le thème mais la marque — c'est elle qu'on
   * reconnaît — et le logo est donc choisi pour contraster avec elle, pas avec
   * le fond de la page.
   */
  chipColor: string;
  chipLogo: string;
}

export function journeyOperatorBrand(
  journey: RouteItinerary,
  theme: 'light' | 'dark' = 'dark',
): JourneyOperatorBrand | null {
  const isDark = theme === 'dark';

  if (journey.taxi) {
    return {
      name: journey.taxi.company,
      logo: isDark ? '/assets/taxis-grenoblois_light.png' : '/assets/taxis-grenoblois.png',
      color: '#f59e0b',
      // Pastille ambre : le logo sombre s'y lit, le clair s'y noierait.
      chipColor: '#f59e0b',
      chipLogo: '/assets/taxis-grenoblois.png',
    };
  }

  if (journey.uber) {
    return {
      name: 'Uber',
      logo: isDark ? '/assets/uber_light.png' : '/assets/uber.png',
      color: isDark ? '#ffffff' : '#000000',
      // Uber se porte en noir quel que soit le thème : c'est sa pastille.
      chipColor: '#000000',
      chipLogo: '/assets/uber_light.png',
    };
  }

  if (journey.shared) {
    const operator = journey.shared.operator;
    return {
      name: SHARED_OPERATOR_LABELS[operator],
      logo:
        operator === 'citiz'
          ? isDark ? '/assets/citiz_white.png' : '/assets/citiz.png'
          : '/assets/voi.png',
      color: SHARED_OPERATOR_COLORS[operator],
      chipColor: SHARED_OPERATOR_COLORS[operator],
      chipLogo: operator === 'citiz' ? '/assets/citiz_white.png' : '/assets/voi.png',
    };
  }

  return null;
}
