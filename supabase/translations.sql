-- ---------------------------------------------------------------------------
-- Le cache des traductions.
--
-- L'infotrafic et le message du bandeau sont écrits en français par les
-- réseaux. Les afficher tels quels à quelqu'un qui lit l'anglais revient à ne
-- rien afficher du tout — et c'est justement le moment où l'information compte,
-- puisqu'une perturbation change un trajet.
--
-- Traduire à la volée à chaque affichage était exclu : le service de traduction
-- compte les mots, et une seule perturbation relue vingt fois dans la journée
-- par cent personnes consommerait le quota d'un mois. La traduction d'un texte
-- ne dépend que de ce texte : on la calcule une fois, on la range ici, et tout
-- le monde la relit ensuite gratuitement.
--
-- Ce que la table NE contient PAS :
--   * aucun identifiant de personne, d'appareil ou de session ;
--   * aucune trace de qui a demandé la traduction ni de quand elle a été lue.
-- Ce sont des textes publics, publiés par les réseaux, et rien d'autre.
-- ---------------------------------------------------------------------------

create table if not exists public.translations (
  -- L'empreinte du texte source et de la langue visée. C'est la clé naturelle :
  -- deux perturbations au libellé identique partagent leur traduction, ce qui
  -- arrive tout le temps — « Travaux, arrêt non desservi » revient chaque
  -- semaine sur une ligne différente.
  key text primary key,

  source_lang text not null default 'fr',
  target_lang text not null,

  -- Le texte d'origine, conservé pour pouvoir relire ce qui a été traduit et
  -- rejouer une traduction douteuse sans attendre que la perturbation revienne.
  source_text text not null,
  translated_text text not null,

  created_at timestamptz not null default now(),

  -- La dernière fois qu'un texte identique a été affiché quelque part.
  --
  -- C'est ce qui permet d'effacer : une perturbation terminée cesse d'être
  -- publiée par le réseau, donc cesse d'être demandée, et sa ligne vieillit
  -- jusqu'à la purge. On ne peut pas supprimer sur le seul constat qu'un
  -- navigateur ne voit plus un texte — il n'affiche que les réseaux qu'il a
  -- cochés, et il effacerait le travail fait pour les autres.
  last_seen_at timestamptz not null default now()
);

create index if not exists translations_last_seen_idx
  on public.translations (last_seen_at);

-- ---------------------------------------------------------------------------
-- Accès.
--
-- Lecture et écriture ouvertes au rôle anonyme, comme le reste des tables du
-- projet : il n'y a pas de compte à protéger ici, et la donnée est publique par
-- nature. La suppression est réservée à la fonction de purge ci-dessous, pour
-- qu'un client ne puisse pas vider le cache des autres.
-- ---------------------------------------------------------------------------

alter table public.translations enable row level security;

drop policy if exists translations_read on public.translations;
create policy translations_read on public.translations
  for select using (true);

drop policy if exists translations_insert on public.translations;
create policy translations_insert on public.translations
  for insert with check (true);

drop policy if exists translations_touch on public.translations;
create policy translations_touch on public.translations
  for update using (true) with check (true);

-- ---------------------------------------------------------------------------
-- La purge.
--
-- Quatorze jours sans qu'aucun affichage n'ait redemandé ce texte : la
-- perturbation qu'il décrivait est finie depuis longtemps. Le délai est large à
-- dessein — une perturbation saisonnière qui revient chaque été retrouve sa
-- traduction si elle revient vite, et la recalcule sinon, ce qui ne coûte
-- qu'un appel.
--
-- À appeler depuis un travail planifié (`pg_cron`, ou l'appel manuel
-- `select public.purge_translations();`).
-- ---------------------------------------------------------------------------

create or replace function public.purge_translations()
returns integer
language sql
security definer
set search_path = public
as $$
  with gone as (
    delete from public.translations
    where last_seen_at < now() - interval '14 days'
    returning 1
  )
  select count(*)::int from gone;
$$;

-- Purge quotidienne, si l'extension est disponible sur le projet.
-- select cron.schedule('purge-translations', '0 4 * * *', $$select public.purge_translations()$$);
