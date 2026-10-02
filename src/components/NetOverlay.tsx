import { useEffect, useRef, useSyncExternalStore } from 'react';
import { usePerfSettings } from '../hooks/usePerfSettings';
import { getRequestLog, subscribeRequestLog, type RequestEntry } from '../services/requestLog';


const clock = (at: number) => {
  const date = new Date(at);
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');
};

const size = (bytes: number | null) => {
  if (bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

function target(url: string): { host: string; path: string } {
  try {
    const parsed = new URL(url, window.location.href);
    const host = parsed.origin === window.location.origin ? 'local' : parsed.host;
    return { host, path: `${parsed.pathname}${parsed.search}` };
  } catch {
    return { host: '?', path: url };
  }
}

function Line({ entry }: { entry: RequestEntry }) {
  const { host, path } = target(entry.url);
  const verb = entry.kind === 'resource' ? 'Loading' : entry.method === 'GET' ? 'Fetching' : `Sending ${entry.method} to`;
  const failed = entry.status === 0 || (entry.status !== null && entry.status >= 400);
  const result = entry.status === null
    ? 'pending...'
    : entry.status === 0
    ? `FAILED ${entry.error ?? ''}`.trim()
    : [String(entry.status), entry.durationMs !== null ? `${entry.durationMs}ms` : '', size(entry.bytes)].filter(Boolean).join(' ');

  return (
    <div className="whitespace-pre-wrap break-all" style={{ color: failed ? '#f87171' : entry.status === null ? '#fbbf24' : '#e5e7eb' }}>
      <span style={{ color: '#6b7280' }}>#{String(entry.id).padStart(4, '0')} {clock(entry.startedAt)} </span>
      {verb} <span style={{ color: '#ffffff', fontWeight: 700 }}>{host}</span>
      <span style={{ color: '#9ca3af' }}> {path}</span>
      <span> -&gt; {result}</span>
    </div>
  );
}

export function NetOverlay() {
  const { settings } = usePerfSettings();
  const enabled = settings.devMode && settings.netOverlay;
  const log = useSyncExternalStore(subscribeRequestLog, getRequestLog);
  const scrollRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);

  useEffect(() => {
    const panel = scrollRef.current;
    if (panel && followRef.current) panel.scrollTop = panel.scrollHeight;
  }, [log, enabled]);

  if (!enabled) return null;

  const pending = log.entries.filter(entry => entry.status === null).length;
  const failed = log.entries.filter(entry => entry.status === 0 || (entry.status ?? 0) >= 400).length;

  return (
    <div
      className="fixed right-2 top-2 z-[10250] flex w-[min(460px,calc(100vw-16px))] flex-col font-mono text-[0.6875rem] leading-[1.35]"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.72)', color: '#e5e7eb', maxHeight: '45vh' }}
      aria-label="Network requests"
    >
      <div className="flex-shrink-0 border-b border-white/15 px-2 py-1" style={{ color: '#ffffff' }}>
        NETWORK  requests: {log.total}  pending: {pending}  failed: {failed}
      </div>
      <div
        ref={scrollRef}
        onScroll={event => {
          const panel = event.currentTarget;
          followRef.current = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 12;
        }}
        className="min-h-0 flex-1 overflow-y-auto px-2 py-1"
      >
        {log.entries.length === 0
          ? <div style={{ color: '#6b7280' }}>Waiting for requests...</div>
          : log.entries.map(entry => <Line key={entry.id} entry={entry} />)}
      </div>
    </div>
  );
}
