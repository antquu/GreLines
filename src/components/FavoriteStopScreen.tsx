/**
 * Un arrêt favori, en grand.
 *
 * La page ne montre qu'une chose : par où l'on part, et dans combien de temps.
 * Une direction par bloc, séparés d'un trait ; le nom de la direction en gros
 * caractères qui reviennent à la ligne plutôt que de se faire couper — savoir
 * qu'on lit « Veurey Voiroize, La Rive » et non « Veurey Voiroize, Le Pont »
 * est tout l'enjeu ; puis le prochain passage et le suivant, chacun sous son
 * étiquette.
 *
 * Les deux temps ne sont pas côte à côte mais l'un sous l'autre, chacun annoncé
 * par son mot. C'est plus haut, et c'est le but : sur cette page on ne compare
 * pas six lignes d'un coup d'œil, on lit celle qu'on a choisie.
 */

import { ArrowRightIcon } from '@heroicons/react/24/solid';
import { LineBadge } from './LineBadge';
import { MinimalScreen, type MinimalScreenAction } from './MinimalScreen';
import { formatWait, groupFavoriteDepartures } from '../utils/favoriteDepartures';
import type { FavoriteDetail } from '../hooks/useFavoriteDetails';
import type { AllLinesLine } from '../services/allLines';

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
  /** L'arrêt affiché. Absent quand la page est fermée — elle garde sa coquille. */
  detail: FavoriteDetail | undefined;
  isOpen: boolean;
  language: 'fr' | 'en';
  isLight: boolean;
  /** Catalogue des lignes, qui donne leur famille et donc leur ordre. */
  lineLookup?: Map<string, AllLinesLine> | null;
  onBack: () => void;
  /**
   * Ouvre la vraie fiche de l'arrêt, sur la carte. Avec une ligne, la fiche
   * s'ouvre filtrée sur elle : on a touché une direction précise, pas l'arrêt.
   */
  onOpenStop: (lineId?: string) => void;
  onRemove: () => void;
}) {
  const isFr = language === 'fr';
  const groups = groupFavoriteDepartures(detail, lineLookup);

  const actions: MinimalScreenAction[] = [
    { label: isFr ? 'Voir l’arrêt sur la carte' : 'Show stop on the map', onSelect: () => onOpenStop() },
    { label: isFr ? 'Retirer des favoris' : 'Remove from favorites', onSelect: onRemove, destructive: true },
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
        <p className={`px-6 py-4 text-sm ${mutedClass}`}>{isFr ? 'Chargement…' : 'Loading…'}</p>
      ) : groups.length === 0 ? (
        <p className={`px-6 py-4 text-sm ${mutedClass}`}>
          {isFr ? 'Aucun passage prévu' : 'No upcoming departures'}
        </p>
      ) : (
        groups.map((group, index) => (
          <button
            key={`${group.lineId}|${group.destination}`}
            type="button"
            // Toucher une direction ouvre la fiche de l'arrêt filtrée sur sa
            // ligne : on vient de dire laquelle des dix on regarde, la fiche
            // n'a aucune raison de rouvrir les neuf autres.
            onClick={() => onOpenStop(group.lineId)}
            className={`flex w-full gap-3 px-5 py-6 text-left transition active:scale-[0.99] ${
              index > 0 ? `border-t ${separatorClass}` : ''
            }`}
          >
            {/* La flèche et le badge tiennent la colonne de gauche : ils disent
                « départ, ligne 20 » avant même qu'on lise la destination. */}
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
              {/* Pas de troncature : la destination passe à la ligne. Deux
                  directions d'une même ligne se ressemblent par le début. */}
              <h3 className="text-[22px] font-bold leading-tight">{group.destination}</h3>

              <p className={`mt-4 text-[11px] font-bold uppercase tracking-[0.14em] ${mutedClass}`}>
                {isFr ? 'Prochain' : 'Next'}
              </p>
              <p className="tabular text-[34px] font-semibold leading-none">
                {formatWait(group.times[0], language)}
              </p>

              <p className={`mt-3 text-[11px] font-bold uppercase tracking-[0.14em] ${mutedClass}`}>
                {isFr ? 'Suivant' : 'Following'}
              </p>
              <p className="tabular text-[34px] font-semibold leading-none text-slate-500">
                {formatWait(group.times[1], language)}
              </p>
            </div>
          </button>
        ))
      )}
    </MinimalScreen>
  );
}
