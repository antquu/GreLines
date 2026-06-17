import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveLineStyle } from '../utils/lineColors';
import { motion } from 'framer-motion';
import { Sheet, type SheetRef } from 'react-modal-sheet';
import {
  MapPinIcon,
  ExclamationTriangleIcon,
  Cog6ToothIcon,
  EllipsisHorizontalIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/solid';
import type { Stop, Line } from '../types';
import { findClosestStops, formatDistance } from '../utils/geo';
import { useFavorites } from '../hooks/useFavorites';
import { useFavoriteDetails } from '../hooks/useFavoriteDetails';
import { removeFavoriteAndNotify } from '../services/favorites';
import { getStopLines } from '../services/api';
import { FavoriteCard } from './FavoriteCard';

interface HomeSheetProps {
  isOpen: boolean;
  onClose: () => void;
  stops: Stop[];
  currentLocation: { lat: number; lon: number } | null;
  onStopClick: (stop: Stop, lineFilter?: string[]) => void;
  onOpenTraffic: () => void;
  onOpenSettings: () => void;
  onSnapChange?: (snapIdx: number) => void;
  onSheetProgress?: (progress: number) => void;
  /**
   * Bumping this value from the parent triggers a snap back to the mini
   * (0.15) position with the scroll reset to the top — used when another
   * sheet (stop sidebar, settings, traffic) opens on top, so the user finds
   * the home sheet in its initial state when they come back to it.
   */
  snapToMiniSignal?: number;
  /** Bumping this snaps the sheet up to the mid (0.6) snap point. */
  openToMidSignal?: number;
  language: 'fr' | 'en';
}

function getGreeting(language: 'fr' | 'en'): string {
  const h = new Date().getHours();
  const isFr = language === 'fr';
  if (h < 5) {
    return isFr ? 'Bonne nuit, repose-toi bien' : 'Good night, sleep tight';
  }
  if (h < 12) {
    return isFr ? 'Bonjour, prêt à partir ?' : 'Good morning, ready to go?';
  }
  if (h < 14) {
    return isFr ? 'Bon appétit, bonne pause' : 'Enjoy your lunch break';
  }
  if (h < 18) {
    return isFr ? 'Bon après-midi, en route !' : 'Good afternoon, off you go!';
  }
  if (h < 22) {
    return isFr ? 'Bonsoir, bonne soirée' : 'Good evening, have a nice one';
  }
  return isFr ? 'Bonne nuit, à demain' : 'Good night, see you tomorrow';
}

const getText = (language: 'fr' | 'en') => ({
  title: getGreeting(language),
  nearbyTitle: language === 'fr' ? 'Arrêts à proximité' : 'Nearby stops',
  noLocation: language === 'fr' ? 'Position non disponible' : 'Location unavailable',
  noLocationHint:
    language === 'fr'
      ? 'Active la localisation pour voir les arrêts autour de toi.'
      : 'Enable location to see stops around you.',
  favoritesTitle: language === 'fr' ? 'Favoris' : 'Favorites',
  noFavorites: language === 'fr'
    ? 'Aucun favori pour le moment. Ajoute-en un en ouvrant un arrêt et en cliquant sur l’étoile.'
    : 'No favorites yet. Add one by opening a stop and tapping the star.',
  loading: language === 'fr' ? 'Chargement…' : 'Loading…',
  noDepartures: language === 'fr' ? 'Aucun passage prévu' : 'No upcoming departures',
  quickAccess: language === 'fr' ? 'Accès rapide' : 'Quick access',
  placesTitle: language === 'fr' ? 'Lieux' : 'Places',
  recentTitle: language === 'fr' ? 'Récents' : 'Recents',
  homeLabel: language === 'fr' ? 'Domicile' : 'Home',
  workLabel: language === 'fr' ? 'Bureau' : 'Work',
  addLabel: language === 'fr' ? 'Ajouter' : 'Add',
  nearbyLabel: language === 'fr' ? 'Autour de moi' : 'Nearby',
  trafficLabel: language === 'fr' ? 'Infotrafic' : 'Traffic info',
  settingsLabel: language === 'fr' ? 'Réglages' : 'Settings',
  remove: language === 'fr' ? 'Retirer' : 'Remove',
  direction: language === 'fr' ? 'Direction' : 'To',
});

/**
 * Returns whether the line should be drawn as a circular badge (tram +
 * chrono) or a rounded rectangle. Mirrors the same convention used in
 * AddFavoriteModal / Sidebar.
 */
function isRoundLine(label: string): boolean {
  const n = label.toUpperCase().trim();
  if (n === 'A' || n === 'B' || n === 'C' || n === 'D' || n === 'E') return true;
  return /^C\d+$/.test(n);
}


/** Sort by tram → chrono → bus, then alpha-numeric. */
function sortLinesForBadge(lines: Line[]): Line[] {
  const priority = (l: Line) => {
    const n = (l.shortName || l.id).toUpperCase();
    if (['A', 'B', 'C', 'D', 'E'].includes(n)) return 0;
    if (/^C\d+$/.test(n)) return 1;
    return 2;
  };
  return [...lines].sort((a, b) => {
    const dp = priority(a) - priority(b);
    if (dp !== 0) return dp;
    return (a.shortName || a.id).localeCompare(b.shortName || b.id, undefined, { numeric: true });
  });
}

function MiniLineBadge({ line }: { line: Line }) {
  const label = line.shortName || line.id;
  const round = isRoundLine(label);
  const style = resolveLineStyle(line.id, line.color, line.textColor);
  return (
    <div
      className={`h-6 min-w-[24px] px-1.5 flex items-center justify-center text-[10px] font-extrabold flex-shrink-0 ${
        round ? 'rounded-full' : 'rounded-md'
      }`}
      style={style}
    >
      {label}
    </div>
  );
}

const MAX_BADGES = 3;

const NearbyStopCard = ({
  stop,
  meters,
  lines,
  onClick,
  language,
  delay,
}: {
  stop: Stop;
  meters: number;
  lines: Line[] | undefined;
  onClick: () => void;
  language: 'fr' | 'en';
  delay: number;
}) => {
  const sorted = lines ? sortLinesForBadge(lines) : [];
  const visible = sorted.slice(0, MAX_BADGES);
  const overflow = sorted.length > MAX_BADGES;
  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 border-b border-white/10 px-4 py-3 text-left transition last:border-0 hover:bg-white/5 active:bg-white/10"
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-slate-800">
          <MapPinIcon className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight text-white">{stop.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {stop.city && (
              <p className="truncate text-xs text-slate-400">{stop.city}</p>
            )}
            <span className="text-xs font-mono font-semibold text-slate-500">·</span>
            <span className="text-sm font-semibold text-slate-400">
              {formatDistance(meters, language)}
            </span>
          </div>
        </div>
      </div>
      {/* Line badges on the right. If more than MAX_BADGES, the last slot is
          replaced with an ellipsis icon to keep the row compact. */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {visible.map(line => (
          <MiniLineBadge key={line.id} line={line} />
        ))}
        {overflow && (
          <div className="h-6 w-6 flex items-center justify-center rounded-md bg-slate-700">
            <EllipsisHorizontalIcon className="w-4 h-4 text-slate-300" />
          </div>
        )}
      </div>
    </motion.button>
  );
};


/* Note: QuickCircle component is defined but not currently used
const QuickCircle = ({
  Icon,
  label,
  subtitle,
  onClick,
  className,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  subtitle?: string;
  onClick: () => void;
  className: string;
}) => (
  <button
    onClick={onClick}
    className="min-w-[72px] flex-1 text-center transition active:scale-95"
  >
    <div className={`mx-auto flex h-[64px] w-[64px] items-center justify-center rounded-full ${className}`}>
      <Icon className="h-8 w-8 text-white" />
    </div>
    <div className="mt-2 truncate text-sm font-semibold text-white">{label}</div>
    {subtitle && <div className="truncate text-xs font-semibold text-slate-500">{subtitle}</div>}
  </button>
);
*/

export const HomeSheet = ({
  isOpen,
  onClose,
  stops,
  currentLocation,
  onStopClick,
  onOpenTraffic,
  onOpenSettings,
  onSnapChange,
  onSheetProgress,
  snapToMiniSignal,
  openToMidSignal,
  language,
}: HomeSheetProps) => {
  const text = getText(language);

  const nearby = useMemo(() => {
    if (!currentLocation) return [];
    return findClosestStops(stops, currentLocation.lat, currentLocation.lon, 5);
  }, [stops, currentLocation?.lat, currentLocation?.lon]);

  /**
   * Pre-fetch the lines serving each nearby stop so the cards can show line
   * badges. We fire 5 parallel requests when the sheet opens (your api.ts
   * already caches them, so subsequent opens are instant). We don't block
   * the rendering — badges fade in as their fetch resolves.
   */
  const [nearbyLines, setNearbyLines] = useState<Record<string, Line[]>>({});
  useEffect(() => {
    if (!isOpen || nearby.length === 0) return;
    let cancelled = false;
    nearby.forEach(({ stop }) => {
      // Skip stops we've already loaded for this session.
      if (nearbyLines[stop.id]) return;
      getStopLines(stop.id)
        .then(lines => {
          if (cancelled) return;
          setNearbyLines(prev => ({ ...prev, [stop.id]: lines }));
        })
        .catch(() => { /* silent — card just shows no badges */ });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, nearby.map(n => n.stop.id).join('|')]);

  const favorites = useFavorites();
  const favoriteDetails = useFavoriteDetails(favorites, isOpen);

  const sheetRef = useRef<SheetRef>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [snapIdx, setSnapIdx] = useState<number>(1);

  // Hold the latest `onSheetProgress` in a ref so the ProgressWatcher's RAF
  // loop never sees a stale closure AND we don't have to put the callback in
  // any effect's deps array (it changes on every parent render, which would
  // otherwise re-run effects and snap the sheet back to its initial state).
  const onSheetProgressRef = useRef(onSheetProgress);
  useEffect(() => { onSheetProgressRef.current = onSheetProgress; }, [onSheetProgress]);

  const handleSnapChange = (idx: number) => {
    setSnapIdx(idx);
    onSnapChange?.(idx);
  };

  const collapseToMini = () => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    sheetRef.current?.snapTo(1);
  };

  useEffect(() => {
    if (isOpen) {
      onSnapChange?.(1);
      onSheetProgressRef.current?.(0.15);
      const t = setTimeout(() => sheetRef.current?.snapTo(1), 50);
      return () => clearTimeout(t);
    }
    onSnapChange?.(0);
    onSheetProgressRef.current?.(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  /**
   * Parent-triggered "reset to mini": when `snapToMiniSignal` changes (the
   * parent bumps it whenever a foreground sheet opens), collapse back to the
   * mini snap and reset the scroll position. The first render is skipped so
   * we don't reset on mount.
   */
  useEffect(() => {
    if (snapToMiniSignal === undefined) return;
    if (!isOpen) return;
    collapseToMini();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapToMiniSignal]);

  // Snap to mid (0.6) when the geoloc button is tapped — shows nearby stops.
  useEffect(() => {
    if (openToMidSignal === undefined || openToMidSignal === 0) return;
    if (!isOpen) return;
    // snapPoints = [0, 0.15, 0.6, 1] → index 2 = 0.6
    sheetRef.current?.snapTo(2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openToMidSignal]);

  return (
    <Sheet
      ref={sheetRef}
      style={{ zIndex: 10 }}
      isOpen={isOpen}
      onClose={onClose}
      snapPoints={[0, 0.15, 0.6, 1]}
      initialSnap={1}
      disableDismiss
      onSnap={handleSnapChange}
      // Live drag progress. The lib calls this on every animation frame
      // with the *vertical translation* of the sheet in pixels (0 = full,
      // viewportHeight = closed). We normalize it to a [0..1] "openness"
      // fraction where 1 = full and 0 = closed, and forward it to the
      // parent so it can animate elements that should follow the sheet.
      onOpenStart={() => {/* no-op, lib hook */}}
    >
	      <Sheet.Container
	        style={{
	          borderRadius: '32px 32px 0 0',
	          background: 'linear-gradient(180deg, rgba(31,41,55,0.96), rgba(15,23,42,0.98))',
	          border: '1px solid rgba(148,163,184,0.18)',
	          zIndex: 10,
	        }}
	      >
	        <Sheet.Header>
	          <div className="flex justify-center pt-2 pb-1">
	            <div className="h-1.5 w-16 rounded-full bg-white/30" />
	          </div>
	        </Sheet.Header>
        <Sheet.Content disableDrag={state => state.scrollPosition !== 'top'}>
          {/* Live progress watcher — we mount a tiny invisible component that
              re-renders on every motion-value tick and pushes the current
              sheet openness back up to the parent. This is the cleanest way
              to subscribe to per-frame drag updates without forking the lib. */}
          <ProgressWatcher onSheetProgressRef={onSheetProgressRef} />
	          <div ref={scrollRef} className="overflow-y-auto flex-1 pb-12">
	            <div className="px-6 pt-2 pb-5">
	              <motion.h2
	                initial={{ opacity: 0, y: 8 }}
	                animate={{ opacity: 1, y: 0 }}
                  className="text-sm font-semibold leading-tight text-white"
	              >
	                {text.title}
	              </motion.h2>
                
	            </div>

	            <div className="px-5 space-y-7">
	              <section>
	                <div className="mb-3 flex items-center gap-2 px-1">
                    <h3 className="text-sm font-semibold leading-none text-white">{text.recentTitle}</h3>
	                  <ChevronRightIcon className="h-6 w-6 text-slate-500" />
	                </div>
	                {!currentLocation ? (
	                  <div className="rounded-[28px] border border-white/10 bg-[#2c2d31]/90 p-6 text-center shadow-xl">
	                    <p className="text-sm font-semibold text-white mb-1">{text.noLocation}</p>
	                    <p className="text-xs text-slate-400">{text.noLocationHint}</p>
	                  </div>
                ) : nearby.length === 0 ? (
                  <p className="text-sm text-slate-500 py-4 text-center">{text.noLocation}</p>
                ) : (
	                  <div className="overflow-hidden rounded-[28px] bg-[#2c2d31]/90 shadow-xl">
	                    {nearby.map(({ stop, meters }, idx) => (
                      <NearbyStopCard
                        key={stop.id}
                        stop={stop}
                        meters={meters}
                        lines={nearbyLines[stop.id]}
                        onClick={() => onStopClick(stop)}
                        language={language}
                        delay={idx * 0.03}
                      />
                    ))}
                  </div>
                )}
              </section>

	              <section>
	                <div className="mb-3 flex items-center gap-2 px-1">
	                  <h3 className="text-[24px] font-extrabold leading-none text-white">{text.favoritesTitle}</h3>
	                  <ChevronRightIcon className="h-6 w-6 text-slate-500" />
	                </div>
	                {favorites.length === 0 ? (
	                  <div className="rounded-[28px] border border-white/10 bg-[#2c2d31]/90 p-5 shadow-xl">
	                    <p className="text-sm text-slate-400 leading-relaxed">{text.noFavorites}</p>
	                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {favoriteDetails.map(({ favorite, detail, loading }) => (
                      <FavoriteCard
                        key={favorite.stopId}
                        stopName={favorite.stopName}
                        city={favorite.city}
                        lineFilter={favorite.lines}
                        detail={detail}
                        loading={loading}
                        onOpen={() => {
                          const lineFilter =
                            favorite.lines === 'all' ? undefined : favorite.lines;
                          const stub: Stop = detail
                            ? (detail as any)
                            : { id: favorite.stopId, name: favorite.stopName, lat: 0, lon: 0, city: favorite.city };
                          onStopClick(stub, lineFilter);
                        }}
                        onRemove={() => removeFavoriteAndNotify(favorite.stopId)}
                        language={language}
                      />
                    ))}
                  </div>
                )}
              </section>

	              <section>
	                <h3 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
	                  {text.quickAccess}
	                </h3>
	                <div className="grid grid-cols-2 gap-3">
	                  <button onClick={onOpenTraffic} className="rounded-[24px] border border-white/10 bg-white/5 p-4 text-left transition active:scale-[0.98]">
	                    <ExclamationTriangleIcon className="mb-3 h-7 w-7 text-amber-300" />
	                    <span className="text-sm font-bold text-white">{text.trafficLabel}</span>
	                  </button>
	                  <button onClick={onOpenSettings} className="rounded-[24px] border border-white/10 bg-white/5 p-4 text-left transition active:scale-[0.98]">
	                    <Cog6ToothIcon className="mb-3 h-7 w-7 text-blue-300" />
	                    <span className="text-sm font-bold text-white">{text.settingsLabel}</span>
	                  </button>
	                </div>
	              </section>
            </div>
          </div>
        </Sheet.Content>
      </Sheet.Container>
      {snapIdx > 1 && (
        <Sheet.Backdrop onTap={collapseToMini} style={{ zIndex: 9 }} />
      )}
    </Sheet>
  );
};

/**
 * Invisible component mounted inside `Sheet.Content`. It runs a tight RAF
 * loop that reads the sheet container's bounding rect each frame and forwards
 * the normalized openness fraction to the parent via the *current* value of
 * `onSheetProgressRef`. Using a ref means this component never has to
 * remount when the parent re-renders, so the RAF loop runs continuously for
 * the entire lifetime of the sheet.
 */
function ProgressWatcher({
  onSheetProgressRef,
}: {
  onSheetProgressRef: React.MutableRefObject<((p: number) => void) | undefined>;
}) {
  useEffect(() => {
    let rafId = 0;
    let lastProgress = -1;

    const tick = () => {
      const containers = document.getElementsByClassName('react-modal-sheet-container');
      if (containers.length > 0) {
        const rect = (containers[0] as HTMLElement).getBoundingClientRect();
        const vh = window.innerHeight;
        const visibleHeight = Math.max(0, vh - rect.top);
        const progress = Math.min(1, Math.max(0, visibleHeight / vh));
        if (Math.abs(progress - lastProgress) > 0.001) {
          lastProgress = progress;
          onSheetProgressRef.current?.(progress);
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [onSheetProgressRef]);

  return null;
}
