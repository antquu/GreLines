import { MagnifyingGlassIcon, XMarkIcon, ArrowDownIcon } from '@heroicons/react/24/solid';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SearchHistoryItem, Stop, TrafficDetail } from '../types';
import type { AddressResult } from '../services/geocoding';
import type { AllLinesLine } from '../services/allLines';
import type { RouteLocation } from '../services/api';
import { SearchResultsList } from './SearchResultsList';
import { hapticTap } from '../utils/haptics';

interface SearchBarMobileProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  matchedStops: Stop[];
  matchedLines: AllLinesLine[];
  allLines: AllLinesLine[];
  stops: Stop[];
  searchHistoryItems: SearchHistoryItem[];
  searchPlaceholder: string;
  onStopClick: (stop: Stop) => void;
  onLineClick: (line: AllLinesLine) => void;
  isFocused: boolean;
  onFocus: (focused: boolean) => void;
  
  addressResults?: AddressResult[];
  
  onAddressClick?: (address: AddressResult) => void;
  language?: 'fr' | 'en';
  theme?: 'light' | 'dark';
  
  calculateItineraryWith?: string;
  /** Rend la barre dans le flux, pour l'en-tête de la feuille d'accueil. */
  inline?: boolean;
  /** L'état du trafic, pour dire « Service normal » ou l'alerte du jour sous une ligne. */
  trafficInfo?: Map<string, TrafficDetail[]>;
}

export const SearchBarMobile = ({
  searchQuery, onSearchChange, matchedStops, matchedLines, allLines, stops, searchHistoryItems,
  searchPlaceholder, onStopClick, onLineClick, isFocused, onFocus,
  addressResults = [], onAddressClick, language = 'fr', theme = 'dark', inline = false, trafficInfo,
}: SearchBarMobileProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const isLight = theme === 'light';

  /**
   * Plein écran quand la barre inline prend le focus.
   *
   * Repliée dans l'en-tête de la feuille d'accueil, la recherche est à
   * l'étroit : la liste flottait sur 68 % de l'écran, coincée sous la barre.
   * Focalisée, elle prend toute la page — même geste que le planificateur
   * d'itinéraire pour choisir un lieu — et on la referme en la tirant vers
   * le bas, pas seulement en la vidant ou en la quittant du doigt.
   */
  const wantOverlay = inline && isFocused;

  /*
   * L'ouverture et la fermeture sont deux temps distincts du montage.
   *
   * `showOverlay` dit si le plein écran existe dans le DOM ; `entered` dit
   * s'il est à sa position finale. Se refermer prend le même temps que
   * s'ouvrir : on éteint `entered` d'abord, pour que la barre redescende et
   * que le fond s'efface, et l'on ne démonte qu'une fois ce geste joué —
   * sans quoi la page disparaissait d'un coup, sans jamais reculer.
   */
  const OVERLAY_ANIM_MS = 260;
  const [showOverlay, setShowOverlay] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (wantOverlay) {
      setShowOverlay(true);
      return;
    }
    setEntered(false);
    const timer = window.setTimeout(() => setShowOverlay(false), OVERLAY_ANIM_MS);
    return () => window.clearTimeout(timer);
  }, [wantOverlay]);

  useEffect(() => {
    if (!showOverlay || !wantOverlay) return;
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [showOverlay, wantOverlay]);

  /** Le conteneur écouté pour le geste : toute la page, en-tête compris. */
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  /** La seule chose qui défile réellement : c'est son scrollTop qui compte. */
  const listRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<number | null>(null);
  const dragYRef = useRef(0);
  const [dragY, setDragY] = useState(0);
  const hasBuzzedRef = useRef(false);

  const DRAG_HINT_PX = 15;
  const DRAG_CLOSE_PX = 120;
  const isDragHintVisible = dragY > DRAG_HINT_PX;

  const closeOverlay = () => {
    inputRef.current?.blur();
    onFocus(false);
  };

  /*
   * Le plein écran vit dans un portail : un nouveau champ y naît, distinct de
   * celui qu'on vient de toucher, et le clavier retombe faute d'un doigt
   * dessus. On lui rend le focus ici, avant la peinture — assez tôt pour que
   * le clavier reste, ou revienne sans qu'on l'ait vu partir.
   */
  useLayoutEffect(() => {
    if (!showOverlay || !wantOverlay) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    /* Le curseur se pose parfois à côté du texte plutôt qu'au bon endroit —
       la position calculée au moment du focus, sur un champ qui vient de
       naître. Redonner la sélection au même endroit force le navigateur à
       la recalculer une fois la mise en page posée. */
    const caret = el.value.length;
    el.setSelectionRange(caret, caret);
  }, [showOverlay, wantOverlay]);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node || !showOverlay) return;

    const onStart = (event: TouchEvent) => {
      if ((listRef.current?.scrollTop ?? 0) > 0) return;
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [data-no-drag]')) return;
      dragStartRef.current = event.touches[0].clientY;
    };

    const onMove = (event: TouchEvent) => {
      if (dragStartRef.current == null) return;
      const offset = event.touches[0].clientY - dragStartRef.current;
      if (offset <= 0 || (listRef.current?.scrollTop ?? 0) > 0) {
        dragStartRef.current = null;
        hasBuzzedRef.current = false;
        if (dragYRef.current !== 0) {
          dragYRef.current = 0;
          setDragY(0);
        }
        return;
      }
      if (event.cancelable) event.preventDefault();
      if (offset > DRAG_HINT_PX && !hasBuzzedRef.current) {
        hasBuzzedRef.current = true;
        hapticTap();
      }
      dragYRef.current = offset;
      setDragY(offset);
    };

    const onEnd = () => {
      if (dragStartRef.current == null) return;
      dragStartRef.current = null;
      hasBuzzedRef.current = false;
      const shouldClose = dragYRef.current > DRAG_CLOSE_PX;
      dragYRef.current = 0;
      setDragY(0);
      if (shouldClose) closeOverlay();
    };

    node.addEventListener('touchstart', onStart, { passive: true });
    node.addEventListener('touchmove', onMove, { passive: false });
    node.addEventListener('touchend', onEnd);
    node.addEventListener('touchcancel', onEnd);
    return () => {
      node.removeEventListener('touchstart', onStart);
      node.removeEventListener('touchmove', onMove);
      node.removeEventListener('touchend', onEnd);
      node.removeEventListener('touchcancel', onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOverlay]);

  /*
   * `SearchResultsList` parle la langue du planificateur d'itinéraire
   * (`RouteLocation`), pas celle de cette barre. On y traduit chaque arrêt et
   * chaque adresse, en gardant l'original dans `raw` pour le rendre au choix.
   */
  const resultStops: RouteLocation[] = matchedStops.map(stop => ({
    id: stop.id,
    label: stop.name,
    lat: stop.lat,
    lon: stop.lon,
    kind: 'stop',
    raw: stop,
  }));
  const resultAddresses: RouteLocation[] = addressResults.map(address => ({
    id: address.id,
    label: address.label,
    lat: address.lat,
    lon: address.lon,
    kind: 'address',
    raw: address,
  }));

  /*
   * L'historique parle la même langue que les résultats : les mêmes traits
   * colorés sous un arrêt, le même service sous une ligne. Il n'y avait pas
   * de raison qu'il ait l'air d'un autre écran une fois la recherche vidée.
   */
  const historyStops: RouteLocation[] = searchHistoryItems
    .filter((item): item is Extract<SearchHistoryItem, { kind: 'stop' }> => item.kind === 'stop')
    .map(item => {
      const stop = stops.find(candidate => candidate.id === item.id) || stops.find(candidate => candidate.name === item.name);
      return {
        id: item.id,
        label: item.name,
        lat: stop?.lat ?? 0,
        lon: stop?.lon ?? 0,
        kind: 'stop' as const,
        raw: stop ?? { id: item.id, name: item.name, city: item.city, lat: 0, lon: 0 },
      };
    });
  const historyAddresses: RouteLocation[] = searchHistoryItems
    .filter((item): item is Extract<SearchHistoryItem, { kind: 'address' }> => item.kind === 'address')
    .map(item => ({
      id: item.id,
      label: item.name,
      lat: item.lat,
      lon: item.lon,
      kind: 'address' as const,
      raw: { id: item.id, label: item.name, name: item.name, context: item.context || '', lat: item.lat, lon: item.lon, score: 1 },
    }));
  const historyLines: AllLinesLine[] = searchHistoryItems
    .filter((item): item is Extract<SearchHistoryItem, { kind: 'line' }> => item.kind === 'line')
    .map(item =>
      allLines.find(candidate => candidate.id === item.id) ||
      allLines.find(candidate => candidate.shortName === item.shortName),
    )
    .filter((line): line is AllLinesLine => Boolean(line));

  const isSearching = searchQuery.trim() !== '';
  const activeStops = isSearching ? resultStops : historyStops;
  const activeAddresses = isSearching ? resultAddresses : historyAddresses;
  const activeLines = isSearching ? matchedLines : historyLines;
  const hasActiveResults = activeStops.length > 0 || activeAddresses.length > 0 || activeLines.length > 0;

  const showDropdown =
    isFocused &&
    (searchQuery.trim() !== ''
      ? true 
      : searchHistoryItems.length > 0);

  const closeAfterSelection = () => {
    inputRef.current?.blur();
    onSearchChange('');
    onFocus(false);
  };

  const handleSelectStop = (stop: Stop) => {
    closeAfterSelection();
    onStopClick(stop);
  };

  const handleSelectAddress = (address: AddressResult) => {
    closeAfterSelection();
    onAddressClick?.(address);
  };

  const noResultsLabel = language === 'fr' ? 'Aucun résultat' : 'No results';
  const clearLabel = language === 'fr' ? 'Effacer la recherche' : 'Clear search';
  const mobilePlaceholder = language === 'fr' ? 'On va où ?' : 'Where to?';
  const dragToCloseLabel = language === 'fr' ? 'Glissez vers le bas pour fermer' : 'Swipe down to close';

  /*
   * À l'ouverture, la barre monte à sa position finale et le fond apparaît en
   * fondu ; à la fermeture, elle redescend à sa position de base pendant que
   * le fond s'efface — le même mouvement joué à l'envers. Le glissement du
   * doigt prend le dessus tant qu'il dure : `dragY` remplace alors le
   * décalage d'entrée.
   */
  const restingOffsetPx = entered ? 0 : 18;
  const overlayOffsetPx = dragY > 0 ? dragY : restingOffsetPx;

  const content = (
    <div
      className={
        showOverlay
          ? 'fixed inset-0 z-[1000] flex flex-col'
          : inline
            ? 'relative w-full'
            : 'fixed left-4 right-4 top-[max(0.75rem,env(safe-area-inset-top))]'
      }
      style={
        showOverlay
          ? {
              transform: overlayOffsetPx !== 0 ? `translateY(${overlayOffsetPx}px)` : undefined,
              opacity: entered || dragY > 0 ? 1 : 0,
              transition: dragY > 0 ? 'none' : 'transform 260ms cubic-bezier(0.32,0.72,0,1), opacity 220ms ease',
            }
          : inline
            ? undefined
            : { zIndex: 5 }
      }
    >
      {/* Plein écran, le fond prend la couleur du thème : c'est ici, et nulle
          part ailleurs sur la page, qu'on cherche — même surface que le
          planificateur d'itinéraire. */}
      {showOverlay && (
        <div
          className={`pointer-events-none absolute inset-0 -z-10 ${isLight ? 'bg-slate-50' : 'bg-slate-950'}`}
          aria-hidden
        />
      )}

      <div
        ref={showOverlay ? scrollerRef : undefined}
        className={showOverlay ? 'flex min-h-0 flex-1 flex-col' : 'relative transition-all duration-300 ease-out'}
        style={showOverlay ? { paddingTop: 'max(0.75rem, env(safe-area-inset-top))' } : undefined}
      >

        {/* Search input — wider on mobile, fixed at top */}
        <div
          className={`flex flex-shrink-0 items-center gap-3 px-4 border backdrop-blur-xl shadow-2xl transition-all duration-300 rounded-[28px] ${showOverlay ? 'mx-3' : ''} ${
            isLight
              ? isFocused
                ? 'border-blue-300 bg-white shadow-blue-200/50'
                : 'border-slate-200 bg-white/95 shadow-slate-200/60'
              : isFocused
                ? 'border-emerald-300/50 bg-slate-950/95 shadow-emerald-950/30'
                : 'border-white/10 bg-slate-950/82 shadow-black/30'
          }`}
          style={{ height: '58px' }}
        >
          <MagnifyingGlassIcon className={`h-6 w-6 flex-shrink-0 ${isLight ? 'text-slate-500' : 'text-white/90'}`} />
          <input
            ref={inputRef}
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            onFocus={() => onFocus(true)}
            onBlur={() => {
              /* Les résultats retirent le focus sur `mousedown`, avant le
                 clic : ce blur-ci n'est donc jamais celui d'un choix. */
              if (!searchQuery) onFocus(false);
            }}
            placeholder={isFocused ? searchPlaceholder : mobilePlaceholder}
            className={`min-w-0 flex-1 border-none bg-transparent text-[18px] font-semibold outline-none ${
              isLight ? 'text-slate-900 placeholder-slate-400' : 'text-white placeholder-slate-400'
            }`}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          {searchQuery && (
            <button
              onPointerDown={e => {
                e.preventDefault();
                onSearchChange('');
                inputRef.current?.focus();
              }}
              type="button"
              className={`w-7 h-7 flex items-center justify-center rounded-full flex-shrink-0 transition ${
                isLight ? 'bg-slate-200 active:bg-slate-300' : 'bg-slate-700 active:bg-slate-600'
              }`}
              aria-label={clearLabel}
            >
              <XMarkIcon className={`w-4 h-4 ${isLight ? 'text-slate-600' : 'text-slate-300'}`} />
            </button>
          )}
        </div>

        {/* Dropdown */}
        {showDropdown && (
          <div
            ref={showOverlay ? listRef : undefined}
            /*
             * Le geste vertical appartient à la liste, pas à la feuille.
             *
             * `pan-y` le dit au navigateur, et `overscroll-contain` l'empêche
             * de repasser la main à ce qu'il y a derrière une fois la liste
             * arrivée en bout. La feuille d'accueil, elle, suspend sa propre
             * poignée tant que la recherche est ouverte — c'est son affaire,
             * pas celle de cette liste, qui sert aussi flottante sur la carte.
             *
             * En plein écran, la liste tient tout le bas de page et le
             * glissement depuis son sommet referme la recherche — le même
             * geste que la fiche d'itinéraire.
             */
            className={
              showOverlay
                ? 'mt-3 min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain'
                : `absolute left-0 right-0 top-[66px] max-h-[68vh] touch-pan-y overflow-y-auto overscroll-contain rounded-[28px] border backdrop-blur-xl shadow-2xl ${
                    isLight
                      ? 'border-slate-200 bg-white/95 shadow-slate-300/50'
                      : 'border-white/10 bg-[#15161a]/96 shadow-black/40'
                  }`
            }
          >

            {hasActiveResults ? (
              /* Même liste, même lecture, qu'on tape une recherche ou qu'on
                 retrouve l'historique : un trait à la couleur de la ligne et
                 l'état de son service, ou les couleurs de ce qui dessert un
                 arrêt, en dessous de son nom — comme dans le planificateur
                 d'itinéraire. */
              <SearchResultsList
                lines={activeLines}
                stops={activeStops}
                addresses={activeAddresses}
                language={language}
                isLight={isLight}
                trafficInfo={trafficInfo}
                onSelectLocation={location => {
                  if (location.kind === 'stop') handleSelectStop(location.raw as Stop);
                  else handleSelectAddress(location.raw as AddressResult);
                }}
                onSelectLine={onLineClick}
              />
            ) : (
              isSearching && (
                <div className={`px-5 py-7 text-center text-sm ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  {noResultsLabel}
                </div>
              )
            )}
          </div>
        )}
      </div>

      {/* Le voile de fermeture. Posé par-dessus la page mais translucide : la
          recherche et ses résultats restent lisibles dessous, simplement
          grisés. Il ne prend aucun geste, c'est le doigt qui tire la liste
          qui doit continuer à la tirer. */}
      {showOverlay && (
        <div
          className="pointer-events-none absolute inset-0 z-[60] flex items-start justify-center transition-opacity duration-150"
          style={{
            opacity: isDragHintVisible ? 1 : 0,
            backgroundColor: isLight ? 'rgba(148,163,184,0.55)' : 'rgba(15,23,42,0.62)',
            backdropFilter: 'grayscale(1)',
            paddingTop: '28vh',
          }}
          aria-hidden
        >
          <div className="flex flex-col items-center gap-2">
            <ArrowDownIcon
              className={`h-8 w-8 ${isLight ? 'text-slate-700' : 'text-white'}`}
              style={{
                transform: `translateY(${Math.min(dragY / 6, 14)}px)`,
                transition: 'transform 80ms linear',
              }}
            />
            <span className={`text-sm font-bold ${isLight ? 'text-slate-800' : 'text-white'}`}>
              {dragToCloseLabel}
            </span>
          </div>
        </div>
      )}
    </div>
  );

  /*
   * Plein écran, la recherche s'affiche hors de la feuille d'accueil.
   *
   * La feuille anime ses paliers avec un `transform`, et un `transform` sur
   * un ancêtre redéfinit ce à quoi un descendant `fixed` s'accroche : sans ce
   * portail, notre plein écran restait confiné à la boîte de la feuille au
   * lieu de couvrir l'écran du téléphone.
   */
  return showOverlay ? createPortal(content, document.body) : content;
};
