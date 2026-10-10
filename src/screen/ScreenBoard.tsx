import { useEffect, useRef, useState } from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import type { Departure, Stop, StopDetail } from '../types';
import { refreshStopDepartures } from '../services/api';
import { isSncfStopId } from '../services/sncfNetwork';
import { TransportModeIcon } from '../components/TransportModeIcon';
import { SNCF_BRAND_COLORS, SNCF_TER_COLOR } from '../utils/lineColors';
import { appLanguage } from '../utils/appLanguage';
import { tx } from '../i18n';
import { ScreenTopBar } from './ScreenTopBar';
import { ScreenTicker } from './ScreenTicker';
import { ScreenLineBadge } from './ScreenLineBadge';
import { useAutoScroll } from './useAutoScroll';
import { findScreenStopByName, loadScreenStop } from './screenData';
import { ScreenMaintenance } from './ScreenMaintenance';
import {
  departureDisplay,
  groupDeparturesForScreen,
  scheduledClock,
  trainBoard,
  TIMES_PER_DIRECTION,
  type ScreenLayout,
  type ScreenLineGroup,
  type ScreenPlace,
} from './screenUtils';

const REFRESH_MS = 30_000;

// beyond this, shown minutes would be wrong: better show maintenance
const STALE_MS = 3 * 60_000;

const TRAIN_KINDS: Record<string, { label: string; color: string }> = {
  TER: { label: 'TER', color: SNCF_TER_COLOR },
  TGV: { label: 'TGV INOUI', color: SNCF_BRAND_COLORS.TGV },
  IC: { label: 'Intercités', color: SNCF_BRAND_COLORS.IC },
  LEX: { label: 'Léman Express', color: '#C8102E' },
  OUIGO: { label: 'OUIGO', color: SNCF_BRAND_COLORS.OUIGO },
};

function timeTone(departure: Departure): string {
  if (departure.cancelled) return 'text-red-600 line-through';
  if (departure.delayMinutes) return 'text-amber-600';
  if (departure.theoretical) return 'text-neutral-400';
  return 'text-black';
}

function WaitTime({ departure, big = false }: { departure?: Departure; big?: boolean }) {
  const text = tx(appLanguage() === 'fr').screenBoard;
  const number = big ? 'text-[3.25rem] 2xl:text-[4.5rem]' : 'text-[2rem] 2xl:text-[2.75rem]';
  const clock = big ? 'text-[2.25rem] 2xl:text-[3rem]' : 'text-[1.5rem] 2xl:text-[2rem]';
  const unit = big ? 'text-lg 2xl:text-2xl' : 'text-sm 2xl:text-lg';

  if (!departure) {
    return <span className={`tabular font-semibold leading-none text-neutral-300 ${number}`}>–</span>;
  }

  const { value, isArrival, isClockTime } = departureDisplay(departure);
  if (isArrival && !departure.cancelled) {
    return <span className={`screen-arrival font-semibold leading-none ${clock}`}>{text.approaching}</span>;
  }

  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
      <span className={`tabular font-semibold leading-none tracking-tight ${timeTone(departure)} ${isClockTime ? clock : number}`}>
        {value}
      </span>
      {!isClockTime && <span className={`font-medium text-neutral-500 ${unit}`}>{text.min}</span>}
    </span>
  );
}

function LineCard({ group }: { group: ScreenLineGroup }) {
  const text = tx(appLanguage() === 'fr').screenBoard;
  return (
    <article className="flex flex-col rounded-[28px] border border-black/10 bg-[#f5f5f7] p-6 2xl:p-8">
      <div className="flex items-center gap-4">
        <ScreenLineBadge lineId={group.lineId} label={group.label} color={group.color} textColor={group.textColor} />
        <div className="flex min-w-0 flex-1 items-center gap-2 text-neutral-500">
          <TransportModeIcon mode={group.mode} className="h-5 w-5 flex-shrink-0 2xl:h-6 2xl:w-6" />
          <p className="truncate text-lg font-medium 2xl:text-2xl">{group.longName}</p>
        </div>
        {group.hasTraffic && (
          <ExclamationTriangleIcon className="h-7 w-7 flex-shrink-0 text-amber-600 2xl:h-9 2xl:w-9" aria-label={text.trafficInfo} />
        )}
      </div>

      <div className="mt-5 flex flex-col gap-5 2xl:mt-7 2xl:gap-7">
        {group.directions.map(direction => (
          <div key={direction.destination}>
            <p className="truncate text-[1.5rem] font-medium leading-tight text-black 2xl:text-[2rem]">{direction.destination}</p>
            <div className="mt-2 flex items-baseline gap-8 2xl:gap-10">
              {Array.from({ length: TIMES_PER_DIRECTION }).map((_, rank) => (
                <span key={rank} className={rank === 0 ? '' : 'opacity-50'}>
                  <WaitTime departure={direction.departures[rank]} big={rank === 0} />
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function DirectionRows({ groups }: { groups: ScreenLineGroup[] }) {
  const text = tx(appLanguage() === 'fr').screenBoard;
  const rows = groups.flatMap(group => group.directions.map(direction => ({ group, direction })));
  const columns = 'grid-cols-[5.5rem_1fr_repeat(2,9rem)] 2xl:grid-cols-[7rem_1fr_repeat(2,12rem)]';

  return (
    <div>
      <div className={`grid ${columns} items-center gap-6 border-b border-black/10 px-8 pb-3 text-base font-medium text-neutral-500 2xl:px-12 2xl:text-xl`}>
        <span>{text.line}</span>
        <span>{text.direction}</span>
        <span className="col-span-2 text-right">{text.next}</span>
      </div>
      <div className="divide-y divide-black/[0.06]">
        {rows.map(({ group, direction }) => (
          <div key={`${group.lineId}-${direction.destination}`} className={`grid ${columns} items-center gap-6 px-8 py-4 2xl:px-12 2xl:py-5`}>
            <span className="flex">
              <ScreenLineBadge lineId={group.lineId} label={group.label} color={group.color} textColor={group.textColor} />
            </span>
            <span className="flex min-w-0 items-center gap-3">
              <span className="truncate text-[1.75rem] font-medium text-black 2xl:text-[2.5rem]">{direction.destination}</span>
              {group.hasTraffic && (
                <ExclamationTriangleIcon className="h-6 w-6 flex-shrink-0 text-amber-600 2xl:h-8 2xl:w-8" aria-label={text.trafficInfo} />
              )}
            </span>
            {Array.from({ length: TIMES_PER_DIRECTION }).map((_, rank) => (
              <span key={rank} className={`text-right ${rank === 0 ? '' : 'opacity-60'}`}>
                <WaitTime departure={direction.departures[rank]} />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function TrainStatus({ departure }: { departure: Departure }) {
  const text = tx(appLanguage() === 'fr').screenBoard;
  if (departure.cancelled) return <span className="font-semibold text-red-600">{text.cancelled}</span>;
  if (departure.delayMinutes) return <span className="font-semibold text-amber-600">{text.late(departure.delayMinutes)}</span>;
  if (departure.theoretical || !departure.realtime) return null;
  return <span className="font-medium text-emerald-600">{text.onTime}</span>;
}

const BRAND_LOGOS: Record<string, { src: string; className: string }> = {
  TGV: { src: '/assets/tgv-inoui.svg', className: 'h-8 2xl:h-11' },
  OUIGO: { src: '/assets/ouigo.svg', className: 'h-8 2xl:h-11' },
  IC: { src: '/assets/intercites.svg', className: 'h-6 2xl:h-8' },
};

function TrainBrand({ kind, label }: { kind?: string; label: string }) {
  if (kind === 'TER') {
    return (
      <span
        role="img"
        aria-label="TER"
        className="h-6 w-12 flex-shrink-0 2xl:h-8 2xl:w-16"
        style={{
          backgroundColor: SNCF_TER_COLOR,
          WebkitMaskImage: 'url(/assets/ter.png)',
          maskImage: 'url(/assets/ter.png)',
          WebkitMaskSize: 'contain',
          maskSize: 'contain',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskPosition: 'left center',
          maskPosition: 'left center',
        }}
      />
    );
  }
  const logo = BRAND_LOGOS[kind ?? ''];
  if (logo) return <img src={logo.src} alt={label} className={`${logo.className} w-auto flex-shrink-0 object-contain`} />;
  return <span className="truncate text-lg text-neutral-500 2xl:text-2xl">{label}</span>;
}

function TrainBoard({ departures }: { departures: Departure[] }) {
  const text = tx(appLanguage() === 'fr').screenBoard;
  const columns = 'grid-cols-[8rem_12rem_1fr_13rem] 2xl:grid-cols-[11rem_16rem_1fr_18rem]';

  return (
    <div>
      <div className={`grid ${columns} items-center gap-6 border-b border-black/10 px-8 pb-3 text-base font-medium text-neutral-500 2xl:px-12 2xl:text-xl`}>
        <span>{text.time}</span>
        <span>{text.train}</span>
        <span>{text.destination}</span>
        <span className="text-right">{text.status}</span>
      </div>
      <div className="divide-y divide-black/[0.06]">
        {departures.map(departure => {
          const kind = TRAIN_KINDS[departure.trainKind ?? ''] ?? (departure.type === 'BUS'
            ? { label: text.coach, color: '#475569' }
            : { label: departure.lineShortName || text.trainWord, color: SNCF_TER_COLOR });
          return (
            <div
              key={`${departure.train ?? departure.lineId}-${departure.at}`}
              className={`grid ${columns} items-center gap-6 px-8 py-4 2xl:px-12 2xl:py-5 ${departure.cancelled ? 'opacity-70' : ''}`}
            >
              <span className="flex flex-col">
                <span className={`tabular text-[2.25rem] font-semibold leading-none tracking-tight 2xl:text-[3.25rem] ${departure.cancelled ? 'text-red-600 line-through' : 'text-black'}`}>
                  {scheduledClock(departure)}
                </span>
              </span>
              <span className="flex min-w-0 items-center gap-3">
                <span
                  className="inline-flex flex-shrink-0 items-center rounded-lg px-2.5 py-1 text-base font-bold leading-none tracking-wide text-white 2xl:text-xl"
                  style={{ backgroundColor: kind.color }}
                >
                  {departure.train ?? kind.label}
                </span>
                {departure.train && <TrainBrand kind={departure.trainKind} label={kind.label} />}
              </span>
              <span className="truncate text-[1.75rem] font-medium text-black 2xl:text-[2.5rem]">{departure.destination}</span>
              <span className="text-right text-xl 2xl:text-3xl">
                <TrainStatus departure={departure} />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ScreenBoard({
  stopId,
  layout,
  place,
  onMoved,
}: {
  stopId: string;
  layout: ScreenLayout;
  place: ScreenPlace | null;
  onMoved: (stop: Stop) => void;
}) {
  const text = tx(appLanguage() === 'fr').screenBoard;
  const [detail, setDetail] = useState<StopDetail | null>(null);
  const detailRef = useRef<StopDetail | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'down'>('loading');
  const scrollRef = useAutoScroll<HTMLElement>({ enabled: status === 'ready' });
  const isStation = isSncfStopId(stopId);

  useEffect(() => {
    detailRef.current = detail;
  }, [detail]);

  useEffect(() => {
    let active = true;
    let timer = 0;
    let lastFresh = 0;

    const fresh = (result: StopDetail) => {
      lastFresh = Date.now();
      setDetail(result);
      setStatus('ready');
    };

    const tick = async () => {
      const current = detailRef.current;
      try {
        if (current) {
          const result = await refreshStopDepartures(current);
          if (!active) return;
          if (result && result !== current) fresh(result);
          else if (Date.now() - lastFresh > STALE_MS) setStatus('down');
          return;
        }
        const fetched = await loadScreenStop(stopId);
        if (!active) return;
        if (fetched) {
          fresh(fetched);
          return;
        }
        const moved = place ? await findScreenStopByName(stopId, place) : null;
        if (!active) return;
        if (moved && moved.id !== stopId) onMoved(moved);
        else setStatus('down');
      } catch {
        if (active && (!current || Date.now() - lastFresh > STALE_MS)) setStatus('down');
      }
    };

    const loop = async () => {
      await tick();
      if (active) timer = window.setTimeout(loop, REFRESH_MS);
    };
    void loop();

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopId]);

  // while the first departures load, show the maintenance screen rather than a half-empty board
  if (status !== 'ready') return <ScreenMaintenance />;

  const groups = detail && !isStation ? groupDeparturesForScreen(detail) : [];
  const trains = detail && isStation ? trainBoard(detail) : [];
  const empty = isStation ? trains.length === 0 : groups.length === 0;

  return (
    <div className="gl-screen flex h-dvh w-full flex-col bg-white text-black">
      <ScreenTopBar
        stopName={detail?.name}
        subtitle={isStation ? `${text.station} · ${text.departures}` : detail?.city || text.next}
        isStation={isStation}
      />

      <main ref={scrollRef} className="min-h-0 flex-1 overflow-hidden">
        {status === 'ready' && empty && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="text-4xl font-semibold text-black">{text.noDepartures}</p>
            <p className="text-xl text-neutral-500">{text.serviceOver}</p>
          </div>
        )}

        {status === 'ready' && !empty && (
          <div className="pb-8 pt-2">
            {isStation ? (
              <TrainBoard departures={trains} />
            ) : layout === 'rows' ? (
              <DirectionRows groups={groups} />
            ) : (
              <div className="grid gap-5 px-8 md:grid-cols-2 2xl:grid-cols-3 2xl:gap-6 2xl:px-12">
                {groups.map(group => (
                  <LineCard key={group.lineId} group={group} />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <ScreenTicker lines={detail?.lines ?? []} />
    </div>
  );
}
