import { AnimatePresence, motion } from 'framer-motion';
import { XMarkIcon, MegaphoneIcon, ExclamationTriangleIcon, ChevronLeftIcon, CheckCircleIcon } from '@heroicons/react/24/solid';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CmsPopup, CmsPopupLine } from '../services/cms';
import type { TrafficDetail } from '../types';
import { scrollByHand, useAutoScroll } from '../screen/useAutoScroll';
import { LineBadge } from './LineBadge';
import { MapSheet, MapSheetBottomSpacer } from './MapSheet';
import { getOptedOutIds, markOptedOut } from '../utils/optedOutPopups';
import { tx } from '../i18n';
import { formatTrafficEnd } from '../utils/trafficEnd';

interface PopupOverlayProps {
  popups: CmsPopup[];
  language: 'fr' | 'en';
  theme?: 'light' | 'dark';
  trafficFor?: (lineId: string) => TrafficDetail[];
  onOpenLine?: (line: CmsPopupLine) => void;
}

const STACK_MAX = 4;

const asBadgeLine = (line: CmsPopupLine) => ({
  id: line.id,
  shortName: line.short,
  color: line.color,
  textColor: line.textColor,
});

function PopupLineStack({
  lines,
  isLight,
  surface,
  onOpen,
  onHover,
  onWheelScroll,
  label,
}: {
  lines: CmsPopupLine[];
  isLight: boolean;
  surface: string;
  onOpen?: () => void;
  onHover?: (point: { x: number; y: number } | null) => void;
  onWheelScroll?: (delta: number) => void;
  label: string;
}) {
  const shown = lines.slice(0, STACK_MAX);
  const hoverRef = useRef<HTMLSpanElement>(null);
  const wheelRef = useRef(onWheelScroll);
  useEffect(() => { wheelRef.current = onWheelScroll; });
  useEffect(() => {
    const node = hoverRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      if (!wheelRef.current) return;
      event.preventDefault();
      wheelRef.current(event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [onOpen]);
  const extra = lines.length - shown.length;
  const badges = (
    <>
      {shown.map((line, index) => (
        <span
          key={line.id}
          className="rounded-[10px]"
          style={{
            marginLeft: index === 0 ? 0 : -8,
            boxShadow: `0 0 0 2px ${surface}`,
            zIndex: STACK_MAX - index,
            position: 'relative',
          }}
        >
          <LineBadge line={asBadgeLine(line)} size="xs" />
        </span>
      ))}
      {extra > 0 && (
        <span
          className="relative flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[0.6875rem] font-bold"
          style={{
            marginLeft: -6,
            boxShadow: `0 0 0 2px ${surface}`,
            backgroundColor: isLight ? '#e5e5e5' : '#262626',
            color: isLight ? '#171717' : '#f5f5f5',
          }}
        >
          +{extra}
        </span>
      )}
    </>
  );

  if (!onOpen) {
    return (
      <span
        ref={hoverRef}
        onMouseEnter={event => onHover?.({ x: event.clientX, y: event.clientY })}
        onMouseMove={event => onHover?.({ x: event.clientX, y: event.clientY })}
        onMouseLeave={() => onHover?.(null)}
        aria-label={label}
        role="img"
        className="ml-2 inline-flex translate-y-[-2px] cursor-default select-none items-center align-middle"
      >
        {badges}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      className="ml-2 inline-flex translate-y-[-2px] items-center align-middle transition active:scale-95"
    >
      {badges}
    </button>
  );
}

function PopupLineRow({
  line,
  traffic,
  language,
  isLight,
  onOpen,
  compact = false,
}: {
  line: CmsPopupLine;
  traffic: TrafficDetail[];
  language: 'fr' | 'en';
  isLight: boolean;
  onOpen?: () => void;
  compact?: boolean;
}) {
  const isFr = language === 'fr';
  const ink = isLight ? '#000000' : '#ffffff';
  const soft = isLight ? '#525252' : '#a3a3a3';
  const first = traffic[0];
  const end = first ? formatTrafficEnd(first.dateFin, language) : null;
  return (
    <div className={`flex items-center gap-3 ${compact ? 'py-2' : 'py-3'}`}>
      <LineBadge line={asBadgeLine(line)} size={compact ? 'xs' : 'sm'} />
      <div className="min-w-0 flex-1">
        <p className={`truncate font-semibold ${compact ? 'text-[0.8125rem]' : 'text-[0.9375rem]'}`} style={{ color: ink }}>
          {(tx(isFr).popupOverlay.line) + line.short}
          {line.name && !compact && <span className="font-normal" style={{ color: soft }}> · {line.name}</span>}
        </p>
        {first ? (
          <>
            <p className={`flex items-start gap-1 leading-snug text-amber-500 ${compact ? 'text-[0.75rem]' : 'text-[0.8125rem]'}`}>
              <ExclamationTriangleIcon className="mt-[2px] h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
              <span className={compact ? 'line-clamp-1' : 'line-clamp-2'}>{first.titre || (tx(isFr).popupOverlay.ongoingDisruption)}</span>
            </p>
            <p className="text-[0.75rem]" style={{ color: soft }}>
              {end
                ? (tx(isFr).popupOverlay.estimatedEndEnd(end))
                : (tx(isFr).popupOverlay.noEndDateGiven)}
              {traffic.length > 1 && tx(isFr).popupOverlay.moreCount(traffic.length - 1)}
            </p>
          </>
        ) : (
          <p className={`flex items-center gap-1 text-emerald-500 ${compact ? 'text-[0.75rem]' : 'text-[0.8125rem]'}`}>
            <CheckCircleIcon className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
            {tx(isFr).popupOverlay.noDisruptionReported}
          </p>
        )}
      </div>
      {onOpen && (
        <button
          type="button"
          onClick={onOpen}
          className="flex-shrink-0 rounded-full px-3.5 py-2 text-[0.8125rem] font-semibold transition active:scale-95"
          style={isLight ? { backgroundColor: '#000000', color: '#ffffff' } : { backgroundColor: '#ffffff', color: '#000000' }}
        >
          {tx(isFr).popupOverlay.open}
        </button>
      )}
    </div>
  );
}

const HOVER_WIDTH = 288;
const HOVER_HEIGHT = 240;

function PopupLinesHoverCard({
  lines,
  trafficFor,
  language,
  isLight,
  point,
  surface,
  scrollerRef,
}: {
  lines: CmsPopupLine[];
  trafficFor: (lineId: string) => TrafficDetail[];
  language: 'fr' | 'en';
  isLight: boolean;
  point: { x: number; y: number };
  surface: string;
  scrollerRef: { current: HTMLDivElement | null };
}) {
  const scrollRef = useAutoScroll<HTMLDivElement>({ holdTopMs: 1200, holdBottomMs: 1800, speed: 32 });
  useEffect(() => {
    scrollerRef.current = scrollRef.current;
    return () => { scrollerRef.current = null; };
  }, [scrollRef, scrollerRef]);
  const left = Math.max(8, Math.min(point.x + 12, window.innerWidth - HOVER_WIDTH - 8));
  const top = Math.max(8, Math.min(point.y + 12, window.innerHeight - HOVER_HEIGHT - 8));
  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      className={`pointer-events-none fixed z-[10002] overflow-hidden rounded-xl border shadow-xl ${isLight ? 'border-slate-200' : 'border-white/10'}`}
      style={{ left, top, width: HOVER_WIDTH, backgroundColor: surface }}
    >
      <div
        ref={scrollRef}
        className="max-h-56 overflow-hidden px-4 py-1"
        style={{ maskImage: 'linear-gradient(to bottom, transparent, black 10px, black calc(100% - 10px), transparent)' }}
      >
        {lines.map(line => (
          <PopupLineRow
            key={line.id}
            line={line}
            traffic={trafficFor(line.id)}
            language={language}
            isLight={isLight}
            compact
          />
        ))}
      </div>
    </motion.div>,
    document.body,
  );
}

const slideVariants = {
  enter: (direction: number) => ({ x: `${direction * 100}%`, opacity: 0.4 }),
  center: { x: '0%', opacity: 1 },
  exit: (direction: number) => ({ x: `${direction * -100}%`, opacity: 0.4 }),
};

function SlidingPages({
  page,
  direction,
  children,
}: {
  page: 'message' | 'lines';
  direction: number;
  children: React.ReactNode;
}) {
  return (
    <div className="relative overflow-x-hidden">
      <AnimatePresence initial={false} mode="popLayout" custom={direction}>
        <motion.div
          key={page}
          custom={direction}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ type: 'tween', duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

const noTraffic = () => [] as TrafficDetail[];

export function PopupOverlay({ popups, language, theme = 'dark', trafficFor = noTraffic, onOpenLine }: PopupOverlayProps) {
  const isLight = theme === 'light';
  const [visiblePopup, setVisiblePopup] = useState<CmsPopup | null>(null);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024);
  const [linesOpenFor, setLinesOpenFor] = useState<string | null>(null);
  const [hover, setHover] = useState<{ popupId: string; x: number; y: number } | null>(null);
  const [direction, setDirection] = useState(1);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [closedId, setClosedId] = useState<string | null>(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const optedOut = getOptedOutIds();
    const next = popups.find((p) => !optedOut.has(p.id));
    setVisiblePopup(next ?? null);
  }, [popups]);

  if (!visiblePopup) return null;

  const open = closedId !== visiblePopup.id;
  const linesOpen = linesOpenFor === visiblePopup.id;
  const hoverPoint = hover?.popupId === visiblePopup.id ? hover : null;
  const setLinesOpen = (open: boolean) => {
    setDirection(open ? 1 : -1);
    setLinesOpenFor(open ? visiblePopup.id : null);
    scrollerRef.current?.scrollTo({ top: 0 });
  };
  const handleStackHover = (point: { x: number; y: number } | null) => {
    setHover(point ? { popupId: visiblePopup.id, ...point } : null);
  };

  const handleClose = () => {
    setHover(null);
    setClosedId(visiblePopup.id);
  };

  const handleOptOut = () => {
    markOptedOut(visiblePopup.id);
    handleClose();
  };

  const openLine = (line: CmsPopupLine) => {
    handleClose();
    onOpenLine?.(line);
  };

  const isPromo = visiblePopup.type === 'promo';
  const isFr = language === 'fr';
  const lines = visiblePopup.target_lines ?? [];

  const ink = isLight ? '#000000' : '#ffffff';
  const soft = isLight ? '#525252' : '#a3a3a3';
  const faint = '#737373';
  const surface = isLight ? '#ffffff' : isMobile ? 'rgb(var(--gl-sheet-rgb))' : '#0b0b0b';
  const PopupIcon = isPromo ? MegaphoneIcon : ExclamationTriangleIcon;
  const linesLabel = tx(isFr).popupOverlay.lengthAffectedLineValue(lines.length, lines.length > 1 ? 's' : '');

  const content = (
    <>
      {visiblePopup.image_url && (
        <img src={visiblePopup.image_url} alt="" className="h-40 w-full object-cover" />
      )}
      <div className={`px-6 pb-8 ${isMobile ? 'pt-4' : 'pt-7'}`}>
        <PopupIcon className="h-12 w-12" style={{ color: ink }} aria-hidden="true" />
        <div>
          <p role="heading" aria-level={2} className="pt-6 text-[1.625rem] font-medium leading-[1.15]" style={{ color: ink }}>
            {visiblePopup.title}
            {lines.length > 0 && (
              <PopupLineStack
                lines={lines}
                isLight={isLight}
                surface={surface}
                label={linesLabel}
                onOpen={isMobile ? () => setLinesOpen(true) : undefined}
                onHover={isMobile ? undefined : handleStackHover}
                onWheelScroll={isMobile ? undefined : delta => {
                  if (bubbleRef.current) scrollByHand(bubbleRef.current, delta);
                }}
              />
            )}
          </p>
        </div>
        <p className="whitespace-pre-line pt-3 text-[1.0625rem] leading-snug" style={{ color: soft }}>
          {visiblePopup.message}
        </p>
        {visiblePopup.link_url && (
          <a
            href={visiblePopup.link_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block text-[0.9375rem] font-semibold underline underline-offset-4"
            style={{ color: ink }}
          >
            {tx(isFr).popupOverlay.learnMore}
          </a>
        )}
        <button
          type="button"
          onClick={handleClose}
          className="mt-8 w-full rounded-2xl py-4 text-[1.0625rem] font-semibold transition active:scale-[0.98]"
          style={isLight ? { backgroundColor: '#000000', color: '#ffffff' } : { backgroundColor: '#ffffff', color: '#000000' }}
        >
          {tx(isFr).popupOverlay.gotIt}
        </button>
        <button
          type="button"
          onClick={handleOptOut}
          className="mt-3 w-full py-1 text-[0.875rem] transition active:opacity-70"
          style={{ color: faint }}
        >
          {tx(isFr).popupOverlay.donTShowThis}
        </button>
      </div>
    </>
  );

  const linesList = (
    <div
      className={`px-6 ${isMobile ? 'pt-2' : 'pb-8 pt-5'}`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setLinesOpen(false)}
          aria-label={tx(isFr).popupOverlay.backToTheMessage}
          className="-ml-2 rounded-full p-1.5 transition active:scale-95"
          style={{ color: ink }}
        >
          <ChevronLeftIcon className="h-6 w-6" />
        </button>
        <p role="heading" aria-level={2} className="text-[1.375rem] font-medium" style={{ color: ink }}>
          {linesLabel}
        </p>
      </div>
      <p className="pb-2 pl-8 text-[0.875rem] leading-snug" style={{ color: soft }}>
        {visiblePopup.title}
      </p>
      <div className={`divide-y ${isLight ? 'divide-slate-200' : 'divide-white/10'}`}>
        {lines.map(line => (
          <PopupLineRow
            key={line.id}
            line={line}
            traffic={trafficFor(line.id)}
            language={language}
            isLight={isLight}
            onOpen={onOpenLine ? () => openLine(line) : undefined}
          />
        ))}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <MapSheet
        isOpen={open}
        onClose={handleClose}
        isLight={isLight}
        zIndex={10000}
        initialSnap={2}
      >
        <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <SlidingPages page={linesOpen ? 'lines' : 'message'} direction={direction}>
            {linesOpen ? linesList : content}
          </SlidingPages>
          <MapSheetBottomSpacer />
        </div>
      </MapSheet>
    );
  }

  return (
    <AnimatePresence>
      {open && (
      <motion.div
        key={visiblePopup.id}
        className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.4, ease: 'easeOut' } }}
        onClick={handleClose}
      >
        <motion.div
          className={`relative w-full max-w-sm rounded-3xl border shadow-2xl ${isLight ? 'border-slate-200' : 'border-white/10'}`}
          style={{ backgroundColor: surface }}
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, transition: { duration: 0.4, ease: 'easeOut' } }}
          onClick={(e) => e.stopPropagation()}
        >
          <div ref={scrollerRef} className="max-h-[85vh] overflow-y-auto overflow-x-hidden rounded-3xl">
            <SlidingPages page={linesOpen ? 'lines' : 'message'} direction={direction}>
              {linesOpen ? linesList : content}
            </SlidingPages>
          </div>

          <AnimatePresence>
            {hoverPoint && !linesOpen && (
              <PopupLinesHoverCard
                lines={lines}
                trafficFor={trafficFor}
                language={language}
                isLight={isLight}
                point={hoverPoint}
                surface={surface}
                scrollerRef={bubbleRef}
              />
            )}
          </AnimatePresence>

          <button
            onClick={handleClose}
            className="absolute right-3 top-3 rounded-full bg-black/30 p-1.5 text-white hover:bg-black/50"
            aria-label={tx(isFr).popupOverlay.close}
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </motion.div>
      </motion.div>
      )}
    </AnimatePresence>
  );
}
