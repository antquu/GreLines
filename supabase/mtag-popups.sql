create extension if not exists http with schema extensions;
create extension if not exists pg_cron;

create table if not exists public.popup_imports (
  source_id text primary key,
  popup_id uuid,
  imported_at timestamptz not null default now()
);

alter table public.popup_imports enable row level security;

create or replace function public.sync_mtag_popups()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  response extensions.http_response;
  body jsonb;
  item jsonb;
  ext jsonb;
  new_id uuid;
  added integer := 0;
begin
  begin
    response := extensions.http_get('https://data.mobilites-m.fr/api/dyn/bandeau/site');
  exception when others then
    return 0;
  end;

  if response.status <> 200 then
    return 0;
  end if;

  begin
    body := response.content::jsonb;
  exception when others then
    return 0;
  end;

  if jsonb_typeof(body) <> 'object' then
    return 0;
  end if;

  for item in select value from jsonb_each(body) loop
    ext := coalesce(item -> '_situationRecordExtension', '{}'::jsonb);

    continue when coalesce(item ->> 'id', '') = '';
    continue when coalesce((ext ->> 'suspended')::boolean, false);
    continue when not (
      coalesce((ext #>> '{visibility,appBanner}')::boolean, false)
      or coalesce((ext #>> '{visibility,siteBanner,visible}')::boolean, false)
    );
    continue when (item ->> 'endTime') is not null and (item ->> 'endTime')::timestamptz < now();
    continue when exists (select 1 from public.popup_imports where source_id = item ->> 'id');

    insert into public.popups (
      type, title, message, link_url, active, starts_at, ends_at,
      target_scope, target_network, priority
    ) values (
      'infotraffic',
      coalesce(nullif(trim(item ->> 'detailedTypeText'), ''), 'Information M réso'),
      trim(coalesce(item ->> 'generalPublicComment', '')),
      nullif(trim(coalesce(ext ->> 'attachement', '')), ''),
      true,
      (item ->> 'startTime')::timestamptz,
      (item ->> 'endTime')::timestamptz,
      'global',
      'SEM',
      0
    )
    returning id into new_id;

    insert into public.popup_imports (source_id, popup_id) values (item ->> 'id', new_id);
    added := added + 1;
  end loop;

  return added;
end;
$$;

revoke all on function public.sync_mtag_popups() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'sync-mtag-popups') then
    perform cron.unschedule('sync-mtag-popups');
  end if;
end;
$$;

select cron.schedule('sync-mtag-popups', '*/5 * * * *', 'select public.sync_mtag_popups()');

select public.sync_mtag_popups();
