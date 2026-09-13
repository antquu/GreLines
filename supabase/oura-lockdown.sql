-- ---------------------------------------------------------------------------
-- Fermeture des tables OùRA : plus rien ne se lit ni ne s'écrit directement.
--
-- Jusqu'ici, les cinq tables `oura_*` acceptaient tout de la clé `anon` :
-- lecture, écriture, effacement, sans condition. Or cette clé est publique,
-- elle est dans le JavaScript du site. N'importe qui pouvait donc demander
-- « toutes les cartes » et obtenir noms, dates de naissance, photos et
-- trajets de tous les porteurs, ou tout effacer d'une seule requête.
--
-- Le principe retenu ne change pas l'expérience : GreLines n'a ni compte ni
-- mot de passe, et la carte reste la clé. Ce qui change, c'est qu'on ne peut
-- plus poser de question sans numéro de carte. Chaque accès passe désormais
-- par une fonction `security definer` qui exige un numéro et ne rend que ce
-- qui s'y rattache. Dix chiffres, c'est dix milliards de possibilités : on ne
-- les devine pas, on les lit sur un carton qu'on tient dans la main.
--
-- Trois familles de fonctions :
--   * `oura_*`      : l'application, clé = numéro de carte (ou identifiant
--                     d'appareil pour retrouver son portefeuille) ;
--   * `oura_data_*` : le portail data.grelines.fr, clé = numéro + nom +
--                     date de naissance, vérifiés ici et non plus côté client ;
--   * `crm_oura_*`  : GreLines Management, clé = compte `crm_users`, comme
--                     les fonctions `crm_blog_*`.
--
-- À exécuter APRÈS : oura-cards.sql, accounts.sql, account-trips.sql, blog.sql
-- (pour crm_users) et data-requests.sql du portail data (pour
-- data_deletion_requests).
-- ---------------------------------------------------------------------------

create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. On ferme.
-- ---------------------------------------------------------------------------

drop policy if exists "oura_holders_anon_all" on public.oura_holders;
drop policy if exists "oura_cards_anon_all" on public.oura_cards;
drop policy if exists "oura_notifications_anon_all" on public.oura_notifications;
drop policy if exists "oura_accounts_anon_all" on public.oura_accounts;
drop policy if exists "oura_account_trips_anon_all" on public.oura_account_trips;

-- Les droits de table eux-mêmes, pas seulement les politiques : une politique
-- ajoutée par mégarde plus tard ne rouvrirait rien.
revoke all on public.oura_holders from anon, authenticated;
revoke all on public.oura_cards from anon, authenticated;
revoke all on public.oura_notifications from anon, authenticated;
revoke all on public.oura_accounts from anon, authenticated;
revoke all on public.oura_account_trips from anon, authenticated;

-- La vue « commodité » listait tout le monde, visage compris, et personne ne
-- l'appelait plus.
revoke all on public.oura_riders from anon, authenticated;

-- Le seau reste public : les fichiers ont des noms imprévisibles (identifiant
-- d'appareil ou d'admin, numéro, horodatage) et ne se trouvent que par la fiche
-- du porteur, qui ne se lit plus. Ce qui doit disparaître, c'est le droit d'en
-- lister le contenu et celui d'y effacer. On garde le dépôt.
drop policy if exists "oura_photos_anon_read" on storage.objects;
drop policy if exists "oura_photos_anon_delete" on storage.objects;

-- ---------------------------------------------------------------------------
-- 2. Les autres tables : on écrit, on lit, mais on ne modifie ni n'efface.
--
-- Signalements, retards observés, sondages : des données anonymes, agrégées.
-- Il n'y a aucune raison qu'un navigateur puisse en réécrire ou en supprimer.
-- ---------------------------------------------------------------------------

-- Chaque table n'est resserrée que si elle existe : leurs fichiers de
-- création n'ont pas tous été passés sur chaque base.
do $$
declare
  t text;
begin
  foreach t in array array['crowd_signals', 'line_observations', 'stop_surveys'] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('drop policy if exists %I on public.%I', t || '_anon_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_anon_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_anon_insert', t);
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (true)',
      t || '_anon_read', t);
    execute format(
      'create policy %I on public.%I for insert to anon, authenticated with check (true)',
      t || '_anon_insert', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Outils communs.
-- ---------------------------------------------------------------------------

-- Dix chiffres, zéros de tête compris : le même numéro quelle que soit la façon
-- dont il a été saisi.
create or replace function public.oura_code(p_raw text)
returns text
language sql
immutable
as $$
  select case
    when length(regexp_replace(coalesce(p_raw, ''), '\D', '', 'g')) <= 10
      then lpad(regexp_replace(coalesce(p_raw, ''), '\D', '', 'g'), 10, '0')
    else right(regexp_replace(coalesce(p_raw, ''), '\D', '', 'g'), 10)
  end;
$$;

-- Un nom réduit à ses lettres : accents, tirets, espaces et casse mis à part.
create or replace function public.oura_name_key(p_name text)
returns text
language sql
stable
set search_path = public, extensions
as $$
  select lower(regexp_replace(unaccent(coalesce(p_name, '')), '[^a-zA-Z]', '', 'g'));
$$;

-- Le compte demandeur du panneau doit exister. Le rôle importe peu : tous
-- voient les usagers, comme aujourd'hui.
create or replace function public.crm_assert_staff(p_actor_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if p_actor_id is null or public.crm_role_of(p_actor_id) is null then
    raise exception 'Compte demandeur inconnu.' using errcode = '42501';
  end if;
end;
$$;

-- Supabase accorde d'office l'exécution des nouvelles fonctions à `anon` et
-- `authenticated` : les outils internes leur sont retirés nommément.
revoke all on function public.oura_code(text) from public, anon, authenticated;
revoke all on function public.oura_name_key(text) from public, anon, authenticated;
revoke all on function public.crm_assert_staff(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. L'application : les cartes.
-- ---------------------------------------------------------------------------

-- Une fiche par numéro. Une liste vide n'est pas une erreur : la carte est
-- simplement inconnue.
create or replace function public.oura_holder_get(p_code text)
returns setof public.oura_holders
language sql
stable
security definer set search_path = public
as $$
  select * from public.oura_holders where card_code = public.oura_code(p_code);
$$;

-- Plusieurs fiches d'un coup, pour le portefeuille. Cinquante au plus : un
-- portefeuille n'en compte pas tant, et on ne sert pas de sonde à balayage.
create or replace function public.oura_holders_get(p_codes text[])
returns setof public.oura_holders
language sql
stable
security definer set search_path = public
as $$
  select h.*
    from public.oura_holders h
   where h.card_code in (
     select public.oura_code(c) from unnest(p_codes[1:50]) as c
   );
$$;

-- Les numéros que cet appareil a déclarés, du plus ancien au plus récent.
create or replace function public.oura_device_cards(p_device text)
returns setof text
language sql
stable
security definer set search_path = public
as $$
  select card_code
    from public.oura_cards
   where device_id = p_device
   order by created_at;
$$;

-- Rattache une carte à un appareil. Sans effet si le lien existe déjà, et sans
-- effet non plus si la fiche n'existe pas : on ne crée pas de porteur ici.
create or replace function public.oura_card_link(p_device text, p_code text)
returns void
language sql
security definer set search_path = public
as $$
  insert into public.oura_cards (device_id, card_code)
  select p_device, public.oura_code(p_code)
   where exists (select 1 from public.oura_holders where card_code = public.oura_code(p_code))
  on conflict (device_id, card_code) do nothing;
$$;

-- Retire une carte de cet appareil, et de lui seul.
create or replace function public.oura_card_unlink(p_device text, p_code text)
returns void
language sql
security definer set search_path = public
as $$
  delete from public.oura_cards
   where device_id = p_device and card_code = public.oura_code(p_code);
$$;

-- Enregistre ou met à jour une fiche vérifiée auprès du réseau.
--
-- La photo n'est remplacée que si l'on en fournit une : reprendre sa carte sur
-- un second téléphone ne doit pas effacer le visage déposé depuis le premier.
create or replace function public.oura_holder_save(
  p_code text,
  p_first_name text,
  p_last_name text,
  p_birth_date date,
  p_expires_at timestamptz,
  p_contract_label text,
  p_contract_starting_at timestamptz,
  p_contract_ending_at timestamptz,
  p_network_label text,
  p_photo_path text,
  p_is_expired boolean,
  p_is_blacklisted boolean,
  p_is_locked boolean,
  p_is_invalid boolean
)
returns setof public.oura_holders
language sql
security definer set search_path = public
as $$
  insert into public.oura_holders as h (
    card_code, first_name, last_name, birth_date, expires_at,
    contract_label, contract_starting_at, contract_ending_at, network_label,
    photo_path, is_expired, is_blacklisted, is_locked, is_invalid
  ) values (
    public.oura_code(p_code), nullif(trim(p_first_name), ''), nullif(trim(p_last_name), ''),
    p_birth_date, p_expires_at,
    p_contract_label, p_contract_starting_at, p_contract_ending_at, p_network_label,
    p_photo_path, coalesce(p_is_expired, false), coalesce(p_is_blacklisted, false),
    coalesce(p_is_locked, false), coalesce(p_is_invalid, false)
  )
  on conflict (card_code) do update set
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    birth_date = excluded.birth_date,
    expires_at = excluded.expires_at,
    contract_label = excluded.contract_label,
    contract_starting_at = excluded.contract_starting_at,
    contract_ending_at = excluded.contract_ending_at,
    network_label = excluded.network_label,
    photo_path = coalesce(excluded.photo_path, h.photo_path),
    is_expired = excluded.is_expired,
    is_blacklisted = excluded.is_blacklisted,
    is_locked = excluded.is_locked,
    is_invalid = excluded.is_invalid
  returning h.*;
$$;

-- Une carte jetable se remplit par son porteur : nom, prénom, visage. Rien
-- d'autre, et seulement sur une carte jetable — une vraie carte tient son
-- identité du réseau.
create or replace function public.oura_test_card_save(
  p_code text,
  p_first_name text,
  p_last_name text,
  p_photo_path text
)
returns setof public.oura_holders
language sql
security definer set search_path = public
as $$
  update public.oura_holders
     set first_name = nullif(trim(p_first_name), ''),
         last_name = nullif(trim(p_last_name), ''),
         photo_path = coalesce(p_photo_path, photo_path)
   where card_code = public.oura_code(p_code)
     and is_test
  returning *;
$$;

-- Après un transfert, l'ancien support est coupé : il reste dans le
-- portefeuille, gris, et dit ce qui lui est arrivé.
create or replace function public.oura_holder_disable(p_code text)
returns void
language sql
security definer set search_path = public
as $$
  update public.oura_holders
     set is_disabled = true
   where card_code = public.oura_code(p_code);
$$;

-- Les derniers messages reçus par une carte, du plus récent au plus ancien.
create or replace function public.oura_notifications_list(p_code text, p_limit integer default 10)
returns setof public.oura_notifications
language sql
stable
security definer set search_path = public
as $$
  select *
    from public.oura_notifications
   where card_code = public.oura_code(p_code)
   order by created_at desc
   limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

-- Prévient le porteur qu'un appareil vient d'ajouter sa carte. Le texte est
-- fixé ici : un navigateur ne compose pas de message à la place du panneau.
create or replace function public.oura_wallet_announce(p_code text)
returns void
language sql
security definer set search_path = public
as $$
  insert into public.oura_notifications (card_code, title, body, kind)
  select public.oura_code(p_code),
         'Carte ajoutée à un GreLines Wallet',
         'Quelqu''un vient d''ajouter cette carte à son portefeuille GreLines. Si ce n''est pas vous, retirez-la de cet appareil et prévenez le réseau.',
         'wallet'
   where exists (select 1 from public.oura_holders where card_code = public.oura_code(p_code));
$$;

-- L'instant du dernier changement sur ces cartes : la fiche ou un message.
-- L'application ne peut plus écouter les tables en temps réel, elle ne les
-- voit plus. Elle demande donc, de temps en temps, la date du dernier
-- mouvement, et compare avec celle qu'elle avait. Une date plutôt qu'un
-- « oui / non depuis telle heure » : l'horloge du téléphone n'a pas à être
-- d'accord avec celle de la base.
create or replace function public.oura_last_change(p_codes text[])
returns timestamptz
language sql
stable
security definer set search_path = public
as $$
  with codes as (select public.oura_code(c) as code from unnest(p_codes[1:50]) as c)
  select greatest(
    (select max(h.updated_at) from public.oura_holders h join codes on codes.code = h.card_code),
    (select max(n.created_at) from public.oura_notifications n join codes on codes.code = n.card_code)
  );
$$;

grant execute on function public.oura_holder_get(text) to anon, authenticated;
grant execute on function public.oura_holders_get(text[]) to anon, authenticated;
grant execute on function public.oura_device_cards(text) to anon, authenticated;
grant execute on function public.oura_card_link(text, text) to anon, authenticated;
grant execute on function public.oura_card_unlink(text, text) to anon, authenticated;
grant execute on function public.oura_holder_save(text, text, text, date, timestamptz, text, timestamptz, timestamptz, text, text, boolean, boolean, boolean, boolean) to anon, authenticated;
grant execute on function public.oura_test_card_save(text, text, text, text) to anon, authenticated;
grant execute on function public.oura_holder_disable(text) to anon, authenticated;
grant execute on function public.oura_notifications_list(text, integer) to anon, authenticated;
grant execute on function public.oura_wallet_announce(text) to anon, authenticated;
grant execute on function public.oura_last_change(text[]) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. L'application : le compte et ses trajets.
-- ---------------------------------------------------------------------------

create or replace function public.oura_account_get(p_code text)
returns setof public.oura_accounts
language sql
stable
security definer set search_path = public
as $$
  select * from public.oura_accounts where card_code = public.oura_code(p_code);
$$;

-- Crée le compte, ou le retrouve : reprendre une carte déjà enregistrée après
-- une réinstallation doit rendre le compte et ses points, pas échouer.
create or replace function public.oura_account_create(
  p_code text,
  p_first_name text,
  p_last_name text,
  p_pseudo text,
  p_avatar_emoji text,
  p_avatar_path text
)
returns setof public.oura_accounts
language sql
security definer set search_path = public
as $$
  insert into public.oura_accounts as a (card_code, first_name, last_name, pseudo, avatar_emoji, avatar_path, updated_at)
  values (public.oura_code(p_code), p_first_name, p_last_name, p_pseudo, p_avatar_emoji, p_avatar_path, now())
  on conflict (card_code) do update set
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    pseudo = excluded.pseudo,
    avatar_emoji = excluded.avatar_emoji,
    avatar_path = excluded.avatar_path,
    updated_at = now()
  returning a.*;
$$;

-- Modifie ce qui est fourni, et seulement cela. Une clé présente avec `null`
-- vaut « effacer » (revenir à la photo de la carte) ; une clé absente vaut
-- « ne pas toucher ». C'est pour cette nuance qu'on passe un objet.
create or replace function public.oura_account_update(p_code text, p_changes jsonb)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  changed integer;
begin
  update public.oura_accounts
     set pseudo = coalesce(p_changes->>'pseudo', pseudo),
         avatar_emoji = case when p_changes ? 'avatar_emoji' then p_changes->>'avatar_emoji' else avatar_emoji end,
         avatar_path = case when p_changes ? 'avatar_path' then p_changes->>'avatar_path' else avatar_path end,
         updated_at = now()
   where card_code = public.oura_code(p_code);
  get diagnostics changed = row_count;
  return changed > 0;
end;
$$;

-- Vrai si personne d'autre ne porte ce pseudonyme. On ne dit pas qui : un
-- numéro de carte ne sort jamais en réponse à un nom.
create or replace function public.oura_pseudo_free(p_pseudo text, p_except_code text default null)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select not exists (
    select 1 from public.oura_accounts
     where pseudo ilike p_pseudo
       and (p_except_code is null or card_code <> public.oura_code(p_except_code))
  );
$$;

-- Déjà là avant la fermeture ; on la redéfinit pour qu'elle passe la porte.
create or replace function public.credit_oura_account(
  p_card_code text,
  p_points integer,
  p_trips integer,
  p_helped integer
)
returns void
language sql
security definer set search_path = public
as $$
  update public.oura_accounts
     set points = points + coalesce(p_points, 0),
         trips = trips + coalesce(p_trips, 0),
         travellers_helped = travellers_helped + coalesce(p_helped, 0),
         updated_at = now()
   where card_code = public.oura_code(p_card_code);
$$;

create or replace function public.oura_trip_record(
  p_code text,
  p_origin text,
  p_destination text,
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_legs jsonb,
  p_path jsonb,
  p_points integer,
  p_helped integer
)
returns void
language sql
security definer set search_path = public
as $$
  insert into public.oura_account_trips
    (card_code, origin, destination, started_at, ended_at, legs, path, points, travellers_helped)
  select public.oura_code(p_code), p_origin, p_destination, p_started_at, p_ended_at,
         coalesce(p_legs, '[]'::jsonb), coalesce(p_path, '[]'::jsonb),
         coalesce(p_points, 0), coalesce(p_helped, 0)
   where exists (select 1 from public.oura_accounts where card_code = public.oura_code(p_code));
$$;

create or replace function public.oura_trips_list(p_code text, p_limit integer default 60)
returns setof public.oura_account_trips
language sql
stable
security definer set search_path = public
as $$
  select *
    from public.oura_account_trips
   where card_code = public.oura_code(p_code)
   order by created_at desc
   limit least(greatest(coalesce(p_limit, 60), 1), 500);
$$;

grant execute on function public.oura_account_get(text) to anon, authenticated;
grant execute on function public.oura_account_create(text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.oura_account_update(text, jsonb) to anon, authenticated;
grant execute on function public.oura_pseudo_free(text, text) to anon, authenticated;
grant execute on function public.credit_oura_account(text, integer, integer, integer) to anon, authenticated;
grant execute on function public.oura_trip_record(text, text, text, timestamptz, timestamptz, jsonb, jsonb, integer, integer) to anon, authenticated;
grant execute on function public.oura_trips_list(text, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Le portail data.grelines.fr : voir, puis effacer.
--
-- Trois éléments concordants ouvrent la porte : numéro, nom de famille, date
-- de naissance. La vérification se faisait dans le navigateur, une fois la
-- fiche entière reçue ; elle se fait maintenant ici, avant de rendre quoi que
-- ce soit.
-- ---------------------------------------------------------------------------

-- La fiche si les trois éléments concordent, sinon la raison du refus. Elle
-- est renvoyée telle quelle à l'écran : dire « numéro inconnu » quand c'est le
-- nom qui cloche envoie les gens chercher au mauvais endroit.
create or replace function public.oura_data_verify(p_code text, p_last_name text, p_birth_date date)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  holder public.oura_holders;
begin
  select * into holder from public.oura_holders where card_code = public.oura_code(p_code);
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown-card');
  end if;
  if holder.last_name is null and holder.birth_date is null then
    return jsonb_build_object('ok', false, 'reason', 'no-reference');
  end if;
  if holder.last_name is not null
     and (public.oura_name_key(holder.last_name) = '' or public.oura_name_key(holder.last_name) <> public.oura_name_key(p_last_name)) then
    return jsonb_build_object('ok', false, 'reason', 'name-mismatch');
  end if;
  if holder.birth_date is not null and (p_birth_date is null or holder.birth_date <> p_birth_date) then
    return jsonb_build_object('ok', false, 'reason', 'birth-date-mismatch');
  end if;
  return jsonb_build_object('ok', true, 'holder', to_jsonb(holder));
end;
$$;

-- Tout ce que la base tient sur cette carte. Les tracés GPS ne sortent pas :
-- le portail n'en montre que le nombre de points.
create or replace function public.oura_data_inventory(p_code text, p_last_name text, p_birth_date date)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  gate jsonb;
  code text := public.oura_code(p_code);
begin
  gate := public.oura_data_verify(p_code, p_last_name, p_birth_date);
  if not (gate->>'ok')::boolean then
    return gate;
  end if;
  return jsonb_build_object(
    'ok', true,
    'holder', gate->'holder',
    'devices', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'device_id', device_id, 'created_at', created_at) order by created_at)
        from public.oura_cards where card_code = code), '[]'::jsonb),
    'account', (
      select jsonb_build_object(
        'pseudo', pseudo, 'avatar_emoji', avatar_emoji, 'points', points, 'trips', trips,
        'travellers_helped', travellers_helped, 'created_at', created_at)
        from public.oura_accounts where card_code = code),
    'trips', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'origin', origin, 'destination', destination,
        'started_at', started_at, 'ended_at', ended_at,
        'points', points, 'travellers_helped', travellers_helped,
        'leg_count', jsonb_array_length(legs), 'path_points', jsonb_array_length(path),
        'created_at', created_at) order by created_at desc)
        from public.oura_account_trips where card_code = code), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'title', title, 'body', body, 'kind', kind, 'created_at', created_at)
        order by created_at desc)
        from public.oura_notifications where card_code = code), '[]'::jsonb)
  );
end;
$$;

-- Efface, pour de bon, famille par famille.
--
-- La trace de la demande est écrite d'abord. Chaque famille est effacée dans
-- son propre bloc : si l'une résiste, les autres passent quand même, et le
-- résultat dit lesquelles ont tenu. L'ordre part des feuilles vers la racine,
-- la fiche du porteur étant la clé étrangère des appareils et des messages.
create or replace function public.oura_data_erase(
  p_code text,
  p_last_name text,
  p_birth_date date,
  p_categories text[],
  p_reference text,
  p_reason text,
  p_comment text
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  gate jsonb;
  code text := public.oura_code(p_code);
  removed jsonb := '{}'::jsonb;
  failed text[] := '{}';
  n integer;
  photo text;
begin
  gate := public.oura_data_verify(p_code, p_last_name, p_birth_date);
  if not (gate->>'ok')::boolean then
    return gate;
  end if;

  insert into public.data_deletion_requests (reference, card_code, categories, reason, comment)
  values (p_reference, code, to_jsonb(p_categories), p_reason, nullif(trim(coalesce(p_comment, '')), ''));

  if 'trips' = any (p_categories) then
    begin
      delete from public.oura_account_trips where card_code = code;
      get diagnostics n = row_count;
      removed := removed || jsonb_build_object('trips', n);
    exception when others then
      failed := failed || 'trips';
    end;
  end if;

  if 'account' = any (p_categories) then
    begin
      delete from public.oura_accounts where card_code = code;
      get diagnostics n = row_count;
      removed := removed || jsonb_build_object('account', n);
    exception when others then
      failed := failed || 'account';
    end;
  end if;

  if 'notifications' = any (p_categories) then
    begin
      delete from public.oura_notifications where card_code = code;
      get diagnostics n = row_count;
      removed := removed || jsonb_build_object('notifications', n);
    exception when others then
      failed := failed || 'notifications';
    end;
  end if;

  if 'devices' = any (p_categories) then
    begin
      delete from public.oura_cards where card_code = code;
      get diagnostics n = row_count;
      removed := removed || jsonb_build_object('devices', n);
    exception when others then
      failed := failed || 'devices';
    end;
  end if;

  if 'identity' = any (p_categories) then
    begin
      -- Le portrait d'abord : une fiche effacée laisserait un fichier sans plus
      -- rien pour dire à qui il appartient. Le fichier ne se sert plus dès que
      -- sa ligne disparaît.
      select photo_path into photo from public.oura_holders where card_code = code;
      if photo is not null then
        delete from storage.objects where bucket_id = 'oura-photos' and name = photo;
      end if;
      delete from public.oura_holders where card_code = code;
      get diagnostics n = row_count;
      removed := removed || jsonb_build_object('identity', n);
    exception when others then
      failed := failed || 'identity';
    end;
  end if;

  return jsonb_build_object('ok', true, 'removed', removed, 'failed', to_jsonb(failed));
end;
$$;

grant execute on function public.oura_data_verify(text, text, date) to anon, authenticated;
grant execute on function public.oura_data_inventory(text, text, date) to anon, authenticated;
grant execute on function public.oura_data_erase(text, text, date, text[], text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. GreLines Management : la page Usagers.
--
-- Même clé que les articles : l'identifiant du compte `crm_users` qui agit.
-- ---------------------------------------------------------------------------

create or replace function public.crm_oura_holders_list(p_actor_id uuid)
returns setof public.oura_holders
language plpgsql
stable
security definer set search_path = public
as $$
begin
  perform public.crm_assert_staff(p_actor_id);
  return query
    select * from public.oura_holders order by created_at desc limit 2000;
end;
$$;

create or replace function public.crm_oura_links_list(p_actor_id uuid)
returns table (card_code text, device_id text, created_at timestamptz)
language plpgsql
stable
security definer set search_path = public
as $$
begin
  perform public.crm_assert_staff(p_actor_id);
  return query
    select c.card_code, c.device_id, c.created_at from public.oura_cards c;
end;
$$;

-- Crée la fiche si elle n'existe pas, puis applique les champs fournis. Une clé
-- absente ne touche à rien ; c'est ce qui permet de s'en servir aussi bien
-- pour créer que pour couper une carte ou corriger un nom.
create or replace function public.crm_oura_holder_save(p_actor_id uuid, p_code text, p_patch jsonb)
returns setof public.oura_holders
language plpgsql
security definer set search_path = public
as $$
declare
  code text := public.oura_code(p_code);
begin
  perform public.crm_assert_staff(p_actor_id);

  insert into public.oura_holders (card_code) values (code)
  on conflict (card_code) do nothing;

  return query
    update public.oura_holders h set
      first_name = case when p_patch ? 'first_name' then p_patch->>'first_name' else h.first_name end,
      last_name = case when p_patch ? 'last_name' then p_patch->>'last_name' else h.last_name end,
      birth_date = case when p_patch ? 'birth_date' then (p_patch->>'birth_date')::date else h.birth_date end,
      expires_at = case when p_patch ? 'expires_at' then (p_patch->>'expires_at')::timestamptz else h.expires_at end,
      contract_label = case when p_patch ? 'contract_label' then p_patch->>'contract_label' else h.contract_label end,
      contract_starting_at = case when p_patch ? 'contract_starting_at' then (p_patch->>'contract_starting_at')::timestamptz else h.contract_starting_at end,
      contract_ending_at = case when p_patch ? 'contract_ending_at' then (p_patch->>'contract_ending_at')::timestamptz else h.contract_ending_at end,
      network_label = case when p_patch ? 'network_label' then p_patch->>'network_label' else h.network_label end,
      photo_path = case when p_patch ? 'photo_path' then p_patch->>'photo_path' else h.photo_path end,
      is_expired = case when p_patch ? 'is_expired' then coalesce((p_patch->>'is_expired')::boolean, false) else h.is_expired end,
      is_blacklisted = case when p_patch ? 'is_blacklisted' then coalesce((p_patch->>'is_blacklisted')::boolean, false) else h.is_blacklisted end,
      is_locked = case when p_patch ? 'is_locked' then coalesce((p_patch->>'is_locked')::boolean, false) else h.is_locked end,
      is_invalid = case when p_patch ? 'is_invalid' then coalesce((p_patch->>'is_invalid')::boolean, false) else h.is_invalid end,
      is_test = case when p_patch ? 'is_test' then coalesce((p_patch->>'is_test')::boolean, false) else h.is_test end,
      is_disabled = case when p_patch ? 'is_disabled' then coalesce((p_patch->>'is_disabled')::boolean, false) else h.is_disabled end
    where h.card_code = code
    returning h.*;
end;
$$;

-- Supprime le porteur et, en cascade, ses détentions et ses messages.
create or replace function public.crm_oura_holder_delete(p_actor_id uuid, p_code text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.crm_assert_staff(p_actor_id);
  delete from public.oura_holders where card_code = public.oura_code(p_code);
end;
$$;

create or replace function public.crm_oura_notifications_list(p_actor_id uuid, p_code text, p_limit integer default 50)
returns setof public.oura_notifications
language plpgsql
stable
security definer set search_path = public
as $$
begin
  perform public.crm_assert_staff(p_actor_id);
  return query
    select * from public.oura_notifications
     where card_code = public.oura_code(p_code)
     order by created_at desc
     limit least(greatest(coalesce(p_limit, 50), 1), 500);
end;
$$;

-- Écrit à un ou plusieurs porteurs d'un coup.
create or replace function public.crm_oura_notify(
  p_actor_id uuid,
  p_codes text[],
  p_title text,
  p_body text,
  p_links jsonb default '[]'::jsonb
)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  n integer;
begin
  perform public.crm_assert_staff(p_actor_id);
  insert into public.oura_notifications (card_code, title, body, links, kind)
  select distinct public.oura_code(c), trim(p_title), nullif(trim(coalesce(p_body, '')), ''),
         coalesce(p_links, '[]'::jsonb), 'message'
    from unnest(p_codes) as c
   where exists (select 1 from public.oura_holders where card_code = public.oura_code(c));
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.crm_oura_notification_delete(p_actor_id uuid, p_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.crm_assert_staff(p_actor_id);
  delete from public.oura_notifications where id = p_id;
end;
$$;

-- Efface une image du seau, mais seulement si plus aucune fiche ne s'en sert
-- en dehors de celle qu'on est en train de toucher. Un transfert de carte
-- recopie le chemin d'un support sur l'autre : deux fiches, un seul fichier.
create or replace function public.crm_oura_photo_remove_if_orphan(p_actor_id uuid, p_path text, p_except_code text)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.crm_assert_staff(p_actor_id);
  if p_path is null or exists (
    select 1 from public.oura_holders
     where photo_path = p_path and card_code <> public.oura_code(p_except_code)
  ) then
    return false;
  end if;
  delete from storage.objects where bucket_id = 'oura-photos' and name = p_path;
  return true;
end;
$$;

grant execute on function public.crm_oura_holders_list(uuid) to anon, authenticated;
grant execute on function public.crm_oura_links_list(uuid) to anon, authenticated;
grant execute on function public.crm_oura_holder_save(uuid, text, jsonb) to anon, authenticated;
grant execute on function public.crm_oura_holder_delete(uuid, text) to anon, authenticated;
grant execute on function public.crm_oura_notifications_list(uuid, text, integer) to anon, authenticated;
grant execute on function public.crm_oura_notify(uuid, text[], text, text, jsonb) to anon, authenticated;
grant execute on function public.crm_oura_notification_delete(uuid, uuid) to anon, authenticated;
grant execute on function public.crm_oura_photo_remove_if_orphan(uuid, text, text) to anon, authenticated;
