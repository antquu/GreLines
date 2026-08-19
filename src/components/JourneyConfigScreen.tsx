/**
 * La configuration des trajets favoris.
 *
 * On y arrive depuis le rectangle de la page Favoris, et la page entre par la
 * droite : c'est un cran plus loin dans les favoris, pas un écran voisin.
 *
 * Ce qu'on y voit d'abord, ce sont les trajets qu'on a déjà faits. C'est la
 * bonne matière première : un favori, c'est presque toujours un trajet qu'on
 * vient de refaire pour la troisième fois. Le saisir à nouveau de zéro serait
 * une corvée qu'on s'inflige pour rien — d'où le bouton « Nouveau trajet »
 * relégué en bas, fixe au-dessus du défilement : il reste sous le pouce, mais
 * il n'est pas le premier chemin proposé.
 */

import { ArrowLeftIcon, ArrowRightIcon, PlusIcon, TrashIcon, CheckIcon } from '@heroicons/react/24/solid';
import { LineBadge } from './LineBadge';
import {
  removeJourneyHistoryEntry,
  type JourneyHistoryEntry,
} from '../services/journeyHistory';
import { FAVORITE_JOURNEYS_MAX, type FavoriteJourney } from '../services/favoriteJourneys';

interface JourneyConfigScreenProps {
  isOpen: boolean;
  language: 'fr' | 'en';
  theme?: 'light' | 'dark';
  history: JourneyHistoryEntry[];
  favorites: FavoriteJourney[];
  onClose: () => void;
  /** Demande l'ajout d'un trajet de l'historique : la question passe par la popup. */
  onPickFromHistory: (entry: JourneyHistoryEntry) => void;
  /** Ouvre la recherche d'itinéraire, un cran plus loin encore. */
  onNewJourney: () => void;
}

const getText = (language: 'fr' | 'en') => {
  const isFr = language === 'fr';
  return {
    title: isFr ? 'Trajets favoris' : 'Favorite journeys',
    historyTitle: isFr ? 'Trajets réalisés' : 'Past journeys',
    empty: isFr
      ? 'Aucun trajet réalisé pour l’instant. Calcule un itinéraire, et il apparaîtra ici.'
      : 'No past journeys yet. Plan a route and it will show up here.',
    newJourney: isFr ? 'Nouveau trajet' : 'New journey',
    back: isFr ? 'Retour' : 'Back',
    remove: isFr ? 'Retirer de l’historique' : 'Remove from history',
    alreadySaved: isFr ? 'Déjà en favori' : 'Already saved',
    add: isFr ? 'Ajouter aux favoris' : 'Add to favorites',
    count: (n: number) =>
      isFr ? `${n} / ${FAVORITE_JOURNEYS_MAX} trajets en favori` : `${n} / ${FAVORITE_JOURNEYS_MAX} favorite journeys`,
    times: (n: number) => (isFr ? `${n} fois` : `${n}×`),
  };
};

/** « Aujourd'hui », « hier », puis la date — un historique se lit en relatif. */
function formatWhen(timestamp: number, language: 'fr' | 'en'): string {
  const isFr = language === 'fr';
  const day = new Date(timestamp);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const days = Math.floor((startOfToday - new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime()) / 86_400_000);

  if (days <= 0) return isFr ? "Aujourd'hui" : 'Today';
  if (days === 1) return isFr ? 'Hier' : 'Yesterday';
  if (days < 7) return isFr ? `Il y a ${days} jours` : `${days} days ago`;
  return day.toLocaleDateString(isFr ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'short' });
}

export function JourneyConfigScreen({
  isOpen,
  language,
  theme = 'dark',
  history,
  favorites,
  onClose,
  onPickFromHistory,
  onNewJourney,
}: JourneyConfigScreenProps) {
  const text = getText(language);
  const isLight = theme === 'light';
  const surfaceClass = isLight ? 'border-slate-200 bg-white' : 'border-slate-800 bg-slate-900/70';
  const titleClass = isLight ? 'text-slate-900' : 'text-white';
  const mutedClass = isLight ? 'text-slate-500' : 'text-slate-400';

  const savedIds = new Set(favorites.map(entry => entry.id));

  return (
    <div
      className={`fixed inset-0 z-[900] flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      } ${isLight ? 'bg-slate-50 text-slate-900' : 'bg-slate-950 text-white'}`}
      style={{ pointerEvents: isOpen ? 'auto' : 'none' }}
      aria-hidden={!isOpen}
    >
      <header
        className="flex flex-shrink-0 items-center gap-1 px-2 pb-2"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 0.5rem)' }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={text.back}
          className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full transition active:scale-95 ${
            isLight ? 'text-slate-700 active:bg-slate-200' : 'text-slate-200 active:bg-slate-800'
          }`}
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </button>
        <h2 className={`min-w-0 flex-1 truncate text-base font-bold ${titleClass}`}>{text.title}</h2>
        <span className={`flex-shrink-0 pr-3 text-xs font-semibold ${mutedClass}`}>
          {text.count(favorites.length)}
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6">
        <h3 className={`mb-3 px-1 text-sm font-semibold leading-none ${mutedClass}`}>{text.historyTitle}</h3>

        {history.length === 0 ? (
          <p className={`rounded-[28px] border px-5 py-6 text-center text-sm ${surfaceClass} ${mutedClass}`}>
            {text.empty}
          </p>
        ) : (
          <div className="space-y-2">
            {history.map(entry => {
              const saved = savedIds.has(entry.id);
              return (
                <div
                  key={entry.id}
                  className={`flex items-stretch gap-2 rounded-[26px] border p-3 ${surfaceClass}`}
                >
                  <button
                    type="button"
                    onClick={() => !saved && onPickFromHistory(entry)}
                    disabled={saved}
                    className="min-w-0 flex-1 text-left disabled:opacity-60"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`min-w-0 flex-1 truncate text-[15px] font-bold ${titleClass}`}>
                        {entry.from.label}
                      </span>
                      <ArrowRightIcon className={`h-4 w-4 flex-shrink-0 ${mutedClass}`} />
                      <span className={`min-w-0 flex-1 truncate text-[15px] font-bold ${titleClass}`}>
                        {entry.to.label}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                        {entry.lines.slice(0, 5).map((line, index) => (
                          <LineBadge key={`${line}-${index}`} line={{ id: line, shortName: line }} size="xs" />
                        ))}
                      </span>
                      <span className={`flex-shrink-0 text-xs ${mutedClass}`}>
                        {formatWhen(entry.lastAt, language)}
                        {entry.count > 1 && ` · ${text.times(entry.count)}`}
                        {entry.duration && ` · ${entry.duration}`}
                      </span>
                    </div>
                  </button>

                  <div className="flex flex-shrink-0 flex-col items-center justify-center gap-1">
                    {saved ? (
                      <span
                        title={text.alreadySaved}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500/15 text-blue-500"
                      >
                        <CheckIcon className="h-4 w-4" />
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onPickFromHistory(entry)}
                        aria-label={text.add}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500/15 text-blue-500 transition active:scale-90"
                      >
                        <PlusIcon className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeJourneyHistoryEntry(entry.id)}
                      aria-label={text.remove}
                      className={`flex h-9 w-9 items-center justify-center rounded-full transition active:scale-90 ${mutedClass}`}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Le bouton ne défile pas avec la liste : c'est l'action de la page, et
          une action qu'on doit faire défiler pour retrouver n'en est plus une. */}
      <div
        className={`flex-shrink-0 border-t px-4 pt-3 ${
          isLight ? 'border-slate-200 bg-white/95' : 'border-slate-800 bg-slate-950/95'
        } backdrop-blur`}
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)' }}
      >
        <button
          type="button"
          onClick={onNewJourney}
          disabled={favorites.length >= FAVORITE_JOURNEYS_MAX}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-40"
        >
          <PlusIcon className="h-5 w-5" />
          {text.newJourney}
        </button>
      </div>
    </div>
  );
}
