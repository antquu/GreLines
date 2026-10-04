import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react';

export type ExitMode = 'swipe' | 'fade';

type Track = { gen: number; minutes: number; count: number; motion: GroupMotion };

export interface GroupMotion {
  renderKey: string;
  change: 'later' | 'earlier' | null;
  rank: number;
}

export function useGroupMotion(
  scope: string,
  groups: Array<{ key: string; minutes: number; count: number }>,
): Map<string, GroupMotion> {
  const tracks = useRef(new Map<string, Track>());
  const order = useRef<string[]>([]);
  const scopeRef = useRef(scope);
  if (scopeRef.current !== scope) {
    scopeRef.current = scope;
    tracks.current = new Map();
    order.current = [];
  }

  const moveToEnd = (key: string) => {
    order.current = [...order.current.filter(entry => entry !== key), key];
  };

  const result = new Map<string, GroupMotion>();
  const seen = new Set<string>();
  for (const group of groups) {
    seen.add(group.key);
    if (!order.current.includes(group.key)) order.current = [...order.current, group.key];
    const previous = tracks.current.get(group.key);
    if (previous && previous.minutes === group.minutes && previous.count === group.count) {
      result.set(group.key, previous.motion);
      continue;
    }
    let gen = previous?.gen ?? 0;
    let change: GroupMotion['change'] = null;
    if (previous) {
      const passed =
        (group.minutes > previous.minutes && group.count < previous.count) ||
        (previous.minutes <= 1 && group.minutes > previous.minutes + 1);
      if (passed) {
        gen += 1;
        moveToEnd(group.key);
      } else if (group.minutes > previous.minutes) change = 'later';
      else if (group.minutes < previous.minutes - 1) change = 'earlier';
    }
    const motion = { renderKey: `${group.key}#${gen}`, change, rank: 0 };
    tracks.current.set(group.key, { gen, minutes: group.minutes, count: group.count, motion });
    result.set(group.key, motion);
  }
  for (const key of [...tracks.current.keys()]) {
    if (!seen.has(key)) tracks.current.delete(key);
  }
  const ranked = new Map<string, GroupMotion>();
  for (const [key, motion] of result) ranked.set(key, { ...motion, rank: order.current.indexOf(key) });
  return ranked;
}

export function useExitMode(filterKey: string): { exitMode: ExitMode; filtering: boolean } {
  const previous = useRef(filterKey);
  const filtering = previous.current !== filterKey;
  useEffect(() => {
    previous.current = filterKey;
  }, [filterKey]);
  return { exitMode: filtering ? 'fade' : 'swipe', filtering };
}

export function useFirstPaint(scope: string): boolean {
  const [painted, setPainted] = useState<string | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setPainted(scope), 600);
    return () => window.clearTimeout(timer);
  }, [scope]);
  return painted !== scope;
}

export function DepartureList({ exitMode, className, children }: { exitMode: ExitMode; className?: string; children: ReactNode }) {
  return (
    <div className={`relative ${className ?? ''}`}>
      <AnimatePresence mode="popLayout" initial={false} custom={exitMode}>
        {children}
      </AnimatePresence>
    </div>
  );
}

const exitVariants: Variants = {
  exit: (mode: ExitMode) =>
    mode === 'fade'
      ? { opacity: 0, scale: 0.97, transition: { duration: 0.22, ease: 'easeOut' as const } }
      : { x: '-110%', opacity: 0, transition: { duration: 0.34, ease: [0.4, 0, 1, 1] as [number, number, number, number] } },
};

export const DepartureCard = forwardRef<HTMLDivElement, {
  index: number;
  firstPaint: boolean;
  filtering: boolean;
  className?: string;
  children: ReactNode;
}>(function DepartureCard({ index, firstPaint, filtering, className, children }, ref) {
  const initial = firstPaint ? { opacity: 0, y: 8 } : { opacity: 0, scale: 0.98 };
  const delay = firstPaint ? index * 0.04 : filtering ? Math.min(index, 8) * 0.03 : 0.08;
  return (
    <motion.div
      ref={ref}
      layout="position"
      variants={exitVariants}
      initial={initial}
      animate={{ opacity: 1, y: 0, x: 0, scale: 1, transition: { delay, duration: 0.3, ease: 'easeOut' } }}
      exit="exit"
      transition={{ layout: { type: 'spring', stiffness: 420, damping: 38 } }}
      className={className}
    >
      {children}
    </motion.div>
  );
});

export function MotionTime({
  value,
  valueKey,
  change,
  className,
}: {
  value: ReactNode;
  valueKey: string;
  change: GroupMotion['change'];
  className?: string;
}) {
  const [flashColor, setFlashColor] = useState<string | null>(null);
  useEffect(() => {
    if (!change) return;
    setFlashColor(change === 'later' ? '#fbbf24' : '#4ade80');
    const timer = window.setTimeout(() => setFlashColor(null), 1600);
    return () => window.clearTimeout(timer);
  }, [change, valueKey]);

  return (
    <p
      className={className}
      style={flashColor ? { color: flashColor, transition: 'color 300ms ease' } : { transition: 'color 600ms ease' }}
    >
      {value}
    </p>
  );
}
