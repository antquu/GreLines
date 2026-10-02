import { supabase, isSupabaseConfigured } from './supabase';
import { linkedCardCode } from './account';

const AIRWEB_ENDPOINT = 'https://api.grenoble.run.airweb.fr/shop/medias';
const NETWORK_PREFIX = '2';
const DEVICE_KEY = 'greLines_deviceId_v1';
const CARDS_KEY = 'greLines_cardCodes_v1';
const PHOTO_BUCKET = 'oura-photos';

export interface OuraContract {
  id: string;
  label: string;
  networkLabel?: string;
  startingAt?: string;
  endingAt?: string;
  status?: string;
}

export interface OuraCardLookup {
  code: string;
  type?: string;
  birthDate?: string;
  expiresAt?: string;
  isExpired: boolean;
  isBlackListed: boolean;
  isLocked: boolean;
  isInvalid: boolean;
  contracts: OuraContract[];
}

export interface OuraCard {
  id: string;
  cardCode: string;
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  expiresAt?: string;
  contractLabel?: string;
  contractStartingAt?: string;
  contractEndingAt?: string;
  networkLabel?: string;
  photoPath?: string;
  photoUrl?: string;
  isExpired: boolean;
  isBlacklisted: boolean;
  isLocked?: boolean;
  isInvalid?: boolean;
  isTest?: boolean;
  isDisabled?: boolean;
  isMissing?: boolean;
  isNetworkMissing?: boolean;
}

export function normalizeCardCode(raw: string): string {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length <= 10) return digits.padStart(10, '0');
  return digits.slice(-10);
}

export function getDeviceId(): string {
  try {
    const saved = localStorage.getItem(DEVICE_KEY);
    if (saved) return saved;
    const id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return 'volatile';
  }
}

function readLocalCodes(): string[] {
  try {
    const raw = localStorage.getItem(CARDS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((code): code is string => typeof code === 'string') : [];
  } catch {
    return [];
  }
}

function writeLocalCodes(codes: string[]): void {
  try {
    localStorage.setItem(CARDS_KEY, JSON.stringify([...new Set(codes)]));
  } catch {
  }
}

function rememberLocalCode(code: string): void {
  writeLocalCodes([...readLocalCodes(), code]);
}

function forgetLocalCode(code: string): void {
  writeLocalCodes(readLocalCodes().filter(entry => entry !== code));
}

export async function lookupOuraCard(rawCode: string): Promise<OuraCardLookup | null> {
  const code = normalizeCardCode(rawCode);
  if (code.length !== 10) return null;

  const mediaId = `${NETWORK_PREFIX}-${code}`;
  let media: Record<string, unknown>;
  try {
    const response = await fetch(`${AIRWEB_ENDPOINT}/${mediaId}`);
    if (!response.ok) return null;
    media = await response.json();
    if (!media || typeof media !== 'object' || !media.code) return null;
  } catch {
    return null;
  }

  let contracts: OuraContract[] = [];
  try {
    const response = await fetch(`${AIRWEB_ENDPOINT}/${mediaId}/contracts`);
    if (response.ok) {
      const raw = await response.json();
      if (Array.isArray(raw)) {
        contracts = raw.map((entry): OuraContract => ({
          id: String(entry?.id ?? ''),
          label: String(entry?.label ?? ''),
          networkLabel: entry?.networkLabel ? String(entry.networkLabel) : undefined,
          startingAt: entry?.startingAt ? String(entry.startingAt) : undefined,
          endingAt: entry?.endingAt ? String(entry.endingAt) : undefined,
          status: entry?.status ? String(entry.status) : undefined,
        }));
      }
    }
  } catch {
  }

  return {
    code: String(media.code),
    type: media.type ? String(media.type) : undefined,
    birthDate: media.holderBirthDate ? String(media.holderBirthDate) : undefined,
    expiresAt: media.expiresAt ? String(media.expiresAt) : undefined,
    isExpired: Boolean(media.isExpired),
    isBlackListed: Boolean(media.isBlackListed),
    isLocked: Boolean(media.isLocked),
    isInvalid: Boolean(media.isInvalid),
    contracts,
  };
}

export function currentContract(contracts: OuraContract[]): OuraContract | undefined {
  const now = Date.now();
  const running = contracts.find(contract => {
    const start = contract.startingAt ? new Date(contract.startingAt).getTime() : -Infinity;
    const end = contract.endingAt ? new Date(contract.endingAt).getTime() : Infinity;
    return start <= now && now <= end;
  });
  if (running) return running;
  return [...contracts].sort((a, b) => (
    new Date(b.endingAt ?? 0).getTime() - new Date(a.endingAt ?? 0).getTime()
  ))[0];
}

function publicPhotoUrl(path?: string | null): string | undefined {
  if (!path || !supabase) return undefined;
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

interface CardRow {
  id?: string;
  card_code: string;
  first_name: string | null;
  last_name: string | null;
  birth_date: string | null;
  expires_at: string | null;
  contract_label: string | null;
  contract_starting_at: string | null;
  contract_ending_at: string | null;
  network_label: string | null;
  photo_path: string | null;
  is_expired: boolean | null;
  is_blacklisted: boolean | null;
  is_locked?: boolean | null;
  is_invalid?: boolean | null;
  is_test?: boolean | null;
  is_disabled?: boolean | null;
}

function toCard(row: CardRow): OuraCard {
  return {
    id: row.card_code,
    cardCode: row.card_code,
    firstName: row.first_name ?? undefined,
    lastName: row.last_name ?? undefined,
    birthDate: row.birth_date ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    contractLabel: row.contract_label ?? undefined,
    contractStartingAt: row.contract_starting_at ?? undefined,
    contractEndingAt: row.contract_ending_at ?? undefined,
    networkLabel: row.network_label ?? undefined,
    photoPath: row.photo_path ?? undefined,
    photoUrl: publicPhotoUrl(row.photo_path),
    isExpired: Boolean(row.is_expired),
    isBlacklisted: Boolean(row.is_blacklisted),
    isLocked: Boolean(row.is_locked),
    isInvalid: Boolean(row.is_invalid),
    isTest: Boolean(row.is_test),
    isDisabled: Boolean(row.is_disabled),
  };
}

export async function listOuraCards(): Promise<OuraCard[]> {
  if (!supabase) return [];

  const { data } = await supabase.rpc('oura_device_cards', { p_device: getDeviceId() });

  const linked = (Array.isArray(data) ? data : []).map(code => String(code));
  const codes = [...new Set([...linked, ...readLocalCodes()])];
  if (codes.length === 0) return [];
  writeLocalCodes(codes);

  const { data: holders, error } = await supabase.rpc('oura_holders_get', { p_codes: codes });
  if (error || !Array.isArray(holders)) return [];

  const missing = codes.filter(code => !linked.includes(code));
  for (const code of missing) {
    void supabase.rpc('oura_card_link', { p_device: getDeviceId(), p_code: code });
  }

  const byCode = new Map((holders as CardRow[]).map(row => [row.card_code, row]));
  return codes.map(code => {
    const row = byCode.get(code);
    if (row) return toCard(row);
    return {
      id: code,
      cardCode: code,
      isExpired: false,
      isBlacklisted: false,
      isDisabled: true,
      isMissing: true,
    } satisfies OuraCard;
  });
}

export async function findKnownCard(rawCode: string): Promise<OuraCard | null> {
  if (!supabase) return null;
  const code = normalizeCardCode(rawCode);
  const { data, error } = await supabase.rpc('oura_holder_get', { p_code: code }).maybeSingle();
  if (error || !data) return null;
  return toCard(data as CardRow);
}

export async function attachTestCard(rawCode: string): Promise<OuraCard | null> {
  const known = await findKnownCard(rawCode);
  if (!known || !known.isTest) return null;
  await attachKnownCard(known.cardCode);
  return known;
}

export async function saveTestCard(
  cardCode: string,
  input: { firstName?: string; lastName?: string; photo?: Blob | null; photoPath?: string },
): Promise<OuraCard | null> {
  if (!supabase) return null;
  const code = normalizeCardCode(cardCode);

  let photoPath = input.photoPath;
  if (input.photo) {
    const path = `${getDeviceId()}/${code}-${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, input.photo, { contentType: input.photo.type || 'image/jpeg', upsert: false });
    if (error) return null;
    photoPath = path;
  }

  const { data, error } = await supabase
    .rpc('oura_test_card_save', {
      p_code: code,
      p_first_name: input.firstName?.trim() || null,
      p_last_name: input.lastName?.trim() || null,
      p_photo_path: photoPath ?? null,
    })
    .maybeSingle();
  if (error || !data) return null;

  await attachKnownCard(code);
  return toCard(data as CardRow);
}

export interface SaveCardInput {
  lookup: OuraCardLookup;
  firstName?: string;
  lastName?: string;
  photo?: Blob | null;
  photoPath?: string;
}

export async function saveOuraCard(input: SaveCardInput): Promise<OuraCard | null> {
  if (!supabase) return null;
  const { lookup } = input;
  const deviceId = getDeviceId();

  let photoPath: string | undefined = input.photoPath;
  if (input.photo) {
    const path = `${deviceId}/${lookup.code}-${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, input.photo, { contentType: input.photo.type || 'image/jpeg', upsert: false });
    if (error) return null;
    photoPath = path;
  }

  const contract = currentContract(lookup.contracts);
  const { data, error } = await supabase
    .rpc('oura_holder_save', {
      p_code: lookup.code,
      p_first_name: input.firstName?.trim() || null,
      p_last_name: input.lastName?.trim() || null,
      p_birth_date: lookup.birthDate || null,
      p_expires_at: lookup.expiresAt || null,
      p_contract_label: contract?.label || null,
      p_contract_starting_at: contract?.startingAt || null,
      p_contract_ending_at: contract?.endingAt || null,
      p_network_label: contract?.networkLabel || null,
      p_photo_path: photoPath || null,
      p_is_expired: lookup.isExpired,
      p_is_blacklisted: lookup.isBlackListed,
      p_is_locked: lookup.isLocked,
      p_is_invalid: lookup.isInvalid,
    })
    .maybeSingle();
  if (error || !data) return null;

  await supabase.rpc('oura_card_link', { p_device: deviceId, p_code: lookup.code });
  rememberLocalCode(lookup.code);

  return toCard(data as CardRow);
}

export const OURA_TERMS_VERSION = '2026-10-02';

const TERMS_KEY = 'greLines_ouraTermsAccepted';

export async function recordTermsAcceptance(cardCode: string): Promise<void> {
  const code = normalizeCardCode(cardCode);
  try {
    const stored = JSON.parse(localStorage.getItem(TERMS_KEY) || '{}') as Record<string, { version: string; at: string }>;
    stored[code] = { version: OURA_TERMS_VERSION, at: new Date().toISOString() };
    localStorage.setItem(TERMS_KEY, JSON.stringify(stored));
  } catch {
  }
  if (!supabase) return;
  try {
    await supabase.rpc('oura_terms_accept', { p_code: code, p_device: getDeviceId(), p_version: OURA_TERMS_VERSION });
  } catch {
  }
}

export async function attachKnownCard(cardCode: string): Promise<boolean> {
  if (!supabase) return false;
  const code = normalizeCardCode(cardCode);
  await supabase.rpc('oura_card_link', { p_device: getDeviceId(), p_code: code });
  rememberLocalCode(code);
  void announceWalletAdd(code);
  return true;
}

export async function transferCard(
  fromCode: string,
  target: OuraCardLookup | { testCode: string },
): Promise<OuraCard | null> {
  if (!supabase) return null;
  const previous = await findKnownCard(fromCode);
  const saved = 'testCode' in target
    ? await saveTestCard(target.testCode, {
        firstName: previous?.firstName,
        lastName: previous?.lastName,
        photoPath: previous?.photoPath,
      })
    : await saveOuraCard({
        lookup: target,
        firstName: previous?.firstName,
        lastName: previous?.lastName,
        photoPath: previous?.photoPath,
      });
  if (!saved) return null;
  await supabase.rpc('oura_holder_disable', { p_code: normalizeCardCode(fromCode) });
  return saved;
}

export type CardBlockedBy = 'grelines' | 'network' | 'expired' | null;

export function cardBlockedBy(card: OuraCard): CardBlockedBy {
  if (card.isMissing) return 'grelines';
  if (card.isDisabled) return 'grelines';
  if (card.isNetworkMissing) return 'network';
  if (card.isBlacklisted || card.isLocked || card.isInvalid) return 'network';
  const end = card.contractEndingAt ?? card.expiresAt;
  if (card.isExpired || (end && new Date(end).getTime() < Date.now())) return 'expired';
  return null;
}

export async function verifyCards(cards: OuraCard[]): Promise<OuraCard[]> {
  return Promise.all(cards.map(async card => {
    if (card.isTest || card.isMissing) return card;
    const found = await lookupOuraCard(card.cardCode);
    if (!found) return { ...card, isNetworkMissing: true };

    const contract = currentContract(found.contracts);
    const refreshed: OuraCard = {
      ...card,
      isNetworkMissing: false,
      expiresAt: found.expiresAt ?? card.expiresAt,
      contractLabel: contract?.label ?? card.contractLabel,
      contractStartingAt: contract?.startingAt ?? card.contractStartingAt,
      contractEndingAt: contract?.endingAt ?? card.contractEndingAt,
      networkLabel: contract?.networkLabel ?? card.networkLabel,
      isExpired: found.isExpired,
      isBlacklisted: found.isBlackListed,
      isLocked: found.isLocked,
      isInvalid: found.isInvalid,
    };

    const sameInstant = (a?: string, b?: string) =>
      (a ? new Date(a).getTime() : null) === (b ? new Date(b).getTime() : null);
    const changed =
      !sameInstant(refreshed.expiresAt, card.expiresAt)
      || !sameInstant(refreshed.contractStartingAt, card.contractStartingAt)
      || !sameInstant(refreshed.contractEndingAt, card.contractEndingAt)
      || refreshed.contractLabel !== card.contractLabel
      || refreshed.networkLabel !== card.networkLabel
      || refreshed.isExpired !== card.isExpired
      || refreshed.isBlacklisted !== card.isBlacklisted
      || refreshed.isLocked !== card.isLocked
      || refreshed.isInvalid !== card.isInvalid;
    if (changed) void persistVerification(refreshed, found);

    return refreshed;
  }));
}

async function persistVerification(card: OuraCard, found: OuraCardLookup): Promise<void> {
  if (!supabase) return;
  const contract = currentContract(found.contracts);
  await supabase.rpc('oura_holder_save', {
    p_code: card.cardCode,
    p_first_name: card.firstName || null,
    p_last_name: card.lastName || null,
    p_birth_date: found.birthDate || card.birthDate || null,
    p_expires_at: found.expiresAt || null,
    p_contract_label: contract?.label || null,
    p_contract_starting_at: contract?.startingAt || null,
    p_contract_ending_at: contract?.endingAt || null,
    p_network_label: contract?.networkLabel || null,
    p_photo_path: null,
    p_is_expired: found.isExpired,
    p_is_blacklisted: found.isBlackListed,
    p_is_locked: found.isLocked,
    p_is_invalid: found.isInvalid,
  });
}

const CHANGE_POLL_MS = 20_000;

function watchedCodes(): string[] {
  const codes = readLocalCodes();
  const account = linkedCardCode();
  if (account) codes.push(account);
  return [...new Set(codes)];
}

export function subscribeToCards(onChange: () => void): () => void {
  const client = supabase;
  if (!client) return () => {};

  let lastSeen: string | null | undefined;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = () => {
    if (stopped) return;
    clearTimeout(timer);
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    timer = setTimeout(() => { void check(); }, CHANGE_POLL_MS);
  };

  const check = async () => {
    if (stopped) return;
    const codes = watchedCodes();
    if (codes.length > 0) {
      const { data, error } = await client.rpc('oura_last_change', { p_codes: codes });
      if (!error && !stopped) {
        const seen = data ? String(data) : null;
        if (lastSeen !== undefined && seen !== lastSeen) onChange();
        lastSeen = seen;
      }
    }
    schedule();
  };

  const onVisible = () => {
    if (document.visibilityState === 'visible') void check();
  };

  void check();
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);

  return () => {
    stopped = true;
    clearTimeout(timer);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
  };
}

export interface OuraNotificationLink {
  label: string;
  url: string;
}

export interface OuraNotification {
  id: string;
  title: string;
  body?: string;
  kind: string;
  createdAt: string;
  links: OuraNotificationLink[];
}

function parseNotificationLinks(raw: unknown): OuraNotificationLink[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): OuraNotificationLink[] => {
    if (!entry || typeof entry !== 'object') return [];
    const url = String((entry as Record<string, unknown>).url ?? '').trim();
    if (!/^https?:\/\//i.test(url)) return [];
    const label = String((entry as Record<string, unknown>).label ?? '').trim();
    return [{ label: label || url, url }];
  });
}

export async function listNotifications(cardCode: string): Promise<OuraNotification[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('oura_notifications_list', {
    p_code: normalizeCardCode(cardCode),
    p_limit: 10,
  });
  if (error || !Array.isArray(data)) return [];
  return (data as Array<Record<string, any>>).map(row => ({
    id: String(row.id),
    title: String(row.title),
    body: row.body || undefined,
    kind: row.kind || 'message',
    createdAt: String(row.created_at),
    links: parseNotificationLinks(row.links),
  }));
}

async function announceWalletAdd(cardCode: string): Promise<void> {
  if (!supabase) return;
  await supabase.rpc('oura_wallet_announce', { p_code: cardCode });
}

export async function deleteOuraCard(cardCode: string): Promise<boolean> {
  const code = normalizeCardCode(cardCode);
  forgetLocalCode(code);
  if (!supabase) return true;
  await supabase.rpc('oura_card_unlink', { p_device: getDeviceId(), p_code: code });
  return true;
}

export { isSupabaseConfigured };
