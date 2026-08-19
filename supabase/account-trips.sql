-- ---------------------------------------------------------------------------
-- L'historique des trajets d'un compte.
--
-- Le profil annonçait « 47 trajets » sans pouvoir en montrer un seul. Un
-- compteur qu'on ne peut pas ouvrir ne veut rien dire : on ne sait pas s'il
-- compte juste, ni ce qu'il a compté.
--
-- Chaque trajet terminé s'enregistre donc ici, avec de quoi le redessiner : ses
-- tronçons en transport et le tracé qu'on a suivi.
--
-- Ce qui n'y figure pas, et ne doit pas y figurer : la marche. Le premier et le
-- dernier segment à pied partent de chez les gens et y reviennent. Les garder
-- reviendrait à tenir un journal des adresses de chacun, ce qu'aucun compteur de
-- points ne justifie. Le tracé stocké commence donc au premier quai et s'arrête
-- au dernier.
-- ---------------------------------------------------------------------------

create table if not exists public.oura_account_trips (
  id uuid primary key default gen_random_uuid(),
  -- La carte qui porte le compte, comme dans `oura_accounts`.
  card_code text not null,

  -- De quoi nommer le trajet dans une liste, sans avoir à le déplier.
  origin text,
  destination text,
  started_at timestamptz,
  ended_at timestamptz,

  /*
   * Les tronçons en transport : ligne, quai de montée, quai de descente, heures.
   * Même forme que `trip_surveys.journey`, pour qu'un avis et un trajet se
   * lisent de la même façon.
   */
  legs jsonb not null default '[]'::jsonb,

  /*
   * Le tracé, en couples [lon, lat], déjà allégé côté application.
   *
   * On garde la géométrie plutôt que de la recalculer : un itinéraire recalculé
   * six mois plus tard ne suit pas forcément le même chemin — les lignes sont
   * déviées, les arrêts déplacés — et l'historique doit montrer le trajet qu'on
   * a fait, pas celui qu'on ferait aujourd'hui.
   */
  path jsonb not null default '[]'::jsonb,

  -- Ce que ce trajet a rapporté, pour que le détail explique le total.
  points integer not null default 0,
  travellers_helped integer not null default 0,

  created_at timestamptz not null default now()
);

alter table public.oura_account_trips enable row level security;

drop policy if exists "oura_account_trips_anon_all" on public.oura_account_trips;
create policy "oura_account_trips_anon_all"
  on public.oura_account_trips for all
  to anon, authenticated
  using (true)
  with check (true);

-- On lit toujours l'historique d'un compte, du plus récent au plus ancien.
create index if not exists oura_account_trips_card_time_idx
  on public.oura_account_trips (card_code, created_at desc);
