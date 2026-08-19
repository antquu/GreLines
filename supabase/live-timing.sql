-- ---------------------------------------------------------------------------
-- Observations de passage : ce que les voyageurs savent et que l'horaire ignore.
--
-- Le réseau ne publie pas la position de ses véhicules — ni GTFS-RT, ni SIRI.
-- Les horaires affichés sont donc théoriques, corrigés au mieux par les
-- estimations du routeur. Mais il y a une source que personne n'exploite : les
-- gens qui sont dans le bus.
--
-- Quelqu'un guidé sur la ligne C1, monté à Chavant à 8h04, qui se trouve trois
-- arrêts plus loin à 8h11, dit quelque chose de précis : ce véhicule-là a mis
-- sept minutes pour un tronçon qui en vaut cinq sur le papier. Deux minutes de
-- retard, constatées, pas devinées. Et cette information vaut pour tous ceux
-- qui attendent ce même véhicule en aval.
--
-- Ce que la table NE contient PAS, délibérément :
--   * aucune coordonnée GPS — seulement des arrêts, qui sont des lieux publics ;
--   * aucun identifiant d'appareil ni de personne ;
--   * aucun trajet complet — une observation est un tronçon, pas un voyage.
-- On mesure un véhicule, pas un voyageur.
-- ---------------------------------------------------------------------------

create table if not exists public.line_observations (
  id uuid primary key default gen_random_uuid(),
  -- Code court de la ligne, normalisé en majuscules : « C1 », « A », « 20 ».
  line_id text not null,
  -- L'arrêt où l'observation commence, et l'heure de départ théorique associée.
  from_stop text not null,
  scheduled_at timestamptz not null,
  -- L'arrêt atteint, et le moment où il l'a été.
  to_stop text not null,
  observed_at timestamptz not null,
  -- L'écart en secondes entre le théorique et le constaté. Positif = en retard.
  delay_seconds integer not null,
  created_at timestamptz not null default now()
);

alter table public.line_observations enable row level security;

-- Ouvert en écriture comme le reste de l'application, qui n'a pas de comptes.
-- Le risque est celui d'un faux témoignage, pas d'une fuite : rien ici ne
-- désigne quiconque.
drop policy if exists "line_observations_anon_all" on public.line_observations;
create policy "line_observations_anon_all"
  on public.line_observations for all
  to anon, authenticated
  using (true)
  with check (true);

-- On ne lit jamais que le passé proche d'une ligne : l'index suit cet usage.
create index if not exists line_observations_line_time_idx
  on public.line_observations (line_id, observed_at desc);

-- ---------------------------------------------------------------------------
-- Purge.
--
-- Une observation vieille de deux heures ne dit plus rien du trafic présent, et
-- une base qui grossit sans fin finit par coûter. On ne garde que la journée,
-- le temps de pouvoir comparer un matin à un autre.
-- ---------------------------------------------------------------------------
create or replace function public.purge_line_observations() returns void as $$
  delete from public.line_observations where observed_at < now() - interval '24 hours';
$$ language sql;
