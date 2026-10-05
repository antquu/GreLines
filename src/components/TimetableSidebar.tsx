import { isForeignLineId } from '../utils/foreignNetworks';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon, ChevronLeftIcon, ChevronRightIcon, ArrowsRightLeftIcon, PaperClipIcon } from '@heroicons/react/24/solid';
import { LineBadge } from './LineBadge';
import { resolveLineStyle } from '../utils/lineColors';
import { LastRunRibbon } from './LastRunRibbon';
import { MarqueeText } from './MarqueeText';
import { getForeignTimetable } from '../services/foreignTimetable';
import { getTimetable, formatTimetableTime, toTimetableRouteId, type Timetable, type TimetableDirection } from '../services/timetable';
import type { Line } from '../types';
import { sameStationName } from '../services/sncfNetwork';
import { t } from '../i18n';

interface TimetableSidebarProps {
  isOpen: boolean;
  onClose: () => void;

  line: Pick<Line, 'id' | 'shortName' | 'color' | 'textColor'> | null;

  preferredHeadsign?: string | null;

  highlightStopName?: string | null;
  stopId?: string | null;
  isMobile: boolean;
  language: 'fr' | 'en';

  onOpenLineMap?: () => void;
}

const getText = (language: 'fr' | 'en') => t(language).timetable;

const ROW_HEIGHT = 46;
const PER_PAGE = 3;
const NAME_WIDTH = 148;

function secondsSinceMidnight(): number {
  const now = new Date();
  return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
}

function TimetableGrid({
  direction,
  lineColor,
  text,
  language,
  highlightStopName,
}: {
  direction: TimetableDirection;
  lineColor: string;
  text: ReturnType<typeof getText>;
  language: 'fr' | 'en';
  highlightStopName?: string | null;
}) {
  const stops = direction.stops;

  const trips = useMemo(() => {
    const width = stops.reduce((most, stop) => Math.max(most, stop.times.length), 0);
    const kept: number[] = [];
    for (let index = 0; index < width; index += 1) {
      if (stops.some(stop => typeof stop.times[index] === 'number')) kept.push(index);
    }
    return kept;
  }, [stops]);
  const tripCount = trips.length;
  const pageCount = Math.max(1, Math.ceil(tripCount / PER_PAGE));

  const upcomingIndex = useMemo(() => {
    const now = secondsSinceMidnight();
    const found = trips.findIndex(trip => {
      for (const stop of stops) {
        const time = stop.times[trip];
        if (typeof time === 'number') return time % 86400 >= now;
      }
      return false;
    });
    return found >= 0 ? found : Math.max(0, tripCount - 1);
  }, [stops, trips, tripCount]);

  const [page, setPage] = useState(() => Math.floor(upcomingIndex / PER_PAGE));
  useEffect(() => {
    setPage(Math.floor(upcomingIndex / PER_PAGE));
  }, [upcomingIndex, direction.key]);

  const safePage = Math.min(page, pageCount - 1);
  const firstTrip = safePage * PER_PAGE;
  const visiblePositions = Array.from(
    { length: Math.max(0, Math.min(PER_PAGE, tripCount - firstTrip)) },
    (_, offset) => firstTrip + offset,
  );
  const visibleTrips = visiblePositions.map(position => trips[position]);

  const rangeLabel = useMemo(() => {
    const starts = visibleTrips
      .map(index => {
        for (const stop of stops) {
          const time = stop.times[index];
          if (typeof time === 'number') return time;
        }
        return null;
      })
      .filter((time): time is number => time !== null);
    if (starts.length === 0) return '';
    const first = formatTimetableTime(starts[0]);
    const last = formatTimetableTime(starts[starts.length - 1]);
    return first === last ? first : `${first} – ${last}`;
  }, [stops, visibleTrips.join(',')]);

  const normalizedHighlight = highlightStopName?.trim().toLowerCase() ?? '';

  if (tripCount === 0) {
    return <p className="py-8 text-sm text-slate-400">{text.noTimes}</p>;
  }

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setPage(current => Math.max(0, current - 1))}
          disabled={safePage === 0}
          aria-label={text.previousTimes}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-800 text-slate-300 transition hover:bg-slate-700 hover:text-white disabled:opacity-25 disabled:hover:bg-slate-800"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <span className="flex min-w-0 items-center gap-2">
          <span className="tabular truncate text-sm font-semibold text-slate-200">{rangeLabel}</span>
          {visiblePositions.includes(tripCount - 1) && <LastRunRibbon language={language} />}
        </span>
        <button
          type="button"
          onClick={() => setPage(current => Math.min(pageCount - 1, current + 1))}
          disabled={safePage >= pageCount - 1}
          aria-label={text.nextTimes}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-800 text-slate-300 transition hover:bg-slate-700 hover:text-white disabled:opacity-25 disabled:hover:bg-slate-800"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="flex overflow-hidden rounded-2xl border border-slate-800">
        <div className="flex-shrink-0 border-r border-slate-800" style={{ width: NAME_WIDTH }}>
          {stops.map((stop, index) => {
            const isEdge = index === 0 || index === stops.length - 1;
            const isHighlighted =
              normalizedHighlight.length > 0 && stop.name.trim().toLowerCase() === normalizedHighlight;
            return (
              <div
                key={stop.id}
                className={`relative flex items-center gap-2.5 pl-3 pr-2 ${
                  index % 2 === 1 ? 'bg-slate-900/40' : ''
                } ${isHighlighted ? 'bg-blue-500/10' : ''}`}
                style={{ height: ROW_HEIGHT }}
              >
                <span className="relative w-3 flex-shrink-0 self-stretch" aria-hidden="true">
                  <span
                    className="absolute left-1/2 w-[3px] -translate-x-1/2"
                    style={{
                      backgroundColor: lineColor,
                      top: index === 0 ? '50%' : 0,
                      bottom: index === stops.length - 1 ? '50%' : 0,
                    }}
                  />
                  <span
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px]"
                    style={{
                      borderColor: lineColor,
                      backgroundColor: isEdge ? lineColor : 'var(--gl-sheet-bg)',
                      width: isEdge ? 12 : 10,
                      height: isEdge ? 12 : 10,
                    }}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  {stop.city && (
                    <MarqueeText
                      text={stop.city}
                      className="text-[0.625rem] leading-tight text-slate-500"
                      gap={24}
                    />
                  )}
                  <MarqueeText
                    text={stop.name}
                    className="text-[0.8125rem] font-semibold leading-tight text-white"
                    gap={24}
                  />
                </span>
              </div>
            );
          })}
        </div>

        <div className="min-w-0 flex-1">
          {stops.map((stop, rowIndex) => {
            const isHighlighted =
              normalizedHighlight.length > 0 && stop.name.trim().toLowerCase() === normalizedHighlight;
            return (
              <div
                key={stop.id}
                className={`flex ${rowIndex % 2 === 1 ? 'bg-slate-900/40' : ''} ${
                  isHighlighted ? 'bg-blue-500/10' : ''
                }`}
                style={{ height: ROW_HEIGHT }}
              >
                {visiblePositions.map(position => {
                  const time = stop.times[trips[position]];
                  const isUpcoming = position === upcomingIndex;
                  return (
                    <span
                      key={position}
                      className={`tabular flex min-w-0 flex-1 items-center justify-center text-[0.8125rem] ${
                        isUpcoming ? 'font-bold text-white' : 'text-slate-400'
                      }`}
                      style={{
                        backgroundColor: isUpcoming ? 'rgba(37,99,235,0.16)' : undefined,
                      }}
                    >
                      {typeof time === 'number' ? formatTimetableTime(time) : '·'}
                    </span>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type TrainRow = {
  index: number;
  at: number;
  label?: string;
  destination: string;
  arrival: number;
  calls: Array<{ name: string; time: number }>;
  startsHere: boolean;
};

const shortName = (name: string) => name.split(' - ')[0];

function TrainList({
  direction,
  lineColor,
  text,
  highlightStopName,
  isTrain,
}: {
  direction: TimetableDirection;
  lineColor: string;
  text: ReturnType<typeof getText>;
  highlightStopName?: string | null;
  isTrain: boolean;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const nextRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    setOpenIndex(null);
  }, [direction.key]);

  const boarding = useMemo(() => {
    if (!highlightStopName) return -1;
    return direction.stops.findIndex(stop =>
      stop.name.trim().toLowerCase() === highlightStopName.trim().toLowerCase() ||
      sameStationName(highlightStopName, stop.name) || sameStationName(stop.name, highlightStopName));
  }, [direction.stops, highlightStopName]);

  const rows = useMemo(() => {
    const list: TrainRow[] = [];
    (direction.trips ?? []).forEach((info, index) => {
      const served = direction.stops
        .map((stop, position) => ({ position, name: stop.name, time: stop.times[index] }))
        .filter((call): call is { position: number; name: string; time: number } => typeof call.time === 'number');
      if (served.length < 2) return;
      const from = boarding >= 0 ? served.findIndex(call => call.position === boarding) : 0;
      if (from < 0 || from === served.length - 1) return;
      list.push({
        index,
        at: served[from].time,
        label: info.label,
        destination: info.destination,
        arrival: served[served.length - 1].time,
        calls: served.slice(from).map(call => ({ name: call.name, time: call.time })),
        startsHere: from === 0,
      });
    });
    return list.sort((a, b) => a.at - b.at);
  }, [direction, boarding]);

  const now = secondsSinceMidnight();
  const nextIndex = rows.find(row => row.at >= now - 60)?.index;

  useEffect(() => {
    const frame = requestAnimationFrame(() => nextRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    return () => cancelAnimationFrame(frame);
  }, [direction.key, nextIndex]);

  return (
    <div className="mt-1">
      {rows.length === 0 ? (
        <p className="py-8 text-sm text-slate-400">{text.noRuns(isTrain)}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map(row => {
            const isNext = row.index === nextIndex;
            const isOpen = openIndex === row.index;
            const endsEarly = row.destination !== direction.headsign;
            return (
              <li
                key={row.index}
                ref={isNext ? nextRef : undefined}
                className={`overflow-hidden rounded-2xl border ${
                  isNext ? 'border-blue-500/60 bg-blue-500/10' : 'border-slate-800 bg-slate-800/50'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : row.index)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-3 px-3 py-3 text-left"
                >
                  <span className="tabular w-14 flex-shrink-0 text-xl font-bold text-white">{formatTimetableTime(row.at)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="flex-shrink-0 text-xs text-slate-400">{text.towards}</span>
                      <span className={`truncate text-sm font-semibold ${endsEarly ? 'text-amber-300' : 'text-white'}`}>
                        {shortName(row.destination)}
                      </span>
                      {isNext && (
                        <span className="flex-shrink-0 rounded bg-blue-600 px-1.5 py-0.5 text-[0.625rem] font-bold uppercase leading-none text-white">
                          {text.next}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                      {row.label ? `${text.trainNumber(row.label)} · ` : ''}{text.arrival(formatTimetableTime(row.arrival))}
                    </span>
                  </span>
                  <ChevronRightIcon className={`h-4 w-4 flex-shrink-0 text-slate-500 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                </button>
                <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    key="stops"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
                    className="overflow-hidden"
                  >
                  <div className="border-t border-slate-800 px-3 pb-3 pt-2">
                    <ol>
                      {row.calls.map((call, position) => {
                        const continued = position === 0 && !row.startsHere;
                        const edge = (position === 0 && row.startsHere) || position === row.calls.length - 1;
                        return (
                          <li key={`${call.name}-${position}`} className="flex items-center gap-3" style={{ height: 34 }}>
                            <span className="tabular w-12 flex-shrink-0 text-sm text-slate-300">{formatTimetableTime(call.time)}</span>
                            <span className="relative w-3 flex-shrink-0 self-stretch" aria-hidden="true">
                              <span
                                className="absolute left-1/2 w-[3px] -translate-x-1/2"
                                style={{
                                  backgroundColor: lineColor,
                                  top: continued ? -8 : position === 0 ? '50%' : 0,
                                  bottom: position === row.calls.length - 1 ? '50%' : 0,
                                }}
                              />
                              <span
                                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px]"
                                style={{
                                  borderColor: lineColor,
                                  backgroundColor: edge ? lineColor : 'var(--gl-sheet-bg)',
                                  width: edge ? 12 : 10,
                                  height: edge ? 12 : 10,
                                }}
                              />
                            </span>
                            <span className={`min-w-0 flex-1 truncate text-sm ${edge ? 'font-semibold text-white' : 'text-slate-300'}`}>
                              {call.name}
                            </span>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                  </motion.div>
                )}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function DirectionSwitch({
  directions,
  activeKey,
  onSelect,
  towards,
}: {
  towards: string;
  directions: TimetableDirection[];
  activeKey: string | null | undefined;
  onSelect: (key: string) => void;
}) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const measure = () => {
      const active = bar.querySelector<HTMLButtonElement>('[data-active="true"]');
      if (!active) return;
      setPill({ left: active.offsetLeft, width: active.offsetWidth });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => observer.disconnect();
  }, [activeKey, directions]);

  return (
    <div
      ref={barRef}
      className="relative mt-5 flex rounded-2xl border border-slate-800 bg-slate-900/60 p-1"
    >
      {pill && (
        <span
          aria-hidden="true"
          className="absolute bottom-1 top-1 rounded-xl bg-blue-600 transition-[left,width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
          style={{ left: pill.left, width: pill.width }}
        />
      )}
      {directions.map(item => {
        const active = item.key === activeKey;
        return (
          <button
            key={item.key}
            type="button"
            data-active={active}
            onClick={() => onSelect(item.key)}
            aria-pressed={active}
            className={`relative z-10 min-w-0 flex-1 truncate rounded-xl px-3 py-2 text-[0.8125rem] font-semibold transition-colors duration-200 ${
              active ? 'text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {directions.some(entry => entry.trips) ? `${towards} ${shortName(item.headsign)}` : item.headsign}
          </button>
        );
      })}
    </div>
  );
}

export function TimetableSidebar({
  isOpen,
  onClose,
  line,
  preferredHeadsign,
  highlightStopName,
  stopId,
  isMobile,
  language,
  onOpenLineMap,
}: TimetableSidebarProps) {
  const text = getText(language);
  const [timetable, setTimetable] = useState<Timetable | null>(null);
  const [loading, setLoading] = useState(false);
  const [directionKey, setDirectionKey] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !line) return;
    let active = true;
    const controller = new AbortController();

    queueMicrotask(() => {
      if (!active) return;
      setLoading(true);
      setTimetable(null);
    });
    const request = isForeignLineId(line.id)
      ? getForeignTimetable(line.id, stopId, highlightStopName ?? undefined)
      : getTimetable(toTimetableRouteId(line.shortName || line.id), { signal: controller.signal });
    request
      .then(result => {
        if (!active) return;
        setTimetable(result);
        const match = preferredHeadsign
          ? result?.directions.find(direction =>
              [direction.headsign, ...(direction.destinations ?? [])].some(name =>
                preferredHeadsign.toLowerCase().includes(name.toLowerCase()) ||
                name.toLowerCase().includes(preferredHeadsign.toLowerCase())))
          : null;
        setDirectionKey(match?.key ?? result?.directions[0]?.key ?? null);
      })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; controller.abort(); };
  }, [isOpen, line?.id, line?.shortName, preferredHeadsign, stopId, highlightStopName]);

  const direction = timetable?.directions.find(item => item.key === directionKey) ?? timetable?.directions[0];
  const lineStyle = line ? resolveLineStyle(line.id, line.color, line.textColor) : {};
  const lineColor = (lineStyle as { backgroundColor?: string }).backgroundColor || '#475569';
  const routeName = useMemo(() => {
    const ends = [...new Set((timetable?.directions ?? []).map(item => shortName(item.headsign)).filter(Boolean))];
    if (ends.length >= 2) return [ends[0], ends[1]];
    const only = timetable?.directions[0];
    const start = only?.stops[0]?.name;
    if (only && start && start !== only.headsign) return [shortName(start), shortName(only.headsign)];
    return ends[0] ? [ends[0]] : [];
  }, [timetable]);

  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {line && <span className="flex-shrink-0"><LineBadge line={line} size="md" /></span>}
          {routeName.length > 0 && (
            <p className="flex min-w-0 flex-wrap items-center gap-x-2 text-lg font-bold leading-tight text-white">
              <span>{routeName[0]}</span>
              {routeName[1] && (
                <>
                  <ArrowsRightLeftIcon className="h-4 w-4 flex-shrink-0 text-slate-400" aria-hidden="true" />
                  <span>{routeName[1]}</span>
                </>
              )}
            </p>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {onOpenLineMap && (
          <button
            onClick={onOpenLineMap}
            aria-label={text.lineMap}
            title={text.lineMap}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-slate-300 transition hover:bg-slate-700 hover:text-white"
          >
            <PaperClipIcon className="h-4 w-4" />
          </button>
          )}
          <button
            onClick={onClose}
            aria-label={text.close}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-slate-300 transition hover:bg-slate-700 hover:text-white"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {timetable && timetable.directions.length > 1 && (
        <DirectionSwitch
          directions={timetable.directions}
          activeKey={direction?.key}
          onSelect={setDirectionKey}
          towards={text.towardsTab}
        />
      )}

      {loading ? (
        <p className="py-8 text-sm text-slate-400">{text.loading}</p>
      ) : !direction ? (
        <p className="py-8 text-sm leading-relaxed text-slate-500">{text.empty}</p>
      ) : direction.trips ? (
        <TrainList
          direction={direction}
          lineColor={lineColor}
          text={text}
          highlightStopName={highlightStopName}
          isTrain={line?.id.startsWith('SNC:') ?? false}
        />
      ) : (
        <TimetableGrid
          direction={direction}
          lineColor={lineColor}
          text={text}
          language={language}
          highlightStopName={highlightStopName}
        />
      )}
    </>
  );

  if (!isMobile) {
    return (
      <AnimatePresence>
        {isOpen && line && (
          <>
            <motion.div
              key="timetable-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={onClose}
              className="fixed inset-0 z-[52] bg-slate-950/40 backdrop-blur-sm"
            />
            <motion.div
              key="timetable-panel"
              initial={{ x: -420, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -420, opacity: 0 }}
              transition={{ duration: 0.28, ease: 'easeOut' }}
              className="fixed left-96 top-0 z-[55] h-screen w-96 overflow-y-auto overflow-x-hidden border-r border-slate-800 bg-slate-900 shadow-2xl"
            >
              <div className="p-6 pb-12">{body}</div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && line && (
        <motion.div
          key="timetable-fullscreen"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="fixed inset-0 z-[110] flex flex-col"
          style={{ backgroundColor: 'var(--gl-sheet-bg)' }}
        >
          <div
            className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 pb-12"
            style={{
              paddingTop: 'max(1rem, calc(var(--gl-safe-top) + 4px))',
            }}
          >
            {body}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
