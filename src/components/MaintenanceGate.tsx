import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRightIcon, ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import { STATUS_URL, maintenanceText, useMaintenance, useMaintenanceBanner, type MaintenanceStatus, type StatusIncident } from '../services/maintenance';
import { MapSheet, MapSheetBottomSpacer } from './MapSheet';
import { appLanguage } from '../utils/appLanguage';
import { tx } from '../i18n';

const STATUS_COLOR: Record<MaintenanceStatus, string> = {
  investigating: '#f59e0b',
  identified: '#f97316',
  monitoring: '#22c55e',
};
const SEEN_KEY = 'gl-maintenance-seen';

function startedLabel(startedAt: string | null): string | null {
  if (!startedAt) return null;
  const date = new Date(startedAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(appLanguage() === 'fr' ? 'fr-FR' : 'en-GB', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function IncidentCard({ incident }: { incident: StatusIncident }) {
  const text = tx(appLanguage() === 'fr').maintenance;
  const started = startedLabel(incident.startedAt);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
      className="mt-12 w-full max-w-md rounded-2xl bg-white/[0.07] p-5 text-left"
    >
      <div className="flex items-start justify-between gap-4">
        <p className="min-w-0 text-[1.125rem] font-semibold leading-tight">{incident.title || text.technicalIssue}</p>
        <span className="flex flex-shrink-0 items-center gap-2 pt-0.5 text-[0.8125rem] font-semibold">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_COLOR[incident.status] }} />
          {text.statuses[incident.status]}
        </span>
      </div>
      {started && <p className="mt-1.5 text-[0.875rem] tabular-nums text-[#a3a3a3]">{text.since(started)}</p>}
      {incident.body && <p className="mt-3 whitespace-pre-line text-[0.9375rem] leading-snug text-[#d4d4d4]">{incident.body}</p>}
      <div className="mt-4 flex justify-end">
        <a
          href={STATUS_URL}
          target="_blank"
          rel="noreferrer"
          className="flex flex-shrink-0 items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[0.9375rem] font-semibold text-black transition active:scale-95"
        >
          {text.moreDetails}
          <ArrowUpRightIcon className="h-4 w-4" />
        </a>
      </div>
    </motion.div>
  );
}

function LockScreen({ incident }: { incident: StatusIncident | null }) {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.background;
    root.style.background = '#000000';
    return () => {
      root.style.background = previous;
    };
  }, []);

  return (
    <main
      className={`fixed inset-0 z-[20000] flex flex-col items-center overflow-y-auto bg-black px-5 pb-10 text-center text-white ${
        incident ? 'pt-[20vh]' : 'justify-center'
      }`}
      style={{ height: '100dvh' }}
    >
      <motion.img
        layout
        src="/assets/GreLinesLOGO.png"
        alt="GreLines"
        className="h-auto w-64 lg:w-80"
        style={{ transform: incident ? undefined : 'translateY(-2.5%)' }}
        draggable={false}
      />
      {incident && <IncidentCard incident={incident} />}
    </main>
  );
}

export function MaintenanceGate({ children }: { children: ReactNode }) {
  const maintenance = useMaintenance();
  if (maintenance?.config.mode === 'lock') return <LockScreen incident={maintenance.incident} />;
  return <>{children}</>;
}

// grows from the last button to the right edge, minus any open panel
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
  const isFr = appLanguage() === 'fr';
  const text = tx(isFr).maintenance;

  if (!maintenance) return null;
  const id = maintenance.incident?.id ?? `${maintenance.config.startedAt}-${maintenance.config.title}`;
  const open = !hold && closedId !== id && !seenId(id);
  const { title, body } = maintenanceText(maintenance, text.bannerDefault);
  const status = maintenance.incident?.status ?? maintenance.config.status;
  const started = startedLabel(maintenance.incident?.startedAt ?? maintenance.config.startedAt);
  const ink = isLight ? '#000000' : '#ffffff';
  const soft = isLight ? '#525252' : '#a3a3a3';

  const close = () => {
    try {
      localStorage.setItem(SEEN_KEY, id);
    } catch {
      // private mode, the popup just comes back next time
    }
    setClosedId(id);
  };

  return (
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
  );
}
