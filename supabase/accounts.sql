-- ---------------------------------------------------------------------------
-- Le compte GreLines.
--
-- Ce n'est pas un compte au sens habituel : ni mot de passe, ni adresse
-- électronique, ni possibilité de se connecter ailleurs. C'est un nom d'usage
-- accroché à une carte OURA — celle qu'on a déjà, qu'on présente au valideur —
-- et un compteur de ce qu'on a rendu aux autres voyageurs.
--
-- La carte sert de clé parce qu'elle existe déjà et qu'elle est unique. Créer un
-- identifiant de plus aurait demandé un mot de passe à retenir pour afficher un
-- pseudonyme, ce qui n'a aucun sens.
--
-- Le prénom et le nom viennent de la carte et ne se modifient pas : ce sont ceux
-- que le réseau connaît. Seuls le pseudonyme et l'avatar sont choisis, et encore,
-- parmi des valeurs tirées au sort — voir plus bas.
-- ---------------------------------------------------------------------------

create table if not exists public.oura_accounts (
  -- Le numéro de carte, en clé : un compte par carte, une carte par compte.
  card_code text primary key,

  -- Recopiés de la carte au moment de la création, pour que le profil reste
  -- lisible même si la carte est retirée du portefeuille.
  first_name text,
  last_name text,

  -- Le nom d'usage, montré aux autres. Unique, parce qu'il désigne quelqu'un.
  pseudo text not null unique,

  /*
   * L'avatar : un émoji, ou rien.
   *
   * Rien signifie « la photo de la carte ». Aucune image ne se dépose : ni
   * envoi, ni recadrage, ni modération à faire. Un émoji tiré au sort ne peut
   * pas être une insulte, et c'est la seule façon d'ouvrir les avatars à tous
   * sans employer quelqu'un à les regarder.
   */
  avatar_emoji text,

  -- Ce que le voyageur a rendu. Tenu ici plutôt que sur l'appareil pour qu'un
  -- changement de téléphone ne remette pas le compteur à zéro.
  points integer not null default 0,
  trips integer not null default 0,
  travellers_helped integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.oura_accounts enable row level security;

/*
 * Ouvert, comme le reste de l'application, qui n'a pas d'authentification.
 *
 * Ce que la table contient a été choisi en conséquence : un pseudonyme, un
 * émoji, trois compteurs. Le prénom et le nom y figurent parce qu'ils sont déjà
 * dans `oura_cards`, sur la même base et sous la même règle — cette table
 * n'ouvre donc rien de plus qu'elle.
 */
drop policy if exists "oura_accounts_anon_all" on public.oura_accounts;
create policy "oura_accounts_anon_all"
  on public.oura_accounts for all
  to anon, authenticated
  using (true)
  with check (true);

-- On cherche un pseudonyme pour vérifier qu'il est libre : l'index sert à ça.
create unique index if not exists oura_accounts_pseudo_idx
  on public.oura_accounts (lower(pseudo));

/*
 * Créditer un trajet sans lire d'abord.
 *
 * Deux appareils sur la même carte — un téléphone et une tablette — feraient
 * chacun « lire, additionner, écrire » et le second effacerait le premier.
 * L'incrément se fait donc côté base, en une seule instruction.
 */
create or replace function public.credit_oura_account(
  p_card_code text,
  p_points integer,
  p_trips integer,
  p_helped integer
) returns void as $$
  update public.oura_accounts
     set points = points + coalesce(p_points, 0),
         trips = trips + coalesce(p_trips, 0),
         travellers_helped = travellers_helped + coalesce(p_helped, 0),
         updated_at = now()
   where card_code = p_card_code;
$$ language sql;
