import { supabase, isSupabaseConfigured } from './supabase';

const LINK_KEY = 'greLines_accountCard';

const PHOTO_BUCKET = 'oura-photos';
const AVATAR_PREFIX = 'avatars';

function avatarUrlOf(path?: string | null): string | null {
  if (!path || !supabase) return null;
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function uploadAccountAvatar(
  cardCode: string,
  photo: Blob,
): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const path = `${AVATAR_PREFIX}/${cardCode}-${Date.now()}.jpg`;
  try {
    const { error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, photo, { contentType: photo.type || 'image/jpeg', upsert: true });
    return error ? null : path;
  } catch {
    return null;
  }
}

export interface Account {
  cardCode: string;
  firstName?: string | null;
  lastName?: string | null;
  pseudo: string;
  avatarEmoji: string | null;
  avatarPath: string | null;
  avatarUrl: string | null;
  points: number;
  trips: number;
  travellersHelped: number;
  createdAt: string | null;
}

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
  }
}

export const AVATARS = [
  '🦊', '🐙', '🦉', '🐝', '🦔', '🐬', '🦋', '🐢', '🦜', '🦩',
  '🌻', '🍁', '🌵', '🍋', '🫐', '🥑', '🍄', '🌶️',
  '🚋', '🚲', '🛴', '⛰️', '🎿', '🥾', '🧭', '🪁',
  '🎧', '🎸', '🎲', '🧩', '📚', '☕', '🥐', '🧀',
];

export function randomAvatar(current?: string | null): string {
  const pool = AVATARS.filter((emoji) => emoji !== current);
  return pool[Math.floor(Math.random() * pool.length)] ?? AVATARS[0];
}

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

export function randomPseudo(): string {
  const adjective = pick(ADJECTIVES);
  return `@${pick(CREATURES)}${adjective.charAt(0).toUpperCase()}${adjective.slice(1)}`;
}

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

function fromRow(row: any): Account {
  return {
    cardCode: String(row.card_code),
    firstName: row.first_name ?? null,
    lastName: row.last_name ?? null,
    pseudo: String(row.pseudo),
    avatarEmoji: row.avatar_emoji ?? null,
    avatarPath: row.avatar_path ?? null,
    avatarUrl: avatarUrlOf(row.avatar_path),
    points: Number(row.points) || 0,
    trips: Number(row.trips) || 0,
    travellersHelped: Number(row.travellers_helped) || 0,
    createdAt: row.created_at ?? null,
  };
}

export async function loadAccount(): Promise<Account | null> {
  const code = linkedCardCode();
  if (!code) return null;
  return loadAccountForCard(code);
}

export function adoptAccount(account: Account): Account {
  rememberCard(account.cardCode);
  return account;
}

export async function loadAccountForCard(cardCode: string): Promise<Account | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data, error } = await supabase
      .rpc('oura_account_get', { p_code: cardCode })
      .maybeSingle();
    if (error || !data) return null;
    return fromRow(data);
  } catch {
    return null;
  }
}

export async function createAccount(input: {
  cardCode: string;
  firstName?: string | null;
  lastName?: string | null;
  pseudo: string;
  avatarEmoji: string | null;
  avatarPath?: string | null;
}): Promise<Account | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data, error } = await supabase
      .rpc('oura_account_create', {
        p_code: input.cardCode,
        p_first_name: input.firstName ?? null,
        p_last_name: input.lastName ?? null,
        p_pseudo: input.pseudo,
        p_avatar_emoji: input.avatarEmoji,
        p_avatar_path: input.avatarPath ?? null,
      })
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
  changes: { pseudo?: string; avatarEmoji?: string | null; avatarPath?: string | null }
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;
  try {
    const patch: Record<string, unknown> = {};
    if (changes.pseudo !== undefined) patch.pseudo = changes.pseudo;
    if (changes.avatarEmoji !== undefined) patch.avatar_emoji = changes.avatarEmoji;
    if (changes.avatarPath !== undefined) patch.avatar_path = changes.avatarPath;
    const { data, error } = await supabase.rpc('oura_account_update', {
      p_code: cardCode,
      p_changes: patch,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}

export async function isPseudoFree(pseudo: string, exceptCard?: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return true;
  try {
    const { data, error } = await supabase.rpc('oura_pseudo_free', {
      p_pseudo: pseudo,
      p_except_code: exceptCard ?? null,
    });
    if (error) return true;
    return data !== false;
  } catch {
    return true;
  }
}

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
  }
}

export interface TripLeg {
  line: string;
  from: string;
  to: string;
  departure?: string;
  arrival?: string;
  color?: string;
}

export interface AccountTrip {
  id: string;
  origin: string | null;
  destination: string | null;
  startedAt: string | null;
  endedAt: string | null;
  legs: TripLeg[];
  path: Array<[number, number]>;
  points: number;
  travellersHelped: number;
  createdAt: string;
}

function thinPath(path: Array<[number, number]>, limit = 300): Array<[number, number]> {
  if (!Array.isArray(path) || path.length <= limit) return path ?? [];
  const step = path.length / limit;
  const kept: Array<[number, number]> = [];
  for (let i = 0; i < limit; i++) kept.push(path[Math.floor(i * step)]);
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
    await supabase.rpc('oura_trip_record', {
      p_code: cardCode,
      p_origin: trip.origin ?? null,
      p_destination: trip.destination ?? null,
      p_started_at: trip.startedAt ?? null,
      p_ended_at: trip.endedAt ?? null,
      p_legs: trip.legs,
      p_path: thinPath(trip.path),
      p_points: trip.points,
      p_helped: trip.travellersHelped,
    });
  } catch {
  }
}

export async function listTrips(cardCode: string, limit = 60): Promise<AccountTrip[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  try {
    const { data, error } = await supabase.rpc('oura_trips_list', {
      p_code: cardCode,
      p_limit: limit,
    });
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
