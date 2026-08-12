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
  MapIcon,
} from '@heroicons/react/24/solid';
import type { Stop, Line } from '../types';
import { findClosestStops, formatDistance } from '../utils/geo';
import { getStopLines } from '../services/api';
import { FavoriteCard } from './FavoriteCard';
import type { Favorite } from '../services/favorites';
import type { FavoriteDetail } from '../hooks/useFavoriteDetails';
import { AtmoPanel } from './AtmoPanel';
import type { AtmoReport, Commune } from '../services/atmo';

/** Le strict nécessaire pour dessiner une pastille de ligne. */
type MarqueeLine = Pick<Line, 'id' | 'shortName' | 'color' | 'textColor'>;

interface HomeSheetProps {
  isOpen: boolean;
  onClose: () => void;
  stops: Stop[];
  currentLocation: { lat: number; lon: number } | null;
  onStopClick: (stop: Stop, lineFilter?: string[]) => void;
  onOpenTraffic: () => void;
  onOpenSettings: () => void;
  onOpenItinerary: () => void;
  /** Ouvre l'explorateur de lignes (recherche mobile focalisée). */
  onOpenLines?: () => void;
  /** Catalogue complet des lignes du réseau, pour le bandeau défilant. */
  allLines?: MarqueeLine[];
  onSnapChange?: (snapIdx: number) => void;
  onSheetProgress?: (progress: number) => void;
  





  snapToMiniSignal?: number;
  
  openToMidSignal?: number;
  language: 'fr' | 'en';
  theme?: 'light' | 'dark';
  favorites: Favorite[];
  favoriteDetails: FavoriteDetail[];
  
  atmoReport: AtmoReport | null;
  atmoLoading: boolean;
  onAtmoCommuneChange: (commune: Commune) => void;
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
  itineraryLabel: language === 'fr' ? 'Itinéraire' : 'Itinerary',
  settingsLabel: language === 'fr' ? 'Réglages' : 'Settings',
  linesLabel: language === 'fr' ? 'Explorer les lignes' : 'Explore lines',
  remove: language === 'fr' ? 'Retirer' : 'Remove',
  direction: language === 'fr' ? 'Direction' : 'To',
});






function isRoundLine(label: string): boolean {
  const n = label.toUpperCase().trim();
  if (n === 'A' || n === 'B' || n === 'C' || n === 'D' || n === 'E') return true;
  return /^C\d+$/.test(n);
}



function sortLinesForBadge<T extends MarqueeLine>(lines: T[]): T[] {
  const priority = (l: T) => {
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

function MiniLineBadge({ line }: { line: MarqueeLine }) {
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

/** Réseaux urbains de l'agglomération, seuls porteurs des codes du bandeau. */
const URBAN_NETWORKS = ['SEM', 'SE2', 'GSV', 'TPV'];

/**
 * Codes Proximo du réseau, dans l'ordre de la grille officielle. La liste est
 * explicite plutôt que déduite d'une couleur : les Proximo ne sont pas tous
 * bleus, et la couleur réelle de chaque ligne vient toujours du catalogue.
 */
const PROXIMO_CODES = [
  '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25',
  '30', '31', '32', '33', '34', '35', '36', '37',
  '80', '82', '84', '85', '86', '88', '89', '90', '91', '92',
  'N62', 'N93', 'N94', 'N97', 'N98', 'N99',
];

function networkOf(id: string): string {
  return id.split(':')[0].toUpperCase().trim();
}

function codeOf(line: MarqueeLine): string {
  return (line.shortName || line.id).toUpperCase().trim();
}

/** Sélection affichée dans le bandeau : trams, Chrono C1→C11, Proximo. */
function isMarqueeLine(line: MarqueeLine): boolean {
  if (!URBAN_NETWORKS.includes(networkOf(line.id))) return false;
  const code = codeOf(line);
  if (['A', 'B', 'C', 'D', 'E'].includes(code)) return true;
  if (/^C([1-9]|1[01])$/.test(code)) return true;
  return PROXIMO_CODES.includes(code);
}

/**
 * Un même code peut exister sur plusieurs réseaux (30 chez TPV et GSV…) : on
 * ne garde qu'une pastille par code, celle du réseau le plus proche du cœur
 * de l'agglomération.
 */
function dedupeByCode(lines: MarqueeLine[]): MarqueeLine[] {
  const best = new Map<string, MarqueeLine>();
  for (const line of lines) {
    const code = codeOf(line);
    const current = best.get(code);
    if (!current || URBAN_NETWORKS.indexOf(networkOf(line.id)) < URBAN_NETWORKS.indexOf(networkOf(current.id))) {
      best.set(code, line);
    }
  }
  return [...best.values()];
}

/**
 * Bandeau d'icônes de lignes qui défile en continu de droite à gauche, sur le
 * même principe que le marquee des infos trafic de la sidebar desktop : la
 * liste est dupliquée et translatée de -50 %, ce qui donne une boucle sans
 * couture. La vitesse est constante en px/s quelle que soit la largeur.
 */
const LINES_MARQUEE_SPEED_PX_PER_SEC = 40;

function LinesMarquee({ lines }: { lines: MarqueeLine[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [durationSec, setDurationSec] = useState(20);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const update = () => {
      // La piste contient deux copies : une boucle = la moitié de sa largeur.
      const loopWidth = track.scrollWidth / 2;
      if (loopWidth > 0) {
        setDurationSec(Math.max(8, loopWidth / LINES_MARQUEE_SPEED_PX_PER_SEC));
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(track);
    return () => observer.disconnect();
  }, [lines]);

  return (
    <div className="relative w-full overflow-hidden">
      <div
        ref={trackRef}
        className="flex w-max items-center gap-1.5"
        style={{
          animationName: 'footer-marquee',
          animationDuration: `${durationSec}s`,
          animationTimingFunction: 'linear',
          animationIterationCount: 'infinite',
        }}
      >
        {lines.map(line => (
          <MiniLineBadge key={`a-${line.id}`} line={line} />
        ))}
        {lines.map(line => (
          <MiniLineBadge key={`b-${line.id}`} line={line} />
        ))}
      </div>
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
  onOpenItinerary,
  onSnapChange,
  onSheetProgress,
  snapToMiniSignal,
  openToMidSignal,
  language,
  theme = 'dark',
  favorites,
  favoriteDetails,
  atmoReport,
  atmoLoading,
  onAtmoCommuneChange,
  onOpenLines,
  allLines = [],
}: HomeSheetProps) => {
  const text = getText(language);
  const isLight = theme === 'light';
  const surfaceClass = isLight
    ? 'bg-white border border-slate-200 shadow-[0_20px_50px_rgba(148,163,184,0.18)]'
    : 'bg-[#2c2d31]/90 border-white/10 shadow-xl';
  const titleClass = isLight ? 'text-slate-900' : 'text-white';
  const mutedClass = isLight ? 'text-slate-500' : 'text-slate-400';

  // Bandeau défilant : uniquement les trams A→E, les Chrono C1→C11 et les
  // Proximo bleus. Les codes C1…C11 existent aussi côté TER (SNC:C1, bleu
  // marine) : on ne garde que ceux du réseau urbain (SEM / SE2) pour éviter
  // d'afficher la pastille TER à la place de la ligne Chrono.
  const marqueeLines = useMemo(
    () => sortLinesForBadge(dedupeByCode(allLines.filter(isMarqueeLine))),
    [allLines]
  );

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
	          background: isLight
	            ? 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(241,245,249,0.98))'
	            : 'linear-gradient(180deg, rgba(31,41,55,0.96), rgba(15,23,42,0.98))',
	          border: isLight ? '1px solid rgba(203,213,225,0.75)' : '1px solid rgba(148,163,184,0.18)',
	          zIndex: 10,
	        }}
	      >
	        <Sheet.Header>
	          <div className="flex justify-center pt-2 pb-1">
	            <div className={`h-1.5 w-16 rounded-full ${isLight ? 'bg-slate-300' : 'bg-white/30'}`} />
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
                  className={`text-sm font-semibold leading-tight ${titleClass}`}
                  style={isLight ? { color: '#0f172a' } : undefined}
	              >
	                {text.title}
	              </motion.h2>
                
	            </div>

	            <div className="px-5 space-y-7">
	              <section>
	                <div className="mb-3 flex items-center gap-2 px-1">
                    <h3 className={`text-sm font-semibold leading-none ${titleClass}`} style={isLight ? { color: '#0f172a' } : undefined}>{text.recentTitle}</h3>
	                  <ChevronRightIcon className={`h-6 w-6 ${mutedClass}`} />
	                </div>
	                {!currentLocation ? (
	                  <div className={`rounded-[28px] p-6 text-center ${surfaceClass}`}>
	                    <p className={`text-sm font-semibold mb-1 ${titleClass}`} style={isLight ? { color: '#0f172a' } : undefined}>{text.noLocation}</p>
	                    <p className={`text-xs ${mutedClass}`}>{text.noLocationHint}</p>
	                  </div>
                ) : nearby.length === 0 ? (
                  <p className={`text-sm py-4 text-center ${mutedClass}`}>{text.noLocation}</p>
                ) : (
	                  <div className={`overflow-hidden rounded-[28px] ${surfaceClass}`}>
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
	                  <h3 className={`text-[24px] font-extrabold leading-none ${titleClass}`} style={isLight ? { color: '#0f172a' } : undefined}>{text.favoritesTitle}</h3>
	                  <ChevronRightIcon className={`h-6 w-6 ${mutedClass}`} />
	                </div>
	                {favorites.length === 0 ? (
	                  <div className={`rounded-[28px] p-5 ${surfaceClass}`}>
	                    <p className={`text-sm leading-relaxed ${mutedClass}`}>{text.noFavorites}</p>
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
                        
                        language={language}
                        theme={theme}
                      />
                    ))}
                  </div>
                )}
              </section>

	              <section>
	                <h3 className={`mb-3 px-1 text-xs font-semibold uppercase tracking-wider ${mutedClass}`}>
	                  {text.quickAccess}
	                </h3>
	                <div className="grid grid-cols-2 gap-3">
	                  <button
	                    onClick={onOpenTraffic}
	                    className={`rounded-[24px] p-4 text-left transition active:scale-[0.98] ${
	                      isLight
	                        ? 'border border-slate-200 bg-white shadow-[0_12px_30px_rgba(148,163,184,0.14)]'
	                        : 'border border-white/10 bg-white/5'
	                    }`}
	                  >
	                    <ExclamationTriangleIcon className="mb-3 h-7 w-7 text-amber-300" />
	                    <span className={`text-sm font-bold ${titleClass}`} style={isLight ? { color: '#0f172a' } : undefined}>{text.trafficLabel}</span>
	                  </button>
	                  <button
	                    onClick={onOpenSettings}
	                    className={`rounded-[24px] p-4 text-left transition active:scale-[0.98] ${
	                      isLight
	                        ? 'border border-slate-200 bg-white shadow-[0_12px_30px_rgba(148,163,184,0.14)]'
	                        : 'border border-white/10 bg-white/5'
	                    }`}
	                  >
	                    <Cog6ToothIcon className="mb-3 h-7 w-7 text-blue-300" />
	                    <span className={`text-sm font-bold ${titleClass}`} style={isLight ? { color: '#0f172a' } : undefined}>{text.settingsLabel}</span>
	                  </button>
	                  <button
	                    onClick={onOpenItinerary}
	                    className={`rounded-[24px] p-4 text-left transition active:scale-[0.98] ${
	                      isLight
	                        ? 'border border-emerald-200 bg-emerald-50 shadow-[0_12px_30px_rgba(16,185,129,0.12)]'
	                        : 'border border-emerald-400/20 bg-emerald-500/10'
	                    }`}
	                  >
	                    <MapIcon className="mb-3 h-7 w-7 text-emerald-300" />
	                    <span className={`text-sm font-bold ${titleClass}`} style={isLight ? { color: '#0f172a' } : undefined}>{text.itineraryLabel}</span>
	                  </button>
	                  {/* Explorer les lignes : même gabarit que la vignette
	                      Infotrafic, mais l'icône est remplacée par toutes les
	                      icônes du réseau qui défilent de droite à gauche. */}
	                  {onOpenLines && marqueeLines.length > 0 && (
	                    <button
	                      onClick={onOpenLines}
	                      className={`overflow-hidden rounded-[24px] p-4 text-left transition active:scale-[0.98] ${
	                        isLight
	                          ? 'border border-slate-200 bg-white shadow-[0_12px_30px_rgba(148,163,184,0.14)]'
	                          : 'border border-white/10 bg-white/5'
	                      }`}
	                    >
	                      <div className="mb-3">
	                        <LinesMarquee lines={marqueeLines} />
	                      </div>
	                      <span className={`text-sm font-bold ${titleClass}`} style={isLight ? { color: '#0f172a' } : undefined}>{text.linesLabel}</span>
	                    </button>
	                  )}
	                  {/* Qualité de l'air : un widget carré qui occupe les deux
	                      colonnes, sur le modèle des grandes vignettes iOS. Sa
	                      couleur est celle de l'indice du jour. */}
	                  <div className="col-span-2 aspect-square overflow-hidden rounded-[24px]">
	                    <AtmoPanel
	                      report={atmoReport}
	                      loading={atmoLoading}
	                      onCommuneChange={onAtmoCommuneChange}
	                      language={language}
	                    />
	                  </div>
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
