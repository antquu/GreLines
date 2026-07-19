import { motion } from 'framer-motion';
import type { StopDetail, Departure } from '../types';
import { formatDepartureTime, refreshStopDepartures } from '../services/api';
import { useEffect, useState, useRef, useMemo } from 'react';
import { UserIcon, ChevronDownIcon, ChevronUpIcon, XMarkIcon, EllipsisVerticalIcon, ExclamationTriangleIcon, CheckIcon, StarIcon, MapIcon } from '@heroicons/react/24/solid';
import { StarIcon as StarOutlineIcon } from '@heroicons/react/24/outline';
import { resolveLineStyle } from '../utils/lineColors';
import { isFavorite, removeFavoriteAndNotify, subscribeFavorites } from '../services/favorites';
import { AddFavoriteModal } from './AddFavoriteModal';
import { MdTram, MdDirectionsBus } from 'react-icons/md';
import { getStopTrafficAlerts } from '../utils/stopTrafficMatcher';

interface SidebarProps {
  stop: StopDetail | null;
  isOpen: boolean;
  onClose: () => void;
  initialSelectedLines?: Set<string>;
  /**
   * Controlled mode: if provided, the sidebar uses these and notifies the
   * parent via `onSelectedLinesChange`. If both are omitted, the sidebar
   * falls back to internal state (legacy behavior).
   */
  selectedLines?: Set<string>;
  onSelectedLinesChange?: (lines: Set<string>) => void;
  compactMode: boolean;
  autoSync: boolean;
  refreshIntervalMs: number;
  language: 'fr' | 'en';
  onPlanRouteFromStop?: (stop: StopDetail) => void;
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
    bus: 'Bus',
    live: isFr ? 'Direct' : 'Live',
    nextDeparture: isFr ? 'Prochain départ' : 'Next departure',
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
    calculateItineraryWith: isFr ? 'Calculez votre itinéraire avec' : 'Calculate your itinerary with',
    stopAlerts: isFr ? 'Cet arrêt est concerné' : 'Affecting this stop',
    stopAlertsCount: (n: number) => isFr ? `${n} info${n > 1 ? 's' : ''} trafic` : `${n} alert${n > 1 ? 's' : ''}`,
    seeMore: isFr ? 'Voir plus' : 'See more',
    seeLess: isFr ? 'Voir moins' : 'See less',
    planRouteFromStop: isFr ? 'Planifier un trajet depuis cet arrêt' : 'Plan a trip from this stop',
  };
};

// Line style resolution is handled centrally via `resolveLineStyle` in utils.

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

const getBadgeShapeClass = (isRound: boolean) => isRound ? 'rounded-full' : 'rounded-2xl';

const getLineSortKey = (lineShortName?: string | null, lineId?: string): [number, string] => {
  const code = (lineShortName || lineId || '').toUpperCase().trim();
  if (code === 'A') return [0, '']; if (code === 'B') return [1, '']; if (code === 'C') return [2, ''];
  if (code === 'D') return [3, '']; if (code === 'E') return [4, ''];
  const cMatch = /^C(\d+)$/.exec(code);
  if (cMatch) { const n = parseInt(cMatch[1], 10); return n >= 1 && n <= 14 ? [5, n.toString().padStart(3,'0')] : [8, code]; }
  const nMatch = /^(\d+)$/.exec(code);
  if (nMatch) { const n = parseInt(nMatch[1], 10); return n >= 15 && n <= 92 ? [6, n.toString().padStart(3,'0')] : [7, n.toString().padStart(3,'0')]; }
  return [9, code];
};

const sortLinesByPriority = (a: { shortName?: string | null; id: string }, b: { shortName?: string | null; id: string }) => {
  const [wa, ka] = getLineSortKey(a.shortName, a.id);
  const [wb, kb] = getLineSortKey(b.shortName, b.id);
  if (wa !== wb) return wa - wb;
  return ka.localeCompare(kb, undefined, { numeric: true, sensitivity: 'base' });
};

const OccupancyDisplay = ({ occupancy, showError = false }: { occupancy?: string | null; showError?: boolean }) => {
  const level = occupancy === 'LIGHT' ? 1 : occupancy === 'MODERATE' ? 2 : occupancy === 'CROWDED' ? 3 : 0;
  if (level === 0) return showError ? <div className="text-xs text-slate-500">–</div> : null;
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 3 }).map((_, i) => (
        <UserIcon key={i} className="w-3.5 h-3.5 text-slate-300" style={{ opacity: i < level ? 1 : 0.2 }} />
      ))}
    </div>
  );
};

const renderDepartureTime = (timeString: string) => {
  const match = timeString.match(/^(\d+)(m)$/);
  if (match) return <><span className="font-bold">{match[1]}</span><span className="font-normal text-sm">{match[2]}</span></>;
  return timeString;
};

const getLineColor = (lineId: string): string => {
  const colors: Record<string, string> = {
    '1': 'bg-red-500', '2': 'bg-green-500', '3': 'bg-blue-500', '4': 'bg-pink-500',
    '5': 'bg-yellow-400', '6': 'bg-purple-500', '7': 'bg-orange-500', '8': 'bg-indigo-500',
    '9': 'bg-teal-500', '10': 'bg-rose-500',
  };
  return colors[lineId] || 'bg-slate-500';
};

const ExportModal = ({ isOpen, onClose, exportUrl, position, language }: { isOpen: boolean; onClose: () => void; exportUrl: string; position?: { x: number; y: number } | null; language: 'fr' | 'en' }) => {
  const [copied, setCopied] = useState(false);
  // Reset the success state when the modal is closed or the URL changes, so a
  // freshly-opened modal always shows the neutral "Copy" state.
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
      // Revert to the neutral state after a short, deliberate pause.
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can fail in non-secure contexts; fall back to a one-shot
      // success indicator anyway since we tried.
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
            backgroundColor: copied ? '#10b981' /* emerald-500 */ : '#2563eb' /* blue-600 */,
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
  onClose,
  initialSelectedLines,
  selectedLines: controlledSelectedLines,
  onSelectedLinesChange,
  compactMode,
  autoSync,
  refreshIntervalMs,
  language,
  onPlanRouteFromStop,
}: SidebarProps) => {
  const [currentStopDetail, setCurrentStopDetail] = useState<StopDetail | null>(null);
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
  const [isFavoriteModalOpen, setIsFavoriteModalOpen] = useState(false);
  // Track favorite status reactively so the star icon updates immediately
  // when add/remove fires from any source (this sidebar, or another tab in
  // the future).
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
  const [expandedAlerts, setExpandedAlerts] = useState<Set<number>>(new Set());
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

  const updateDepartures = async () => {
    if (!currentStopDetail || !isOpen || currentStopDetail.lines.length === 0) return;
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
  }, [isOpen, currentStopDetail?.id, currentStopDetail?.lines.length, autoSync, refreshIntervalMs]);

  const getDeparturePriority = (dep: Departure): number => {
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
    // In controlled mode, the parent owns selectedLines — don't fight it.
    if (isControlled) return;
    if (initialSelectedLines && initialSelectedLines.size > 0 && !hasAppliedInitialLines) {
      setInternalSelectedLines(new Set(initialSelectedLines));
      setHasAppliedInitialLines(true);
    } else if (!initialSelectedLines || initialSelectedLines.size === 0) {
      setInternalSelectedLines(new Set());
      setHasAppliedInitialLines(false);
    }
  }, [currentStopId, initialSelectedLines, isControlled]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Stop-level traffic alerts: alerts whose description mentions THIS stop's
  // name AND that affect at least one line served by this stop.
  // ─────────────────────────────────────────────────────────────────────────────
  const stopTrafficAlerts = useMemo(() => {
    if (!currentStopDetail) return [];
    return getStopTrafficAlerts(
      { name: currentStopDetail.name },
      currentStopDetail.lines || [],
    );
  }, [currentStopDetail?.id, currentStopDetail?.name, currentStopDetail?.lines]);

  // Reset expanded alerts when stop changes
  useEffect(() => {
    setExpandedAlerts(new Set());
  }, [currentStopId]);

  const toggleAlertExpanded = (idx: number) => {
    setExpandedAlerts(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

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

  const toggleExpanded = (key: string) => {
    setExpandedItems(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
  };

  return (
    <motion.div
      initial={{ x: -420, opacity: 0 }}
      animate={{ x: isOpen ? 0 : -420, opacity: isOpen ? 1 : 0 }}
      exit={{ x: -420, opacity: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="fixed left-0 top-0 h-screen w-96 bg-slate-900 border-r border-slate-800 shadow-2xl z-60 overflow-y-auto"
    >
      {isOpen && currentStopDetail && (
        <div className={compactMode ? 'p-4 pb-10' : 'p-6 pb-10'}>

          {/* Header */}
          <div className="flex items-start justify-between mb-6 pt-1">
            <div className="flex-1 min-w-0 pr-3">
              <h2 className="text-3xl font-extrabold text-white leading-tight">{currentStopDetail.name}</h2>
              {!compactMode && currentStopDetail.city && (
                <p className="text-sm text-slate-400 mt-1">{currentStopDetail.city}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => currentStopDetail && onPlanRouteFromStop?.(currentStopDetail)}
                className="w-9 h-9 flex items-center justify-center bg-slate-800 border border-slate-700 rounded-full hover:bg-slate-700 transition"
                aria-label={text.planRouteFromStop}
                title={text.planRouteFromStop}
              >
                <MapIcon className="w-4 h-4 text-white" />
              </button>
              <button
                onClick={() => {
                  if (isFav) removeFavoriteAndNotify(currentStopDetail.id);
                  else setIsFavoriteModalOpen(true);
                }}
                className={`w-9 h-9 flex items-center justify-center border rounded-full transition ${
                  isFav
                    ? 'bg-amber-500/20 border-amber-500/40 hover:bg-amber-500/30'
                    : 'bg-slate-800 border-slate-700 hover:bg-slate-700'
                }`}
                aria-label={isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              >
                {isFav
                  ? <StarIcon className="w-4 h-4 text-amber-400" />
                  : <StarOutlineIcon className="w-4 h-4 text-white" />}
              </button>
              <button onClick={onClose}
                className="w-9 h-9 flex items-center justify-center bg-slate-800 border border-slate-700 rounded-full hover:bg-slate-700 transition">
                <XMarkIcon className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>

          {/* Lines */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{text.lines}</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => setSelectedLines(new Set())}
                  className="text-xs px-2.5 py-1 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-700 transition">
                  {text.showAll}
                </button>
                <button
                  ref={exportButtonRef}
                  onClick={() => {
                    // Build the URL using the user's current path so shared
                    // links land on the same route they were copied from
                    // (e.g. "/" stays "/", "/app" stays "/app").
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
                const lineStyle = resolveLineStyle(line.id, line.color, line.textColor);
                return (
                  <div key={line.id} className="relative">
                    <button
                      onClick={() => setSelectedLines(prev => { const next = new Set(prev); next.has(line.id) ? next.delete(line.id) : next.add(line.id); return next; })}
                      className={`${getBadgeShapeClass(isRoundLine(line.shortName || line.id))} flex items-center justify-center text-sm font-bold transition-all ${compactMode ? 'w-10 h-10 text-xs' : 'w-12 h-12'} ${isActive ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-900' : ''} ${isSelected ? 'opacity-100' : 'opacity-25'} ${!lineStyle.backgroundColor ? getLineColor(line.id) + ' text-white' : ''}`}
                      style={lineStyle}
                      title={line.name}
                    >
                      {line.shortName || line.id}
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

          {/* Traffic tooltip */}
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
                    <p className="text-slate-200">{line.trafficDetails[0].titre}</p>
                    <p className="text-slate-400 mt-1">{line.trafficDetails[0].description}</p>
                    <p className="text-slate-500 mt-1">{text.estimatedEnd} {line.trafficDetails[0].dateFin || 'N/A'}</p>
                  </>
                ) : <p className="text-slate-400">{text.detailsUnavailable}</p>}
              </div>
            );
          })()}

          {/* ─── Stop-specific traffic alerts ─────────────────────────────── */}
          {stopTrafficAlerts.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                  <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                  {text.stopAlerts}
                </h3>
                <span className="text-[10px] font-semibold text-amber-400/70 uppercase tracking-wider">
                  {text.stopAlertsCount(stopTrafficAlerts.length)}
                </span>
              </div>
              <div className="space-y-2">
                {stopTrafficAlerts.map((alert, idx) => {
                  const isExpanded = expandedAlerts.has(idx);
                  const description = alert.detail.description || '';
                  const isLong = description.length > 140;
                  const shortDesc = isLong && !isExpanded ? description.slice(0, 140).trimEnd() + '…' : description;
                  return (
                    <motion.div
                      key={`${alert.detail.titre}-${alert.detail.dateFin}-${idx}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="bg-amber-950/60 border border-amber-700/60 rounded-2xl p-3"
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-amber-400/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <ExclamationTriangleIcon className="w-4 h-4 text-amber-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          {alert.detail.titre && (
                            <p className="text-sm font-semibold text-amber-200 leading-snug">
                              {alert.detail.titre}
                            </p>
                          )}
                          {description && (
                            <p className="text-xs text-amber-100/80 mt-1 leading-relaxed whitespace-pre-line">
                              {shortDesc}
                            </p>
                          )}
                          {isLong && (
                            <button
                              onClick={() => toggleAlertExpanded(idx)}
                              className="text-xs font-semibold text-amber-300 hover:text-amber-200 mt-1.5 flex items-center gap-1 transition"
                            >
                              {isExpanded ? text.seeLess : text.seeMore}
                              {isExpanded ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />}
                            </button>
                          )}

                          {/* Affected lines */}
                          {alert.matchedLines.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                              {[...alert.matchedLines].sort(sortLinesByPriority).map(line => {
                                const lineStyle = resolveLineStyle(line.id, line.color, line.textColor);
                                return (
                                  <div
                                    key={line.id}
                                    className={`${getBadgeShapeClass(isRoundLine(line.shortName || line.id))} flex items-center justify-center text-[11px] font-bold w-7 h-7 ${!lineStyle.backgroundColor ? getLineColor(line.id) + ' text-white' : ''}`}
                                    style={lineStyle}
                                    title={line.name}
                                  >
                                    {line.shortName || line.id}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {alert.detail.dateFin && (
                            <p className="text-[11px] text-amber-400/70 mt-2">
                              {text.estimatedEnd} {alert.detail.dateFin}
                            </p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Departures */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{text.nextDepartures}</h3>
            <div className="space-y-2">
              {groupedDepartures.length > 0 ? groupedDepartures.map((group, index) => {
                const departure = group.first;
                const second = group.second;
                const displayTime = getDepartureDisplay(departure, language);
                const minutesUntil = getMinutesUntilDeparture(departure);
                const isTram = isTramway(departure.lineId);
                const isChrono = isChronoLine(departure.lineId);
                const itemKey = `${departure.lineId}::${departure.destination}`;
                const isExpanded = expandedItems.has(itemKey);
                const departureLine = currentStopDetail.lines.find(l => l.id === departure.lineId || l.shortName === departure.lineShortName || l.shortName === departure.lineId);
                const secondLine = second ? currentStopDetail.lines.find(l => l.id === second.lineId || l.shortName === second.lineShortName || l.shortName === second.lineId) : undefined;
                const departureStyle: any = departureLine ? resolveLineStyle(departureLine.id, departureLine.color, departureLine.textColor) : {} as any;
                const secondStyle: any = secondLine ? resolveLineStyle(secondLine.id, secondLine.color, secondLine.textColor) : {} as any;
                const hasTrafficAlert = !!(departureLine?.hasTraffic && departureLine?.trafficDetails?.length);

                // Tram ou chrono ou ligne avec trafic + second départ → expandable
                if ((isTram || isChrono || hasTrafficAlert) && second) {
                  return (
                    <motion.div key={itemKey} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}
                      className="border border-slate-700 rounded-2xl overflow-hidden bg-slate-800">
                      <motion.button
                        onClick={() => toggleExpanded(itemKey)}
                        className={`w-full ${compactMode ? 'p-3' : 'p-4'} hover:bg-slate-750 active:bg-slate-700 transition text-left`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className={`font-bold ${getBadgeShapeClass(isRoundLine(departure.lineId))} w-10 h-10 flex items-center justify-center text-sm flex-shrink-0 ${!departureStyle.backgroundColor ? getLineColor(departure.lineId) + ' text-white' : ''}`} style={departureStyle}>
                              {departure.lineShortName || departure.lineId}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-white truncate">{departure.destination}</p>
                              <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                                {isTram ? <MdTram className="w-3.5 h-3.5" /> : <MdDirectionsBus className="w-3.5 h-3.5" />}
                                <span>{isTram ? text.tramway : text.bus}</span>
                                {departure.realtime && <span className="text-green-400">• {text.live}</span>}
                                {hasTrafficAlert && <span className="text-amber-400">• ⚠</span>}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                            <div className="text-right">
                              <p className="text-lg font-bold text-white">{renderDepartureTime(displayTime)}</p>
                              {!compactMode && (isTram || isChrono) && <OccupancyDisplay occupancy={departure.occupancy} />}
                            </div>
                            {isExpanded ? <ChevronUpIcon className="w-4 h-4 text-slate-400" /> : <ChevronDownIcon className="w-4 h-4 text-slate-400" />}
                          </div>
                        </div>
                      </motion.button>

                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: isExpanded ? 'auto' : 0, opacity: isExpanded ? 1 : 0 }} transition={{ duration: 0.25 }} className="overflow-hidden border-t border-slate-700">
                        <div className={`${compactMode ? 'p-3' : 'p-4'} bg-slate-800/60 space-y-3`}>
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{text.nextDeparture}</p>
                            <button onClick={() => toggleExpanded(itemKey)}
                              className="w-6 h-6 flex items-center justify-center hover:bg-slate-700 rounded-lg transition">
                              <XMarkIcon className="w-3.5 h-3.5 text-slate-400" />
                            </button>
                          </div>
                          <div className="bg-slate-900 rounded-2xl p-3 border border-slate-700 space-y-3">
                            <div className="flex items-center gap-3">
                              <div className={`font-bold ${getBadgeShapeClass(isRoundLine(second.lineId))} w-10 h-10 flex items-center justify-center text-sm flex-shrink-0 ${!secondStyle?.backgroundColor ? getLineColor(second.lineId) + ' text-white' : ''}`} style={secondStyle}>
                                {second.lineShortName || second.lineId}
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-white">{second.destination}</p>
                                <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                                  {isTram ? <MdTram className="w-3 h-3" /> : <MdDirectionsBus className="w-3 h-3" />}
                                  {second.realtime && <span className="text-green-400">• {text.live}</span>}
                                </div>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="bg-slate-800 rounded-xl p-3">
                                <p className="text-xs text-slate-400 font-medium mb-1">{text.time}</p>
                                <p className="text-2xl font-bold text-white">{renderDepartureTime(getDepartureDisplay(second, language))}</p>
                              </div>
                              {(isTram || isChrono) && (
                                <div className="bg-slate-800 rounded-xl p-3">
                                  <p className="text-xs text-slate-400 font-medium mb-2">{text.occupancy}</p>
                                  {!compactMode && <OccupancyDisplay occupancy={second.occupancy} showError />}
                                </div>
                              )}
                            </div>
                            {second.realtime && <p className="text-xs text-green-400 font-semibold flex items-center gap-1">● {text.realTimeData}</p>}
                          </div>
                          {hasTrafficAlert && departureLine?.trafficDetails?.[0] && (
                            <div className="bg-amber-950 border border-amber-700 rounded-2xl p-3">
                              <div className="flex items-center gap-2 mb-1">
                                <ExclamationTriangleIcon className="w-4 h-4 text-amber-400 flex-shrink-0" />
                                <p className="text-xs font-semibold text-amber-300">{text.disruptedTraffic} {departureLine.shortName || departureLine.id}</p>
                              </div>
                              <p className="text-xs text-amber-200">{departureLine.trafficDetails[0].titre}</p>
                              {departureLine.trafficDetails[0].description && (
                                <p className="text-xs text-amber-300/70 mt-1">{departureLine.trafficDetails[0].description}</p>
                              )}
                              <p className="text-xs text-amber-400/60 mt-1">{text.estimatedEnd} {departureLine.trafficDetails[0].dateFin || 'N/A'}</p>
                            </div>
                          )}
                          {group.count > 2 && <p className="text-xs text-slate-500 text-center">{text.moreDepartures(group.count - 2)}</p>}
                        </div>
                      </motion.div>
                    </motion.div>
                  );
                }

                // Single tram without second
                if (isTram) {
                  return (
                    <motion.div key={itemKey} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}
                      className="flex items-center justify-between p-3 rounded-2xl bg-slate-800 border border-slate-700 hover:bg-slate-750 transition">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`font-bold ${getBadgeShapeClass(isRoundLine(departure.lineId))} w-10 h-10 flex items-center justify-center text-sm flex-shrink-0 ${!departureStyle.backgroundColor ? getLineColor(departure.lineId) + ' text-white' : ''}`} style={departureStyle}>
                          {departure.lineShortName || departure.lineId}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white truncate">{departure.destination}</p>
                          <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                            <MdTram className="w-3 h-3" />{text.tramway}{departure.realtime && <span className="text-green-400"> • {text.live}</span>}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <p className="text-lg font-bold text-white">{renderDepartureTime(displayTime)}</p>
                        {!compactMode && <OccupancyDisplay occupancy={departure.occupancy} />}
                      </div>
                    </motion.div>
                  );
                }

                // Regular bus
                const isNext = index === 0;
                const isNow = minutesUntil <= 2;
                return (
                  <motion.div key={itemKey} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}
                    className={`flex items-center justify-between p-3 rounded-2xl border transition ${isNext ? 'bg-emerald-950 border-emerald-700' : isNow ? 'bg-amber-950 border-amber-700' : 'bg-slate-800 border-slate-700 hover:bg-slate-750'}`}>
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`font-bold ${getBadgeShapeClass(isRoundLine(departure.lineId))} w-10 h-10 flex items-center justify-center text-sm flex-shrink-0 ${!departureStyle.backgroundColor ? getLineColor(departure.lineId) + ' text-white' : ''}`} style={departureStyle}>
                        {departure.lineShortName || departure.lineId}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white truncate">{departure.destination}</p>
                        <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                          {departure.type === 'BUS' ? <><MdDirectionsBus className="w-3 h-3" />{text.bus}</> : <><MdTram className="w-3 h-3" />{text.tramway}</>}
                          {departure.realtime && <span className="text-green-400"> • {text.live}</span>}
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      {isNext && <div className="text-xs text-emerald-400 font-semibold mb-0.5">{text.nextLabel}</div>}
                      <p className={`text-lg font-bold ${isNext ? 'text-emerald-400' : isNow ? 'text-amber-400' : 'text-white'}`}>{renderDepartureTime(displayTime)}</p>
                      {second && <p className="text-xs text-slate-500">{renderDepartureTime(getDepartureDisplay(second, language))}</p>}
                    </div>
                  </motion.div>
                );
              }) : (
                <p className="text-sm text-slate-500 py-6 text-center">{text.noDeparturesAvailable}</p>
              )}
            </div>
          </div>

          <div className="border-t border-slate-800 mt-6 pt-4">
            <button
              type="button"
              onClick={() => currentStopDetail && onPlanRouteFromStop?.(currentStopDetail)}
              className="flex w-full items-center justify-center gap-2 px-0 py-0 cursor-pointer text-xs text-slate-400 transition hover:text-slate-200">
              <span>{text.calculateItineraryWith}</span>
              <img src="/assets/GreGoLOGO.png" alt="GreGo" className="h-4 w-auto" />
            </button>
          </div>
        </div>
      )}

      <ExportModal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} exportUrl={exportUrl} position={exportModalPos} language={language} />
      <AddFavoriteModal
        isOpen={isFavoriteModalOpen}
        onClose={() => setIsFavoriteModalOpen(false)}
        stop={currentStopDetail}
        language={language}
      />
    </motion.div>
  );
};
