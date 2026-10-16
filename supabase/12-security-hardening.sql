create extension if not exists pgcrypto with schema extensions;

create table if not exists public.crm_sessions (
  token_hash text primary key,
  user_id uuid not null references public.crm_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
alter table public.crm_sessions enable row level security;
revoke all on public.crm_sessions from anon, authenticated;
create index if not exists crm_sessions_user_idx on public.crm_sessions (user_id);

create table if not exists public.crm_login_attempts (
  id bigserial primary key,
  username text not null,
  succeeded boolean not null,
  attempted_at timestamptz not null default now()
);
alter table public.crm_login_attempts enable row level security;
revoke all on public.crm_login_attempts from anon, authenticated;
create index if not exists crm_login_attempts_idx on public.crm_login_attempts (username, attempted_at);

create or replace function public.crm_session_user()
returns uuid
language plpgsql
stable
security definer set search_path = public, extensions
as $$
declare
  headers json;
  raw text;
  found uuid;
begin
  begin
    headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    return null;
  end;
  raw := headers ->> 'x-crm-session';
  if raw is null or length(raw) < 32 then
    return null;
  end if;
  select s.user_id into found
  from public.crm_sessions s
  join public.crm_users u on u.id = s.user_id
  where s.token_hash = encode(extensions.digest(raw, 'sha256'), 'hex')
    and s.expires_at > now();
  return found;
end;
$$;

create or replace function public.crm_is_staff()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select public.crm_session_user() is not null;
$$;

create or replace function public.crm_require_actor(p_actor_id uuid)
returns void
language plpgsql
stable
security definer set search_path = public
as $$
begin
  if p_actor_id is null or p_actor_id is distinct from public.crm_session_user() then
    raise exception 'Session expirée : reconnectez-vous.' using errcode = '42501';
  end if;
end;
$$;

grant execute on function public.crm_session_user() to anon, authenticated;
grant execute on function public.crm_is_staff() to anon, authenticated;
revoke all on function public.crm_require_actor(uuid) from public, anon, authenticated;

drop function if exists public.crm_authenticate(text, text);
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
  token text;
begin
  select count(*) into recent_failures
  from public.crm_login_attempts a
  where a.username = lower(p_username)
    and not a.succeeded
    and a.attempted_at > now() - interval '15 minutes';
  if recent_failures >= 8 then
    raise exception 'Trop de tentatives. Réessayez dans quelques minutes.' using errcode = '42501';
  end if;

  select * into account
  from public.crm_users u
  where u.username = p_username
    and u.password_hash = crypt(p_password, u.password_hash);

  insert into public.crm_login_attempts (username, succeeded) values (lower(p_username), account.id is not null);
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

create or replace function public.crm_session_check()
returns table(
  id uuid,
  username text,
  full_name text,
  role text,
  access_start time,
  access_end time,
  access_days smallint[],
  must_change_password boolean
)
language sql
stable
security definer set search_path = public
as $$
  select u.id, u.username, u.full_name, u.role, u.access_start, u.access_end, u.access_days, u.must_change_password
  from public.crm_users u
  where u.id = public.crm_session_user();
$$;

create or replace function public.crm_logout()
returns void
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  raw text;
begin
  begin
    raw := nullif(current_setting('request.headers', true), '')::json ->> 'x-crm-session';
  exception when others then
    return;
  end;
  if raw is not null then
    delete from public.crm_sessions where token_hash = encode(digest(raw, 'sha256'), 'hex');
  end if;
end;
$$;

grant execute on function public.crm_authenticate(text, text) to anon, authenticated;
grant execute on function public.crm_session_check() to anon, authenticated;
grant execute on function public.crm_logout() to anon, authenticated;

create or replace function public.crm_assert_can_manage(p_actor_id uuid, p_target_role text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  actor_role text;
begin
  perform public.crm_require_actor(p_actor_id);
  select role into actor_role from public.crm_users where id = p_actor_id;
  if actor_role is null then
    raise exception 'Compte demandeur inconnu.' using errcode = '42501';
  end if;
  if not public.crm_can_manage(actor_role, p_target_role) then
    raise exception 'Droits insuffisants sur un compte %.', p_target_role using errcode = '42501';
  end if;
end;
$$;

create or replace function public.crm_assert_staff(p_actor_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.crm_require_actor(p_actor_id);
  if public.crm_role_of(p_actor_id) is null then
    raise exception 'Compte demandeur inconnu.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.crm_assert_can_write_blog(p_actor_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  actor_role text;
begin
  perform public.crm_require_actor(p_actor_id);
  select role into actor_role from public.crm_users where id = p_actor_id;
  if actor_role is null then
    raise exception 'Compte demandeur inconnu.' using errcode = '42501';
  end if;
  if actor_role not in ('superadmin', 'admin', 'editor') then
    raise exception 'Droits insuffisants pour écrire au blog.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.crm_assert_can_manage(uuid, text) from public, anon, authenticated;
revoke all on function public.crm_assert_staff(uuid) from public, anon, authenticated;
revoke all on function public.crm_assert_can_write_blog(uuid) from public, anon, authenticated;
revoke all on function public.crm_role_of(uuid) from public, anon, authenticated;

create or replace function public.crm_list_users()
returns table(
  id uuid,
  username text,
  full_name text,
  role text,
  access_start time,
  access_end time,
  access_days smallint[],
  must_change_password boolean,
  created_at timestamptz
)
language plpgsql
security definer set search_path = public
as $$
begin
  if public.crm_session_user() is null then
    raise exception 'Session expirée : reconnectez-vous.' using errcode = '42501';
  end if;
  return query
    select u.id, u.username, u.full_name, u.role, u.access_start, u.access_end, u.access_days,
           u.must_change_password, u.created_at
    from public.crm_users u
    order by u.created_at;
end;
$$;

create or replace function public.crm_set_password(
  p_actor_id uuid,
  p_user_id uuid,
  p_password text,
  p_must_change_password boolean default false
)
returns void
language plpgsql
security definer set search_path = public, extensions
as $$
begin
  perform public.crm_require_actor(p_actor_id);
  if p_actor_id is distinct from p_user_id then
    perform public.crm_assert_can_manage(p_actor_id, public.crm_role_of(p_user_id));
  end if;
  update public.crm_users
  set password_hash = crypt(p_password, gen_salt('bf')),
      must_change_password = coalesce(p_must_change_password, false)
  where id = p_user_id;
  if p_actor_id is distinct from p_user_id then
    delete from public.crm_sessions where user_id = p_user_id;
  end if;
end;
$$;

create or replace function public.crm_update_profile(p_user_id uuid, p_full_name text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.crm_require_actor(p_user_id);
  update public.crm_users set full_name = p_full_name where id = p_user_id;
end;
$$;

create or replace function public.crm_change_own_password(
  p_user_id uuid,
  p_current_password text,
  p_new_password text
)
returns void
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  stored text;
begin
  perform public.crm_require_actor(p_user_id);
  select password_hash into stored from public.crm_users where id = p_user_id;
  if stored is null then
    raise exception 'Compte inconnu.' using errcode = '42501';
  end if;
  if stored <> crypt(p_current_password, stored) then
    raise exception 'Mot de passe actuel incorrect.' using errcode = '42501';
  end if;

  update public.crm_users
  set password_hash = crypt(p_new_password, gen_salt('bf')),
      must_change_password = false
  where id = p_user_id;
end;
$$;

create or replace function public.crm_set_super_config(p_actor_id uuid, p_key text, p_value jsonb)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.crm_require_actor(p_actor_id);
  if p_key not in ('about_config', 'release_notes', 'update_label') then
    raise exception 'Clé non gérée par crm_set_super_config : %.', p_key using errcode = '42501';
  end if;
  if public.crm_role_of(p_actor_id) is distinct from 'superadmin' then
    raise exception 'Réservé aux super administrateurs.' using errcode = '42501';
  end if;
  insert into public.site_config (key, value)
  values (p_key, p_value)
  on conflict (key) do update set value = excluded.value;
end;
$$;

update public.crm_users
set must_change_password = true
where username = 'x666'
  and password_hash = extensions.crypt('123456', password_hash);

drop policy if exists "popups_anon_write" on public.popups;
drop policy if exists "popups_anon_update" on public.popups;
drop policy if exists "popups_anon_delete" on public.popups;
drop policy if exists "popups_staff_read" on public.popups;
drop policy if exists "popups_staff_write" on public.popups;
create policy "popups_staff_read" on public.popups for select to anon, authenticated using ((select public.crm_is_staff()));
create policy "popups_staff_write" on public.popups for all to anon, authenticated
  using ((select public.crm_is_staff())) with check ((select public.crm_is_staff()));

drop policy if exists "site_config_write" on public.site_config;
create policy "site_config_write" on public.site_config for all to anon, authenticated
  using ((select public.crm_is_staff()) and key not in ('about_config', 'release_notes', 'update_label'))
  with check ((select public.crm_is_staff()) and key not in ('about_config', 'release_notes', 'update_label'));

drop policy if exists "rame_estimates_anon_all" on public.rame_estimates;
drop policy if exists "rame_estimates_staff_all" on public.rame_estimates;
create policy "rame_estimates_staff_all" on public.rame_estimates for all to anon, authenticated
  using ((select public.crm_is_staff())) with check ((select public.crm_is_staff()));

do $$
declare
  t text;
begin
  foreach t in array array['stop_overrides', 'line_overrides', 'traffic_overrides'] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('drop policy if exists %I on public.%I', t || '_anon_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_public_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_staff_write', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_public_read', t);
    execute format('create policy %I on public.%I for all to anon, authenticated using ((select public.crm_is_staff())) with check ((select public.crm_is_staff()))', t || '_staff_write', t);
  end loop;
end;
$$;

drop policy if exists "trip_surveys_anon_read" on public.trip_surveys;
drop policy if exists "trip_surveys_staff_read" on public.trip_surveys;
create policy "trip_surveys_staff_read" on public.trip_surveys for select to anon, authenticated using ((select public.crm_is_staff()));

create or replace function public.trip_survey_scores(p_line_id text, p_since timestamptz)
returns table(cleanliness smallint, comfort smallint, crowding smallint, punctuality smallint, on_time boolean)
language sql
stable
security definer set search_path = public
as $$
  select s.cleanliness, s.comfort, s.crowding, s.punctuality, s.on_time
  from public.trip_surveys s
  where s.line_id = p_line_id and s.created_at >= p_since
  order by s.created_at desc
  limit 500;
$$;
grant execute on function public.trip_survey_scores(text, timestamptz) to anon, authenticated;

do $$
begin
  if to_regclass('public.campaign_hits') is not null then
    drop policy if exists "campaign_hits_anon_read" on public.campaign_hits;
    drop policy if exists "campaign_hits_staff_read" on public.campaign_hits;
    create policy "campaign_hits_staff_read" on public.campaign_hits for select to anon, authenticated using ((select public.crm_is_staff()));
  end if;
  if to_regclass('public.campaign_stop_counts') is not null then
    alter view public.campaign_stop_counts set (security_invoker = on);
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.translations') is not null then
    drop policy if exists translations_touch on public.translations;
    drop policy if exists translations_staff_update on public.translations;
    create policy translations_staff_update on public.translations for update to anon, authenticated
      using ((select public.crm_is_staff())) with check ((select public.crm_is_staff()));
  end if;
end;
$$;

create or replace function public.translations_touch(p_keys text[])
returns void
language sql
security definer set search_path = public
as $$
  update public.translations set last_seen_at = now()
  where key = any(p_keys[1:200]) and last_seen_at < now() - interval '1 hour';
$$;
grant execute on function public.translations_touch(text[]) to anon, authenticated;

drop policy if exists blog_images_write on storage.objects;
create policy blog_images_write on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'blog' and (select public.crm_is_staff()));
