import { supabase, isSupabaseConfigured } from './supabase';

export interface LineObservation {
  lineId: string;
  fromStop: string;
  scheduledAt: string;
  toStop: string;
  observedAt: string;
  delaySeconds: number;
}

const FRESHNESS_MS = 30 * 60 * 1000;

const MAX_PLAUSIBLE_DELAY_S = 15 * 60;

const MIN_OBSERVATIONS = 2;

export interface LineDelay {
  seconds: number;
  sampleSize: number;
  latestAt: string;
}

function normalizeLine(value: string): string {
  return String(value || '').trim().toUpperCase().replace(/^SEM[:_]/, '');
}

export async function publishObservation(observation: LineObservation): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;

  const delay = Math.round(observation.delaySeconds);
  if (!Number.isFinite(delay) || Math.abs(delay) > MAX_PLAUSIBLE_DELAY_S) return;
  if (!observation.lineId || !observation.fromStop || !observation.toStop) return;

  try {
    await supabase.from('line_observations').insert({
      line_id: normalizeLine(observation.lineId),
      from_stop: observation.fromStop,
      scheduled_at: observation.scheduledAt,
      to_stop: observation.toStop,
      observed_at: observation.observedAt,
      delay_seconds: delay,
    });
  } catch {
  }
}

const delayCache = new Map<string, { value: LineDelay | null; at: number }>();
const CACHE_MS = 60 * 1000;

export async function getLineDelay(lineId: string): Promise<LineDelay | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const key = normalizeLine(lineId);
  if (!key) return null;

  const cached = delayCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

  try {
    const since = new Date(Date.now() - FRESHNESS_MS).toISOString();
    const { data, error } = await supabase
      .from('line_observations')
      .select('delay_seconds, observed_at')
      .eq('line_id', key)
      .gte('observed_at', since)
      .order('observed_at', { ascending: false })
      .limit(40);

    if (error || !Array.isArray(data) || data.length < MIN_OBSERVATIONS) {
      delayCache.set(key, { value: null, at: Date.now() });
      return null;
    }

    const delays = data
      .map(row => Number(row.delay_seconds))
      .filter(value => Number.isFinite(value) && Math.abs(value) <= MAX_PLAUSIBLE_DELAY_S)
      .sort((a, b) => a - b);

    if (delays.length < MIN_OBSERVATIONS) {
      delayCache.set(key, { value: null, at: Date.now() });
      return null;
    }

    const middle = Math.floor(delays.length / 2);
    const median =
      delays.length % 2 === 0 ? Math.round((delays[middle - 1] + delays[middle]) / 2) : delays[middle];

    const value: LineDelay = {
      seconds: median,
      sampleSize: delays.length,
      latestAt: String(data[0].observed_at),
    };
    delayCache.set(key, { value, at: Date.now() });
    return value;
  } catch {
    return null;
  }
}

export function applyDelay(theoreticalMinutes: number, delay: LineDelay | null): number {
  if (!delay || Math.abs(delay.seconds) < 60) return theoreticalMinutes;
  return Math.max(0, theoreticalMinutes + Math.round(delay.seconds / 60));
}
