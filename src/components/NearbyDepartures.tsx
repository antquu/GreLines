import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRightIcon } from '@heroicons/react/24/solid';
import { FaWalking } from 'react-icons/fa';
import type { Departure, Line, Stop, StopDetail } from '../types';
import { haversineMeters, type StopWithDistance } from '../utils/geo';
import { getStopDetail } from '../services/api';
import { getTclStopDetail, isTclId } from '../services/tclNetwork';
import { getGtfsStopDetail } from '../services/gtfsNetwork';
import { isGtfsNetworkId } from '../services/gtfsNetworkIds';
import { LineBadge } from './LineBadge';
import { RealtimeWifi } from './RealtimeWifi';
import { tx } from '../i18n';

const REFRESH_MS = 30_000;
const GROUPS_PER_STOP = 4;
const TIMES_PER_GROUP = 2;

const LOAD_TIMEOUT_MS = 8000;
const SWAP_MARGIN_M = 10;

function loadDetail(stopId: string): Promise<StopDetail | null> {
  const request = isTclId(stopId) ? getTclStopDetail(stopId) : isGtfsNetworkId(stopId) ? getGtfsStopDetail(stopId) : getStopDetail(stopId);
  const timeout = new Promise<null>(resolve => window.setTimeout(() => resolve(null), LOAD_TIMEOUT_MS));
  return Promise.race([request, timeout]);
}

interface DepartureGroup {
  key: string;
  line: Pick<Line, 'id' | 'shortName' | 'color' | 'textColor'> & { routeId?: string; hasTraffic?: boolean };
  destination: string;
  minutes: number[];
  realtime: boolean;
}

function groupDepartures(detail: StopDetail): DepartureGroup[] {
  const groups = new Map<string, DepartureGroup>();
  const sorted = [...detail.departures].sort((a: Departure, b: Departure) => a.departureTime - b.departureTime);
  for (const departure of sorted) {
    const key = `${departure.lineId}|${departure.destination}`;
    const existing = groups.get(key);
    if (existing) {
      if (existing.minutes.length < TIMES_PER_GROUP) existing.minutes.push(departure.departureTime);
      continue;
    }
    const known = detail.lines.find(line => line.id === departure.lineId)
      ?? detail.lines.find(line => line.shortName && line.shortName === departure.lineShortName);
    groups.set(key, {
      key,
      line: known ?? { id: departure.lineId, routeId: departure.routeId, shortName: departure.lineShortName || departure.lineName },
      destination: departure.destination,
      minutes: [departure.departureTime],
      realtime: departure.realtime,
    });
  }
  return [...groups.values()].slice(0, GROUPS_PER_STOP);
}

const formatDistance = (meters: number, language: 'fr' | 'en') => {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  const km = (meters / 1000).toFixed(1);
  return tx(language === 'fr').nearbyDepartures.distanceKm(km);
};

function formatFirst(minutes: number, language: 'fr' | 'en'): string {
  if (minutes <= 0) return tx(language === 'fr').nearbyDepartures.due;
  if (minutes <= 30) return `${minutes} min`;
  // past 30 minutes show the clock time
  return new Date(Date.now() + minutes * 60_000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// drop the "City, " prefix the network puts in front of stop names
function displayName(stop: Stop): string {
  const comma = stop.name.indexOf(', ');
  return comma > 0 && comma < stop.name.length - 2 ? stop.name.slice(comma + 2) : stop.name;
}

function LoadingWheel({ isLight }: { isLight: boolean }) {
  const color = isLight ? '#64748b' : '#cbd5e1';
  return (
    <svg className="h-9 w-9 animate-spin" viewBox="0 0 50 50" style={{ animationDuration: '0.9s' }}>
      <defs>
        <linearGradient id="nearby-wheel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="1" />
          <stop offset="100%" stopColor={color} stopOpacity="0.1" />
        </linearGradient>
      </defs>
      <circle cx="25" cy="25" r="20" fill="none" stroke="url(#nearby-wheel)" strokeWidth="4" strokeLinecap="round" strokeDasharray="94 32" />
    </svg>
  );
}

export function NearbyDepartures({
  nearby,
  active,
  language,
  isLight,
  titleClass,
  mutedClass,
  onStopClick,
  onReady,
  pending = false,
  position = null,
}: {
  position?: { lat: number; lon: number } | null;
  nearby: StopWithDistance<Stop>[];
  active: boolean;
  language: 'fr' | 'en';
  isLight: boolean;
  titleClass: string;
  mutedClass: string;
  onStopClick: (stop: Stop) => void;
  onReady?: () => void;
  pending?: boolean;
}) {
  const [details, setDetails] = useState<Record<string, StopDetail | null>>({});
  const ids = useMemo(() => nearby.map(entry => entry.stop.id), [nearby]);
  const idsKey = ids.join('|');

  useEffect(() => {
    if (!active || ids.length === 0) return;
    let cancelled = false;
    const refresh = () => {
      for (const id of ids) {
        loadDetail(id)
          .then(detail => { if (!cancelled) setDetails(previous => ({ ...previous, [id]: detail ?? previous[id] ?? null })); })
          .catch(() => { if (!cancelled) setDetails(previous => ({ ...previous, [id]: previous[id] ?? null })); });
      }
    };
    refresh();
    const timer = window.setInterval(refresh, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [active, idsKey]);

  const orderRef = useRef<string[]>([]);
  const ordered = useMemo(() => {
    const live = new Map(nearby.map(entry => [
      entry.stop.id,
      position
        ? { stop: entry.stop, meters: haversineMeters(position.lat, position.lon, entry.stop.lat, entry.stop.lon) }
        : entry,
    ]));
    const kept = orderRef.current.filter(id => live.has(id));
    const order = kept.length > 0
      ? [...kept, ...nearby.map(entry => entry.stop.id).filter(id => !kept.includes(id))]
      : [...live.values()].sort((a, b) => a.meters - b.meters).map(entry => entry.stop.id);
    // a stop only overtakes its neighbour once it is clearly closer
    for (let i = 1; i < order.length; i += 1) {
      for (let j = i; j > 0 && live.get(order[j])!.meters + SWAP_MARGIN_M < live.get(order[j - 1])!.meters; j -= 1) {
        [order[j - 1], order[j]] = [order[j], order[j - 1]];
      }
    }
    orderRef.current = order;
    return order.map(id => live.get(id)!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearby, position?.lat, position?.lon]);

  const ready = ids.length > 0 && ids.some(id => details[id] !== undefined);
  useEffect(() => {
    if (ready) onReady?.();
  }, [ready, onReady]);

  const ink = isLight ? '#0f172a' : '#ffffff';
  const muted = isLight ? '#64748b' : '#94a3b8';
  const rule = isLight ? '#e2e8f0' : 'rgba(255,255,255,0.08)';

  if (pending || !ready) {
    return (
      <div className="flex justify-center py-10" role="status" aria-label={tx(language === 'fr').nearbyDepartures.loading}>
        <LoadingWheel isLight={isLight} />
      </div>
    );
  }

  return (
    <div>
      {ordered.map(({ stop, meters }, index) => {
        const detail = details[stop.id];
        const groups = detail ? groupDepartures(detail) : [];
        const shownLines = new Set(groups.map(group => group.line.id));
        const quietLines = (detail?.lines ?? []).filter(line => !shownLines.has(line.id)).slice(0, 10);
        return (
          <motion.button
            key={stop.id}
            layout="position"
            transition={{ layout: { type: 'spring', stiffness: 420, damping: 38 } }}
            type="button"
            onClick={() => onStopClick(stop)}
            className={`block w-full px-1 text-left active:opacity-70 ${index > 0 ? 'mt-3 border-t pt-5' : ''}`}
            style={{ borderColor: rule }}
          >
            <div className="flex items-center gap-3 pb-2">
              <span className={`min-w-0 flex-1 truncate text-[1.0625rem] font-semibold leading-snug ${titleClass}`} style={{ color: ink }}>
                {displayName(stop)}
              </span>
              <span className={`flex flex-shrink-0 items-center gap-1.5 text-[0.875rem] tabular-nums ${mutedClass}`} style={{ color: muted }}>
                <FaWalking size={12} aria-hidden="true" />
                {formatDistance(meters, language)}
              </span>
              <ChevronRightIcon className="h-4 w-4 flex-shrink-0" style={{ color: muted }} />
            </div>

            {detail === undefined ? (
              <div className="space-y-3 py-2">
                {[0, 1].map(item => (
                  <div key={item} className={`h-6 animate-pulse rounded-lg ${isLight ? 'bg-slate-100' : 'bg-white/[0.06]'}`} />
                ))}
              </div>
            ) : groups.length === 0 ? (
              <p className="py-2 text-[0.9375rem]" style={{ color: muted }}>
                {tx(language === 'fr').nearbyDepartures.noUpcomingDepartures}
              </p>
            ) : (
              <div>
                {groups.map((group, row) => (
                  <div
                    key={group.key}
                    className={`flex items-center gap-3 py-2.5 ${row > 0 ? 'border-t' : ''}`}
                    style={{ borderColor: rule }}
                  >
                    <LineBadge line={group.line} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-[0.9375rem] leading-snug" style={{ color: ink }}>
                      {group.destination}
                    </span>
                    <span className="flex flex-shrink-0 items-center gap-1.5 text-[0.9375rem] tabular-nums">
                      {group.realtime && (
                        <RealtimeWifi size={13} className="text-green-400" label={tx(language === 'fr').nearbyDepartures.live} />
                      )}
                      <span className="font-semibold" style={{ color: ink }}>{formatFirst(group.minutes[0], language)}</span>
                      {group.minutes.length > 1 && (
                        <span style={{ color: muted }}>{formatFirst(group.minutes[1], language)}</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {quietLines.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2">
                {quietLines.map(line => (
                  <LineBadge key={line.id} line={line} size="xs" />
                ))}
              </div>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
