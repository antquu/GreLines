/**
 * Ce que les voyageurs savent et que l'API ne dira jamais.
 *
 * Le réseau publie des horaires, et un profil d'affluence moyen par quart
 * d'heure. Il ne publie ni le remplissage réel du véhicule qui arrive, ni les
 * passages fantômes — ces courses annoncées à l'affichage qui ne viennent
 * jamais —, ni l'état du jour d'une rampe ou d'un ascenseur. Or c'est
 * exactement ce qui décide de monter ou d'attendre le suivant.
 *
 * Ces trois-là ne se constatent que sur place. L'application y est déjà : le
 * bandeau de guidage pose ses questions à quelqu'un qui attend sur le quai ou
 * qui est assis dans le véhicule. Une carte touchée, et le signalement part.
 *
 * Agrégés, ils donnent une pastille verte, orange ou rouge sur les prochains
 * passages. Le calcul mêle deux choses :
 *   * ce qui vient d'être signalé — la dernière heure, qui parle de ce
 *     véhicule-ci et de cet incident-là ;
 *   * ce qu'on signale d'habitude à cette tranche horaire — le mardi 8 h 15
 *     ressemble aux mardis 8 h 15 précédents.
 * Le premier pèse trois fois le second : quand il y a du frais, c'est le frais
 * qui commande ; quand il n'y en a pas, l'habitude vaut mieux que rien.
 *
 * Sans assez d'avis, la fonction rend `null` et l'écran reste celui d'avant. On
 * ne remplace jamais une information manquante par une information inventée.
 *
 * Ce qui circule ne désigne personne : un genre de question, un code de ligne,
 * un identifiant d'arrêt, une note de 1 à 3, une tranche horaire. Ni
 * coordonnées, ni identifiant d'appareil, ni trajet.
 */

import { supabase, isSupabaseConfigured } from './supabase';

/** Les quatre choses qu'on ne peut savoir qu'en étant là. */
export type SignalKind = 'crowding' | 'delay' | 'ghost' | 'access';

/**
 * Une note, toujours dans le même sens quel que soit le sujet.
 *
 * 1 est toujours la mauvaise nouvelle — véhicule plein, gros retard, passage
 * jamais venu, rampe hors service — et 3 la bonne. Une échelle unique pour
 * quatre questions est ce qui permet d'en faire une seule pastille.
 */
export type SignalValue = 1 | 2 | 3;

export interface CrowdSignal {
  kind: SignalKind;
  /** Code court de ligne, quand le signalement porte sur un véhicule. */
  lineId?: string | null;
  /** Identifiant de poteau, quand il porte sur un quai. */
  stopId?: string | null;
  stopName?: string | null;
  value: SignalValue;
}

function normalizeLine(value: unknown): string {
  return String(value || '').trim().toUpperCase().replace(/^SEM[:_]/, '');
}

/**
 * La tranche horaire d'un instant : jour de la semaine × 96 + quart d'heure.
 *
 * Précalculée à l'écriture parce qu'on la relit à chaque lecture : comparer un
 * mardi 8 h 15 aux mardis 8 h 15 précédents ne doit pas coûter une conversion
 * de date par ligne rendue.
 */
export function slotBucket(at: Date = new Date()): number {
  const quarter = Math.floor((at.getHours() * 60 + at.getMinutes()) / 15);
  return at.getDay() * 96 + quarter;
}

/**
 * Le garde-fou contre le doigt qui s'emballe.
 *
 * Un même appareil ne pèse qu'une fois par sujet et par quart d'heure. Ce n'est
 * pas une sécurité — sans compte, rien ne l'est — mais ça suffit à empêcher le
 * bruit involontaire : la question reposée deux écrans plus loin, le double
 * appui, le rechargement de page. La fraude motivée, elle, se traite à la
 * lecture, par le nombre d'avis exigé.
 */
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

/**
 * Publie ce qu'un voyageur vient de constater.
 *
 * Silencieux en cas d'échec : un signalement perdu ne coûte qu'un signalement,
 * et rien dans l'application n'attend cette écriture.
 */
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

/** Ce que les avis disent d'un arrêt ou d'une ligne, à cette heure-ci. */
export interface CrowdConfidence {
  /** La pastille : vert, orange, rouge. */
  level: 'good' | 'fair' | 'poor';
  /** La note agrégée, de 1 (rouge franc) à 3 (vert franc). */
  score: number;
  /** Combien d'avis la soutiennent, toutes fenêtres confondues. */
  sample: number;
  /** Vrai si au moins un avis date de la dernière heure. */
  fresh: boolean;
  /** Remplissage moyen constaté, de 1 (plein) à 3 (des places), ou `null`. */
  crowding: number | null;
  /** Part des avis « pas passé » parmi les signalements de passage, de 0 à 1. */
  ghostRate: number | null;
  /** Ponctualité ressentie, de 1 (gros retard) à 3 (à l'heure), ou `null`. */
  punctuality: number | null;
  /** L'accès du jour, quand quelqu'un l'a constaté. */
  accessible: boolean | null;
}

interface SignalRow {
  kind: SignalKind;
  value: number;
  reported_at: string;
}

/** La fenêtre du frais : au-delà, on parle d'un autre véhicule. */
const FRESH_MS = 60 * 60 * 1000;
/** L'habitude se lit sur quatre semaines de la même tranche horaire. */
const HABIT_MS = 28 * 24 * 60 * 60 * 1000;
/** Le frais commande quand il existe ; l'habitude ne fait que combler. */
const FRESH_WEIGHT = 3;

/**
 * En dessous, on n'affiche rien.
 *
 * Un avis unique peut être n'importe quoi : quelqu'un qui répond au hasard, ou
 * qui note le véhicule d'à côté. Deux qui disent la même chose, c'est déjà une
 * information — c'est le seuil retenu ailleurs dans l'application pour les
 * retards constatés, et il n'y a pas de raison d'être plus exigeant ici.
 */
const MIN_SAMPLE = 2;

const cache = new Map<string, { value: CrowdConfidence | null; at: number }>();
/** Une minute : les quatorze cartes du carrousel partagent la même réponse. */
const CACHE_MS = 60 * 1000;

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * La confiance qu'on peut accorder aux prochains passages d'une ligne à un arrêt.
 *
 * `null` quand personne n'a rien signalé : l'appelant n'affiche alors aucune
 * pastille, et l'écran est exactement celui d'avant.
 */
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
    /*
     * Deux requêtes, pas une.
     *
     * Le frais et l'habitude ne se filtrent pas pareil — l'un par date, l'autre
     * par tranche horaire — et les mêler dans un seul filtre rendrait un jeu
     * qu'il faudrait re-trier côté client pour savoir lequel pèse quoi.
     *
     * On vise la ligne d'abord : c'est elle que le carrousel annonce. L'arrêt
     * resserre ensuite, sans exclure ce qui a été signalé à bord — un « bondé »
     * envoyé en roulant ne porte aucun arrêt, et c'est pourtant le signalement
     * le plus utile à qui attend ce véhicule-là quelques stations plus loin.
     * D'où le « cet arrêt, ou aucun » : la C1 à La Poya et la C1 en marche, mais
     * pas la C1 à un quai de l'autre bout de la ligne.
     */
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
    /*
     * L'heure qui vient de s'écouler appartient aussi à la tranche courante :
     * sans cette coupure, les avis les plus récents compteraient deux fois — une
     * fois au poids du frais, une fois au poids de l'habitude.
     */
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

    /*
     * La note : la moyenne pondérée de tout ce qui a été dit, le frais comptant
     * triple. Les quatre genres tombent dans le même panier parce qu'ils sont
     * déjà sur la même échelle — c'est tout l'intérêt de les y avoir mis.
     */
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

    /*
     * Un passage fantôme n'est pas une nuance, c'est une promesse rompue : on
     * attend un véhicule qui n'existe pas. Dès qu'un tiers des signalements de
     * passage le disent, la pastille passe au rouge quoi que disent les autres
     * questions — mieux vaut avertir à tort que laisser quelqu'un attendre.
     */
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
