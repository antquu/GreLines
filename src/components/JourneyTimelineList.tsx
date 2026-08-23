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
import { MdDirectionsBike } from 'react-icons/md';
import { LineBadge } from './LineBadge';
import { journeyFareChip } from '../utils/journeyFare';
import { journeyOperatorBrand } from '../utils/journeyOperator';
import { resolveRouteLine } from '../utils/routeLineResolver';
import type { RouteItinerary } from '../services/api';
import type { AllLinesLine } from '../services/allLines';

/**
 * Largeur d'une minute, et pas des graduations.
 *
 * Six pixels la minute conviennent à une heure de trajet, pas à dix minutes :
 * une course de trottinette tenait alors dans soixante pixels, et l'heure de
 * départ s'écrivait par-dessus la durée. L'échelle s'adapte donc à ce qu'il y a
 * à montrer — voir `buildTimelineModel`.
 */
const PIXELS_PER_MINUTE = 6;
/** Au-delà de cette largeur, on cesse d'étirer : la frise deviendrait un ruban. */
const MAX_PIXELS_PER_MINUTE = 22;
/** Largeur visée pour une frise courte, de l'ordre d'un écran de téléphone. */
const TARGET_WIDTH = 320;
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
/** Hauteur d'un intertitre, filet compris. */
const SECTION_HEIGHT = 46;

/**
 * Un groupe de trajets, sous son intertitre.
 *
 * « GreLines Trip » et « Autres options » ne sont pas d'autres frises : ce sont
 * des catégories posées sur la même. Séparées, chacune avait sa piste de
 * défilement et sa propre échelle — on poussait les trajets du réseau vers la
 * droite et les autres restaient où ils étaient, comme si les heures ne
 * voulaient plus dire la même chose d'un bloc à l'autre.
 */
export interface JourneySection {
  /** Sans libellé, le groupe s'ouvre sans intertitre : c'est le premier. */
  label?: string | null;
  journeys: RouteItinerary[];
}

interface JourneyTimelineListProps {
  /** Une liste simple. Équivaut à une section unique et sans titre. */
  journeys?: RouteItinerary[];
  sections?: JourneySection[];
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
  kind: 'walk' | 'transit' | 'operator' | 'bike';
  color?: string;
  logo?: string;
  line?: { id: string; shortName?: string; color?: string; textColor?: string };
}

/**
 * Les modes qu'on emprunte par soi-même : ni ligne, ni horaire, ni opérateur.
 * Seul le vélo apparaît aujourd'hui, les autres sont là pour ne pas retomber
 * dans le cas général le jour où l'API en renverra.
 */
const SELF_POWERED = new Set(['BICYCLE', 'BICYCLE_RENT', 'SCOOTER', 'MICROMOBILITY', 'MICROMOBILITY_RENT']);
/** Le vert du vélo — celui des mobilités douces dans toute l'application. */
const BIKE_COLOR = '#22c55e';

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

    /*
     * Le vélo a sa bande à lui.
     *
     * Sans elle, il tombait dans le cas général : une bande grise sans nom de
     * ligne, indiscernable d'un tronçon dont on n'aurait pas su lire le
     * réseau. C'est pourtant la moitié de l'intérêt d'un GreLines Trip, et ce
     * qui distingue ce trajet des autres — il mérite sa couleur et son
     * pictogramme, au même titre qu'une ligne porte son numéro.
     */
    if (SELF_POWERED.has(String(leg?.mode ?? '').toUpperCase())) {
      return [{ key: `bike-${index}`, startMs: legStart, endMs: legEnd, kind: 'bike', color: BIKE_COLOR }];
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
  const lastEnd = Math.max(...bounds.map(bound => bound.end));
  const rawMinutes = Math.max(1, (lastEnd - firstStart) / MINUTE);

  /*
   * Le pas des graduations suit la durée montrée.
   *
   * Un quart d'heure ne veut rien dire sur une frise de dix minutes : il n'y
   * tient qu'une seule graduation, et tous les trajets se tassent dans le
   * premier tiers. On descend donc à cinq minutes, puis à dix, avant de revenir
   * au quart d'heure quand il y a une heure à couvrir.
   */
  const step = rawMinutes <= 20 ? 5 : rawMinutes <= 45 ? 10 : QUARTER;

  const origin = Math.floor(firstStart / (step * MINUTE)) * (step * MINUTE);
  const spanMinutes = Math.max(step * 2, Math.ceil((lastEnd - origin) / MINUTE / step) * step);

  /*
   * Puis l'échelle s'étire pour occuper la largeur.
   *
   * Sans cela, une frise courte reste courte : les bandes font quelques dizaines
   * de pixels, les heures se chevauchent, et l'on ne distingue plus un trajet de
   * neuf minutes d'un trajet de treize. On vise donc une largeur d'écran, sans
   * jamais descendre sous l'échelle de base ni dépasser un plafond.
   */
  const pixelsPerMinute = Math.min(
    MAX_PIXELS_PER_MINUTE,
    Math.max(PIXELS_PER_MINUTE, TARGET_WIDTH / spanMinutes),
  );

  const ticks = Array.from({ length: Math.floor(spanMinutes / step) + 1 }, (_, index) => ({
    left: index * step * pixelsPerMinute,
    label: formatClock(origin + index * step * MINUTE),
  }));

  return {
    origin,
    width: spanMinutes * pixelsPerMinute,
    ticks,
    bounds,
    pixelsPerMinute,
    step,
  };
}

export function JourneyTimelineList({
  journeys,
  sections,
  language,
  stops,
  lineLookup,
  theme = 'dark',
  selected,
  onSelect,
}: JourneyTimelineListProps) {
  const isLight = theme === 'light';

  /*
   * Les groupes, à plat.
   *
   * Chaque trajet garde le rang qu'il occupe dans la frise entière : c'est ce
   * rang qui décide de son ordonnée, et donc de l'endroit où son prix se pose
   * dans la couche fixe. Les intertitres comptent dans le calcul, sans quoi
   * tout ce qui les suit se retrouverait décalé d'un titre.
   */
  const groups = useMemo<JourneySection[]>(
    () => (sections ?? [{ label: null, journeys: journeys ?? [] }]).filter(group => group.journeys.length > 0),
    [sections, journeys],
  );
  const allJourneys = useMemo(() => groups.flatMap(group => group.journeys), [groups]);
  /** Le rang du premier trajet de chaque groupe, dans `allJourneys`. */
  const rowOffsets = useMemo(() => {
    const offsets: number[] = [];
    let seen = 0;
    for (const group of groups) {
      offsets.push(seen);
      seen += group.journeys.length;
    }
    return offsets;
  }, [groups]);
  /** L'ordonnée de chaque trajet, titres compris, dans l'ordre de `allJourneys`. */
  const rowTops = useMemo(() => {
    const tops: number[] = [];
    let offset = RULER_HEIGHT;
    for (const group of groups) {
      if (group.label) offset += SECTION_HEIGHT;
      for (let i = 0; i < group.journeys.length; i += 1) {
        tops.push(offset);
        offset += ROW_HEIGHT;
      }
    }
    return tops;
  }, [groups]);

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

  const model = useMemo(() => buildTimelineModel(allJourneys), [allJourneys]);

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
    backgroundImage: `repeating-linear-gradient(to right, ${gridColor} 0 1px, transparent 1px ${(model?.step ?? QUARTER) * (model?.pixelsPerMinute ?? PIXELS_PER_MINUTE)}px)`,
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

          {groups.map((group, groupIndex) => (
            <div key={`group-${groupIndex}`}>
              {/*
                L'intertitre reste collé au bord gauche pendant qu'on fait
                glisser les heures : posé dans la piste, il partirait avec elles
                et l'on ne saurait plus ce qu'on regarde. Le filet, lui, court
                sur toute la largeur — c'est le même tableau, on y pose juste
                une catégorie.
              */}
              {group.label && (
                <div className="relative" style={{ height: SECTION_HEIGHT }}>
                  <div className="sticky left-0 w-fit px-4 pt-4">
                    <p className={`text-sm font-semibold ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                      {group.label}
                    </p>
                  </div>
                  <div className={`absolute inset-x-0 bottom-1 h-px ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`} />
                </div>
              )}
              {group.journeys.map((journey, indexInGroup) => {
            const index = rowOffsets[groupIndex] + indexInGroup;
            const { start, end } = model.bounds[index];
            const isSelected = selected != null
              && selected.dep === journey.dep
              && selected.arr === journey.arr
              && selected.dur === journey.dur;
            const brand = journeyOperatorBrand(journey, isLight ? 'light' : 'dark');
            const segments = journeySegments(journey, start, lineLookup, stops, brand?.chipColor, brand?.chipLogo);
            const departure = departureLabel(start, language);
            const barLeft = ((start - model.origin) / MINUTE) * model.pixelsPerMinute + EDGE_PADDING;
            const barRight = ((end - model.origin) / MINUTE) * model.pixelsPerMinute + EDGE_PADDING;
            /**
             * Une course de taxi ou de trottinette tient en quelques minutes,
             * donc en quelques dizaines de pixels : la durée, calée sur la fin
             * de la bande, venait alors s'écrire par-dessus l'heure de départ.
             * Faute de place entre les deux, elle passe à droite de la bande,
             * au-dessus de l'heure d'arrivée.
             */
            /*
             * Où poser la durée.
             *
             * Calée sur la fin de la bande, elle s'écrivait par-dessus l'heure
             * de départ dès que le trajet était court — « Maintenant » fait
             * quatre-vingts pixels, une course de neuf minutes en fait à peine
             * plus. Quand la bande est trop étroite, la durée passe donc à
             * droite, et jamais avant la fin du texte de départ : c'est le plus
             * à droite des deux qui décide.
             */
            const departureWidth = departure.length * 7;
            const neededRoom = (departure.length + journey.dur.length) * 7 + 20;
            const durationOutside = barRight - barLeft < neededRoom;
            const durationLeft = durationOutside
              ? Math.max(barRight + 6, barLeft + departureWidth + 10)
              : barRight;

            return (
              <button
                key={`${journey.dep}-${index}`}
                type="button"
                onClick={() => onSelect?.(journey)}
                style={{ height: ROW_HEIGHT, borderTopWidth: indexInGroup > 0 ? 1 : 0 }}
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
                    style={{ left: durationLeft }}
                  >
                    {journey.dur}
                  </span>

                  {segments.map(segment => {
                    const left = ((segment.startMs - model.origin) / MINUTE) * model.pixelsPerMinute + EDGE_PADDING;
                    const width = Math.max(6, ((segment.endMs - segment.startMs) / MINUTE) * model.pixelsPerMinute);

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
                        ) : segment.kind === 'bike' ? (
                          /* Le même gabarit qu'un badge de ligne : un carré aux
                             angles adoucis, le pictogramme en blanc dedans. Le
                             vélo se lit ainsi dans la frise comme se lit un
                             numéro de tram, sans qu'on ait à le déchiffrer. */
                          <span
                            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
                            style={{ backgroundColor: BIKE_COLOR }}
                            aria-label={language === 'fr' ? 'À vélo' : 'By bike'}
                          >
                            <MdDirectionsBike size={18} color="#ffffff" />
                          </span>
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
          ))}
        </div>
      </div>

      {/*
        Ce qui ne doit pas bouger vit hors de la piste : posé dedans, il
        suivrait le défilement avec une image de retard, et l'on verrait le prix
        flotter. Les lignes ayant toutes la même hauteur, leur ordonnée se
        calcule sans rien mesurer.
      */}
      <div className="pointer-events-none absolute inset-0">
        {allJourneys.map((journey, index) => {
          const { start, end } = model.bounds[index];
          const fareChip = journeyFareChip(journey, language);
          const barLeft = ((start - model.origin) / MINUTE) * model.pixelsPerMinute + EDGE_PADDING;
          const barRight = ((end - model.origin) / MINUTE) * model.pixelsPerMinute + EDGE_PADDING;
          /**
           * Poussé assez loin vers la droite, un trajet sort de l'écran par la
           * gauche et l'on ne sait plus qu'il existe : sa ligne garde alors un
           * rappel, qui le ramène d'une tape. Il attend l'arrêt du geste pour
           * paraître — pendant le mouvement, il flotterait lui aussi.
           */
          const isOutLeft = view.width > 0 && !isScrolling && barRight < view.left + 12;
          const top = rowTops[index] ?? RULER_HEIGHT + index * ROW_HEIGHT;

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
