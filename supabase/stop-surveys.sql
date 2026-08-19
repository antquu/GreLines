-- ---------------------------------------------------------------------------
-- Avis sur les arrêts.
--
-- Les enquêtes existantes portent sur un véhicule : propreté, confort,
-- affluence. Mais on passe autant de temps à attendre qu'à rouler, et l'attente
-- a ses propres défauts — un afficheur éteint, un abri cassé, un quai qu'on ne
-- traverse pas sereinement la nuit. Rien ne les remontait.
--
-- Ces avis se recueillent pendant l'attente, quand on a l'arrêt sous les yeux :
-- c'est le seul moment où l'on sait si l'afficheur marche.
--
-- Anonyme comme le reste : ni compte, ni identifiant d'appareil. L'arrêt est un
-- lieu public, et savoir que quelqu'un attendait à La Poya à 8 h n'apprend rien
-- sur personne.
-- ---------------------------------------------------------------------------

create table if not exists public.stop_surveys (
  id uuid primary key default gen_random_uuid(),
  -- Identifiant de poteau tel que le réseau le nomme : « SEM:2109 ».
  stop_id text not null,
  -- Le nom au moment de l'avis : les arrêts sont renommés, et un avis de l'an
  -- dernier doit rester lisible sans avoir à retrouver l'ancien libellé.
  stop_name text,

  -- Les trois paliers du questionnaire, sur l'échelle 1 / 3 / 5 des enquêtes
  -- véhicule, pour que les deux se comparent.
  display_readable smallint,
  shelter_condition smallint,
  feels_safe smallint,

  comment text,
  answered_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.stop_surveys enable row level security;

drop policy if exists "stop_surveys_anon_all" on public.stop_surveys;
create policy "stop_surveys_anon_all"
  on public.stop_surveys for all
  to anon, authenticated
  using (true)
  with check (true);

-- On lit toujours les avis d'un arrêt, du plus récent au plus ancien.
create index if not exists stop_surveys_stop_time_idx
  on public.stop_surveys (stop_id, answered_at desc);
