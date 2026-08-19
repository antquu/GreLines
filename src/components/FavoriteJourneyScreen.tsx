/**
 * Un trajet favori, en grand.
 *
 * Même page que celle d'un arrêt favori, à ceci près qu'un trajet n'a pas de
 * directions mais des départs : on y trouve tous ceux qui partent maintenant,
 * un par bloc, du plus proche au plus tardif. La grappe de lignes tient la
 * colonne de gauche — chaque proposition n'emprunte pas forcément les mêmes
 * lignes, et c'est souvent ce qui les départage avant l'horaire.
 *
 * Les itinéraires sont recalculés à chaque ouverture : un trajet favori garde
 * ses deux bouts, jamais son chemin.
 */

import { useEffect, useState } from 'react';
import { LineCloud } from './LineCloud';
import { MinimalScreen, type MinimalScreenAction } from './MinimalScreen';
import { minutesUntilClock, formatWait } from '../utils/favoriteDepartures';
import { planItineraries, type RouteItinerary } from '../services/api';
import type { FavoriteJourney } from '../services/favoriteJourneys';

/** Cinq départs : au-delà, on ne planifie plus sa matinée, on lit un horaire. */
const MAX_OPTIONS = 5;
const REFRESH_MS = 60_000;

/** L'intitulé d'un trajet quand l'utilisateur ne lui en a pas donné. */
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
  /** Ouvre le trajet dans le planificateur, sans itinéraire choisi. */
  onOpenInPlanner: () => void;
  /** Ouvre la fiche de l'itinéraire touché — celui-là, pas un autre. */
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
              // C'est bien celui-ci qu'on ouvre, pas le meilleur du moment :
              // avoir touché le départ de 8h34 et se retrouver sur celui de
              // 8h12 serait un tour de passe-passe.
              onClick={() => onOpenItinerary(itinerary)}
              className={`flex w-full gap-3 px-5 py-6 text-left transition active:scale-[0.99] ${
                index > 0 ? `border-t ${separatorClass}` : ''
              }`}
            >
              <span className="flex-shrink-0 pt-1">
                {/* Un trajet entièrement à pied n'a pas de lignes : la colonne
                    reste vide plutôt que de porter un badge inventé. */}
                <LineCloud lines={itinerary.lineKeys} disruptedLines={disruptedLines} />
              </span>

              <div className="min-w-0 flex-1">
                <h3 className="text-[22px] font-bold leading-tight">
                  {itinerary.dep} → {itinerary.arr}
                </h3>

                <p className={`mt-4 text-[11px] font-bold uppercase tracking-[0.14em] ${mutedClass}`}>
                  {isFr ? 'Partir dans' : 'Leave in'}
                </p>
                <p className="tabular text-[34px] font-semibold leading-none">
                  {leaveIn == null ? itinerary.dep : formatWait(Math.max(leaveIn, 0), language)}
                </p>

                <p className={`mt-3 text-[11px] font-bold uppercase tracking-[0.14em] ${mutedClass}`}>
                  {isFr ? 'Durée' : 'Duration'}
                </p>
                <p className="tabular text-[34px] font-semibold leading-none text-slate-500">
                  {itinerary.dur}
                </p>
              </div>
            </button>
          );
        })
      )}
    </MinimalScreen>
  );
}
