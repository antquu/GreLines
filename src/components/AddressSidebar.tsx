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

interface AddressSidebarProps {
  address: AddressResult | null;
  stops: Stop[];
  isOpen: boolean;
  onClose: () => void;
  onStopClick: (stop: Stop) => void;
  isMobile: boolean;
  language: 'fr' | 'en';
  onOpenItinerary?: () => void;
}

const WALK_METRES_PER_MINUTE = 75;
const MAX_WALK_METERS = 2000;

const walkMinutes = (meters: number): number => Math.max(1, Math.ceil(meters / WALK_METRES_PER_MINUTE));

const getText = (language: 'fr' | 'en') => ({
  title: language === 'fr' ? 'Adresse' : 'Address',
  subtitle: language === 'fr' ? 'Les arrêts les plus proches, à pied' : 'The nearest stops, on foot',
  tag: language === 'fr' ? 'Adresse' : 'Address',
  onFoot: language === 'fr' ? 'Arrêts à pied' : 'Stops on foot',
  closest: language === 'fr' ? 'Le plus proche' : 'Closest',
  accessible: language === 'fr' ? 'Arrêt accessible en fauteuil' : 'Wheelchair-accessible stop',
  minute: 'min',
  stopsCount: (n: number) =>
    language === 'fr' ? `${n} arrêt${n > 1 ? 's' : ''}` : `${n} stop${n > 1 ? 's' : ''}`,
  noStops:
    language === 'fr'
      ? 'Aucun arrêt trouvé autour de cette adresse. Déplacez le repère ou cherchez une autre adresse.'
      : 'No stop found around this address. Move the pin or search another address.',
  close: language === 'fr' ? 'Fermer' : 'Close',
  goThere: language === 'fr' ? 'Y aller' : 'Go there',
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
}) => {
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
      className={`w-full rounded-[22px] bg-black px-5 py-4 text-left transition active:scale-[0.99] ${
        isFirst ? 'ring-2 ring-blue-500' : 'ring-1 ring-white/10 hover:ring-white/20'
      }`}
    >
      <div className="flex items-start gap-3">
        <h3
          style={{
            fontSize: '20px',
            lineHeight: 1.2,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            color: '#ffffff',
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

      <p className="mt-1 truncate text-[0.875rem] leading-snug text-white/60">
        {isFirst && <span className="font-semibold text-blue-400">{text.closest} · </span>}
        {formatDistance(meters, language)}
        {stop.city ? ` · ${stop.city}` : ''}
      </p>

      <div className="mt-3.5 flex items-end gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {visible.map(line => (
            <LineBadge key={line.routeId || line.id} line={line} size="xs" />
          ))}
          {overflow > 0 && (
            <span className="tabular flex h-6 items-center rounded-full bg-white/10 px-2 text-[0.625rem] font-bold text-white/70">
              +{overflow}
            </span>
          )}
        </div>
        <span className="flex flex-shrink-0 items-center gap-1.5 text-white">
          <FaWalking size={15} className="text-white/60" aria-hidden="true" />
          <span className="tabular text-[1.25rem] font-bold leading-none">{walkMinutes(meters)}</span>
          <span className="text-[0.8125rem] font-medium text-white/60">{text.minute}</span>
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
}: AddressSidebarProps) => {
  const text = getText(language);
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
          <p className="text-sm font-bold text-white">{text.title}</p>
          <p className="mt-0.5 text-xs text-slate-400">{text.subtitle}</p>
        </div>
        <button
          onClick={onClose}
          aria-label={text.close}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-800 transition hover:bg-slate-700"
        >
          <XMarkIcon className="h-4 w-4 text-white" />
        </button>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[1.0625rem] font-semibold text-white">{address.name}</p>
          {address.context && <p className="mt-0.5 truncate text-xs text-slate-400">{address.context}</p>}
        </div>
        <span className="section-caps flex-shrink-0 text-[0.625rem] text-slate-500">{text.tag}</span>
      </div>

      {onOpenItinerary && (
        <button
          type="button"
          onClick={onOpenItinerary}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3.5 text-sm font-bold text-white transition hover:bg-blue-500 active:bg-blue-700"
        >
          <PaperAirplaneIcon className="h-4 w-4" />
          {text.goThere}
        </button>
      )}

      <div className="mt-7 flex items-baseline justify-between pb-3">
        <p className="section-caps text-slate-400">{text.onFoot}</p>
        <p className="tabular text-xs text-slate-500">{text.stopsCount(nearbyStops.length)}</p>
      </div>

      {nearbyStops.length === 0 ? (
        <p className="py-8 text-sm leading-relaxed text-slate-500">{text.noStops}</p>
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
        className="fixed left-0 top-0 z-60 h-screen w-96 overflow-y-auto border-r border-slate-800 bg-slate-900 shadow-2xl"
      >
        <div className="p-6 pb-12">{body}</div>
      </motion.div>
    );
  }

  return (
    <MapSheet initialSnap={3} isOpen={isOpen} onClose={onClose} isLight={false} zIndex={100}>
          <div className="flex-1 overflow-y-auto px-5 pb-10 pt-2">{body}</div>
    </MapSheet>
  );
};
