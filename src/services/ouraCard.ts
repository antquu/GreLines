/**
 * Les cartes OURA du voyageur.
 *
 * Une carte se vérifie auprès du réseau — l'API d'Airweb sait dire si un
 * numéro existe, à qui il appartient par sa date de naissance, jusqu'à quand
 * il vaut et quel abonnement y est chargé. Le reste, le nom et le visage, ne
 * vit que sur le carton : il faut le lire ou le saisir, et c'est le voyageur
 * qui en répond.
 *
 * Ce qui est retenu est ensuite gardé dans Supabase, rattaché non pas à un
 * compte — GreLines n'en a pas — mais à un identifiant d'appareil tiré au sort
 * une fois pour toutes. L'appareil retrouve ainsi ses cartes, sans que
 * personne ait eu à s'inscrire.
 *
 * Rien ici ne lit une table directement : les tables `oura_*` sont fermées à
 * la clé publique, et chaque accès passe par une fonction de la base qui
 * exige un numéro de carte, ou l'identifiant de l'appareil, et ne rend que ce
 * qui s'y rattache (`supabase/oura-lockdown.sql`).
 */

import { supabase, isSupabaseConfigured } from './supabase';
import { linkedCardCode } from './account';

const AIRWEB_ENDPOINT = 'https://api.grenoble.run.airweb.fr/shop/medias';
/** Préfixe du réseau grenoblois dans les identifiants Airweb. */
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

/** Ce que le réseau sait d'un numéro de carte. */
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

/** Une carte telle qu'elle est gardée pour ce voyageur. */
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
  /** Carte d'essai créée à la main : le réseau ne la connaît pas. */
  isTest?: boolean;
  /** Carte coupée depuis le panneau d'administration : elle ne vaut plus rien. */
  isDisabled?: boolean;
  /**
   * Carte supprimée du côté du réseau : l'appareil la garde, mais il n'y a plus
   * rien derrière. On ne l'efface pas de son portefeuille sans le prévenir —
   * une carte qui disparaît toute seule laisse croire à une panne.
   */
  isMissing?: boolean;
  /**
   * Le réseau ne connaît plus ce numéro : son API répond 404. La carte existe
   * encore chez nous, mais plus chez lui — c'est lui qui l'a supprimée.
   */
  isNetworkMissing?: boolean;
}

/**
 * Numéro tel que l'API l'attend : dix chiffres.
 *
 * Le numéro gravé sur le carton en compte parfois onze, la première décimale
 * étant une clé qui n'entre pas dans l'identifiant. On garde donc les dix
 * derniers chiffres — et la saisie, elle, accepte ce qu'on lit.
 */
export function normalizeCardCode(raw: string): string {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length <= 10) return digits.padStart(10, '0');
  return digits.slice(-10);
}

/** Identifiant de l'appareil, tiré au sort à la première carte. */
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

/**
 * Les numéros gardés par cet appareil.
 *
 * La base sait déjà quel appareil détient quelle carte, mais elle peut être
 * lente, absente ou refuser l'écriture : la liste vit donc aussi ici, en clair,
 * pour que le portefeuille se retrouve au rechargement même si le serveur ne
 * répond pas. C'est la mémoire courte de l'application.
 */
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

/**
 * Interroge le réseau. `null` quand le numéro n'existe pas : c'est ainsi qu'on
 * distingue une vraie carte d'un numéro inventé — l'API répond 404.
 */
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

/** Le contrat qui vaut aujourd'hui, ou le plus récent à défaut. */
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

/**
 * Les cartes de cet appareil, de la plus ancienne à la plus récente.
 *
 * On réunit ce que dit la base — les liens de cet appareil — et ce que dit le
 * stockage local. Les deux devraient concorder ; quand ils divergent, c'est le
 * stockage local qui rattrape, et la base qui est remise d'aplomb.
 */
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

/**
 * Une carte déjà déclarée, par cet appareil ou par un autre.
 *
 * Une carte de transport a un porteur, et ce porteur ne change pas parce qu'on
 * change de téléphone : si le numéro est connu, son nom et son visage le sont
 * aussi, et il n'y a aucune raison de les redemander.
 */
export async function findKnownCard(rawCode: string): Promise<OuraCard | null> {
  if (!supabase) return null;
  const code = normalizeCardCode(rawCode);
  const { data, error } = await supabase.rpc('oura_holder_get', { p_code: code }).maybeSingle();
  if (error || !data) return null;
  return toCard(data as CardRow);
}

/**
 * Ajoute une carte jetable à cet appareil.
 *
 * Elle existe déjà en base — le panneau d'administration l'a créée — et n'a
 * aucun équivalent chez le réseau : il n'y a donc rien à vérifier, juste un
 * lien à faire.
 */
export async function attachTestCard(rawCode: string): Promise<OuraCard | null> {
  const known = await findKnownCard(rawCode);
  if (!known || !known.isTest) return null;
  await attachKnownCard(known.cardCode);
  return known;
}

/**
 * Enregistre une carte d'essai renseignée par son porteur.
 *
 * Une carte jetable peut être créée vide, avec son seul numéro : c'est celui
 * qui l'ajoute qui la remplit. Rien n'est demandé au réseau, qui ne la connaît
 * pas — tout ce qu'elle dira vient d'ici.
 */
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
      .upload(path, input.photo, { contentType: input.photo.type || 'image/jpeg', upsert: true });
    if (!error) photoPath = path;
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
  /** Photo du porteur, telle qu'elle a été prise ou choisie. */
  photo?: Blob | null;
  /**
   * Photo déjà hébergée, reprise d'une carte connue : on la réutilise telle
   * quelle plutôt que d'en téléverser une copie.
   */
  photoPath?: string;
}

/**
 * Enregistre — ou met à jour — une carte pour cet appareil.
 *
 * La photo part d'abord vers le bucket : une ligne qui pointerait vers un
 * fichier absent vaudrait moins qu'une ligne sans photo.
 */
export async function saveOuraCard(input: SaveCardInput): Promise<OuraCard | null> {
  if (!supabase) return null;
  const { lookup } = input;
  const deviceId = getDeviceId();

  let photoPath: string | undefined = input.photoPath;
  if (input.photo) {
    const path = `${deviceId}/${lookup.code}-${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, input.photo, { contentType: input.photo.type || 'image/jpeg', upsert: true });
    if (!error) photoPath = path;
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

/**
 * Reprend une carte déjà connue sans repasser par le réseau.
 *
 * C'est ce qui arrive quand on retrouve sa carte sur un nouveau téléphone : le
 * porteur existe déjà, il n'y a qu'un lien à créer.
 */
export async function attachKnownCard(cardCode: string): Promise<boolean> {
  if (!supabase) return false;
  const code = normalizeCardCode(cardCode);
  await supabase.rpc('oura_card_link', { p_device: getDeviceId(), p_code: code });
  rememberLocalCode(code);
  void announceWalletAdd(code);
  return true;
}

/**
 * Reporte un porteur sur un nouveau numéro.
 *
 * Une carte se périme, se perd, se remplace — le voyageur, lui, ne change pas.
 * On recopie donc son nom et son visage sur le nouveau support.
 *
 * L'ancienne carte n'est pas effacée mais désactivée : elle reste dans le
 * portefeuille, grise, et dit ce qui lui est arrivé. Un carton qu'on vient de
 * remplacer traîne encore quelques jours dans une poche — mieux vaut qu'on
 * puisse constater qu'il ne vaut plus, plutôt que de le voir disparaître sans
 * explication.
 */
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

/**
 * Retire la carte de cet appareil — et de cet appareil seulement.
 *
 * Le porteur reste en base : c'est ce qui permet, en saisissant le même numéro
 * sur un autre téléphone, de retrouver son nom et son visage sans tout ressaisir.
 */
/**
 * Qui a coupé cette carte, et pourquoi elle ne vaut plus.
 *
 * Deux autorités peuvent l'invalider, et le porteur a tout intérêt à savoir
 * laquelle : chez nous, on peut la remettre en service d'un clic ; chez le
 * réseau, il faut aller le voir. Une carte simplement périmée n'a été coupée
 * par personne — elle a fait son temps.
 */
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

/**
 * Redemande au réseau ce qu'il pense de chaque carte.
 *
 * Une carte peut être coupée ou supprimée de son côté sans que rien ne nous en
 * avertisse : la seule façon de le savoir est de reposer la question. On le
 * fait en arrière-plan, après avoir affiché ce qu'on avait — mieux vaut une
 * carte affichée tout de suite et corrigée ensuite qu'un écran vide le temps
 * d'un aller-retour.
 */
export async function verifyCards(cards: OuraCard[]): Promise<OuraCard[]> {
  return Promise.all(cards.map(async card => {
    if (card.isTest || card.isMissing) return card;
    const found = await lookupOuraCard(card.cardCode);
    if (!found) return { ...card, isNetworkMissing: true };

    /*
     * L'abonnement aussi, pas seulement les drapeaux.
     *
     * Un titre qui expire en septembre et qu'on renouvelle en octobre reste
     * « expiré » tant qu'on garde la date de fin enregistrée le jour de
     * l'ajout : c'est elle que regarde `cardBlockedBy`. On reprend donc le
     * contrat en cours tel que le réseau le voit, et on le range en base pour
     * que les autres appareils, et le panneau, le voient aussi.
     */
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

    // Les dates se comparent par leur instant : la base et le réseau n'écrivent
    // pas le même fuseau, et une écriture par carte à chaque ouverture ne se
    // justifie que si quelque chose a vraiment bougé.
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

/** Range en base ce que le réseau vient de dire d'une carte. */
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

/**
 * Suit les changements d'état des cartes de cet appareil.
 *
 * Une carte coupée — ou remise en service — depuis le panneau d'administration
 * doit se voir sans recharger la page : le porteur n'a pas à deviner que son
 * titre ne vaut plus, et encore moins qu'on vient de le lui rendre.
 *
 * On ne peut plus écouter les tables en temps réel : elles sont fermées à la
 * clé publique, et Supabase n'envoie que ce que l'abonné a le droit de lire.
 * On demande donc régulièrement la date du dernier mouvement sur nos cartes,
 * et on ne prévient que si elle a bougé. Vingt secondes, onglet visible
 * seulement : assez réactif pour un titre coupé, assez rare pour ne rien
 * coûter à un téléphone posé sur une table.
 */
const CHANGE_POLL_MS = 20_000;

/** Les numéros dont l'appareil se soucie : ses cartes, et celle du compte. */
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

/** Un lien attaché à un message : un intitulé et une adresse. */
export interface OuraNotificationLink {
  label: string;
  url: string;
}

/** Un mot adressé au porteur d'une carte. */
export interface OuraNotification {
  id: string;
  title: string;
  body?: string;
  kind: string;
  createdAt: string;
  /** « Voyez plutôt là » : posés en boutons sous le message. */
  links: OuraNotificationLink[];
}

/**
 * Ne garde que les liens exploitables.
 *
 * La colonne est du JSON libre, écrite depuis le panneau d'administration : on
 * ne fait confiance ni à sa forme, ni à son contenu. Seuls `http` et `https`
 * passent — un `javascript:` collé dans un champ d'admin ne doit pas devenir un
 * bouton dans le portefeuille de quelqu'un.
 */
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

/**
 * Les dix derniers messages reçus par une carte, du plus récent au plus ancien.
 *
 * Dix, parce qu'au-delà on ne lit plus : ce qui compte est ce qui vient
 * d'arriver, et le reste appartient déjà au passé.
 */
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

/**
 * Signale qu'un appareil vient d'ajouter cette carte à son portefeuille.
 *
 * C'est la seule façon, pour le porteur, d'apprendre que sa carte circule
 * ailleurs que dans sa poche — un parent qui la garde, ou quelqu'un qui n'aurait
 * pas dû l'avoir.
 */
async function announceWalletAdd(cardCode: string): Promise<void> {
  if (!supabase) return;
  // Le texte du message vit dans la base : un navigateur ne compose pas de
  // notification à la place du panneau.
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
