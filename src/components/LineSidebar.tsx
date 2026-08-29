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
    towards: isFr ? 'Vers' : 'Towards',
    exceptionalBranch: isFr ? 'Desserte exceptionnelle' : 'Exceptional branch',
  };
};

/**
 * Bifurcation exceptionnelle de la ligne E.
 *
 * Le dépôt n'est pas sur le tracé normal : certaines courses le rejoignent en
 * quittant les rails entre Estacade - Condorcet et Vallier - Libération, par
 * une desserte qui rallonge le trajet avant de retrouver le vrai terminus,
 * Plaine des Sports. Mélangés au tracé principal, ces arrêts semblaient posés
 * n'importe où avant le terminus ; ici ils forment leur propre branche.
 *
 * Pas de source de données pour les patterns/variantes GTFS de la ligne :
 * l'endpoint MTAG `/routes/{id}/stops` renvoie une liste à plat, sans ordre
 * de parcours ni notion de branche. La liste est donc figée à la main, pour
 * cette ligne seulement.
 */
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

/**
 * Bifurcations et termini secondaires des autres lignes du réseau.
 *
 * Même souci que pour la ligne E : l'endpoint MTAG ne connaît qu'une liste
 * à plat par ligne, sans branches. Ici, contrairement au dépôt de la ligne
 * E, les arrêts de chaque embranchement suivent déjà l'ordre du tracé dans
 * cette liste (ils arrivent juste après le point de bifurcation) : un
 * simple découpage séquentiel suffit, pas besoin de recouper avec l'annuaire
 * complet des arrêts.
 */
interface LineSpurConfig {
  forkAfterStop: string;
  /** Le tronc s'arrête-t-il déjà là pour le service normal (ex. ligne C,
   *  terminus de jour), ou continue-t-il aussi tout droit (ex. ligne D,
   *  qui dessert encore Neyrpic - Belledonne et la suite) ? */
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

/** Arrêts intermédiaires où certaines courses terminent réellement, sans
 *  bifurcation physique : juste une voie directe qui redescend de là. */
const LINE_EXTRA_TERMINI: Record<string, string[]> = {
  A: ["Grand'place"],
};

/** Doublons renvoyés par l'API à filtrer : même arrêt physique que celui
 *  déjà présent plus tôt dans la liste, sous un nom légèrement différent. */
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
  const lineTraffic = normalizedLineKey ? trafficInfo.get(normalizedLineKey) || [] : [];

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

  const isLineE = normalizedLineKey === 'E';

  /**
   * Découpe la liste plate en tronc commun + deux branches quand c'est la
   * ligne E : le tronc s'arrête à Estacade - Condorcet, la desserte dépôt
   * suit la liste figée ci-dessus, et tout le reste (le tracé normal après
   * la bifurcation) forme la branche principale.
   */
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

  /**
   * Même découpage tronc + branche pour les autres lignes, mais plus simple :
   * les arrêts de l'embranchement suivent déjà l'ordre du tracé juste après
   * le point de bifurcation, un simple passage séquentiel suffit à les
   * séparer de la continuation normale.
   */
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

  /**
   * La branche ne tourne qu'à certaines heures (dépôt, prolongement du
   * soir...). Le premier arrêt qui lui est propre suffit à dire si elle est
   * active maintenant ; sinon elle se grise, quelle que soit la ligne.
   */
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

  /**
   * Une ligne de temps, comme celle d'un itinéraire.
   *
   * Même trait fin porté par les arrêts, même dépliage en grille plutôt
   * qu'une carte encadrée qui s'ouvre : c'est le style de `JourneyTimeline`,
   * repris ici pour qu'une ligne et un trajet se lisent pareil.
   */
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
          {/* Même trait, même rond plein que dans la timeline d'un
              itinéraire (`JourneyTimeline`) : pas d'anneau creux ici. */}
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
                <span className={`truncate text-[15px] font-semibold ${muted ? 'text-slate-500' : 'text-white'}`}>{stop.name}</span>
                {isTerminus && (
                  <span
                    className="flex-shrink-0 rounded-md px-1.5 py-px text-[11px] font-semibold leading-tight"
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

          {/* Dépliement animé par la grille : même mécanique que dans la
              timeline d'un itinéraire, pas de carte qui apparaît autour. */}
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
                  { label: text.timetable, Icon: ClockIcon, onSelect: () => onOpenTimetable?.({ stopName: stop.name }) },
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

  /**
   * L'embranchement, comme un rameau qui part du tronc.
   *
   * Le tronc continue tout droit — c'est la voie que la ligne suit le plus
   * souvent — et la desserte la plus courte se détache dans un encart en
   * retrait, relié par une courbe. Rien ne s'arrête pour elle : le trait
   * principal reste continu derrière l'encart, exactement comme sur les
   * plans de réseau où une antenne se glisse à côté de la ligne plutôt que
   * de la couper.
   */
  const BRANCH_INDENT = 40;

  /**
   * Le rameau qui part du tronc, comme sur un graphe git : le tronc reste
   * un trait continu de haut en bas, une courbe s'en détache à angle franc
   * puis file vers une seconde colonne de cercles, décalée à droite — pas
   * un onglet qui se replie sur lui-même.
   */
  const renderSpurBranch = (branchStops: Stop[]) => {
    if (branchStops.length === 0) return null;
    const muted = spurBranchActive === false;
    const branchColor = muted ? MUTED_RAIL_COLOR : lineColor;
    return (
      <div className="relative">
        {/* Une vraie courbe, souple, comme sur un graphe git : le trait
            descend, s'incurve, puis file à l'horizontale vers la branche.
            Peinte avant le tronc, pour ne jamais le recouvrir quand elle
            est grisée. */}
        <svg
          className="pointer-events-none absolute left-0 top-0 overflow-visible"
          width={BRANCH_INDENT + 16}
          height="24"
          viewBox={`0 0 ${BRANCH_INDENT + 16} 24`}
          fill="none"
          aria-hidden="true"
        >
          <path
            d={`M8 0 C 8 12, 20 20, 34 20 H ${BRANCH_INDENT + 16}`}
            stroke={branchColor}
            strokeWidth="4"
            strokeLinecap="round"
          />
        </svg>
        {/* Le tronc continue tout droit, toujours à sa couleur, par-dessus
            la courbe : lui n'est pas concerné par l'activité de la branche
            qui s'en détache. */}
        <div
          className="absolute left-2 top-0 bottom-0 w-1 -translate-x-1/2"
          style={{ backgroundColor: lineColor }}
          aria-hidden="true"
        />
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
          {/* Le favori de la ligne : creux, puis plein et bleu — le même
              langage que le signet d'un arrêt, mais sa propre couleur pour
              ne pas se confondre avec celle de la ligne. */}
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
              ...(onOpenTimetable ? [{ label: text.timetable, Icon: ClockIcon, onSelect: () => onOpenTimetable() }] : []),
            ]}
          />
        </div>
      )}

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
            {/* La desserte dépôt est l'exception : c'est elle qui se détache
                du tronc comme un rameau. Le tracé normal continue tout droit
                — c'est la ligne, pas la bifurcation. */}
            {renderSpurBranch(lineEBranches.depotBranch)}
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
                isLast: false,
                isTerminus: isLastTrunk ? genericSpurBranches.forkIsTerminus : undefined,
              });
            })}
            {renderSpurBranch(genericSpurBranches.spur)}
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
