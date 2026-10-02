export interface RequestEntry {
  id: number;
  startedAt: number;
  method: string;
  url: string;
  status: number | null;
  durationMs: number | null;
  bytes: number | null;
  kind: 'fetch' | 'xhr' | 'resource';
  error?: string;
}

const MAX_ENTRIES = 500;

let entries: RequestEntry[] = [];
let total = 0;
let nextId = 1;
const listeners = new Set<() => void>();

let scheduled = false;
let snapshot = { entries, total };
function notify() {
  snapshot = { entries, total };
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    for (const listener of listeners) listener();
  });
}

function start(method: string, url: string, kind: RequestEntry['kind']): RequestEntry {
  const entry: RequestEntry = {
    id: nextId++,
    startedAt: Date.now(),
    method: method.toUpperCase(),
    url,
    status: null,
    durationMs: null,
    bytes: null,
    kind,
  };
  total += 1;
  entries = [...entries, entry].slice(-MAX_ENTRIES);
  notify();
  return entry;
}

function finish(entry: RequestEntry, status: number, bytes: number | null, error?: string) {
  entries = entries.map(item =>
    item.id === entry.id
      ? { ...item, status, bytes, error, durationMs: Date.now() - item.startedAt }
      : item,
  );
  notify();
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

let installed = false;

export function installRequestLog(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    const entry = start(method, urlOf(input), 'fetch');
    try {
      const response = await originalFetch(input, init);
      const length = Number(response.headers.get('content-length'));
      finish(entry, response.status, Number.isFinite(length) && length > 0 ? length : null);
      return response;
    } catch (error) {
      finish(entry, 0, null, error instanceof Error ? error.message : String(error));
      throw error;
    }
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const meta = new WeakMap<XMLHttpRequest, { method: string; url: string }>();
  XMLHttpRequest.prototype.open = function open(this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    meta.set(this, { method, url: String(url) });
    return (originalOpen as (...args: unknown[]) => void).call(this, method, url, ...rest);
  } as typeof XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.send = function send(this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    const info = meta.get(this);
    if (info) {
      const entry = start(info.method, info.url, 'xhr');
      this.addEventListener('loadend', () => {
        const length = Number(this.getResponseHeader('content-length'));
        finish(entry, this.status, Number.isFinite(length) && length > 0 ? length : null, this.status === 0 ? 'network error' : undefined);
      });
    }
    return originalSend.call(this, body);
  };

  try {
    const observer = new PerformanceObserver(list => {
      for (const item of list.getEntries() as PerformanceResourceTiming[]) {
        if (item.initiatorType === 'fetch' || item.initiatorType === 'xmlhttprequest') continue;
        total += 1;
        entries = [...entries, {
          id: nextId++,
          startedAt: performance.timeOrigin + item.startTime,
          method: 'GET',
          url: item.name,
          status: (item as PerformanceResourceTiming & { responseStatus?: number }).responseStatus || 200,
          durationMs: Math.round(item.duration),
          bytes: item.transferSize || null,
          kind: 'resource' as const,
        }].slice(-MAX_ENTRIES);
      }
      notify();
    });
    observer.observe({ type: 'resource', buffered: false });
  } catch {
  }
}

export function getRequestLog(): { entries: RequestEntry[]; total: number } {
  return snapshot;
}

export function clearRequestLog(): void {
  entries = [];
  total = 0;
  notify();
}

export function subscribeRequestLog(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
