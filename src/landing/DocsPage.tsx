/**
 * La documentation, servie sur `/fr/docs` et `/en/docs`.
 *
 * Trois étages, et un seul composant pour les trois.
 *
 *   /fr/docs                      le sommaire : les huit catégories
 *   /fr/docs/deploy               une catégorie : ses sections
 *   /fr/docs/deploy/variables     une section : l'article entier
 *
 * Une page par section plutôt qu'une seule page très longue. Ce n'est pas un
 * détail d'agencement : une adresse par sujet, c'est un lien qu'on colle dans
 * un message sans dire « cherche le titre Variables au milieu », c'est un
 * onglet qui garde son titre, et c'est une page qui ne fait pas défiler trente
 * sections pour en lire une.
 *
 * La navigation se fait sans recharger. Les liens restent de vrais liens, avec
 * une vraie adresse : un clic ordinaire est intercepté et l'on change de vue,
 * un clic du milieu ou avec une touche ouvre un onglet, comme partout ailleurs.
 * Le bouton « précédent » du navigateur fonctionne, parce que c'est l'historique
 * qu'on manipule et non un état inventé à côté.
 *
 * L'en-tête n'est pas celui du site. Une page de documentation ne se visite pas
 * comme une page de présentation : on n'y arrive pas pour être convaincu, on y
 * arrive pour trouver quelque chose. Les menus déroulants de la vitrine, qui
 * vendent des solutions, deviendraient ici du bruit. À leur place : la pastille
 * seule, une contre-oblique, le mot « Docs », un champ qui filtre le sommaire,
 * et le bouton qui ouvre l'application. Le pied de page, lui, reste celui de
 * tout le site : cette page n'est pas une annexe.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './landing.css';
import { type Lang } from './content';
import { LandingFooter } from './LandingFooter';
import {
  DOCS,
  DOCS_EMAIL,
  type DocBlock,
  type DocEntry,
  type DocGroup,
  type DocsCopy,
} from './docsContent';
import { DocIcon } from './docsIcons';
import { CodeBlock } from './CodeBlock';

const ASSETS = '/assets/homepage';

type Theme = 'light' | 'dark';
type ThemeChoice = 'auto' | Theme;

/** Où l'on se trouve dans la documentation. Rien de plus que deux segments. */
interface Route {
  group?: string;
  entry?: string;
}

/* -------------------------------------------------------------------------
 * Le thème, tenu comme sur le reste du site.
 * ---------------------------------------------------------------------- */

function systemTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function useDocsTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(() => {
    try {
      const stored = localStorage.getItem('greLines_theme');
      if (stored === 'light' || stored === 'dark') return stored;
      if (stored === 'blue') return 'dark';
    } catch {
      /* Stockage refusé : on suivra le système. */
    }
    return 'auto';
  });
  const [system, setSystem] = useState<Theme>(systemTheme);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: light)');
    if (!media) return;
    const onChange = () => setSystem(media.matches ? 'light' : 'dark');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const choose = (next: ThemeChoice) => {
    setChoice(next);
    try {
      if (next === 'auto') localStorage.removeItem('greLines_theme');
      else localStorage.setItem('greLines_theme', next);
    } catch {
      /* Le choix ne tiendra que le temps de la visite. */
    }
  };

  return { theme: (choice === 'auto' ? system : choice) as Theme, choice, choose };
}

/* -------------------------------------------------------------------------
 * Petits outils.
 * ---------------------------------------------------------------------- */

function ArrowRight({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function ArrowLeft({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      className="h-3.5 w-3.5"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </svg>
  );
}

/** Le chevron d'une catégorie : pointe à droite fermée, vers le bas ouverte. */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`docs-chevron ${open ? 'is-open' : ''}`}
      aria-hidden
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

/**
 * Le mot recherché, sans ses accents ni sa casse.
 *
 * On filtre un sommaire français : quelqu'un qui tape « ecran » vite fait
 * cherche « écran », et lui rendre une liste vide serait ridicule.
 */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/* -------------------------------------------------------------------------
 * Les blocs d'une section.
 * ---------------------------------------------------------------------- */

function Block({
  block,
  copyLabel,
  copiedLabel,
}: {
  block: DocBlock;
  copyLabel: string;
  copiedLabel: string;
}) {
  switch (block.kind) {
    case 'p':
      return <p className="landing-body mt-5 max-w-2xl">{block.text}</p>;

    case 'steps':
      return (
        <ol className="docs-steps mt-6 max-w-2xl">
          {block.items.map((item, index) => (
            <li key={index} className="docs-step">
              <span className="docs-step-mark" aria-hidden>
                {index + 1}
              </span>
              <span className="landing-body">{item}</span>
            </li>
          ))}
        </ol>
      );

    case 'list':
      return (
        <div className="landing-list mt-6 max-w-2xl">
          {block.items.map(item => (
            <div key={item.name} className="landing-list-item">
              <span className="landing-list-name">{item.name}</span>
              <span className="landing-list-note">{item.note}</span>
            </div>
          ))}
        </div>
      );

    case 'code':
      return (
        <div className="mt-6 max-w-2xl">
          <CodeBlock
            code={block.text}
            lang={block.lang}
            file={block.file}
            copyLabel={copyLabel}
            copiedLabel={copiedLabel}
          />
        </div>
      );

    case 'note':
      return (
        <aside className="docs-note mt-6 max-w-2xl">
          <p className="landing-body">{block.text}</p>
        </aside>
      );

    default:
      /* Un bloc d'un type qu'on ne connaît pas est ignoré, jamais rendu de
         travers : la page reste lisible pendant qu'on corrige le contenu. */
      return null;
  }
}

/* -------------------------------------------------------------------------
 * La page.
 * ---------------------------------------------------------------------- */

export function DocsPage({
  lang,
  group: initialGroup,
  entry: initialEntry,
}: {
  lang: Lang;
  group?: string;
  entry?: string;
}) {
  const copy: DocsCopy = DOCS[lang];
  const { theme, choice, choose } = useDocsTheme();
  const [query, setQuery] = useState('');
  const [tocOpen, setTocOpen] = useState(false);
  const [route, setRoute] = useState<Route>({ group: initialGroup, entry: initialEntry });
  /**
   * Les catégories dépliées à la main.
   *
   * On ne retient que les gestes du lecteur. La catégorie où l'on se trouve
   * s'ouvre en plus, sans être notée ici : sans quoi elle resterait ouverte
   * pour toujours une fois qu'on l'a quittée, et l'accordéon finirait à plat.
   */
  const [opened, setOpened] = useState<string[]>([]);

  /* ------------------------------------------------------ ce qu'on regarde */

  /* Une catégorie ou une section inconnue ramène au sommaire. Une adresse
     inventée, ou devenue fausse après un renommage, rend donc quelque chose
     d'utile au lieu d'une page vide. */
  const currentGroup: DocGroup | undefined = useMemo(
    () => copy.groups.find(item => item.id === route.group),
    [copy.groups, route.group],
  );
  const currentEntry: DocEntry | undefined = useMemo(
    () => currentGroup?.entries.find(item => item.id === route.entry),
    [currentGroup, route.entry],
  );
  const level: 'index' | 'group' | 'entry' = currentEntry
    ? 'entry'
    : currentGroup
      ? 'group'
      : 'index';

  const path = (groupId?: string, entryId?: string) =>
    `/${lang}/docs${groupId ? `/${groupId}` : ''}${entryId ? `/${entryId}` : ''}`;

  /* ------------------------------------------------------------ navigation */

  const go = useCallback(
    (next: Route, push = true) => {
      if (push) window.history.pushState(next, '', path(next.group, next.entry));
      setRoute(next);
      setTocOpen(false);
      window.scrollTo({ top: 0 });
    },
    // `path` se reconstruit à chaque rendu mais ne dépend que de la langue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang],
  );

  /* Le bouton « précédent » du navigateur. Sans lui, une page qui change sans
     recharger devient un piège : on recule, et l'on sort du site. */
  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      const state = event.state as Route | null;
      if (state && typeof state === 'object') {
        go(state, false);
        return;
      }
      /* Pas d'état : on relit l'adresse, qui fait toujours foi. */
      const parts = window.location.pathname.split('/').filter(Boolean);
      go({ group: parts[2], entry: parts[3] }, false);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [go]);

  /**
   * Un lien de documentation.
   *
   * L'adresse est écrite dans le `href`, toujours : c'est elle que voit le
   * navigateur au survol, qu'on copie d'un clic droit, et qu'un moteur suit.
   * L'interception ne vaut que pour le clic ordinaire, sans touche appuyée :
   * détourner un `ctrl`-clic priverait le lecteur de l'onglet qu'il demandait.
   */
  const DocLink = ({
    to,
    className,
    children,
  }: {
    to: Route;
    className?: string;
    children: React.ReactNode;
  }) => (
    <a
      href={path(to.group, to.entry)}
      className={className}
      onClick={event => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (event.button !== 0) return;
        event.preventDefault();
        go(to);
      }}
    >
      {children}
    </a>
  );

  /* ------------------------------------------------------------------ titre */

  useEffect(() => {
    document.documentElement.lang = lang;
    /* « Page \ Marque », la marque en dernier : dans une rangée d'onglets
       GreLines, « GreLines » est précisément ce qui ne distingue rien. */
    const parts = [currentEntry?.title, currentGroup?.title, 'Documentation'].filter(Boolean);
    document.title = `${parts[0]} \\ GreLines`;
  }, [lang, currentGroup, currentEntry]);

  /* ---------------------------------------------------------- le sommaire */

  const groups = useMemo(() => {
    const needle = fold(query);
    if (!needle) return copy.groups;
    return copy.groups
      .map(item => ({
        ...item,
        entries: item.entries.filter(entry =>
          fold(`${item.title} ${entry.title} ${entry.note}`).includes(needle),
        ),
      }))
      .filter(item => item.entries.length > 0);
  }, [copy.groups, query]);

  const toggleGroup = (id: string) =>
    setOpened(current =>
      current.includes(id) ? current.filter(item => item !== id) : [...current, id],
    );

  /* --------------------------------------------------- section suivante */

  /**
   * Les deux sections voisines, à travers les catégories.
   *
   * On aplatit tout et l'on prend ce qui entoure : la dernière section d'une
   * catégorie mène donc à la première de la suivante. C'est ce qu'on attend
   * d'une documentation qu'on lit d'un bout à l'autre, et cela évite un
   * cul-de-sac tous les trois articles.
   */
  const [previous, next] = useMemo(() => {
    if (!currentEntry) return [undefined, undefined] as const;
    const flat = copy.groups.flatMap(item =>
      item.entries.map(entry => ({ group: item, entry })),
    );
    const index = flat.findIndex(item => item.entry.id === currentEntry.id);
    return [flat[index - 1], flat[index + 1]] as const;
  }, [copy.groups, currentEntry]);

  return (
    <div className="landing" data-theme={theme}>
      <div className="landing-surface min-h-screen">
        {/* ============================================== en-tête de la doc */}
        <header className="docs-header">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-6">
            <a href={`/${lang}`} className="flex flex-shrink-0 items-center" aria-label="GreLines">
              <img
                src={`${ASSETS}/${theme === 'dark' ? 'logo_light.png' : 'logo.png'}`}
                alt=""
                className="h-6 w-6 rounded-full"
              />
            </a>

            {/* La contre-oblique, puis « Docs ». Deux caractères qui disent
                qu'on est dans une sous-partie du site et non sur un autre site,
                et c'est la même barre que celle des titres d'onglets. */}
            <span className="docs-slash" aria-hidden>
              \
            </span>
            <DocLink to={{}} className="docs-wordmark">
              Docs
            </DocLink>

            <div className="flex-1" />

            <label className="docs-search hidden md:flex">
              <SearchIcon />
              <input
                type="search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder={copy.searchLabel}
                aria-label={copy.searchLabel}
              />
            </label>

            <button
              type="button"
              className="docs-toc-toggle lg:hidden"
              onClick={() => setTocOpen(open => !open)}
              aria-expanded={tocOpen}
            >
              {copy.tocToggle}
            </button>

            <a href="/app" className="landing-cta landing-cta-primary !h-9 !px-4 !text-[0.8125rem]">
              {copy.primary}
            </a>
          </div>
        </header>

        {/* Deux colonnes à partir du grand écran, une seule en dessous.
            La disposition passe en bloc plutôt qu'en ligne : déplié sur
            téléphone, le sommaire occupait toute la largeur de la rangée et
            écrasait le texte à côté de lui, jusqu'à zéro pixel. */}
        <div className="mx-auto max-w-6xl px-6 lg:flex lg:gap-12">
          {/* ============================================ sommaire */}
          <nav className={`docs-toc ${tocOpen ? 'is-open' : ''}`} aria-label={copy.tocTitle}>
            <div className="docs-toc-inner">
              {/* Le champ est répété ici pour les petits écrans, où celui de
                  l'en-tête n'a pas la place d'exister. */}
              <label className="docs-search mb-6 flex md:hidden">
                <SearchIcon />
                <input
                  type="search"
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder={copy.searchLabel}
                  aria-label={copy.searchLabel}
                />
              </label>

              {groups.length === 0 && <p className="landing-body">{copy.searchEmpty}</p>}

              {groups.map(item => {
                /* Une recherche ouvre tout ce qu'elle a trouvé : masquer un
                   résultat derrière un chevron reviendrait à ne pas l'avoir
                   trouvé. */
                const isOpen =
                  Boolean(query) || opened.includes(item.id) || currentGroup?.id === item.id;

                return (
                  <div key={item.id} className="docs-cat">
                    <div className="docs-cat-head-row">
                      <DocLink
                        to={{ group: item.id }}
                        className={`docs-cat-head ${currentGroup?.id === item.id && !currentEntry ? 'is-current' : ''}`}
                      >
                        {item.title}
                      </DocLink>
                      <button
                        type="button"
                        className="docs-cat-toggle"
                        onClick={() => toggleGroup(item.id)}
                        aria-expanded={isOpen}
                        aria-label={item.title}
                      >
                        <Chevron open={isOpen} />
                      </button>
                    </div>

                    {isOpen && (
                      <ul className="docs-cat-list">
                        {item.entries.map(entry => (
                          <li key={entry.id}>
                            <DocLink
                              to={{ group: item.id, entry: entry.id }}
                              className={`docs-toc-link ${currentEntry?.id === entry.id ? 'is-active' : ''}`}
                            >
                              <DocIcon name={entry.icon} className="docs-toc-icon" />
                              <span>{entry.title}</span>
                            </DocLink>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </nav>

          {/* ============================================ contenu */}
          <main className="min-w-0 flex-1 pb-28 pt-14">
            {/* ------------------------------------------------ le sommaire */}
            {level === 'index' && (
              <>
                <p className="landing-eyebrow">{copy.eyebrow}</p>
                <h1 className="landing-title mt-4 max-w-3xl">{copy.title}</h1>
                <p className="landing-lead mt-6 max-w-2xl">{copy.lead}</p>
                <div className="mt-9 flex flex-wrap gap-3">
                  <a href="/app" className="landing-cta landing-cta-primary">
                    {copy.primary}
                    <ArrowRight />
                  </a>
                  <a href={`mailto:${DOCS_EMAIL}`} className="landing-cta landing-cta-ghost">
                    {copy.secondary}
                  </a>
                </div>

                {/* Les huit catégories. Une carte mène à sa page, où l'on
                    trouvera ses sections : le sommaire ne déballe donc pas
                    trente titres à quelqu'un qui vient d'arriver. */}
                <div className="mt-16 grid gap-5 sm:grid-cols-2">
                  {copy.groups.map(item => (
                    <DocLink key={item.id} to={{ group: item.id }} className="landing-card docs-cat-card">
                      <p className="landing-eyebrow">
                        {item.entries.length} {copy.sections}
                      </p>
                      <h2 className="docs-cat-card-title mt-3">{item.title}</h2>
                      <p className="landing-body mt-2">{item.note}</p>
                      <span className="docs-cat-card-go mt-5">
                        {copy.browse}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </DocLink>
                  ))}
                </div>
              </>
            )}

            {/* ------------------------------------------------ une catégorie */}
            {level === 'group' && currentGroup && (
              <>
                <nav className="docs-crumbs" aria-label={copy.tocTitle}>
                  <DocLink to={{}}>{copy.eyebrow}</DocLink>
                  <span aria-hidden>/</span>
                  <span className="docs-crumb-current">{currentGroup.title}</span>
                </nav>

                <h1 className="landing-title mt-5 max-w-3xl">{currentGroup.title}</h1>
                <p className="landing-lead mt-5 max-w-2xl">{currentGroup.note}</p>

                <div className="mt-12 grid gap-4 sm:grid-cols-2">
                  {currentGroup.entries.map(entry => (
                    <DocLink
                      key={entry.id}
                      to={{ group: currentGroup.id, entry: entry.id }}
                      className="landing-card docs-entry-card"
                    >
                      <span className="docs-entry-icon" aria-hidden>
                        <DocIcon name={entry.icon} className="h-4 w-4" />
                      </span>
                      <span className="docs-entry-card-title mt-4">{entry.title}</span>
                      <span className="landing-list-note mt-2">{entry.note}</span>
                    </DocLink>
                  ))}
                </div>

                <DocLink to={{}} className="docs-back mt-12 inline-flex items-center gap-2">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  {copy.allCategories}
                </DocLink>
              </>
            )}

            {/* ------------------------------------------------ une section */}
            {level === 'entry' && currentGroup && currentEntry && (
              <>
                <nav className="docs-crumbs" aria-label={copy.tocTitle}>
                  <DocLink to={{}}>{copy.eyebrow}</DocLink>
                  <span aria-hidden>/</span>
                  <DocLink to={{ group: currentGroup.id }}>{currentGroup.title}</DocLink>
                  <span aria-hidden>/</span>
                  <span className="docs-crumb-current">{currentEntry.title}</span>
                </nav>

                <article>
                  <div className="mt-5 flex items-center gap-3">
                    <span className="docs-entry-icon" aria-hidden>
                      <DocIcon name={currentEntry.icon} className="h-4 w-4" />
                    </span>
                    <h1 className="landing-title">{currentEntry.title}</h1>
                  </div>
                  <p className="landing-lead mt-5 max-w-2xl">{currentEntry.note}</p>

                  {currentEntry.body.map((block, index) => (
                    <Block
                      key={index}
                      block={block}
                      copyLabel={copy.copy}
                      copiedLabel={copy.copied}
                    />
                  ))}
                </article>

                {/* La section d'avant et celle d'après, à travers les
                    catégories : une documentation se lit aussi de bout en bout,
                    et un cul-de-sac tous les trois articles la rendrait
                    impraticable. */}
                <nav className="docs-nav mt-16" aria-label={copy.tocTitle}>
                  {previous ? (
                    <DocLink
                      to={{ group: previous.group.id, entry: previous.entry.id }}
                      className="docs-nav-card"
                    >
                      <span className="docs-nav-label">
                        <ArrowLeft className="h-3 w-3" />
                        {copy.previous}
                      </span>
                      <span className="docs-nav-title">{previous.entry.title}</span>
                    </DocLink>
                  ) : (
                    <span />
                  )}
                  {next && (
                    <DocLink
                      to={{ group: next.group.id, entry: next.entry.id }}
                      className="docs-nav-card is-next"
                    >
                      <span className="docs-nav-label">
                        {copy.next}
                        <ArrowRight className="h-3 w-3" />
                      </span>
                      <span className="docs-nav-title">{next.entry.title}</span>
                    </DocLink>
                  )}
                </nav>
              </>
            )}

            {/* ---------------------------------------- l'aide, tout en bas */}
            <div className="landing-card docs-help mt-16">
              <h2 className="landing-subtitle">{copy.helpTitle}</h2>
              <p className="landing-body mt-3 max-w-xl">{copy.helpBody}</p>
              <a
                href={`mailto:${DOCS_EMAIL}`}
                className="landing-cta landing-cta-primary mt-7 self-start"
              >
                {copy.helpCta}
                <ArrowRight />
              </a>
            </div>
          </main>
        </div>

        <LandingFooter lang={lang} theme={theme} choice={choice} onChoose={choose} />
      </div>
    </div>
  );
}
