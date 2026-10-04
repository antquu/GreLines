import { foreignAsCatalogLine, isForeignLineId } from '../utils/foreignNetworks';
import { MagnifyingGlassIcon, XMarkIcon, ArrowDownIcon } from '@heroicons/react/24/solid';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SearchHistoryItem, Stop, TrafficDetail } from '../types';
import type { AddressResult } from '../services/geocoding';
import type { AllLinesLine } from '../services/allLines';
import type { RouteLocation } from '../services/api';
import { SearchResultsList } from './SearchResultsList';
import { hapticTap } from '../utils/haptics';
import { loadRecentStops } from '../utils/recentStops';

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
  inline?: boolean;
  trafficInfo?: Map<string, TrafficDetail[]>;
}

export const SearchBarMobile = ({
  searchQuery, onSearchChange, matchedStops, matchedLines, allLines, stops, searchHistoryItems,
  searchPlaceholder, onStopClick, onLineClick, isFocused, onFocus,
  addressResults = [], onAddressClick, language = 'fr', theme = 'dark', inline = false, trafficInfo,
}: SearchBarMobileProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const isLight = theme === 'light';

  const wantOverlay = inline && isFocused;

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

  const scrollerRef = useRef<HTMLDivElement | null>(null);
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

  useLayoutEffect(() => {
    if (!showOverlay || !wantOverlay) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
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
      if (offset > 8 && document.activeElement === inputRef.current) inputRef.current?.blur();
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
  const openedStops: RouteLocation[] = loadRecentStops()
    .filter(entry => !historyStops.some(item => item.id === entry.id))
    .slice(0, 4)
    .map(entry => ({
      id: entry.id,
      label: entry.name,
      lat: entry.lat,
      lon: entry.lon,
      kind: 'stop' as const,
      raw: { id: entry.id, name: entry.name, city: entry.city, lat: entry.lat, lon: entry.lon },
    }));
  const recentStops = [...historyStops, ...openedStops];
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
      isForeignLineId(item.id)
        ? foreignAsCatalogLine(item)
        : allLines.find(candidate => candidate.id === item.id) ||
          allLines.find(candidate => candidate.shortName === item.shortName),
    )
    .filter((line): line is AllLinesLine => Boolean(line));

  const isSearching = searchQuery.trim() !== '';
  const activeStops = isSearching ? resultStops : recentStops;
  const activeAddresses = isSearching ? resultAddresses : historyAddresses;
  const activeLines = isSearching ? matchedLines : historyLines;
  const hasActiveResults = activeStops.length > 0 || activeAddresses.length > 0 || activeLines.length > 0;

  const showDropdown =
    isFocused &&
    (searchQuery.trim() !== ''
      ? true
      : searchHistoryItems.length > 0 || openedStops.length > 0);

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

  const restingOffsetPx = entered ? 0 : 18;
  const overlayOffsetPx = dragY > 0 ? dragY : restingOffsetPx;

  const content = (
    <div
      className={
        showOverlay
          ? 'fixed inset-0 z-[1000] flex flex-col'
          : inline
            ? 'relative w-full'
            : 'fixed left-4 right-4 top-[calc(var(--gl-safe-top)+0.75rem)]'
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
      {showOverlay && (
        <div
          className={`pointer-events-none absolute inset-0 -z-10 ${isLight ? 'bg-slate-50' : 'bg-slate-950'}`}
          aria-hidden
        />
      )}

      <div
        ref={showOverlay ? scrollerRef : undefined}
        className={showOverlay ? 'flex min-h-0 flex-1 flex-col' : 'relative transition-all duration-300 ease-out'}
        style={showOverlay ? { paddingTop: 'calc(var(--gl-safe-top) + 0.75rem)' } : undefined}
      >

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
              if (!searchQuery) onFocus(false);
            }}
            placeholder={isFocused ? searchPlaceholder : mobilePlaceholder}
            className={`min-w-0 flex-1 border-none bg-transparent text-[1.125rem] font-semibold outline-none ${
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

        {showDropdown && (
          <div
            ref={showOverlay ? listRef : undefined}
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

      {showOverlay && (
        <div
          className="pointer-events-none absolute inset-0 z-[60] flex items-start justify-center transition-opacity duration-150"
          style={{
            opacity: isDragHintVisible ? 1 : 0,
            backgroundColor: isLight ? 'rgba(148,163,184,0.55)' : 'rgba(var(--gl-ink-rgb), 0.62)',
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

  return showOverlay ? createPortal(content, document.body) : content;
};
