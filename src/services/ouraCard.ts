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
 */

import { supabase, isSupabaseConfigured } from './supabase';

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
    // Stockage refusé : l'appareil reste anonyme le temps de la session.
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
    // Stockage refusé : la base reste seule source, et tant pis pour la reprise.
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
    // Une carte inconnue répond parfois 200 avec un corps d'erreur.
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
    // Les contrats sont un supplément : une carte sans eux reste une carte.
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
    // Le numéro identifie la carte : c'est lui, et non la ligne de détention,
    // qui la désigne d'un appareil à l'autre.
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

  const { data } = await supabase
    .from('oura_cards')
    .select('card_code')
    .eq('device_id', getDeviceId())
    .order('created_at', { ascending: true });

  const linked = (data ?? []).map(row => String((row as { card_code: string }).card_code));
  const codes = [...new Set([...linked, ...readLocalCodes()])];
  if (codes.length === 0) return [];
  writeLocalCodes(codes);

  const { data: holders, error } = await supabase
    .from('oura_holders')
    .select('*')
    .in('card_code', codes);
  if (error || !holders) return [];

  // Un lien manquant se recrée en silence : la carte est bien à cet appareil.
  const missing = codes.filter(code => !linked.includes(code));
  if (missing.length > 0) {
    void supabase
      .from('oura_cards')
      .upsert(missing.map(code => ({ device_id: getDeviceId(), card_code: code })), {
        onConflict: 'device_id,card_code',
      });
  }

  const byCode = new Map((holders as CardRow[]).map(row => [row.card_code, row]));
  return codes.map(code => {
    const row = byCode.get(code);
    if (row) return toCard(row);
    // Plus de porteur : la carte a été supprimée ailleurs. On la garde visible,
    // grise et muette, avec de quoi la retirer soi-même.
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
  const { data, error } = await supabase
    .from('oura_holders')
    .select('*')
    .eq('card_code', code)
    .maybeSingle();
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
    .from('oura_holders')
    .update({
      first_name: input.firstName?.trim() || null,
      last_name: input.lastName?.trim() || null,
      ...(photoPath ? { photo_path: photoPath } : {}),
    })
    .eq('card_code', code)
    .select()
    .single();
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
  const holder = {
    card_code: lookup.code,
    first_name: input.firstName?.trim() || null,
    last_name: input.lastName?.trim() || null,
    birth_date: lookup.birthDate || null,
    expires_at: lookup.expiresAt || null,
    contract_label: contract?.label || null,
    contract_starting_at: contract?.startingAt || null,
    contract_ending_at: contract?.endingAt || null,
    network_label: contract?.networkLabel || null,
    ...(photoPath ? { photo_path: photoPath } : {}),
    is_expired: lookup.isExpired,
    is_blacklisted: lookup.isBlackListed,
    is_locked: lookup.isLocked,
    is_invalid: lookup.isInvalid,
  };

  // Le porteur d'abord — il vaut pour tous les appareils —, le lien ensuite.
  const { data, error } = await supabase
    .from('oura_holders')
    .upsert(holder, { onConflict: 'card_code' })
    .select()
    .single();
  if (error || !data) return null;

  await supabase
    .from('oura_cards')
    .upsert({ device_id: deviceId, card_code: lookup.code }, { onConflict: 'device_id,card_code' });
  // Le lien peut échouer sans conséquence : le stockage local fait foi pour
  // cet appareil, et la liste le rétablira au prochain chargement.
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
  await supabase
    .from('oura_cards')
    .upsert({ device_id: getDeviceId(), card_code: code }, { onConflict: 'device_id,card_code' });
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
  // Une carte d'essai n'a pas d'existence chez le réseau : on la remplit
  // directement, sans lui demander son avis.
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
  await supabase
    .from('oura_holders')
    .update({ is_disabled: true })
    .eq('card_code', normalizeCardCode(fromCode));
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
    // Une carte d'essai n'a jamais existé chez le réseau, et une carte déjà
    // supprimée chez nous n'a plus rien à vérifier.
    if (card.isTest || card.isMissing) return card;
    const found = await lookupOuraCard(card.cardCode);
    if (!found) return { ...card, isNetworkMissing: true };
    return {
      ...card,
      isNetworkMissing: false,
      isExpired: found.isExpired,
      isBlacklisted: found.isBlackListed,
      isLocked: found.isLocked,
      isInvalid: found.isInvalid,
    };
  }));
}

/**
 * Suit les changements d'état des cartes de cet appareil.
 *
 * Une carte coupée — ou remise en service — depuis le panneau d'administration
 * doit se voir aussitôt : le porteur n'a pas à recharger la page pour savoir
 * que son titre ne vaut plus, et encore moins pour retrouver un titre qu'on
 * vient de lui rendre.
 */
/**
 * Un canal par abonné, et non un canal partagé.
 *
 * Supabase indexe ses canaux par nom : deux appels avec le même nom retombaient
 * sur le même objet, et le second tentait d'y ajouter ses écouteurs alors qu'il
 * était déjà souscrit — ce que la bibliothèque refuse en levant. Depuis que
 * l'application écoute à deux endroits (l'écran Compte et l'avis de nouvelle
 * notification), il faut un nom distinct par abonnement.
 */
let cardChannelSeq = 0;

export function subscribeToCards(onChange: () => void): () => void {
  const client = supabase;
  if (!client) return () => {};
  const channel = client
    .channel(`oura-holders-${++cardChannelSeq}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'oura_holders' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'oura_notifications' }, onChange)
    .subscribe();
  return () => { void client.removeChannel(channel); };
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
  const { data, error } = await supabase
    .from('oura_notifications')
    .select('*')
    .eq('card_code', normalizeCardCode(cardCode))
    .order('created_at', { ascending: false })
    .limit(10);
  if (error || !data) return [];
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
  await supabase.from('oura_notifications').insert({
    card_code: cardCode,
    title: 'Carte ajoutée à un GreLines Wallet',
    body: "Quelqu'un vient d'ajouter cette carte à son portefeuille GreLines. Si ce n'est pas vous, retirez-la de cet appareil et prévenez le réseau.",
    kind: 'wallet',
  });
}

export async function deleteOuraCard(cardCode: string): Promise<boolean> {
  const code = normalizeCardCode(cardCode);
  forgetLocalCode(code);
  if (!supabase) return true;
  await supabase
    .from('oura_cards')
    .delete()
    .eq('device_id', getDeviceId())
    .eq('card_code', code);
  return true;
}

export { isSupabaseConfigured };
