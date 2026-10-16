import { forwardRef, useMemo, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sheet, type SheetRef } from 'react-modal-sheet';
import { ChevronRightIcon, UserIcon } from '@heroicons/react/24/solid';
import { MinusCircleIcon, PlusCircleIcon } from '@heroicons/react/24/outline';
import { FaWalking } from 'react-icons/fa';
import { MapSheet, MapSheetBody, MapSheetBottomSpacer, MapSheetShell, SHEET_PADDING, SmoothSheetContent } from '../MapSheet';
import { LineBadge } from '../LineBadge';
import { RealtimeWifi } from '../RealtimeWifi';
import { COLLAPSED_SHEET_PX, type NavPalette } from './palette';
import type { ShareStop, ShareTimelineStep } from '../../services/tripShare';

export interface NavLine {
  id: string;
  shortName: string;
  color: string;
  textColor: string;
}

export function LinePlate({ line, size = 'sm' }: { line: NavLine; size?: 'xs' | 'sm' | 'md' | 'lg' }) {
  return (
    <LineBadge
      line={{ id: line.id, shortName: line.shortName, color: line.color, textColor: line.textColor, routeId: line.id }}
      size={size}
    />
  );
}

export const GuidanceSheet = forwardRef<
  SheetRef,
  {
    isLight: boolean;
    zIndex: number;
    header: ReactNode;
    children: ReactNode;
    onOpenEnd?: () => void;
    onSnap?: (index: number) => void;
  }
>(function GuidanceSheet({ isLight, zIndex, header, children, onOpenEnd, onSnap }, ref) {
  const snapPoints = useMemo(() => [0, COLLAPSED_SHEET_PX, 0.52, 1], []);
  return (
    <Sheet
      ref={ref}
      isOpen
      onClose={() => undefined}
      snapPoints={snapPoints}
      initialSnap={2}
      disableDismiss
      avoidKeyboard={false}
      onOpenEnd={onOpenEnd}
      onSnap={onSnap}
      style={{ zIndex }}
    >
      <MapSheetShell isLight={isLight} bottomInset={0} collapsedPadding={SHEET_PADDING} zIndex={zIndex} floatingCollapsed solid>
        <Sheet.Header>
          <div className="flex justify-center pb-1 pt-2">
            <div className={`h-1.5 w-16 rounded-full ${isLight ? 'bg-slate-300' : 'bg-white/30'}`} />
          </div>
          {header}
        </Sheet.Header>
        <SmoothSheetContent>
          <MapSheetBody>{children}</MapSheetBody>
        </SmoothSheetContent>
      </MapSheetShell>
    </Sheet>
  );
});

export function SectionLabel({ children, palette }: { children: ReactNode; palette: NavPalette }) {
  return (
    <p className="truncate px-1 pb-3 text-[0.9375rem]" style={{ color: palette.ink }}>
      {children}
    </p>
  );
}

export function Card({
  children,
  className = '',
  tight = false,
}: {
  children: ReactNode;
  palette: NavPalette;
  className?: string;
  tight?: boolean;
}) {
  return <div className={`${tight ? '' : 'py-5'} ${className}`}>{children}</div>;
}

export function GuidancePopup({
  open,
  onClose,
  palette,
  icon,
  title,
  children,
  stepKey = 'main',
  stepDirection = 1,
}: {
  open: boolean;
  onClose: () => void;
  palette: NavPalette;
  icon: ReactNode;
  title: string;
  children: ReactNode;
  stepKey?: string;
  stepDirection?: number;
}) {
  return (
    <MapSheet isOpen={open} onClose={onClose} isLight={palette.isLight} zIndex={10060} initialSnap={2}>
      <div className="px-6 pt-2">
        <span className="block h-12 w-12" style={{ color: palette.ink }} aria-hidden="true">
          {icon}
        </span>
      </div>
      <div className="overflow-hidden">
        <AnimatePresence mode="wait" initial={false} custom={stepDirection}>
          <motion.div
            key={stepKey}
            className="px-6"
            initial={{ x: stepDirection * 90, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: stepDirection * -90, opacity: 0 }}
            transition={{ type: 'tween', duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
          >
            <p role="heading" aria-level={2} className="pt-6 text-[1.625rem] font-medium leading-[1.15]" style={{ color: palette.ink }}>
              {title}
            </p>
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
      <MapSheetBottomSpacer />
    </MapSheet>
  );
}

export function LiveIcon({ label, size = 13 }: { label?: string; size?: number }) {
  return <RealtimeWifi size={size} className="text-green-400" label={label} />;
}

export interface RunChip {
  minutes: number | null;
  scheduled: boolean;
  level: 0 | 1 | 2 | 3;
}

export function DepartureRows({
  runs,
  selected,
  onSelect,
  line,
  headsign,
  palette,
  formatMinutes,
  liveLabel,
}: {
  runs: RunChip[];
  selected: number;
  onSelect: (index: number) => void;
  line: NavLine;
  headsign: string;
  palette: NavPalette;
  formatMinutes: (minutes: number) => string;
  liveLabel: string;
}) {
  return (
    <div className="-mx-2 space-y-1">
      {runs.slice(0, 3).map((run, i) => {
        const picked = i === selected;
        return (
          <button
            key={i}
            type="button"
            disabled={run.minutes === null}
            onClick={() => onSelect(i)}
            className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition active:scale-[0.99]"
            style={{ backgroundColor: picked ? palette.box : 'transparent' }}
          >
            <LinePlate line={line} size="sm" />
            <span className="line-clamp-2 min-w-0 flex-1 text-sm leading-snug" style={{ color: palette.ink }}>
              {headsign}
            </span>
            {run.level > 0 && (
              <span className="flex flex-shrink-0 items-center" style={{ color: palette.muted }}>
                {[0, 1, 2].map(p => (
                  <UserIcon key={p} className="h-3 w-3" style={{ opacity: p < run.level ? 1 : 0.3 }} />
                ))}
              </span>
            )}
            <span className="flex flex-shrink-0 items-center gap-1.5 text-sm font-bold tabular-nums" style={{ color: palette.ink }}>
              {!run.scheduled && <LiveIcon label={liveLabel} />}
              {run.minutes === null ? '–' : formatMinutes(run.minutes)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function VehicleTracker({
  stops,
  here,
  vehicleAt,
  line,
  palette,
  hereLabel,
}: {
  stops: string[];
  here: string;
  vehicleAt: number | null;
  line: NavLine;
  palette: NavPalette;
  hereLabel: string;
}) {
  const points = [...stops, here];
  const last = points.length - 1;
  const position = vehicleAt === null ? null : Math.max(0, Math.min(last, vehicleAt));
  const percent = (value: number) => (last === 0 ? 100 : (value / last) * 100);
  return (
    <div className="px-3 pt-4">
      <div className="relative h-8">
        <div className="absolute left-0 right-0 top-1/2 h-[6px] -translate-y-1/2 rounded-full" style={{ backgroundColor: palette.box }} />
        {position !== null && (
          <motion.div
            className="absolute left-0 top-1/2 h-[6px] -translate-y-1/2 rounded-full"
            style={{ backgroundColor: line.color }}
            initial={false}
            animate={{ width: `${percent(position)}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 22 }}
          />
        )}
        {points.map((_, i) => (
          <span
            key={i}
            className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px]"
            style={{
              left: `${percent(i)}%`,
              borderColor: i === last || (position !== null && i <= position) ? line.color : palette.cardBorder,
              backgroundColor: palette.surface,
            }}
          />
        ))}
        {position !== null && (
          <motion.span
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
            initial={false}
            animate={{ left: `${percent(position)}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 22 }}
          >
            <LinePlate line={line} size="xs" />
          </motion.span>
        )}
      </div>
      <div className="relative mt-1 h-4 text-xs">
        {points.map((name, i) => (
          <span
            key={i}
            className="absolute max-w-[5.5rem] truncate"
            style={{
              left: `${percent(i)}%`,
              transform: i === 0 ? 'none' : i === last ? 'translateX(-100%)' : 'translateX(-50%)',
              color: i === last ? palette.ink : palette.muted,
              fontWeight: i === last ? 600 : 400,
            }}
          >
            {i === last ? hereLabel : name}
          </span>
        ))}
      </div>
    </div>
  );
}

export function RideStops({
  stops,
  line,
  palette,
  moreLabel,
}: {
  stops: Array<{ name: string; waiting: string; time: string; passed: boolean }>;
  line: NavLine;
  palette: NavPalette;
  moreLabel: (count: number) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const lastIndex = stops.length - 1;
  const middle = stops.slice(0, lastIndex).map((stop, i) => ({ ...stop, i }));
  const upcoming = middle.filter(stop => !stop.passed);
  const hidden = !expanded && upcoming.length > 4 ? upcoming.slice(3).map(stop => stop.i) : [];
  const hiddenSet = new Set(hidden);
  const shownMiddle = middle.filter(stop => !hiddenSet.has(stop.i));
  const firstHidden = hidden[0];
  const final = stops[lastIndex];
  return (
    <div className="flex gap-5">
      <div className="flex w-6 flex-shrink-0 flex-col items-center">
        <span className="w-[6px] flex-1 rounded-t-full" style={{ backgroundColor: line.color, minHeight: 24 }} />
        <span
          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-[3px]"
          style={{ borderColor: line.color }}
        >
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: line.color }} />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <ul className="flex flex-col gap-3">
          {shownMiddle.map((stop) => (
            <motion.li
              key={`${stop.name}-${stop.i}`}
              className="relative flex items-baseline justify-between gap-3 text-[1.0625rem]"
              style={{ color: palette.ink }}
              initial={false}
              animate={{ opacity: stop.passed ? 0.35 : 1 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            >
              <span
                className="pointer-events-none absolute"
                style={{ left: -32, top: '0.55em', width: 12, height: 6, backgroundColor: line.color }}
                aria-hidden
              />
              <span className="truncate">{stop.name}</span>
              {stop.waiting && (
                <span className="flex flex-shrink-0 items-center gap-1 text-sm" style={{ color: palette.muted }}>
                  <UserIcon className="h-3.5 w-3.5" />
                  {stop.waiting}
                </span>
              )}
            </motion.li>
          ))}
        </ul>
        {firstHidden !== undefined && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mt-4 flex items-center gap-3 text-left"
            style={{ color: palette.ink }}
          >
            <PlusCircleIcon className="h-7 w-7 flex-shrink-0" />
            <span className="text-[1.0625rem]">{moreLabel(hidden.length)}</span>
          </button>
        )}
        {expanded && upcoming.length > 4 && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="mt-4 flex items-center gap-3 text-left"
            style={{ color: palette.ink }}
          >
            <MinusCircleIcon className="h-7 w-7 flex-shrink-0" />
          </button>
        )}
        {final && (
          <div className="mt-5 flex items-baseline justify-between gap-3">
            <p className="min-w-0 truncate text-[1.375rem] font-medium leading-[1.15]" style={{ color: palette.ink }}>
              {final.name}
            </p>
            {final.time && (
              <span className="flex-shrink-0 text-[1.0625rem] tabular-nums" style={{ color: palette.muted }}>
                {final.time}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export interface TimelineItem {
  kind: 'walk' | 'transit' | 'arrival';
  from: string;
  to: string;
  detail: string;
  time: string;
  line?: NavLine;
  current: boolean;
  done: boolean;
}

export function TripTimeline({ items, palette, walkLabel }: { items: TimelineItem[]; palette: NavPalette; walkLabel: (detail: string) => string }) {
  return (
    <div>
      {items.map((item, i) => {
        if (item.kind === 'walk') {
          return (
            <div
              key={i}
              className="my-4 flex items-center gap-3 rounded-2xl px-4 py-4"
              style={{ backgroundColor: palette.box, opacity: item.done ? 0.5 : 1, boxShadow: item.current ? `inset 0 0 0 2px ${palette.ink}` : undefined }}
            >
              <FaWalking size={18} style={{ color: palette.ink }} />
              <span className="min-w-0 flex-1 truncate text-[1.0625rem]" style={{ color: palette.ink }}>
                {walkLabel(item.detail)}
              </span>
              {item.time && (
                <span className="flex-shrink-0 text-[0.9375rem] tabular-nums" style={{ color: palette.muted }}>
                  {item.time}
                </span>
              )}
            </div>
          );
        }
        if (item.kind === 'arrival') {
          return (
            <div key={i} className="mt-5 flex items-center gap-5">
              <span className="flex w-6 flex-shrink-0 justify-center">
                <EndpointDot palette={palette} size={22} />
              </span>
              <p className="min-w-0 flex-1 truncate text-[1.375rem] font-medium leading-[1.15]" style={{ color: palette.ink }}>
                {item.to}
              </p>
              <span className="flex-shrink-0 text-[0.9375rem] tabular-nums" style={{ color: palette.muted }}>
                {item.time}
              </span>
            </div>
          );
        }
        const color = item.line?.color ?? palette.muted;
        return (
          <div key={i} className="mt-5 flex gap-5" style={{ opacity: item.done ? 0.5 : 1 }}>
            <div className="flex w-6 flex-shrink-0 flex-col items-center">
              <span className="h-6 w-6 flex-shrink-0 rounded-full border-[3px]" style={{ borderColor: color }} />
              <span className="w-[6px] flex-1" style={{ backgroundColor: color, minHeight: 56 }} />
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-[3px]" style={{ borderColor: color }}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[1.0625rem] font-medium leading-tight" style={{ color: palette.ink }}>
                {item.from}
              </p>
              <div className="mt-3 flex items-center gap-3 rounded-2xl px-4 py-3" style={{ backgroundColor: palette.box }}>
                {item.line && <LinePlate line={item.line} size="sm" />}
                <p className="min-w-0 flex-1 truncate text-[0.9375rem] leading-tight" style={{ color: palette.soft }}>
                  {item.detail}
                </p>
              </div>
              <div className="mt-3 flex items-baseline justify-between gap-3">
                <p className="truncate text-[1.0625rem] font-medium leading-tight" style={{ color: palette.ink }}>
                  {item.to}
                </p>
                <span className="flex-shrink-0 text-[0.9375rem] tabular-nums" style={{ color: palette.muted }}>
                  {item.time}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function OptionRow({
  title,
  subtitle,
  trailing,
  onClick,
  palette,
  last = false,
  danger = false,
}: {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  onClick?: () => void;
  palette: NavPalette;
  last?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 py-4 text-left active:opacity-70"
      style={last ? undefined : { borderBottom: `1px solid ${palette.rule}` }}
    >
      <span className="min-w-0">
        <span className={`block truncate text-[1.0625rem] ${danger ? 'text-red-500' : ''}`} style={danger ? undefined : { color: palette.ink }}>
          {title}
        </span>
        {subtitle && (
          <span className="mt-0.5 block truncate text-[0.9375rem]" style={{ color: palette.soft }}>
            {subtitle}
          </span>
        )}
      </span>
      <span className="flex-shrink-0">
        {trailing ?? <ChevronRightIcon className="h-4 w-4" style={{ color: palette.muted }} />}
      </span>
    </button>
  );
}

export function Toggle({ on }: { on: boolean }) {
  return (
    <span
      className="relative block h-[31px] w-[51px] rounded-full shadow-inner transition-colors"
      style={{ backgroundColor: on ? '#34c759' : '#39393d' }}
    >
      <motion.span
        className="absolute left-[2px] top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-sm"
        animate={{ x: on ? 20 : 0 }}
        transition={{ type: 'spring', stiffness: 520, damping: 32 }}
      />
    </span>
  );
}

export function Avatars({ faces }: { faces: string[] }) {
  return (
    <span className="flex h-7 items-center pl-2">
      <AnimatePresence initial={false}>
        {faces.slice(0, 4).map((face, i) => (
          <motion.span
            key={`${face}-${i}`}
            className="-ml-2 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-white text-[0.8125rem] shadow-sm"
            style={{ zIndex: 4 - i }}
            initial={{ scale: 0.65, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.65, opacity: 0 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
          >
            {face}
          </motion.span>
        ))}
      </AnimatePresence>
    </span>
  );
}

export interface MiniSegment {
  kind: 'walk' | 'transit';
  share: number;
  line?: NavLine;
  done: boolean;
}

export function MiniTimeline({ segments, progress, palette }: { segments: MiniSegment[]; progress: number; palette: NavPalette }) {
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <div className="relative mx-3 h-9">
      <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {segments.map((segment, i) => (
          <motion.div
            key={i}
            className="relative flex items-center justify-center"
            style={{ flexBasis: `calc(${segment.share * 100}% - 4px)`, flexGrow: 0, flexShrink: 0 }}
            initial={{ opacity: 0, scaleX: 0.6 }}
            animate={{ opacity: segment.done ? 0.35 : 1, scaleX: 1 }}
            transition={{ duration: 0.5, delay: i * 0.06, ease: [0.32, 0.72, 0, 1] }}
          >
            {segment.kind === 'walk' ? (
              <span className="h-0 w-full border-t-[3px] border-dotted" style={{ borderColor: palette.muted }} />
            ) : (
              <>
                <span className="h-[6px] w-full rounded-full" style={{ backgroundColor: segment.line?.color ?? palette.muted }} />
                {segment.line && (
                  <span className="absolute">
                    <LinePlate line={segment.line} size="xs" />
                  </span>
                )}
              </>
            )}
          </motion.div>
        ))}
      </div>
      <span className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2">
        <EndpointDot palette={palette} size={14} />
      </span>
      <motion.span
        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
        initial={{ left: '0%' }}
        animate={{ left: `${clamped * 100}%` }}
        transition={{ type: 'spring', stiffness: 90, damping: 20, delay: 0.15 }}
      >
        <span className="block h-4 w-4 rounded-full border-[3px] border-white bg-green-500 shadow-[0_2px_8px_rgba(0,0,0,0.3)]" />
      </motion.span>
    </div>
  );
}

export function EndpointDot({ palette, size = 18 }: { palette: NavPalette; size?: number }) {
  return (
    <span
      className="flex flex-shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, backgroundColor: palette.ink }}
      aria-hidden="true"
    >
      <span className="rounded-full" style={{ width: size * 0.42, height: size * 0.42, backgroundColor: palette.isLight ? '#ffffff' : '#000000' }} />
    </span>
  );
}

const RAIL = 6;

function railGrey(palette: NavPalette): string {
  return palette.isLight ? '#cbd5e1' : '#454b55';
}

function StopRow({
  stop,
  index,
  count,
  passedAbove,
  passedBelow,
  color,
  palette,
  emphasizeLast,
  anchor = false,
}: {
  stop: ShareStop;
  index: number;
  count: number;
  passedAbove: boolean;
  passedBelow: boolean;
  color: string;
  palette: NavPalette;
  emphasizeLast: boolean;
  anchor?: boolean;
}) {
  const grey = railGrey(palette);
  const edge = index === 0 || index === count - 1;
  const last = index === count - 1;
  const markColor = stop.passed ? grey : color;
  return (
    <div className="flex items-stretch gap-4" data-timeline-anchor={anchor || undefined}>
      <div className="relative w-6 flex-shrink-0">
        {index > 0 && (
          <motion.span
            className="absolute top-0 block"
            style={{ left: 12 - RAIL / 2, width: RAIL, height: '50%' }}
            initial={false}
            animate={{ backgroundColor: passedAbove ? grey : color }}
            transition={{ duration: 0.6 }}
          />
        )}
        {!last && (
          <motion.span
            className="absolute bottom-0 block"
            style={{ left: 12 - RAIL / 2, width: RAIL, top: '50%' }}
            initial={false}
            animate={{ backgroundColor: passedBelow ? grey : color }}
            transition={{ duration: 0.6 }}
          />
        )}
        {edge ? (
          <motion.span
            className="absolute flex items-center justify-center rounded-full border-[3px]"
            style={{ left: 0, top: '50%', width: 24, height: 24, marginTop: -12, backgroundColor: palette.surface }}
            initial={false}
            animate={{ borderColor: markColor }}
            transition={{ duration: 0.6 }}
          >
            {last && <motion.span className="block h-2 w-2 rounded-full" initial={false} animate={{ backgroundColor: markColor }} />}
          </motion.span>
        ) : (
          <motion.span
            className="absolute block"
            style={{ left: 12 - RAIL / 2, top: '50%', width: 12 + RAIL / 2, height: RAIL, marginTop: -RAIL / 2 }}
            initial={false}
            animate={{ backgroundColor: markColor }}
            transition={{ duration: 0.6 }}
          />
        )}
      </div>
      <motion.div
        className={`flex min-w-0 flex-1 items-baseline justify-between gap-3 ${edge ? 'py-2.5' : 'py-1.5'}`}
        initial={false}
        animate={{ opacity: stop.passed ? 0.35 : 1 }}
        transition={{ duration: 0.6 }}
      >
        <span
          className={`truncate ${last && emphasizeLast ? 'text-[1.375rem] font-medium leading-[1.15]' : edge ? 'text-[1.0625rem] font-medium' : 'text-[1.0625rem]'}`}
          style={{ color: palette.ink }}
        >
          {stop.name}
        </span>
        {stop.time && (
          <span className="flex-shrink-0 text-[0.9375rem] tabular-nums" style={{ color: palette.soft }}>
            {stop.time}
          </span>
        )}
      </motion.div>
    </div>
  );
}

function TransitStops({
  step,
  palette,
  moreLabel,
}: {
  step: ShareTimelineStep;
  palette: NavPalette;
  moreLabel: (count: number) => string;
}) {
  const stops = step.stops;
  const count = stops.length;
  const color = step.line?.color ?? palette.muted;
  const grey = railGrey(palette);
  const [expanded, setExpanded] = useState(false);

  let hiddenFrom = -1;
  let hiddenTo = -1;
  if (count > 2) {
    if (step.current) {
      const upcoming = stops.map((stop, i) => ({ stop, i })).filter(({ stop, i }) => !stop.passed && i > 0 && i < count - 1);
      if (upcoming.length > 4) {
        hiddenFrom = upcoming[3].i;
        hiddenTo = count - 2;
      }
    } else if (count > 3) {
      hiddenFrom = 1;
      hiddenTo = count - 2;
    }
  }
  const hasHidden = hiddenFrom >= 0;
  const anchorIndex = step.current ? stops.findIndex(stop => !stop.passed) : -1;
  const passedAt = (i: number) => (i >= 0 && i < count ? stops[i].passed : false);
  const row = (i: number) => (
    <StopRow
      key={`${stops[i].name}-${i}`}
      stop={stops[i]}
      index={i}
      count={count}
      passedAbove={passedAt(i)}
      passedBelow={passedAt(i + 1)}
      color={color}
      palette={palette}
      emphasizeLast={step.current}
      anchor={i === anchorIndex}
    />
  );

  return (
    <div>
      {step.line && (
        <div className="flex items-center gap-3 pb-2">
          <LinePlate line={step.line} size="sm" />
          {step.label && (
            <span className="truncate text-[0.9375rem]" style={{ color: palette.soft }}>
              {step.label}
            </span>
          )}
        </div>
      )}
      {stops.map((_, i) => (hasHidden && i >= hiddenFrom ? null : row(i)))}
      {hasHidden && (
        <>
          <div className="flex items-stretch gap-4">
            <div className="relative w-6 flex-shrink-0">
              <span
                className="absolute inset-y-0 block"
                style={{ left: 12 - RAIL / 2, width: RAIL, backgroundColor: passedAt(hiddenFrom) ? grey : color }}
              />
            </div>
            <button
              type="button"
              onClick={() => setExpanded(open => !open)}
              className="flex items-center gap-3 py-2 text-left"
              style={{ color: palette.ink }}
              aria-expanded={expanded}
            >
              {expanded ? <MinusCircleIcon className="h-6 w-6 flex-shrink-0" /> : <PlusCircleIcon className="h-6 w-6 flex-shrink-0" />}
              <span className="text-[1.0625rem]">{moreLabel(hiddenTo - hiddenFrom + 1)}</span>
            </button>
          </div>
          <div
            className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-300 ease-out ${
              expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
            }`}
            aria-hidden={!expanded}
          >
            <div className="min-h-0">
              {stops.slice(hiddenFrom, hiddenTo + 1).map((_, offset) => row(hiddenFrom + offset))}
            </div>
          </div>
          {stops.slice(hiddenTo + 1).map((_, offset) => row(hiddenTo + 1 + offset))}
        </>
      )}
    </div>
  );
}

export function StopTimeline({
  steps,
  palette,
  moreLabel,
}: {
  steps: ShareTimelineStep[];
  palette: NavPalette;
  moreLabel: (count: number) => string;
}) {
  return (
    <div className="space-y-4">
      {steps.map((step, i) => {
        if (step.kind === 'walk') {
          return (
            <motion.div
              key={`walk-${i}`}
              data-timeline-anchor={step.current || undefined}
              className="flex items-center gap-4 rounded-2xl px-4 py-3.5"
              style={{ backgroundColor: palette.box, boxShadow: step.current ? `inset 0 0 0 2px ${palette.ink}` : undefined }}
              initial={false}
              animate={{ opacity: step.done ? 0.35 : 1 }}
              transition={{ duration: 0.6 }}
            >
              <FaWalking size={18} style={{ color: palette.ink }} />
              <span className="min-w-0 flex-1 truncate text-[1.0625rem]" style={{ color: palette.ink }}>
                {step.label}
              </span>
              {step.time && (
                <span className="flex-shrink-0 text-[0.9375rem] tabular-nums" style={{ color: palette.soft }}>
                  {step.time}
                </span>
              )}
            </motion.div>
          );
        }
        if (step.kind === 'arrival') {
          return (
            <div key={`arrival-${i}`} className="flex items-center gap-4" data-timeline-anchor={step.current || undefined}>
              <span className="flex w-6 flex-shrink-0 justify-center">
                <EndpointDot palette={palette} size={22} />
              </span>
              <p className="min-w-0 flex-1 truncate text-[1.375rem] font-medium leading-[1.15]" style={{ color: palette.ink }}>
                {step.label}
              </p>
              <span className="flex-shrink-0 text-[0.9375rem] tabular-nums" style={{ color: palette.soft }}>
                {step.time}
              </span>
            </div>
          );
        }
        return <TransitStops key={`transit-${i}`} step={step} palette={palette} moreLabel={moreLabel} />;
      })}
    </div>
  );
}
