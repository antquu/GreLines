import { SHARED_OPERATOR_LABELS } from '../services/sharedMobility';
import type { RouteItinerary } from '../services/api';
import { tx } from '../i18n';

const BIKE_MODES = new Set(['BICYCLE', 'BICYCLE_RENT']);

export function sameJourney(a: RouteItinerary | null | undefined, b: RouteItinerary): boolean {
  return Boolean(a && a.dep === b.dep && a.arr === b.arr && a.dur === b.dur);
}

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

  journeys.forEach((journey, index) => {
    if (journey.uber) claim(index, String(journey.uber.productName || 'VTC'));
    else if (journey.taxi) claim(index, journey.taxi.company);
    else if (journey.shared) claim(index, SHARED_OPERATOR_LABELS[journey.shared.operator]);
    else if (journey.bikeTransit) claim(index, tx(fr).journeyLabels.bikeAndTransit);
    else if (transitLegs(journey).length === 0) {
      const bike = (journey.allLegs || []).some((leg: Record<string, unknown>) =>
        BIKE_MODES.has(String(leg.mode ?? '').toUpperCase()),
      );
      claim(index, bike ? (tx(fr).journeyLabels.byBike) : tx(fr).journeyLabels.onFoot);
    }
  });

  claim(bestIndex(durationOf), tx(fr).journeyLabels.arrivesFirst);
  claim(bestIndex(walkMinutes), tx(fr).journeyLabels.leastWalking);
  claim(
    bestIndex(journey => transitLegs(journey).length),
    tx(fr).journeyLabels.fewestChanges,
  );

  journeys.forEach((journey, index) => {
    if (labels[index]) return;
    const changes = Math.max(0, transitLegs(journey).length - 1);
    labels[index] = changes === 0
      ? tx(fr).journeyLabels.direct
      : tx(fr).journeyLabels.changesChangeValue(changes, changes > 1 ? 's' : '');
  });

  return labels;
}

export function journeyLabelFor(
  journeys: RouteItinerary[],
  journey: RouteItinerary,
  language: 'fr' | 'en',
): string {
  const index = journeys.findIndex(entry => sameJourney(journey, entry));
  if (index >= 0) return journeyLabels(journeys, language)[index] || describeJourney(journey, language);
  return describeJourney(journey, language);
}

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
    return bike ? (tx(fr).journeyLabels.byBike) : tx(fr).journeyLabels.onFoot;
  }

  const changes = rides.length - 1;
  if (changes === 0) return 'Direct';
  return tx(fr).journeyLabels.changesChangeValue(changes, changes > 1 ? 's' : '');
}
