import { motion } from 'framer-motion';
import { Sheet, type SheetRef } from 'react-modal-sheet';
import {
  MapSheetShell,
  MapSheetBody,
  mapSheetSnapPoints,
  collapsedNavPadding,
  readSafeAreaBottom,
  NAVBAR_SNAP,
  LAST_SNAP,
} from './MapSheet';
import { NAV_ITEM_WIDTH } from './MobileNavBar';
import { XMarkIcon, EllipsisVerticalIcon, ChevronDownIcon, ChevronUpIcon, UserIcon, ExclamationTriangleIcon, CheckIcon, StarIcon, MapIcon, ClockIcon, ArrowsRightLeftIcon } from '@heroicons/react/24/solid';
import { StarIcon as StarOutlineIcon } from '@heroicons/react/24/outline';
import { isFavorite, removeFavoriteAndNotify, subscribeFavorites } from '../services/favorites';
import { AddFavoriteModal } from './AddFavoriteModal';
import { TransportModeIcon } from './TransportModeIcon';
import { normalizeMode } from '../utils/transportMode';
import type { StopDetail, Departure, Line } from '../types';
import { formatDepartureTime, refreshStopDepartures } from '../services/api';
import { resolveLineStyle, isGrenobleNetworkLine } from '../utils/lineColors';
import { LineBadge } from './LineBadge';
import { DepartureLineBadge } from './DepartureLineBadge';
import { LastRunRibbon } from './LastRunRibbon';
import { TclSidebar } from './TclSidebar';
import { isTclId } from '../services/tclNetwork';
import { getTimetable, isLastDeparture, toTimetableRouteId, type Timetable } from '../services/timetable';
import { useEffect, useState, useRef, useMemo } from 'react';
import { getStopTrafficAlerts, filterAlertsBySelectedLines } from '../utils/stopTrafficMatcher';

interface SidebarMobileProps {
  stop: StopDetail | null;
  isOpen: boolean;
  sidebarState: 'closed' | 'peek' | 'open';
  onClose: () => void;
  onOpen: () => void;
  initialSelectedLines?: Set<string>;
  




  selectedLines?: Set<string>;
  onSelectedLinesChange?: (lines: Set<string>) => void;
  compactMode: boolean;
  autoSync: boolean;
  refreshIntervalMs: number;
  language: 'fr' | 'en';
  theme?: 'light' | 'dark';
  onPlanRouteFromStop?: (stop: StopDetail) => void;
  /** Ouvre la fiche horaire de la ligne d'un passage. */
  onOpenTimetable?: (info: { line: { id: string; shortName?: string; color?: string; textColor?: string }; headsign: string }) => void;
  /** Ouvre la fiche de la ligne. */
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
    nextDeparture: isFr ? 'Prochain départ' : 'Next departure',
    direction: isFr ? 'Direction' : 'Direction',
    time: isFr ? 'Heure' : 'TIME',
    occupancy: isFr ? 'Affluence' : 'OCCUPANCY',
    realTimeData: isFr ? 'Données en temps réel' : 'Real-time data',
    disruptedTraffic: isFr ? 'Trafic perturbé sur la ligne' : 'Disrupted traffic on line',
    ongoingDisruption: isFr ? 'Perturbation en cours' : 'Ongoing disruption',
    estimatedEnd: isFr ? 'Fin estimée :' : 'Estimated end:',
    calculateItineraryWith: isFr ? 'Calculez votre itinéraire avec' : 'Calculate your itinerary with',
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
        <UserIcon key={i} className="w-4 h-4 text-slate-300" style={{ opacity: i < level ? 1 : 0.3 }} />
      ))}
    </div>
  );
};






interface StopTrafficAlertsProps {
  stop: Pick<StopDetail, 'id' | 'name' | 'lines'>;
  language: 'fr' | 'en';
  /** Le filtre de la fiche : vide, tout l'arrêt est concerné. */
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
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
        {text.stopAlerts}
      </h3>
      <div className="space-y-2.5">
        {alerts.map((alert, idx) => {
          const lines: Line[] = [...alert.matchedLines].sort(sortLinesByPriority);
          // Le nom de la ligne n'est plus dans l'en-tête : les badges le disent
          // en dessous, et une perturbation regroupée en touche souvent
          // plusieurs. « Trafic perturbé sur la ligne C1 » ne vaudrait plus.
          const headerLabel = text.ongoingDisruption;
          return (
            <motion.div
              key={`${alert.detail.titre}-${idx}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04 }}
              className="bg-amber-950 border border-amber-700 rounded-2xl p-3"
            >
              <div className="flex items-center gap-2 mb-1">
                <ExclamationTriangleIcon className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <p className="text-xs font-semibold text-amber-300">{headerLabel}</p>
              </div>
              <p className="text-xs text-amber-200">{alert.detail.titre}</p>
              {alert.detail.description && (
                <p className="text-xs text-amber-300/70 mt-1 whitespace-pre-line">
                  {alert.detail.description}
                </p>
              )}
              {alert.detail.dateFin && (
                <p className="text-xs text-amber-400/60 mt-1">
                  {text.estimatedEnd} {alert.detail.dateFin}
                </p>
              )}
              {/* Les lignes concernées, avec les pictogrammes du réseau. Elles
                  s'affichent dès qu'il y en a une : une perturbation regroupée
                  ne dit plus dans son titre quelle ligne elle touche, ce sont
                  les badges qui le disent. */}
              {lines.length > 0 && (
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <span className="text-xs text-amber-300/60">{text.affecting}</span>
                  {lines.map(line => (
                    <LineBadge
                      key={line.id}
                      line={{
                        id: line.id,
                        shortName: line.shortName || line.id,
                        color: line.color,
                        textColor: line.textColor,
                      }}
                      size="xs"
                    />
                  ))}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Copy-to-clipboard button with a small success state. Animates the bg colour
 * to emerald and swaps the label/icon for ~1.5s after a successful copy.
 */
const CopyButton = ({ value, copyLabel, copiedLabel }: { value: string; copyLabel: string; copiedLabel: string }) => {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    try { await navigator.clipboard.writeText(value); } catch { /* fallback below */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <motion.button
      onClick={handle}
      animate={{ backgroundColor: copied ? '#10b981' /* emerald-500 */ : '#2563eb' /* blue-600 */ }}
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

export const SidebarMobile = ({ stop, isOpen, onClose, initialSelectedLines, selectedLines: controlledSelectedLines, onSelectedLinesChange, compactMode, autoSync, refreshIntervalMs, language, theme = 'dark', onPlanRouteFromStop, onOpenTimetable, onOpenLine }: SidebarMobileProps) => {
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
  /**
   * Fiches horaires des lignes desservies, pour reconnaître le dernier passage
   * de la journée. Même mécanique que sur ordinateur : le ruban « dernier
   * passage » est justement l'information qu'on veut voir sur un téléphone,
   * quand il est trop tard pour se tromper.
   */
  const [timetables, setTimetables] = useState<Map<string, Timetable | null>>(new Map());
  /**
   * Avertissement réseau TCL. Il se montre par-dessus la feuille, en plein
   * écran : c'est un message qu'on lit et qu'on acquitte, pas un panneau qu'on
   * fait glisser.
   */
  const [showTclWarning, setShowTclWarning] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isFavoriteModalOpen, setIsFavoriteModalOpen] = useState(false);
  const [isFav, setIsFav] = useState(false);
  useEffect(() => {
    if (!currentStopDetail) { setIsFav(false); return; }
    const sync = () => setIsFav(isFavorite(currentStopDetail.id));
    sync();
    return subscribeFavorites(sync);
  }, [currentStopDetail?.id]);
  const [exportUrl, setExportUrl] = useState('');
  const exportButtonRef = useRef<HTMLButtonElement>(null);
  const [hasAppliedInitialLines, setHasAppliedInitialLines] = useState(false);
  const text = getSidebarText(language);
  const isLight = theme === 'light';

  const sheetRef = useRef<SheetRef>(null);

  /*
   * La fiche d'arrêt est la feuille d'accueil — la même, avec un autre contenu.
   *
   * Mêmes paliers, même coque, même largeur de pastille : c'est ce qui fait
   * qu'on ne voit pas le relais. Ouvrir un arrêt ne pose pas une feuille sur
   * une autre, ça remplace ce que la feuille montre. Et le palier bas, celui
   * qui a la taille de la barre d'onglets, n'est pas une position de repos :
   * y descendre, c'est refermer l'arrêt et rendre la barre.
   *
   * Elle s'ouvre au palier du milieu et non en grand : on vient de toucher un
   * point sur la carte, la carte doit rester visible autour de lui.
   */
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
  const fullIndex = LAST_SNAP;
  /** La feuille a atteint sa position d'ouverture : ses paliers comptent enfin. */
  const hasSettledRef = useRef(false);
  useEffect(() => { hasSettledRef.current = false; }, [isOpen]);

  useEffect(() => {
    setCurrentStopId(stop?.id || null);
    if (!stop) { setCurrentStopDetail(null); setShowTclWarning(false); return; }
    setShowTclWarning(Boolean(isOpen && isTclId(stop.id)));
    setCurrentStopDetail(prev => {
      if (prev?.id === stop.id && prev.lines?.length > 0 && (!stop.lines || stop.lines.length === 0)) {
        return { ...stop, lines: prev.lines, departures: stop.departures.length > 0 ? stop.departures : prev.departures, lastUpdate: stop.lastUpdate || prev.lastUpdate };
      }
      return stop;
    });
  }, [stop, isOpen]);

  useEffect(() => {
    if (!isOpen || !currentStopDetail) return;
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
    // `timetables` est volontairement absent : il est alimenté par cet effet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentStopDetail?.id]);

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

  /**
   * Filtrer une ligne ne fait plus redescendre la feuille.
   *
   * Elle le faisait pour dégager la carte, que le voile masquait. Le voile est
   * parti : au palier du milieu la carte est déjà visible et vivante, et le
   * palier bas ne sert plus qu'à refermer. Y envoyer la feuille parce qu'on
   * vient de cocher une ligne fermerait l'arrêt qu'on est en train de filtrer.
   */

  // L'avertissement se lit par-dessus la fiche : autant qu'elle soit déjà
  // dépliée en dessous quand on l'acquitte.
  useEffect(() => {
    if (showTclWarning) sheetRef.current?.snapTo(fullIndex);
  }, [showTclWarning, fullIndex]);

  const toggleExpanded = (key: string) => {
    setExpandedItems(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
  };

  return (
    <>
    {/* Plein écran et non dans la feuille : l'avertissement n'est pas une
        section de la fiche, c'est une porte qu'on franchit. */}
    {showTclWarning && (
      <div className="fixed inset-0 z-[10004]">
        <TclSidebar
          visible={showTclWarning}
          onContinue={() => setShowTclWarning(false)}
          onClose={() => { setShowTclWarning(false); onClose(); }}
          language={language}
        />
      </div>
    )}
    <Sheet
      ref={sheetRef}
      style={{ zIndex: 10 }}
      isOpen={isOpen}
      onClose={onClose}
      snapPoints={snapPoints}
      initialSnap={peekIndex}
      // Descendre au palier de la barre d'onglets n'est pas se poser, c'est
      // rendre la place : la fiche se referme et l'accueil reparaît, à la même
      // hauteur et à la même largeur. Le relais ne se voit pas.
      //
      // On n'écoute qu'une fois la feuille arrivée : la bibliothèque annonce
      // les paliers traversés pendant l'ouverture, et la fiche se serait
      // refermée avant d'avoir paru.
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
          <div className="overflow-y-auto flex-1 pb-24">
            {/* Header */}
            <div className="flex items-start justify-between px-5 pt-2 pb-4">
              <div className="flex-1 min-w-0 pr-3">
                <h2 className="text-2xl font-extrabold text-white leading-tight">{currentStopDetail.name}</h2>
                {currentStopDetail.city && <p className="text-sm text-slate-400 mt-0.5">{currentStopDetail.city}</p>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                {/* « GO » : le bouton mène à l'arrêt, il ne le montre pas.
                    Repris de GreGo à l'identique. */}
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
                <button
                  onClick={() => {
                    if (isFav) removeFavoriteAndNotify(currentStopDetail.id);
                    else setIsFavoriteModalOpen(true);
                  }}
                  className={`w-9 h-9 flex items-center justify-center border rounded-full transition ${
                    isFav
                      ? 'bg-amber-500/20 border-amber-500/40'
                      : 'bg-slate-800 border-slate-700 hover:bg-slate-700'
                  }`}
                  aria-label={isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                >
                  {isFav
                    ? <StarIcon className="w-4 h-4 text-amber-400" />
                    : <StarOutlineIcon className="w-4 h-4 text-white" />}
                </button>
                <button
                  onClick={onClose}
                  className="w-9 h-9 flex items-center justify-center bg-slate-800 border border-slate-700 rounded-full hover:bg-slate-700 transition"
                >
                  <XMarkIcon className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>

            {/* Lines */}
            <div className="px-5 mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{text.lines}</h3>
                <button
                  ref={exportButtonRef}
                  onClick={() => {
                    // Build the URL using the user's current path so shared
                    // links land on the same route they were copied from.
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

            {/* Export modal */}
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

            {/* Stop-level traffic alerts (above departures) */}
            <StopTrafficAlerts stop={currentStopDetail} language={language} selectedLines={selectedLines} />

            {/* Departures */}
            <div className="px-5">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{text.nextDepartures}</h3>
              <div className="space-y-3">
                {groupedDepartures.length > 0 ? groupedDepartures.map((group, index) => {
                  const departure = group.first;
                  const second = group.second;
                  const displayTime = getDepartureDisplay(departure, language);
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
                  const isLastRun = isLastDeparture(
                    timetables.get(departure.lineShortName || departure.lineId) ?? null,
                    departure.destination,
                    getMinutesUntilDeparture(departure),
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
                          />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-white truncate">{departure.destination}</p>
                                {isLastRun && <div className="mt-1"><LastRunRibbon language={language} /></div>}
                                <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                                  <TransportModeIcon mode={mode} className="w-3.5 h-3.5" />
                                  <span>{modeLabel(mode, text)}</span>
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
                                <DepartureLineBadge
                            routeRef={secondRef}
                            label={second.lineShortName || second.lineId}
                            style={secondStyle}
                            round={secondIsSem && isRoundLine(second.lineId)}
                            sizeClass="w-10 h-10 text-sm"
                          />
                                <div>
                                  <p className="text-sm font-semibold text-white">{second.destination}</p>
                                  <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                                    <TransportModeIcon mode={second.type} className="w-3 h-3" />
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

                            {/* Actions du passage : la fiche horaire répond à la
                                question « et le prochain, c'est quand ? » que le
                                temps réel seul ne couvre pas. */}
                            <div className="flex flex-wrap gap-2 pt-1">
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
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-white truncate">{departure.destination}</p>
                            {isLastRun && <div className="mt-1"><LastRunRibbon language={language} /></div>}
                            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                              <TransportModeIcon mode={departure.type} className="w-3 h-3" />{modeLabel(normalizeMode(departure.type), text)}{departure.realtime && <span className="text-green-400"> • {text.live}</span>}
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
                          />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white truncate">{departure.destination}</p>
                          {isLastRun && <div className="mt-1"><LastRunRibbon language={language} /></div>}
                          <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                            <TransportModeIcon mode={departure.type} className="w-3 h-3" />
                            {modeLabel(normalizeMode(departure.type), text)}
                            {departure.realtime && <span className="text-green-400"> • {text.live}</span>}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <p className="text-lg font-bold text-white">{renderDepartureTime(displayTime)}</p>
                        {second && <p className="text-xs text-slate-500">{renderDepartureTime(getDepartureDisplay(second, language))}</p>}
                      </div>
                    </motion.div>
                  );
                }) : (
                  <p className="text-center text-slate-500 py-10 text-sm">{text.noDeparturesAvailable}</p>
                )}
              </div>
            </div>
          </div>
          )}
          </MapSheetBody>
        </Sheet.Content>
      </MapSheetShell>
      {/* Pas de voile. C'est ce qui sépare une feuille de Plans d'une boîte de
          dialogue : la carte reste vivante derrière, on la déplace, on la
          zoome, on touche un autre arrêt sans avoir à refermer celui-ci. La
          feuille se ferme en la tirant vers le bas — jusqu'à la barre
          d'onglets, qui reprend alors sa place. */}
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
