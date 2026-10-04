import { ScrollingText } from './ScrollingText';
import { DepartureCard, DepartureList, MotionTime, useExitMode, useFirstPaint, useGroupMotion } from './DepartureMotion';
import { IS_NANCY } from '../site';
import { useIsOffline, useReconnectCount } from '../hooks/useIsOffline';
﻿import { motion } from 'framer-motion';
import { Sheet, type SheetRef } from 'react-modal-sheet';
import { TrafficAlertCard } from './TrafficAlertCard';
import { CarpoolStopPanel, isCarpoolStop, isCarpoolLine } from './CarpoolStopPanel';
import { getMcoLines, type McoLine } from '../services/mcoLines';
import { RealtimeWifi } from './RealtimeWifi';
import { DepartureTags } from './TrainPill';
import { sortLinesByPriority, tclDeparturePriority } from '../utils/lineOrder';
import {
  MapSheetShell,
  MapSheetBody,
  mapSheetSnapPoints,
  collapsedNavPadding,
  readSafeAreaBottom,
  NAVBAR_SNAP,
} from './MapSheet';
import { NAV_ITEM_WIDTH } from './MobileNavBar';
import { XMarkIcon, EllipsisVerticalIcon, ChevronDownIcon, ChevronUpIcon, UserIcon, MapIcon, ClockIcon, ArrowsRightLeftIcon, ExclamationTriangleIcon, CheckIcon, BookmarkIcon } from '@heroicons/react/24/solid';
import { BookmarkIcon as BookmarkOutlineIcon } from '@heroicons/react/24/outline';
import { isFavorite, removeFavoriteAndNotify, setFavoriteAndNotify, subscribeFavorites } from '../services/favorites';
import { AddFavoriteModal } from './AddFavoriteModal';
import { TransportModeIcon } from './TransportModeIcon';
import { normalizeMode } from '../utils/transportMode';
import type { StopDetail, Departure } from '../types';
import { formatDepartureTime, refreshStopDepartures } from '../services/api';
import { resolveLineStyle, isGrenobleNetworkLine } from '../utils/lineColors';
import { LineBadge } from './LineBadge';
import { DepartureLineBadge } from './DepartureLineBadge';
import { NextServiceDepartures } from './NextServiceDepartures';
import { LastRunRibbon, LAST_RUN_TEXT } from './LastRunRibbon';
import { DepartureQuickActions } from './DepartureQuickActions';
import { FaWheelchair } from 'react-icons/fa';
import { useAccessibleStops } from '../hooks/useAccessibleStops';
import { usePerfSettings } from '../hooks/usePerfSettings';
import { isStopAccessible } from '../services/stopAccessibility';
import { getTimetable, isLastDeparture, toTimetableRouteId, type Timetable } from '../services/timetable';
import { useEffect, useState, useRef, useMemo } from 'react';
import { getStopTrafficAlerts, filterAlertsBySelectedLines } from '../utils/stopTrafficMatcher';

interface SidebarMobileProps {
  stop: StopDetail | null;
  closeSignal?: number;
  isOpen: boolean;
  sidebarState: 'closed' | 'peek' | 'open';
  onClose: () => void;
  onOpen: () => void;
  initialSelectedLines?: Set<string>;

  selectedLines?: Set<string>;
  frozen?: boolean;
  onSelectedLinesChange?: (lines: Set<string>) => void;
  compactMode: boolean;
  autoSync: boolean;
  refreshIntervalMs: number;
  language: 'fr' | 'en';
  theme?: 'light' | 'dark';
  onPlanRouteFromStop?: (stop: StopDetail) => void;
  onOpenTimetable?: (info: { line: { id: string; shortName?: string; color?: string; textColor?: string }; headsign: string }) => void;
  onOpenLine?: (line: { id: string; shortName?: string }) => void;
}

const getMinutesUntilDeparture = (departure: Departure): number => departure.departureTime;
const getDepartureDisplay = (departure: Departure, language: 'fr' | 'en'): string => formatDepartureTime(departure, language);

const getSidebarText = (language: 'fr' | 'en') => {
  const isFr = language === 'fr';
  return {
    lines: isFr ? 'Lignes' : 'Lines',
    showAll: isFr ? 'Afficher tout' : 'Show all',
    exportConfiguration: isFr ? 'Exporter la configuration' : 'Export configuration',
    exportedConfiguration: isFr ? 'Configuration exportée' : 'Exported configuration',
    shareLink: isFr ? 'Lien de partage' : 'Share link',
    copy: isFr ? 'Copier' : 'Copy',
    copied: isFr ? 'Copié !' : 'Copied!',
    nextDepartures: isFr ? 'Prochains départs' : 'Next departures',
    tramway: isFr ? 'Tramway' : 'Tramway',
    train: isFr ? 'Train' : 'Train',
    metro: isFr ? 'Métro' : 'Metro',
    bus: 'Bus',
    live: isFr ? 'Direct' : 'Live',
    nextDeparture: isFr ? 'Second passage' : 'Second departure',
    direction: isFr ? 'Direction' : 'Direction',
    time: isFr ? 'Heure' : 'TIME',
    occupancy: isFr ? 'Affluence' : 'OCCUPANCY',
    realTimeData: isFr ? 'Données en temps réel' : 'Real-time data',
    disruptedTraffic: isFr ? 'Trafic perturbé sur la ligne' : 'Disrupted traffic on line',
    ongoingDisruption: isFr ? 'Perturbation en cours' : 'Ongoing disruption',
    estimatedEnd: isFr ? 'Fin estimée :' : 'Estimated end:',
    calculateItinerary: isFr ? 'Calculer un itinéraire' : 'Plan a journey',
    nextLabel: isFr ? 'PROCHAIN' : 'NEXT',
    noDeparturesAvailable: isFr ? 'Aucun départ disponible' : 'No departures available',
    stopAlerts: isFr ? 'Cet arrêt est concerné' : 'Affecting this stop',
    affecting: isFr ? 'Concerne :' : 'Affects:',
    moreDepartures: (count: number) => isFr ? `+${count} départs supplémentaires` : `+${count} more departures`,
    timetable: isFr ? 'Fiche horaire' : 'Timetable',
    seeLine: isFr ? 'Voir la ligne' : 'View line',
    planRoute: isFr ? 'Itinéraire' : 'Directions',
    planRouteFromStop: isFr ? 'Planifier un trajet depuis cet arrêt' : 'Plan a trip from this stop',
  };
};

const renderDepartureTime = (timeString: string) => {
  const match = timeString.match(/^(\d+)(m)$/);
  if (match) return <><span className="font-bold">{match[1]}</span><span className="font-normal">{match[2]}</span></>;
  return timeString;
};

function modeLabel(mode: ReturnType<typeof normalizeMode>, text: { bus: string; tramway: string; train: string; metro: string }): string {
  if (mode === 'METRO') return text.metro;
  if (mode === 'RAIL') return text.train;
  if (mode === 'TRAM') return text.tramway;
  return text.bus;
}

const isTramway = (lineId: string): boolean => ['A','B','C','D','E'].includes(lineId.toUpperCase().trim());

const isChronoLine = (lineId: string): boolean => {
  const m = /^C(\d+)$/.exec(lineId.toUpperCase().trim());
  return !!m && parseInt(m[1], 10) >= 1 && parseInt(m[1], 10) <= 14;
};

const isRoundLine = (lineId: string): boolean => {
  const code = lineId.toUpperCase().trim().includes('_') ? lineId.toUpperCase().trim().split('_').pop() || lineId.toUpperCase().trim() : lineId.toUpperCase().trim();
  if (['A','B','C','D','E'].includes(code)) return true;
  const match = /^C(\d+)$/.exec(code);
  return !!match && parseInt(match[1], 10) >= 1 && parseInt(match[1], 10) <= 14;
};

const OccupancyDisplay = ({
  occupancy,
  showError = false,
  size = 'sm',
}: {
  occupancy?: string | null;
  showError?: boolean;
  size?: 'sm' | 'lg';
}) => {
  const level = occupancy === 'LIGHT' ? 1 : occupancy === 'MODERATE' ? 2 : occupancy === 'CROWDED' ? 3 : 0;
  const isLarge = size === 'lg';
  if (level === 0) {
    return showError ? (
      <div className={`text-slate-500 ${isLarge ? 'flex justify-center text-2xl font-bold' : 'text-xs'}`}>–</div>
    ) : null;
  }
  return (
    <div className={`flex items-center ${isLarge ? 'justify-center gap-1' : 'gap-0.5'}`}>
      {Array.from({ length: 3 }).map((_, i) => (
        <UserIcon
          key={i}
          className={`text-slate-300 ${isLarge ? 'w-6 h-6' : 'w-4 h-4'}`}
          style={{ opacity: i < level ? 1 : 0.3 }}
        />
      ))}
    </div>
  );
};

interface StopTrafficAlertsProps {
  stop: Pick<StopDetail, 'id' | 'name' | 'lines'>;
  language: 'fr' | 'en';
  selectedLines: Set<string>;
}

const StopTrafficAlerts = ({ stop, language, selectedLines }: StopTrafficAlertsProps) => {
  const text = getSidebarText(language);
  const alerts = useMemo(
    () =>
      filterAlertsBySelectedLines(
        getStopTrafficAlerts({ name: stop.name }, stop.lines),
        selectedLines,
      ),
    [stop.id, stop.name, stop.lines, selectedLines]
  );

  if (alerts.length === 0) return null;

  return (
    <div className="px-5 mb-6">
      <h3 className="section-caps text-slate-400 mb-3">
        {text.stopAlerts}
      </h3>
      <div className="space-y-2.5">
        {alerts.map((alert, idx) => (
          <motion.div
            key={`${alert.detail.titre}-${idx}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.04 }}
          >
            <TrafficAlertCard
              detail={alert.detail}
              language={language}
              lines={[...alert.matchedLines]}
            />
          </motion.div>
        ))}
      </div>
    </div>
  );
};

const CopyButton = ({ value, copyLabel, copiedLabel }: { value: string; copyLabel: string; copiedLabel: string }) => {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    try { await navigator.clipboard.writeText(value); } catch { }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <motion.button
      onClick={handle}
      animate={{ backgroundColor: copied ? '#10b981' : '#2563eb' }}
      transition={{ duration: 0.2 }}
      className="px-3 py-2 text-white rounded-xl text-xs font-semibold flex-shrink-0 flex items-center justify-center gap-1.5 min-w-[72px]"
    >
      {copied ? (
        <>
          <CheckIcon className="w-3.5 h-3.5" />
          <span>{copiedLabel}</span>
        </>
      ) : (
        <span>{copyLabel}</span>
      )}
    </motion.button>
  );
};

export const SidebarMobile = ({ stop, closeSignal, isOpen, frozen = false, onClose, initialSelectedLines, selectedLines: controlledSelectedLines, onSelectedLinesChange, compactMode, autoSync, refreshIntervalMs, language, theme = 'dark', onPlanRouteFromStop, onOpenTimetable, onOpenLine }: SidebarMobileProps) => {
  const [currentStopDetail, setCurrentStopDetail] = useState<StopDetail | null>(null);
  const accessibleStops = useAccessibleStops();
  const { settings: perf } = usePerfSettings();
  const stopIsAccessible = isStopAccessible(accessibleStops, currentStopDetail);
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [internalSelectedLines, setInternalSelectedLines] = useState<Set<string>>(initialSelectedLines || new Set());
  const isControlled = controlledSelectedLines !== undefined;
  const selectedLines = isControlled ? controlledSelectedLines! : internalSelectedLines;
  const setSelectedLines = (updater: Set<string> | ((prev: Set<string>) => Set<string>)) => {
    if (isControlled) {
      const next = typeof updater === 'function' ? updater(selectedLines) : updater;
      onSelectedLinesChange?.(next);
    } else {
      setInternalSelectedLines(updater);
    }
  };
  const [currentStopId, setCurrentStopId] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [timetables, setTimetables] = useState<Map<string, Timetable | null>>(new Map());
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [carpoolLines, setCarpoolLines] = useState<McoLine[]>([]);
  const [isFavoriteModalOpen, setIsFavoriteModalOpen] = useState(false);
  const [isFav, setIsFav] = useState(false);
  useEffect(() => {
    if (!currentStopDetail) { setIsFav(false); return; }
    const sync = () => setIsFav(isFavorite(currentStopDetail.id));
    sync();
    return subscribeFavorites(sync);
  }, [currentStopDetail?.id]);

  const stopLines = currentStopDetail?.lines ?? [];
  const carpoolServed = stopLines.filter(isCarpoolLine);
  const carpoolOnly = stopLines.length > 0 && carpoolServed.length === stopLines.length;
  const carpoolFiltered =
    selectedLines.size > 0 &&
    stopLines.filter(line => selectedLines.has(line.id)).every(isCarpoolLine) &&
    stopLines.some(line => selectedLines.has(line.id) && isCarpoolLine(line));
  const carpoolOnlyStop = isCarpoolStop(currentStopDetail?.id) && carpoolOnly;
  const carpoolStop = carpoolOnlyStop || carpoolFiltered;
  const servedCarpoolLines = useMemo(() => {
    const served = new Set(carpoolServed.map(line => String(line.id).toUpperCase()));
    if (served.size === 0) return carpoolLines;
    const kept = carpoolLines.filter(line => served.has(line.code.toUpperCase()));
    return kept.length > 0 ? kept : carpoolLines;
  }, [carpoolLines, carpoolServed]);
  useEffect(() => {
    if (!carpoolStop) { setCarpoolLines([]); return; }
    let active = true;
    getMcoLines().then(lines => { if (active) setCarpoolLines(lines); });
    return () => { active = false; };
  }, [carpoolStop, currentStopDetail?.id]);
  const [exportUrl, setExportUrl] = useState('');
  const exportButtonRef = useRef<HTMLButtonElement>(null);
  const [hasAppliedInitialLines, setHasAppliedInitialLines] = useState(false);
  const text = getSidebarText(language);
  const isLight = theme === 'light';

  const sheetRef = useRef<SheetRef>(null);

  const safeBottom = useMemo(readSafeAreaBottom, []);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === 'undefined' ? 375 : window.innerWidth,
  );
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const snapPoints = useMemo(() => mapSheetSnapPoints({ bottomInset: safeBottom }), [safeBottom]);
  const collapsedPadding = useMemo(
    () => collapsedNavPadding(viewportWidth, NAV_ITEM_WIDTH),
    [viewportWidth],
  );
  const peekIndex = 2;
  const hasSettledRef = useRef(false);
  useEffect(() => {
    if (!closeSignal || !isOpen) return;
    if (hasSettledRef.current && sheetRef.current) sheetRef.current.snapTo(0);
    else onClose();
  }, [closeSignal]);
  useEffect(() => { hasSettledRef.current = false; }, [isOpen]);

  useEffect(() => {
    setCurrentStopId(stop?.id || null);
    if (!stop) { setCurrentStopDetail(null); return; }
    setCurrentStopDetail(prev => {
      if (prev?.id === stop.id && prev.lines?.length > 0 && (!stop.lines || stop.lines.length === 0)) {
        return { ...stop, lines: prev.lines, departures: stop.departures.length > 0 ? stop.departures : prev.departures, lastUpdate: stop.lastUpdate || prev.lastUpdate };
      }
      return stop;
    });
  }, [stop]);

  useEffect(() => {
    if (!isOpen || !currentStopDetail || frozen) return;
    let active = true;

    const load = async () => {
      for (const line of currentStopDetail.lines.slice(0, 12)) {
        const key = line.shortName || line.id;
        if (timetables.has(key)) continue;
        const timetable = await getTimetable(toTimetableRouteId(key));
        if (!active) return;
        setTimetables(previous => new Map(previous).set(key, timetable));
      }
    };

    void load();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentStopDetail?.id]);

  const offline = useIsOffline();
  const reconnects = useReconnectCount();

  const updateDepartures = async () => {
    if (!currentStopDetail || !isOpen || frozen || currentStopDetail.lines.length === 0) return;
    try {
      const updatedStopDetail = await refreshStopDepartures(currentStopDetail);
      setCurrentStopDetail(prev => {
        if (!prev) return updatedStopDetail;
        return { ...prev, ...updatedStopDetail, lines: prev.lines.length > 0 ? prev.lines : updatedStopDetail.lines };
      });
    } catch (error) {}
  };

  useEffect(() => {
    if (!isOpen || !currentStopDetail || currentStopDetail.lines.length === 0) return;
    updateDepartures();
    if (!autoSync) return;
    const interval = setInterval(updateDepartures, refreshIntervalMs);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentStopDetail?.id, currentStopDetail?.lines.length, autoSync, refreshIntervalMs, offline, reconnects]);

  const getDeparturePriority = (dep: Departure): number => {
    const tcl = tclDeparturePriority(dep.lineId);
    if (tcl !== null) return tcl;
    const id = dep.lineId.toUpperCase().trim();
    if (id === 'A') return 1000; if (id === 'B') return 900; if (id === 'C') return 800; if (id === 'D') return 700; if (id === 'E') return 600;
    const cMatch = /^C(\d+)$/.exec(id);
    if (cMatch) { const n = parseInt(cMatch[1], 10); if (n >= 1 && n <= 14) return 500 + (15 - n); }
    const nMatch = /^(\d+)$/.exec(id);
    if (nMatch) { const n = parseInt(nMatch[1], 10); if (n >= 15 && n <= 92) return 400 + (93 - n); }
    return 10;
  };

  useEffect(() => {
    if (!currentStopDetail) { setDepartures([]); return; }
    setDepartures(currentStopDetail.departures.filter(dep => getMinutesUntilDeparture(dep) >= 0));
  }, [currentStopDetail]);

  useEffect(() => {
    if (isControlled) return;
    if (initialSelectedLines && initialSelectedLines.size > 0 && !hasAppliedInitialLines) {
      setInternalSelectedLines(new Set(initialSelectedLines));
      setHasAppliedInitialLines(true);
    } else if (!initialSelectedLines || initialSelectedLines.size === 0) {
      setInternalSelectedLines(new Set());
      setHasAppliedInitialLines(false);
    }
  }, [currentStopId, initialSelectedLines, isControlled]);

  const displayedDepartures = (() => {
    const sorted = [...departures].sort((a, b) => {
      const pa = getDeparturePriority(a), pb = getDeparturePriority(b);
      if (pa !== pb) return pb - pa;
      return a.departureTime - b.departureTime;
    });
    return selectedLines.size === 0 ? sorted : sorted.filter(dep => selectedLines.has(dep.lineId));
  })();

  const groupedDepartures = (() => {
    type Group = { first: Departure; second?: Departure; count: number };
    const groups = new Map<string, Group>();
    displayedDepartures.forEach(dep => {
      const key = `${dep.lineId}::${dep.destination}`;
      const existing = groups.get(key);
      if (!existing) groups.set(key, { first: dep, count: 1 });
      else { existing.count += 1; if (!existing.second) existing.second = dep; }
    });
    return Array.from(groups.values()).sort((a, b) => {
      const pa = getDeparturePriority(a.first), pb = getDeparturePriority(b.first);
      if (pa !== pb) return pb - pa;
      return a.first.departureTime - b.first.departureTime;
    });
  })();


  const motionScope = currentStopDetail?.id ?? '';
  const { exitMode, filtering } = useExitMode([...selectedLines].sort().join(','));
  const firstPaint = useFirstPaint(motionScope);
  const groupMotion = useGroupMotion(
    motionScope,
    groupedDepartures.map(group => ({
      key: `${group.first.lineId}::${group.first.destination}`,
      minutes: group.first.departureTime,
      count: group.count,
    })),
  );

  const orderedGroups = [...groupedDepartures].sort((a, b) => {
    const priority = getDeparturePriority(b.first) - getDeparturePriority(a.first);
    if (priority !== 0) return priority;
    const rankA = groupMotion.get(`${a.first.lineId}::${a.first.destination}`)?.rank ?? 0;
    const rankB = groupMotion.get(`${b.first.lineId}::${b.first.destination}`)?.rank ?? 0;
    return rankA - rankB;
  });

  const toggleExpanded = (key: string) => {
    setExpandedItems(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
  };

  return (
    <>
    <Sheet
      ref={sheetRef}
      style={{ zIndex: 10 }}
      isOpen={isOpen}
      onClose={onClose}
      snapPoints={snapPoints}
      initialSnap={peekIndex}
      onOpenEnd={() => sheetRef.current?.snapTo(peekIndex)}
      onSnap={index => {
        if (index > NAVBAR_SNAP) { hasSettledRef.current = true; return; }
        if (hasSettledRef.current) onClose();
      }}
    >
      <MapSheetShell isLight={isLight} bottomInset={safeBottom} collapsedPadding={collapsedPadding}>
        <Sheet.Header>
          <div className="flex justify-center pt-2 pb-1">
            <div className={`h-1.5 w-16 rounded-full ${isLight ? 'bg-slate-300' : 'bg-white/30'}`} />
          </div>
        </Sheet.Header>
        <Sheet.Content disableDrag={state => state.scrollPosition !== 'top'}>
          <MapSheetBody>
          {currentStopDetail && (
          <div className="overflow-y-auto [scrollbar-gutter:stable] flex-1 pb-24">
            <div className="flex items-start justify-between px-5 pt-2 pb-4">
              <div className="flex-1 min-w-0 pr-3">
                {carpoolOnlyStop && (
                  <img
                    src={isLight ? '/assets/mco.png' : '/assets/mco_light.png'}
                    alt="M'Covoit"
                    className="mb-2 w-auto object-contain object-left" style={{ height: 30 }}
                  />
                )}
                <h2 className={`text-2xl font-extrabold leading-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  {currentStopDetail.name}
                  {stopIsAccessible && (
                    <FaWheelchair
                      className="ml-2 inline-block h-[0.7em] w-[0.7em] align-baseline text-blue-400"
                      title={language === 'fr' ? 'Arrêt accessible en fauteuil' : 'Wheelchair accessible stop'}
                      aria-label={language === 'fr' ? 'Arrêt accessible en fauteuil' : 'Wheelchair accessible stop'}
                    />
                  )}
                </h2>
                {currentStopDetail.city && <p className="text-sm text-slate-400 mt-0.5">{currentStopDetail.city}</p>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                {!IS_NANCY && (
                  <button
                    type="button"
                    onClick={() => onPlanRouteFromStop?.(currentStopDetail)}
                    className="flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-500 active:scale-95"
                    style={{ color: '#ffffff' }}
                    aria-label={text.planRouteFromStop}
                    title={text.planRouteFromStop}
                  >
                    GO
                  </button>
                )}
                <button
                  onClick={() => {
                  if (isFav) {
                      removeFavoriteAndNotify(currentStopDetail.id);
                      return;
                    }
                    const saved = setFavoriteAndNotify({
                      stopId: currentStopDetail.id,
                      stopName: currentStopDetail.name,
                      city: currentStopDetail.city,
                      lines: 'all',
                      addedAt: Date.now(),
                    });
                    if (!saved) setIsFavoriteModalOpen(true);
                  }}
                  className="w-9 h-9 flex items-center justify-center bg-slate-800 border border-slate-700 rounded-full transition hover:bg-slate-700"
                  aria-label={
                  isFav
                    ? language === 'fr' ? 'Retirer des favoris' : 'Remove from favourites'
                    : language === 'fr' ? 'Ajouter aux favoris' : 'Add to favourites'
                }
                >
                  {isFav
                    ? <BookmarkIcon className="w-4 h-4 text-blue-400" />
                    : <BookmarkOutlineIcon className="w-4 h-4 text-white" />}
                </button>
              </div>
            </div>

            {carpoolOnlyStop ? (
              <CarpoolStopPanel lines={servedCarpoolLines} language={language} isLight={isLight} />
            ) : (
              <>
            <div className="px-5 mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="section-caps text-slate-400">{text.lines}</h3>
                <button
                  ref={exportButtonRef}
                  onClick={() => {
                    const path = window.location.pathname;
                    const qs = selectedLines.size === 0
                      ? `T1=ALL_${currentStopDetail.id}`
                      : Array.from(selectedLines).sort().map((id, i) => `T${i+1}=${id}_${currentStopDetail.id}`).join('&');
                    setExportUrl(`${window.location.origin}${path}?${qs}`);
                    setIsExportModalOpen(true);
                  }}
                  className="w-7 h-7 flex items-center justify-center hover:bg-slate-800 rounded-lg transition"
                  title={text.exportConfiguration}
                >
                  <EllipsisVerticalIcon className="w-4 h-4 text-slate-400" />
                </button>
              </div>

              <div className="flex flex-wrap gap-2.5 mb-3">
                {[...currentStopDetail.lines].sort(sortLinesByPriority).map(line => {
                  const isActive = selectedLines.has(line.id);
                  const isSelected = selectedLines.size === 0 || isActive;
                  return (
                    <div key={line.id} className="relative">
                      <button
                        onClick={() => setSelectedLines(prev => { const next = new Set(prev); next.has(line.id) ? next.delete(line.id) : next.add(line.id); return next; })}
                        className="relative p-0"
                        title={line.name}
                        type="button"
                      >
                        <LineBadge
                          line={line}
                          size="sm"
                          active={isActive}
                          selected={isSelected}
                        />
                      </button>
                      {line.hasTraffic && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-400 rounded-full flex items-center justify-center">
                          <ExclamationTriangleIcon className="w-2.5 h-2.5 text-amber-900" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                onClick={() => setSelectedLines(new Set())}
                className="text-xs px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-300 hover:bg-slate-700 transition"
              >
                {text.showAll}
              </button>
            </div>

            {isExportModalOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mx-5 mb-5 bg-slate-800 rounded-2xl p-4 border border-slate-700"
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white">{text.exportedConfiguration}</h3>
                  <button onClick={() => setIsExportModalOpen(false)} className="w-6 h-6 flex items-center justify-center hover:bg-slate-700 rounded-lg transition">
                    <XMarkIcon className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">{text.shareLink}</label>
                <div className="flex gap-2">
                  <input type="text" value={exportUrl} readOnly
                    className="flex-1 px-3 py-2 border border-slate-600 rounded-xl text-white text-xs font-mono bg-slate-700" />
                  <CopyButton value={exportUrl} copyLabel={text.copy} copiedLabel={text.copied} />
                </div>
              </motion.div>
            )}

              </>
            )}

            <StopTrafficAlerts stop={currentStopDetail} language={language} selectedLines={selectedLines} />

            {carpoolFiltered && !carpoolOnlyStop ? (
              <CarpoolStopPanel lines={servedCarpoolLines} language={language} isLight={isLight} />
            ) : carpoolOnlyStop ? null : (
              <>
            <div className="px-5">
              <h3 className="section-caps text-slate-400 mb-3">{text.nextDepartures}</h3>
              <div className="space-y-3">
                {groupedDepartures.length > 0 ? (<DepartureList exitMode={exitMode} className="flex flex-col gap-3">{orderedGroups.map((group, index) => {
                  const departure = group.first;
                  const second = group.second;
                  const displayTime = getDepartureDisplay(departure, language);
                  const isTram = isTramway(departure.lineId);
                  const mode = normalizeMode(departure.type);
                  const isChrono = isChronoLine(departure.lineId);
                  const itemKey = `${departure.lineId}::${departure.destination}`;
                  const isExpanded = expandedItems.has(itemKey);
                  const departureLine = currentStopDetail.lines.find(l => l.id === departure.lineId) ?? currentStopDetail.lines.find(l => l.shortName === departure.lineShortName || l.shortName === departure.lineId);
                  const secondLine = second ? (currentStopDetail.lines.find(l => l.id === second.lineId) ?? currentStopDetail.lines.find(l => l.shortName === second.lineShortName || l.shortName === second.lineId)) : undefined;
                  const departureRef = departureLine?.routeId || departure.routeId || departure.lineId;
                  const secondRef = second ? (secondLine?.routeId || second.routeId || second.lineId) : '';
                  const departureIsSem = isGrenobleNetworkLine(departureRef);
                  const secondIsSem = isGrenobleNetworkLine(secondRef);
                  const departureStyle: any = departureLine ? resolveLineStyle(departureRef, departureLine.color, departureLine.textColor) : resolveLineStyle(departureRef) as any;
                  const secondStyle: any = secondLine ? resolveLineStyle(secondRef, secondLine.color, secondLine.textColor) : resolveLineStyle(secondRef) as any;
                  const hasTrafficAlert = !!(departureLine?.hasTraffic && departureLine?.trafficDetails?.length);
                  const secondHasTraffic = !!(secondLine?.hasTraffic && secondLine?.trafficDetails?.length);
                  const isLastRun = isLastDeparture(
                    timetables.get(departure.lineShortName || departure.lineId) ?? null,
                    departure.destination,
                    getMinutesUntilDeparture(departure),
                  );
                  const cardMotion = groupMotion.get(itemKey);
                  const cardKey = cardMotion?.renderKey ?? itemKey;

                  if (second) {
                    return (
                      <DepartureCard key={cardKey} index={index} firstPaint={firstPaint} filtering={filtering}
                        className="border border-slate-700 rounded-2xl overflow-hidden bg-slate-800">
                            <motion.button
                          onClick={() => toggleExpanded(itemKey)}
                          className={`w-full ${compactMode ? 'p-3' : 'p-4'} hover:bg-slate-750 active:bg-slate-700 transition text-left`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <DepartureLineBadge
                            routeRef={departureRef}
                            label={departure.lineShortName || departure.lineId}
                            style={departureStyle}
                            round={departureIsSem && isRoundLine(departure.lineId)}
                            sizeClass="w-10 h-10 text-sm"
                            hasTraffic={hasTrafficAlert}
                          />
                              <div className="min-w-0 flex-1">
                                {(departure.theoretical || departure.train) ? (
  <div className="flex min-w-0 items-center gap-1.5"><div className="min-w-0 flex-1"><ScrollingText text={departure.destination} className="text-sm font-semibold text-white" /></div><DepartureTags departure={departure} language={language} /></div>
) : <p className="text-sm font-semibold text-white truncate">{departure.destination}</p>}
                                {isLastRun && <div className="mt-1"><LastRunRibbon language={language} /></div>}
                                <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                                  <TransportModeIcon mode={mode} className="w-3.5 h-3.5" />
                                  <span>{modeLabel(mode, text)}</span>
                                  {departure.realtime && (
                                    <RealtimeWifi
                                      size={13}
                                      className="text-green-400"

                                      label={text.live}
                                    />
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                              <div className="text-right">
                                <MotionTime className={`text-lg font-bold ${isLastRun ? LAST_RUN_TEXT : 'text-white'}`} value={renderDepartureTime(displayTime)} valueKey={displayTime} change={cardMotion?.change ?? null} />
                                {!compactMode && (isTram || isChrono) && <OccupancyDisplay occupancy={departure.occupancy} />}
                              </div>
                              {isExpanded ? <ChevronUpIcon className="w-4 h-4 text-slate-400" /> : <ChevronDownIcon className="w-4 h-4 text-slate-400" />}
                            </div>
                          </div>
                        </motion.button>

                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: isExpanded ? 'auto' : 0, opacity: isExpanded ? 1 : 0 }} transition={{ duration: 0.25 }} className="overflow-hidden border-t border-slate-700">
                          <div className={`${compactMode ? 'p-3' : 'p-4'} bg-slate-800/60 space-y-3`}>
                            <p className="pb-3 text-sm font-semibold text-slate-300">{text.nextDeparture}</p>
                            <div className="flex items-center gap-3">
                              <DepartureLineBadge
                                routeRef={secondRef}
                                label={second.lineShortName || second.lineId}
                                style={secondStyle}
                                round={secondIsSem && isRoundLine(second.lineId)}
                                sizeClass="w-10 h-10 text-sm"
                                hasTraffic={secondHasTraffic}
                              />
                              <div className="min-w-0 flex-1">
                                {(second.theoretical || second.train) ? (
  <div className="flex min-w-0 items-center gap-1.5"><div className="min-w-0 flex-1"><ScrollingText text={second.destination} className="text-sm font-semibold text-white" /></div><DepartureTags departure={second} language={language} /></div>
) : <p className="truncate text-sm font-semibold text-white">{second.destination}</p>}
                                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
                                  <TransportModeIcon mode={second.type} className="w-3 h-3" />
                                  {second.realtime && (
                                    <RealtimeWifi
                                      size={13}
                                      className="text-green-400"

                                      label={text.live}
                                    />
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="bg-slate-900/70 rounded-xl p-3">
                                <p className="text-xs text-slate-400 font-medium mb-1">{text.time}</p>
                                <p className="text-2xl font-bold text-white">{renderDepartureTime(getDepartureDisplay(second, language))}</p>
                              </div>
                              {(isTram || isChrono) && (
                                <div className="bg-slate-900/70 rounded-xl p-3">
                                  <p className="text-xs text-slate-400 font-medium mb-2 text-center">{text.occupancy}</p>
                                  {!compactMode && <OccupancyDisplay occupancy={second.occupancy} showError size="lg" />}
                                </div>
                              )}
                            </div>
                            {hasTrafficAlert && departureLine?.trafficDetails?.[0] && (
                              <TrafficAlertCard
                                detail={departureLine.trafficDetails[0]}
                                language={language}
                                heading={`${text.disruptedTraffic} ${departureLine.shortName || departureLine.id}`}
                              />
                            )}

                            <DepartureQuickActions
                              style={departureStyle}
                              actions={[
                                {
                                  label: text.timetable,
                                  Icon: ClockIcon,
                                  onSelect: () => onOpenTimetable?.({
                                    line: departureLine ?? { id: departure.lineId, shortName: departure.lineShortName },
                                    headsign: departure.destination,
                                  }),
                                },
                                {
                                  label: text.seeLine,
                                  Icon: MapIcon,
                                  onSelect: () => onOpenLine?.(departureLine ?? { id: departure.lineId, shortName: departure.lineShortName }),
                                },
                                {
                                  label: text.planRoute,
                                  Icon: ArrowsRightLeftIcon,
                                  onSelect: () => currentStopDetail && onPlanRouteFromStop?.(currentStopDetail),
                                },
                              ]}
                            />
                          </div>
                        </motion.div>
                      </DepartureCard>
                    );
                  }

                  if (isTram) {
                    return (
                      <DepartureCard key={cardKey} index={index} firstPaint={firstPaint} filtering={filtering}
                        className="flex items-center justify-between p-3 rounded-2xl bg-slate-800 border border-slate-700 hover:bg-slate-750 transition">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <DepartureLineBadge
                            routeRef={departureRef}
                            label={departure.lineShortName || departure.lineId}
                            style={departureStyle}
                            round={departureIsSem && isRoundLine(departure.lineId)}
                            sizeClass="w-10 h-10 text-sm"
                            hasTraffic={hasTrafficAlert}
                          />
                          <div className="min-w-0 flex-1">
                            {(departure.theoretical || departure.train) ? (
  <div className="flex min-w-0 items-center gap-1.5"><div className="min-w-0 flex-1"><ScrollingText text={departure.destination} className="text-sm font-semibold text-white" /></div><DepartureTags departure={departure} language={language} /></div>
) : <p className="text-sm font-semibold text-white truncate">{departure.destination}</p>}
                            {isLastRun && <div className="mt-1"><LastRunRibbon language={language} /></div>}
                            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                              <TransportModeIcon mode={departure.type} className="w-3 h-3" />{modeLabel(normalizeMode(departure.type), text)}{departure.realtime && <RealtimeWifi size={13} className="text-green-400" label={text.live} />}
                            </p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 ml-2">
                          <MotionTime className={`text-lg font-bold ${isLastRun ? LAST_RUN_TEXT : 'text-white'}`} value={renderDepartureTime(displayTime)} valueKey={displayTime} change={cardMotion?.change ?? null} />
                          {!compactMode && <OccupancyDisplay occupancy={departure.occupancy} />}
                        </div>
                      </DepartureCard>
                    );
                  }

                  return (
                    <DepartureCard key={cardKey} index={index} firstPaint={firstPaint} filtering={filtering}
                      className="flex items-center justify-between p-3 rounded-2xl border border-slate-700 bg-slate-800 transition hover:bg-slate-750">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <DepartureLineBadge
                            routeRef={departureRef}
                            label={departure.lineShortName || departure.lineId}
                            style={departureStyle}
                            round={departureIsSem && isRoundLine(departure.lineId)}
                            sizeClass="w-10 h-10 text-sm"
                            hasTraffic={hasTrafficAlert}
                          />
                        <div className="min-w-0 flex-1">
                          {(departure.theoretical || departure.train) ? (
  <div className="flex min-w-0 items-center gap-1.5"><div className="min-w-0 flex-1"><ScrollingText text={departure.destination} className="text-sm font-semibold text-white" /></div><DepartureTags departure={departure} language={language} /></div>
) : <p className="text-sm font-semibold text-white truncate">{departure.destination}</p>}
                          {isLastRun && <div className="mt-1"><LastRunRibbon language={language} /></div>}
                          <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                            <TransportModeIcon mode={departure.type} className="w-3 h-3" />
                            {modeLabel(normalizeMode(departure.type), text)}
                            {departure.realtime && <RealtimeWifi size={13} className="text-green-400" label={text.live} />}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <MotionTime className={`text-lg font-bold ${isLastRun ? LAST_RUN_TEXT : 'text-white'}`} value={renderDepartureTime(displayTime)} valueKey={displayTime} change={cardMotion?.change ?? null} />
                        {second && <p className="text-xs text-slate-500">{renderDepartureTime(getDepartureDisplay(second, language))}</p>}
                      </div>
                    </DepartureCard>
                  );
                })}</DepartureList>) : currentStopDetail.lastUpdate ? (
                  <NextServiceDepartures
                    stopId={currentStopDetail.id}
                    lines={currentStopDetail.lines}
                    selectedLines={selectedLines}
                    language={language}
                    emptyLabel={text.noDeparturesAvailable}
                  />
                ) : (
                  <p className="text-center text-slate-500 py-10 text-sm">{text.noDeparturesAvailable}</p>
                )}
              </div>

              {perf.devMode && currentStopDetail.lastUpdate && (
                <p className="tabular px-1 pt-4 text-center text-[0.6875rem] text-slate-500">
                  {language === 'fr' ? 'Dernière requête effectuée à ' : 'Last request at '}
                  {currentStopDetail.lastUpdate.toLocaleTimeString(language === 'fr' ? 'fr-FR' : 'en-GB', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </p>
              )}
            </div>
              </>
            )}
          </div>
          )}
          </MapSheetBody>
        </Sheet.Content>
      </MapSheetShell>
    </Sheet>
    <AddFavoriteModal
      isOpen={isFavoriteModalOpen}
      onClose={() => setIsFavoriteModalOpen(false)}
      stop={currentStopDetail}
      language={language}
      theme={theme}
    />
    </>
  );
};
