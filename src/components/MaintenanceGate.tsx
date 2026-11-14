import { useEffect, useState, type ReactNode } from 'react';
import { ArrowUpRightIcon } from '@heroicons/react/24/solid';
import { STATUS_URL, watchMaintenance, type MaintenanceConfig } from '../services/maintenance';
import { appLanguage } from '../utils/appLanguage';
import { tx } from '../i18n';

const BANNER_PX = 44;
const STATUS_COLOR: Record<MaintenanceConfig['status'], string> = {
  investigating: '#f59e0b',
  identified: '#f97316',
  monitoring: '#22c55e',
};

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

function LockScreen({ config }: { config: MaintenanceConfig }) {
  const text = tx(appLanguage() === 'fr').maintenance;
  const started = startedLabel(config.startedAt);

  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.background;
    root.style.background = '#0b0b0b';
    return () => {
      root.style.background = previous;
    };
  }, []);

  return (
    <main className="fixed inset-0 z-[20000] flex flex-col items-center overflow-y-auto bg-[#0b0b0b] px-5 pb-10 pt-[18vh] text-center text-white">
      <div className="flex items-center gap-3">
        <img src="/flavicon.png" alt="" className="h-12 w-12 rounded-xl" />
        <span className="text-[2.25rem] font-semibold leading-none" style={{ letterSpacing: '-0.01em' }}>GreLines</span>
      </div>

      <p className="mt-8 max-w-md text-[1.0625rem] leading-snug text-[#d4d4d4]">
        {config.message || text.unavailable}
      </p>

      <div className="mt-8 w-full max-w-md rounded-2xl bg-white/[0.07] p-5 text-left">
        <div className="flex items-start justify-between gap-4">
          <p className="min-w-0 text-[1.125rem] font-semibold leading-tight">{config.title || text.technicalIssue}</p>
          <span className="flex flex-shrink-0 items-center gap-2 pt-0.5 text-[0.8125rem] font-semibold">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_COLOR[config.status] }} />
            {text.statuses[config.status]}
          </span>
        </div>
        {started && (
          <p className="mt-1.5 text-[0.875rem] tabular-nums text-[#a3a3a3]">{text.since(started)}</p>
        )}
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
      </div>
    </main>
  );
}

function Banner({ config }: { config: MaintenanceConfig }) {
  const text = tx(appLanguage() === 'fr').maintenance;

  useEffect(() => {
    const root = document.documentElement;
    // everything pinned under the status bar moves down by the height of the banner
    root.style.setProperty('--gl-safe-top', `calc(env(safe-area-inset-top, 0px) * 1.35 + ${BANNER_PX}px)`);
    return () => {
      root.style.removeProperty('--gl-safe-top');
    };
  }, []);

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[20000] flex items-center gap-3 bg-[#fbbf24] px-4 text-[#1c1917]"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', height: `calc(env(safe-area-inset-top, 0px) + ${BANNER_PX}px)` }}
    >
      <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold">
        {config.message || config.title || text.bannerDefault}
      </span>
      <a
        href={STATUS_URL}
        target="_blank"
        rel="noreferrer"
        className="flex flex-shrink-0 items-center gap-1 rounded-full bg-[#1c1917] px-3 py-1.5 text-[0.8125rem] font-semibold text-white transition active:scale-95"
      >
        {text.serviceStatus}
        <ArrowUpRightIcon className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

export function MaintenanceGate({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<MaintenanceConfig | null>(null);

  useEffect(() => watchMaintenance(setConfig), []);

  if (config?.mode === 'lock') return <LockScreen config={config} />;
  return (
    <>
      {config?.mode === 'banner' && <Banner config={config} />}
      {children}
    </>
  );
}
