import { stripHtml } from '../utils/stripHtml';
import { DepartureCard, DepartureList, MotionTime, useExitMode, useFirstPaint, useGroupMotion } from './DepartureMotion';
import { ScrollingText } from './ScrollingText';
import { useIsOffline, useReconnectCount } from '../hooks/useIsOffline';
﻿import { motion } from 'framer-motion';
import type { StopDetail, Departure } from '../types';
import { RealtimeWifi } from './RealtimeWifi';
import { TheoreticalPill } from './TheoreticalPill';
import { sortLinesByPriority, tclDeparturePriority } from '../utils/lineOrder';
import { TrafficAlertCard } from './TrafficAlertCard';
import { CarpoolStopPanel, isCarpoolStop, isCarpoolLine } from './CarpoolStopPanel';
import { getMcoLines, type McoLine } from '../services/mcoLines';
import { formatDepartureTime, refreshStopDepartures } from '../services/api';
import { useEffect, useState, useRef, useMemo } from 'react';
import { UserIcon, MapIcon, ClockIcon, ArrowsRightLeftIcon, ChevronDownIcon, ChevronUpIcon, XMarkIcon, EllipsisVerticalIcon, ExclamationTriangleIcon, CheckIcon, BookmarkIcon } from '@heroicons/react/24/solid';
import { BookmarkIcon as BookmarkOutlineIcon } from '@heroicons/react/24/outline';
import { resolveLineStyle, isGrenobleNetworkLine } from '../utils/lineColors';
import { isFavorite, removeFavoriteAndNotify, setFavoriteAndNotify, subscribeFavorites } from '../services/favorites';
import { AddFavoriteModal } from './AddFavoriteModal';
import { TransportModeIcon } from './TransportModeIcon';
import { normalizeMode } from '../utils/transportMode';
import { LineBadge } from './LineBadge';
import { DepartureLineBadge } from './DepartureLineBadge';
import { NextServiceDepartures } from './NextServiceDepartures';
import { getStopTrafficAlerts, filterAlertsBySelectedLines } from '../utils/stopTrafficMatcher';
import { getTimetable, isLastDeparture, toTimetableRouteId, type Timetable } from '../services/timetable';
import { LastRunRibbon, LAST_RUN_TEXT } from './LastRunRibbon';
import { DepartureQuickActions } from './DepartureQuickActions';
import { FaWheelchair } from 'react-icons/fa';
import { useAccessibleStops } from '../hooks/useAccessibleStops';
import { usePerfSettings } from '../hooks/usePerfSettings';
import { isStopAccessible } from '../services/stopAccessibility';

interface SidebarProps {
  stop: StopDetail | null;
  isOpen: boolean;
  onClose: () => void;
  initialSelectedLines?: Set<string>;

  selectedLines?: Set<string>;
  frozen?: boolean;
  onSelectedLinesChange?: (lines: Set<string>) => void;
  compactMode: boolean;
  autoSync: boolean;
  refreshIntervalMs: number;
  language: 'fr' | 'en';
  onPlanRouteFromStop?: (stop: StopDetail) => void;

  onOpenTimetable?: (info: { line: { id: string; shortName?: string; color?: string; textColor?: string }; headsign: string }) => void;

  onOpenLine?: (line: { id: string; shortName?: string }) => void;
  theme?: 'light' | 'dark';
}

const getMinutesUntilDeparture = (departure: Departure): number => departure.departureTime;

const getDepartureDisplay = (departure: Departure, language: 'fr' | 'en'): string => {
  if (departure.departureTime > 35) {
    const arrival = new Date(Date.now() + departure.departureTime * 60000);
    return `${arrival.getHours().toString().padStart(2,'0')}:${arrival.getMinutes().toString().padStart(2,'0')}`;
  }
  return formatDepartureTime(departure, language);
};

const getSidebarText = (language: 'fr' | 'en') => {
  const isFr = language === 'fr';
  return {
    lines: isFr ? 'Lignes' : 'Lines',
    filter: isFr ? 'Filtrer :' : 'Filter:',
    showAll: isFr ? 'Afficher tout' : 'Show all',
    exportConfiguration: isFr ? 'Exporter la configuration' : 'Export configuration',
    exportedConfiguration: isFr ? 'Configuration exportée' : 'Exported configuration',
    shareLink: isFr ? 'Lien de partage' : 'Share link',
    copy: isFr ? 'Copier' : 'Copy',
    copied: isFr ? 'Copié' : 'Copied',
    nextDepartures: isFr ? 'Prochains départs' : 'Next departures',
    tramway: isFr ? 'Tramway' : 'Tramway',
    train: isFr ? 'Train' : 'Train',
    metro: isFr ? 'Métro' : 'Metro',
    bus: 'Bus',
    live: isFr ? 'Direct' : 'Live',
    nextDeparture: isFr ? 'Second passage' : 'Second departure',
    time: isFr ? 'Heure' : 'TIME',
    occupancy: isFr ? 'Affluence' : 'OCCUPANCY',
    realTimeData: isFr ? 'Données en temps réel' : 'Real-time data',
    disruptedTraffic: isFr ? 'Trafic perturbé sur la ligne' : 'Disrupted traffic on line',
    noDeparturesAvailable: isFr ? 'Aucun départ disponible' : 'No departures available',
    detailsUnavailable: isFr ? 'Détails non disponibles' : 'Details unavailable',
    ongoingDisruption: isFr ? 'Perturbation en cours' : 'Ongoing disruption',
    estimatedEnd: isFr ? 'Fin estimée :' : 'Estimated end:',
    nextLabel: isFr ? 'PROCHAIN' : 'NEXT',
    moreDepartures: (count: number) => isFr ? `+${count} départs supplémentaires` : `+${count} more departures`,
    calculateItinerary: isFr ? 'Calculer un itinéraire' : 'Plan a journey',
    direction: isFr ? 'Direction' : 'Direction',
    stopAlerts: isFr ? 'Cet arrêt est concerné' : 'Affecting this stop',
    stopAlertsCount: (n: number) => isFr ? `${n} info${n > 1 ? 's' : ''} trafic` : `${n} alert${n > 1 ? 's' : ''}`,
    seeMore: isFr ? 'Voir plus' : 'See more',
    seeLess: isFr ? 'Voir moins' : 'See less',
    planRouteFromStop: isFr ? 'Planifier un trajet depuis cet arrêt' : 'Plan a trip from this stop',
    timetable: isFr ? 'Fiche horaire' : 'Timetable',
    seeLine: isFr ? 'Voir la ligne' : 'View line',
    planRoute: isFr ? 'Itinéraire' : 'Directions',
  };
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
  const code = lineId.toUpperCase().trim().includes('_') ? lineId.toUpperCase().trim().split('_').pop()! : lineId.toUpperCase().trim();
  if (['A','B','C','D','E'].includes(code)) return true;
  const m = /^C(\d+)$/.exec(code);
  return !!m && parseInt(m[1], 10) >= 1 && parseInt(m[1], 10) <= 14;
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
          className={`text-slate-300 ${isLarge ? 'w-6 h-6' : 'w-3.5 h-3.5'}`}
          style={{ opacity: i < level ? 1 : 0.2 }}
        />
      ))}
    </div>
  );
};

const renderDepartureTime = (timeString: string) => {
  const match = timeString.match(/^(\d+)(m)$/);
  if (match) return <><span className="font-bold">{match[1]}</span><span className="font-normal text-sm">{match[2]}</span></>;
  return timeString;
};

const ExportModal = ({ isOpen, onClose, exportUrl, position, language }: { isOpen: boolean; onClose: () => void; exportUrl: string; position?: { x: number; y: number } | null; language: 'fr' | 'en' }) => {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!isOpen) setCopied(false);
  }, [isOpen, exportUrl]);

  if (!isOpen || !position) return null;
  const text = getSidebarText(language);
  const modalWidth = 288;
  const padding = 16;
  const left = Math.min(position.x, window.innerWidth - modalWidth - padding);
  const top = Math.min(position.y + 8, window.innerHeight - 160 - padding);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(exportUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      style={{ position: 'fixed', left, top, zIndex: 70 }}
      className="bg-slate-800 border border-slate-700 rounded-2xl p-4 shadow-2xl w-72"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">{text.exportedConfiguration}</h3>
        <button onClick={onClose} className="w-6 h-6 flex items-center justify-center hover:bg-slate-700 rounded-lg transition">
          <XMarkIcon className="w-4 h-4 text-slate-400" />
        </button>
      </div>
      <label className="block text-xs text-slate-400 mb-1.5">{text.shareLink}</label>
      <div className="flex gap-2">
        <input type="text" value={exportUrl} readOnly
          className="flex-1 px-2.5 py-1.5 border border-slate-600 rounded-xl text-white text-xs font-mono bg-slate-700" />
        <motion.button
          onClick={handleCopy}
          animate={{
            backgroundColor: copied ? '#10b981' : '#2563eb',
          }}
          transition={{ duration: 0.2 }}
          className="px-3 py-1.5 text-white rounded-xl text-xs font-semibold flex-shrink-0 flex items-center gap-1.5 min-w-[68px] justify-center"
        >
          {copied ? (
            <>
              <CheckIcon className="w-3.5 h-3.5" />
              <span>{text.copied}</span>
            </>
          ) : (
            <span>{text.copy}</span>
          )}
        </motion.button>
      </div>
    </motion.div>
  );
};

export const Sidebar = ({
  stop,
  isOpen,
  frozen = false,
  onClose,
  initialSelectedLines,
  selectedLines: controlledSelectedLines,
  onSelectedLinesChange,
  compactMode,
  autoSync,
  refreshIntervalMs,
  language,
  theme,
  onPlanRouteFromStop,
  onOpenTimetable,
  onOpenLine,
}: SidebarProps) => {
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
  const [hoveredTrafficLine, setHoveredTrafficLine] = useState<string | null>(null);
  const [tooltipCoords, setTooltipCoords] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
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
  const [exportUrl, setExportUrl] = useState('');
  const [exportModalPos, setExportModalPos] = useState<{ x: number; y: number } | null>(null);
  const exportButtonRef = useRef<HTMLButtonElement>(null);
  const [hasAppliedInitialLines, setHasAppliedInitialLines] = useState(false);

  const [timetables, setTimetables] = useState<Map<string, Timetable | null>>(new Map());

  const text = getSidebarText(language);

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

  const stopLines = currentStopDetail?.lines ?? [];
  const carpoolServed = stopLines.filter(isCarpoolLine);
  const carpoolOnly = stopLines.length > 0 && carpoolServed.length === stopLines.length;
  const carpoolFiltered =
    selectedLines.size > 0 &&
    stopLines.filter(line => selectedLines.has(line.id)).every(isCarpoolLine) &&
    stopLines.some(line => selectedLines.has(line.id) && isCarpoolLine(line));
  const carpoolOnlyStop = isCarpoolStop(currentStopDetail?.id) && carpoolOnly;
  const carpoolStop = carpoolOnlyStop || carpoolFiltered;
  useEffect(() => {
    if (!carpoolStop) { setCarpoolLines([]); return; }
    let active = true;
    getMcoLines().then(lines => { if (active) setCarpoolLines(lines); });
    return () => { active = false; };
  }, [carpoolStop, currentStopDetail?.id]);

  const servedCarpoolLines = useMemo(() => {
    const served = new Set(carpoolServed.map(line => String(line.id).toUpperCase()));
    if (served.size === 0) return carpoolLines;
    const kept = carpoolLines.filter(line => served.has(line.code.toUpperCase()));
    return kept.length > 0 ? kept : carpoolLines;
  }, [carpoolLines, carpoolServed]);

  const stopTrafficAlerts = useMemo(() => {
    if (!currentStopDetail) return [];
    return filterAlertsBySelectedLines(
      getStopTrafficAlerts({ name: currentStopDetail.name }, currentStopDetail.lines || []),
      selectedLines,
    );
  }, [currentStopDetail?.id, currentStopDetail?.name, currentStopDetail?.lines, selectedLines]);


  useEffect(() => {
    if (!isOpen || !currentStopDetail || frozen) return;
    let active = true;

    const load = async () => {
      const lines = currentStopDetail.lines.slice(0, 12);
      for (const line of lines) {
        const key = line.shortName || line.id;
        if (timetables.has(key)) continue;
        const timetable = await getTimetable(toTimetableRouteId(key));
        if (!active) return;
        setTimetables((previous: Map<string, Timetable | null>) => new Map(previous).set(key, timetable));
      }
    };

    void load();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentStopDetail?.id]);

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
    <motion.div
      initial={{ x: -420, opacity: 0 }}
      animate={{ x: isOpen ? 0 : -420, opacity: isOpen ? 1 : 0 }}
      exit={{ x: -420, opacity: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="relative fixed left-0 top-0 h-screen w-96 border-r border-slate-800 shadow-2xl z-60 overflow-y-auto [scrollbar-gutter:stable] bg-slate-900"
    >
      {isOpen && currentStopDetail && (
        <div className={compactMode ? 'p-4 pb-10' : 'p-6 pb-10'}>

          <div className="relative flex items-start justify-between mb-6 pt-1">
            <div className="flex-1 min-w-0 pr-3">
              {carpoolOnlyStop && (
                <img
                  src={theme === 'light' ? '/assets/mco.png' : '/assets/mco_light.png'}
                  alt="M'Covoit"
                  className="mb-2 w-auto object-contain object-left" style={{ height: 35 }}
                />
              )}
              <h2 className="text-3xl font-extrabold leading-tight" style={{ color: theme === 'light' ? '#0f172a' : '#ffffff' }}>
                {currentStopDetail.name}
                {stopIsAccessible && (
                  <FaWheelchair
                    className="ml-2 inline-block h-[0.7em] w-[0.7em] align-baseline text-blue-400"
                    title={language === 'fr' ? 'Arrêt accessible en fauteuil' : 'Wheelchair accessible stop'}
                    aria-label={language === 'fr' ? 'Arrêt accessible en fauteuil' : 'Wheelchair accessible stop'}
                  />
                )}
              </h2>
              {!compactMode && currentStopDetail.city && (
                <p className="text-sm text-slate-400 mt-1">{currentStopDetail.city}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => currentStopDetail && onPlanRouteFromStop?.(currentStopDetail)}
                className="flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-500 active:scale-95"
                style={{ color: '#ffffff' }}
                aria-label={text.planRouteFromStop}
                title={text.planRouteFromStop}
              >
                GO
              </button>
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
              <button onClick={onClose}
                className="w-9 h-9 flex items-center justify-center bg-slate-800 border border-slate-700 rounded-full hover:bg-slate-700 transition">
                <XMarkIcon className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>

          {carpoolOnlyStop ? (
            <CarpoolStopPanel lines={servedCarpoolLines} language={language} isLight={theme === 'light'} />
          ) : (
            <>
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="section-caps text-slate-400">{text.lines}</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => setSelectedLines(new Set())}
                  className="text-xs px-2.5 py-1 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-700 transition">
                  {text.showAll}
                </button>
                <button
                  ref={exportButtonRef}
                  onClick={() => {
                    const path = window.location.pathname;
                    const qs = selectedLines.size === 0
                      ? `T1=ALL_${currentStopDetail.id}`
                      : Array.from(selectedLines).sort().map((id, i) => `T${i+1}=${id}_${currentStopDetail.id}`).join('&');
                    setExportUrl(`${window.location.origin}${path}?${qs}`);
                    if (exportButtonRef.current) {
                      const rect = exportButtonRef.current.getBoundingClientRect();
                      setExportModalPos({ x: rect.right + 8, y: rect.top });
                    }
                    setIsExportModalOpen(true);
                  }}
                  className="w-7 h-7 flex items-center justify-center hover:bg-slate-800 rounded-lg transition"
                  title={text.exportConfiguration}
                >
                  <EllipsisVerticalIcon className="w-4 h-4 text-slate-400" />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
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
                        size={compactMode ? 'sm' : 'md'}
                        active={isActive}
                        selected={isSelected}
                      />
                    </button>
                    {line.hasTraffic && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-400 rounded-full flex items-center justify-center cursor-pointer"
                        onMouseEnter={e => { setHoveredTrafficLine(line.id); setTooltipCoords({ x: e.clientX, y: e.clientY }); }}
                        onMouseMove={e => setTooltipCoords({ x: e.clientX, y: e.clientY })}
                        onMouseLeave={() => setHoveredTrafficLine(null)}>
                        <ExclamationTriangleIcon className="w-2.5 h-2.5 text-amber-900" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {hoveredTrafficLine && (() => {
            const line = currentStopDetail.lines.find(l => l.id === hoveredTrafficLine);
            if (!line) return null;
            const baseWidth = 288;
            const left = Math.min(tooltipCoords.x + 12, window.innerWidth - baseWidth - 8);
            const top = Math.min(tooltipCoords.y + 12, window.innerHeight - 130 - 8);
            return (
              <div style={{ left, top, width: baseWidth }} className="fixed z-[55] pointer-events-none bg-slate-900/95 border border-slate-700 text-white text-xs p-3 rounded-xl shadow-xl">
                <p className="font-semibold text-yellow-400 mb-1">{text.disruptedTraffic} {line.shortName || line.id}</p>
                {line.trafficDetails?.length ? (
                  <>
                    <p className="text-slate-200">{stripHtml(line.trafficDetails[0].titre)}</p>
                    <p className="text-slate-400 mt-1 whitespace-pre-line line-clamp-6">{stripHtml(line.trafficDetails[0].description)}</p>
                    <p className="text-slate-500 mt-1">{text.estimatedEnd} {line.trafficDetails[0].dateFin || 'N/A'}</p>
                  </>
                ) : <p className="text-slate-400">{text.detailsUnavailable}</p>}
              </div>
            );
          })()}

            </>
          )}

          {stopTrafficAlerts.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="section-caps text-amber-400 flex items-center gap-1.5">
                  <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                  {text.stopAlerts}
                </h3>
                <span className="text-xs text-amber-400/70">
                  {text.stopAlertsCount(stopTrafficAlerts.length)}
                </span>
              </div>
              <div className="space-y-2">
                {stopTrafficAlerts.map((alert, idx) => (
                  <motion.div
                    key={`${alert.detail.titre}-${alert.detail.dateFin}-${idx}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
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
          )}

          {carpoolFiltered && !carpoolOnlyStop ? (
            <CarpoolStopPanel lines={servedCarpoolLines} language={language} isLight={theme === 'light'} />
          ) : carpoolOnlyStop ? null : (
            <>
          <div>
            <h3 className="section-caps text-slate-400 mb-3">{text.nextDepartures}</h3>
            <div className="space-y-2">
              {groupedDepartures.length > 0 ? (<DepartureList exitMode={exitMode} className="flex flex-col gap-3">{orderedGroups.map((group, index) => {
                const departure = group.first;
                const second = group.second;
                const displayTime = getDepartureDisplay(departure, language);
                const minutesUntil = getMinutesUntilDeparture(departure);
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
                  minutesUntil,
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
                              {departure.theoretical ? (
  <div className="flex min-w-0 items-center gap-1.5"><div className="min-w-0 flex-1"><ScrollingText text={departure.destination} className="text-sm font-semibold text-white" /></div><TheoreticalPill language={language} /></div>
) : <p className="text-sm font-semibold text-white truncate">{departure.destination}</p>}
                              {isLastRun && <div className="mt-1"><LastRunRibbon language={language} /></div>}
                              <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                                <TransportModeIcon mode={mode} className="w-3.5 h-3.5" />
                                <span>{modeLabel(mode, text)}</span>
                                {departure.realtime && <RealtimeWifi size={13} className="text-green-400" label={text.live} />}
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
                              {second.theoretical ? (
  <div className="flex min-w-0 items-center gap-1.5"><div className="min-w-0 flex-1"><ScrollingText text={second.destination} className="text-sm font-semibold text-white" /></div><TheoreticalPill language={language} /></div>
) : <p className="truncate text-sm font-semibold text-white">{second.destination}</p>}
                              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
                                <TransportModeIcon mode={second.type} className="w-3 h-3" />
                                {second.realtime && <RealtimeWifi size={13} className="text-green-400" label={text.live} />}
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
                          {departure.theoretical ? (
  <div className="flex min-w-0 items-center gap-1.5"><div className="min-w-0 flex-1"><ScrollingText text={departure.destination} className="text-sm font-semibold text-white" /></div><TheoreticalPill language={language} /></div>
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
                        {departure.theoretical ? (
  <div className="flex min-w-0 items-center gap-1.5"><div className="min-w-0 flex-1"><ScrollingText text={departure.destination} className="text-sm font-semibold text-white" /></div><TheoreticalPill language={language} /></div>
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
                <p className="text-sm text-slate-500 py-6 text-center">{text.noDeparturesAvailable}</p>
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

      <ExportModal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} exportUrl={exportUrl} position={exportModalPos} language={language} />
      <AddFavoriteModal
        isOpen={isFavoriteModalOpen}
        onClose={() => setIsFavoriteModalOpen(false)}
        stop={currentStopDetail}
        language={language}
        theme={theme}
      />
    </motion.div>
  );
};
