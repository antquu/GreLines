import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRightIcon, ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import { STATUS_URL, maintenanceText, useMaintenance, useMaintenanceBanner, type MaintenanceStatus, type StatusIncident } from '../services/maintenance';
import { MapSheet, MapSheetBottomSpacer } from './MapSheet';
import { getDeviceId } from '../services/ouraCard';
import { CITY_SITE } from '../site';
import { appLanguage } from '../utils/appLanguage';
import { tx } from '../i18n';

const STATUS_COLOR: Record<MaintenanceStatus, string> = {
  investigating: '#f59e0b',
  identified: '#f97316',
  monitoring: '#22c55e',
};
const SEEN_KEY = 'gl-maintenance-seen';

function startedLabel(startedAt: string | null, full = false): string | null {
  if (!startedAt) return null;
  const date = new Date(startedAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(appLanguage() === 'fr' ? 'fr-FR' : 'en-GB', {
    day: '2-digit',
    month: '2-digit',
    ...(full ? { year: 'numeric', second: '2-digit' } : {}),
    hour: '2-digit',
    minute: '2-digit',
  });
}

function IncidentCard({ incident }: { incident: StatusIncident }) {
  const text = tx(appLanguage() === 'fr').maintenance;
  const started = startedLabel(incident.startedAt, true);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
      className="mt-8 w-full max-w-md rounded-xl bg-[#222222] p-4 text-left"
    >
      <div className="flex items-center justify-between gap-4">
        <p className="min-w-0 text-[1.125rem] font-semibold leading-tight">{incident.title || text.technicalIssue}</p>
        <span className="flex flex-shrink-0 items-center gap-1.5 text-[0.75rem] font-bold uppercase tracking-wide">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_COLOR[incident.status] }} />
          {text.statuses[incident.status]}
        </span>
      </div>
      {incident.body && <p style={{ marginTop: '0.5rem' }} className="whitespace-pre-line text-[0.875rem] leading-snug text-[#a3a3a3]">{incident.body}</p>}
      <div className="mt-4 flex items-center justify-between gap-3">
        {started && (
          <span className="rounded-md bg-[#2e2e2e] px-2.5 py-1.5 text-[0.75rem] tabular-nums text-[#d4d4d4]">
            {text.startedOn(started)}
          </span>
        )}
        <a
          href={STATUS_URL}
          target="_blank"
          rel="noreferrer"
          className="ml-auto flex flex-shrink-0 items-center gap-1 rounded-full bg-white px-3.5 py-1.5 text-[0.875rem] font-semibold text-black transition active:scale-95"
        >
          {text.moreDetails}
          <ArrowUpRightIcon className="h-3.5 w-3.5" />
        </a>
      </div>
    </motion.div>
  );
}

function LockScreen({ incident, overlay }: { incident: StatusIncident | null; overlay?: boolean }) {
  const text = tx(appLanguage() === 'fr').maintenance;

  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.background;
    root.style.background = '#111111';
    return () => {
      root.style.background = previous;
    };
  }, []);

  const started = startedLabel(incident?.startedAt ?? null);

  return (
    <main
      className={`fixed inset-0 overflow-y-auto bg-[#0b0b0b] text-white md:bg-[#111111] ${overlay ? 'z-[10200]' : 'z-[20000]'}`}
      style={{ height: '100dvh' }}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="maintenance-lock-title"
    >
      <div className="flex min-h-full flex-col px-8 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(var(--gl-safe-top)+88px)] md:hidden">
        <ExclamationTriangleIcon className="h-24 w-24" style={{ color: '#333333' }} aria-hidden="true" />
        <p
          role="heading"
          aria-level={1}
          id="maintenance-lock-title"
          className="text-[1.875rem] font-medium leading-[1.15]"
          style={{ paddingTop: '3.5rem' }}
        >
          {text.serviceUnavailable}
        </p>
        <p className="text-[1.1875rem] leading-snug" style={{ color: '#a3a3a3', paddingTop: '0.75rem' }}>
          {text.unavailable}
        </p>
        {incident && (
          <div style={{ paddingTop: '2rem' }}>
            <p className="text-[1.0625rem] font-semibold leading-tight">{incident.title || text.technicalIssue}</p>
            {incident.body && (
              <p className="whitespace-pre-line text-[0.9375rem] leading-snug" style={{ color: '#a3a3a3', paddingTop: '0.375rem' }}>
                {incident.body}
              </p>
            )}
            <p className="flex items-center gap-2 text-[0.875rem]" style={{ color: '#737373', paddingTop: '0.5rem' }}>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_COLOR[incident.status] }} />
              {text.statuses[incident.status]}
              {started && <span className="tabular-nums">· {text.since(started)}</span>}
            </p>
          </div>
        )}
        <a
          href={STATUS_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-auto flex w-full items-center justify-center gap-1.5 rounded-2xl bg-white py-4 text-[1.0625rem] font-semibold text-black transition active:scale-[0.98]"
        >
          {text.serviceStatus}
          <ArrowUpRightIcon className="h-4 w-4" />
        </a>
      </div>
      <div className="mx-auto hidden max-w-xl flex-col items-center px-5 pb-10 pt-[9vh] text-center md:flex">
        <img src="/assets/GreLinesLOGO.png" alt="GreLines" className="h-auto w-56 lg:w-72" draggable={false} />
        <p className="text-[1.0625rem] leading-snug text-[#e5e5e5]" style={{ marginTop: '2rem' }}>
          {text.unavailable.split(/(?<=\.)\s+/).map(sentence => (
            <span key={sentence} className="block">{sentence}</span>
          ))}
        </p>
        {incident && <IncidentCard incident={incident} />}
        <p className="text-[1rem] text-[#d4d4d4]" style={{ marginTop: '2rem' }}>{text.serviceUnavailable}</p>
      </div>
    </main>
  );
}

const RESUME_MIN_MS = 2500;
const RESUME_MAX_MS = 5000;
const RESUME_FADE_MS = 250;

export function ResumeScreen({ light, onDone }: { light: boolean; onDone: () => void }) {
  const text = tx(appLanguage() === 'fr').maintenance;
  const [duration] = useState(() => RESUME_MIN_MS + Math.random() * (RESUME_MAX_MS - RESUME_MIN_MS));
  const [device] = useState(() => getDeviceId().replace(/-/g, '').slice(0, 16));
  const [seconds, setSeconds] = useState(1);
  const [leaving, setLeaving] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const started = Date.now();
    const tick = window.setInterval(() => {
      setSeconds(Math.min(5, Math.floor((Date.now() - started) / 1000) + 1));
    }, 200);
    const leave = window.setTimeout(() => setLeaving(true), duration);
    const done = window.setTimeout(() => doneRef.current(), duration + RESUME_FADE_MS);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(leave);
      window.clearTimeout(done);
    };
  }, [duration]);

  const ink = light ? '#000000' : '#ffffff';
  const soft = light ? '#737373' : '#a3a3a3';

  return (
    <div
      className="fixed inset-0 z-[20001] flex w-screen items-center justify-center"
      style={{
        height: '100dvh',
        backgroundColor: light ? '#ffffff' : '#000000',
        opacity: leaving ? 0 : 1,
        transition: `opacity ${RESUME_FADE_MS}ms ease-out`,
        pointerEvents: leaving ? 'none' : 'auto',
      }}
      role="status"
    >
      <img
        src={light ? '/assets/GreLinesLOGO_dark.png' : '/assets/GreLinesLOGO.png'}
        alt="GreLines"
        className="h-auto w-64 animate-pulse-opacity lg:w-80"
        style={{ transform: 'translateY(-2.5%)' }}
        draggable={false}
      />
      <div
        className="absolute inset-x-0 flex flex-col items-center gap-5 px-6 text-center"
        style={{
          bottom: CITY_SITE?.logo
            ? 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)'
            : 'calc(env(safe-area-inset-bottom, 0px) + 4rem)',
        }}
      >
        {CITY_SITE?.logo && (
          <img
            src={light ? CITY_SITE.logo.light : CITY_SITE.logo.dark}
            alt={CITY_SITE.networkLabel}
            className="h-auto"
            style={{ width: CITY_SITE.logo.width }}
            draggable={false}
          />
        )}
        <div>
          <p className="text-[0.9375rem] font-semibold" style={{ color: ink }}>{text.resuming}</p>
          <p className="text-[0.875rem] tabular-nums" style={{ color: soft, marginTop: '0.25rem' }}>
            {text.preparing} · {text.waited(seconds)}
          </p>
          <p className="text-[0.75rem] tabular-nums" style={{ color: soft, marginTop: '0.25rem', opacity: 0.8 }}>
            {text.deviceId}: {device}
          </p>
        </div>
      </div>
    </div>
  );
}

export function MaintenanceGate({ children }: { children: ReactNode }) {
  const maintenance = useMaintenance();
  const locked = maintenance?.config.mode === 'lock';
  const wasLocked = useRef(false);
  const [resuming, setResuming] = useState(false);

  useEffect(() => {
    if (wasLocked.current && !locked) setResuming(true);
    wasLocked.current = locked;
  }, [locked]);

  if (locked && !maintenance?.simulated) return <LockScreen incident={maintenance?.incident ?? null} />;
  return (
    <>
      {children}
      {locked && <LockScreen incident={maintenance?.incident ?? null} overlay />}
      {resuming && <ResumeScreen light={false} onDone={() => setResuming(false)} />}
    </>
  );
}

export function MaintenancePill({ leftInset, rightInset }: { leftInset: number; rightInset: number }) {
  const maintenance = useMaintenanceBanner();
  const ref = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);
  const text = tx(appLanguage() === 'fr').maintenance;

  useLayoutEffect(() => {
    const node = ref.current;
    const anchor = node?.previousElementSibling;
    if (!node || !anchor) return;
    const update = () => {
      const natural = anchor.getBoundingClientRect().right + 8;
      setShift(Math.max(0, leftInset + 12 - natural));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(anchor);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [leftInset, maintenance]);

  if (!maintenance) return null;
  const { title, body } = maintenanceText(maintenance, text.bannerDefault);
  const status = maintenance.incident?.status ?? maintenance.config.status;

  return (
    <div
      ref={ref}
      role="status"
      className="flex h-10 min-w-0 flex-1 items-center gap-3 rounded-full border border-amber-600 bg-amber-500 pl-2 pr-1 text-white shadow-lg transition-[margin] duration-300 ease-out"
      style={{ marginLeft: shift, marginRight: rightInset }}
    >
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-black/15">
        <ExclamationTriangleIcon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold">
        {title}
        {body && <span className="font-normal text-white/85"> · {body}</span>}
      </span>
      <span className="hidden flex-shrink-0 items-center gap-1.5 text-[0.8125rem] font-semibold xl:flex">
        <span className="h-2 w-2 rounded-full bg-white" />
        {text.statuses[status]}
      </span>
      <a
        href={STATUS_URL}
        target="_blank"
        rel="noreferrer"
        className="flex flex-shrink-0 items-center gap-1 rounded-full bg-black/80 px-3 py-1.5 text-[0.8125rem] font-semibold text-white transition hover:bg-black active:scale-95"
      >
        {text.serviceStatus}
        <ArrowUpRightIcon className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

function seenId(id: string): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === id;
  } catch {
    return false;
  }
}

export function MaintenancePopup({ isLight, hold }: { isLight: boolean; hold?: boolean }) {
  const maintenance = useMaintenanceBanner();
  const [closedId, setClosedId] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);
  const isFr = appLanguage() === 'fr';
  const text = tx(isFr).maintenance;

  if (!maintenance) return resuming ? <ResumeScreen light={isLight} onDone={() => setResuming(false)} /> : null;
  const id = maintenance.simulated
    ? `test-${maintenance.config.startedAt}`
    : maintenance.incident?.id ?? `${maintenance.config.startedAt}-${maintenance.config.title}`;
  const open = !hold && closedId !== id && (maintenance.simulated || !seenId(id));
  const { title, body } = maintenanceText(maintenance, text.bannerDefault);
  const status = maintenance.incident?.status ?? maintenance.config.status;
  const started = startedLabel(maintenance.incident?.startedAt ?? maintenance.config.startedAt);
  const ink = isLight ? '#000000' : '#ffffff';
  const soft = isLight ? '#525252' : '#a3a3a3';

  const close = () => {
    if (!maintenance.simulated) {
      try {
        localStorage.setItem(SEEN_KEY, id);
      } catch {
      }
    }
    setClosedId(id);
    setResuming(true);
  };

  return (
    <>
    {resuming && <ResumeScreen light={isLight} onDone={() => setResuming(false)} />}
    <MapSheet isOpen={open} onClose={close} isLight={isLight} zIndex={10000} initialSnap={2}>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="px-6 pb-8 pt-4" role="dialog" aria-label={title}>
          <ExclamationTriangleIcon className="h-12 w-12" style={{ color: ink }} aria-hidden="true" />
          <p role="heading" aria-level={2} className="pt-6 text-[1.625rem] font-medium leading-[1.15]" style={{ color: ink }}>
            {title}
          </p>
          {body && (
            <p className="whitespace-pre-line pt-3 text-[1.0625rem] leading-snug" style={{ color: soft }}>
              {body}
            </p>
          )}
          <p className="flex items-center gap-2 pt-3 text-[0.875rem]" style={{ color: '#737373' }}>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_COLOR[status] }} />
            {text.statuses[status]}
            {started && <span className="tabular-nums">· {text.since(started)}</span>}
          </p>
          <a
            href={STATUS_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1 text-[0.9375rem] font-semibold underline underline-offset-4"
            style={{ color: ink }}
          >
            {text.moreDetails}
            <ArrowUpRightIcon className="h-4 w-4" />
          </a>
          <button
            type="button"
            onClick={close}
            className="mt-8 w-full rounded-2xl py-4 text-[1.0625rem] font-semibold transition active:scale-[0.98]"
            style={isLight ? { backgroundColor: '#000000', color: '#ffffff' } : { backgroundColor: '#ffffff', color: '#000000' }}
          >
            {tx(isFr).popupOverlay.gotIt}
          </button>
        </div>
        <MapSheetBottomSpacer />
      </div>
    </MapSheet>
    </>
  );
}
