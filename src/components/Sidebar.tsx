import { motion } from 'framer-motion';
import type { StopDetail, Departure } from '../types';
import { RealtimeWifi } from './RealtimeWifi';
import { sortLinesByPriority } from '../utils/lineOrder';
import { TrafficAlertCard } from './TrafficAlertCard';
import { CarpoolStopPanel, isCarpoolStop, isCarpoolLine } from './CarpoolStopPanel';
import { getMcoLines, type McoLine } from '../services/mcoLines';
import { formatDepartureTime, refreshStopDepartures } from '../services/api';
import { useEffect, useState, useRef, useMemo } from 'react';
import { UserIcon, ChevronDownIcon, ChevronUpIcon, XMarkIcon, EllipsisVerticalIcon, ExclamationTriangleIcon, CheckIcon, StarIcon, MapIcon, ClockIcon, ArrowsRightLeftIcon } from '@heroicons/react/24/solid';
import { isTclId } from '../services/tclNetwork';
import { StarIcon as StarOutlineIcon } from '@heroicons/react/24/outline';
import { TclSidebar } from './TclSidebar';
import { resolveLineStyle, isGrenobleNetworkLine } from '../utils/lineColors';
import { isFavorite, removeFavoriteAndNotify, subscribeFavorites } from '../services/favorites';
import { AddFavoriteModal } from './AddFavoriteModal';
import { TransportModeIcon } from './TransportModeIcon';
import { normalizeMode } from '../utils/transportMode';
import { LineBadge } from './LineBadge';
import { DepartureLineBadge } from './DepartureLineBadge';
import { getStopTrafficAlerts, filterAlertsBySelectedLines } from '../utils/stopTrafficMatcher';
import { getTimetable, isLastDeparture, toTimetableRouteId, type Timetable } from '../services/timetable';
import { LastRunRibbon, LAST_RUN_TEXT } from './LastRunRibbon';

interface SidebarProps {
  stop: StopDetail | null;
  isOpen: boolean;
  onClose: () => void;
  initialSelectedLines?: Set<string>;
  




  selectedLines?: Set<string>;
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

// Line style resolution is handled centrally via `resolveLineStyle` in utils.

/**
 * Nom du mode, accordé au pictogramme qui l'accompagne.
 *
 * Un TER porte « Train » et non « Bus » : c'est ce qui indique qu'on va sur un
 * quai de gare, avec un autre titre de transport.
 */
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



/**
 * L'affluence, en trois silhouettes.
 *
 * Posée en petit à droite d'un horaire, elle se lit du coin de l'oeil ; posée
 * dans la case du passage suivant, elle avait la taille d'une note de bas de
 * page. La case lui donne donc sa vraie taille, et l'y centre.
 */
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
  theme,
  onPlanRouteFromStop,
  onOpenTimetable,
  onOpenLine,
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
  /* Les liaisons de covoiturage, chargées seulement pour un point M'Covoit. */
  const [carpoolLines, setCarpoolLines] = useState<McoLine[]>([]);
  const [isFavoriteModalOpen, setIsFavoriteModalOpen] = useState(false);
  const [showTclWarning, setShowTclWarning] = useState(false);
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

  /**
   * Fiches horaires des lignes desservant l'arrêt, chargées en tâche de fond.
   * Elles ne servent qu'à une chose ici : reconnaître le dernier passage de la
   * journée, information que le temps réel seul ne porte pas.
   */
  const [timetables, setTimetables] = useState<Map<string, Timetable | null>>(new Map());

  const text = getSidebarText(language);

  useEffect(() => {
    setCurrentStopId(stop?.id || null);
    if (!stop) { setCurrentStopDetail(null); setShowTclWarning(false); return; }
    setCurrentStopDetail(prev => {
      if (prev?.id === stop.id && prev.lines?.length > 0 && (!stop.lines || stop.lines.length === 0)) {
        return { ...stop, lines: prev.lines, departures: stop.departures.length > 0 ? stop.departures : prev.departures, lastUpdate: stop.lastUpdate || prev.lastUpdate };
      }
      return stop;
    });
    setShowTclWarning(Boolean(isOpen && isTclId(stop.id)));
  }, [stop, isOpen]);

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
  /*
   * Quand montrer la fiche du covoiturage.
   *
   * Un point M'Covoit n'est pas toujours qu'un point M'Covoit : « Grenoble,
   * Palais de Justice » porte un identifiant MCO et voit pourtant passer deux
   * tramways et huit lignes de bus. Y masquer les prochains départs aurait
   * privé les gens de ce qu'ils venaient chercher.
   *
   * La fiche du covoiturage remplace donc la fiche ordinaire dans deux cas
   * seulement : le point ne dessert que des liaisons de covoiturage, ou l'on a
   * justement trié sur celles-ci. Partout ailleurs, l'arrêt reste un arrêt.
   */
  const stopLines = currentStopDetail?.lines ?? [];
  const carpoolServed = stopLines.filter(isCarpoolLine);
  const carpoolOnly = stopLines.length > 0 && carpoolServed.length === stopLines.length;
  const carpoolFiltered =
    selectedLines.size > 0 &&
    stopLines.filter(line => selectedLines.has(line.id)).every(isCarpoolLine) &&
    stopLines.some(line => selectedLines.has(line.id) && isCarpoolLine(line));
  /*
   * Deux portées, et non une.
   *
   * Un point qui ne dessert que du covoiturage est un point de covoiturage :
   * il en porte la marque, et sa fiche n'a pas de lignes à cocher.
   *
   * Un arrêt ordinaire sur lequel on a trié la liaison de covoiturage reste un
   * arrêt ordinaire : il garde son nom nu et sa liste de lignes — sans elle on
   * ne pourrait plus défaire le tri —, et seul le contenu des prochains départs
   * cède la place au panneau.
   */
  const carpoolOnlyStop = isCarpoolStop(currentStopDetail?.id) && carpoolOnly;
  const carpoolStop = carpoolOnlyStop || carpoolFiltered;
  useEffect(() => {
    if (!carpoolStop) { setCarpoolLines([]); return; }
    let active = true;
    getMcoLines().then(lines => { if (active) setCarpoolLines(lines); });
    return () => { active = false; };
  }, [carpoolStop, currentStopDetail?.id]);

  /*
   * Les liaisons qui desservent ce point précis.
   *
   * Les quatre du réseau se chargent d'un bloc, mais un point n'en voit passer
   * qu'une ou deux. Si l'arrêt ne déclare aucune ligne, on les montre toutes
   * plutôt que rien : mieux vaut une liaison de trop qu'une fiche muette.
   */
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

  /* Le dépliage des perturbations est tenu par chaque carte : elle se referme
     d'elle-même en changeant d'arrêt, puisqu'elle est alors remontée. */

  useEffect(() => {
    if (!isOpen || !currentStopDetail) return;
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
    // `timetables` est volontairement absent : il est alimenté par cet effet.
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

  const toggleExpanded = (key: string) => {
    setExpandedItems(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
  };

  return (
    <motion.div
      initial={{ x: -420, opacity: 0 }}
      animate={{ x: isOpen ? 0 : -420, opacity: isOpen ? 1 : 0 }}
      exit={{ x: -420, opacity: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="relative fixed left-0 top-0 h-screen w-96 border-r border-slate-800 shadow-2xl z-60 overflow-y-auto bg-slate-900"
    >
      <TclSidebar
        visible={showTclWarning}
        onContinue={() => setShowTclWarning(false)}
        onClose={onClose}
        language={language}
      />
      {isOpen && currentStopDetail && (
        <div className={compactMode ? 'p-4 pb-10' : 'p-6 pb-10'}>

          {/* Header */}
          <div className="relative flex items-start justify-between mb-6 pt-1">
            <div className="flex-1 min-w-0 pr-3">
              {/* La marque du service, au-dessus du nom : on sait à quoi on
                  a affaire avant d'avoir lu le lieu. */}
              {carpoolOnlyStop && (
                <img
                  src={theme === 'light' ? '/assets/mco.png' : '/assets/mco_light.png'}
                  alt="M'Covoit"
                  className="mb-2 w-auto object-contain object-left" style={{ height: 35 }}
                />
              )}
              <h2 className="text-3xl font-extrabold text-white leading-tight">{currentStopDetail.name}</h2>
              {!compactMode && currentStopDetail.city && (
                <p className="text-sm text-slate-400 mt-1">{currentStopDetail.city}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* « GO » plutôt qu'une carte : le bouton ne montre pas l'arrêt,
                  il calcule le trajet pour s'y rendre. Repris de GreGo, à
                  l'identique — c'est le même geste dans les deux applications. */}
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

          {/*
            Un point de covoiturage n'a ni lignes à cocher ni passages à
            annoncer : les deux sections cèdent la place à la fiche du
            service. L'infotrafic reste — une route coupée concerne autant
            ceux qui attendent au bord que ceux qui prennent le bus.
          */}
          {carpoolOnlyStop ? (
            <CarpoolStopPanel lines={servedCarpoolLines} language={language} isLight={theme === 'light'} />
          ) : (
            <>
          {/* Lines */}
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

            </>
          )}

          {/* ─── Stop-specific traffic alerts ─────────────────────────────── */}
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
            /* Le tri porte sur une liaison de covoiturage : les passages
               n'ont plus rien à annoncer, le panneau prend leur place. */
            <CarpoolStopPanel lines={servedCarpoolLines} language={language} isLight={theme === 'light'} />
          ) : carpoolOnlyStop ? null : (
            <>
          {/* Departures */}
          <div>
            <h3 className="section-caps text-slate-400 mb-3">{text.nextDepartures}</h3>
            <div className="space-y-2">
              {groupedDepartures.length > 0 ? groupedDepartures.map((group, index) => {
                const departure = group.first;
                const second = group.second;
                const displayTime = getDepartureDisplay(departure, language);
                const minutesUntil = getMinutesUntilDeparture(departure);
                const isTram = isTramway(departure.lineId);
                const mode = normalizeMode(departure.type);
                const isChrono = isChronoLine(departure.lineId);
                const itemKey = `${departure.lineId}::${departure.destination}`;
                const isExpanded = expandedItems.has(itemKey);
                const departureLine = currentStopDetail.lines.find(l => l.id === departure.lineId || l.shortName === departure.lineShortName || l.shortName === departure.lineId);
                const secondLine = second ? currentStopDetail.lines.find(l => l.id === second.lineId || l.shortName === second.lineShortName || l.shortName === second.lineId) : undefined;
                // Identifiant réseau compris : « C1 » tout court ne dit pas si
                // l'on parle de la Chrono 1 ou de la C1 du TER, qui se croisent
                // en gare de Grenoble.
                const departureRef = departureLine?.routeId || departure.routeId || departure.lineId;
                const secondRef = second ? (secondLine?.routeId || second.routeId || second.lineId) : '';
                const departureIsSem = isGrenobleNetworkLine(departureRef);
                const secondIsSem = isGrenobleNetworkLine(secondRef);
                const departureStyle: any = departureLine ? resolveLineStyle(departureRef, departureLine.color, departureLine.textColor) : resolveLineStyle(departureRef) as any;
                const secondStyle: any = secondLine ? resolveLineStyle(secondRef, secondLine.color, secondLine.textColor) : {} as any;
                const hasTrafficAlert = !!(departureLine?.hasTraffic && departureLine?.trafficDetails?.length);
                /* La marque se pose aussi sur la pastille du passage suivant :
                   c'est parfois lui, et non le premier, qui est touché. */
                const secondHasTraffic = !!(secondLine?.hasTraffic && secondLine?.trafficDetails?.length);
                const isLastRun = isLastDeparture(
                  timetables.get(departure.lineShortName || departure.lineId) ?? null,
                  departure.destination,
                  minutesUntil,
                );

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
                            <DepartureLineBadge
                          routeRef={departureRef}
                          label={departure.lineShortName || departure.lineId}
                          style={departureStyle}
                          round={departureIsSem && isRoundLine(departure.lineId)}
                          sizeClass="w-10 h-10 text-sm"
                          hasTraffic={hasTrafficAlert}
                        />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-white truncate">{departure.destination}</p>
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
                              <p className={`text-lg font-bold ${isLastRun ? LAST_RUN_TEXT : 'text-white'}`}>{renderDepartureTime(displayTime)}</p>
                              {!compactMode && (isTram || isChrono) && <OccupancyDisplay occupancy={departure.occupancy} />}
                            </div>
                            {isExpanded ? <ChevronUpIcon className="w-4 h-4 text-slate-400" /> : <ChevronDownIcon className="w-4 h-4 text-slate-400" />}
                          </div>
                        </div>
                      </motion.button>

                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: isExpanded ? 'auto' : 0, opacity: isExpanded ? 1 : 0 }} transition={{ duration: 0.25 }} className="overflow-hidden border-t border-slate-700">
                        <div className={`${compactMode ? 'p-3' : 'p-4'} bg-slate-800/60 space-y-3`}>
                          {/* Le passage suivant à même le panneau : le cadre
                              intérieur faisait une carte dans une carte dans
                              une ligne dépliée. Même chose que sur téléphone. */}
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
                              <p className="truncate text-sm font-semibold text-white">{second.destination}</p>
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
                              /* Isolée sous un passage, la carte doit dire de
                                 quelle ligne elle parle : les badges du bas ne
                                 servent qu'aux perturbations regroupées. */
                              heading={`${text.disruptedTraffic} ${departureLine.shortName || departureLine.id}`}
                            />
                          )}

                          {/* Actions du passage : la fiche horaire répond à la
                              question « et le prochain, c'est quand ? » que le
                              temps réel seul ne couvre pas. */}
                          <div className="flex flex-wrap gap-2 border-t border-slate-700/70 pt-4">
                            <button
                              type="button"
                              onClick={() => onOpenTimetable?.({
                                line: departureLine ?? { id: departure.lineId, shortName: departure.lineShortName },
                                headsign: departure.destination,
                              })}
                              className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
                            >
                              <ClockIcon className="h-4 w-4" />
                              {text.timetable}
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpenLine?.(departureLine ?? { id: departure.lineId, shortName: departure.lineShortName })}
                              className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
                            >
                              <MapIcon className="h-4 w-4" />
                              {text.seeLine}
                            </button>
                            <button
                              type="button"
                              onClick={() => currentStopDetail && onPlanRouteFromStop?.(currentStopDetail)}
                              className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
                            >
                              <ArrowsRightLeftIcon className="h-4 w-4" />
                              {text.planRoute}
                            </button>
                          </div>
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
                        <DepartureLineBadge
                          routeRef={departureRef}
                          label={departure.lineShortName || departure.lineId}
                          style={departureStyle}
                          round={departureIsSem && isRoundLine(departure.lineId)}
                          sizeClass="w-10 h-10 text-sm"
                          hasTraffic={hasTrafficAlert}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white truncate">{departure.destination}</p>
                          {isLastRun && <div className="mt-1"><LastRunRibbon language={language} /></div>}
                          <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                            <TransportModeIcon mode={departure.type} className="w-3 h-3" />{modeLabel(normalizeMode(departure.type), text)}{departure.realtime && <RealtimeWifi size={13} className="text-green-400" label={text.live} />}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <p className={`text-lg font-bold ${isLastRun ? LAST_RUN_TEXT : 'text-white'}`}>{renderDepartureTime(displayTime)}</p>
                        {!compactMode && <OccupancyDisplay occupancy={departure.occupancy} />}
                      </div>
                    </motion.div>
                  );
                }

                // Regular bus. Toutes les rangées ont la même teinte : le vert
                // « prochain » et l'ambre « imminent » colorisaient une
                // information que l'ordre de la liste et l'heure disent déjà.
                return (
                  <motion.div key={itemKey} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}
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
                        <p className="text-sm font-semibold text-white truncate">{departure.destination}</p>
                        {isLastRun && <div className="mt-1"><LastRunRibbon language={language} /></div>}
                        <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                          <TransportModeIcon mode={departure.type} className="w-3 h-3" />
                          {modeLabel(normalizeMode(departure.type), text)}
                          {departure.realtime && <RealtimeWifi size={13} className="text-green-400" label={text.live} />}
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <p className={`text-lg font-bold ${isLastRun ? LAST_RUN_TEXT : 'text-white'}`}>{renderDepartureTime(displayTime)}</p>
                      {second && <p className="text-xs text-slate-500">{renderDepartureTime(getDepartureDisplay(second, language))}</p>}
                    </div>
                  </motion.div>
                );
              }) : (
                <p className="text-sm text-slate-500 py-6 text-center">{text.noDeparturesAvailable}</p>
              )}
            </div>
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
