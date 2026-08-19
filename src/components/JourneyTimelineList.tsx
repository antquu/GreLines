/**
 * Les itinéraires posés sur une même horloge.
 *
 * Une liste de trajets ne répond pas d'elle-même à la question qu'on se pose
 * vraiment : lequel me fait partir le plus tard, et lequel me fait arriver le
 * plus tôt ? Ici chaque trajet occupe une bande sur un axe de temps commun,
 * gradué de quart d'heure en quart d'heure : un tronçon deux fois plus long
 * est deux fois plus large, et deux trajets qui se chevauchent se lisent l'un
 * sous l'autre, à la même verticale.
 *
 * L'axe déborde de l'écran — c'est ce qui donne sa mesure au temps — et se fait
 * défiler du doigt. Une seule piste porte toute la liste : les bandes ne
 * peuvent donc pas se décaler les unes des autres.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeftIcon } from '@heroicons/react/24/solid';
import { LineBadge } from './LineBadge';
import { journeyFareChip } from '../utils/journeyFare';
import { journeyOperatorBrand } from '../utils/journeyOperator';
import { resolveRouteLine } from '../utils/routeLineResolver';
import type { RouteItinerary } from '../services/api';
import type { AllLinesLine } from '../services/allLines';

/** Largeur d'une minute. Un quart d'heure fait donc 90 px, lisible au doigt. */
const PIXELS_PER_MINUTE = 6;
const QUARTER = 15;
const MINUTE = 60_000;

/** Marge devant la première graduation, pour ne pas coller au bord. */
const EDGE_PADDING = 16;
/**
 * Espace au-delà de la dernière minute. Sans lui, la dernière heure d'arrivée
 * et le prix se retrouvent écrasés contre le bord droit, et l'on ne sait plus
 * si la frise est finie ou coupée.
 */
const TRAILING_SPACE = 96;
/** Hauteurs fixes : elles permettent de poser le prix en face de sa ligne. */
const RULER_HEIGHT = 26;
const ROW_HEIGHT = 80;

interface JourneyTimelineListProps {
  journeys: RouteItinerary[];
  language: 'fr' | 'en';
  stops?: unknown[];
  lineLookup?: Map<string, AllLinesLine> | null;
  theme?: 'light' | 'dark';
  selected?: RouteItinerary | null;
  onSelect?: (journey: RouteItinerary) => void;
}

interface Segment {
  key: string;
  startMs: number;
  endMs: number;
  kind: 'walk' | 'transit' | 'operator';
  color?: string;
  logo?: string;
  line?: { id: string; shortName?: string; color?: string; textColor?: string };
}

/** Bornes d'un trajet, à défaut de temps sur ses tronçons. */
function journeyBounds(journey: RouteItinerary): { start: number; end: number } {
  const legs = journey.allLegs || [];
  const starts = legs.map(leg => Number(leg?.startTime)).filter(Number.isFinite);
  const ends = legs.map(leg => Number(leg?.endTime)).filter(Number.isFinite);
  const rawStart = journey.rawDep ? new Date(journey.rawDep).getTime() : NaN;
  const rawEnd = journey.rawArr ? new Date(journey.rawArr).getTime() : NaN;

  const start = starts.length > 0 ? Math.min(...starts) : (Number.isFinite(rawStart) ? rawStart : Date.now());
  const totalSeconds = legs.reduce((sum, leg) => sum + (Number(leg?.duration) || 0), 0);
  const end = ends.length > 0
    ? Math.max(...ends)
    : Number.isFinite(rawEnd) ? rawEnd : start + totalSeconds * 1000;

  return { start, end: Math.max(end, start + MINUTE) };
}

/**
 * Les tronçons d'un trajet, datés. Quand l'API ne donne pas d'horaire — c'est
 * le cas des véhicules partagés — on enchaîne les durées depuis le départ :
 * la bande garde alors sa longueur, à défaut de son heure exacte.
 */
function journeySegments(
  journey: RouteItinerary,
  start: number,
  lineLookup: JourneyTimelineListProps['lineLookup'],
  stops: JourneyTimelineListProps['stops'],
  brandColor?: string,
  brandLogo?: string,
): Segment[] {
  let cursor = start;
  return (journey.allLegs || []).flatMap((leg, index): Segment[] => {
    const durationMs = (Number(leg?.duration) || 0) * 1000;
    const legStart = Number.isFinite(Number(leg?.startTime)) ? Number(leg.startTime) : cursor;
    const legEnd = Number.isFinite(Number(leg?.endTime)) ? Number(leg.endTime) : legStart + durationMs;
    cursor = legEnd;

    // Moins d'une minute : le tronçon n'a pas de place sur l'axe, et sa
    // pastille écraserait celle de son voisin.
    if (legEnd - legStart < MINUTE) return [];

    if (leg?.sharedOperator || leg?.uberProduct || leg?.taxiCompany) {
      return [{
        key: `operator-${index}`,
        startMs: legStart,
        endMs: legEnd,
        kind: 'operator',
        color: brandColor,
        logo: brandLogo,
      }];
    }

    if (leg?.mode === 'WALK') {
      return [{ key: `walk-${index}`, startMs: legStart, endMs: legEnd, kind: 'walk' }];
    }

    const line = resolveRouteLine({
      routeShortName: leg?.routeShortName,
      route: leg?.route,
      routeId: leg?.routeId,
      lineLookup,
      stops: stops as never,
    });

    return [{
      key: `transit-${index}`,
      startMs: legStart,
      endMs: legEnd,
      kind: 'transit',
      color: line?.color || '#3b82f6',
      line: {
        id: line?.id ?? String(leg?.routeShortName ?? ''),
        shortName: line?.shortName ?? String(leg?.routeShortName ?? ''),
        color: line?.color,
        textColor: line?.textColor,
      },
    }];
  });
}

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/** Minutes avant le départ, dites comme on les dit à voix haute. */
function departureLabel(start: number, language: 'fr' | 'en'): string {
  const isFr = language === 'fr';
  const minutes = Math.round((start - Date.now()) / MINUTE);
  if (minutes <= 0) return isFr ? 'Maintenant' : 'Now';
  if (minutes < 60) return isFr ? `Dans ${minutes} min` : `In ${minutes} min`;
  return isFr ? `À ${formatClock(start)}` : `At ${formatClock(start)}`;
}

/**
 * L'axe commun : son origine, sa longueur, ses graduations.
 *
 * L'origine est le premier départ, ramené au quart d'heure rond en dessous —
 * les graduations tombent alors sur des heures qu'on lit sans effort, 12:15,
 * 12:30, et le premier trajet démarre à quelques pixels du bord.
 */
function buildTimelineModel(journeys: RouteItinerary[]) {
  if (journeys.length === 0) return null;
  const bounds = journeys.map(journeyBounds);
  const firstStart = Math.min(...bounds.map(bound => bound.start));
  const origin = Math.floor(firstStart / (QUARTER * MINUTE)) * (QUARTER * MINUTE);
  const lastEnd = Math.max(...bounds.map(bound => bound.end));
  const spanMinutes = Math.max(30, Math.ceil((lastEnd - origin) / MINUTE / QUARTER) * QUARTER);
  const ticks = Array.from({ length: Math.floor(spanMinutes / QUARTER) + 1 }, (_, index) => ({
    left: index * QUARTER * PIXELS_PER_MINUTE,
    label: formatClock(origin + index * QUARTER * MINUTE),
  }));
  return { origin, width: spanMinutes * PIXELS_PER_MINUTE, ticks, bounds };
}

export function JourneyTimelineList({
  journeys,
  language,
  stops,
  lineLookup,
  theme = 'dark',
  selected,
  onSelect,
}: JourneyTimelineListProps) {
  const isLight = theme === 'light';

  /**
   * Une seule piste de défilement pour toute la liste.
   *
   * Elles étaient une par ligne, resynchronisées en JavaScript : sur un
   * téléphone, le doigt fait glisser la ligne touchée sur le fil du
   * compositeur pendant que les autres attendent le fil principal — d'où la
   * dérive d'une ligne sur l'autre. Une piste unique rend le problème
   * impossible : il n'y a plus rien à synchroniser.
   */
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const scrollLeftRef = useRef(0);
  const idleTimerRef = useRef<number | null>(null);
  /** Le prix s'efface pendant le geste : il gêne la lecture de la frise. */
  const [isScrolling, setIsScrolling] = useState(false);
  /** Fenêtre visible sur l'axe : elle dit quels trajets sont sortis par la gauche. */
  const [view, setView] = useState({ left: 0, width: 0 });

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const track = event.currentTarget;
    const left = track.scrollLeft;
    scrollLeftRef.current = left;
    setIsScrolling(true);
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => setIsScrolling(false), 320);
    setView({ left, width: track.clientWidth });
  }, []);

  /** Ramène l'axe sur un point donné. */
  const scrollTo = useCallback((left: number) => {
    const target = Math.max(0, left);
    scrollLeftRef.current = target;
    if (scrollerRef.current) scrollerRef.current.scrollLeft = target;
    setView(current => ({ ...current, left: target }));
  }, []);

  useEffect(() => () => {
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
  }, []);

  const model = useMemo(() => buildTimelineModel(journeys), [journeys]);

  /**
   * Les résultats se rafraîchissent tout seuls chaque minute : sans cela, le
   * trajet qu'on regardait reviendrait au début sous le doigt.
   */
  useLayoutEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollLeft = scrollLeftRef.current;
  }, [model]);

  if (!model) return null;

  const gridColor = isLight ? 'rgba(148,163,184,0.28)' : 'rgba(148,163,184,0.18)';
  const walkDotColor = isLight ? 'rgba(100,116,139,0.55)' : 'rgba(148,163,184,0.7)';
  const gridStyle = {
    backgroundImage: `repeating-linear-gradient(to right, ${gridColor} 0 1px, transparent 1px ${QUARTER * PIXELS_PER_MINUTE}px)`,
    backgroundPosition: `${EDGE_PADDING}px 0`,
  };
  const dividerClass = isLight ? 'border-slate-200' : 'border-slate-800';

  return (
    <div className="relative">
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="scrollbar-hide overflow-x-auto overflow-y-hidden"
      >
        <div style={{ width: model.width + EDGE_PADDING + TRAILING_SPACE }}>
          {/* La règle du temps. Sans filet au-dessus ni au-dessous : les heures
              se lisent mieux à l'air libre qu'enfermées entre deux traits. */}
          <div className="relative" style={{ height: RULER_HEIGHT }}>
            {model.ticks.map(tick => (
              /* L'heure est centrée sur son trait, et non posée à sa droite :
                 c'est la graduation qui porte l'heure, pas l'inverse. */
              <span
                key={tick.left}
                className="absolute top-1 -translate-x-1/2 text-[10px] font-semibold tabular text-slate-500"
                style={{ left: tick.left + EDGE_PADDING }}
              >
                {tick.label}
              </span>
            ))}
          </div>

          {journeys.map((journey, index) => {
            const { start, end } = model.bounds[index];
            const isSelected = selected != null
              && selected.dep === journey.dep
              && selected.arr === journey.arr
              && selected.dur === journey.dur;
            const brand = journeyOperatorBrand(journey, isLight ? 'light' : 'dark');
            const segments = journeySegments(journey, start, lineLookup, stops, brand?.chipColor, brand?.chipLogo);
            const departure = departureLabel(start, language);
            const barLeft = ((start - model.origin) / MINUTE) * PIXELS_PER_MINUTE + EDGE_PADDING;
            const barRight = ((end - model.origin) / MINUTE) * PIXELS_PER_MINUTE + EDGE_PADDING;
            /**
             * Une course de taxi ou de trottinette tient en quelques minutes,
             * donc en quelques dizaines de pixels : la durée, calée sur la fin
             * de la bande, venait alors s'écrire par-dessus l'heure de départ.
             * Faute de place entre les deux, elle passe à droite de la bande,
             * au-dessus de l'heure d'arrivée.
             */
            const neededRoom = (departure.length + journey.dur.length) * 7 + 20;
            const durationOutside = barRight - barLeft < neededRoom;

            return (
              <button
                key={`${journey.dep}-${index}`}
                type="button"
                onClick={() => onSelect?.(journey)}
                style={{ height: ROW_HEIGHT, borderTopWidth: index > 0 ? 1 : 0 }}
                className={`relative box-border block w-full py-3 text-left transition ${dividerClass} ${
                  isSelected ? 'bg-blue-500/10' : 'active:bg-blue-500/5'
                }`}
              >
                <div className="relative h-full" style={gridStyle}>
                  {/* L'heure de départ tient le début de la bande, la durée en
                      tient la fin : les deux voyagent avec le trajet plutôt que
                      de rester sur un bord de l'écran, et deux trajets décalés
                      se lisent l'un sous l'autre à leurs heures respectives. */}
                  <span
                    className="absolute top-0 whitespace-nowrap text-sm font-bold text-emerald-400"
                    style={{ left: barLeft }}
                  >
                    {departure}
                  </span>
                  <span
                    className={`absolute top-0 whitespace-nowrap text-sm font-extrabold ${
                      durationOutside ? '' : '-translate-x-full pl-2'
                    } ${isLight ? 'text-slate-900' : 'text-white'}`}
                    style={{ left: durationOutside ? barRight + 6 : barRight }}
                  >
                    {journey.dur}
                  </span>

                  {segments.map(segment => {
                    const left = ((segment.startMs - model.origin) / MINUTE) * PIXELS_PER_MINUTE + EDGE_PADDING;
                    const width = Math.max(6, ((segment.endMs - segment.startMs) / MINUTE) * PIXELS_PER_MINUTE);

                    if (segment.kind === 'walk') {
                      // La marche reste une traînée de points : c'est ce qui
                      // la distingue d'un tronçon roulé sans avoir à l'écrire.
                      return (
                        <span
                          key={segment.key}
                          className="absolute bottom-[15px] h-1.5"
                          style={{
                            left,
                            width,
                            backgroundImage: `radial-gradient(circle at center, ${walkDotColor} 3px, transparent 3.5px)`,
                            backgroundSize: '9px 6px',
                            backgroundRepeat: 'repeat-x',
                          }}
                        />
                      );
                    }

                    return (
                      <span
                        key={segment.key}
                        className="absolute bottom-0 flex h-9 items-center justify-center overflow-hidden rounded-xl px-1"
                        style={{ left, width, backgroundColor: segment.color }}
                      >
                        {segment.kind === 'operator' ? (
                          segment.logo && (
                            <img
                              src={segment.logo}
                              alt=""
                              className="max-h-5 w-auto max-w-full object-contain"
                            />
                          )
                        ) : (
                          segment.line && <LineBadge line={segment.line} size="sm" />
                        )}
                      </span>
                    );
                  })}

                  {/* Fin du trajet : sans elle, une bande qui s'arrête net se
                      confond avec une bande coupée par le bord de l'écran. */}
                  <span
                    className="absolute bottom-3 text-[10px] font-semibold tabular text-slate-500"
                    style={{ left: barRight + 6 }}
                  >
                    {formatClock(end)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/*
        Ce qui ne doit pas bouger vit hors de la piste : posé dedans, il
        suivrait le défilement avec une image de retard, et l'on verrait le prix
        flotter. Les lignes ayant toutes la même hauteur, leur ordonnée se
        calcule sans rien mesurer.
      */}
      <div className="pointer-events-none absolute inset-0">
        {journeys.map((journey, index) => {
          const { start, end } = model.bounds[index];
          const fareChip = journeyFareChip(journey, language);
          const barLeft = ((start - model.origin) / MINUTE) * PIXELS_PER_MINUTE + EDGE_PADDING;
          const barRight = ((end - model.origin) / MINUTE) * PIXELS_PER_MINUTE + EDGE_PADDING;
          /**
           * Poussé assez loin vers la droite, un trajet sort de l'écran par la
           * gauche et l'on ne sait plus qu'il existe : sa ligne garde alors un
           * rappel, qui le ramène d'une tape. Il attend l'arrêt du geste pour
           * paraître — pendant le mouvement, il flotterait lui aussi.
           */
          const isOutLeft = view.width > 0 && !isScrolling && barRight < view.left + 12;
          const top = RULER_HEIGHT + index * ROW_HEIGHT;

          return (
            <div key={`overlay-${journey.dep}-${index}`}>
              {fareChip && (
                <span
                  className={`absolute right-4 rounded-lg px-1.5 text-xs font-semibold text-slate-500 transition-opacity duration-200 ${
                    isLight ? 'bg-slate-50/90' : 'bg-slate-950/90'
                  } ${isScrolling ? 'opacity-0' : 'opacity-100'}`}
                  style={{ top: top + 12 }}
                >
                  {fareChip}
                </span>
              )}
              {isOutLeft && (
                <button
                  type="button"
                  onClick={() => scrollTo(barLeft - EDGE_PADDING)}
                  className={`pointer-events-auto absolute left-3 flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-xs font-bold shadow-lg transition active:scale-95 ${
                    isLight
                      ? 'border-slate-200 bg-white text-slate-700'
                      : 'border-slate-700 bg-slate-900 text-slate-200'
                  }`}
                  style={{ top: top + ROW_HEIGHT / 2 - 14 }}
                >
                  <ChevronLeftIcon className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="whitespace-nowrap">{departureLabel(start, language)}</span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
