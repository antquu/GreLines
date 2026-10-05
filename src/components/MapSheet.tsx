import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { interpolate, motion, useMotionTemplate, useMotionValue, useTransform, type MotionValue } from 'framer-motion';
import { Sheet, type SheetRef } from 'react-modal-sheet';
import { NAV_ITEM_WIDTH } from './MobileNavBar';

export const NAVBAR_SNAP_PX = 108;

export const HANDLE_BAND_PX = 18;

export const COMPACT_SHRINK_PX = 20;
export const COMPACT_ITEM_WIDTH = 56;

export const SHEET_PADDING = 8;

export const NAVBAR_LIFT_PX = 10;

export const SHEET_RADIUS = 30;

export const SHEET_FLOATING_BOTTOM_RADIUS = 46;

export const LAST_SNAP = 3;

export const NAVBAR_SNAP = 1;

export function readSafeAreaBottom(): number {
  return 0;
}

export function collapsedNavPadding(
  viewportWidth: number,
  itemWidth: number,
  itemCount = 4,
): number {
  const natural = itemCount * itemWidth + SHEET_PADDING * 2;
  const width = Math.min(natural, viewportWidth - 32);
  return Math.max(SHEET_PADDING, Math.round((viewportWidth - width) / 2));
}

export function useSnapValue<T extends string | number>(output: T[], fallback: T) {
  const { snapPoints, y } = Sheet.useContext();

  return useTransform(y, value => {
    if (snapPoints.length !== output.length) return fallback;
    const mix = interpolate(
      [...snapPoints].reverse().map(point => point.snapValueY),
      [...output].reverse(),
    );
    return mix(value);
  });
}

export function mapSheetSnapPoints(options: {
  bottomInset: number;
  noHandle?: boolean;
  compact?: boolean;
}): number[] {
  return [
    0,
    NAVBAR_SNAP_PX
      + NAVBAR_LIFT_PX
      - (options.noHandle ? HANDLE_BAND_PX : 0)
      - (options.compact ? COMPACT_SHRINK_PX : 0)
      + options.bottomInset,
    0.6,
    1,
  ];
}


export const COMPACT_SHEET_PX = 140;
const COMPACT_SNAP_INDEX = 2;

const MapSheetCompactContext = createContext<MotionValue<number> | null>(null);
const MapSheetBottomContext = createContext<MotionValue<number> | null>(null);

export function useMapSheetBottomOffset(): MotionValue<number> | null {
  return useContext(MapSheetBottomContext);
}

export function MapSheetBottomSpacer() {
  const hidden = useMapSheetBottomOffset();
  return (
    <>
      <motion.div aria-hidden="true" style={{ height: hidden ?? 0 }} />
      <div aria-hidden="true" style={{ height: 'calc(env(safe-area-inset-bottom) + 24px)' }} />
    </>
  );
}

export function useMapSheetCompactProgress(): MotionValue<number> | null {
  return useContext(MapSheetCompactContext);
}

function CompactProgressProvider({ children }: { children: React.ReactNode }) {
  const { y, snapPoints } = Sheet.useContext();
  const progress = useTransform(y, value => {
    const compactY = snapPoints[2]?.snapValueY;
    const middleY = snapPoints[3]?.snapValueY;
    if (compactY === undefined || middleY === undefined || compactY === middleY) return 1;
    return Math.min(1, Math.max(0, (compactY - value) / (compactY - middleY)));
  });
  return <MapSheetCompactContext.Provider value={progress}>{children}</MapSheetCompactContext.Provider>;
}

function perSnap<T>(values: [T, T, T, T], compact: boolean, compactValue?: T, peek = false): T[] {
  if (peek) return [values[0], values[1], values[2], values[2], values[3]];
  if (!compact) return values;
  return [values[0], values[1], compactValue ?? values[2], values[2], values[3]];
}

export function MapSheetShell({
  isLight,
  bottomInset,
  collapsedPadding,
  zIndex = 10,
  compact = false,
  peek = false,
  id,
  children,
}: {
  isLight: boolean;
  bottomInset: number;
  collapsedPadding: number;
  zIndex?: number;
  compact?: boolean;
  peek?: boolean;
  id?: string;
  children: React.ReactNode;
}) {
  const { y, yProgress } = Sheet.useContext();

  const paddingHorizontal = useSnapValue(
    perSnap([collapsedPadding, collapsedPadding, SHEET_PADDING, 0], compact, undefined, peek),
    collapsedPadding,
  );
  const paddingBottom = useSnapValue(
    perSnap(
      [
        SHEET_PADDING + NAVBAR_LIFT_PX + bottomInset,
        SHEET_PADDING + NAVBAR_LIFT_PX + bottomInset,
        SHEET_PADDING + bottomInset,
        0,
      ],
      compact,
      SHEET_PADDING + NAVBAR_LIFT_PX + bottomInset,
      peek,
    ),
    SHEET_PADDING + bottomInset,
  );
  const borderBottomRadius = useSnapValue(
    perSnap([SHEET_RADIUS, SHEET_RADIUS, SHEET_FLOATING_BOTTOM_RADIUS, 0], compact, undefined, peek),
    SHEET_RADIUS,
  );

  const surfaceAlpha = useTransform(yProgress, [0.7, 1], [0.72, 0.98]);
  const backgroundColor = useMotionTemplate`rgba(${isLight ? '255, 255, 255' : 'var(--gl-sheet-rgb)'}, ${surfaceAlpha})`;

  const borderAlpha = useTransform(yProgress, [0.7, 1], [isLight ? 0.7 : 0.16, 0]);
  const borderColor = useMotionTemplate`rgba(${isLight ? '203, 213, 225' : 'var(--gl-sheet-border-rgb)'}, ${borderAlpha})`;

  const clipPath = useMotionTemplate`inset(0px 0px calc(${y}px + ${paddingBottom}px) 0px round ${borderBottomRadius}px)`;
  const hiddenBottom = useTransform(() => y.get() + paddingBottom.get());

  const dragStartRef = useRef<{ y: number } | null>(null);
  const onPointerDownCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    dragStartRef.current = { y: event.clientY };
  };
  const onPointerMoveCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    if (!start || event.clientY - start.y < 10) return;
    dragStartRef.current = null;
    const active = document.activeElement as HTMLElement | null;
    if (active && event.currentTarget.contains(active) && /^(INPUT|TEXTAREA)$/.test(active.tagName)) active.blur();
  };
  const onPointerEnd = () => { dragStartRef.current = null; };

  return (
    <Sheet.Container
      id={id}
      onPointerDownCapture={onPointerDownCapture}
      onPointerMoveCapture={onPointerMoveCapture}
      onPointerUpCapture={onPointerEnd}
      onPointerCancelCapture={onPointerEnd}
      style={{
        ['--gl-sheet-padding' as string]: paddingHorizontal,
        width: 'calc(100% - var(--gl-sheet-padding) * 2px)',
        margin: '0 calc(var(--gl-sheet-padding) * 1px)',
        borderTopLeftRadius: `${SHEET_RADIUS}px`,
        borderTopRightRadius: `${SHEET_RADIUS}px`,
        borderWidth: '1px',
        borderStyle: 'solid',
        borderBottom: 'none',
        boxShadow: 'none',
        backdropFilter: 'saturate(150%) blur(10px)',
        backgroundColor,
        borderColor,
        clipPath,
        zIndex,
      }}
    >
      <MapSheetBottomContext.Provider value={hiddenBottom}>{children}</MapSheetBottomContext.Provider>
    </Sheet.Container>
  );
}

export function MapSheetBody({ children, compact = false, peek = false }: { children: React.ReactNode; compact?: boolean; peek?: boolean }) {
  const opacity = useSnapValue(perSnap([0, 0, 1, 1], compact, 1, peek), 1);
  return <motion.div className="flex min-h-0 flex-1 flex-col" style={{ opacity }}>{children}</motion.div>;
}

export function SmoothSheetContent({
  children,
  style,
  locked = false,
}: {
  children: React.ReactNode;
  style?: React.ComponentProps<typeof Sheet.Content>['style'];
  locked?: boolean;
}) {
  const { currentSnap, snapPoints } = Sheet.useContext();
  const expanded = locked || currentSnap === undefined || currentSnap >= snapPoints.length - 1;
  return (
    <Sheet.Content
      disableScroll={!expanded}
      disableDrag={state => locked || (expanded && state.scrollPosition !== undefined && state.scrollPosition !== 'top')}
      scrollStyle={expanded ? undefined : { touchAction: 'pan-x' }}
      style={style}
    >
      {children}
    </Sheet.Content>
  );
}

function MapSheetContentArea({
  fitVisible,
  children,
}: {
  fitVisible: boolean;
  children: React.ReactNode;
}) {
  const hidden = useMapSheetBottomOffset();
  return (
    <SmoothSheetContent style={fitVisible && hidden ? { paddingBottom: hidden } : undefined}>
      {children}
    </SmoothSheetContent>
  );
}

function MapSheetFooter({ compact, children }: { compact: boolean; children: React.ReactNode }) {
  const { y, snapPoints } = Sheet.useContext();
  const noOffset = useMotionValue(0);
  const hidden = useMapSheetBottomOffset() ?? noOffset;
  const opacity = useTransform(y, value => {
    if (!compact) return 1;
    const compactY = snapPoints[COMPACT_SNAP_INDEX]?.snapValueY;
    const middleY = snapPoints[COMPACT_SNAP_INDEX + 1]?.snapValueY;
    if (compactY === undefined || middleY === undefined || compactY === middleY) return 1;
    const progress = (compactY - value) / (compactY - middleY);
    return Math.min(1, Math.max(0, (progress - 0.5) / 0.5));
  });
  const pointerEvents = useTransform(opacity, value => (value > 0.5 ? 'auto' : 'none'));
  return (
    <motion.div className="absolute inset-x-0 z-20" style={{ bottom: hidden, opacity, pointerEvents }}>
      {children}
    </motion.div>
  );
}

export function MapSheet({
  isOpen,
  onClose,
  isLight,
  zIndex = 10,
  initialSnap = 2,
  compactSnap = false,
  collapseSignal,
  footer,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  isLight: boolean;
  zIndex?: number;
  initialSnap?: number;
  compactSnap?: boolean;
  collapseSignal?: number;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const safeBottom = useMemo(readSafeAreaBottom, []);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === 'undefined' ? 375 : window.innerWidth,
  );
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const snapPoints = useMemo(() => {
    const base = mapSheetSnapPoints({ bottomInset: safeBottom });
    return compactSnap ? [base[0], base[1], COMPACT_SHEET_PX + safeBottom, base[2], base[3]] : base;
  }, [safeBottom, compactSnap]);
  const effectiveInitialSnap = compactSnap && initialSnap >= 2 ? initialSnap + 1 : initialSnap;

  const collapsedPadding = useMemo(
    () => collapsedNavPadding(viewportWidth, NAV_ITEM_WIDTH),
    [viewportWidth],
  );

  const hasSettledRef = useRef(false);
  useEffect(() => { hasSettledRef.current = false; }, [isOpen]);

  const sheetRef = useRef<SheetRef>(null);
  const currentSnapRef = useRef(effectiveInitialSnap);
  const restingSnap = compactSnap ? COMPACT_SNAP_INDEX : NAVBAR_SNAP + 1;
  useEffect(() => {
    if (!collapseSignal || !isOpen) return;
    if (currentSnapRef.current > restingSnap) sheetRef.current?.snapTo(restingSnap);
  }, [collapseSignal]);

  return (
    <Sheet
      ref={sheetRef}
      style={{ zIndex }}
      isOpen={isOpen}
      onClose={onClose}
      snapPoints={snapPoints}
      initialSnap={effectiveInitialSnap}
      onOpenEnd={() => sheetRef.current?.snapTo(effectiveInitialSnap)}
      onSnap={index => {
        currentSnapRef.current = index;
        if (index > NAVBAR_SNAP) { hasSettledRef.current = true; return; }
        if (hasSettledRef.current) onClose();
      }}
    >
      <MapSheetShell
        isLight={isLight}
        bottomInset={safeBottom}
        collapsedPadding={collapsedPadding}
        zIndex={zIndex}
        compact={compactSnap}
      >
        <Sheet.Header>
          <div className="flex justify-center pt-2 pb-1">
            <div className={`h-1.5 w-16 rounded-full ${isLight ? 'bg-slate-300' : 'bg-white/30'}`} />
          </div>
        </Sheet.Header>
        <MapSheetContentArea fitVisible={Boolean(footer)}>
          {compactSnap ? (
            <CompactProgressProvider>
              <MapSheetBody compact>{children}</MapSheetBody>
            </CompactProgressProvider>
          ) : (
            <MapSheetBody>{children}</MapSheetBody>
          )}
        </MapSheetContentArea>
        {footer && <MapSheetFooter compact={compactSnap}>{footer}</MapSheetFooter>}
      </MapSheetShell>
    </Sheet>
  );
}
