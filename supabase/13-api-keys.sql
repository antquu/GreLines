create extension if not exists pgcrypto with schema extensions;

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,
  rate_limit_per_minute integer not null default 60 check (rate_limit_per_minute between 1 and 6000),
  created_by uuid references public.crm_users(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_used_at timestamptz,
  request_count bigint not null default 0
);
alter table public.api_keys enable row level security;
revoke all on public.api_keys from anon, authenticated;

create table if not exists public.api_usage (
  key_id uuid not null references public.api_keys(id) on delete cascade,
  minute timestamptz not null,
  requests integer not null default 0,
  primary key (key_id, minute)
);
alter table public.api_usage enable row level security;
revoke all on public.api_usage from anon, authenticated;

create table if not exists public.api_cache (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.api_cache enable row level security;
revoke all on public.api_cache from anon, authenticated;

create or replace function public.crm_assert_superadmin(p_actor_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.crm_require_actor(p_actor_id);
  if public.crm_role_of(p_actor_id) is distinct from 'superadmin' then
    raise exception 'Réservé aux super administrateurs.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.crm_assert_superadmin(uuid) from public, anon, authenticated;

create or replace function public.crm_api_keys_list(p_actor_id uuid)
returns table(
  id uuid,
  name text,
  key_prefix text,
  rate_limit_per_minute integer,
  created_at timestamptz,
  created_by_name text,
  revoked_at timestamptz,
  last_used_at timestamptz,
  request_count bigint
)
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.crm_assert_superadmin(p_actor_id);
  return query
    select k.id, k.name, k.key_prefix, k.rate_limit_per_minute, k.created_at,
           coalesce(u.full_name, u.username), k.revoked_at, k.last_used_at, k.request_count
    from public.api_keys k
    left join public.crm_users u on u.id = k.created_by
    order by k.revoked_at nulls first, k.created_at desc;
end;
$$;

create or replace function public.crm_api_key_create(p_actor_id uuid, p_name text, p_rate_limit integer default 60)
returns text
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  secret text;
begin
  perform public.crm_assert_superadmin(p_actor_id);
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Donnez un nom à la clé.' using errcode = '22023';
  end if;
  secret := 'gl_' || encode(gen_random_bytes(24), 'hex');
  insert into public.api_keys (name, key_prefix, key_hash, rate_limit_per_minute, created_by)
  values (
    trim(p_name),
    left(secret, 9),
    encode(digest(secret, 'sha256'), 'hex'),
    greatest(1, least(coalesce(p_rate_limit, 60), 6000)),
    p_actor_id
  );
  return secret;
end;
$$;

create or replace function public.crm_api_key_revoke(p_actor_id uuid, p_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.crm_assert_superadmin(p_actor_id);
  update public.api_keys set revoked_at = now() where id = p_id and revoked_at is null;
end;
$$;

grant execute on function public.crm_api_keys_list(uuid) to anon, authenticated;
grant execute on function public.crm_api_key_create(uuid, text, integer) to anon, authenticated;
grant execute on function public.crm_api_key_revoke(uuid, uuid) to anon, authenticated;

create or replace function public.api_key_use(p_key text)
returns table(allowed boolean, reason text, key_name text, rate_limit integer, used integer)
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  found public.api_keys%rowtype;
  this_minute timestamptz := date_trunc('minute', now());
  count_now integer;
begin
  if p_key is null or p_key !~ '^gl_[0-9a-f]{48}$' then
    return query select false, 'invalid', null::text, 0, 0;
    return;
  end if;

  select * into found from public.api_keys where key_hash = encode(digest(p_key, 'sha256'), 'hex');
  if found.id is null or found.revoked_at is not null then
    return query select false, 'invalid', null::text, 0, 0;
    return;
  end if;

  insert into public.api_usage (key_id, minute, requests) values (found.id, this_minute, 1)
  on conflict (key_id, minute) do update set requests = public.api_usage.requests + 1
  returning requests into count_now;

  update public.api_keys set last_used_at = now(), request_count = request_count + 1 where id = found.id;

  if random() < 0.01 then
    delete from public.api_usage where minute < now() - interval '1 day';
  end if;

  if count_now > found.rate_limit_per_minute then
    return query select false, 'rate_limited', found.name, found.rate_limit_per_minute, count_now;
    return;
  end if;

  return query select true, 'ok', found.name, found.rate_limit_per_minute, count_now;
end;
$$;
revoke all on function public.api_key_use(text) from public, anon, authenticated;
grant execute on function public.api_key_use(text) to service_role;
