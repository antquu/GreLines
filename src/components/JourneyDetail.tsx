import { formatDurationLabel, formatMinutesCompact } from '../utils/formatDuration';
import { useState } from 'react';
import { FaWalking } from 'react-icons/fa';
import { MdDirectionsBike } from 'react-icons/md';
import { MinusCircleIcon, PlusCircleIcon } from '@heroicons/react/24/outline';
import { ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import { TrafficAlertHover, TrafficAlertSheet, type LineAlert } from './TrafficAlertPopups';
import { resolveRouteLine } from '../utils/routeLineResolver';
import type { RouteItinerary } from '../services/api';
import type { AllLinesLine } from '../services/allLines';
import type { JourneyIntermediateStop, TrafficDetail } from '../types';
import { tx } from '../i18n';

const BIKE_MODES = new Set(['BICYCLE', 'BICYCLE_RENT']);
const NEUTRAL_COLOR = '#94a3b8';

interface JourneyDetailProps {
  journey: RouteItinerary;
  label?: string | null;
  language: 'fr' | 'en';
  stops?: unknown[];
  lineLookup?: Map<string, AllLinesLine> | null;
  theme?: 'light' | 'dark';
  trafficInfo?: Map<string, TrafficDetail[]>;
  isMobile?: boolean;
}

function trafficKey(value?: string | null): string | null {
  if (!value) return null;
  return String(value).toUpperCase().replace(/^(?:SEM:|SEM_)/, '').trim() || null;
}

function stopName(value: unknown): string {
  return String(value ?? '').replace(/^[^,]+,\s*/, '');
}

function clock(value: unknown): string {
  const ms = Number(value);
  if (!ms) return '';
  return new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function JourneyDetail({
  journey,
  label,
  language,
  stops,
  lineLookup,
  theme,
  trafficInfo,
  isMobile = false,
}: JourneyDetailProps) {
  const fr = language === 'fr';
  const isLight = theme === 'light';
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [openAlert, setOpenAlert] = useState<LineAlert | null>(null);
  const [hoverAlert, setHoverAlert] = useState<{ alert: LineAlert; point: { x: number; y: number } } | null>(null);
  const showHover = (alert: LineAlert, target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    setHoverAlert({ alert, point: { x: rect.right, y: rect.bottom } });
  };

  const toggle = (index: number) =>
    setExpanded(current => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  const legs = (journey.allLegs || []) as Array<Record<string, unknown>>;
  const ink = isLight ? 'text-slate-900' : 'text-white';
  const muted = isLight ? 'text-slate-500' : 'text-white/60';
  const boxClass = isLight ? 'bg-slate-100' : 'bg-white/[0.07]';

  const isShownWalk = (leg: (typeof legs)[number]) => String(leg.mode ?? '').toUpperCase() === 'WALK' && Math.round(Number(leg.duration ?? 0) / 60) >= 1;
  const followsTransit = (index: number) => {
    for (let previous = index - 1; previous >= 0; previous -= 1) {
      const mode = String(legs[previous].mode ?? '').toUpperCase();
      if (mode === 'WALK' && !isShownWalk(legs[previous])) continue;
      return mode !== 'WALK' && !BIKE_MODES.has(mode);
    }
    return false;
  };

  return (
    <div>
      <h2
        style={{
          fontSize: '32px',
          lineHeight: 1.12,
          fontWeight: 600,
          letterSpacing: '-0.01em',
          color: isLight ? '#0f172a' : '#ffffff',
          margin: 0,
        }}
      >
        {label || (tx(fr).journeyDetail.yourJourney)}
        <br />
        {tx(fr).journeyDetail.formatdurationlabelArriveArr(formatDurationLabel(journey.dur), journey.arr)}
      </h2>

      <div className="mt-5">
        <span
          className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-[0.9375rem] font-semibold ${
            isLight ? 'border-slate-300 text-slate-900' : 'border-white/40 text-white'
          }`}
        >
          {tx(fr).journeyDetail.leaveAtDep(journey.dep)}
        </span>
      </div>

      <div className="mt-9">
        {legs.map((leg, index) => {
          const mode = String(leg.mode ?? '').toUpperCase();
          const minutes = Math.round(Number(leg.duration ?? 0) / 60);

          if (mode === 'WALK') {
            if (minutes < 1) return null;
            return (
              <div key={`walk-${index}`} className={`my-5 flex items-center gap-3 rounded-2xl px-4 py-4 ${boxClass}`}>
                <FaWalking size={20} className={ink} />
                <span className={`text-[1.0625rem] font-semibold ${ink}`}>
                  {tx(fr).journeyDetail.walkFormatminutescompact(formatMinutesCompact(minutes))}
                </span>
              </div>
            );
          }

          if (BIKE_MODES.has(mode)) {
            return (
              <div key={`bike-${index}`} className={`my-5 flex items-center gap-3 rounded-2xl px-4 py-4 ${boxClass}`}>
                <MdDirectionsBike size={22} className={ink} />
                <span className={`text-[1.0625rem] font-semibold ${ink}`}>
                  {tx(fr).journeyDetail.byBikeFormatminutescompact(formatMinutesCompact(minutes))}
                </span>
              </div>
            );
          }

          const line = resolveRouteLine({
            routeShortName: leg.routeShortName as string | undefined,
            route: leg.route as string | undefined,
            routeId: leg.routeId as string | undefined,
            lineLookup,
            stops,
          });
          const color = line?.color || NEUTRAL_COLOR;
          const lineName = line?.normalized
            || String(leg.routeShortName || leg.route || leg.routeId || '')
              .replace(/^SEM[:_]/, '')
              .toUpperCase();
          const headsign = stopName(leg.headsign || (leg.to as Record<string, unknown> | undefined)?.name);
          const intermediate: JourneyIntermediateStop[] = Array.isArray(leg.intermediateStops)
            ? (leg.intermediateStops as JourneyIntermediateStop[])
            : [];
          const isOpen = expanded.has(index);
          const alertKey = trafficKey(lineName);
          const alerts = alertKey ? trafficInfo?.get(alertKey) ?? null : null;

          return (
            <div key={`transit-${index}`} className={`flex gap-5 ${followsTransit(index) ? 'mt-8' : ''}`}>
              <div className="flex w-6 flex-shrink-0 flex-col items-center">
                <span
                  className="h-6 w-6 flex-shrink-0 rounded-full border-[3px]"
                  style={{ borderColor: color }}
                />
                <span className="w-[6px] flex-1" style={{ backgroundColor: color, minHeight: 72 }} />
                <span
                  className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-[3px]"
                  style={{ borderColor: color }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                </span>
              </div>

              <div className="min-w-0 flex-1 pb-1">
                <p className={`text-[1.3125rem] font-bold leading-tight ${ink}`}>
                  {stopName((leg.from as Record<string, unknown> | undefined)?.name)}
                </p>

                <div className={`mt-4 flex items-center gap-3 rounded-2xl px-4 py-3.5 ${boxClass}`}>
                  <div className="min-w-0 flex-1">
                    <p className={`text-[1.0625rem] font-bold leading-tight ${ink}`}>{lineName}</p>
                    <div className="mt-0.5">
                      <p className={`text-[1rem] leading-tight ${isLight ? 'text-slate-600' : 'text-white/75'}`}>
                        {clock(leg.startTime)} {headsign}
                      </p>
                    </div>
                  </div>

                  {alerts && alerts.length > 0 && (
                    <button
                      type="button"
                      onClick={event => {
                        const alert = { line: lineName, details: alerts, badge: line ?? undefined };
                        if (isMobile) setOpenAlert(alert);
                        else showHover(alert, event.currentTarget);
                      }}
                      onMouseEnter={event => { if (!isMobile) showHover({ line: lineName, details: alerts, badge: line ?? undefined }, event.currentTarget); }}
                      onMouseLeave={() => setHoverAlert(null)}
                      onFocus={event => { if (!isMobile) showHover({ line: lineName, details: alerts, badge: line ?? undefined }, event.currentTarget); }}
                      onBlur={() => setHoverAlert(null)}
                      aria-label={tx(fr).journeyDetail.serviceInfoLineLinename(lineName)}
                      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-400 text-amber-950 transition active:scale-90"
                    >
                      <ExclamationTriangleIcon className="h-5 w-5" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => toggle(index)}
                  disabled={intermediate.length === 0}
                  className={`mt-5 flex items-center gap-3 text-left ${ink} disabled:opacity-60`}
                >
                  {intermediate.length > 0 &&
                    (isOpen ? (
                      <MinusCircleIcon className="h-7 w-7 flex-shrink-0" />
                    ) : (
                      <PlusCircleIcon className="h-7 w-7 flex-shrink-0" />
                    ))}
                  <span className="text-[1.0625rem] font-bold">
                    {tx(fr).journeyDetail.valueStopValue2(intermediate.length + 1, intermediate.length + 1 > 1 ? 's' : '')}
                  </span>
                  <span className={`text-[1.0625rem] ${muted}`}>{formatMinutesCompact(minutes)}</span>
                </button>

                <div
                  className={`-ml-8 grid overflow-hidden pl-8 transition-[grid-template-rows,opacity] duration-300 ease-out ${
                    isOpen ? 'mt-5 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                  }`}
                  aria-hidden={!isOpen}
                >
                  <ul className="flex min-h-0 flex-col gap-3">
                    {intermediate.map((stop, stopIndex) => (
                      <li
                        key={`${stop?.stopId ?? stop?.name ?? stopIndex}`}
                        className={`relative text-[1.0625rem] ${ink}`}
                      >
                        <span
                          className="pointer-events-none absolute"
                          style={{
                            left: -32,
                            top: '0.55em',
                            width: 12,
                            height: 6,
                            backgroundColor: color,
                          }}
                          aria-hidden
                        />
                        {stopName(stop?.name)}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-5">
                  <p className={`text-[1.3125rem] font-bold leading-tight ${ink}`}>
                    {stopName((leg.to as Record<string, unknown> | undefined)?.name)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {isMobile ? (
        <TrafficAlertSheet alert={openAlert} language={language} isLight={isLight} onClose={() => setOpenAlert(null)} />
      ) : hoverAlert && (
        <TrafficAlertHover alert={hoverAlert.alert} point={hoverAlert.point} language={language} isLight={isLight} />
      )}
    </div>
  );
}
