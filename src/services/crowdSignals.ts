import { supabase, isSupabaseConfigured } from './supabase';

export type SignalKind = 'crowding' | 'delay' | 'ghost' | 'access';

export type SignalValue = 1 | 2 | 3;

export interface CrowdSignal {
  kind: SignalKind;
  lineId?: string | null;
  stopId?: string | null;
  stopName?: string | null;
  value: SignalValue;
}

function normalizeLine(value: unknown): string {
  return String(value || '').trim().toUpperCase().replace(/^SEM[:_]/, '');
}

export function slotBucket(at: Date = new Date()): number {
  const quarter = Math.floor((at.getHours() * 60 + at.getMinutes()) / 15);
  return at.getDay() * 96 + quarter;
}

const THROTTLE_KEY = 'greLines_crowdSignalsSent';
const THROTTLE_MS = 15 * 60 * 1000;

function throttleKey(signal: CrowdSignal): string {
  return `${signal.kind}|${normalizeLine(signal.lineId)}|${signal.stopId ?? ''}`;
}

function recentlySent(signal: CrowdSignal): boolean {
  try {
    const raw = localStorage.getItem(THROTTLE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const at = map[throttleKey(signal)];
    return typeof at === 'number' && Date.now() - at < THROTTLE_MS;
  } catch {
    return false;
  }
}

function rememberSent(signal: CrowdSignal) {
  try {
    const raw = localStorage.getItem(THROTTLE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const now = Date.now();
    for (const [key, at] of Object.entries(map)) {
      if (typeof at !== 'number' || now - at > THROTTLE_MS) delete map[key];
    }
    map[throttleKey(signal)] = now;
    localStorage.setItem(THROTTLE_KEY, JSON.stringify(map));
  } catch {
  }
}

export async function publishSignal(signal: CrowdSignal): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  if (signal.value !== 1 && signal.value !== 2 && signal.value !== 3) return;
  const line = normalizeLine(signal.lineId);
  if (!line && !signal.stopId) return;
  if (recentlySent(signal)) return;

  rememberSent(signal);
  try {
    await supabase.from('crowd_signals').insert({
      kind: signal.kind,
      line_id: line || null,
      stop_id: signal.stopId ?? null,
      stop_name: signal.stopName ?? null,
      value: signal.value,
      slot_bucket: slotBucket(),
      reported_at: new Date().toISOString(),
    });
  } catch {
  }
}

export interface CrowdConfidence {
  level: 'good' | 'fair' | 'poor';
  score: number;
  sample: number;
  fresh: boolean;
  crowding: number | null;
  ghostRate: number | null;
  punctuality: number | null;
  accessible: boolean | null;
}

interface SignalRow {
  kind: SignalKind;
  value: number;
  reported_at: string;
}

const FRESH_MS = 60 * 60 * 1000;
const HABIT_MS = 28 * 24 * 60 * 60 * 1000;
const FRESH_WEIGHT = 3;

const MIN_SAMPLE = 2;

const cache = new Map<string, { value: CrowdConfidence | null; at: number }>();
const CACHE_MS = 60 * 1000;

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export async function getCrowdConfidence(
  stopId: string | null | undefined,
  lineId: string | null | undefined
): Promise<CrowdConfidence | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const line = normalizeLine(lineId);
  const stop = String(stopId ?? '').trim();
  if (!line && !stop) return null;

  const bucket = slotBucket();
  const key = `${stop}|${line}|${bucket}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

  const remember = (value: CrowdConfidence | null) => {
    cache.set(key, { value, at: Date.now() });
    return value;
  };

  try {
    const select = 'kind, value, reported_at';
    const atStop = `stop_id.is.null,stop_id.eq.${stop}`;
    let freshQuery = supabase
      .from('crowd_signals')
      .select(select)
      .gte('reported_at', new Date(Date.now() - FRESH_MS).toISOString())
      .order('reported_at', { ascending: false })
      .limit(60);
    if (line) freshQuery = freshQuery.eq('line_id', line);
    if (stop) freshQuery = line ? freshQuery.or(atStop) : freshQuery.eq('stop_id', stop);

    let habitQuery = supabase
      .from('crowd_signals')
      .select(select)
      .eq('slot_bucket', bucket)
      .gte('reported_at', new Date(Date.now() - HABIT_MS).toISOString())
      .order('reported_at', { ascending: false })
      .limit(120);
    if (line) habitQuery = habitQuery.eq('line_id', line);
    if (stop) habitQuery = line ? habitQuery.or(atStop) : habitQuery.eq('stop_id', stop);

    const [freshResult, habitResult] = await Promise.all([freshQuery, habitQuery]);

    const fresh: SignalRow[] = Array.isArray(freshResult.data)
      ? (freshResult.data as unknown as SignalRow[])
      : [];
    const freshWindowStart = Date.now() - FRESH_MS;
    const habit: SignalRow[] = (
      Array.isArray(habitResult.data) ? (habitResult.data as unknown as SignalRow[]) : []
    ).filter((row) => new Date(row.reported_at).getTime() < freshWindowStart);

    const sample = fresh.length + habit.length;
    if (sample < MIN_SAMPLE) return remember(null);

    const all = [...fresh, ...habit];
    const valuesOf = (kind: SignalKind) =>
      all.filter((row) => row.kind === kind).map((row) => Number(row.value)).filter(Number.isFinite);

    const crowding = mean(valuesOf('crowding'));
    const punctuality = mean(valuesOf('delay'));
    const ghosts = valuesOf('ghost');
    const ghostRate = ghosts.length > 0 ? ghosts.filter((v) => v === 1).length / ghosts.length : null;
    const access = valuesOf('access');
    const accessible = access.length > 0 ? (mean(access) ?? 3) >= 2 : null;

    const weighted = (rows: SignalRow[], weight: number) =>
      rows.reduce(
        (acc, row) => {
          const value = Number(row.value);
          if (!Number.isFinite(value)) return acc;
          acc.sum += value * weight;
          acc.weight += weight;
          return acc;
        },
        { sum: 0, weight: 0 }
      );

    const recent = weighted(fresh, FRESH_WEIGHT);
    const usual = weighted(habit, 1);
    const totalWeight = recent.weight + usual.weight;
    if (totalWeight === 0) return remember(null);
    let score = (recent.sum + usual.sum) / totalWeight;

    if (ghostRate !== null && ghostRate >= 0.34) score = Math.min(score, 1.6);

    const level: CrowdConfidence['level'] = score >= 2.4 ? 'good' : score >= 1.7 ? 'fair' : 'poor';

    return remember({
      level,
      score,
      sample,
      fresh: fresh.length > 0,
      crowding,
      ghostRate,
      punctuality,
      accessible,
    });
  } catch {
    return null;
  }
}
