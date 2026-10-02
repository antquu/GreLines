import { formatDurationLabel } from '../utils/formatDuration';
import { useEffect, useState } from 'react';
import { LineCloud } from './LineCloud';
import { MinimalScreen, type MinimalScreenAction } from './MinimalScreen';
import { minutesUntilClock, formatWait } from '../utils/favoriteDepartures';
import { planItineraries, type RouteItinerary } from '../services/api';
import type { FavoriteJourney } from '../services/favoriteJourneys';

const MAX_OPTIONS = 5;
const REFRESH_MS = 60_000;

export function defaultJourneyTitle(journey: FavoriteJourney): string {
  return `${journey.from.label} → ${journey.to.label}`;
}

export function FavoriteJourneyScreen({
  journey,
  isOpen,
  language,
  isLight,
  disruptedLines,
  onBack,
  onOpenInPlanner,
  onOpenItinerary,
  onRename,
  onRemove,
}: {
  journey: FavoriteJourney | undefined;
  isOpen: boolean;
  language: 'fr' | 'en';
  isLight: boolean;
  disruptedLines?: Set<string>;
  onBack: () => void;
  onOpenInPlanner: () => void;
  onOpenItinerary: (itinerary: RouteItinerary) => void;
  onRename: () => void;
  onRemove: () => void;
}) {
  const isFr = language === 'fr';
  const [options, setOptions] = useState<RouteItinerary[] | null>(null);
  const journeyId = journey?.id;

  useEffect(() => {
    if (!isOpen || !journey) return;
    let cancelled = false;
    setOptions(null);

    const load = () => {
      planItineraries({
        fromLatitude: journey.from.lat,
        fromLongitude: journey.from.lon,
        toLatitude: journey.to.lat,
        toLongitude: journey.to.lon,
        fromName: journey.from.label,
        toName: journey.to.label,
      })
        .then(results => {
          if (!cancelled) setOptions(results.slice(0, MAX_OPTIONS));
        })
        .catch(() => {
          if (!cancelled) setOptions([]);
        });
    };

    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, journeyId]);

  const actions: MinimalScreenAction[] = [
    { label: isFr ? 'Ouvrir dans l’itinéraire' : 'Open in the planner', onSelect: onOpenInPlanner },
    { label: isFr ? 'Renommer' : 'Rename', onSelect: onRename },
    { label: isFr ? 'Retirer des favoris' : 'Remove from favorites', onSelect: onRemove, destructive: true },
  ];

  const mutedClass = isLight ? 'text-slate-500' : 'text-slate-400';
  const separatorClass = isLight ? 'border-slate-200' : 'border-slate-800';

  return (
    <MinimalScreen
      isOpen={isOpen}
      title={journey ? journey.name || defaultJourneyTitle(journey) : ''}
      isLight={isLight}
      actions={actions}
      onBack={onBack}
    >
      {options === null ? (
        <p className={`px-6 py-4 text-sm ${mutedClass}`}>{isFr ? 'Recherche…' : 'Searching…'}</p>
      ) : options.length === 0 ? (
        <p className={`px-6 py-4 text-sm ${mutedClass}`}>
          {isFr ? 'Aucun itinéraire pour l’instant' : 'No route right now'}
        </p>
      ) : (
        options.map((itinerary, index) => {
          const leaveIn = minutesUntilClock(itinerary.dep);
          return (
            <button
              key={`${itinerary.dep}-${index}`}
              type="button"
              onClick={() => onOpenItinerary(itinerary)}
              className={`flex w-full gap-3 px-5 py-6 text-left transition active:scale-[0.99] ${
                index > 0 ? `border-t ${separatorClass}` : ''
              }`}
            >
              <span className="flex-shrink-0 pt-1">
                <LineCloud lines={itinerary.lineKeys} disruptedLines={disruptedLines} />
              </span>

              <div className="min-w-0 flex-1">
                <h3 className="text-[1.375rem] font-bold leading-tight">
                  {itinerary.dep} → {itinerary.arr}
                </h3>

                <p className={`mt-4 text-[0.6875rem] font-bold uppercase tracking-[0.14em] ${mutedClass}`}>
                  {isFr ? 'Partir dans' : 'Leave in'}
                </p>
                <p className="tabular text-[2.125rem] font-semibold leading-none">
                  {leaveIn == null ? itinerary.dep : formatWait(Math.max(leaveIn, 0), language)}
                </p>

                <p className={`mt-3 text-[0.6875rem] font-bold uppercase tracking-[0.14em] ${mutedClass}`}>
                  {isFr ? 'Durée' : 'Duration'}
                </p>
                <p className="tabular text-[2.125rem] font-semibold leading-none text-slate-500">
                  {formatDurationLabel(itinerary.dur)}
                </p>
              </div>
            </button>
          );
        })
      )}
    </MinimalScreen>
  );
}
