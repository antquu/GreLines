-- ---------------------------------------------------------------------------
-- Signalements d'un tap : ce que l'API ne dira jamais.
--
-- Le réseau publie des horaires et un profil d'affluence moyen. Il ne publie
-- pas ce qui décide vraiment de monter ou d'attendre le suivant : ce bus-ci
-- est-il plein *maintenant*, le tram annoncé est-il seulement passé, la rampe
-- fonctionne-t-elle ce matin. Ces trois-là ne se mesurent que sur place, et
-- seuls les voyageurs sont sur place.
--
-- Un signalement est donc un geste unique — une carte touchée dans le bandeau
-- de guidage — et rien d'autre. Agrégés par arrêt, par ligne et par tranche de
-- quart d'heure, ils donnent une pastille verte, orange ou rouge sur les
-- prochains passages, avec le nombre d'avis qui la soutiennent.
--
-- Ce que la table NE contient PAS, comme `line_observations` :
--   * aucune coordonnée GPS ;
--   * aucun identifiant d'appareil ni de compte ;
--   * aucun trajet — un signalement est un instant, pas un déplacement.
-- ---------------------------------------------------------------------------

create table if not exists public.crowd_signals (
  id uuid primary key default gen_random_uuid(),

  -- Ce sur quoi porte le signalement :
  --   'crowding' — remplissage constaté à bord ou à la montée ;
  --   'delay'    — retard ressenti par rapport à l'affichage ;
  --   'ghost'    — le passage annoncé est-il passé, ou s'est-il évaporé ;
  --   'access'   — rampe, ascenseur, plancher bas : l'accès réel du jour.
  kind text not null check (kind in ('crowding', 'delay', 'ghost', 'access')),

  -- Code court de ligne normalisé (« C1 », « A », « 20 »), quand le
  -- signalement porte sur un véhicule. Nul pour ce qui ne concerne que le quai.
  line_id text,
  -- Identifiant de poteau tel que le réseau le nomme (« SEM:2109 »).
  stop_id text,
  stop_name text,

  -- Toujours dans le même sens, quel que soit le sujet :
  --   1 = mauvais (plein, en retard, fantôme, accès hors service)
  --   2 = moyen
  --   3 = bon (des places, à l'heure, bien passé, accès praticable)
  -- Une échelle unique pour quatre questions permet d'en faire une note.
  value smallint not null check (value between 1 and 3),

  -- La tranche horaire, précalculée : jour de la semaine × 96 + quart d'heure.
  -- Un tram bondé à 8 h 15 le mardi l'est tous les mardis à 8 h 15 ; c'est cette
  -- comparaison-là qu'on veut pouvoir faire sans recalculer la date à la lecture.
  slot_bucket smallint not null,

  reported_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.crowd_signals enable row level security;

-- Ouvert en écriture comme le reste de l'application, qui n'a pas de comptes.
-- Le risque est celui d'un faux témoignage — traité par le nombre, à la lecture
-- — et non celui d'une fuite : rien ici ne désigne quiconque.
drop policy if exists "crowd_signals_anon_all" on public.crowd_signals;
create policy "crowd_signals_anon_all"
  on public.crowd_signals for all
  to anon, authenticated
  using (true)
  with check (true);

-- Deux lectures, deux index : ce qui vient d'être signalé à un arrêt, et ce
-- qu'on y signale d'habitude à cette heure-ci.
create index if not exists crowd_signals_stop_time_idx
  on public.crowd_signals (stop_id, reported_at desc);
create index if not exists crowd_signals_line_time_idx
  on public.crowd_signals (line_id, reported_at desc);
create index if not exists crowd_signals_slot_idx
  on public.crowd_signals (slot_bucket, line_id, reported_at desc);

-- ---------------------------------------------------------------------------
-- Purge.
--
-- L'habitude se lit sur quelques semaines : au-delà, l'offre a changé de
-- version d'horaires et l'on comparerait deux réseaux différents.
-- ---------------------------------------------------------------------------
create or replace function public.purge_crowd_signals() returns void as $$
  delete from public.crowd_signals where reported_at < now() - interval '60 days';
$$ language sql;
