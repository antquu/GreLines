import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MapSheet } from './MapSheet';
import { XMarkIcon, MapIcon, ChevronDownIcon, BookmarkIcon, ArrowsRightLeftIcon, ClockIcon, PaperClipIcon } from '@heroicons/react/24/solid';
import { BookmarkIcon as BookmarkOutlineIcon } from '@heroicons/react/24/outline';
import { LineBadge } from './LineBadge';
import { TrafficAlertCard } from './TrafficAlertCard';
import { formatDepartureTime, getDepartures } from '../services/api';
import { getStopsServedByLines, type ServedStopPoint } from '../services/lineShapes';
import type { Stop, TrafficDetail, Departure } from '../types';
import type { AllLinesLine } from '../services/allLines';
import { resolveLineStyle } from '../utils/lineColors';
import { DepartureQuickActions } from './DepartureQuickActions';
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
  
  /**
   * Ouvre la fiche horaire de la ligne.
   *
   * Avec un arrêt, la fiche s'ouvre sur cet arrêt-là, surligné dans la
   * colonne : c'est la question qu'on se pose devant un arrêt déplié — « et à
   * quelle heure, ici ? » —, et non celle de la ligne entière.
   */
  onOpenTimetable?: (options?: { stopName?: string }) => void;
  
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

export const LineSidebar = ({ line, isOpen, onClose, stops, trafficInfo, language, onStopClick, autoSync, refreshIntervalMs, theme = 'dark', onOpenTimetable, onOpenLineMap }: LineSidebarProps) => {
  const [servedStopPoints, setServedStopPoints] = useState<ServedStopPoint[] | null>(null);
  const [loadingStops, setLoadingStops] = useState(false);
  const [expandedStops, setExpandedStops] = useState<Set<string>>(new Set());
  const [stopDepartures, setStopDepartures] = useState<Map<string, { departures: Departure[]; loading: boolean; error: boolean }>>(new Map());

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
  /**
   * L'encre de la ligne, celle de sa pastille.
   *
   * Blanche sur le bleu du tram A, noire sur le jaune des chrono : c'est
   * `resolveLineTextColor` qui tranche, et il connaît déjà les exceptions du
   * réseau. Le badge « Terminus » s'en sert plutôt que d'un blanc fixe, qui
   * disparaissait sur les lignes claires.
   */
  const lineInk = railStyle.color || '#ffffff';

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
              <h2 className={`min-w-0 flex-1 text-[26px] font-extrabold leading-[1.12] tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
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
          {/* En Inter et sans capitales : c'est un titre de section, pas une
              étiquette de tableau de bord. */}
          <p className="text-[13px] font-bold text-slate-300">{text.stops}</p>
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

                  {/*
                    Le trait de séparation cède la place au cadre.

                    Déplié, l'arrêt devient un bloc : un seul rectangle autour du
                    nom et de ce qu'on vient d'ouvrir, comme les passages de la
                    fiche d'un arrêt. Le cadre posé sous l'en-tête seulement
                    donnait deux objets là où il n'y a qu'une chose — et le trait
                    de séparation le traversait par le milieu.
                  */}
                  <div
                    className={`min-w-0 flex-1 pb-1 ${
                      isExpanded ? '' : 'border-b border-slate-800/80 last:border-b-0'
                    }`}
                  >
                    <div
                      className={`overflow-hidden transition-colors ${
                        isExpanded ? 'rounded-2xl border border-slate-700 bg-slate-800/60' : ''
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleStop(stop)}
                        className={`flex w-full items-center gap-3 px-2 py-2.5 text-left transition hover:bg-slate-800/70 ${
                          isExpanded ? 'px-3.5' : 'rounded-xl'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          {/* Le terminus se dit à côté du nom, en pastille : il
                              qualifie cet arrêt-là, il n'ouvre pas une rubrique.
                              Il tenait la place d'une ligne entière sous le nom,
                              en capitales espacées, et se lisait comme un titre. */}
                          <p className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-[15px] font-semibold text-white">
                              {stop.name}
                            </span>
                            {isTerminus && (
                              <span
                                className="flex-shrink-0 rounded-md px-1.5 py-px text-[11px] font-semibold leading-tight"
                                style={{ backgroundColor: lineColor, color: lineInk }}
                              >
                                {text.terminus}
                              </span>
                            )}
                          </p>
                          {stop.city && (
                            <p className="mt-0.5 truncate text-xs text-slate-400">{stop.city}</p>
                          )}
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
                              /* Plus de fond ni de coins : le cadre est
                                 maintenant celui de l'arrêt tout entier. */
                              className="space-y-3 px-3.5 pb-3.5"
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
                                    <p className="text-xs font-semibold text-slate-500">{text.direction}</p>
                                    <p className="text-xs font-semibold text-slate-500">{text.next}</p>
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
                              {/* Les mêmes carrés que sous un passage, dans la
                                  fiche d'un arrêt : deux ici au lieu de trois,
                                  peints de la couleur de la ligne. Le favori
                                  déjà posé passe à l'ambre — la couleur dit ce
                                  que le libellé demanderait de lire. */}
                              <DepartureQuickActions
                                style={railStyle}
                                actions={[
                                  {
                                    label: text.openStop,
                                    Icon: MapIcon,
                                    onSelect: () => onStopClick?.(stop),
                                  },
                                  {
                                    label: text.timetable,
                                    Icon: ClockIcon,
                                    onSelect: () => onOpenTimetable?.({ stopName: stop.name }),
                                  },
                                  {
                                    /* Le carré garde la couleur de la ligne,
                                       gardé ou non : c'est le signet qui dit
                                       l'état — creux, puis plein. Il passait à
                                       l'ambre, ce qui disait la même chose une
                                       seconde fois et faisait changer de
                                       couleur un bloc de la taille du pouce. */
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
          className={`fixed left-0 top-0 h-screen w-full max-w-[28rem] shadow-2xl z-60 overflow-y-auto ${
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
