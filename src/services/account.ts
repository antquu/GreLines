/**
 * Le compte GreLines : un nom d'usage accroché à une carte OURA.
 *
 * Pas de mot de passe, pas d'adresse électronique, aucune connexion ailleurs. La
 * carte fait office de clé — on l'a déjà, elle est unique, et créer un
 * identifiant de plus aurait demandé un secret à retenir pour afficher un
 * pseudonyme.
 *
 * L'appareil retient quelle carte porte le compte ; le reste vit sur la base,
 * pour qu'un changement de téléphone ne remette pas les compteurs à zéro. Un seul
 * compte par appareil, et on ne le supprime pas depuis l'application : les points
 * accumulés ne doivent pas s'effacer sur un geste maladroit.
 */

import { supabase, isSupabaseConfigured } from './supabase';

const LINK_KEY = 'greLines_accountCard';

export interface Account {
  cardCode: string;
  firstName?: string | null;
  lastName?: string | null;
  pseudo: string;
  /** Émoji choisi, ou `null` pour la photo de la carte. */
  avatarEmoji: string | null;
  points: number;
  trips: number;
  travellersHelped: number;
  /** Quand le compte a été ouvert. */
  createdAt: string | null;
}

/* -------------------------------------------------------------------------- */
/*  L'attache à l'appareil                                                    */
/* -------------------------------------------------------------------------- */

export function linkedCardCode(): string | null {
  try {
    return localStorage.getItem(LINK_KEY);
  } catch {
    return null;
  }
}

function rememberCard(code: string): void {
  try {
    localStorage.setItem(LINK_KEY, code);
  } catch {
    // Navigation privée : le compte vaudra pour cette session.
  }
}

/* -------------------------------------------------------------------------- */
/*  L'avatar et le pseudonyme, tirés au sort                                  */
/* -------------------------------------------------------------------------- */

/**
 * Les émojis d'avatar.
 *
 * Aucune image ne se dépose : ni envoi, ni recadrage, ni modération. Un émoji
 * tiré parmi ceux-là ne peut pas être une insulte ni le visage de quelqu'un
 * d'autre, et c'est la seule façon d'ouvrir les avatars à tous sans employer une
 * personne à les regarder passer.
 *
 * Exportée, parce que les nuages de voyageurs y puisent aussi : les visages qui
 * tournent autour du vôtre doivent être des avatars possibles, sinon ils ne
 * représentent personne de crédible.
 */
export const AVATARS = [
  '🦊', '🐙', '🦉', '🐝', '🦔', '🐬', '🦋', '🐢', '🦜', '🦩',
  '🌻', '🍁', '🌵', '🍋', '🫐', '🥑', '🍄', '🌶️',
  '🚋', '🚲', '🛴', '⛰️', '🎿', '🥾', '🧭', '🪁',
  '🎧', '🎸', '🎲', '🧩', '📚', '☕', '🥐', '🧀',
];

export function randomAvatar(current?: string | null): string {
  // On évite de retomber sur le même : appuyer sur « régénérer » et ne rien voir
  // changer donne l'impression que le bouton est cassé.
  const pool = AVATARS.filter((emoji) => emoji !== current);
  return pool[Math.floor(Math.random() * pool.length)] ?? AVATARS[0];
}

/**
 * Les mots qui composent un pseudonyme tiré au sort.
 *
 * On ne laisse pas saisir de texte libre, pour la même raison que les avatars :
 * un pseudonyme choisi se modère, et personne ici ne peut le faire. Deux listes
 * assemblées donnent assez de combinaisons pour que personne ne se sente attribué
 * un numéro.
 */
const ADJECTIVES = [
  'agile', 'bavard', 'bizaroide', 'cosmique', 'discret', 'espiegle', 'flaneur',
  'givre', 'hardi', 'insolite', 'jovial', 'lunaire', 'malin', 'nomade',
  'ombrageux', 'ponctuel', 'rieur', 'solaire', 'tenace', 'vagabond',
];

const CREATURES = [
  'chamois', 'marmotte', 'bouquetin', 'hulotte', 'renard', 'loutre', 'faucon',
  'lynx', 'blaireau', 'heron', 'salamandre', 'cincle', 'gypaete', 'tetras',
];

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

/** Un pseudonyme entièrement tiré au sort : « @chamoisLunaire ». */
export function randomPseudo(): string {
  const adjective = pick(ADJECTIVES);
  return `@${pick(CREATURES)}${adjective.charAt(0).toUpperCase()}${adjective.slice(1)}`;
}

/**
 * Le pseudonyme proposé la première fois : le nom de la personne, puis un mot.
 *
 * Il vaut mieux qu'un tirage complet pour commencer, parce qu'on s'y reconnaît —
 * et le bouton à côté sert justement à s'en éloigner si l'on préfère.
 */
export function suggestedPseudo(firstName?: string | null, lastName?: string | null): string {
  const base = `${firstName ?? ''}${lastName ?? ''}`
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .replace(/[^A-Za-z]/g, '');
  if (!base) return randomPseudo();
  const adjective = pick(ADJECTIVES);
  return `@${base.charAt(0).toUpperCase()}${base.slice(1).toLowerCase()}${adjective
    .charAt(0)
    .toUpperCase()}${adjective.slice(1)}`;
}

/* -------------------------------------------------------------------------- */
/*  La base                                                                   */
/* -------------------------------------------------------------------------- */

function fromRow(row: any): Account {
  return {
    cardCode: String(row.card_code),
    firstName: row.first_name ?? null,
    lastName: row.last_name ?? null,
    pseudo: String(row.pseudo),
    avatarEmoji: row.avatar_emoji ?? null,
    points: Number(row.points) || 0,
    trips: Number(row.trips) || 0,
    travellersHelped: Number(row.travellers_helped) || 0,
    createdAt: row.created_at ?? null,
  };
}

/** Le compte de cet appareil, ou `null` s'il n'en a pas. */
export async function loadAccount(): Promise<Account | null> {
  const code = linkedCardCode();
  if (!code || !isSupabaseConfigured || !supabase) return null;
  try {
    const { data, error } = await supabase
      .from('oura_accounts')
      .select('*')
      .eq('card_code', code)
      .maybeSingle();
    if (error || !data) return null;
    return fromRow(data);
  } catch {
    return null;
  }
}

/**
 * Crée le compte et l'attache à l'appareil.
 *
 * `upsert` plutôt qu'`insert` : reprendre une carte déjà enregistrée — après une
 * réinstallation, par exemple — doit retrouver le compte et ses points, pas
 * échouer sur une clé en double.
 */
export async function createAccount(input: {
  cardCode: string;
  firstName?: string | null;
  lastName?: string | null;
  pseudo: string;
  avatarEmoji: string | null;
}): Promise<Account | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data, error } = await supabase
      .from('oura_accounts')
      .upsert(
        {
          card_code: input.cardCode,
          first_name: input.firstName ?? null,
          last_name: input.lastName ?? null,
          pseudo: input.pseudo,
          avatar_emoji: input.avatarEmoji,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'card_code' }
      )
      .select()
      .maybeSingle();
    if (error || !data) return null;
    rememberCard(input.cardCode);
    return fromRow(data);
  } catch {
    return null;
  }
}

export async function updateAccount(
  cardCode: string,
  changes: { pseudo?: string; avatarEmoji?: string | null }
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;
  try {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (changes.pseudo !== undefined) patch.pseudo = changes.pseudo;
    if (changes.avatarEmoji !== undefined) patch.avatar_emoji = changes.avatarEmoji;
    const { error } = await supabase.from('oura_accounts').update(patch).eq('card_code', cardCode);
    return !error;
  } catch {
    return false;
  }
}

/** Vrai si le pseudonyme est libre. */
export async function isPseudoFree(pseudo: string, exceptCard?: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return true;
  try {
    const { data } = await supabase
      .from('oura_accounts')
      .select('card_code')
      .ilike('pseudo', pseudo)
      .limit(1);
    if (!Array.isArray(data) || data.length === 0) return true;
    return data[0]?.card_code === exceptCard;
  } catch {
    return true;
  }
}

/**
 * Crédite un trajet terminé.
 *
 * L'addition se fait côté base : deux appareils sur la même carte feraient
 * chacun « lire, additionner, écrire », et le second effacerait le premier.
 */
export async function creditAccount(
  cardCode: string,
  credit: { points: number; trips: number; travellersHelped: number }
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    await supabase.rpc('credit_oura_account', {
      p_card_code: cardCode,
      p_points: credit.points,
      p_trips: credit.trips,
      p_helped: credit.travellersHelped,
    });
  } catch {
    // Le trajet reste compté sur l'appareil : voir `greLinesPoints`.
  }
}

/* -------------------------------------------------------------------------- */
/*  L'historique des trajets                                                  */
/* -------------------------------------------------------------------------- */

/** Un tronçon en transport. La marche n'y figure jamais. */
export interface TripLeg {
  line: string;
  from: string;
  to: string;
  departure?: string;
  arrival?: string;
  /**
   * La couleur de la ligne, telle qu'elle était ce jour-là.
   *
   * Enregistrée avec le trajet plutôt que retrouvée à l'affichage : les couleurs
   * du réseau changent — une ligne devient chrono, une teinte est retouchée — et
   * l'historique doit garder l'allure qu'il avait, comme il garde son tracé.
   */
  color?: string;
}

export interface AccountTrip {
  id: string;
  origin: string | null;
  destination: string | null;
  startedAt: string | null;
  endedAt: string | null;
  legs: TripLeg[];
  /** Couples [lon, lat]. */
  path: Array<[number, number]>;
  points: number;
  travellersHelped: number;
  createdAt: string;
}

/**
 * Allège un tracé avant de l'enregistrer.
 *
 * Un itinéraire de vingt minutes compte des milliers de points, dont l'immense
 * majorité ne se voit pas sur une carte de la taille d'un téléphone. On en garde
 * trois cents au plus, répartis régulièrement : assez pour reconnaître la forme
 * du trajet, sans stocker une trace GPS complète par voyage.
 */
function thinPath(path: Array<[number, number]>, limit = 300): Array<[number, number]> {
  if (!Array.isArray(path) || path.length <= limit) return path ?? [];
  const step = path.length / limit;
  const kept: Array<[number, number]> = [];
  for (let i = 0; i < limit; i++) kept.push(path[Math.floor(i * step)]);
  // Le dernier point compte : c'est là qu'on est arrivé.
  kept.push(path[path.length - 1]);
  return kept;
}

export async function recordTrip(
  cardCode: string,
  trip: {
    origin?: string | null;
    destination?: string | null;
    startedAt?: string | null;
    endedAt?: string | null;
    legs: TripLeg[];
    path: Array<[number, number]>;
    points: number;
    travellersHelped: number;
  }
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    await supabase.from('oura_account_trips').insert({
      card_code: cardCode,
      origin: trip.origin ?? null,
      destination: trip.destination ?? null,
      started_at: trip.startedAt ?? null,
      ended_at: trip.endedAt ?? null,
      legs: trip.legs,
      path: thinPath(trip.path),
      points: trip.points,
      travellers_helped: trip.travellersHelped,
    });
  } catch {
    // Le trajet reste compté dans les totaux : l'historique n'est pas la source.
  }
}

export async function listTrips(cardCode: string, limit = 60): Promise<AccountTrip[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from('oura_account_trips')
      .select('*')
      .eq('card_code', cardCode)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error || !Array.isArray(data)) return [];
    return data.map((row: any) => ({
      id: String(row.id),
      origin: row.origin ?? null,
      destination: row.destination ?? null,
      startedAt: row.started_at ?? null,
      endedAt: row.ended_at ?? null,
      legs: Array.isArray(row.legs) ? row.legs : [],
      path: Array.isArray(row.path) ? row.path : [],
      points: Number(row.points) || 0,
      travellersHelped: Number(row.travellers_helped) || 0,
      createdAt: String(row.created_at),
    }));
  } catch {
    return [];
  }
}
