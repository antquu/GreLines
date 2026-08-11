import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sheet } from 'react-modal-sheet';
import { XMarkIcon, MapIcon, ChevronDownIcon, ExclamationTriangleIcon, StarIcon, ArrowsRightLeftIcon, ClockIcon, PaperClipIcon } from '@heroicons/react/24/solid';
import { StarIcon as StarOutlineIcon } from '@heroicons/react/24/outline';
import { LineBadge } from './LineBadge';
import { formatDepartureTime, getDepartures } from '../services/api';
import { getStopsServedByLines, type ServedStopPoint } from '../services/lineShapes';
import type { Stop, TrafficDetail, Departure } from '../types';
import type { AllLinesLine } from '../services/allLines';
import { resolveLineStyle } from '../utils/lineColors';
import {
  isFavorite,
  removeFavoriteAndNotify,
  setFavoriteAndNotify,
  subscribeFavorites,
} from '../services/favorites';

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
  onPlanRoute?: () => void;
  
  onOpenTimetable?: () => void;
  
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
  };
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

export const LineSidebar = ({ line, isOpen, onClose, stops, trafficInfo, language, onStopClick, autoSync, refreshIntervalMs, theme = 'dark', onPlanRoute, onOpenTimetable, onOpenLineMap }: LineSidebarProps) => {
  const [servedStopPoints, setServedStopPoints] = useState<ServedStopPoint[] | null>(null);
  const [loadingStops, setLoadingStops] = useState(false);
  const [expandedStops, setExpandedStops] = useState<Set<string>>(new Set());
  const [stopDepartures, setStopDepartures] = useState<Map<string, { departures: Departure[]; loading: boolean; error: boolean }>>(new Map());
  const [expandedTraffic, setExpandedTraffic] = useState<Set<number>>(new Set());

  const text = getSidebarText(language);
  const normalizedLineKey = line ? normalizeLineKey(line.id) : null;
  const lineTraffic = normalizedLineKey ? trafficInfo.get(normalizedLineKey) || [] : [];

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
    setExpandedTraffic(new Set());
  }, [line?.id]);

  useEffect(() => {
    return subscribeFavorites(() => {
      setStopDepartures(prev => new Map(prev));
    });
  }, []);

  const stopMatchThreshold = 0.0001;
  const isDark = theme === 'dark';

  const lineStops = useMemo(() => {
    if (!servedStopPoints || stops.length === 0) return [];
    const uniqueStops = new Map<string, Stop>();
    servedStopPoints.forEach(point => {
      let bestMatch: Stop | null = null;
      let bestDist = Infinity;
      for (const stop of stops) {
        const dist = getDistanceSq(point, stop);
        if (dist < bestDist) {
          bestDist = dist;
          bestMatch = stop;
        }
      }
      if (bestMatch && bestDist <= stopMatchThreshold) {
        uniqueStops.set(bestMatch.id, bestMatch);
      }
    });
    return Array.from(uniqueStops.values());
  }, [servedStopPoints, stops]);
  const renderedStops = lineStops;

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
  if (!line) return null;
  const isMobile = typeof window !== 'undefined' ? window.innerWidth < 1024 : false;
  const railStyle: any = line ? resolveLineStyle(line.id, line.color, line.textColor) : {};

  const lineColor = railStyle.backgroundColor || '#475569';

  const panelContent = (
    <div className="p-5 pb-10">
      {

}
      <div className="mb-7 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 flex items-start gap-3">
          <LineBadge line={line} size="md" />

          {(() => {
            const [left, right] = splitTerminusPair(line.longName);
            return (
              <h2 className="min-w-0 flex-1 text-[26px] font-extrabold leading-[1.12] tracking-tight text-white">
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
          {onOpenTimetable && (
            <button
              onClick={onOpenTimetable}
              aria-label={text.timetable}
              title={text.timetable}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-800 transition hover:bg-slate-700"
            >
              <ClockIcon className="h-4 w-4 text-white" />
            </button>
          )}
          {onOpenLineMap && (
            <button
              onClick={onOpenLineMap}
              aria-label={text.lineMap}
              title={text.lineMap}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-800 transition hover:bg-slate-700"
            >
              <PaperClipIcon className="h-4 w-4 text-white" />
            </button>
          )}
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-800 transition hover:bg-slate-700"
            aria-label={language === 'fr' ? 'Fermer la ligne' : 'Close line details'}
          >
            <XMarkIcon className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      {lineTraffic.length > 0 && (
        <div className="mb-7">
          <div className="mb-2.5 flex items-baseline justify-between border-b border-amber-800/40 pb-2">
            <p className="signal-label text-amber-400/90">{text.trafficInfo}</p>
            <p className="tabular text-xs text-amber-500/70">{lineTraffic.length}</p>
          </div>
          <div className="space-y-2">
            {lineTraffic.map((detail, index) => {
              const isExpanded = expandedTraffic.has(index);
              return (
                <div key={`${detail.titre}-${index}`} className="overflow-hidden rounded-xl border border-amber-700/50 bg-amber-950/20">
                  <button
                    type="button"
                    onClick={() => {
                      setExpandedTraffic(prev => {
                        const next = new Set(prev);
                        next.has(index) ? next.delete(index) : next.add(index);
                        return next;
                      });
                    }}
                    className="w-full px-3.5 py-3 flex items-start justify-between gap-3 text-left hover:bg-amber-950/30 transition"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0 text-amber-400" />
                        <p className="truncate text-sm font-semibold text-amber-200">{detail.titre || text.trafficInfo}</p>
                      </div>
                      {detail.dateFin && (
                        <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-amber-400/60">
                          {text.estimatedEnd} {detail.dateFin}
                        </p>
                      )}
                    </div>
                    <ChevronDownIcon className={`mt-0.5 w-4 h-4 flex-shrink-0 text-amber-300/70 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>

                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: isExpanded ? 'auto' : 0, opacity: isExpanded ? 1 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          key="traffic-details"
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.18, ease: 'easeOut' }}
                          className="border-t border-amber-700/30 px-3.5 py-3"
                        >
                          {detail.description ? (
                            <p className="text-sm text-amber-100/85 whitespace-pre-line">{detail.description}</p>
                          ) : (
                            <p className="text-sm text-amber-100/85">{detail.titre || 'Détails indisponibles'}</p>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mb-6">
        <div className="mb-1 flex items-baseline justify-between border-b border-slate-800 pb-2">
          <p className="signal-label text-slate-400">{text.stops}</p>
          <p className="tabular text-xs text-slate-500">
            {renderedStops.length}{' '}
            {(renderedStops.length === 1 ? text.stop : text.stops).toLocaleLowerCase(language)}
          </p>
        </div>

        {loadingStops ? (
          <div className="py-6 text-sm text-slate-400">{text.loading}</div>
        ) : renderedStops.length === 0 ? (
          <div className="py-6 text-sm text-slate-400">{text.noStops}</div>
        ) : (
          <div>
            {renderedStops.map((stop, index) => {
              const state = stopDepartures.get(stop.id);
              const departures = state?.departures ?? [];
              const groups = buildDepartureGroups(departures, language);
              const isExpanded = expandedStops.has(stop.id);
              const isFirst = index === 0;
              const isLast = index === renderedStops.length - 1;
              const isTerminus = isFirst || isLast;
              const favorite = isFavorite(stop.id);
              return (
                <div key={stop.id} className="flex items-stretch gap-3.5">
                  {/* Tronc de la ligne : trait continu à sa couleur officielle,
                      anneau à chaque arrêt, cabochon plein aux deux terminus. */}
                  <div className="relative w-4 flex-shrink-0" aria-hidden="true">
                    {!isFirst && (
                      <div
                        className="absolute left-1/2 top-0 h-5 w-[3px] -translate-x-1/2"
                        style={{ backgroundColor: lineColor }}
                      />
                    )}
                    {!isLast && (
                      <div
                        className="absolute bottom-0 left-1/2 top-5 w-[3px] -translate-x-1/2"
                        style={{ backgroundColor: lineColor }}
                      />
                    )}
                    <div
                      className="absolute left-1/2 top-5 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] bg-slate-900"
                      style={{
                        borderColor: lineColor,
                        backgroundColor: isTerminus ? lineColor : undefined,
                        width: isTerminus ? 14 : 11,
                        height: isTerminus ? 14 : 11,
                      }}
                    />
                  </div>

                  <div className="min-w-0 flex-1 border-b border-slate-800/80 pb-1 last:border-b-0">
                    <div className="overflow-hidden">
                      <button
                        type="button"
                        onClick={() => handleToggleStop(stop)}
                        className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-slate-800/70"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-semibold text-white">{stop.name}</p>
                          <p className="mt-0.5 flex items-center gap-2 truncate text-xs text-slate-400">
                            {isTerminus && (
                              <span className="signal-label" style={{ color: lineColor }}>
                                {text.terminus}
                              </span>
                            )}
                            {stop.city || ''}
                          </p>
                        </div>
                        <ChevronDownIcon className={`w-4 h-4 text-slate-500 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>

                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: isExpanded ? 'auto' : 0, opacity: isExpanded ? 1 : 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <AnimatePresence initial={false}>
                          {isExpanded && (
                            <motion.div
                              key="stop-details"
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -4 }}
                              transition={{ duration: 0.18, ease: 'easeOut' }}
                              className="mb-2 ml-2 space-y-3 rounded-xl bg-slate-800/50 px-3.5 py-3.5"
                            >
                              {state?.loading ? (
                                <p className="text-sm text-slate-400">{text.loading}</p>
                              ) : state?.error ? (
                                <p className="text-sm text-slate-400">{text.noDepartures}</p>
                              ) : departures.length === 0 ? (
                                <p className="text-sm text-slate-400">{text.noDepartures}</p>
                              ) : (
                                <div className="space-y-2">
                                  <div className="flex items-baseline justify-between">
                                    <p className="signal-label text-slate-500">{text.direction}</p>
                                    <p className="signal-label text-slate-500">{text.next}</p>
                                  </div>
                                  {/* Deux prochains passages par direction, en
                                      chiffres tabulaires : les horaires
                                      s'alignent d'une ligne à l'autre. */}
                                  {groups.map(group => (
                                    <div key={group.destination} className="flex items-baseline gap-3">
                                      <p className="min-w-0 flex-1 truncate text-sm text-white">
                                        {group.destination}
                                      </p>
                                      <span className="tabular flex-shrink-0 text-sm font-bold text-white">
                                        {group.times[0] || '—'}
                                      </span>
                                      <span className="tabular w-12 flex-shrink-0 text-right text-sm text-slate-500">
                                        {group.times[1] || '—'}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div className="flex flex-wrap items-center gap-2 pt-1">
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition"
                                  onClick={() => onStopClick?.(stop)}
                                >
                                  <MapIcon className="w-4 h-4" />
                                  {text.openStop}
                                </button>
                                <button
                                  type="button"
                                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                                    favorite
                                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15'
                                      : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                                  }`}
                                  onClick={() => {
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
                                  }}
                                >
                                  {favorite ? <StarIcon className="w-4 h-4 text-amber-400" /> : <StarOutlineIcon className="w-4 h-4" />}
                                  {favorite ? text.removeFavorite : text.addFavorite}
                                </button>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-slate-800 mt-6 pt-4">
        <button
          type="button"
          onClick={onPlanRoute}
          className="flex w-full items-center justify-center gap-2 px-0 py-0 cursor-pointer text-xs text-slate-400 transition hover:text-slate-200"
        >
          <span>{language === 'fr' ? 'Calculer votre itinéraire avec' : 'Calculate your itinerary with'}</span>
          <img
            src={isDark ? '/assets/GreGoLOGO.png' : '/assets/grego_light.png'}
            alt="GreGo"
            className="h-4 w-auto"
          />
        </button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet
        style={{ zIndex: 60 }}
        isOpen={isOpen && line !== null}
        onClose={onClose}
        snapPoints={[0, 0.6, 1]}
        initialSnap={1}
      >
        <Sheet.Container
          style={{
            borderRadius: '28px 28px 0 0',
            backgroundColor: '#0f172a',
            border: '1px solid rgba(148,163,184,0.18)',
            zIndex: 60,
          }}
        >
          <Sheet.Header>
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1.5 w-16 rounded-full bg-white/20" />
            </div>
          </Sheet.Header>
          <Sheet.Content disableDrag={state => state.scrollPosition !== 'top'}>
            <div className="h-full overflow-y-auto">{panelContent}</div>
          </Sheet.Content>
        </Sheet.Container>
        <Sheet.Backdrop onTap={onClose} style={{ zIndex: 59 }} />
      </Sheet>
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
          className="fixed left-0 top-0 h-screen w-full max-w-[28rem] bg-slate-900 border-r border-slate-800 shadow-2xl z-60 overflow-y-auto"
          style={{ minWidth: 'unset' }}
        >
          {panelContent}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
