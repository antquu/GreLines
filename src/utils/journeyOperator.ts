import type { RouteItinerary } from '../services/api';
import { SHARED_OPERATOR_COLORS, SHARED_OPERATOR_LABELS } from '../services/sharedMobility';

export interface JourneyOperatorBrand {
  name: string;
  logo: string;
  color: string;
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
      chipColor: '#f59e0b',
      chipLogo: '/assets/taxis-grenoblois.png',
    };
  }

  if (journey.uber) {
    return {
      name: 'Uber',
      logo: isDark ? '/assets/uber_light.png' : '/assets/uber.png',
      color: isDark ? '#ffffff' : '#000000',
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
      chipLogo:
        operator === 'citiz' ? '/assets/citiz_white.png' : '/assets/voi_white.png',
    };
  }

  return null;
}
