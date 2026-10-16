import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, ExclamationTriangleIcon, XMarkIcon } from '@heroicons/react/24/solid';
import { FaWalking } from 'react-icons/fa';
import { LineBadge } from './LineBadge';
import { RealtimeWifi } from './RealtimeWifi';
import { EndpointDot, MiniTimeline, StopTimeline } from './navigation/GuidanceParts';
import { FOLLOW_PANEL_WIDTH, navPalette } from './navigation/palette';
import { fetchShare, forgetFollowToken, isShareAvailable, watchShare, type SharePayload } from '../services/tripShare';
import { tx } from '../i18n';
import { collapsedNavPadding, MapSheet, MapSheetBottomSpacer, NAVBAR_LIFT_PX, NAVBAR_SNAP_PX } from './MapSheet';
import { NAV_ITEM_WIDTH } from './MobileNavBar';

const PANEL_WIDTH = FOLLOW_PANEL_WIDTH;
const DESKTOP_TOP = 16;
const DESKTOP_BOTTOM = 64;
const PILL_HEIGHT = 72;
const MINI_BAR_BOTTOM = NAVBAR_SNAP_PX + NAVBAR_LIFT_PX + 8;
const MINI_BAR_HEIGHT = 52;
const PEEK_MS = 6000;
const AUTO_CLOSE_MS = 8000;

function clock(ms: number | null | undefined, isFr: boolean): string {
  if (!ms) return '';
  return new Date(ms).toLocaleTimeString(isFr ? 'fr-FR' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
}

function stopLabel(value: string): string {
  return value.replace(/^[^,]+,\s*/, '');
}

export function FollowOverlay({
  token,
  language,
  isLight,
  isMobile,
  onPayload,
  onMinimizedChange,
  onClose,
  hidden = false,
}: {
  token: string;
  language: 'fr' | 'en';
  isLight: boolean;
  isMobile: boolean;
  onPayload: (payload: SharePayload | null, ended: boolean) => void;
  onMinimizedChange?: (minimized: boolean) => void;
  onClose: () => void;
  hidden?: boolean;
}) {
  const isFr = language === 'fr';
  const t = tx(isFr).followPage;
  const palette = navPalette(isLight);
  const [payload, setPayload] = useState<SharePayload | null>(null);
  const [ended, setEnded] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [minimized, setMinimized] = useState(false);
  const [lookup, setLookup] = useState<'checking' | 'unknown' | 'ok'>('checking');

  useEffect(() => {
    let cancelled = false;
    void fetchShare(token).then(result => {
      if (cancelled) return;
      if (result.state === 'unknown') {
        forgetFollowToken();
        setLookup('unknown');
        return;
      }
      setLookup('ok');
      if (result.state === 'found' && result.payload) {
        const initial = result.payload;
        setPayload(previous =>
          previous
            ? {
                ...initial,
                ...previous,
                legs: previous.legs ?? initial.legs,
                path: previous.path && previous.path.length > 0 ? previous.path : initial.path,
              }
            : initial,
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [token]);
  const [now, setNow] = useState(() => Date.now());
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const desktopScrollRef = useRef<HTMLDivElement | null>(null);
  const peekUntilRef = useRef(0);

  const scrollToAnchor = () => {
    const container = desktopScrollRef.current;
    if (!container) return;
    const anchor = container.querySelector<HTMLElement>('[data-timeline-anchor]');
    if (!anchor) return;
    const offset = anchor.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
    const target = Math.max(0, offset - container.clientHeight * 0.35);
    if (Math.abs(target - container.scrollTop) > 8) container.scrollTo({ top: target, behavior: 'smooth' });
  };

  useEffect(() => {
    if (minimized || Date.now() < peekUntilRef.current) return;
    scrollToAnchor();
  });

  const onDesktopWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const container = desktopScrollRef.current;
    if (!container || Math.abs(event.deltaY) < 4) return;
    if (event.deltaY < 0) {
      peekUntilRef.current = Date.now() + PEEK_MS;
      container.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      peekUntilRef.current = 0;
      scrollToAnchor();
    }
  };

  useEffect(() => {
    const onResize = () => {
      setViewportHeight(window.innerHeight);
      setViewportWidth(window.innerWidth);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    return watchShare(token, {
      onUpdate: next => {
        setPayload(next);
        if (next.status === 'arrived') {
          forgetFollowToken();
          setEnded(true);
        }
      },
      onEnd: last => {
        forgetFollowToken();
        setPayload(previous => (previous ? ({ ...previous, ...last } as SharePayload) : previous));
        setEnded(true);
      },
    });
  }, [token]);

  useEffect(() => {
    if (!ended) return;
    const timer = window.setTimeout(() => onCloseRef.current(), AUTO_CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [ended]);

  useEffect(() => {
    onPayload(payload, ended);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, ended]);

  useEffect(() => {
    onMinimizedChange?.(minimized);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minimized]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const name = payload?.name?.trim() || t.someone;
  const minutesLeft = payload?.arrivalAt ? Math.max(0, Math.round((payload.arrivalAt - now) / 60000)) : null;
  const secondsAgo = payload ? Math.max(0, Math.round((now - payload.at) / 1000)) : 0;
  const stale = secondsAgo > 90;
  const live = Boolean(payload) && !ended && !stale;
  const etaText = payload
    ? [clock(payload.arrivalAt, isFr), !ended && minutesLeft !== null ? t.inMinutes(minutesLeft) : ''].filter(Boolean).join(' · ')
    : '';
  const segments = payload?.segments ?? [];

  const avatar = (
    <span
      className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-[1.375rem]"
      style={{ backgroundColor: ended ? '#ffffff' : palette.box }}
      aria-hidden="true"
    >
      {ended ? <CheckIcon className="h-6 w-6 text-black" /> : payload?.avatar || '🙂'}
    </span>
  );

  const iconButton = (label: string, onClick: () => void, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full transition active:scale-95"
      style={{ backgroundColor: palette.box, color: palette.ink }}
    >
      {icon}
    </button>
  );

  const unknown = lookup === 'unknown' && !payload;

  const body = (
    <AnimatePresence mode="wait" initial={false}>
      {unknown ? (
        <motion.div key="unknown" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <ExclamationTriangleIcon className="mt-2 h-12 w-12" style={{ color: palette.ink }} aria-hidden="true" />
          <p role="heading" aria-level={2} className="pt-6 text-[1.625rem] font-medium leading-[1.15]" style={{ color: palette.ink }}>
            {t.unknownTrip}
          </p>
          <p className="pt-3 text-[1.0625rem] leading-snug" style={{ color: palette.soft }}>
            {t.unknownTripHint}
          </p>
          {isMobile && (
            <button
              type="button"
              onClick={onClose}
              className="mt-8 block w-full rounded-2xl py-4 text-center text-[1.0625rem] font-semibold transition active:scale-[0.98]"
              style={isLight ? { backgroundColor: '#000000', color: '#ffffff' } : { backgroundColor: '#ffffff', color: '#000000' }}
            >
              {t.closeFollow}
            </button>
          )}
        </motion.div>
      ) : !isShareAvailable || !payload ? (
        <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <p role="heading" aria-level={2} className="pt-5 text-[1.625rem] font-medium leading-[1.15]" style={{ color: palette.ink }}>
            {isShareAvailable ? t.waitingForPosition : t.unavailable}
          </p>
          {isShareAvailable && (
            <p className="pt-3 text-[1.0625rem] leading-snug" style={{ color: palette.soft }}>
              {t.waitingHint}
            </p>
          )}
        </motion.div>
      ) : (
        <motion.div key="live" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <p role="heading" aria-level={2} className="pt-5 text-[1.625rem] font-medium leading-[1.15]" style={{ color: palette.ink }}>
            {ended ? t.ended : t.isOnTheWay(name)}
          </p>
          <p className="pt-2 text-[1.0625rem] leading-snug tabular-nums" style={{ color: palette.soft }}>
            {[t.arrivingAt(stopLabel(payload.destination)), etaText].filter(Boolean).join(' · ')}
          </p>

          {segments.length > 0 && (
            <div className="pt-6">
              <MiniTimeline
                segments={segments.map(segment => ({ ...segment, done: false }))}
                progress={payload.progress ?? 0}
                palette={palette}
              />
            </div>
          )}

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={payload.headline}
              className="mt-5 flex items-center gap-3 border-t py-4"
              style={{ borderColor: palette.rule }}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
            >
              {payload.line ? (
                <LineBadge
                  line={{ id: payload.line, shortName: payload.line, color: payload.lineColor || '#3b82f6', textColor: payload.lineText || '#ffffff' }}
                  size="sm"
                />
              ) : ended ? (
                <EndpointDot palette={palette} />
              ) : (
                <FaWalking size={18} className="flex-shrink-0" style={{ color: palette.ink }} />
              )}
              <p className="min-w-0 flex-1 text-[1.0625rem] leading-snug" style={{ color: palette.ink }}>
                {payload.headline}
              </p>
            </motion.div>
          </AnimatePresence>

          {payload.timeline && payload.timeline.length > 0 && (
            <div className="border-t pt-5" style={{ borderColor: palette.rule }}>
              <StopTimeline steps={payload.timeline} palette={palette} moreLabel={tx(isFr).navigationMode.moreStops} />
            </div>
          )}

          {ended && (
            <p className="pt-4 text-[0.9375rem]" style={{ color: palette.soft }}>
              {t.endedHint}
            </p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );

  const header = unknown ? null : (
    <div className="flex items-center gap-2">
      {avatar}
      {live && <RealtimeWifi size={18} className="ml-1 text-green-400" label={t.live} />}
      <span className="flex-1" />
      {iconButton(t.minimize, () => setMinimized(true), <ChevronDownIcon className="h-5 w-5" />)}
      {isMobile && iconButton(t.stopFollowing, onClose, <XMarkIcon className="h-5 w-5" />)}
    </div>
  );

  const primaryStyle = isLight ? { backgroundColor: '#000000', color: '#ffffff' } : { backgroundColor: '#ffffff', color: '#000000' };

  const pillContent = (
    <>
      {avatar}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[1.0625rem]" style={{ color: palette.ink }}>
          {unknown ? t.unknownTrip : payload ? (ended ? t.ended : t.isOnTheWay(name)) : t.waitingForPosition}
        </span>
        {payload && (
          <span className="block truncate text-[0.9375rem] tabular-nums" style={{ color: palette.soft }}>
            {etaText || payload.headline}
          </span>
        )}
      </span>
      {live && <RealtimeWifi size={16} className="text-green-400" label={t.live} />}
      <ChevronUpIcon className="mr-1 h-5 w-5 flex-shrink-0" style={{ color: palette.soft }} />
    </>
  );

  const navPadding = collapsedNavPadding(viewportWidth, NAV_ITEM_WIDTH);

  const miniContent = (
    <>
      <span
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-[1.125rem]"
        style={{ backgroundColor: ended ? '#ffffff' : palette.box }}
        aria-hidden="true"
      >
        {ended ? <CheckIcon className="h-5 w-5 text-black" /> : payload?.avatar || '🙂'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.9375rem] font-semibold leading-tight" style={{ color: palette.ink }}>
          {unknown ? t.unknownTrip : payload ? (ended ? t.ended : t.isOnTheWay(name)) : t.waitingForPosition}
        </span>
        {payload && (
          <span className="block truncate text-[0.8125rem] leading-tight tabular-nums" style={{ color: palette.soft }}>
            {etaText || payload.headline}
          </span>
        )}
      </span>
      {live && <RealtimeWifi size={15} className="text-green-400" label={t.live} />}
      <ChevronUpIcon className="h-5 w-5 flex-shrink-0" style={{ color: palette.soft }} />
    </>
  );

  const panelStyle = {
    backgroundColor: palette.surface,
    borderColor: palette.cardBorder,
    borderRadius: 30,
    boxShadow: isLight ? '0 20px 50px rgba(148,163,184,0.3)' : '0 12px 32px rgba(0,0,0,0.5)',
  };

  const desktopHeight = Math.max(320, viewportHeight - DESKTOP_TOP - DESKTOP_BOTTOM);

  if (!isMobile) {
    return createPortal(
      <motion.aside
        className="fixed right-4 z-[1200] overflow-hidden border"
        style={{ ...panelStyle, width: PANEL_WIDTH, bottom: DESKTOP_BOTTOM }}
        initial={{ height: desktopHeight, opacity: 0, y: 24 }}
        animate={{ height: minimized ? PILL_HEIGHT : desktopHeight, opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 240, damping: 32 }}
      >
        <AnimatePresence initial={false}>
          {minimized ? (
            <motion.button
              key="mini"
              type="button"
              onClick={() => setMinimized(false)}
              className="absolute inset-0 flex items-center gap-3 px-4 text-left"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { delay: 0.15, duration: 0.2 } }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              aria-label={t.expand}
            >
              {pillContent}
            </motion.button>
          ) : (
            <motion.div
              key="full"
              className="absolute inset-x-0 bottom-0 flex flex-col px-7 pb-7 pt-6"
              style={{ height: desktopHeight }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { delay: 0.1, duration: 0.25 } }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
            >
              {header}
              <div ref={desktopScrollRef} onWheel={onDesktopWheel} className="min-h-0 flex-1 overflow-hidden">{body}</div>
              {(
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-6 block w-full flex-shrink-0 rounded-2xl py-4 text-center text-[1.0625rem] font-semibold transition active:scale-[0.98]"
                  style={primaryStyle}
                >
                  {t.closeFollow}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.aside>,
      document.body,
    );
  }

  return (
    <>
      <MapSheet isOpen={!minimized} onClose={() => setMinimized(true)} isLight={isLight} zIndex={1200}>
        <div className="px-6 pb-8 pt-1">
          {header}
          {body}
          <MapSheetBottomSpacer />
        </div>
      </MapSheet>
      {createPortal(
        <AnimatePresence>
          {minimized && !hidden && (
            <motion.button
              key="follow-mini-bar"
              type="button"
              onClick={() => setMinimized(false)}
              className="fixed z-[1200] flex items-center gap-2.5 border pl-1.5 pr-4 text-left"
              style={{
                left: navPadding,
                right: navPadding,
                bottom: MINI_BAR_BOTTOM,
                height: MINI_BAR_HEIGHT,
                borderRadius: MINI_BAR_HEIGHT / 2,
                backgroundColor: isLight ? 'rgba(255,255,255,0.72)' : 'rgba(var(--gl-sheet-rgb),0.72)',
                borderColor: isLight ? 'rgba(203,213,225,0.7)' : 'rgba(var(--gl-sheet-border-rgb),0.16)',
                backdropFilter: 'saturate(150%) blur(10px)',
                WebkitBackdropFilter: 'saturate(150%) blur(10px)',
              }}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ type: 'tween', duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
              aria-label={t.expand}
            >
              {miniContent}
            </motion.button>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
