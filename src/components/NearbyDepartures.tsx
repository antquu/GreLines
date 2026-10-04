import { useEffect, useMemo, useState } from 'react';
import { ChevronRightIcon, MapPinIcon } from '@heroicons/react/24/solid';
import type { Departure, Line, Stop, StopDetail } from '../types';
import type { StopWithDistance } from '../utils/geo';
import { getStopDetail } from '../services/api';
import { getTclStopDetail, isTclId } from '../services/tclNetwork';
import { getGtfsStopDetail } from '../services/gtfsNetwork';
import { isGtfsNetworkId } from '../services/gtfsNetworkIds';
import { LineBadge } from './LineBadge';
import { RealtimeWifi } from './RealtimeWifi';

const REFRESH_MS = 30_000;
const GROUPS_PER_STOP = 4;
const TIMES_PER_GROUP = 2;

function loadDetail(stopId: string): Promise<StopDetail | null> {
  if (isTclId(stopId)) return getTclStopDetail(stopId);
  if (isGtfsNetworkId(stopId)) return getGtfsStopDetail(stopId);
  return getStopDetail(stopId);
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
  return `${language === 'fr' ? km.replace('.', ',') : km} km`;
};

function formatMinutes(minutes: number[], language: 'fr' | 'en'): string {
  const now = language === 'fr' ? 'ARR' : 'Due';
  if (minutes[0] <= 0 && minutes.length === 1) return now;
  const parts = minutes.map(value => (value <= 0 ? now : String(value)));
  return `${parts.join(', ')} min`;
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
}: {
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
          .then(detail => { if (!cancelled) setDetails(previous => ({ ...previous, [id]: detail })); })
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

  const ready = ids.length > 0 && ids.every(id => details[id] !== undefined);
  useEffect(() => {
    if (ready) onReady?.();
  }, [ready, onReady]);

  const cardClass = isLight
    ? 'bg-white border border-slate-200 shadow-[0_12px_30px_rgba(148,163,184,0.16)]'
    : 'bg-black border border-white/[0.06]';
  const strong = isLight ? { color: '#0f172a' } : undefined;

  if (pending || !ready) {
    return (
      <div className="flex justify-center py-10" role="status" aria-label={language === 'fr' ? 'Chargement' : 'Loading'}>
        <LoadingWheel isLight={isLight} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {nearby.map(({ stop, meters }) => {
        const detail = details[stop.id];
        const groups = detail ? groupDepartures(detail) : [];
        const shownLines = new Set(groups.map(group => group.line.id));
        const quietLines = (detail?.lines ?? []).filter(line => !shownLines.has(line.id)).slice(0, 10);
        return (
          <button
            key={stop.id}
            type="button"
            onClick={() => onStopClick(stop)}
            className={`block w-full overflow-hidden rounded-[28px] px-5 pb-5 pt-5 text-left transition active:scale-[0.99] ${cardClass}`}
          >
            <div className="mb-3 flex items-start gap-3">
              <span className="min-w-0 flex-1">
                <span className={`block text-[0.9375rem] font-semibold leading-snug ${titleClass}`} style={strong}>
                  {stop.name}
                </span>
                <span className={`mt-0.5 flex items-center gap-1 text-sm ${mutedClass}`}>
                  <MapPinIcon className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">
                    {formatDistance(meters, language)}
                    {stop.city ? ` · ${stop.city}` : ''}
                  </span>
                </span>
              </span>
              <ChevronRightIcon className={`mt-1 h-4 w-4 flex-shrink-0 ${mutedClass}`} />
            </div>

            {detail === undefined ? (
              <div className="space-y-3 pt-1">
                {[0, 1].map(index => (
                  <div key={index} className={`h-7 animate-pulse rounded-lg ${isLight ? 'bg-slate-100' : 'bg-white/[0.06]'}`} />
                ))}
              </div>
            ) : groups.length === 0 ? (
              <p className={`pt-1 text-sm ${mutedClass}`}>
                {language === 'fr' ? 'Aucun passage prévu' : 'No upcoming departures'}
              </p>
            ) : (
              <div className="space-y-3 pt-1">
                {groups.map(group => (
                  <div key={group.key} className="flex items-center gap-3">
                    <LineBadge line={group.line} size="sm" />
                    <span className={`line-clamp-2 min-w-0 flex-1 text-sm leading-snug ${titleClass}`} style={strong}>
                      {group.destination}
                    </span>
                    <span className={`flex flex-shrink-0 items-center gap-1.5 text-sm font-bold tabular-nums ${titleClass}`} style={strong}>
                      {group.realtime && (
                        <RealtimeWifi size={13} className="text-green-400" label={language === 'fr' ? 'Temps réel' : 'Live'} />
                      )}
                      {formatMinutes(group.minutes, language)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {quietLines.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {quietLines.map(line => (
                  <LineBadge key={line.id} line={line} size="xs" />
                ))}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
