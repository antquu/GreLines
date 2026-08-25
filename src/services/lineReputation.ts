/**
 * Ce que les voyageurs pensent d'une ligne, ramené à deux chiffres.
 *
 * Les enquêtes qualité dormaient dans la base : elles servaient à l'exploitant,
 * jamais à celui qui monte. Or c'est en montant qu'on aimerait savoir si la
 * ligne tient ses horaires — et c'est en le voyant affiché qu'on comprend à
 * quoi sert d'avoir répondu la fois d'avant.
 *
 * Deux chiffres seulement, parce qu'ils se lisent d'un coup d'œil sur un quai :
 * une note générale, et la part de trajets jugés à l'heure.
 */

import { supabase, isSupabaseConfigured } from './supabase';

export interface LineReputation {
  /** Note moyenne sur 5, tous critères confondus. */
  rating: number | null;
  /** Part des trajets déclarés à l'heure, en pourcentage. */
  onTimeRate: number | null;
  /**
   * Affluence ressentie, de 1 (bondé) à 5 (des places assises).
   *
   * C'est la seule mesure d'affluence honnête dont dispose l'application : le
   * réseau n'expose aucun taux de charge par véhicule. Elle vaut pour la ligne
   * et son heure moyenne, pas pour le passage qu'on attend.
   */
  crowding: number | null;
  /** Sur combien d'avis. Un chiffre sans son assise ne veut rien dire. */
  sampleSize: number;
}

/**
 * En dessous, on n'affiche rien.
 *
 * Trois avis font une anecdote, pas une réputation — et une ligne étiquetée
 * « 2,0 ★ » sur trois réponses d'un mauvais jour est une injustice qui se voit.
 */
const MIN_SAMPLE = 5;

/** Les avis récents pèsent le vrai ; ceux d'il y a un an décrivent un autre réseau. */
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
    const { data, error } = await supabase
      .from('trip_surveys')
      .select('cleanliness, comfort, crowding, punctuality, on_time')
      .eq('line_id', key)
      .gte('created_at', since)
      .limit(500);

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
