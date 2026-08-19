/**
 * L'horaire réel, déduit de ceux qui sont déjà dans le bus.
 *
 * Le réseau ne publie aucune position de véhicule : pas de GTFS-RT, pas de
 * SIRI. Tout ce que l'application affiche est théorique, au mieux corrigé par
 * les estimations du routeur. Mais une source existe, que personne n'exploite —
 * les voyageurs eux-mêmes.
 *
 * Quelqu'un guidé sur la C1, monté à Chavant, qui atteint le troisième arrêt
 * avec deux minutes de retard sur l'horaire, vient de mesurer ce véhicule. Et
 * ce qu'il a mesuré vaut pour tous ceux qui l'attendent en aval : le bus ne va
 * pas rattraper son retard entre deux arrêts.
 *
 * Le mélange se fait donc ainsi : l'horaire théorique reste la base — c'est lui
 * qui sait à quelle heure part le prochain —, et les observations récentes lui
 * appliquent un décalage. Sans observation, rien ne change et l'on affiche le
 * théorique, comme avant.
 *
 * Ce qui circule ici ne désigne personne : un code de ligne, deux noms d'arrêt,
 * deux horodatages. Pas de coordonnées, pas d'identifiant d'appareil, pas de
 * trajet complet. On mesure un véhicule, pas un voyageur.
 */

import { supabase, isSupabaseConfigured } from './supabase';

/** Une observation telle qu'elle voyage. */
export interface LineObservation {
  lineId: string;
  fromStop: string;
  /** L'heure à laquelle le véhicule aurait dû partir de `fromStop`. */
  scheduledAt: string;
  toStop: string;
  /** L'heure à laquelle il a réellement atteint `toStop`. */
  observedAt: string;
  /** Écart constaté, en secondes. Positif : en retard. */
  delaySeconds: number;
}

/**
 * Au-delà, une observation ne dit plus rien du trafic présent.
 *
 * Une demi-heure : c'est la durée pendant laquelle un incident se propage
 * encore sur une ligne. Au-delà, le bus suivant est reparti d'un autre terminus
 * dans d'autres conditions.
 */
const FRESHNESS_MS = 30 * 60 * 1000;

/**
 * Un décalage plus grand qu'un quart d'heure n'est pas un retard, c'est une
 * erreur : horloge fausse, arrêt homonyme, ou quelqu'un qui a laissé son
 * guidage ouvert en descendant du bus.
 */
const MAX_PLAUSIBLE_DELAY_S = 15 * 60;

/**
 * Nombre d'observations en dessous duquel on ne corrige rien.
 *
 * Une seule mesure peut être n'importe quoi — un téléphone mal réglé, un
 * voyageur qui a raté sa correspondance et attend le suivant. Il en faut deux
 * qui disent la même chose pour qu'on accepte de déplacer un horaire affiché.
 */
const MIN_OBSERVATIONS = 2;

/** Le retard retenu pour une ligne, et sur quoi il repose. */
export interface LineDelay {
  /** Secondes de retard à appliquer au théorique. Positif : en retard. */
  seconds: number;
  /** Combien d'observations le soutiennent. */
  sampleSize: number;
  /** L'observation la plus récente qui y contribue. */
  latestAt: string;
}

function normalizeLine(value: string): string {
  return String(value || '').trim().toUpperCase().replace(/^SEM[:_]/, '');
}

/**
 * Publie ce qu'un voyageur vient de constater.
 *
 * Silencieux en cas d'échec : une observation perdue ne coûte qu'une observation.
 * Rien dans l'application n'attend cette écriture.
 */
export async function publishObservation(observation: LineObservation): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;

  const delay = Math.round(observation.delaySeconds);
  // On ne publie pas ce qu'on refuserait de lire.
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
    // Rien à rattraper.
  }
}

const delayCache = new Map<string, { value: LineDelay | null; at: number }>();
/** Une minute : au-delà, on redemande. En deçà, deux écrans partagent la réponse. */
const CACHE_MS = 60 * 1000;

/**
 * Le retard constaté sur une ligne, ou `null` si rien ne permet de l'affirmer.
 *
 * La médiane, pas la moyenne : sur cinq observations, un téléphone dont
 * l'horloge dérive de dix minutes emporterait la moyenne à lui seul. La médiane
 * l'ignore.
 */
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

/**
 * Applique le constaté au théorique.
 *
 * Le théorique reste la base : c'est lui qui sait qu'un bus part à 8h12 et le
 * suivant à 8h24. L'observation ne fait que le décaler. Un retard d'une minute
 * ou moins est ignoré — l'afficher donnerait une précision qu'on n'a pas, et
 * ferait clignoter les minutes sans raison.
 */
export function applyDelay(theoreticalMinutes: number, delay: LineDelay | null): number {
  if (!delay || Math.abs(delay.seconds) < 60) return theoreticalMinutes;
  return Math.max(0, theoreticalMinutes + Math.round(delay.seconds / 60));
}
