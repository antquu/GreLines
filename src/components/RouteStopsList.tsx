import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Bars2Icon, XMarkIcon } from '@heroicons/react/24/solid';
import type { RouteLocation } from '../services/api';
import { CURRENT_POSITION_ID } from '../utils/geo';
import { hapticTap } from '../utils/haptics';

interface RouteStopsListProps {
  points: RouteLocation[];
  isLight: boolean;
  compact?: boolean;
  adding: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  onCancelAdd: () => void;
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
  };
  children?: ReactNode;
}

const GAP_PX = 8;

export function RouteStopsList({
  points,
  isLight,
  compact = false,
  adding,
  query,
  onQueryChange,
  onCancelAdd,
  onReorder,
  onRemove,
  labels,
  children,
}: RouteStopsListProps) {
  const rowPx = compact ? 52 : 56;
  const pitch = rowPx + GAP_PX;
  const [drag, setDrag] = useState<{ index: number; startY: number; dy: number } | null>(null);
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

  const finishDrag = () => {
    if (!drag) return;
    const from = drag.index;
    setDrag(null);
    if (target === from || target < 0) return;
    const next = points.slice();
    const [moved] = next.splice(from, 1);
    next.splice(target, 0, moved);
    onReorder(next);
  };

  const surface = isLight
    ? 'border-slate-200 bg-white text-slate-900'
    : 'border-slate-800 bg-slate-900 text-white';
  const faint = isLight ? 'text-slate-400' : 'text-slate-500';

  const shiftOf = (index: number) => {
    if (!drag) return 0;
    if (index === drag.index) {
      return Math.max(-drag.index * pitch, Math.min((lastIndex - drag.index) * pitch, drag.dy));
    }
    if (drag.index < index && index <= target) return -pitch;
    if (target <= index && index < drag.index) return pitch;
    return 0;
  };

  const captionOf = (index: number) =>
    index === 0 ? labels.from : index === lastIndex ? labels.to : labels.stop(index);

  const renderRow = (location: RouteLocation, index: number) => {
    const isDragged = drag?.index === index;
    return (
      <div
        key={`${location.kind}-${location.id}-${index}`}
        className={`relative flex items-center rounded-2xl border ${surface} ${
          isDragged ? 'z-10 shadow-xl' : ''
        }`}
        style={{
          height: rowPx,
          transform: `translateY(${shiftOf(index)}px)${isDragged ? ' scale(1.02)' : ''}`,
          transition: isDragged ? 'none' : drag ? 'transform 180ms cubic-bezier(0.32,0.72,0,1)' : 'none',
        }}
      >
        <button
          type="button"
          disabled={adding}
          aria-label={labels.move}
          onPointerDown={event => {
            if (adding || event.button > 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            hapticTap();
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
      </div>
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
        className={`w-full rounded-2xl border pl-4 pr-12 outline-none transition focus:border-blue-500 ${surface} ${
          compact ? 'text-sm' : 'text-base'
        } ${isLight ? 'placeholder:text-slate-400' : 'placeholder:text-slate-500'}`}
        style={{ height: rowPx }}
      />
      <button
        type="button"
        onClick={onCancelAdd}
        aria-label={labels.cancel}
        className={`absolute inset-y-0 right-0 flex w-12 items-center justify-center transition active:scale-90 ${faint}`}
      >
        <XMarkIcon className="h-5 w-5" />
      </button>
      {children}
    </div>
  );

  const rows: ReactNode[] = points.map(renderRow);
  if (adding) rows.splice(Math.max(1, lastIndex), 0, inputRow);

  return (
    <div data-no-drag className="flex select-none flex-col" style={{ gap: GAP_PX }}>
      {rows}
    </div>
  );
}
