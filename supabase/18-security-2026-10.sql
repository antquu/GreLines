-- run last, after every other file in this folder

create extension if not exists pgcrypto with schema extensions;

-- 1. request limits

create table if not exists public.request_hits (
  bucket text not null,
  ip text not null,
  subject text not null default '',
  at timestamptz not null default now()
);
create index if not exists request_hits_ip_idx on public.request_hits (bucket, ip, at);
create index if not exists request_hits_subject_idx on public.request_hits (bucket, subject, at);
alter table public.request_hits enable row level security;
revoke all on public.request_hits from anon, authenticated;

create or replace function public.request_ip()
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  headers json;
begin
  begin
    headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    return null;
  end;
  if headers is null then
    return null;
  end if;
  return nullif(trim(coalesce(
    headers ->> 'cf-connecting-ip',
    nullif(split_part(coalesce(headers ->> 'x-forwarded-for', ''), ',', 1), ''),
    headers ->> 'x-real-ip',
    ''
  )), '');
end;
$$;

create or replace function public.request_is_service()
returns boolean
language plpgsql
stable
as $$
begin
  return coalesce(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role', '') = 'service_role';
exception when others then
  return false;
end;
$$;

create or replace function public.rate_check(p_bucket text, p_max integer, p_window interval)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  caller text := public.request_ip();
  used integer;
begin
  if caller is null or public.request_is_service() then
    return;
  end if;
  select count(*) into used
    from public.request_hits h
   where h.bucket = p_bucket and h.ip = caller and h.at > now() - p_window;
  if used >= p_max then
    raise exception 'too many requests' using errcode = 'PT429';
  end if;
  insert into public.request_hits (bucket, ip) values (p_bucket, caller);
  if random() < 0.005 then
    delete from public.request_hits where at < now() - interval '2 days';
  end if;
end;
$$;

create or replace function public.rate_check_distinct(p_bucket text, p_subjects text[], p_max integer, p_window interval)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  caller text := public.request_ip();
  used integer;
begin
  if caller is null or public.request_is_service() or coalesce(array_length(p_subjects, 1), 0) = 0 then
    return;
  end if;
  insert into public.request_hits (bucket, ip, subject)
  select distinct p_bucket, caller, s
    from unnest(p_subjects) as s
   where s is not null
     and not exists (
       select 1 from public.request_hits h
        where h.bucket = p_bucket and h.ip = caller and h.subject = s and h.at > now() - p_window
     );
  select count(distinct h.subject) into used
    from public.request_hits h
   where h.bucket = p_bucket and h.ip = caller and h.at > now() - p_window;
  if used > p_max then
    raise exception 'too many requests' using errcode = 'PT429';
  end if;
end;
$$;

create or replace function public.rate_check_subject(p_bucket text, p_subject text, p_max integer, p_window interval)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  used integer;
begin
  if public.request_is_service() then
    return;
  end if;
  select count(*) into used
    from public.request_hits h
   where h.bucket = p_bucket and h.subject = p_subject and h.at > now() - p_window;
  if used >= p_max then
    raise exception 'too many requests' using errcode = 'PT429';
  end if;
  insert into public.request_hits (bucket, ip, subject)
  values (p_bucket, coalesce(public.request_ip(), ''), p_subject);
end;
$$;

-- for server functions, which pass the visitor address themselves
create or replace function public.api_rate_check(p_ip text, p_bucket text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  used integer;
begin
  select count(*) into used
    from public.request_hits h
   where h.bucket = p_bucket and h.ip = coalesce(p_ip, '') and h.at > now() - make_interval(secs => p_window_seconds);
  if used >= p_max then
    return false;
  end if;
  insert into public.request_hits (bucket, ip) values (p_bucket, coalesce(p_ip, ''));
  return true;
end;
$$;
revoke all on function public.api_rate_check(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.api_rate_check(text, text, integer, integer) to service_role;

-- a caller may look at a few dozen cards per hour, not scan the whole range
create or replace function public.oura_guard(p_codes text[])
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.rate_check_distinct(
    'oura-cards',
    array(select public.oura_code(c) from unnest(p_codes[1:50]) as c),
    60,
    interval '1 hour'
  );
end;
$$;

revoke all on function public.request_ip() from public, anon, authenticated;
revoke all on function public.request_is_service() from public, anon, authenticated;
revoke all on function public.rate_check(text, integer, interval) from public, anon, authenticated;
revoke all on function public.rate_check_distinct(text, text[], integer, interval) from public, anon, authenticated;
revoke all on function public.rate_check_subject(text, text, integer, interval) from public, anon, authenticated;
revoke all on function public.oura_guard(text[]) from public, anon, authenticated;

-- 2. app: cards

create or replace function public.oura_holder_get(p_code text)
returns setof public.oura_holders
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.oura_guard(array[p_code]);
  return query select * from public.oura_holders where card_code = public.oura_code(p_code);
end;
$$;

create or replace function public.oura_holders_get(p_codes text[])
returns setof public.oura_holders
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.oura_guard(p_codes);
  return query
    select h.* from public.oura_holders h
     where h.card_code in (select public.oura_code(c) from unnest(p_codes[1:50]) as c);
end;
$$;

create or replace function public.oura_device_cards(p_device text)
returns setof text
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.rate_check('oura-device', 300, interval '10 minutes');
  return query
    select card_code from public.oura_cards where device_id = p_device order by created_at;
end;
$$;

create or replace function public.oura_card_link(p_device text, p_code text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.oura_guard(array[p_code]);
  if coalesce(length(p_device), 0) not between 6 and 100 then
    return;
  end if;
  insert into public.oura_cards (device_id, card_code)
  select p_device, public.oura_code(p_code)
   where exists (select 1 from public.oura_holders where card_code = public.oura_code(p_code))
  on conflict (device_id, card_code) do nothing;
end;
$$;

create or replace function public.oura_card_unlink(p_device text, p_code text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.oura_guard(array[p_code]);
  delete from public.oura_cards where device_id = p_device and card_code = public.oura_code(p_code);
end;
$$;

-- written by the /api/oura-card server function only, after asking the network
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
    public.oura_code(p_code), nullif(trim(left(p_first_name, 80)), ''), nullif(trim(left(p_last_name, 80)), ''),
    p_birth_date, p_expires_at,
    left(p_contract_label, 200), p_contract_starting_at, p_contract_ending_at, left(p_network_label, 200),
    left(p_photo_path, 200), coalesce(p_is_expired, false), coalesce(p_is_blacklisted, false),
    coalesce(p_is_locked, false), coalesce(p_is_invalid, false)
  )
  on conflict (card_code) do update set
    first_name = coalesce(excluded.first_name, h.first_name),
    last_name = coalesce(excluded.last_name, h.last_name),
    birth_date = coalesce(excluded.birth_date, h.birth_date),
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

create or replace function public.oura_holder_disable(p_code text)
returns void
language sql
security definer set search_path = public
as $$
  update public.oura_holders set is_disabled = true where card_code = public.oura_code(p_code);
$$;

create or replace function public.oura_test_card_save(
  p_code text,
  p_first_name text,
  p_last_name text,
  p_photo_path text
)
returns setof public.oura_holders
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.oura_guard(array[p_code]);
  return query
    update public.oura_holders
       set first_name = nullif(trim(left(p_first_name, 80)), ''),
           last_name = nullif(trim(left(p_last_name, 80)), ''),
           photo_path = coalesce(left(p_photo_path, 200), photo_path)
     where card_code = public.oura_code(p_code)
       and is_test
    returning *;
end;
$$;

create or replace function public.oura_notifications_list(p_code text, p_limit integer default 10)
returns setof public.oura_notifications
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.oura_guard(array[p_code]);
  return query
    select * from public.oura_notifications
     where card_code = public.oura_code(p_code)
     order by created_at desc
     limit least(greatest(coalesce(p_limit, 10), 1), 50);
end;
$$;

create or replace function public.oura_wallet_announce(p_code text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.oura_guard(array[p_code]);
  perform public.rate_check_subject('oura-announce', public.oura_code(p_code), 10, interval '1 day');
  insert into public.oura_notifications (card_code, title, body, kind)
  select public.oura_code(p_code),
         'Carte ajoutée à un GreLines Wallet',
         'Quelqu''un vient d''ajouter cette carte à son portefeuille GreLines. Si ce n''est pas vous, retirez-la de cet appareil et prévenez le réseau.',
         'wallet'
   where exists (select 1 from public.oura_holders where card_code = public.oura_code(p_code));
end;
$$;

create or replace function public.oura_last_change(p_codes text[])
returns timestamptz
language plpgsql
security definer set search_path = public
as $$
declare
  result timestamptz;
begin
  perform public.oura_guard(p_codes);
  with codes as (select public.oura_code(c) as code from unnest(p_codes[1:50]) as c)
  select greatest(
    (select max(h.updated_at) from public.oura_holders h join codes on codes.code = h.card_code),
    (select max(n.created_at) from public.oura_notifications n join codes on codes.code = n.card_code)
  ) into result;
  return result;
end;
$$;

revoke all on function public.oura_holder_save(text, text, text, date, timestamptz, text, timestamptz, timestamptz, text, text, boolean, boolean, boolean, boolean) from public, anon, authenticated;
revoke all on function public.oura_holder_disable(text) from public, anon, authenticated;
grant execute on function public.oura_holder_save(text, text, text, date, timestamptz, text, timestamptz, timestamptz, text, text, boolean, boolean, boolean, boolean) to service_role;
grant execute on function public.oura_holder_disable(text) to service_role;

grant execute on function public.oura_holder_get(text) to anon, authenticated;
grant execute on function public.oura_holders_get(text[]) to anon, authenticated;
grant execute on function public.oura_device_cards(text) to anon, authenticated;
grant execute on function public.oura_card_link(text, text) to anon, authenticated;
grant execute on function public.oura_card_unlink(text, text) to anon, authenticated;
grant execute on function public.oura_test_card_save(text, text, text, text) to anon, authenticated;
grant execute on function public.oura_notifications_list(text, integer) to anon, authenticated;
grant execute on function public.oura_wallet_announce(text) to anon, authenticated;
grant execute on function public.oura_last_change(text[]) to anon, authenticated;

-- 3. app: account and trips

create or replace function public.oura_account_get(p_code text)
returns setof public.oura_accounts
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.oura_guard(array[p_code]);
  return query select * from public.oura_accounts where card_code = public.oura_code(p_code);
end;
$$;

-- an existing account is returned as it is, never overwritten
create or replace function public.oura_account_create(
  p_code text,
  p_first_name text,
  p_last_name text,
  p_pseudo text,
  p_avatar_emoji text,
  p_avatar_path text
)
returns setof public.oura_accounts
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.oura_guard(array[p_code]);
  if coalesce(length(trim(p_pseudo)), 0) not between 1 and 64 then
    raise exception 'invalid pseudo' using errcode = '22023';
  end if;
  insert into public.oura_accounts (card_code, first_name, last_name, pseudo, avatar_emoji, avatar_path, updated_at)
  values (
    public.oura_code(p_code), left(p_first_name, 80), left(p_last_name, 80), trim(p_pseudo),
    left(p_avatar_emoji, 16),
    case when p_avatar_path like 'avatars/%' then left(p_avatar_path, 200) end,
    now()
  )
  on conflict (card_code) do nothing;
  return query select * from public.oura_accounts where card_code = public.oura_code(p_code);
end;
$$;

create or replace function public.oura_account_update(p_code text, p_changes jsonb)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  changed integer;
begin
  perform public.oura_guard(array[p_code]);
  if p_changes ? 'pseudo' and coalesce(length(trim(p_changes ->> 'pseudo')), 0) not between 1 and 64 then
    raise exception 'invalid pseudo' using errcode = '22023';
  end if;
  if p_changes ? 'avatar_path' and p_changes ->> 'avatar_path' is not null
     and (p_changes ->> 'avatar_path' not like 'avatars/%' or length(p_changes ->> 'avatar_path') > 200) then
    raise exception 'invalid avatar' using errcode = '22023';
  end if;
  update public.oura_accounts
     set pseudo = coalesce(trim(p_changes ->> 'pseudo'), pseudo),
         avatar_emoji = case when p_changes ? 'avatar_emoji' then left(p_changes ->> 'avatar_emoji', 16) else avatar_emoji end,
         avatar_path = case when p_changes ? 'avatar_path' then p_changes ->> 'avatar_path' else avatar_path end,
         updated_at = now()
   where card_code = public.oura_code(p_code);
  get diagnostics changed = row_count;
  return changed > 0;
end;
$$;

create or replace function public.oura_pseudo_free(p_pseudo text, p_except_code text default null)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.rate_check('oura-pseudo', 200, interval '10 minutes');
  return not exists (
    select 1 from public.oura_accounts
     where lower(pseudo) = lower(p_pseudo)
       and (p_except_code is null or card_code <> public.oura_code(p_except_code))
  );
end;
$$;

-- one trip gives at most 1 trip, a few hundred points, and a card earns at most 30 trips a day
create or replace function public.credit_oura_account(
  p_card_code text,
  p_points integer,
  p_trips integer,
  p_helped integer
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.oura_guard(array[p_card_code]);
  perform public.rate_check_subject('oura-credit', public.oura_code(p_card_code), 30, interval '1 day');
  update public.oura_accounts
     set points = points + least(greatest(coalesce(p_points, 0), 0), 300),
         trips = trips + least(greatest(coalesce(p_trips, 0), 0), 1),
         travellers_helped = travellers_helped + least(greatest(coalesce(p_helped, 0), 0), 500),
         updated_at = now()
   where card_code = public.oura_code(p_card_code);
end;
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
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.oura_guard(array[p_code]);
  perform public.rate_check_subject('oura-trip', public.oura_code(p_code), 30, interval '1 day');
  if jsonb_typeof(coalesce(p_legs, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_legs, '[]'::jsonb)) > 20
     or jsonb_typeof(coalesce(p_path, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_path, '[]'::jsonb)) > 400
     or pg_column_size(p_legs) + pg_column_size(p_path) > 200000 then
    raise exception 'trip too large' using errcode = '22023';
  end if;
  insert into public.oura_account_trips
    (card_code, origin, destination, started_at, ended_at, legs, path, points, travellers_helped)
  select public.oura_code(p_code), left(p_origin, 200), left(p_destination, 200), p_started_at, p_ended_at,
         coalesce(p_legs, '[]'::jsonb), coalesce(p_path, '[]'::jsonb),
         least(greatest(coalesce(p_points, 0), 0), 300), least(greatest(coalesce(p_helped, 0), 0), 500)
   where exists (select 1 from public.oura_accounts where card_code = public.oura_code(p_code));
end;
$$;

create or replace function public.oura_trips_list(p_code text, p_limit integer default 60)
returns setof public.oura_account_trips
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.oura_guard(array[p_code]);
  return query
    select * from public.oura_account_trips
     where card_code = public.oura_code(p_code)
     order by created_at desc
     limit least(greatest(coalesce(p_limit, 60), 1), 500);
end;
$$;

grant execute on function public.oura_account_get(text) to anon, authenticated;
grant execute on function public.oura_account_create(text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.oura_account_update(text, jsonb) to anon, authenticated;
grant execute on function public.oura_pseudo_free(text, text) to anon, authenticated;
grant execute on function public.credit_oura_account(text, integer, integer, integer) to anon, authenticated;
grant execute on function public.oura_trip_record(text, text, text, timestamptz, timestamptz, jsonb, jsonb, integer, integer) to anon, authenticated;
grant execute on function public.oura_trips_list(text, integer) to anon, authenticated;

-- 4. data.grelines.fr: only through its server, three failed tries per card per quarter hour

create table if not exists public.oura_data_attempts (
  card_code text not null,
  ip text,
  at timestamptz not null default now()
);
create index if not exists oura_data_attempts_card_idx on public.oura_data_attempts (card_code, at);
create index if not exists oura_data_attempts_ip_idx on public.oura_data_attempts (ip, at);
alter table public.oura_data_attempts enable row level security;
revoke all on public.oura_data_attempts from anon, authenticated;

drop function if exists public.oura_data_verify(text, text, date);
drop function if exists public.oura_data_inventory(text, text, date);
drop function if exists public.oura_data_erase(text, text, date, text[], text, text, text);

create or replace function public.oura_data_verify(p_code text, p_last_name text, p_birth_date date, p_ip text default null)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  holder public.oura_holders;
  code text := public.oura_code(p_code);
  failures integer;
begin
  select count(*) into failures from public.oura_data_attempts where card_code = code and at > now() - interval '15 minutes';
  if failures >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'too-many');
  end if;
  if p_ip is not null then
    select count(*) into failures from public.oura_data_attempts where ip = p_ip and at > now() - interval '15 minutes';
    if failures >= 10 then
      return jsonb_build_object('ok', false, 'reason', 'too-many');
    end if;
  end if;

  select * into holder from public.oura_holders where card_code = code;
  if not found
     or (holder.last_name is null and holder.birth_date is null)
     or (holder.last_name is not null
         and (public.oura_name_key(holder.last_name) = '' or public.oura_name_key(holder.last_name) <> public.oura_name_key(p_last_name)))
     or (holder.birth_date is not null and (p_birth_date is null or holder.birth_date <> p_birth_date)) then
    insert into public.oura_data_attempts (card_code, ip) values (code, p_ip);
    delete from public.oura_data_attempts where at < now() - interval '1 day';
    return jsonb_build_object('ok', false, 'reason', 'mismatch');
  end if;
  return jsonb_build_object('ok', true, 'holder', to_jsonb(holder));
end;
$$;

create or replace function public.oura_data_inventory(p_code text, p_last_name text, p_birth_date date, p_ip text default null)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  gate jsonb;
  code text := public.oura_code(p_code);
begin
  gate := public.oura_data_verify(p_code, p_last_name, p_birth_date, p_ip);
  if not (gate ->> 'ok')::boolean then
    return gate;
  end if;
  return jsonb_build_object(
    'ok', true,
    'holder', gate -> 'holder',
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

create or replace function public.oura_data_erase(
  p_code text,
  p_last_name text,
  p_birth_date date,
  p_categories text[],
  p_reference text,
  p_reason text,
  p_comment text,
  p_ip text default null
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
  gate := public.oura_data_verify(p_code, p_last_name, p_birth_date, p_ip);
  if not (gate ->> 'ok')::boolean then
    return gate;
  end if;

  insert into public.data_deletion_requests (reference, card_code, categories, reason, comment)
  values (left(p_reference, 40), code, to_jsonb(p_categories), left(p_reason, 200), nullif(trim(left(coalesce(p_comment, ''), 2000)), ''));

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

revoke all on function public.oura_data_verify(text, text, date, text) from public, anon, authenticated;
revoke all on function public.oura_data_inventory(text, text, date, text) from public, anon, authenticated;
revoke all on function public.oura_data_erase(text, text, date, text[], text, text, text, text) from public, anon, authenticated;
grant execute on function public.oura_data_verify(text, text, date, text) to service_role;
grant execute on function public.oura_data_inventory(text, text, date, text) to service_role;
grant execute on function public.oura_data_erase(text, text, date, text[], text, text, text, text) to service_role;

drop policy if exists "data_deletion_requests_anon_insert" on public.data_deletion_requests;
revoke insert on public.data_deletion_requests from anon, authenticated;

-- 5. photos: images only, 5 MB, in the folders the app writes to

update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
 where id = 'oura-photos';

drop policy if exists "oura_photos_anon_write" on storage.objects;
create policy "oura_photos_anon_write" on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'oura-photos'
    and (
      name ~ '^avatars/[0-9]{10}-[0-9]{10,16}\.jpg$'
      or name ~ '^([0-9a-f-]{36}|volatile|admin)/[0-9]{10}-[0-9]{10,16}\.jpg$'
      or (select public.crm_is_staff())
    )
  );

-- 6. management login: failures counted per name and per address

alter table public.crm_login_attempts add column if not exists ip text;

create or replace function public.crm_authenticate(p_username text, p_password text)
returns table(
  id uuid,
  username text,
  full_name text,
  role text,
  access_start time,
  access_end time,
  access_days smallint[],
  must_change_password boolean,
  session_token text
)
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  account public.crm_users%rowtype;
  recent_failures integer;
  caller text := public.request_ip();
  token text;
begin
  select count(*) into recent_failures
  from public.crm_login_attempts a
  where a.username = lower(p_username)
    and not a.succeeded
    and a.attempted_at > now() - interval '15 minutes'
    and (caller is null or a.ip = caller);
  if recent_failures >= 8 then
    raise exception 'Trop de tentatives. Réessayez dans quelques minutes.' using errcode = '42501';
  end if;

  select count(*) into recent_failures
  from public.crm_login_attempts a
  where caller is not null
    and a.ip = caller
    and not a.succeeded
    and a.attempted_at > now() - interval '15 minutes';
  if recent_failures >= 20 then
    raise exception 'Trop de tentatives. Réessayez dans quelques minutes.' using errcode = '42501';
  end if;

  select * into account
  from public.crm_users u
  where u.username = p_username
    and u.password_hash = crypt(p_password, u.password_hash);

  insert into public.crm_login_attempts (username, succeeded, ip) values (lower(p_username), account.id is not null, caller);
  delete from public.crm_login_attempts where attempted_at < now() - interval '1 day';

  if account.id is null then
    return;
  end if;

  token := encode(gen_random_bytes(32), 'hex');
  delete from public.crm_sessions where expires_at < now();
  insert into public.crm_sessions (token_hash, user_id, expires_at)
  values (encode(digest(token, 'sha256'), 'hex'), account.id, now() + interval '14 days');

  return query select account.id, account.username, account.full_name, account.role,
    account.access_start, account.access_end, account.access_days, account.must_change_password, token;
end;
$$;
grant execute on function public.crm_authenticate(text, text) to anon, authenticated;

-- 7. public writes: a sane pace per address and bounded sizes

create or replace function public.limit_public_insert()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if (select public.crm_is_staff()) then
    return new;
  end if;
  perform public.rate_check(tg_table_name, tg_argv[0]::integer, tg_argv[1]::interval);
  return new;
end;
$$;
revoke all on function public.limit_public_insert() from public, anon, authenticated;

create table if not exists public.crowd_signals (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('crowding', 'delay', 'ghost', 'access')),
  line_id text,
  stop_id text,
  stop_name text,
  value smallint not null check (value between 1 and 3),
  slot_bucket smallint not null,
  reported_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.crowd_signals enable row level security;
create index if not exists crowd_signals_stop_time_idx on public.crowd_signals (stop_id, reported_at desc);
create index if not exists crowd_signals_line_time_idx on public.crowd_signals (line_id, reported_at desc);
create index if not exists crowd_signals_slot_idx on public.crowd_signals (slot_bucket, line_id, reported_at desc);
grant select, insert on public.crowd_signals to anon, authenticated;
drop policy if exists "crowd_signals_anon_all" on public.crowd_signals;
drop policy if exists "crowd_signals_anon_read" on public.crowd_signals;
drop policy if exists "crowd_signals_anon_insert" on public.crowd_signals;
create policy "crowd_signals_anon_read" on public.crowd_signals for select to anon, authenticated using (true);
create policy "crowd_signals_anon_insert" on public.crowd_signals for insert to anon, authenticated with check (true);

do $$
declare
  spec text[];
begin
  foreach spec slice 1 in array array[
    array['stop_surveys', '30', '1 hour'],
    array['trip_surveys', '30', '1 hour'],
    array['line_observations', '600', '1 hour'],
    array['crowd_signals', '120', '1 hour'],
    array['campaign_hits', '120', '1 hour'],
    array['translations', '300', '1 hour']
  ] loop
    if to_regclass('public.' || spec[1]) is null then
      continue;
    end if;
    execute format('drop trigger if exists %I on public.%I', spec[1] || '_limit', spec[1]);
    execute format(
      'create trigger %I before insert on public.%I for each row execute function public.limit_public_insert(%L, %L)',
      spec[1] || '_limit', spec[1], spec[2], spec[3]);
  end loop;
end;
$$;

do $$
begin
  if to_regclass('public.stop_surveys') is not null then
    alter table public.stop_surveys drop constraint if exists stop_surveys_sizes;
    alter table public.stop_surveys add constraint stop_surveys_sizes
      check (coalesce(length(comment), 0) <= 1000 and coalesce(length(stop_name), 0) <= 200) not valid;
    revoke select on public.stop_surveys from anon, authenticated;
    grant select (id, stop_id, stop_name, display_readable, shelter_condition, feels_safe, answered_at, created_at)
      on public.stop_surveys to anon, authenticated;
  end if;
  if to_regclass('public.campaign_hits') is not null then
    alter table public.campaign_hits drop constraint if exists campaign_hits_sizes;
    alter table public.campaign_hits add constraint campaign_hits_sizes
      check (length(source) <= 100 and coalesce(length(stop_id), 0) <= 100
             and coalesce(length(campaign), 0) <= 100 and coalesce(length(medium), 0) <= 100) not valid;
  end if;
  if to_regclass('public.crowd_signals') is not null then
    alter table public.crowd_signals drop constraint if exists crowd_signals_sizes;
    alter table public.crowd_signals add constraint crowd_signals_sizes
      check (coalesce(length(line_id), 0) <= 100 and coalesce(length(stop_id), 0) <= 100
             and coalesce(length(stop_name), 0) <= 200) not valid;
  end if;
end;
$$;

-- 8. translations: the key must be the one the app computes from the source text

create or replace function public.translation_key(p_text text, p_target text)
returns text
language plpgsql
immutable
as $$
declare
  h bigint := 2166136261;
  c integer;
begin
  for i in 1 .. char_length(p_text) loop
    c := ascii(substr(p_text, i, 1));
    if c > 65535 then
      return null;
    end if;
    h := (h # c) * 16777619 % 4294967296;
  end loop;
  return p_target || ':' || char_length(p_text) || ':' || to_hex(h);
end;
$$;
revoke all on function public.translation_key(text, text) from public, anon, authenticated;

create or replace function public.check_translation()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  expected text;
begin
  if (select public.crm_is_staff()) then
    return new;
  end if;
  if length(new.source_text) > 5000 or length(new.translated_text) > 3 * length(new.source_text) + 200 then
    raise exception 'translation too long' using errcode = '22023';
  end if;
  expected := public.translation_key(new.source_text, new.target_lang);
  if expected is not null and expected <> new.key then
    raise exception 'translation key mismatch' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.check_translation() from public, anon, authenticated;

do $$
begin
  if to_regclass('public.translations') is not null then
    drop trigger if exists translations_check on public.translations;
    create trigger translations_check before insert on public.translations
      for each row execute function public.check_translation();
  end if;
end;
$$;

-- 9. housekeeping functions are not for the public

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.purge_crowd_signals()',
    'public.purge_line_observations()',
    'public.purge_translations()',
    'public.crm_can_manage(text, text)'
  ] loop
    if to_regprocedure(fn) is not null then
      execute format('revoke all on function %s from public, anon, authenticated', fn);
    end if;
  end loop;
end;
$$;
