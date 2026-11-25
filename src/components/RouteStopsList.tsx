import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Bars2Icon, MapPinIcon, XMarkIcon } from '@heroicons/react/24/solid';
import type { RouteLocation } from '../services/api';
import { CURRENT_POSITION_ID } from '../utils/geo';
import { hapticTap } from '../utils/haptics';

interface RouteStopsListProps {
  points: RouteLocation[];
  isLight: boolean;
  compact?: boolean;
  middleOnly?: boolean;
  adding: boolean;
  picking?: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  onCancelAdd: () => void;
  onPickOnMap?: () => void;
  onReorder: (next: RouteLocation[]) => void;
  onRemove: (index: number) => void;
  labels: {
    from: string;
    to: string;
    stop: (position: number) => string;
    searchStop: string;
    remove: string;
    move: string;
    cancel: string;
    pickOnMap: string;
  };
  children?: ReactNode;
}

const GAP_PX = 8;
const EASE = [0.32, 0.72, 0, 1] as const;
const SETTLE = { type: 'spring', stiffness: 420, damping: 15, mass: 1.1 } as const;

const keyOf = (location: RouteLocation, seen: Map<string, number>) => {
  const base = `${location.kind}-${location.id}`;
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count ? `${base}-${count}` : base;
};

export function RouteStopsList({
  points,
  isLight,
  compact = false,
  middleOnly = false,
  adding,
  picking = false,
  query,
  onQueryChange,
  onCancelAdd,
  onPickOnMap,
  onReorder,
  onRemove,
  labels,
  children,
}: RouteStopsListProps) {
  const rowPx = compact ? 52 : 56;
  const pitch = rowPx + GAP_PX;
  const [drag, setDrag] = useState<{ index: number; startY: number; dy: number } | null>(null);
  const [settle, setSettle] = useState<{ key: string; offset: number; seq: number } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const lastTargetRef = useRef(-1);

  useEffect(() => {
    if (adding) inputRef.current?.focus({ preventScroll: true });
  }, [adding]);

  const lastIndex = points.length - 1;
  const target = drag
    ? Math.max(0, Math.min(lastIndex, drag.index + Math.round(drag.dy / pitch)))
    : -1;

  useEffect(() => {
    if (!drag) {
      lastTargetRef.current = -1;
      return;
    }
    if (lastTargetRef.current !== -1 && lastTargetRef.current !== target) hapticTap();
    lastTargetRef.current = target;
  }, [drag, target]);

  const seen = new Map<string, number>();
  const keys = points.map(point => keyOf(point, seen));

  const clampDy = (index: number, dy: number) =>
    Math.max(-index * pitch, Math.min((lastIndex - index) * pitch, dy));

  const finishDrag = () => {
    if (!drag) return;
    const from = drag.index;
    const to = target < 0 ? from : target;
    // the row falls from where it was let go into its new slot
    setSettle({ key: keys[from], offset: clampDy(from, drag.dy) - (to - from) * pitch, seq: Date.now() });
    setDrag(null);
    hapticTap();
    if (to === from) return;
    const next = points.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onReorder(next);
  };

  const surface = isLight
    ? 'border-slate-200 bg-white text-slate-900'
    : 'border-slate-800 bg-slate-900 text-white';
  const faint = isLight ? 'text-slate-400' : 'text-slate-500';

  const shiftOf = (index: number) => {
    if (!drag) return 0;
    if (index === drag.index) return clampDy(index, drag.dy);
    if (drag.index < index && index <= target) return -pitch;
    if (target <= index && index < drag.index) return pitch;
    return 0;
  };

  const captionOf = (index: number) => {
    if (middleOnly) return labels.stop(index + 1);
    return index === 0 ? labels.from : index === lastIndex ? labels.to : labels.stop(index);
  };

  const renderRow = (location: RouteLocation, index: number) => {
    const key = keys[index];
    const isDragged = drag?.index === index;
    const settling = !drag && settle?.key === key;
    return (
      <motion.div
        key={key}
        initial={false}
        animate={
          settling
            ? { y: [settle.offset, 0], scale: [1.03, 1] }
            : { y: shiftOf(index), scale: isDragged ? 1.03 : 1 }
        }
        transition={
          settling
            ? { y: SETTLE, scale: { duration: 0.35, ease: EASE } }
            : isDragged || !drag
              ? { duration: 0 }
              : { duration: 0.18, ease: EASE }
        }
        onAnimationComplete={() => {
          if (settling) setSettle(null);
        }}
        className={`relative flex items-center rounded-2xl border ${surface} ${
          isDragged || settling ? 'z-10 shadow-xl' : ''
        }`}
        style={{ height: rowPx }}
      >
        <button
          type="button"
          disabled={adding}
          aria-label={labels.move}
          onPointerDown={event => {
            if (adding || event.button > 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            hapticTap();
            setSettle(null);
            setDrag({ index, startY: event.clientY, dy: 0 });
          }}
          onPointerMove={event => {
            if (!drag || drag.index !== index) return;
            setDrag({ ...drag, dy: event.clientY - drag.startY });
          }}
          onPointerUp={finishDrag}
          onPointerCancel={() => setDrag(null)}
          style={{ touchAction: 'none' }}
          className={`flex h-full w-12 flex-shrink-0 cursor-grab items-center justify-center active:cursor-grabbing disabled:opacity-30 ${faint}`}
        >
          <Bars2Icon className="h-5 w-5" />
        </button>
        <span className="min-w-0 flex-1">
          <span className={`block text-[0.6875rem] font-semibold leading-tight ${faint}`}>{captionOf(index)}</span>
          <span
            className={`block truncate font-semibold leading-tight ${compact ? 'text-sm' : 'text-[0.95rem]'} ${
              location.id === CURRENT_POSITION_ID ? 'text-blue-500' : ''
            }`}
          >
            {location.label}
          </span>
        </span>
        <button
          type="button"
          onClick={() => onRemove(index)}
          aria-label={`${labels.remove} : ${location.label}`}
          className={`flex h-full w-12 flex-shrink-0 items-center justify-center transition active:scale-90 ${faint}`}
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </motion.div>
    );
  };

  const inputRow = (
    <div key="add-stop" className="relative">
      <input
        ref={inputRef}
        value={query}
        onChange={event => onQueryChange(event.target.value)}
        placeholder={labels.searchStop}
        enterKeyHint="search"
        className={`w-full rounded-2xl border pl-4 outline-none transition focus:border-blue-500 ${surface} ${
          onPickOnMap ? 'pr-24' : 'pr-12'
        } ${compact ? 'text-sm' : 'text-base'} ${isLight ? 'placeholder:text-slate-400' : 'placeholder:text-slate-500'}`}
        style={{ height: rowPx }}
      />
      <div className="absolute inset-y-0 right-0 flex items-center">
        {onPickOnMap && (
          <button
            type="button"
            onClick={onPickOnMap}
            aria-label={labels.pickOnMap}
            title={labels.pickOnMap}
            className={`flex h-full w-11 items-center justify-center transition active:scale-90 ${
              picking ? 'text-blue-500' : faint
            }`}
          >
            <MapPinIcon className="h-5 w-5" />
          </button>
        )}
        <button
          type="button"
          onClick={onCancelAdd}
          aria-label={labels.cancel}
          className={`flex h-full w-12 items-center justify-center transition active:scale-90 ${faint}`}
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>
      {children}
    </div>
  );

  const rows: ReactNode[] = points.map(renderRow);
  if (adding) rows.splice(middleOnly ? rows.length : Math.max(1, lastIndex), 0, inputRow);

  return (
    <div data-no-drag className="flex select-none flex-col" style={{ gap: GAP_PX }}>
      {rows}
    </div>
  );
}
