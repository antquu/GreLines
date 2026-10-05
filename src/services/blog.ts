import { supabase } from './supabase';
import { tx } from '../i18n';

export type BlockKind = 'paragraph' | 'heading' | 'image' | 'quote' | 'list';

export interface TextRun {
  text: string;
  href?: string;
  bold?: boolean;
  italic?: boolean;
}

export interface BlogBlock {
  type: BlockKind;
  text?: string;
  runs?: TextRun[];
  url?: string;
  alt?: string;
  caption?: string;
  attribution?: string;
  items?: string[];
}

export interface BlogPost {
  id: string;
  slug: string;
  lang: 'fr' | 'en' | 'both';
  theme: string;
  kind: string;
  title: string;
  excerpt: string | null;
  heroUrl: string | null;
  heroAlt: string | null;
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

const SELECT_LEGACY =
  'id, slug, lang, theme, kind, title, excerpt, hero_url, hero_alt, body, published_at';

function isMissingColumn(message: string | undefined): boolean {
  return /square_url|square_alt|column .* does not exist/i.test(String(message ?? ''));
}

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

export function formatPostDate(iso: string, lang: 'fr' | 'en'): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(tx(lang === 'fr').blog.locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export interface FeaturedLayout {
  mode: 'auto' | 'manual';
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
