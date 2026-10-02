import { formatDurationLabel } from '../utils/formatDuration';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeftIcon } from '@heroicons/react/24/solid';
import { MdDirectionsBike } from 'react-icons/md';
import { LineBadge } from './LineBadge';
import { journeyFareChip } from '../utils/journeyFare';
import { FaWheelchair } from 'react-icons/fa';
import { useAccessibleStops } from '../hooks/useAccessibleStops';
import { isJourneyStepFree } from '../services/stopAccessibility';
import { journeyOperatorBrand } from '../utils/journeyOperator';
import { resolveRouteLine } from '../utils/routeLineResolver';
import type { RouteItinerary } from '../services/api';
import type { AllLinesLine } from '../services/allLines';

const PIXELS_PER_MINUTE = 6;
const MAX_PIXELS_PER_MINUTE = 22;
const TARGET_WIDTH = 320;
const QUARTER = 15;
const MINUTE = 60_000;

const EDGE_PADDING = 16;
const TRAILING_SPACE = 96;
const RULER_HEIGHT = 26;
const ROW_HEIGHT = 80;
const SECTION_HEIGHT = 46;

export interface JourneySection {
  label?: string | null;
  journeys: RouteItinerary[];
}

interface JourneyTimelineListProps {
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

const SELF_POWERED = new Set(['BICYCLE', 'BICYCLE_RENT', 'SCOOTER', 'MICROMOBILITY', 'MICROMOBILITY_RENT']);
const BIKE_COLOR = '#22c55e';

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

function departureLabel(start: number, language: 'fr' | 'en'): string {
  const isFr = language === 'fr';
  const minutes = Math.round((start - Date.now()) / MINUTE);
  if (minutes <= 0) return isFr ? 'Maintenant' : 'Now';
  if (minutes < 60) return isFr ? `Dans ${minutes} min` : `In ${minutes} min`;
  return isFr ? `À ${formatClock(start)}` : `At ${formatClock(start)}`;
}

function buildTimelineModel(journeys: RouteItinerary[]) {
  if (journeys.length === 0) return null;
  const bounds = journeys.map(journeyBounds);
  const firstStart = Math.min(...bounds.map(bound => bound.start));
  const lastEnd = Math.max(...bounds.map(bound => bound.end));
  const rawMinutes = Math.max(1, (lastEnd - firstStart) / MINUTE);

  const step = rawMinutes <= 20 ? 5 : rawMinutes <= 45 ? 10 : QUARTER;

  const origin = Math.floor(firstStart / (step * MINUTE)) * (step * MINUTE);
  const spanMinutes = Math.max(step * 2, Math.ceil((lastEnd - origin) / MINUTE / step) * step);

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
  const accessibleStops = useAccessibleStops();

  const groups = useMemo<JourneySection[]>(
    () => (sections ?? [{ label: null, journeys: journeys ?? [] }]).filter(group => group.journeys.length > 0),
    [sections, journeys],
  );
  const allJourneys = useMemo(() => groups.flatMap(group => group.journeys), [groups]);
  const rowOffsets = useMemo(() => {
    const offsets: number[] = [];
    let seen = 0;
    for (const group of groups) {
      offsets.push(seen);
      seen += group.journeys.length;
    }
    return offsets;
  }, [groups]);
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

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const scrollLeftRef = useRef(0);
  const idleTimerRef = useRef<number | null>(null);
  const [isScrolling, setIsScrolling] = useState(false);
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
          <div className="relative" style={{ height: RULER_HEIGHT }}>
            {model.ticks.map(tick => (
              <span
                key={tick.left}
                className="absolute top-1 -translate-x-1/2 text-[0.625rem] font-semibold tabular text-slate-500"
                style={{ left: tick.left + EDGE_PADDING }}
              >
                {tick.label}
              </span>
            ))}
          </div>

          {groups.map((group, groupIndex) => (
            <div key={`group-${groupIndex}`}>
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
            const departureWidth = departure.length * 7;
            const neededRoom = (departure.length + formatDurationLabel(journey.dur).length) * 7 + 20;
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
                    {formatDurationLabel(journey.dur)}
                  </span>

                  {segments.map(segment => {
                    const left = ((segment.startMs - model.origin) / MINUTE) * model.pixelsPerMinute + EDGE_PADDING;
                    const width = Math.max(6, ((segment.endMs - segment.startMs) / MINUTE) * model.pixelsPerMinute);

                    if (segment.kind === 'walk') {
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

                  <span
                    className="absolute bottom-3 text-[0.625rem] font-semibold tabular text-slate-500"
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

      <div className="pointer-events-none absolute inset-0">
        {allJourneys.map((journey, index) => {
          const { start, end } = model.bounds[index];
          const fareChip = journeyFareChip(journey, language);
          const stepFree = isJourneyStepFree(accessibleStops, journey.allLegs);
          const barLeft = ((start - model.origin) / MINUTE) * model.pixelsPerMinute + EDGE_PADDING;
          const barRight = ((end - model.origin) / MINUTE) * model.pixelsPerMinute + EDGE_PADDING;
          const isOutLeft = view.width > 0 && !isScrolling && barRight < view.left + 12;
          const top = rowTops[index] ?? RULER_HEIGHT + index * ROW_HEIGHT;

          return (
            <div key={`overlay-${journey.dep}-${index}`}>
              {(fareChip || stepFree) && (
                <span
                  className={`absolute right-4 flex items-center gap-1 rounded-lg px-1.5 text-xs font-semibold text-slate-500 transition-opacity duration-200 ${
                    isLight ? 'bg-slate-50/90' : 'bg-slate-950/90'
                  } ${isScrolling ? 'opacity-0' : 'opacity-100'}`}
                  style={{ top: top + 12 }}
                >
                  {stepFree && <FaWheelchair className="h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />}
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
