import { supabase, isSupabaseConfigured } from './supabase';

export interface LineReputation {
  rating: number | null;
  onTimeRate: number | null;
  crowding: number | null;
  sampleSize: number;
}

const MIN_SAMPLE = 5;

const WINDOW_DAYS = 90;

const cache = new Map<string, { value: LineReputation | null; at: number }>();
const CACHE_MS = 10 * 60 * 1000;

function normalizeLine(value: string): string {
  return String(value || '').trim().toUpperCase().replace(/^SEM[:_]/, '');
}

export async function getLineReputation(lineId: string): Promise<LineReputation | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const key = normalizeLine(lineId);
  if (!key) return null;

  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

  try {
    const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString();
    const { data, error } = await supabase.rpc('trip_survey_scores', { p_line_id: key, p_since: since });

    if (error || !Array.isArray(data) || data.length < MIN_SAMPLE) {
      cache.set(key, { value: null, at: Date.now() });
      return null;
    }

    const scores: number[] = [];
    const crowdingScores: number[] = [];
    let onTimeTotal = 0;
    let onTimeYes = 0;

    for (const row of data as any[]) {
      for (const field of ['cleanliness', 'comfort', 'crowding', 'punctuality']) {
        const value = Number(row[field]);
        if (Number.isFinite(value) && value >= 1 && value <= 5) scores.push(value);
      }
      const crowd = Number(row.crowding);
      if (Number.isFinite(crowd) && crowd >= 1 && crowd <= 5) crowdingScores.push(crowd);
      if (row.on_time !== null && row.on_time !== undefined) {
        onTimeTotal += 1;
        if (row.on_time) onTimeYes += 1;
      }
    }

    const value: LineReputation = {
      rating: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
      onTimeRate: onTimeTotal > 0 ? (onTimeYes / onTimeTotal) * 100 : null,
      crowding:
        crowdingScores.length > 0
          ? crowdingScores.reduce((a, b) => a + b, 0) / crowdingScores.length
          : null,
      sampleSize: data.length,
    };
    cache.set(key, { value, at: Date.now() });
    return value;
  } catch {
    return null;
  }
}
