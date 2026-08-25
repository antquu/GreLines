/**
 * L'écran Favoris.
 *
 * Une page d'index, et rien de plus. Deux listes de rangées — les arrêts, les
 * trajets — où chaque rangée dit trois choses et s'arrête là : par quelles
 * lignes, vers quoi, et un chevron. Ce n'est pas ici qu'on lit ses horaires,
 * c'est ici qu'on choisit lequel on va lire.
 *
 * Les arrêts portent leurs badges de ligne en clair ; les trajets, une grappe
 * de toutes les lignes qu'ils empruntent — un trajet n'a pas d'icône propre, il
 * n'a que ses lignes, et leur couleur suffit à le reconnaître avant le titre.
 *
 * Toucher une rangée fait entrer sa page par la droite. Les actions — retirer,
 * renommer, ouvrir sur la carte — vivent là-bas, derrière les trois points :
 * une page d'index n'a pas à porter les outils de ce qu'elle indexe.
 *
 * Comme le Compte, c'est une page et non une feuille : elle occupe l'écran du
 * haut en bas et passe sous la barre d'onglets, qui ne bouge pas. Elle entre
 * par le côté d'où l'on vient — par la droite depuis « Autour », par la gauche
 * depuis « Compte » — de sorte que les quatre écrans forment une bande qu'on
 * fait défiler latéralement, et non quatre portes qui s'ouvrent au même
 * endroit.
 */

import { useEffect, useRef, useState } from 'react';
import { ChevronRightIcon } from '@heroicons/react/24/solid';
import { LineBadge } from './LineBadge';
import { LineCloud } from './LineCloud';
import { MarqueeText } from './MarqueeText';
import { FavoriteStopScreen } from './FavoriteStopScreen';
import { FavoriteJourneyScreen, defaultJourneyTitle } from './FavoriteJourneyScreen';
import { favoriteStopLines } from '../utils/favoriteDepartures';
import { removeFavoriteAndNotify } from '../services/favorites';
import {
  removeFavoriteJourney,
  renameFavoriteJourney,
  type FavoriteJourney,
} from '../services/favoriteJourneys';
import type { FavoriteDetail } from '../hooks/useFavoriteDetails';
import type { AllLinesLine } from '../services/allLines';
import type { RouteItinerary } from '../services/api';

/** Au-delà, la rangée n'est plus lisible : le reste se compte. */
const MAX_ROW_BADGES = 3;

interface FavoritesScreenProps {
  isOpen: boolean;
  /**
   * Le bord où la page se range quand elle est fermée — donc celui par lequel
   * elle entre et repart. `left` quand le Compte occupe la page (il est à sa
   * droite dans la barre d'onglets), `right` sinon.
   */
  side: 'left' | 'right';
  language: 'fr' | 'en';
  theme?: 'light' | 'dark';
  /** Les arrêts favoris et leurs passages, déjà chargés et rafraîchis par l'app. */
  stopDetails: FavoriteDetail[];
  journeys: FavoriteJourney[];
  /** Codes des lignes perturbées, en majuscules — pour les pastilles d'alerte. */
  disruptedLines?: Set<string>;
  /** Catalogue des lignes : il donne leur famille, et donc leur ordre. */
  lineLookup?: Map<string, AllLinesLine> | null;
  /**
   * Ouvre la fiche d'un arrêt sur la carte — la page se referme derrière. Avec
   * une ligne, la fiche s'ouvre filtrée sur elle.
   */
  onOpenStop: (stopId: string, lineId?: string) => void;
  /** Rejoue un trajet dans le planificateur, avec un itinéraire déjà choisi ou non. */
  onOpenJourney: (journey: FavoriteJourney, itinerary?: RouteItinerary) => void;
  /** Ouvre la page de configuration : historique et ajout de trajets. */
  onConfigureJourneys: () => void;
  /** L'écran défile : la barre d'onglets se resserre sur ses icônes. */
  onScrolledChange?: (scrolled: boolean) => void;
}

const getText = (language: 'fr' | 'en') => {
  const isFr = language === 'fr';
  return {
    title: isFr ? 'Favoris' : 'Favorites',
    stops: isFr ? 'Arrêts' : 'Stops',
    journeys: isFr ? 'Trajets' : 'Journeys',
    noStops: isFr
      ? 'Aucun arrêt en favori. Ouvre un arrêt et touche l’étoile pour le garder ici.'
      : 'No favorite stops yet. Open a stop and tap the star to keep it here.',
    noJourneys: isFr ? 'Aucun trajet en favori pour l’instant.' : 'No favorite journeys yet.',
    configure: isFr ? 'Configurez vos trajets favoris' : 'Set up your favorite journeys',
    rename: isFr ? 'Renommer' : 'Rename',
    renameHint: isFr
      ? 'Laisse vide pour revenir au nom par défaut.'
      : 'Leave empty to restore the default name.',
    save: isFr ? 'Enregistrer' : 'Save',
    cancel: isFr ? 'Annuler' : 'Cancel',
  };
};

export function FavoritesScreen({
  isOpen,
  side,
  language,
  theme = 'dark',
  stopDetails,
  journeys,
  disruptedLines,
  lineLookup,
  onOpenStop,
  onOpenJourney,
  onConfigureJourneys,
  onScrolledChange,
}: FavoritesScreenProps) {
  const text = getText(language);
  const isLight = theme === 'light';
  const lastScrollRef = useRef(0);

  /** Le favori ouvert en grand, s'il y en a un. Un seul à la fois. */
  const [openStopId, setOpenStopId] = useState<string | null>(null);
  const [openJourneyId, setOpenJourneyId] = useState<string | null>(null);
  /** Trajet en cours de renommage, ou `null`. */
  const [renaming, setRenaming] = useState<FavoriteJourney | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setOpenStopId(null);
      setOpenJourneyId(null);
      setRenaming(null);
    }
  }, [isOpen]);

  const lastStopRef = useRef<FavoriteDetail | undefined>(undefined);
  const lastJourneyRef = useRef<FavoriteJourney | undefined>(undefined);
  const openStop = stopDetails.find(entry => entry.favorite.stopId === openStopId);
  const openJourney = journeys.find(entry => entry.id === openJourneyId);
  if (openStop) lastStopRef.current = openStop;
  if (openJourney) lastJourneyRef.current = openJourney;

  const surfaceClass = isLight ? 'border-slate-200 bg-white' : 'border-slate-800 bg-slate-900/70';
  const titleClass = isLight ? 'text-slate-900' : 'text-white';
  const mutedClass = isLight ? 'text-slate-500' : 'text-slate-400';
  const rowClass = `flex w-full items-center gap-3 rounded-[26px] border px-3.5 py-3 text-left transition active:scale-[0.99] ${surfaceClass}`;

  return (
    <>
      <div
        className={`fixed inset-0 z-[5] flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          isOpen ? 'translate-x-0' : side === 'left' ? '-translate-x-full' : 'translate-x-full'
        } ${isLight ? 'bg-slate-50 text-slate-900' : 'bg-slate-950 text-white'}`}
        style={{ pointerEvents: isOpen ? 'auto' : 'none' }}
        aria-hidden={!isOpen}
      >
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-40"
          style={{ paddingTop: 'max(env(safe-area-inset-top), 1.25rem)' }}
          onScroll={event => {
            const top = event.currentTarget.scrollTop;
            const previous = lastScrollRef.current;
            lastScrollRef.current = top;
            if (top <= 8) onScrolledChange?.(false);
            else if (top > previous + 2) onScrolledChange?.(true);
            else if (top < previous - 2) onScrolledChange?.(false);
          }}
        >
          <h2 className={`mb-5 px-1 text-[28px] font-extrabold leading-none ${titleClass}`}>
            {text.title}
          </h2>

          {/* ── Arrêts ─────────────────────────────────────────────────── */}
          <section className="mb-9">
            <h3 className={`mb-3 px-1 text-sm font-semibold leading-none ${mutedClass}`}>{text.stops}</h3>

            {stopDetails.length === 0 ? (
              <p className={`rounded-[28px] border px-5 py-6 text-center text-sm ${surfaceClass} ${mutedClass}`}>
                {text.noStops}
              </p>
            ) : (
              <div className="space-y-2">
                {stopDetails.map(entry => {
                  const lines = favoriteStopLines(entry, lineLookup);
                  const shown = lines.slice(0, MAX_ROW_BADGES);
                  const extra = lines.length - shown.length;
                  return (
                    /* La rangée n'est pas un seul bouton : les badges en sont
                       chacun un. Toucher le « C1 » ouvre l'arrêt filtré sur le
                       C1 ; toucher le reste de la rangée ouvre sa page. Deux
                       intentions différentes, deux cibles. */
                    <div key={entry.favorite.stopId} className={rowClass}>
                      {/* Les lignes d'abord : c'est par elles qu'on retrouve un
                          arrêt dans une liste, avant même de lire son nom. */}
                      <span className="flex flex-shrink-0 items-center gap-1">
                        {shown.map(line => (
                          <button
                            key={line.lineId}
                            type="button"
                            onClick={() => onOpenStop(entry.favorite.stopId, line.lineId)}
                            className="transition active:scale-90"
                            aria-label={`${line.shortName} — ${entry.favorite.stopName}`}
                          >
                            <LineBadge
                              line={{
                                id: line.lineId,
                                shortName: line.shortName,
                                color: line.color || undefined,
                                textColor: line.textColor || undefined,
                                hasTraffic: disruptedLines?.has(line.shortName.toUpperCase()),
                              }}
                              size="xs"
                            />
                          </button>
                        ))}
                        {extra > 0 && (
                          <span className={`text-xs font-bold ${mutedClass}`}>+{extra}</span>
                        )}
                      </span>

                      <button
                        type="button"
                        onClick={() => setOpenStopId(entry.favorite.stopId)}
                        className={`flex min-w-0 flex-1 items-center gap-3 text-left ${titleClass}`}
                      >
                        <span className="min-w-0 flex-1">
                          {/* Un nom d'arrêt long défile plutôt que d'être coupé :
                              « Grenoble, Hubert Dubedout — Maison du T… » ne dit
                              plus lequel des deux arrêts on regarde. */}
                          <MarqueeText text={entry.favorite.stopName} className="text-[16px] font-semibold" gap={40} />
                          {entry.favorite.city && (
                            <span className={`block truncate text-xs ${mutedClass}`}>{entry.favorite.city}</span>
                          )}
                        </span>
                        <ChevronRightIcon className={`h-5 w-5 flex-shrink-0 ${mutedClass}`} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── Trajets ────────────────────────────────────────────────── */}
          <section>
            <h3 className={`mb-3 px-1 text-sm font-semibold leading-none ${mutedClass}`}>{text.journeys}</h3>

            {journeys.length === 0 ? (
              <p className={`rounded-[28px] border px-5 py-6 text-center text-sm ${surfaceClass} ${mutedClass}`}>
                {text.noJourneys}
              </p>
            ) : (
              <div className="space-y-2">
                {journeys.map(journey => (
                  <button
                    key={journey.id}
                    type="button"
                    onClick={() => setOpenJourneyId(journey.id)}
                    className={rowClass}
                  >
                    <LineCloud
                      lines={journey.lines ?? []}
                      size="md"
                      disruptedLines={disruptedLines}
                    />
                    <span className={`min-w-0 flex-1 ${titleClass}`}>
                      <MarqueeText
                        text={journey.name || defaultJourneyTitle(journey)}
                        className="text-[16px] font-semibold"
                        gap={40}
                      />
                    </span>
                    <ChevronRightIcon className={`h-5 w-5 flex-shrink-0 ${mutedClass}`} />
                  </button>
                ))}
              </div>
            )}

            {/* L'entrée de la configuration. Un rectangle plein largeur plutôt
                qu'une étoile perdue dans le planificateur : ajouter un trajet
                favori se fait ici, depuis l'endroit où on les consulte. */}
            <button
              type="button"
              onClick={onConfigureJourneys}
              className={`mt-3 flex w-full items-center gap-3 rounded-[26px] border px-4 py-4 text-left transition active:scale-[0.99] ${surfaceClass}`}
            >
              <span className={`min-w-0 flex-1 text-[15px] font-bold ${titleClass}`}>{text.configure}</span>
              <ChevronRightIcon className={`h-5 w-5 flex-shrink-0 ${mutedClass}`} />
            </button>
          </section>
        </div>
      </div>

      <FavoriteStopScreen
        detail={openStop ?? lastStopRef.current}
        isOpen={Boolean(openStop)}
        language={language}
        isLight={isLight}
        lineLookup={lineLookup}
        onBack={() => setOpenStopId(null)}
        onOpenStop={lineId => {
          const stopId = openStopId;
          setOpenStopId(null);
          if (stopId) onOpenStop(stopId, lineId);
        }}
        onRemove={() => {
          if (openStopId) removeFavoriteAndNotify(openStopId);
          setOpenStopId(null);
        }}
      />

      <FavoriteJourneyScreen
        journey={openJourney ?? lastJourneyRef.current}
        isOpen={Boolean(openJourney)}
        language={language}
        isLight={isLight}
        disruptedLines={disruptedLines}
        onBack={() => setOpenJourneyId(null)}
        onOpenInPlanner={() => {
          const journey = openJourney;
          setOpenJourneyId(null);
          if (journey) onOpenJourney(journey);
        }}
        onOpenItinerary={itinerary => {
          const journey = openJourney;
          setOpenJourneyId(null);
          if (journey) onOpenJourney(journey, itinerary);
        }}
        onRename={() => setRenaming(openJourney ?? null)}
        onRemove={() => {
          if (openJourneyId) removeFavoriteJourney(openJourneyId);
          setOpenJourneyId(null);
        }}
      />

      <RenameSheet
        journey={renaming}
        isLight={isLight}
        text={text}
        onClose={() => setRenaming(null)}
        onSave={name => {
          if (renaming) renameFavoriteJourney(renaming.id, name);
          setRenaming(null);
        }}
      />
    </>
  );
}

/**
 * Le renommage d'un trajet.
 *
 * Une feuille par-dessus la page, pas une boîte de dialogue du navigateur : le
 * clavier monte, le champ reste au-dessus, et le trajet qu'on renomme se lit
 * encore derrière.
 */
function RenameSheet({
  journey,
  isLight,
  text,
  onClose,
  onSave,
}: {
  journey: FavoriteJourney | null;
  isLight: boolean;
  text: ReturnType<typeof getText>;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (journey) setValue(journey.name ?? defaultJourneyTitle(journey));
  }, [journey]);

  if (!journey) return null;

  return (
    <div className="fixed inset-0 z-[1200] flex items-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label={text.cancel}
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />
      <div
        className={`gl-rise relative w-full rounded-t-3xl border-t p-5 ${
          isLight ? 'border-slate-200 bg-white text-slate-900' : 'border-slate-800 bg-slate-950 text-white'
        }`}
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1.25rem)' }}
      >
        <h3 className="mb-1 text-lg font-extrabold">{text.rename}</h3>
        <p className={`mb-4 text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{text.renameHint}</p>

        <input
          autoFocus
          value={value}
          onChange={event => setValue(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') onSave(value);
          }}
          placeholder={defaultJourneyTitle(journey)}
          maxLength={40}
          className={`mb-4 w-full rounded-2xl border px-4 py-3.5 text-base outline-none focus:border-blue-500 ${
            isLight ? 'border-slate-200 bg-slate-50 text-slate-900' : 'border-slate-800 bg-slate-900 text-white'
          }`}
        />

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className={`flex-1 rounded-2xl border py-3.5 text-sm font-bold transition active:scale-[0.98] ${
              isLight ? 'border-slate-200 bg-white text-slate-700' : 'border-slate-800 bg-slate-900 text-slate-200'
            }`}
          >
            {text.cancel}
          </button>
          <button
            type="button"
            onClick={() => onSave(value)}
            className="flex-1 rounded-2xl bg-blue-600 py-3.5 text-sm font-bold text-white transition active:scale-[0.98]"
          >
            {text.save}
          </button>
        </div>
      </div>
    </div>
  );
}
