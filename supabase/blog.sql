-- ---------------------------------------------------------------------------
-- Les articles du blog.
--
-- Des communiqués : une nouveauté, un réseau qui rejoint l'application, une
-- panne expliquée après coup. Ils s'écrivent dans GreLines Management et se
-- lisent sur le site public, qui ne fait que les afficher.
--
-- Le corps est un tableau de blocs plutôt qu'un bloc de HTML. C'est délibéré :
--   * le site public n'a jamais à injecter du HTML qu'il n'a pas écrit, donc
--     pas de faille par un article mal collé depuis un traitement de texte ;
--   * la mise en forme reste celle du site, quel que soit ce que l'éditeur
--     avait dans le presse-papier ;
--   * un bloc inconnu d'une version plus ancienne du site est simplement
--     ignoré, au lieu de casser la page.
--
-- Un bloc ressemble à :
--   { "type": "paragraph", "text": "…", "marks": [{ "text": "…", "href": "…" }] }
--   { "type": "heading",   "text": "…" }
--   { "type": "image",     "url": "…", "alt": "…", "caption": "…" }
--   { "type": "quote",     "text": "…", "attribution": "…" }
--   { "type": "list",      "items": ["…", "…"] }
-- ---------------------------------------------------------------------------

create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),

  -- L'adresse de l'article : `/fr/blog/<slug>`. Unique par langue, pas
  -- globalement — la version anglaise d'un article porte le même slug.
  slug text not null,
  lang text not null default 'fr' check (lang in ('fr', 'en')),

  -- Les deux étiquettes du haut : de quoi ça parle, et quelle sorte de texte
  -- c'est. « Produit » et « Annonce », par exemple.
  theme text not null default 'Produit',
  kind text not null default 'Annonce',

  title text not null,
  -- Deux phrases pour la liste des articles et pour les aperçus partagés.
  excerpt text,

  -- L'image de tête, en 16:9. Facultative : un communiqué court se passe
  -- d'illustration mieux qu'il ne s'accommode d'une image générique.
  hero_url text,
  hero_alt text,

  body jsonb not null default '[]'::jsonb,

  -- Nul tant que l'article est un brouillon. C'est cette colonne, et elle
  -- seule, qui décide de ce que le site public montre.
  published_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists blog_posts_slug_lang_idx
  on public.blog_posts (slug, lang);

create index if not exists blog_posts_published_idx
  on public.blog_posts (lang, published_at desc);

-- ---------------------------------------------------------------------------
-- Accès.
--
-- Le site public lit les articles publiés, et rien d'autre : un brouillon reste
-- invisible même si l'on devine son adresse. L'écriture passe par le rôle de
-- service, dont GreLines Management dispose et pas les navigateurs.
-- ---------------------------------------------------------------------------

alter table public.blog_posts enable row level security;

drop policy if exists blog_posts_read_published on public.blog_posts;
create policy blog_posts_read_published on public.blog_posts
  for select using (published_at is not null and published_at <= now());

-- La date de modification suit toute écriture, sans que l'éditeur ait à y penser.
create or replace function public.touch_blog_post()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists blog_posts_touch on public.blog_posts;
create trigger blog_posts_touch
  before update on public.blog_posts
  for each row execute function public.touch_blog_post();

-- ---------------------------------------------------------------------------
-- L'écriture.
--
-- Le site public et l'application de gestion partagent la même clé anonyme :
-- ouvrir l'écriture au rôle anonyme reviendrait à laisser publier sur le blog
-- quiconque a ouvert le site. Les écritures passent donc par des fonctions
-- `security definer` qui vérifient le compte demandeur, comme le fait déjà la
-- gestion des comptes du CRM. La table elle-même est retirée au rôle anonyme
-- pour tout ce qui n'est pas la lecture d'un article publié.
--
-- Ces fonctions supposent `crm_users` et `crm_role_of`, définis par le schéma
-- de GreLines Management.
-- ---------------------------------------------------------------------------

revoke insert, update, delete on public.blog_posts from anon, authenticated;

/* Rédiger, publier et dépublier : à partir du rôle « editor ». */
create or replace function public.crm_assert_can_write_blog(p_actor_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  actor_role text;
begin
  select role into actor_role from public.crm_users where id = p_actor_id;
  if actor_role is null then
    raise exception 'Compte demandeur inconnu.' using errcode = '42501';
  end if;
  if actor_role not in ('superadmin', 'admin', 'editor') then
    raise exception 'Droits insuffisants pour écrire au blog.' using errcode = '42501';
  end if;
end;
$$;

/*
 * Enregistre un article, qu'il soit neuf ou repris.
 *
 * Un seul point d'entrée pour les deux : l'éditeur n'a pas à savoir s'il crée
 * ou s'il modifie, et l'identifiant renvoyé lui sert ensuite d'ancre.
 */
create or replace function public.crm_blog_save(
  p_actor_id uuid,
  p_id uuid,
  p_slug text,
  p_lang text,
  p_theme text,
  p_kind text,
  p_title text,
  p_excerpt text,
  p_hero_url text,
  p_hero_alt text,
  p_body jsonb,
  p_published_at timestamptz
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  saved uuid;
begin
  perform public.crm_assert_can_write_blog(p_actor_id);

  if p_id is null then
    insert into public.blog_posts
      (slug, lang, theme, kind, title, excerpt, hero_url, hero_alt, body, published_at)
    values
      (p_slug, p_lang, p_theme, p_kind, p_title, p_excerpt, p_hero_url, p_hero_alt,
       coalesce(p_body, '[]'::jsonb), p_published_at)
    returning id into saved;
  else
    update public.blog_posts set
      slug = p_slug,
      lang = p_lang,
      theme = p_theme,
      kind = p_kind,
      title = p_title,
      excerpt = p_excerpt,
      hero_url = p_hero_url,
      hero_alt = p_hero_alt,
      body = coalesce(p_body, '[]'::jsonb),
      published_at = p_published_at
    where id = p_id
    returning id into saved;
  end if;

  return saved;
end;
$$;

/* Les articles vus par la gestion : brouillons compris, du plus récent. */
create or replace function public.crm_blog_list(p_actor_id uuid)
returns setof public.blog_posts
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.crm_assert_can_write_blog(p_actor_id);
  return query
    select * from public.blog_posts
    order by coalesce(published_at, updated_at) desc;
end;
$$;

create or replace function public.crm_blog_delete(p_actor_id uuid, p_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.crm_assert_can_write_blog(p_actor_id);
  delete from public.blog_posts where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Le seau des images d'articles.
--
-- Public en lecture : une illustration d'article est faite pour être vue par
-- tout le monde, et une adresse signée qui expire obligerait le site public à
-- redemander une signature à chaque affichage.
--
-- L'écriture reste ouverte au rôle anonyme, faute de mieux : le stockage
-- Supabase ne connaît pas nos comptes CRM, et les politiques de seau ne peuvent
-- donc pas les interroger. Le risque est réel mais borné — on peut déposer un
-- fichier, pas le rattacher à un article, puisque les articles passent par les
-- fonctions vérifiées plus haut. Un dépôt sauvage reste une image orpheline que
-- personne ne voit.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('blog', 'blog', true)
on conflict (id) do update set public = true;

drop policy if exists blog_images_read on storage.objects;
create policy blog_images_read on storage.objects
  for select using (bucket_id = 'blog');

drop policy if exists blog_images_write on storage.objects;
create policy blog_images_write on storage.objects
  for insert with check (bucket_id = 'blog');

-- ---------------------------------------------------------------------------
-- Un article peut valoir pour les deux langues.
--
-- Beaucoup de communiqués n'ont pas besoin d'être réécrits : le nom d'un réseau
-- qui rejoint l'application, une date de mise en service, un chiffre. Les
-- publier deux fois obligerait à les corriger deux fois, et l'une des deux
-- copies finirait toujours par dater.
--
-- « both » est donc une troisième valeur, pas une paire de lignes : un article,
-- une adresse, un texte, rendu aux lecteurs des deux langues.
-- ---------------------------------------------------------------------------

alter table public.blog_posts drop constraint if exists blog_posts_lang_check;
alter table public.blog_posts
  add constraint blog_posts_lang_check check (lang in ('fr', 'en', 'both'));

-- ---------------------------------------------------------------------------
-- La vignette carrée.
--
-- Dans la liste des actualités, survoler une ligne fait paraître une image
-- carrée sur le côté. Ce n'est pas l'image de tête recadrée : une photo pensée
-- en 16:9 perd son sujet dès qu'on la ramène au carré, et l'on se retrouve avec
-- un morceau de ciel. C'est donc un second fichier, facultatif — sans lui, rien
-- ne paraît au survol, ce qui vaut mieux qu'un cadrage raté.
-- ---------------------------------------------------------------------------

alter table public.blog_posts add column if not exists square_url text;
alter table public.blog_posts add column if not exists square_alt text;

-- La signature change : Postgres traiterait l'ajout d'un paramètre comme une
-- surcharge, et les deux versions coexisteraient. On retire l'ancienne.
drop function if exists public.crm_blog_save(uuid, uuid, text, text, text, text, text, text, text, text, jsonb, timestamptz);

create or replace function public.crm_blog_save(
  p_actor_id uuid,
  p_id uuid,
  p_slug text,
  p_lang text,
  p_theme text,
  p_kind text,
  p_title text,
  p_excerpt text,
  p_hero_url text,
  p_hero_alt text,
  p_square_url text,
  p_square_alt text,
  p_body jsonb,
  p_published_at timestamptz
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  saved uuid;
begin
  perform public.crm_assert_can_write_blog(p_actor_id);

  if p_id is null then
    insert into public.blog_posts
      (slug, lang, theme, kind, title, excerpt, hero_url, hero_alt,
       square_url, square_alt, body, published_at)
    values
      (p_slug, p_lang, p_theme, p_kind, p_title, p_excerpt, p_hero_url, p_hero_alt,
       p_square_url, p_square_alt, coalesce(p_body, '[]'::jsonb), p_published_at)
    returning id into saved;
  else
    update public.blog_posts set
      slug = p_slug,
      lang = p_lang,
      theme = p_theme,
      kind = p_kind,
      title = p_title,
      excerpt = p_excerpt,
      hero_url = p_hero_url,
      hero_alt = p_hero_alt,
      square_url = p_square_url,
      square_alt = p_square_alt,
      body = coalesce(p_body, '[]'::jsonb),
      published_at = p_published_at
    where id = p_id
    returning id into saved;
  end if;

  return saved;
end;
$$;

-- ---------------------------------------------------------------------------
-- Les deux champs de la vignette deviennent facultatifs à l'appel.
--
-- PostgREST choisit la fonction d'après l'ensemble exact des noms d'arguments
-- reçus. La gestion envoyait `p_square_url` sans `p_square_alt` : treize clés
-- pour une fonction qui en déclarait quatorze, aucune correspondance, et un
-- message qui affirmait que la fonction n'existait pas alors qu'elle était là.
--
-- Un défaut sur chacun des deux règle le cas pour de bon : un client qui les
-- omet, un client qui n'en envoie qu'un, un client qui envoie les deux, les
-- trois atteignent la même fonction. C'est ce qu'on veut d'un point d'entrée
-- appelé par un éditeur qui évolue de son côté.
--
-- `create or replace` suffit : les noms et les types ne changent pas, seuls
-- les défauts s'ajoutent, donc il n'y a pas de surcharge à retirer.
-- ---------------------------------------------------------------------------

create or replace function public.crm_blog_save(
  p_actor_id uuid,
  p_id uuid,
  p_slug text,
  p_lang text,
  p_theme text,
  p_kind text,
  p_title text,
  p_excerpt text,
  p_hero_url text,
  p_hero_alt text,
  p_body jsonb,
  p_published_at timestamptz,
  p_square_url text default null,
  p_square_alt text default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  saved uuid;
begin
  perform public.crm_assert_can_write_blog(p_actor_id);

  if p_id is null then
    insert into public.blog_posts
      (slug, lang, theme, kind, title, excerpt, hero_url, hero_alt,
       square_url, square_alt, body, published_at)
    values
      (p_slug, p_lang, p_theme, p_kind, p_title, p_excerpt, p_hero_url, p_hero_alt,
       p_square_url, p_square_alt, coalesce(p_body, '[]'::jsonb), p_published_at)
    returning id into saved;
  else
    update public.blog_posts set
      slug = p_slug,
      lang = p_lang,
      theme = p_theme,
      kind = p_kind,
      title = p_title,
      excerpt = p_excerpt,
      hero_url = p_hero_url,
      hero_alt = p_hero_alt,
      square_url = p_square_url,
      square_alt = p_square_alt,
      body = coalesce(p_body, '[]'::jsonb),
      published_at = p_published_at
    where id = p_id
    returning id into saved;
  end if;

  return saved;
end;
$$;

-- Les paramètres facultatifs passent en fin de liste : Postgres l'exige, un
-- argument à défaut ne peut pas précéder un argument sans défaut. L'ancienne
-- fonction, où ils étaient au milieu, doit donc être retirée, sans quoi les
-- deux coexisteraient et l'appel redeviendrait ambigu.
drop function if exists public.crm_blog_save(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text, jsonb, timestamptz
);

-- Le cache de schéma est relu : sans cela, PostgREST continuerait d'ignorer la
-- nouvelle signature pendant quelques minutes.
notify pgrst, 'reload schema';
