/**
 * « Voulez-vous ajouter ce trajet ? »
 *
 * Une boîte au centre, pas une feuille par le bas : ce n'est pas un formulaire
 * qu'on remplit mais une question fermée, et on doit pouvoir y répondre sans
 * changer de position. Elle redit le trajet en entier — départ, arrivée et
 * lignes — parce qu'on l'ajoute d'après une liste de résultats où trois lignes
 * se ressemblent.
 */

import { ArrowRightIcon } from '@heroicons/react/24/solid';
import { LineBadge } from './LineBadge';
import type { RouteLocation } from '../services/api';

export interface PendingJourney {
  from: RouteLocation;
  to: RouteLocation;
  /** Les lignes de l'itinéraire choisi — elles habilleront l'onglet. */
  lines: string[];
}

export function AddJourneyDialog({
  journey,
  language,
  isLight,
  /** La liste est pleine : on le dit au lieu d'ajouter dans le vide. */
  isFull,
  onConfirm,
  onCancel,
}: {
  journey: PendingJourney | null;
  language: 'fr' | 'en';
  isLight: boolean;
  isFull: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!journey) return null;
  const isFr = language === 'fr';

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-6" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label={isFr ? 'Annuler' : 'Cancel'}
        onClick={onCancel}
        className="absolute inset-0 bg-black/60"
      />

      <div
        className={`gl-drop relative w-full max-w-sm rounded-3xl border p-5 shadow-2xl ${
          isLight
            ? 'border-slate-200 bg-white text-slate-900'
            : 'border-slate-800 bg-slate-950 text-white'
        }`}
      >
        <h3 className="mb-4 text-lg font-extrabold leading-tight">
          {isFr ? 'Ajouter ce trajet aux favoris ?' : 'Add this journey to favorites?'}
        </h3>

        <div
          className={`mb-4 space-y-2 rounded-2xl border p-3.5 ${
            isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-900'
          }`}
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{journey.from.label}</span>
            <ArrowRightIcon className="h-4 w-4 flex-shrink-0 text-slate-400" />
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{journey.to.label}</span>
          </div>
          {journey.lines.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {journey.lines.slice(0, 6).map((line, index) => (
                <LineBadge key={`${line}-${index}`} line={{ id: line, shortName: line }} size="xs" />
              ))}
            </div>
          )}
        </div>

        {isFull ? (
          <p className="mb-4 text-sm font-medium text-amber-500">
            {isFr
              ? 'La liste des trajets favoris est pleine. Retires-en un pour ajouter celui-ci.'
              : 'Your favorite journeys are full. Remove one to add this.'}
          </p>
        ) : (
          <p className={`mb-4 text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            {isFr
              ? 'Il apparaîtra comme onglet dans vos favoris. Appui long sur l’onglet pour le renommer.'
              : 'It will appear as a tab in your favorites. Long-press the tab to rename it.'}
          </p>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className={`flex-1 rounded-2xl border py-3.5 text-sm font-bold transition active:scale-[0.98] ${
              isLight ? 'border-slate-200 bg-white text-slate-700' : 'border-slate-800 bg-slate-900 text-slate-200'
            }`}
          >
            {isFr ? 'Non' : 'No'}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isFull}
            className="flex-1 rounded-2xl bg-blue-600 py-3.5 text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-40"
          >
            {isFr ? 'Oui, ajouter' : 'Yes, add'}
          </button>
        </div>
      </div>
    </div>
  );
}
