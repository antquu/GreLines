import { isForeignLineId } from '../utils/foreignNetworks';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MapSheet } from './MapSheet';
import { XMarkIcon, MapIcon, ChevronDownIcon, BookmarkIcon, ArrowsRightLeftIcon, ClockIcon, PaperClipIcon } from '@heroicons/react/24/solid';
import { BookmarkIcon as BookmarkOutlineIcon } from '@heroicons/react/24/outline';
import { LineBadge } from './LineBadge';
import { TrafficAlertCard } from './TrafficAlertCard';
import { formatDepartureTime, getDepartures } from '../services/api';
import { getStopsServedByLines, stopNameKey, type ServedStopPoint } from '../services/lineShapes';
import type { Stop, TrafficDetail, Departure } from '../types';
import type { AllLinesLine } from '../services/allLines';
import { getLineFiche } from '../services/foreignTimetable';
import { resolveLineStyle } from '../utils/lineColors';
import { DepartureQuickActions } from './DepartureQuickActions';
import {
  isFavorite,
  removeFavoriteAndNotify,
  setFavoriteAndNotify,
  subscribeFavorites,
} from '../services/favorites';
import {
  isFavoriteLine,
  removeFavoriteLineAndNotify,
  setFavoriteLineAndNotify,
  subscribeFavoriteLines,
} from '../services/favoriteLines';

interface LineSidebarProps {
  line: AllLinesLine | null;
  isOpen: boolean;
  onClose: () => void;
  stops: Stop[];
  trafficInfo: Map<string, TrafficDetail[]>;
  language: 'fr' | 'en';
  onStopClick?: (stop: Stop) => void;
  autoSync: boolean;
  refreshIntervalMs: number;
  theme?: 'light' | 'dark';

  onOpenTimetable?: (options?: { stopName?: string; stopId?: string }) => void;

  onOpenLineMap?: () => void;
}

const getSidebarText = (language: 'fr' | 'en') => {
  const isFr = language === 'fr';
  return {
    lineDetails: isFr ? 'Détails de la ligne' : 'Line details',
    timetable: isFr ? 'Fiche horaire' : 'Timetable',
    lineMap: isFr ? 'Plan de la ligne' : 'Line map',
    destination: isFr ? 'Destination' : 'Destination',
    stops: isFr ? 'Arrêts' : 'Stops',
    stop: isFr ? 'Arrêt' : 'Stop',
    noStops: isFr ? 'Impossible de charger les arrêts de cette ligne.' : 'Unable to load stops for this line.',
    noDepartures: isFr ? 'Aucun départ disponible pour cette ligne.' : 'No departures available for this line.',
    loading: isFr ? 'Chargement…' : 'Loading…',
    openStop: isFr ? 'Voir l\'arrêt' : 'View stop',
    favorite: isFr ? 'Favori' : 'Favorite',
    addFavorite: isFr ? 'Ajouter aux favoris' : 'Add to favorites',
    removeFavorite: isFr ? 'Retirer des favoris' : 'Remove from favorites',
    estimatedEnd: isFr ? 'Fin estimée' : 'Estimated end',
    departures: isFr ? 'Départs' : 'Departures',
    direction: isFr ? 'Direction' : 'Direction',
    trafficInfo: isFr ? 'Info trafic' : 'Traffic info',
    line: isFr ? 'Ligne' : 'Line',
    terminus: isFr ? 'Terminus' : 'Terminus',
    next: isFr ? 'Prochains' : 'Next',
    towards: isFr ? 'Vers' : 'Towards',
    exceptionalBranch: isFr ? 'Desserte exceptionnelle' : 'Exceptional branch',
  };
};

const LINE_E_FORK_STOP_NAME = 'Estacade - Condorcet';
const LINE_E_DEPOT_BRANCH_STOPS = [
  'Foch - Ferrié',
  'Gustave Rivet',
  'Chavant',
  'Grenoble Hôtel de Ville',
  'Flandrin - Valmy',
  'Péri - Brossolette',
  'Neyrpic - Belledonne',
  'Université - Les Taillées',
  'Gabriel Fauré - MUSE',
  'Université - Bibliothèques',
  'Université - Condillac',
  'Mayencin - Champ Roman',
  'Gières Gare - Université',
  'Plaine des Sports',
];

interface LineSpurConfig {
  forkAfterStop: string;
  forkIsTerminus: boolean;
  branchStopNames: string[];
}

const LINE_SPUR_CONFIG: Record<string, LineSpurConfig> = {
  C: {
    forkAfterStop: 'Université - Condillac',
    forkIsTerminus: true,
    branchStopNames: ['Mayencin - Champ Roman', 'Gières Gare - Université', 'Plaine des Sports'],
  },
  D: {
    forkAfterStop: 'Université - Les Taillées',
    forkIsTerminus: false,
    branchStopNames: [
      'Gabriel Fauré - MUSE',
      'Université - Bibliothèques',
      'Université - Condillac',
      'Mayencin - Champ Roman',
      'Gières Gare - Université',
      'Plaine des Sports',
    ],
  },
};

const LINE_EXTRA_TERMINI: Record<string, string[]> = {
  A: ["Grand'place"],
};

const LINE_DROP_STOPS: Record<string, string[]> = {
  B: ['Grenoble Cité Internationale'],
};

const normalizeLineKey = (value: string): string => {
  let id = String(value || '').trim();
  if (id.startsWith('SEM:')) id = id.slice(4);
  if (id.startsWith('SEM_')) id = id.slice(4);
  return id.toUpperCase();
};

const splitTerminusPair = (longName: string): [string, string | null] => {
  const parts = longName.split('/').map(p => p.trim()).filter(Boolean);
  if (parts.length >= 2) return [parts[0], parts[1]];
  return [longName || 'Terminus inconnu', null];
};

const getDistanceSq = (a: { lat: number; lon: number }, b: { lat: number; lon: number }): number => {
  const dy = a.lat - b.lat;
  const dx = a.lon - b.lon;
  return dx * dx + dy * dy;
};

const matchDepartureToLine = (line: AllLinesLine, departure: Departure): boolean => {
  const normalizedLine = normalizeLineKey(line.id);
  const normalizedDep = normalizeLineKey(departure.lineId || departure.lineShortName || departure.lineName || '');
  return normalizedDep === normalizedLine;
};

const buildDepartureGroups = (departures: Departure[], language: 'fr' | 'en') => {
  const groups = new Map<string, { destination: string; times: string[]; realtime: boolean }>();
  departures.forEach(dep => {
    const dest = dep.destination || '-';
    const existing = groups.get(dest);
    const time = formatDepartureTime(dep, language);
    if (!existing) {
      groups.set(dest, { destination: dest, times: [time], realtime: dep.realtime });
    } else {
      existing.times.push(time);
      existing.realtime = existing.realtime || dep.realtime;
    }
  });
  return Array.from(groups.values()).sort((a, b) => a.destination.localeCompare(b.destination, undefined, { sensitivity: 'base' }));
};

export const LineSidebar = ({ line, isOpen, onClose, stops, trafficInfo, language, onStopClick, autoSync, refreshIntervalMs, theme = 'dark', onOpenTimetable, onOpenLineMap }: LineSidebarProps) => {
  const [servedStopPoints, setServedStopPoints] = useState<ServedStopPoint[] | null>(null);
  const [loadingStops, setLoadingStops] = useState(false);
  const [expandedStops, setExpandedStops] = useState<Set<string>>(new Set());
  const [stopDepartures, setStopDepartures] = useState<Map<string, { departures: Departure[]; loading: boolean; error: boolean }>>(new Map());

  const text = getSidebarText(language);
  const normalizedLineKey = line ? normalizeLineKey(line.id) : null;
  const [sncfTraffic, setSncfTraffic] = useState<{ lineId: string; details: TrafficDetail[] } | null>(null);
  useEffect(() => {
    const id = String(line?.id ?? '');
    if (!id.startsWith('SNC:')) return;
    let active = true;
    void import('../services/sncfNetwork')
      .then(module => module.sncfLineAlerts(id))
      .then(details => { if (active) setSncfTraffic({ lineId: id, details }); })
      .catch(() => {});
    return () => { active = false; };
  }, [line?.id]);
  const lineTraffic = [
    ...(normalizedLineKey ? trafficInfo.get(normalizedLineKey) || [] : []),
    ...(sncfTraffic && sncfTraffic.lineId === line?.id ? sncfTraffic.details : []),
  ];

  const [isLineFav, setIsLineFav] = useState(false);
  useEffect(() => {
    setIsLineFav(line ? isFavoriteLine(line.id) : false);
    return subscribeFavoriteLines(() => {
      setIsLineFav(line ? isFavoriteLine(line.id) : false);
    });
  }, [line?.id]);

  useEffect(() => {
    if (!line) {
      setServedStopPoints(null);
      setLoadingStops(false);
      return;
    }
    let active = true;
    setLoadingStops(true);
    getStopsServedByLines([{ id: line.id, shortName: line.shortName }])
      .then(points => {
        if (!active) return;
        setServedStopPoints(points);
      })
      .catch(() => {
        if (!active) return;
        setServedStopPoints(null);
      })
      .finally(() => {
        if (!active) return;
        setLoadingStops(false);
      });
    return () => { active = false; };
  }, [line?.id, line?.shortName]);

  useEffect(() => {
    setExpandedStops(new Set());
    setStopDepartures(new Map());
  }, [line?.id]);

  useEffect(() => {
    return subscribeFavorites(() => {
      setStopDepartures(prev => new Map(prev));
    });
  }, []);

  const stopMatchThreshold = 0.0001;
  const isDark = theme === 'dark';

  const [loadedRoute, setLoadedRoute] = useState<{ lineId: string; order: Map<string, number>; ends: [string, string] } | null>(null);
  const foreignRoute = loadedRoute && loadedRoute.lineId === line?.id ? loadedRoute : null;
  useEffect(() => {
    const id = String(line?.id ?? '');
    if (!isForeignLineId(id)) return;
    let active = true;
    void getLineFiche(id).then(fiche => {
      if (!active) return;
      const main = fiche?.directions
        .slice()
        .sort((a, b) => b.trips.length - a.trips.length || b.stops.length - a.stops.length)[0];
      if (!main || main.stops.length < 2) return;
      setLoadedRoute({
        lineId: id,
        order: new Map(main.stops.map((stop, index) => [stopNameKey(stop.name), index])),
        ends: [main.stops[0].name, main.stops[main.stops.length - 1].name],
      });
    });
    return () => { active = false; };
  }, [line?.id]);

  const stopsByName = useMemo(() => {
    const byName = new Map<string, Stop[]>();
    for (const stop of stops) {
      const key = stopNameKey(stop.name);
      const list = byName.get(key);
      if (list) list.push(stop);
      else byName.set(key, [stop]);
    }
    return byName;
  }, [stops]);

  const [sncfStops, setSncfStops] = useState<{ lineId: string; stops: Stop[] } | null>(null);
  useEffect(() => {
    const id = String(line?.id ?? '');
    if (!id.startsWith('SNC:')) return;
    let active = true;
    void import('../services/sncfNetwork')
      .then(module => module.sncfOrderedStops(id))
      .then(list => { if (active && list) setSncfStops({ lineId: id, stops: list }); })
      .catch(() => {});
    return () => { active = false; };
  }, [line?.id]);

  const lineStops = useMemo(() => {
    if (sncfStops && sncfStops.lineId === line?.id) return sncfStops.stops;
    if (!servedStopPoints || stops.length === 0) return [];
    const uniqueStops = new Map<string, Stop>();
    const nearestAmong = (point: ServedStopPoint, candidates: Stop[]) => {
      let bestMatch: Stop | null = null;
      let bestDist = Infinity;
      for (const stop of candidates) {
        const dist = getDistanceSq(point, stop);
        if (dist < bestDist) {
          bestDist = dist;
          bestMatch = stop;
        }
      }
      return bestMatch && bestDist <= stopMatchThreshold ? bestMatch : null;
    };
    servedStopPoints.forEach(point => {
      const sameName = point.name ? stopsByName.get(stopNameKey(point.name)) : undefined;
      const match = (sameName && nearestAmong(point, sameName)) || nearestAmong(point, stops);
      if (match) uniqueStops.set(match.id, match);
    });
    const found = Array.from(uniqueStops.values());
    if (!foreignRoute) return found;
    const rank = (stop: Stop) => foreignRoute.order.get(stopNameKey(stop.name)) ?? Number.MAX_SAFE_INTEGER;
    return found.sort((a, b) => rank(a) - rank(b));
  }, [servedStopPoints, stops, stopsByName, foreignRoute, sncfStops, line?.id]);
  const renderedStops = lineStops;

  const isLineE = normalizedLineKey === 'E';

  const lineEBranches = useMemo(() => {
    if (!isLineE || renderedStops.length === 0) return null;
    const forkKey = stopNameKey(LINE_E_FORK_STOP_NAME);
    const forkIndex = renderedStops.findIndex(s => stopNameKey(s.name) === forkKey);
    if (forkIndex === -1) return null;

    const trunk = renderedStops.slice(0, forkIndex + 1);

    const depotBranch: Stop[] = [];
    LINE_E_DEPOT_BRANCH_STOPS.forEach(name => {
      const key = stopNameKey(name);
      const match = stops.find(s => {
        const candidateKey = stopNameKey(s.name);
        return candidateKey === key || candidateKey.startsWith(key);
      });
      if (match && !depotBranch.some(d => d.id === match.id)) {
        depotBranch.push(key === stopNameKey('Plaine des Sports') ? { ...match, name: 'Plaine des Sports' } : match);
      }
    });

    const depotIds = new Set(depotBranch.map(s => s.id));
    const mainBranch = renderedStops.slice(forkIndex + 1).filter(s => !depotIds.has(s.id));

    if (mainBranch.length === 0 && depotBranch.length === 0) return null;
    return { trunk, mainBranch, depotBranch };
  }, [isLineE, renderedStops, stops]);

  const genericSpurBranches = useMemo(() => {
    if (isLineE || !normalizedLineKey || renderedStops.length === 0) return null;
    const config = LINE_SPUR_CONFIG[normalizedLineKey];
    if (!config) return null;

    const forkKey = stopNameKey(config.forkAfterStop);
    const forkIndex = renderedStops.findIndex(s => stopNameKey(s.name) === forkKey);
    if (forkIndex === -1) return null;

    const trunk = renderedStops.slice(0, forkIndex + 1);
    const branchKeys = config.branchStopNames.map(stopNameKey);
    const spur: Stop[] = [];
    const continuation: Stop[] = [];
    let bi = 0;
    renderedStops.slice(forkIndex + 1).forEach(stop => {
      const key = stopNameKey(stop.name);
      if (bi < branchKeys.length && (key === branchKeys[bi] || key.startsWith(branchKeys[bi]))) {
        spur.push(stop);
        bi += 1;
      } else {
        continuation.push(stop);
      }
    });

    if (spur.length === 0) return null;
    return { trunk, spur, continuation, forkIsTerminus: config.forkIsTerminus };
  }, [isLineE, normalizedLineKey, renderedStops]);

  const dropStopKeys = useMemo(
    () => new Set((LINE_DROP_STOPS[normalizedLineKey ?? ''] ?? []).map(stopNameKey)),
    [normalizedLineKey]
  );
  const flatRenderedStops = useMemo(
    () => (dropStopKeys.size === 0 ? renderedStops : renderedStops.filter(s => !dropStopKeys.has(stopNameKey(s.name)))),
    [renderedStops, dropStopKeys]
  );
  const extraTerminusKeys = useMemo(
    () => new Set((LINE_EXTRA_TERMINI[normalizedLineKey ?? ''] ?? []).map(stopNameKey)),
    [normalizedLineKey]
  );

  const totalStopsCount = lineEBranches
    ? lineEBranches.trunk.length + lineEBranches.mainBranch.length + lineEBranches.depotBranch.length
    : genericSpurBranches
    ? genericSpurBranches.trunk.length + genericSpurBranches.spur.length + genericSpurBranches.continuation.length
    : flatRenderedStops.length;

  const [spurBranchActive, setSpurBranchActive] = useState<boolean | null>(null);
  const spurBranchProbeStopId = lineEBranches?.depotBranch[0]?.id ?? genericSpurBranches?.spur[0]?.id ?? null;

  useEffect(() => {
    if (!line || !spurBranchProbeStopId) {
      setSpurBranchActive(null);
      return;
    }
    let active = true;
    setSpurBranchActive(null);
    getDepartures(spurBranchProbeStopId)
      .then(results => {
        if (!active) return;
        setSpurBranchActive(results.some(dep => matchDepartureToLine(line, dep)));
      })
      .catch(() => {
        if (active) setSpurBranchActive(null);
      });
    return () => { active = false; };
  }, [line, spurBranchProbeStopId]);

  const fetchStopDepartures = useCallback(async (stop: Stop, silent = false) => {
    if (!line) return;
    if (!silent) {
      setStopDepartures(prev => new Map(prev).set(stop.id, { departures: [], loading: true, error: false }));
    }
    try {
      const results = await getDepartures(stop.id);
      const filtered = results.filter(dep => matchDepartureToLine(line, dep));
      setStopDepartures(prev => new Map(prev).set(stop.id, { departures: filtered, loading: false, error: false }));
    } catch {
      if (!silent) {
        setStopDepartures(prev => new Map(prev).set(stop.id, { departures: [], loading: false, error: true }));
      }
    }
  }, [line]);

  const handleToggleStop = async (stop: Stop) => {
    setExpandedStops(prev => {
      const next = new Set(prev);
      if (next.has(stop.id)) {
        next.delete(stop.id);
      } else {
        next.add(stop.id);
      }
      return next;
    });

    if (stopDepartures.has(stop.id)) return;
    await fetchStopDepartures(stop, false);
  };

  useEffect(() => {
    if (!isOpen || !line || !autoSync || expandedStops.size === 0) return;

    const refreshExpandedStops = () => {
      expandedStops.forEach(stopId => {
        const stop = renderedStops.find(candidate => candidate.id === stopId);
        if (stop) void fetchStopDepartures(stop, true);
      });
    };

    refreshExpandedStops();
    const interval = setInterval(refreshExpandedStops, refreshIntervalMs);
    return () => clearInterval(interval);
  }, [isOpen, line?.id, autoSync, refreshIntervalMs, expandedStops, renderedStops, fetchStopDepartures]);
  const SPUR_FIRST_STOP_Y = 20;
  const [spurCurveLead, setSpurCurveLead] = useState(49);
  const measureSpurLead = useCallback((block: HTMLDivElement | null) => {
    const previousRow = block?.previousElementSibling as HTMLElement | null;
    if (!previousRow) return;
    const lead = Math.round(previousRow.offsetHeight - SPUR_FIRST_STOP_Y);
    if (lead > 0) setSpurCurveLead(current => (current === lead ? current : lead));
  }, []);
  if (!line) return null;
  const isMobile = typeof window !== 'undefined' ? window.innerWidth < 1024 : false;
  const railStyle: any = line ? resolveLineStyle(line.id, line.color, line.textColor) : {};

  const lineColor = railStyle.backgroundColor || '#475569';
  const lineInk = railStyle.color || '#ffffff';

  const MUTED_RAIL_COLOR = '#475569';

  const renderStopRow = (
    stop: Stop,
    opts: { isFirst: boolean; isLast: boolean; isTerminus?: boolean; muted?: boolean }
  ) => {
    const { isFirst, isLast, isTerminus = isFirst || isLast, muted = false } = opts;
    const state = stopDepartures.get(stop.id);
    const departures = state?.departures ?? [];
    const groups = buildDepartureGroups(departures, language);
    const isExpanded = expandedStops.has(stop.id);
    const favorite = isFavorite(stop.id);
    const railColor = muted ? MUTED_RAIL_COLOR : lineColor;
    return (
      <div key={stop.id} className="flex items-stretch gap-3.5">
        <div className="relative w-4 flex-shrink-0" aria-hidden="true">
          {!isFirst && (
            <div
              className="absolute left-1/2 top-0 h-5 w-1 -translate-x-1/2"
              style={{ backgroundColor: railColor }}
            />
          )}
          {!isLast && (
            <div
              className="absolute bottom-0 left-1/2 top-5 w-1 -translate-x-1/2"
              style={{ backgroundColor: railColor }}
            />
          )}
          <div
            className="absolute left-1/2 top-5 z-10 -translate-x-1/2 -translate-y-1/2 flex-shrink-0 rounded-full"
            style={{
              backgroundColor: railColor,
              width: isTerminus ? 16 : 8,
              height: isTerminus ? 16 : 8,
            }}
          />
        </div>

        <div className="min-w-0 flex-1 pb-3.5">
          <button
            type="button"
            onClick={() => handleToggleStop(stop)}
            className="flex w-full items-center gap-3 py-1 text-left transition hover:opacity-80"
          >
            <div className="min-w-0 flex-1">
              <p className="flex min-w-0 items-center gap-2">
                <span className={`truncate text-[0.9375rem] font-semibold ${muted ? 'text-slate-500' : 'text-white'}`}>{stop.name}</span>
                {isTerminus && (
                  <span
                    className="flex-shrink-0 rounded-md px-1.5 py-px text-[0.6875rem] font-semibold leading-tight"
                    style={{ backgroundColor: railColor, color: muted ? '#cbd5e1' : lineInk }}
                  >
                    {text.terminus}
                  </span>
                )}
              </p>
              {stop.city && <p className="mt-0.5 truncate text-xs text-slate-400">{stop.city}</p>}
            </div>
            <ChevronDownIcon className={`w-4 h-4 text-slate-500 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
          </button>

          <div
            className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-300 ease-out ${
              isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
            }`}
            aria-hidden={!isExpanded}
          >
            <div className="min-h-0 space-y-3 pt-2">
              {state?.loading ? (
                <p className="text-sm text-slate-400">{text.loading}</p>
              ) : state?.error ? (
                <p className="text-sm text-slate-400">{text.noDepartures}</p>
              ) : departures.length === 0 ? (
                <p className="text-sm text-slate-400">{text.noDepartures}</p>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between">
                    <p className="text-xs font-semibold text-slate-500">{text.direction}</p>
                    <p className="text-xs font-semibold text-slate-500">{text.next}</p>
                  </div>
                  {groups.map(group => (
                    <div key={group.destination} className="flex items-baseline gap-3">
                      <p className="min-w-0 flex-1 truncate text-sm text-white">{group.destination}</p>
                      <span className="tabular flex-shrink-0 text-sm font-bold text-white">{group.times[0] || '—'}</span>
                      <span className="tabular w-12 flex-shrink-0 text-right text-sm text-slate-500">{group.times[1] || '—'}</span>
                    </div>
                  ))}
                </div>
              )}
              <DepartureQuickActions
                style={railStyle}
                actions={[
                  { label: text.openStop, Icon: MapIcon, onSelect: () => onStopClick?.(stop) },
                  { label: text.timetable, Icon: ClockIcon, onSelect: () => onOpenTimetable?.({ stopName: stop.name, stopId: stop.id }) },
                  {
                    label: favorite ? text.removeFavorite : text.addFavorite,
                    Icon: favorite ? BookmarkIcon : BookmarkOutlineIcon,
                    onSelect: () => {
                      if (favorite) {
                        removeFavoriteAndNotify(stop.id);
                      } else {
                        setFavoriteAndNotify({
                          stopId: stop.id,
                          stopName: stop.name,
                          city: stop.city,
                          lines: 'all',
                          addedAt: Date.now(),
                        });
                      }
                    },
                  },
                ]}
              />
            </div>
          </div>
        </div>
      </div>
    );
  };

  const BRANCH_INDENT = 40;
  const SPUR_BEND_RADIUS = 14;

  const renderSpurBranch = (branchStops: Stop[], options: { trunkContinues: boolean }) => {
    if (branchStops.length === 0) return null;
    const muted = spurBranchActive === false;
    const branchColor = muted ? MUTED_RAIL_COLOR : lineColor;
    return (
      <div className="relative" ref={measureSpurLead}>
        <svg
          className="pointer-events-none absolute left-0 overflow-visible"
          style={{ top: -spurCurveLead }}
          width={BRANCH_INDENT + 16}
          height={spurCurveLead + SPUR_FIRST_STOP_Y}
          viewBox={`0 0 ${BRANCH_INDENT + 16} ${spurCurveLead + SPUR_FIRST_STOP_Y}`}
          fill="none"
          aria-hidden="true"
        >
          <path
            d={(() => {
              const fromX = 8;
              const toX = BRANCH_INDENT + 16;
              const endY = spurCurveLead + SPUR_FIRST_STOP_Y;
              const middle = endY / 2;
              const bend = Math.min(SPUR_BEND_RADIUS, middle, (toX - fromX) / 2);
              return [
                `M${fromX} 0`,
                `V ${middle - bend}`,
                `Q ${fromX} ${middle}, ${fromX + bend} ${middle}`,
                `H ${toX - bend}`,
                `Q ${toX} ${middle}, ${toX} ${middle + bend}`,
                `V ${endY}`,
              ].join(' ');
            })()}
            stroke={branchColor}
            strokeWidth="4"
            strokeLinecap="round"
          />
        </svg>
        {options.trunkContinues && (
          <div
            className="absolute left-2 top-0 bottom-0 w-1 -translate-x-1/2"
            style={{ backgroundColor: lineColor }}
            aria-hidden="true"
          />
        )}
        <div style={{ marginLeft: BRANCH_INDENT + 8 }}>
          {branchStops.map((stop, index) =>
            renderStopRow(stop, {
              isFirst: index === 0,
              isLast: index === branchStops.length - 1,
              isTerminus: index === branchStops.length - 1,
              muted,
            })
          )}
        </div>
      </div>
    );
  };

  const panelContent = (
    <div className="p-5 pb-10">
      {

}
      <div className="mb-7 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 flex items-start gap-3">
          <LineBadge line={line} size="md" />

          {(() => {
            const [left, right] = foreignRoute ? foreignRoute.ends : splitTerminusPair(line.longName);
            return (
              <h2 className={`min-w-0 flex-1 text-[1.625rem] font-extrabold leading-[1.12] tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                <span>{left}</span>
                {right && (
                  <>
                    <ArrowsRightLeftIcon className="mx-2 inline h-4 w-4 flex-shrink-0 align-baseline text-slate-500" />
                    <span>{right}</span>
                  </>
                )}
              </h2>
            );
          })()}
        </div>
        {

}
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            onClick={() => {
              if (isLineFav) {
                removeFavoriteLineAndNotify(line.id);
              } else {
                setFavoriteLineAndNotify(line);
              }
            }}
            aria-label={isLineFav ? text.removeFavorite : text.addFavorite}
            title={isLineFav ? text.removeFavorite : text.addFavorite}
            className={`flex h-9 w-9 items-center justify-center rounded-full border transition ${
              isLineFav
                ? 'border-blue-500 bg-blue-500/15 hover:bg-blue-500/25'
                : 'border-slate-700 bg-slate-800 hover:bg-slate-700'
            }`}
          >
            {isLineFav ? (
              <BookmarkIcon className="h-4 w-4 text-blue-400" />
            ) : (
              <BookmarkOutlineIcon className="h-4 w-4 text-white" />
            )}
          </button>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-800 transition hover:bg-slate-700"
            aria-label={language === 'fr' ? 'Fermer la ligne' : 'Close line details'}
          >
            <XMarkIcon className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      {(onOpenLineMap || onOpenTimetable) && (
        <div className="mb-7">
          <DepartureQuickActions
            style={railStyle}
            actions={[
              ...(onOpenLineMap ? [{ label: text.lineMap, Icon: PaperClipIcon, onSelect: onOpenLineMap }] : []),
              ...(onOpenTimetable ? [{
                label: text.timetable,
                Icon: ClockIcon,
                onSelect: () => isForeignLineId(String(line?.id ?? '')) && lineStops[0]
                  ? onOpenTimetable({ stopName: lineStops[0].name, stopId: lineStops[0].id })
                  : onOpenTimetable(),
              }] : []),
            ]}
          />
        </div>
      )}

      {lineTraffic.length > 0 && (
        <div className="mb-7">
          <div className="mb-2.5 flex items-baseline justify-between border-b border-amber-800/40 pb-2">
            <p className="text-[0.8125rem] font-bold text-amber-400">{text.trafficInfo}</p>
            <p className="tabular text-xs text-amber-500/70">{lineTraffic.length}</p>
          </div>
          <div className="space-y-2">
            {lineTraffic.map((detail, index) => (
              <TrafficAlertCard
                key={`${detail.titre}-${index}`}
                detail={detail}
                language={language}
              />
            ))}
          </div>
        </div>
      )}

      <div className="mb-6">
        <div className="mb-1 flex items-baseline justify-between border-b border-slate-800 pb-2">
          <p className="text-[0.8125rem] font-bold text-slate-300">{text.stops}</p>
          <p className="tabular text-xs text-slate-500">
            {totalStopsCount}{' '}
            {(totalStopsCount === 1 ? text.stop : text.stops).toLocaleLowerCase(language)}
          </p>
        </div>

        {loadingStops ? (
          <div className="py-6 text-sm text-slate-400">{text.loading}</div>
        ) : flatRenderedStops.length === 0 ? (
          <div className="py-6 text-sm text-slate-400">{text.noStops}</div>
        ) : lineEBranches ? (
          <div>
            {lineEBranches.trunk.map((stop, index) => renderStopRow(stop, { isFirst: index === 0, isLast: false }))}
            {renderSpurBranch(lineEBranches.depotBranch, { trunkContinues: lineEBranches.mainBranch.length > 0 })}
            {lineEBranches.mainBranch.map((stop, index) =>
              renderStopRow(stop, { isFirst: false, isLast: index === lineEBranches.mainBranch.length - 1 })
            )}
          </div>
        ) : genericSpurBranches ? (
          <div>
            {genericSpurBranches.trunk.map((stop, index) => {
              const isLastTrunk = index === genericSpurBranches.trunk.length - 1;
              return renderStopRow(stop, {
                isFirst: index === 0,
                isLast: isLastTrunk && genericSpurBranches.continuation.length === 0,
                isTerminus: isLastTrunk ? genericSpurBranches.forkIsTerminus : undefined,
              });
            })}
            {renderSpurBranch(genericSpurBranches.spur, { trunkContinues: genericSpurBranches.continuation.length > 0 })}
            {genericSpurBranches.continuation.map((stop, index) =>
              renderStopRow(stop, { isFirst: false, isLast: index === genericSpurBranches.continuation.length - 1 })
            )}
          </div>
        ) : (
          <div>
            {flatRenderedStops.map((stop, index) => {
              const isFirst = index === 0;
              const isLast = index === flatRenderedStops.length - 1;
              const isTerminus = isFirst || isLast || extraTerminusKeys.has(stopNameKey(stop.name));
              return renderStopRow(stop, { isFirst, isLast, isTerminus });
            })}
          </div>
        )}
      </div>

    </div>
  );

  if (isMobile) {
    return (
      <MapSheet
        isOpen={isOpen && line !== null}
        onClose={onClose}
        isLight={!isDark}
        zIndex={60}
      >
        <div className="h-full overflow-y-auto">{panelContent}</div>
      </MapSheet>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && line && (
        <motion.div
          key={line.id}
          initial={{ x: -420, opacity: 0, scale: 0.98 }}
          animate={{ x: 0, opacity: 1, scale: 1 }}
          exit={{ x: -420, opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          className={`fixed left-0 top-0 h-screen w-96 max-w-full shadow-2xl z-60 overflow-y-auto ${
            isDark ? 'bg-slate-900 border-r border-slate-800' : 'bg-white border-r border-slate-200'
          }`}
          style={{ minWidth: 'unset' }}
        >
          {panelContent}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
