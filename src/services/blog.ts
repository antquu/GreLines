/**
 * Les articles du blog, côté lecture.
 *
 * Le site public ne fait qu'afficher : il lit ce que GreLines Management a
 * publié, et n'écrit jamais. Un brouillon ne lui est pas rendu, même si l'on
 * devine son adresse — c'est la base qui le refuse, pas le code.
 */

import { supabase } from './supabase';

export type BlockKind = 'paragraph' | 'heading' | 'image' | 'quote' | 'list';

/**
 * Un morceau de texte, éventuellement lié.
 *
 * L'éditeur produit du texte enrichi ; on le range en segments plutôt qu'en
 * HTML pour que le site n'ait jamais à injecter du balisage qu'il n'a pas
 * écrit. Un segment sans `href` est du texte ordinaire.
 */
export interface TextRun {
  text: string;
  href?: string;
  bold?: boolean;
  italic?: boolean;
}

export interface BlogBlock {
  type: BlockKind;
  /** Paragraphes, titres, citations. */
  text?: string;
  /** Le même texte, découpé quand il porte des liens ou des enrichissements. */
  runs?: TextRun[];
  /** Images. */
  url?: string;
  alt?: string;
  caption?: string;
  /** Citations. */
  attribution?: string;
  /** Listes. */
  items?: string[];
}

export interface BlogPost {
  id: string;
  slug: string;
  /** « both » : le même texte sert aux deux langues. */
  lang: 'fr' | 'en' | 'both';
  theme: string;
  kind: string;
  title: string;
  excerpt: string | null;
  heroUrl: string | null;
  heroAlt: string | null;
  /** La vignette carrée, montrée au survol dans la liste. Facultative. */
  squareUrl: string | null;
  squareAlt: string | null;
  body: BlogBlock[];
  publishedAt: string;
}

function toPost(row: any): BlogPost {
  return {
    id: String(row.id),
    slug: String(row.slug),
    lang: row.lang === 'en' ? 'en' : row.lang === 'both' ? 'both' : 'fr',
    theme: String(row.theme ?? ''),
    kind: String(row.kind ?? ''),
    title: String(row.title ?? ''),
    excerpt: row.excerpt ?? null,
    heroUrl: row.hero_url ?? null,
    heroAlt: row.hero_alt ?? null,
    squareUrl: row.square_url ?? null,
    squareAlt: row.square_alt ?? null,
    body: Array.isArray(row.body) ? (row.body as BlogBlock[]) : [],
    publishedAt: String(row.published_at ?? ''),
  };
}

const SELECT =
  'id, slug, lang, theme, kind, title, excerpt, hero_url, hero_alt, square_url, square_alt, body, published_at';

/**
 * Les mêmes colonnes, sans la vignette carrée.
 *
 * Le site est déployé avant que la migration ne soit passée en base, et une
 * requête qui demande une colonne absente échoue entièrement : la salle de
 * presse se retrouvait vide, sans rien pour dire pourquoi. On réessaie donc
 * sans elle plutôt que de tout perdre pour une vignette facultative.
 */
const SELECT_LEGACY =
  'id, slug, lang, theme, kind, title, excerpt, hero_url, hero_alt, body, published_at';

/** Vrai quand l'échec vient d'une colonne que la base ne connaît pas encore. */
function isMissingColumn(message: string | undefined): boolean {
  return /square_url|square_alt|column .* does not exist/i.test(String(message ?? ''));
}

/**
 * Les articles publiés, du plus récent au plus ancien.
 *
 * Rend une liste vide si la base n'est pas joignable : le blog paraît alors
 * vide, ce qui se lit mieux qu'un message d'erreur pour un contenu qui n'est
 * pas essentiel au service.
 */
export async function listPosts(lang: 'fr' | 'en'): Promise<BlogPost[]> {
  if (!supabase) return [];
  const query = (columns: string) =>
    supabase!
      .from('blog_posts')
      .select(columns)
      .in('lang', [lang, 'both'])
      .order('published_at', { ascending: false });

  try {
    let { data, error } = await query(SELECT);
    if (error && isMissingColumn(error.message)) ({ data, error } = await query(SELECT_LEGACY));
    if (error || !Array.isArray(data)) return [];
    return data.map(toPost);
  } catch {
    return [];
  }
}

/** Un article, ou `null` s'il n'existe pas ou n'est pas encore publié. */
export async function getPost(lang: 'fr' | 'en', slug: string): Promise<BlogPost | null> {
  if (!supabase) return null;
  const query = (columns: string) =>
    supabase!
      .from('blog_posts')
      .select(columns)
      .in('lang', [lang, 'both'])
      .eq('slug', slug)
      .maybeSingle();

  try {
    let { data, error } = await query(SELECT);
    if (error && isMissingColumn(error.message)) ({ data, error } = await query(SELECT_LEGACY));
    if (error || !data) return null;
    return toPost(data);
  } catch {
    return null;
  }
}

/** La date d'un article, écrite comme on l'écrit dans sa langue. */
export function formatPostDate(iso: string, lang: 'fr' | 'en'): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * La composition de la une.
 *
 * Cinq emplacements : la grande à gauche, puis quatre en colonne. En mode
 * automatique, ce sont les cinq plus récents — c'est ce qu'on veut neuf fois
 * sur dix, et cela ne demande aucun entretien. En mode manuel, la rédaction
 * choisit, emplacement par emplacement.
 *
 * Le mode manuel existe parce que « le plus récent » et « le plus important »
 * ne coïncident pas toujours : un communiqué de fond mérite parfois de rester en
 * une pendant qu'une note de version passe derrière.
 */
export interface FeaturedLayout {
  mode: 'auto' | 'manual';
  /** Les identifiants d'articles, dans l'ordre des emplacements. `null` = vide. */
  slots: Array<string | null>;
}

export const FEATURED_SLOTS = 5;
export const FEATURED_CONFIG_KEY = 'newsroom_featured';

const DEFAULT_LAYOUT: FeaturedLayout = {
  mode: 'auto',
  slots: Array.from({ length: FEATURED_SLOTS }, () => null),
};

export async function getFeaturedLayout(): Promise<FeaturedLayout> {
  if (!supabase) return DEFAULT_LAYOUT;
  try {
    const { data, error } = await supabase
      .from('site_config')
      .select('value')
      .eq('key', FEATURED_CONFIG_KEY)
      .maybeSingle();
    if (error || !data?.value) return DEFAULT_LAYOUT;
    const raw = data.value as Partial<FeaturedLayout>;
    const slots = Array.from({ length: FEATURED_SLOTS }, (_, index) => {
      const entry = Array.isArray(raw.slots) ? raw.slots[index] : null;
      return typeof entry === 'string' && entry ? entry : null;
    });
    return { mode: raw.mode === 'manual' ? 'manual' : 'auto', slots };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

/**
 * Les articles de la une, dans l'ordre des emplacements.
 *
 * En mode manuel, un emplacement vide ou pointant sur un article dépublié rend
 * `null` : la place reste, et la grille ne se réorganise pas dans le dos de la
 * rédaction. C'est voulu — un trou visible se corrige, un décalage silencieux
 * passe inaperçu.
 */
export function resolveFeatured(
  posts: BlogPost[],
  layout: FeaturedLayout,
): Array<BlogPost | null> {
  if (layout.mode === 'auto') {
    const lead = posts.find(post => post.heroUrl) ?? null;
    const rest = posts.filter(post => post.id !== lead?.id).slice(0, FEATURED_SLOTS - 1);
    return [lead, ...rest, ...Array(FEATURED_SLOTS).fill(null)].slice(0, FEATURED_SLOTS);
  }
  const byId = new Map(posts.map(post => [post.id, post]));
  return layout.slots.map(id => (id ? (byId.get(id) ?? null) : null));
}
