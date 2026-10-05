import { ArrowRightIcon } from '@heroicons/react/24/solid';
import { LineBadge } from './LineBadge';
import { MinimalScreen, type MinimalScreenAction } from './MinimalScreen';
import { formatWait, groupFavoriteDepartures } from '../utils/favoriteDepartures';
import { TheoreticalPill } from './TheoreticalPill';
import type { FavoriteDetail } from '../hooks/useFavoriteDetails';
import type { AllLinesLine } from '../services/allLines';
import { tx } from '../i18n';

export function FavoriteStopScreen({
  detail,
  isOpen,
  language,
  isLight,
  lineLookup,
  onBack,
  onOpenStop,
  onRemove,
}: {
  detail: FavoriteDetail | undefined;
  isOpen: boolean;
  language: 'fr' | 'en';
  isLight: boolean;
  lineLookup?: Map<string, AllLinesLine> | null;
  onBack: () => void;
  onOpenStop: (lineId?: string) => void;
  onRemove: () => void;
}) {
  const isFr = language === 'fr';
  const groups = groupFavoriteDepartures(detail, lineLookup);

  const actions: MinimalScreenAction[] = [
    { label: tx(isFr).favoriteStopScreen.showStopOnThe, onSelect: () => onOpenStop() },
    { label: tx(isFr).favoriteStopScreen.removeFromFavorites, onSelect: onRemove, destructive: true },
  ];

  const mutedClass = isLight ? 'text-slate-500' : 'text-slate-400';
  const separatorClass = isLight ? 'border-slate-200' : 'border-slate-800';

  return (
    <MinimalScreen
      isOpen={isOpen}
      title={detail?.favorite.stopName ?? ''}
      isLight={isLight}
      actions={actions}
      onBack={onBack}
    >
      {detail?.loading && groups.length === 0 ? (
        <p className={`px-6 py-4 text-sm ${mutedClass}`}>{tx(isFr).favoriteStopScreen.loading}</p>
      ) : groups.length === 0 ? (
        <p className={`px-6 py-4 text-sm ${mutedClass}`}>
          {tx(isFr).favoriteStopScreen.noUpcomingDepartures}
        </p>
      ) : (
        groups.map((group, index) => (
          <button
            key={`${group.lineId}|${group.destination}`}
            type="button"
            onClick={() => onOpenStop(group.lineId)}
            className={`flex w-full gap-3 px-5 py-6 text-left transition active:scale-[0.99] ${
              index > 0 ? `border-t ${separatorClass}` : ''
            }`}
          >
            <span className="flex flex-shrink-0 items-start gap-1.5 pt-1">
              <span
                className={`flex h-6 w-8 items-center justify-center rounded-md ${
                  isLight ? 'bg-slate-900 text-white' : 'bg-white text-slate-900'
                }`}
                aria-hidden
              >
                <ArrowRightIcon className="h-4 w-4" />
              </span>
              <LineBadge
                line={{
                  id: group.lineId,
                  shortName: group.shortName,
                  color: group.color || undefined,
                  textColor: group.textColor || undefined,
                }}
                size="xs"
              />
            </span>

            <div className="min-w-0 flex-1">
              <h3 className="text-[1.375rem] font-bold leading-tight">{group.destination}</h3>
              {group.theoretical && <div className="mt-1.5"><TheoreticalPill language={language} /></div>}

              <p className={`mt-4 text-[0.6875rem] font-bold uppercase tracking-[0.14em] ${mutedClass}`}>
                {tx(isFr).favoriteStopScreen.next}
              </p>
              <p className="tabular text-[2.125rem] font-semibold leading-none">
                {formatWait(group.times[0], language)}
              </p>

              <p className={`mt-3 text-[0.6875rem] font-bold uppercase tracking-[0.14em] ${mutedClass}`}>
                {tx(isFr).favoriteStopScreen.following}
              </p>
              <p className="tabular text-[2.125rem] font-semibold leading-none text-slate-500">
                {formatWait(group.times[1], language)}
              </p>
            </div>
          </button>
        ))
      )}
    </MinimalScreen>
  );
}
