-- GreLines — campagnes d'affichage.
--
-- Idempotent : peut être ré-exécuté tel quel dans l'éditeur SQL Supabase.
--
-- Une affiche en abribus porte une adresse et un code QR qui mènent à l'arrêt
-- où elle est collée : `grelines.fr/?utm_source=abribus&utm_stops=SEM:CHAVANT`.
-- Chaque venue par cette adresse laisse une ligne ici, et c'est en les comptant
-- qu'on sait quelle affiche a servi à quelque chose.
--
-- Rien de personnel n'y est écrit : ni adresse IP, ni identifiant d'appareil.
-- On compte des visites, on ne suit personne.

create table if not exists public.campaign_hits (
  id uuid primary key default gen_random_uuid(),
  -- D'où vient la visite : « abribus », « flyer », « totem »…
  source text not null,
  -- Arrêt visé par l'affiche, au format du réseau (SEM:CHAVANT).
  stop_id text,
  -- Campagne nommée, quand on en distingue plusieurs pour une même source.
  campaign text,
  medium text,
  created_at timestamptz not null default now()
);

alter table public.campaign_hits enable row level security;

-- Le site écrit, le panneau d'administration lit.
drop policy if exists "campaign_hits_anon_insert" on public.campaign_hits;
create policy "campaign_hits_anon_insert"
  on public.campaign_hits for insert
  to anon, authenticated
  with check (true);

drop policy if exists "campaign_hits_anon_read" on public.campaign_hits;
create policy "campaign_hits_anon_read"
  on public.campaign_hits for select
  to anon, authenticated
  using (true);

create index if not exists campaign_hits_stop_idx on public.campaign_hits (stop_id, created_at desc);
create index if not exists campaign_hits_source_idx on public.campaign_hits (source, created_at desc);

-- ---------------------------------------------------------------------------
-- Décompte par arrêt et par source, pour le tableau des campagnes.
-- ---------------------------------------------------------------------------
-- Supprimée avant d'être recréée, pour la même raison que ci-dessus : une
-- vue ne se remplace que si ses colonnes ne bougent pas.
drop view if exists public.campaign_stop_counts;
create view public.campaign_stop_counts as
select
  stop_id,
  source,
  count(*)::bigint as hits,
  max(created_at) as last_hit_at
from public.campaign_hits
where stop_id is not null
group by stop_id, source;

grant select on public.campaign_stop_counts to anon, authenticated;
