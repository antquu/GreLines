/**
 * Le blog : la liste des communiqués, et un communiqué.
 *
 * La forme est celle d'un communiqué de presse, pas d'un billet de journal
 * intime : les deux étiquettes d'abord — de quoi ça parle, quelle sorte de
 * texte c'est —, le titre en grand, la date, l'image de tête, puis une colonne
 * de lecture étroite. On sait avant de commencer si le texte nous concerne.
 *
 * Tout est en Inter, y compris le corps. Un empattement dans le texte long
 * aurait sa logique, mais l'application entière est en Inter et un blog qui
 * change de police se lit comme s'il appartenait à quelqu'un d'autre.
 *
 * Le corps arrive en blocs, jamais en HTML : le site n'injecte pas du balisage
 * qu'il n'a pas écrit, et la mise en forme reste la sienne quel que soit ce que
 * l'auteur avait dans son presse-papier.
 */

import { useEffect, useState } from 'react';
import './landing.css';
import { LandingHeader } from './LandingHeader';
import { LandingFooter } from './LandingFooter';
import {
  listPosts,
  getPost,
  formatPostDate,
  getFeaturedLayout,
  resolveFeatured,
  FEATURED_SLOTS,
  type BlogBlock,
  type BlogPost,
  type FeaturedLayout,
} from '../services/blog';

type Lang = 'fr' | 'en';
type Theme = 'light' | 'dark';

const THEME_KEY = 'greLines_landingTheme';

function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Les deux étiquettes du haut, séparées par un point médian. */
function Subjects({ theme, kind }: { theme: string; kind: string }) {
  const parts = [theme, kind].filter(Boolean);
  if (parts.length === 0) return null;
  return <p className="text-sm font-semibold">{parts.join(' · ')}</p>;
}

/** Un segment de texte, lié ou non. */
function Runs({ block }: { block: BlogBlock }) {
  if (!block.runs || block.runs.length === 0) return <>{block.text ?? ''}</>;
  return (
    <>
      {block.runs.map((run, index) => {
        const content = (
          <span
            style={{
              fontWeight: run.bold ? 600 : undefined,
              fontStyle: run.italic ? 'italic' : undefined,
            }}
          >
            {run.text}
          </span>
        );
        if (!run.href) return <span key={index}>{content}</span>;
        const external = /^https?:/i.test(run.href);
        return (
          <a
            key={index}
            href={run.href}
            className="landing-link underline underline-offset-2"
            {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
          >
            {content}
          </a>
        );
      })}
    </>
  );
}

/** Un bloc du corps. Un type inconnu est ignoré plutôt que de casser la page. */
function Block({ block }: { block: BlogBlock }) {
  switch (block.type) {
    case 'heading':
      return <h2 className="landing-subtitle mt-12">{block.text}</h2>;
    case 'image':
      return block.url ? (
        <figure className="my-10">
          <img
            src={block.url}
            alt={block.alt ?? ''}
            className="w-full rounded-xl border border-[var(--line)]"
          />
          {block.caption && (
            <figcaption className="landing-body mt-3 text-sm">{block.caption}</figcaption>
          )}
        </figure>
      ) : null;
    case 'quote':
      return (
        <blockquote className="my-10 border-l-2 border-[var(--fg)] pl-6">
          <p className="landing-lead">{block.text}</p>
          {block.attribution && (
            <p className="landing-body mt-3 text-sm">{block.attribution}</p>
          )}
        </blockquote>
      );
    case 'list':
      return (
        <ul className="my-6 flex flex-col gap-3">
          {(block.items ?? []).map((item, index) => (
            <li key={index} className="landing-body pl-5 -indent-5">
              <span aria-hidden className="pr-2">·</span>
              {item}
            </li>
          ))}
        </ul>
      );
    case 'paragraph':
      return (
        <p className="landing-body mt-6">
          <Runs block={block} />
        </p>
      );
    default:
      return null;
  }
}

/** Le cadre commun : en-tête, contenu, pied. */
function Shell({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  /*
   * Le thème, tenu comme sur la page d'accueil : « auto » suit le système, les
   * deux autres l'emportent et sont retenus.
   */
  const [choice, setChoice] = useState<'auto' | Theme>(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'auto') return stored;
    } catch { /* navigation privée */ }
    return 'auto';
  });
  const theme: Theme = choice === 'auto' ? systemTheme() : choice;
  const chooseTheme = (next: 'auto' | Theme) => {
    setChoice(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* ignoré */ }
  };

  return (
    <div className="landing" data-theme={theme}>
      <div className="landing-surface">
        <LandingHeader lang={lang} theme={theme} />
        {children}
        <LandingFooter lang={lang} theme={theme} choice={choice} onChoose={chooseTheme} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ liste */

/**
 * La salle de presse.
 *
 * Trois étages, dans cet ordre : le titre avec les contacts en regard, la une
 * avec les communiqués récents à côté, puis la liste complète en tableau.
 *
 * L'agencement vient de ce qu'on y cherche. Un journaliste qui arrive veut une
 * adresse à qui écrire, tout de suite et sans la chercher : elle est donc en
 * haut, avant tout contenu. Quelqu'un qui suit le produit veut la dernière
 * nouvelle : elle est en grand, avec son image, et les quatre suivantes se
 * lisent à côté sans faire défiler. Quelqu'un qui cherche une annonce précise
 * veut balayer des dates : le tableau la lui donne, une ligne par communiqué.
 */

export function BlogIndex({ lang }: { lang: Lang }) {
  const [posts, setPosts] = useState<BlogPost[] | null>(null);
  const [query, setQuery] = useState('');
  /** La ligne survolée, dont la vignette carrée paraît sur le côté. */
  const [hovered, setHovered] = useState<BlogPost | null>(null);
  /* La composition de la une, choisie en gestion. Automatique par défaut. */
  const [layout, setLayout] = useState<FeaturedLayout>({
    mode: 'auto',
    slots: Array.from({ length: FEATURED_SLOTS }, () => null),
  });
  const isFr = lang === 'fr';

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = 'Newsroom \\ GreLines';
    let active = true;
    listPosts(lang).then(result => {
      if (active) setPosts(result);
    });
    getFeaturedLayout().then(result => {
      if (active) setLayout(result);
    });
    return () => {
      active = false;
    };
  }, [lang]);

  /*
   * La une, puis quatre en colonne, puis le reste en tableau.
   *
   * La une doit porter une image : c'est elle qui tient la moitié gauche, et
   * sans image il n'y a rien à tenir. Les quatre suivantes s'en passent — elles
   * se lisent au titre et à la phrase de résumé.
   */
  const all = posts ?? [];
  const featured = resolveFeatured(all, layout);
  const lead = featured[0];
  const secondary = featured.slice(1).filter((post): post is BlogPost => post !== null);
  const promoted = new Set(featured.filter(Boolean).map(post => post!.id));

  const listed = all.filter(post => {
    if (promoted.has(post.id)) return false;
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return [post.title, post.theme, post.kind, post.excerpt ?? '']
      .join(' ')
      .toLowerCase()
      .includes(needle);
  });

  return (
    <Shell lang={lang}>
      <main className="pb-32">
        {/* ─── En-tête : le titre, et à qui écrire ─────────────────────── */}
        <div className="mx-auto max-w-6xl px-6 pb-24 pt-20">
          <div className="grid gap-12 lg:grid-cols-[1fr_22rem]">
            <h1 className="landing-title">Newsroom</h1>

            {/* Les contacts en regard du titre, avant tout contenu : un
                journaliste qui arrive cherche une adresse, pas un article. */}
            <ul className="flex flex-col gap-7 lg:pt-3">
              <li>
                <p className="landing-body text-sm">
                  {isFr ? 'Demandes presse' : 'Press inquiries'}
                </p>
                <a href="mailto:ant.adam468@gmail.com" className="landing-link text-sm">
                  ant.adam468@gmail.com
                </a>
              </li>
              <li>
                <p className="landing-body text-sm">
                  {isFr ? 'Autres demandes' : 'Non-media inquiries'}
                </p>
                <a href={`/${lang}/docs`} className="landing-link text-sm">
                  {isFr ? 'Obtenir de l’aide' : 'How to get support'}
                </a>
              </li>
            </ul>
          </div>
        </div>

        {posts === null ? (
          <div className="mx-auto max-w-6xl px-6">
            <p className="landing-body">{isFr ? 'Chargement…' : 'Loading…'}</p>
          </div>
        ) : posts.length === 0 ? (
          <div className="mx-auto max-w-6xl border-t border-[var(--line)] px-6 pt-20">
            {/* Une salle de presse vide ne s'excuse pas : elle dit ce qui viendra. */}
            <p className="landing-body max-w-xl">
              {isFr
                ? 'Rien de publié pour l’instant. Les prochains communiqués paraîtront ici.'
                : 'Nothing published yet. Upcoming announcements will appear here.'}
            </p>
          </div>
        ) : (
          <>
            {/* ─── La une, et les récents à côté ─────────────────────────── */}
            <div className="border-t border-[var(--line)]">
              <div className="mx-auto grid max-w-6xl gap-x-14 gap-y-16 px-6 py-20 lg:grid-cols-[1fr_26rem]">
                {lead && (
                  <a href={`/${lang}/newsroom/${lead.slug}`} className="group block">
                    <img
                      src={lead.heroUrl ?? ''}
                      alt={lead.heroAlt ?? ''}
                      className="aspect-video w-full rounded-xl border border-[var(--line)] object-cover"
                    />
                    {/* Le titre à gauche, la fiche à droite : c'est la
                        disposition de la page de référence, et elle laisse au
                        titre la place d'être grand. */}
                    <div className="mt-10 grid gap-6 sm:grid-cols-2">
                      <h2 className="landing-subtitle group-hover:underline">{lead.title}</h2>
                      <div>
                        <div className="flex items-center gap-3 text-sm">
                          <span className="font-semibold">{lead.theme}</span>
                          <time className="landing-body">
                            {formatPostDate(lead.publishedAt, lang)}
                          </time>
                        </div>
                        {lead.excerpt && <p className="landing-body mt-3">{lead.excerpt}</p>}
                      </div>
                    </div>
                  </a>
                )}

                {secondary.length > 0 && (
                  <div className="flex flex-col">
                    {secondary.map((post, index) => (
                      <a
                        key={post.id}
                        href={`/${lang}/newsroom/${post.slug}`}
                        className={`group block py-7 ${
                          index > 0 ? 'border-t border-[var(--line)]' : 'pt-0'
                        }`}
                      >
                        <div className="flex items-center gap-3 text-sm">
                          <span className="font-semibold">{post.theme}</span>
                          <time className="landing-body">
                            {formatPostDate(post.publishedAt, lang)}
                          </time>
                        </div>
                        <p className="mt-2 text-lg font-semibold group-hover:underline">
                          {post.title}
                        </p>
                        {post.excerpt && <p className="landing-body mt-2">{post.excerpt}</p>}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ─── La liste complète ─────────────────────────────────────── */}
            <div className="border-t border-[var(--line)]">
              <div className="mx-auto max-w-6xl px-6 py-20">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <h2 className="landing-subtitle">{isFr ? 'Actualités' : 'News'}</h2>
                  <input
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder={isFr ? 'Rechercher' : 'Search'}
                    className="h-10 w-64 rounded-lg border border-[var(--line)] bg-transparent px-3 text-sm outline-none focus:border-[var(--fg-muted)]"
                  />
                </div>

                <div className="mt-12 grid gap-12 lg:grid-cols-[1fr_16rem]">
                  <div>
                    {/* L'en-tête du tableau : trois colonnes qui disent ce qu'on
                        balaie. Sur téléphone il disparaît, la place n'y étant
                        que pour le titre. */}
                    <div className="hidden grid-cols-[8rem_10rem_1fr] gap-4 border-b border-[var(--line)] pb-4 text-xs uppercase tracking-[0.04em] text-[var(--fg-muted)] sm:grid">
                      <span>{isFr ? 'Date' : 'Date'}</span>
                      <span>{isFr ? 'Thème' : 'Category'}</span>
                      <span>{isFr ? 'Titre' : 'Title'}</span>
                    </div>

                    {listed.length === 0 ? (
                      <p className="landing-body mt-10">
                        {query
                          ? isFr
                            ? 'Aucun communiqué ne correspond à cette recherche.'
                            : 'No post matches this search.'
                          : isFr
                            ? 'Tous les communiqués sont en une.'
                            : 'Every post is featured above.'}
                      </p>
                    ) : (
                      <div onMouseLeave={() => setHovered(null)}>
                        {listed.map(post => (
                          <a
                            key={post.id}
                            href={`/${lang}/newsroom/${post.slug}`}
                            onMouseEnter={() => setHovered(post)}
                            className="grid grid-cols-1 gap-1 border-b border-[var(--line)] py-6 transition hover:bg-[var(--bg-alt)] sm:grid-cols-[8rem_10rem_1fr] sm:gap-4"
                          >
                            <time className="landing-body text-sm">
                              {formatPostDate(post.publishedAt, lang)}
                            </time>
                            <span className="landing-body text-sm">{post.theme}</span>
                            <span className="text-sm">{post.title}</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>

                  {/*
                    La vignette du communiqué survolé.

                    Elle ne paraît que si l'article en a une : une image de tête
                    en 16:9 ramenée au carré perd son sujet, et mieux vaut ne
                    rien montrer qu'un morceau de ciel. La colonne garde sa place
                    quoi qu'il arrive, sinon la liste sauterait de côté au
                    passage de la souris.
                  */}
                  <div className="hidden lg:block">
                    <div className="sticky top-28 aspect-square w-full overflow-hidden rounded-xl">
                      {hovered?.squareUrl && (
                        <img
                          src={hovered.squareUrl}
                          alt={hovered.squareAlt ?? ''}
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </Shell>
  );
}

/* ---------------------------------------------------------------- article */

export function BlogArticle({ lang, slug }: { lang: Lang; slug: string }) {
  const [post, setPost] = useState<BlogPost | null | 'missing'>(null);
  const isFr = lang === 'fr';

  useEffect(() => {
    document.documentElement.lang = lang;
    let active = true;
    getPost(lang, slug).then(result => {
      if (!active) return;
      setPost(result ?? 'missing');
      if (result) document.title = `${result.title} \\ GreLines`;
    });
    return () => {
      active = false;
    };
  }, [lang, slug]);

  if (post === null) {
    return (
      <Shell lang={lang}>
        <main className="mx-auto max-w-6xl px-6 py-24">
          <p className="landing-body">{isFr ? 'Chargement…' : 'Loading…'}</p>
        </main>
      </Shell>
    );
  }

  if (post === 'missing') {
    return (
      <Shell lang={lang}>
        <main className="mx-auto max-w-6xl px-6 py-24">
          <h1 className="landing-title">{isFr ? 'Article introuvable' : 'Post not found'}</h1>
          <p className="landing-lead mt-5 max-w-xl">
            {isFr
              ? "Ce communiqué n'existe pas, ou n'est pas encore publié."
              : 'This post does not exist, or is not published yet.'}
          </p>
          <a href={`/${lang}/newsroom`} className="landing-cta landing-cta-primary mt-8">
            {isFr ? 'Voir la Newsroom' : 'See the Newsroom'}
          </a>
        </main>
      </Shell>
    );
  }

  return (
    <Shell lang={lang}>
      <main className="pb-24 pt-16">
        {/* La tête : étiquettes, titre, date. Centrée, comme un communiqué. */}
        <div className="mx-auto max-w-3xl px-6 text-center">
          <Subjects theme={post.theme} kind={post.kind} />
          <h1 className="landing-title mt-5">{post.title}</h1>
          <p className="landing-body mt-5 text-sm">{formatPostDate(post.publishedAt, lang)}</p>
        </div>

        {post.heroUrl && (
          <div className="mx-auto mt-12 max-w-5xl px-6">
            <img
              src={post.heroUrl}
              alt={post.heroAlt ?? ''}
              className="aspect-video w-full rounded-2xl border border-[var(--line)] object-cover"
            />
          </div>
        )}

        {/* La colonne de lecture. Étroite à dessein : au-delà d'une
            soixantaine de signes par ligne, l'œil perd le début de la
            suivante. */}
        <article className="mx-auto mt-16 max-w-[42rem] px-6">
          {post.body.map((block, index) => (
            <Block key={index} block={block} />
          ))}

          <div className="mt-16 border-t border-[var(--line)] pt-8">
            <a href={`/${lang}/newsroom`} className="landing-link text-sm">
              {isFr ? '← Toute la Newsroom' : '← Back to the Newsroom'}
            </a>
          </div>
        </article>
      </main>
    </Shell>
  );
}

/* ------------------------------------------------------------------- docs */

/**
 * La documentation, qui n'est pas encore écrite.
 *
 * Une page qui le dit vaut mieux qu'un lien qui verse dans l'application des
 * horaires : on saurait qu'il y a une erreur, sans savoir laquelle. Elle dit
 * donc ce qui viendra, et donne de quoi demander en attendant — ce dont a
 * besoin un réseau qui se renseigne aujourd'hui.
 */
export function DocsPage({ lang }: { lang: Lang }) {
  const isFr = lang === 'fr';

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = isFr ? 'Documentation \\ GreLines' : 'Documentation \\ GreLines';
  }, [lang, isFr]);

  return (
    <Shell lang={lang}>
      <main className="mx-auto max-w-6xl px-6 pb-24 pt-16">
        <p className="landing-eyebrow">{isFr ? 'Ressources' : 'Resources'}</p>
        <h1 className="landing-title mt-4">Documentation</h1>
        <p className="landing-lead mt-5 max-w-2xl">
          {isFr
            ? "Déployer GreLines sur un réseau : raccorder vos données, poser des écrans, imprimer des affiches qui survivent aux renommages."
            : 'Deploying GreLines on a network: connecting your data, setting up screens, printing posters that outlive stop renamings.'}
        </p>
        <p className="landing-body mt-8 max-w-2xl">
          {isFr
            ? "Elle est en cours d'écriture. En attendant, on répond aux questions par courriel, et souvent le jour même."
            : 'It is being written. In the meantime we answer questions by email, often the same day.'}
        </p>
        <a href="mailto:ant.adam468@gmail.com" className="landing-cta landing-cta-primary mt-8">
          {isFr ? 'Poser une question' : 'Ask a question'}
        </a>
      </main>
    </Shell>
  );
}
