import { supabase, isSupabaseConfigured } from './supabase';

export type LiveRole = 'waiting' | 'onboard';

export interface LiveState {
  role: LiveRole;
  stop: string;
  avatar: string;
}

interface LivePeer extends LiveState {
  at: number;
}

export interface LiveSnapshot {
  waiting: Map<string, string[]>;
  onboard: Array<{ stop: string; at: number }>;
}

export const EMPTY_LIVE: LiveSnapshot = { waiting: new Map(), onboard: [] };

const STALE_MS = 10 * 60 * 1000;

const sessionKey = (() => {
  try {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  } catch {
    return Math.random().toString(36).slice(2, 14);
  }
})();

export function normalizeLiveStop(name: unknown): string {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(',')
    .pop()!
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function slug(value: unknown): string {
  return normalizeLiveStop(value).replace(/ /g, '-').slice(0, 40) || 'x';
}

export interface LiveLine {
  track: (state: LiveState | null) => void;
  leave: () => void;
}

export function joinLiveLine(
  line: string,
  headsign: string | null | undefined,
  onSnapshot: (snapshot: LiveSnapshot) => void,
): LiveLine {
  if (!isSupabaseConfigured || !supabase) return { track: () => undefined, leave: () => undefined };
  const client = supabase;
  const channel = client.channel(`gl-live:${slug(line)}:${slug(headsign)}`, {
    config: { presence: { key: sessionKey } },
  });

  let ready = false;
  let wanted: LiveState | null = null;
  let sent = '';

  const publish = () => {
    if (!ready) return;
    const signature = wanted ? `${wanted.role}|${wanted.stop}` : '';
    if (signature === sent) return;
    sent = signature;
    if (wanted) void channel.track({ ...wanted, at: Date.now() });
    else void channel.untrack();
  };

  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<LivePeer>();
      const waiting = new Map<string, string[]>();
      const onboard: LiveSnapshot['onboard'] = [];
      const now = Date.now();
      for (const [key, metas] of Object.entries(state)) {
        if (key === sessionKey) continue;
        const peer = metas[metas.length - 1];
        if (!peer?.stop || now - Number(peer.at) > STALE_MS) continue;
        const stop = normalizeLiveStop(peer.stop);
        if (peer.role === 'waiting') {
          waiting.set(stop, [...(waiting.get(stop) ?? []), String(peer.avatar ?? '')]);
        } else if (peer.role === 'onboard') {
          onboard.push({ stop, at: Number(peer.at) });
        }
      }
      onboard.sort((a, b) => b.at - a.at);
      onSnapshot({ waiting, onboard });
    })
    .subscribe(status => {
      if (status !== 'SUBSCRIBED') return;
      ready = true;
      sent = '';
      publish();
    });

  return {
    track: state => {
      wanted = state;
      publish();
    },
    leave: () => {
      ready = false;
      void client.removeChannel(channel);
    },
  };
}
