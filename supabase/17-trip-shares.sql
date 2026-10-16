create table if not exists public.trip_shares (
  token text primary key,
  owner_key text not null,
  payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '3 hours'
);

alter table public.trip_shares add column if not exists public_key text;

alter table public.trip_shares enable row level security;
revoke all on public.trip_shares from anon, authenticated;

drop function if exists public.trip_share_start(text, text, jsonb);

-- public_key lets followers check that live positions really come from the sharer
create or replace function public.trip_share_start(p_token text, p_owner_key text, p_payload jsonb, p_public_key text default null)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if p_token !~ '^[a-z0-9]{6,16}$' or coalesce(length(p_owner_key), 0) < 16
     or coalesce(length(p_public_key), 0) > 400 or pg_column_size(p_payload) > 300000 then
    raise exception 'invalid share' using errcode = '22023';
  end if;
  if to_regprocedure('public.rate_check(text, integer, interval)') is not null then
    perform public.rate_check('trip-share-start', 30, interval '1 hour');
  end if;
  delete from public.trip_shares where expires_at < now();
  insert into public.trip_shares (token, owner_key, payload, public_key)
  values (p_token, p_owner_key, p_payload, p_public_key)
  on conflict (token) do update
    set payload = excluded.payload,
        public_key = coalesce(public.trip_shares.public_key, excluded.public_key),
        updated_at = now()
    where public.trip_shares.owner_key = excluded.owner_key;
end;
$$;

create or replace function public.trip_share_update(p_token text, p_owner_key text, p_payload jsonb)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if pg_column_size(p_payload) > 300000 then
    raise exception 'invalid share' using errcode = '22023';
  end if;
  update public.trip_shares
    set payload = p_payload, updated_at = now()
    where token = p_token and owner_key = p_owner_key and expires_at > now();
end;
$$;

create or replace function public.trip_share_end(p_token text, p_owner_key text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  delete from public.trip_shares where token = p_token and owner_key = p_owner_key;
end;
$$;

create or replace function public.trip_share_get(p_token text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  found jsonb;
begin
  select jsonb_build_object('payload', payload, 'key', public_key) into found
    from public.trip_shares
    where token = p_token and expires_at > now();
  return found;
end;
$$;

revoke all on function public.trip_share_start(text, text, jsonb, text) from public;
revoke all on function public.trip_share_update(text, text, jsonb) from public;
revoke all on function public.trip_share_end(text, text) from public;
revoke all on function public.trip_share_get(text) from public;
grant execute on function public.trip_share_start(text, text, jsonb, text) to anon, authenticated;
grant execute on function public.trip_share_update(text, text, jsonb) to anon, authenticated;
grant execute on function public.trip_share_end(text, text) to anon, authenticated;
grant execute on function public.trip_share_get(text) to anon, authenticated;
