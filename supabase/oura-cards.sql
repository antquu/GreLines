-- GreLines — cartes OURA.
--
-- Idempotent : peut être ré-exécuté tel quel dans l'éditeur SQL Supabase.
-- À appliquer sur le même projet que le schéma partagé du panneau
-- d'administration (grelines-management/supabase/schema.sql).
--
-- Deux tables, parce qu'il y a deux choses distinctes :
--
--   * `oura_holders` — ce qu'on sait du porteur d'un numéro. Cela appartient à
--     la carte, pas au téléphone : le nom et le visage ne changent pas parce
--     qu'on change d'appareil, et retirer une carte de son téléphone ne doit
--     pas effacer son porteur.
--   * `oura_cards` — quel appareil détient quelle carte. Retirer une carte, ce
--     n'est que défaire ce lien.
--
-- Il n'y a pas de compte utilisateur dans GreLines : un appareil est désigné
-- par un identifiant tiré au sort et gardé dans son stockage local. Le jour où
-- le réseau nous ouvre ses comptes, ce lien accueillera l'identité réelle sans
-- rien casser.

-- ---------------------------------------------------------------------------
-- oura_holders : le porteur d'un numéro de carte.
-- ---------------------------------------------------------------------------
create table if not exists public.oura_holders (
  -- Numéro tel que l'API le connaît (dix chiffres, zéros de tête compris).
  card_code text primary key,
  first_name text,
  last_name text,
  -- Date de naissance du porteur, telle que l'API la donne. Elle sert le profil
  -- voyageur — c'est elle qui décide d'un tarif jeune ou senior.
  birth_date date,
  -- Fin de validité du support, distincte de la fin du contrat en cours.
  expires_at timestamptz,
  -- Dernier contrat connu, recopié pour l'afficher hors ligne.
  contract_label text,
  contract_starting_at timestamptz,
  contract_ending_at timestamptz,
  network_label text,
  -- Chemin de la photo dans le bucket `oura-photos`, jamais l'image elle-même.
  photo_path text,
  is_expired boolean not null default false,
  is_blacklisted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.oura_holders enable row level security;

drop policy if exists "oura_holders_anon_all" on public.oura_holders;
create policy "oura_holders_anon_all"
  on public.oura_holders for all
  to anon, authenticated
  using (true)
  with check (true);

drop trigger if exists oura_holders_updated_at on public.oura_holders;
create trigger oura_holders_updated_at
  before update on public.oura_holders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- oura_cards : le lien entre un appareil et une carte.
-- ---------------------------------------------------------------------------
create table if not exists public.oura_cards (
  id uuid primary key default gen_random_uuid(),
  -- Appareil détenteur. Non unique : une famille partage souvent un téléphone.
  device_id text not null,
  card_code text not null references public.oura_holders (card_code) on delete cascade,
  created_at timestamptz not null default now(),
  -- Un même appareil ne déclare pas deux fois la même carte.
  unique (device_id, card_code)
);

alter table public.oura_cards enable row level security;

drop policy if exists "oura_cards_anon_all" on public.oura_cards;
create policy "oura_cards_anon_all"
  on public.oura_cards for all
  to anon, authenticated
  using (true)
  with check (true);

create index if not exists oura_cards_device_idx on public.oura_cards (device_id, created_at);

-- ---------------------------------------------------------------------------
-- Vue de commodité pour le panneau d'administration : une ligne par
-- détention, porteur compris.
-- ---------------------------------------------------------------------------
-- Les colonnes sont nommées une à une : `holder.*` portait déjà un
-- `created_at`, et deux colonnes de même nom font échouer la création.
-- La vue est supprimée avant d'être recréée : « create or replace » exige des
-- colonnes identiques, dans le même ordre, et refuse donc toute évolution.
drop view if exists public.oura_riders;
create view public.oura_riders as
select
  card.id,
  card.device_id,
  card.created_at as linked_at,
  holder.card_code,
  holder.first_name,
  holder.last_name,
  holder.birth_date,
  holder.expires_at,
  holder.contract_label,
  holder.contract_starting_at,
  holder.contract_ending_at,
  holder.network_label,
  holder.photo_path,
  holder.is_expired,
  holder.is_blacklisted,
  holder.created_at,
  holder.updated_at
from public.oura_cards card
join public.oura_holders holder on holder.card_code = card.card_code;

grant select on public.oura_riders to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Photos des porteurs : un bucket public, des fichiers aux noms imprévisibles.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('oura-photos', 'oura-photos', true)
on conflict (id) do nothing;

drop policy if exists "oura_photos_anon_read" on storage.objects;
create policy "oura_photos_anon_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'oura-photos');

drop policy if exists "oura_photos_anon_write" on storage.objects;
create policy "oura_photos_anon_write"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'oura-photos');

drop policy if exists "oura_photos_anon_delete" on storage.objects;
create policy "oura_photos_anon_delete"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'oura-photos');

-- ---------------------------------------------------------------------------
-- Cartes jetables.
--
-- Une carte d'essai, créée à la main depuis le panneau d'administration, pour
-- éprouver ce qui demande plusieurs cartes quand on n'en a qu'une en poche.
-- Elle ne correspond à aucun support réel : le réseau ne la connaît pas, et
-- l'application ne doit donc jamais aller lui demander son avis.
-- ---------------------------------------------------------------------------
alter table public.oura_holders add column if not exists is_test boolean not null default false;

-- La vue est supprimée avant d'être recréée : « create or replace » exige des
-- colonnes identiques, dans le même ordre, et refuse donc toute évolution.
drop view if exists public.oura_riders;
create view public.oura_riders as
select
  card.id,
  card.device_id,
  card.created_at as linked_at,
  holder.card_code,
  holder.first_name,
  holder.last_name,
  holder.birth_date,
  holder.expires_at,
  holder.contract_label,
  holder.contract_starting_at,
  holder.contract_ending_at,
  holder.network_label,
  holder.photo_path,
  holder.is_expired,
  holder.is_blacklisted,
  holder.is_test,
  holder.created_at,
  holder.updated_at
from public.oura_cards card
join public.oura_holders holder on holder.card_code = card.card_code;

grant select on public.oura_riders to anon, authenticated;

-- ---------------------------------------------------------------------------
-- oura_notifications : ce qu'on a à dire au porteur d'une carte.
--
-- Deux origines. Le panneau d'administration, qui écrit aux voyageurs — une
-- perturbation, un abonnement qui expire, un mot du réseau. Et l'application
-- elle-même, qui signale qu'un appareil vient d'ajouter la carte à son
-- portefeuille : c'est la seule façon, pour le porteur, de savoir que sa carte
-- circule ailleurs que dans sa poche.
-- ---------------------------------------------------------------------------
create table if not exists public.oura_notifications (
  id uuid primary key default gen_random_uuid(),
  card_code text not null references public.oura_holders (card_code) on delete cascade,
  title text not null,
  body text,
  -- « message » : écrite depuis le panneau. « wallet » : une carte ajoutée.
  kind text not null default 'message',
  created_at timestamptz not null default now()
);

alter table public.oura_notifications enable row level security;

drop policy if exists "oura_notifications_anon_all" on public.oura_notifications;
create policy "oura_notifications_anon_all"
  on public.oura_notifications for all
  to anon, authenticated
  using (true)
  with check (true);

create index if not exists oura_notifications_card_idx
  on public.oura_notifications (card_code, created_at desc);

-- ---------------------------------------------------------------------------
-- Cartes désactivées.
--
-- Une carte peut être coupée depuis le panneau d'administration : perdue,
-- volée, ou simplement retirée du service. Elle reste dans le portefeuille de
-- son porteur — la faire disparaître ne dirait rien à personne — mais s'y
-- montre grisée, et la vue contrôleur l'affiche barrée.
-- ---------------------------------------------------------------------------
alter table public.oura_holders add column if not exists is_disabled boolean not null default false;

drop view if exists public.oura_riders;
create view public.oura_riders as
select
  card.id,
  card.device_id,
  card.created_at as linked_at,
  holder.card_code,
  holder.first_name,
  holder.last_name,
  holder.birth_date,
  holder.expires_at,
  holder.contract_label,
  holder.contract_starting_at,
  holder.contract_ending_at,
  holder.network_label,
  holder.photo_path,
  holder.is_expired,
  holder.is_blacklisted,
  holder.is_test,
  holder.is_disabled,
  holder.created_at,
  holder.updated_at
from public.oura_cards card
join public.oura_holders holder on holder.card_code = card.card_code;

grant select on public.oura_riders to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ce que le réseau dit du support, en propre.
--
-- L'API d'Airweb distingue une carte bloquée, verrouillée ou invalide : ce sont
-- des décisions du réseau, pas les nôtres. On les garde séparées de notre
-- propre `is_disabled` pour pouvoir dire au porteur qui a coupé sa carte.
-- ---------------------------------------------------------------------------
alter table public.oura_holders add column if not exists is_locked boolean not null default false;
alter table public.oura_holders add column if not exists is_invalid boolean not null default false;

-- ---------------------------------------------------------------------------
-- Temps réel : une carte coupée — ou remise en service — depuis le panneau
-- d'administration se voit aussitôt dans le portefeuille de son porteur, sans
-- qu'il ait à recharger quoi que ce soit.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'oura_holders'
  ) then
    alter publication supabase_realtime add table public.oura_holders;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'oura_notifications'
  ) then
    alter publication supabase_realtime add table public.oura_notifications;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Liens attachés à une notification.
--
-- Un message dit souvent « voyez plutôt là » : la page du réseau, un formulaire
-- de réclamation, l'horaire d'une ligne déviée. Coller l'adresse dans le texte
-- oblige le porteur à la recopier depuis un téléphone ; on garde donc les liens
-- à part, chacun avec son intitulé, et l'application les pose en boutons sous
-- le message.
--
-- Un tableau JSON de `{ "label": "...", "url": "https://..." }`. Vide par
-- défaut : la grande majorité des messages n'a rien à montrer ailleurs.
-- ---------------------------------------------------------------------------
alter table public.oura_notifications
  add column if not exists links jsonb not null default '[]'::jsonb;
