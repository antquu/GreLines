import { supabase, isSupabaseConfigured } from './supabase';

export type ShareStatus = 'walking' | 'waiting' | 'onboard' | 'arrived';

export interface ShareEvent {
  at: number;
  text: string;
}

export interface SharePayload {
  name: string;
  avatar: string;
  lat: number | null;
  lon: number | null;
  arrivalAt: number | null;
  destination: string;
  status: ShareStatus;
  headline: string;
  line: string | null;
  lineColor: string | null;
  lineText: string | null;
  events: ShareEvent[];
  path: Array<[number, number]>;
  legs?: ShareLeg[];
  segments?: ShareSegment[];
  timeline?: ShareTimelineStep[];
  progress?: number;
  at: number;
}

export interface ShareLine {
  id: string;
  shortName: string;
  color: string;
  textColor: string;
}

export interface ShareLeg {
  walk: boolean;
  color: string;
  line: ShareLine | null;
  path: Array<[number, number]>;
  stops: Array<[number, number]>;
}

export interface ShareStop {
  name: string;
  time: string;
  passed: boolean;
}

export interface ShareTimelineStep {
  kind: 'walk' | 'transit' | 'arrival';
  label: string;
  time: string;
  line?: ShareLine;
  stops: ShareStop[];
  done: boolean;
  current: boolean;
}

export interface ShareSegment {
  kind: 'walk' | 'transit';
  share: number;
  line?: ShareLine;
}

interface StoredShare {
  token: string;
  ownerKey?: string;
  trip: string;
  expiresAt: number;
}

const STORAGE_KEY = 'greLines_tripShare_v1';
const NAME_KEY = 'greLines_shareName';
const MAX_SHARE_MS = 3 * 60 * 60 * 1000;
const HELLO_EVERY_MS = 8000;
const PERSIST_EVERY_MS = 20000;
const FULL_EVERY = 10;
const OWNER_KEY = 'greLines_tripShare_owner';
const OWNER_STALE_MS = 4000;
const TAB_ID = randomTabId();

function randomTabId(): string {
  return Math.random().toString(36).slice(2, 12);
}

function sendingElsewhere(token: string): boolean {
  try {
    const raw = localStorage.getItem(OWNER_KEY);
    if (!raw) return false;
    const owner = JSON.parse(raw) as { token?: string; tab?: string; at?: number };
    return owner.token === token && owner.tab !== TAB_ID && Date.now() - Number(owner.at) < OWNER_STALE_MS;
  } catch {
    return false;
  }
}

function claimSending(token: string) {
  try {
    localStorage.setItem(OWNER_KEY, JSON.stringify({ token, tab: TAB_ID, at: Date.now() }));
  } catch {
  }
}

export const isShareAvailable = isSupabaseConfigured;

function randomToken(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(10);
  try {
    crypto.getRandomValues(bytes);
  } catch {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, value => alphabet[value % alphabet.length]).join('');
}

export function shareUrl(token: string): string {
  return `${window.location.origin}/share/${token}`;
}

const FOLLOW_KEY = 'greLines_followToken';

export function rememberFollowToken(token: string): void {
  try {
    localStorage.setItem(FOLLOW_KEY, JSON.stringify({ token, at: Date.now() }));
  } catch {
  }
}

export function followTokenFromSession(): string | null {
  try {
    const raw = localStorage.getItem(FOLLOW_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as { token?: string; at?: number };
    if (!stored.token || !stored.at || Date.now() - stored.at > MAX_SHARE_MS) {
      localStorage.removeItem(FOLLOW_KEY);
      return null;
    }
    return stored.token;
  } catch {
    return null;
  }
}

export function forgetFollowToken(): void {
  try {
    localStorage.removeItem(FOLLOW_KEY);
  } catch {
  }
}

export function loadShareName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveShareName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name.trim().slice(0, 24));
  } catch {
  }
}

export interface StoredShareKeys {
  token: string;
  ownerKey: string;
}

export function loadStoredShare(trip: string): StoredShareKeys | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredShare;
    if (stored.trip !== trip || Date.now() > stored.expiresAt || !stored.ownerKey) return null;
    return { token: stored.token, ownerKey: stored.ownerKey };
  } catch {
    return null;
  }
}

function storeShare(keys: StoredShareKeys, trip: string) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...keys, trip, expiresAt: Date.now() + MAX_SHARE_MS }));
  } catch {
  }
}

function forgetShare() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
  }
}

export interface ShareSender {
  token: string;
  send: (payload: SharePayload) => void;
  end: () => void;
  close: () => void;
}

export function openShareSender(trip: string, existing?: StoredShareKeys | null): ShareSender | null {
  if (!isSupabaseConfigured || !supabase) return null;
  const client = supabase;
  const keys: StoredShareKeys = existing ?? { token: randomToken(), ownerKey: randomToken() + randomToken() };
  const { token, ownerKey } = keys;
  storeShare(keys, trip);

  const channel = client.channel(`gl-share:${token}`, { config: { broadcast: { self: false } } });
  let ready = false;
  let last: SharePayload | null = null;
  let saved = false;
  let savedAt = 0;
  let closed = false;
  let pushes = 0;

  const push = (full = false) => {
    if (!ready || !last) return;
    if (sendingElsewhere(token)) return;
    claimSending(token);
    const body = full || pushes % FULL_EVERY === 0 ? last : { ...last, legs: undefined, path: [] };
    pushes += 1;
    void channel.send({ type: 'broadcast', event: 'pos', payload: body });
  };

  const persist = () => {
    if (!last || closed || sendingElsewhere(token)) return;
    const at = Date.now();
    if (saved && at - savedAt < PERSIST_EVERY_MS) return;
    savedAt = at;
    const fn = saved ? 'trip_share_update' : 'trip_share_start';
    saved = true;
    void client.rpc(fn, { p_token: token, p_owner_key: ownerKey, p_payload: last }).then(({ error }) => {
      if (error && fn === 'trip_share_start') saved = false;
    });
  };

  channel
    .on('broadcast', { event: 'hello' }, () => push(true))
    .subscribe(status => {
      if (status !== 'SUBSCRIBED') return;
      ready = true;
      push(true);
    });

  return {
    token,
    send: payload => {
      last = payload;
      push();
      persist();
    },
    end: () => {
      closed = true;
      forgetShare();
      void client.rpc('trip_share_end', { p_token: token, p_owner_key: ownerKey });
      if (ready) void channel.send({ type: 'broadcast', event: 'end', payload: last ?? {} });
      window.setTimeout(() => void client.removeChannel(channel), 800);
    },
    close: () => {
      closed = true;
      ready = false;
      void client.removeChannel(channel);
    },
  };
}

export type ShareLookup =
  | { state: 'found'; payload: SharePayload | null }
  | { state: 'unknown' }
  | { state: 'unchecked' };

export async function fetchShare(token: string): Promise<ShareLookup> {
  if (!isSupabaseConfigured || !supabase) return { state: 'unchecked' };
  if (!/^[a-z0-9]{6,16}$/.test(token)) return { state: 'unknown' };
  const { data, error } = await supabase.rpc('trip_share_get', { p_token: token });
  if (error) return { state: 'unchecked' };
  if (!data) return { state: 'unknown' };
  return { state: 'found', payload: ((data as { payload?: SharePayload | null }).payload ?? null) };
}

export function watchShare(
  token: string,
  handlers: { onUpdate: (payload: SharePayload) => void; onEnd: (payload: Partial<SharePayload>) => void },
): () => void {
  if (!isSupabaseConfigured || !supabase) return () => undefined;
  const client = supabase;
  const channel = client.channel(`gl-share:${token}`, { config: { broadcast: { self: false } } });
  let ready = false;
  let base: SharePayload | null = null;

  const merge = (next: SharePayload): SharePayload => {
    const merged: SharePayload = {
      ...(base ?? next),
      ...next,
      legs: next.legs ?? base?.legs,
      path: next.path && next.path.length > 0 ? next.path : base?.path ?? [],
    };
    base = merged;
    return merged;
  };

  const hello = () => {
    if (ready) void channel.send({ type: 'broadcast', event: 'hello', payload: {} });
  };

  channel
    .on('broadcast', { event: 'pos' }, message => handlers.onUpdate(merge(message.payload as SharePayload)))
    .on('broadcast', { event: 'end' }, message => handlers.onEnd((message.payload ?? {}) as Partial<SharePayload>))
    .subscribe(status => {
      if (status !== 'SUBSCRIBED') return;
      ready = true;
      hello();
    });

  const timer = window.setInterval(hello, HELLO_EVERY_MS);
  return () => {
    window.clearInterval(timer);
    void client.removeChannel(channel);
  };
}
