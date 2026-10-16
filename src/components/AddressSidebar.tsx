import { motion } from 'framer-motion';
import { MapSheet } from './MapSheet';
import { PaperAirplaneIcon, XMarkIcon } from '@heroicons/react/24/solid';
import { FaWalking, FaWheelchair } from 'react-icons/fa';
import type { Stop } from '../types';
import type { AddressResult } from '../services/geocoding';
import { findClosestStops, formatDistance } from '../utils/geo';
import { useEffect, useMemo, useState } from 'react';
import type { Line } from '../types';
import { getStopLines } from '../services/api';
import { LineBadge } from './LineBadge';
import { sortStopPreviewLines } from '../utils/lineOrder';
import { useAccessibleStops } from '../hooks/useAccessibleStops';
import { isStopAccessible } from '../services/stopAccessibility';
import { tx } from '../i18n';

interface AddressSidebarProps {
  address: AddressResult | null;
  stops: Stop[];
  isOpen: boolean;
  onClose: () => void;
  onStopClick: (stop: Stop) => void;
  isMobile: boolean;
  language: 'fr' | 'en';
  onOpenItinerary?: () => void;
  theme?: 'light' | 'dark';
}

const WALK_METRES_PER_MINUTE = 75;
const MAX_WALK_METERS = 2000;

const walkMinutes = (meters: number): number => Math.max(1, Math.ceil(meters / WALK_METRES_PER_MINUTE));

const getText = (language: 'fr' | 'en') => ({
  title: tx(language === 'fr').addressSidebar.address,
  subtitle: tx(language === 'fr').addressSidebar.theNearestStopsOn,
  tag: tx(language === 'fr').addressSidebar.address,
  onFoot: tx(language === 'fr').addressSidebar.stopsOnFoot,
  closest: tx(language === 'fr').addressSidebar.closest,
  accessible: tx(language === 'fr').addressSidebar.wheelchairAccessibleStop,
  minute: 'min',
  stopsCount: (n: number) =>
    tx(language === 'fr').addressSidebar.nStopValue(n, n > 1 ? 's' : ''),
  noStops:
    tx(language === 'fr').addressSidebar.noStopFoundAround,
  close: tx(language === 'fr').addressSidebar.close,
  goThere: tx(language === 'fr').addressSidebar.goThere,
});

const MAX_BADGES = 5;

function displayName(stop: Stop): string {
  const city = stop.city?.trim();
  if (!city || !stop.name.toLowerCase().startsWith(city.toLowerCase())) return stop.name;
  const rest = stop.name.slice(city.length).replace(/^[\s,-]+/, '').trim();
  return rest.length > 0 ? rest : stop.name;
}

const WalkCard = ({
  stop,
  meters,
  isFirst,
  accessible,
  lines,
  onClick,
  language,
  text,
  delay,
  isLight,
}: {
  stop: Stop;
  meters: number;
  isFirst: boolean;
  accessible: boolean;
  lines: Line[];
  onClick: () => void;
  language: 'fr' | 'en';
  text: ReturnType<typeof getText>;
  delay: number;
  isLight: boolean;
}) => {
  const muted = isLight ? '#64748b' : 'rgba(255,255,255,0.6)';
  const sorted = sortStopPreviewLines(lines);
  const visible = sorted.slice(0, MAX_BADGES);
  const overflow = sorted.length - visible.length;

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.22, ease: 'easeOut' }}
      onClick={onClick}
      className={`w-full rounded-[22px] px-5 py-4 text-left transition active:scale-[0.99] ${
        isFirst ? 'ring-2 ring-blue-500' : isLight ? 'ring-1 ring-slate-200 hover:ring-slate-300' : 'ring-1 ring-white/10 hover:ring-white/20'
      }`}
      style={{ backgroundColor: isLight ? '#ffffff' : '#000000' }}
    >
      <div className="flex items-start gap-3">
        <h3
          style={{
            fontSize: '20px',
            lineHeight: 1.2,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            color: isLight ? '#0f172a' : '#ffffff',
            margin: 0,
            flex: '1 1 auto',
            minWidth: 0,
          }}
          className="truncate"
        >
          {displayName(stop)}
        </h3>
        {accessible && (
          <span
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-600"
            title={text.accessible}
          >
            <FaWheelchair size={14} style={{ color: '#ffffff' }} />
          </span>
        )}
      </div>

      <p className="mt-1 truncate text-[0.875rem] leading-snug" style={{ color: muted }}>
        {isFirst && <span className={`font-semibold ${isLight ? 'text-blue-600' : 'text-blue-400'}`}>{text.closest} · </span>}
        {formatDistance(meters, language)}
        {stop.city ? ` · ${stop.city}` : ''}
      </p>

      <div className="mt-3.5 flex items-end gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {visible.map(line => (
            <LineBadge key={line.routeId || line.id} line={line} size="xs" />
          ))}
          {overflow > 0 && (
            <span
              className="tabular flex h-6 items-center rounded-full px-2 text-[0.625rem] font-bold"
              style={{ backgroundColor: isLight ? '#f1f5f9' : 'rgba(255,255,255,0.1)', color: muted }}
            >
              +{overflow}
            </span>
          )}
        </div>
        <span className="flex flex-shrink-0 items-center gap-1.5" style={{ color: isLight ? '#0f172a' : '#ffffff' }}>
          <FaWalking size={15} style={{ color: muted }} aria-hidden="true" />
          <span className="tabular text-[1.25rem] font-bold leading-none">{walkMinutes(meters)}</span>
          <span className="text-[0.8125rem] font-medium" style={{ color: muted }}>{text.minute}</span>
        </span>
      </div>
    </motion.button>
  );
};

export const AddressSidebar = ({
  address,
  stops,
  isOpen,
  onClose,
  onStopClick,
  isMobile,
  language,
  onOpenItinerary,
  theme = 'dark',
}: AddressSidebarProps) => {
  const text = getText(language);
  const isLight = theme === 'light';
  const ink = isLight ? '#0f172a' : '#ffffff';
  const muted = isLight ? '#64748b' : '#94a3b8';
  const accessibleStops = useAccessibleStops();

  const nearbyStops = useMemo(() => {
    if (!address) return [];
    return findClosestStops(stops, address.lat, address.lon, 8).filter(entry => entry.meters <= MAX_WALK_METERS);
  }, [address, stops]);

  const [linesByStop, setLinesByStop] = useState<Record<string, Line[]>>({});
  useEffect(() => {
    if (!isOpen || nearbyStops.length === 0) return;
    let cancelled = false;
    for (const { stop } of nearbyStops) {
      if (linesByStop[stop.id]) continue;
      void getStopLines(stop.id)
        .then(lines => {
          if (!cancelled) setLinesByStop(prev => ({ ...prev, [stop.id]: lines }));
        })
        .catch(() => { });
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, nearbyStops.map(entry => entry.stop.id).join('|')]);

  if (!address) return null;

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold" style={{ color: ink }}>{text.title}</p>
          <p className="mt-0.5 text-xs" style={{ color: muted }}>{text.subtitle}</p>
        </div>
        <button
          onClick={onClose}
          aria-label={text.close}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border transition"
          style={isLight
            ? { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0', color: '#0f172a' }
            : { backgroundColor: '#1e293b', borderColor: '#334155', color: '#ffffff' }}
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>

      <div
        className="mt-5 flex items-center justify-between gap-3 rounded-2xl border px-4 py-3"
        style={isLight
          ? { backgroundColor: '#ffffff', borderColor: '#e2e8f0' }
          : { backgroundColor: '#0f172a', borderColor: '#1e293b' }}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-[1.0625rem] font-semibold" style={{ color: ink }}>{address.name}</p>
          {address.context && <p className="mt-0.5 truncate text-xs" style={{ color: muted }}>{address.context}</p>}
        </div>
        <span className="section-caps flex-shrink-0 text-[0.625rem]" style={{ color: muted }}>{text.tag}</span>
      </div>

      {onOpenItinerary && (
        <button
          type="button"
          onClick={onOpenItinerary}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3.5 text-sm font-bold transition hover:bg-blue-500 active:bg-blue-700"
          style={{ color: '#ffffff' }}
        >
          <PaperAirplaneIcon className="h-4 w-4" />
          {text.goThere}
        </button>
      )}

      <div className="mt-7 flex items-baseline justify-between pb-3">
        <p className="section-caps" style={{ color: muted }}>{text.onFoot}</p>
        <p className="tabular text-xs" style={{ color: muted }}>{text.stopsCount(nearbyStops.length)}</p>
      </div>

      {nearbyStops.length === 0 ? (
        <p className="py-8 text-sm leading-relaxed" style={{ color: muted }}>{text.noStops}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {nearbyStops.map(({ stop, meters }, index) => (
            <WalkCard
              key={stop.id}
              stop={stop}
              meters={meters}
              isFirst={index === 0}
              accessible={isStopAccessible(accessibleStops, stop)}
              lines={linesByStop[stop.id] ?? []}
              onClick={() => onStopClick(stop)}
              language={language}
              text={text}
              delay={index * 0.03}
              isLight={isLight}
            />
          ))}
        </div>
      )}
    </>
  );

  if (!isMobile) {
    return (
      <motion.div
        initial={{ x: -420, opacity: 0 }}
        animate={{ x: isOpen ? 0 : -420, opacity: isOpen ? 1 : 0 }}
        exit={{ x: -420, opacity: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="fixed left-0 top-0 z-60 h-screen w-96 overflow-y-auto border-r shadow-2xl"
        style={isLight ? { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' } : { backgroundColor: '#0f172a', borderColor: '#1e293b' }}
      >
        <div className="p-6 pb-12">{body}</div>
      </motion.div>
    );
  }

  return (
    <MapSheet initialSnap={3} isOpen={isOpen} onClose={onClose} isLight={isLight} zIndex={100}>
          <div className="flex-1 overflow-y-auto px-5 pb-10 pt-2">{body}</div>
    </MapSheet>
  );
};
