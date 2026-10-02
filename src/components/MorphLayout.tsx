import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { motion, useTransform, type MotionValue } from 'framer-motion';

interface Box { x: number; y: number; w: number; h: number }

interface StageApi {
  progress: MotionValue<number>;
  overlay: HTMLDivElement | null;
  slots: Record<string, Box>;
  anchors: Record<string, Box>;
}

const StageContext = createContext<StageApi | null>(null);

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

const RELAY_SPAN = 0.15;

function Traveller({
  slot,
  anchor,
  mode,
  progress,
  className,
  children,
}: {
  slot: Box;
  anchor: Box;
  mode: 'scale' | 'stretch';
  progress: MotionValue<number>;
  className?: string;
  children: ReactNode;
}) {
  const x = useTransform(progress, p => lerp(anchor.x, slot.x, p));
  const y = useTransform(progress, p => lerp(anchor.y, slot.y, p));
  const scale = useTransform(progress, p => (mode === 'scale' ? lerp(anchor.h / Math.max(slot.h, 1), 1, p) : 1));
  const width = useTransform(progress, p => (mode === 'stretch' ? lerp(anchor.w, slot.w, p) : slot.w));
  return (
    <motion.div
      className="pointer-events-none absolute left-0 top-0"
      style={{ x, y, scale, width, height: slot.h, transformOrigin: '0 0' }}
    >
      <div className={className} style={{ width: '100%', height: '100%' }}>{children}</div>
    </motion.div>
  );
}

export function MorphSlot({
  id,
  mode = 'scale',
  className,
  style,
  children,
}: {
  id: string;
  mode?: 'scale' | 'stretch';
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const stage = useContext(StageContext);
  if (!stage) return <div className={className} style={style}>{children}</div>;
  const slot = stage.slots[id];
  const anchor = stage.anchors[id];
  return (
    <>
      <div data-morph-slot={id} className={className} style={{ ...style, visibility: 'hidden' }}>{children}</div>
      {stage.overlay && slot && anchor && createPortal(
        <Traveller slot={slot} anchor={anchor} mode={mode} progress={stage.progress} className={className}>{children}</Traveller>,
        stage.overlay,
      )}
    </>
  );
}

export function MorphAnchor({ id, className, style, children }: { id: string; className?: string; style?: CSSProperties; children?: ReactNode }) {
  return <div data-morph-anchor={id} className={className} style={style}>{children}</div>;
}

export function MorphStage({
  progress,
  compact,
  children,
  fadeFrom = 0.35,
}: {
  progress: MotionValue<number>;
  compact: ReactNode;
  children: ReactNode;
  fadeFrom?: number;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [overlay, setOverlay] = useState<HTMLDivElement | null>(null);
  const [boxes, setBoxes] = useState<{ slots: Record<string, Box>; anchors: Record<string, Box> }>({ slots: {}, anchors: {} });

  const measure = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const origin = root.getBoundingClientRect();
    const read = (attribute: string) => {
      const found: Record<string, Box> = {};
      root.querySelectorAll<HTMLElement>(`[${attribute}]`).forEach(element => {
        const rect = element.getBoundingClientRect();
        found[element.getAttribute(attribute)!] = { x: rect.left - origin.left, y: rect.top - origin.top, w: rect.width, h: rect.height };
      });
      return found;
    };
    const next = { slots: read('data-morph-slot'), anchors: read('data-morph-anchor') };
    setBoxes(previous => (JSON.stringify(previous) === JSON.stringify(next) ? previous : next));
  }, []);

  useLayoutEffect(() => {
    measure();
    const root = rootRef.current;
    if (!root) return;
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  });

  const fullOpacity = useTransform(progress, p => Math.min(1, Math.max(0, (p - fadeFrom) / (1 - fadeFrom))));
  const fullPointer = useTransform(progress, p => (p > 0.5 ? 'auto' : 'none'));
  const compactOpacity = useTransform(progress, p => 1 - Math.min(1, p / RELAY_SPAN));
  const travellersOpacity = useTransform(progress, p => Math.min(1, p / RELAY_SPAN));

  return (
    <StageContext.Provider value={{ progress, overlay, slots: boxes.slots, anchors: boxes.anchors }}>
      <div ref={rootRef} className="relative">
        <motion.div className="pointer-events-none absolute inset-x-0 top-0" style={{ opacity: compactOpacity }}>{compact}</motion.div>
        <motion.div style={{ opacity: fullOpacity, pointerEvents: fullPointer }}>{children}</motion.div>
        <motion.div ref={setOverlay} className="pointer-events-none absolute inset-0" style={{ opacity: travellersOpacity }} />
      </div>
    </StageContext.Provider>
  );
}
