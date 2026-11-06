import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import '@fontsource-variable/geist-mono';
import './landing.css';
import { type Lang } from './content';
import { LandingFooter } from './LandingFooter';
import { OpenAppLink, SiteHeader } from './SiteHeader';
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


type Theme = 'light' | 'dark';
type ThemeChoice = 'auto' | Theme;

interface Route {
  group?: string;
  entry?: string;
}


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
    }
  };

  return { theme: (choice === 'auto' ? system : choice) as Theme, choice, choose };
}


const ICON_PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

function ArrowRight({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function ArrowLeft({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg {...ICON_PROPS} className="h-4 w-4 flex-shrink-0">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </svg>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg {...ICON_PROPS} className="h-5 w-5">
      {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
    </svg>
  );
}

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function blockText(block: DocBlock): string {
  if (block.kind === 'steps') return block.items.join(' ');
  if (block.kind === 'list') return block.items.map(item => `${item.name} ${item.note}`).join(' ');
  return block.text;
}

// text between backticks is inline code
function Text({ children }: { children: string }) {
  return (
    <>
      {children.split(/`([^`]+)`/).map((part, index) =>
        index % 2 === 1 ? <code key={index} className="docs-inline">{part}</code> : part,
      )}
    </>
  );
}

function Block({ block, copy }: { block: DocBlock; copy: DocsCopy }) {
  switch (block.kind) {
    case 'p':
      return <p className="docs-text"><Text>{block.text}</Text></p>;

    case 'steps':
      return (
        <ol className="docs-steps">
          {block.items.map((item, index) => (
            <li key={index}>
              <span className="docs-step-mark" aria-hidden>{index + 1}</span>
              <span className="docs-text-inline"><Text>{item}</Text></span>
            </li>
          ))}
        </ol>
      );

    case 'list':
      return (
        <dl className="docs-list">
          {block.items.map(item => (
            <div key={item.name}>
              <dt><Text>{item.name}</Text></dt>
              <dd><Text>{item.note}</Text></dd>
            </div>
          ))}
        </dl>
      );

    case 'code':
      return (
        <div className="docs-code-wrap">
          <CodeBlock
            code={block.text}
            lang={block.lang}
            file={block.file}
            copyLabel={copy.copy}
            copiedLabel={copy.copied}
          />
        </div>
      );

    case 'note':
      return <aside className="docs-note"><Text>{block.text}</Text></aside>;

    default:
      return null;
  }
}

const DocsNav = createContext<{ href: (to: Route) => string; go: (to: Route) => void }>({
  href: () => '',
  go: () => {},
});

function DocLink({ to, className, children }: { to: Route; className?: string; children: ReactNode }) {
  const { href, go } = useContext(DocsNav);
  return (
    <a
      href={href(to)}
      className={className}
      onClick={event => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        go(to);
      }}
    >
      {children}
    </a>
  );
}

function Row({ to, title, note }: { to: Route; title: string; note: string }) {
  return (
    <DocLink to={to} className="docs-row">
      <span className="min-w-0 flex-1">
        <span className="docs-row-title">{title}</span>
        <span className="docs-row-note">{note}</span>
      </span>
      <ArrowRight className="docs-row-arrow" />
    </DocLink>
  );
}

function Search({ value, onChange, label }: { value: string; onChange: (next: string) => void; label: string }) {
  return (
    <label className="docs-search">
      <SearchIcon />
      <input
        type="search"
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={label}
        aria-label={label}
      />
    </label>
  );
}

function Contents({ copy, query, route }: { copy: DocsCopy; query: string; route: Route }) {
  const needle = fold(query);

  const results = useMemo(() => {
    if (!needle) return [];
    return copy.groups.flatMap(group =>
      group.entries
        .filter(entry =>
          fold(`${group.title} ${entry.title} ${entry.note} ${entry.body.map(blockText).join(' ')}`).includes(needle),
        )
        .map(entry => ({ group, entry })),
    );
  }, [copy.groups, needle]);

  if (needle) {
    if (results.length === 0) return <p className="docs-empty">{copy.searchEmpty}</p>;
    return (
      <ul>
        {results.map(({ group, entry }) => (
          <li key={`${group.id}/${entry.id}`}>
            <DocLink to={{ group: group.id, entry: entry.id }} className="docs-result">
              <span className="docs-result-title">{entry.title}</span>
              <span className="docs-result-group">{group.title}</span>
            </DocLink>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
      {copy.groups.map(group => {
        const current = group.id === route.group;
        return (
          <div key={group.id} className="docs-toc-group">
            <DocLink
              to={{ group: group.id }}
              className={`docs-toc-title ${current && !route.entry ? 'is-active' : ''}`}
            >
              {group.title}
            </DocLink>
            {current && (
              <ul>
                {group.entries.map(entry => (
                  <li key={entry.id}>
                    <DocLink
                      to={{ group: group.id, entry: entry.id }}
                      className={`docs-toc-link ${route.entry === entry.id ? 'is-active' : ''}`}
                    >
                      {entry.title}
                    </DocLink>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </>
  );
}

function routeFromPath(): Route {
  const parts = window.location.pathname.split('/').filter(Boolean);
  return { group: parts[2], entry: parts[3] };
}

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [route, setRoute] = useState<Route>({ group: initialGroup, entry: initialEntry });
  const mainRef = useRef<HTMLElement>(null);

  const currentGroup: DocGroup | undefined = useMemo(
    () => copy.groups.find(item => item.id === route.group),
    [copy.groups, route.group],
  );
  const currentEntry: DocEntry | undefined = useMemo(
    () => currentGroup?.entries.find(item => item.id === route.entry),
    [currentGroup, route.entry],
  );

  const href = useCallback(
    (to: Route) => `/${lang}/docs${to.group ? `/${to.group}` : ''}${to.entry ? `/${to.entry}` : ''}`,
    [lang],
  );

  const show = useCallback((next: Route) => {
    setRoute(next);
    setMenuOpen(false);
    setQuery('');
    window.scrollTo({ top: 0, behavior: 'instant' });
    mainRef.current?.focus({ preventScroll: true });
  }, []);

  const nav = useMemo(
    () => ({
      href,
      go: (to: Route) => {
        window.history.pushState(null, '', href(to));
        show(to);
      },
    }),
    [href, show],
  );

  useEffect(() => {
    const onPop = () => show(routeFromPath());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [show]);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = `${currentEntry?.title ?? currentGroup?.title ?? 'Documentation'} \\ GreLines`;
  }, [lang, currentGroup, currentEntry]);

  useEffect(() => {
    if (!menuOpen) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; };
  }, [menuOpen]);

  const [previous, next] = useMemo(() => {
    if (!currentEntry || !currentGroup) return [undefined, undefined] as const;
    const flat = copy.groups.flatMap(group => group.entries.map(entry => ({ group, entry })));
    const index = flat.findIndex(item => item.group.id === currentGroup.id && item.entry.id === currentEntry.id);
    return [flat[index - 1], flat[index + 1]] as const;
  }, [copy.groups, currentGroup, currentEntry]);

  const shownRoute: Route = { group: currentGroup?.id, entry: currentEntry?.id };

  return (
    <DocsNav.Provider value={nav}>
      <div className="landing" data-theme={theme}>
        <div className="landing-surface min-h-screen">
          <SiteHeader theme={theme} wordmark={<DocLink to={{}} className="docs-wordmark">{copy.eyebrow}</DocLink>}>
            <div className="hidden w-64 lg:block">
              <Search value={query} onChange={setQuery} label={copy.searchLabel} />
            </div>

            <OpenAppLink label={copy.primary} />

            <button
              type="button"
              className="docs-menu-toggle"
              onClick={() => setMenuOpen(open => !open)}
              aria-expanded={menuOpen}
              aria-label={copy.tocToggle}
            >
              <MenuIcon open={menuOpen} />
            </button>
          </SiteHeader>

          {menuOpen && (
            <nav className="docs-sheet lg:hidden" aria-label={copy.tocTitle}>
              <Search value={query} onChange={setQuery} label={copy.searchLabel} />
              <div className="mt-5">
                <Contents copy={copy} query={query} route={shownRoute} />
              </div>
            </nav>
          )}

          <div className="docs-layout">
            <nav className="docs-sidebar" aria-label={copy.tocTitle}>
              <Contents copy={copy} query={query} route={shownRoute} />
            </nav>

            <main ref={mainRef} tabIndex={-1} className="docs-main">
              {!currentGroup && (
                <>
                  <h1 className="docs-title">{copy.title}</h1>
                  <p className="docs-lead">{copy.lead}</p>
                  <div className="docs-rows">
                    {copy.groups.map(group => (
                      <Row key={group.id} to={{ group: group.id }} title={group.title} note={group.note} />
                    ))}
                  </div>
                </>
              )}

              {currentGroup && !currentEntry && (
                <>
                  <nav className="docs-crumbs" aria-label={copy.tocTitle}>
                    <DocLink to={{}}>{copy.eyebrow}</DocLink>
                  </nav>
                  <h1 className="docs-title">{currentGroup.title}</h1>
                  <p className="docs-lead">{currentGroup.note}</p>
                  <div className="docs-rows">
                    {currentGroup.entries.map(entry => (
                      <Row
                        key={entry.id}
                        to={{ group: currentGroup.id, entry: entry.id }}
                        title={entry.title}
                        note={entry.note}
                      />
                    ))}
                  </div>
                  <DocLink to={{}} className="docs-back">
                    <ArrowLeft className="h-4 w-4" />
                    {copy.allCategories}
                  </DocLink>
                </>
              )}

              {currentGroup && currentEntry && (
                <>
                  <nav className="docs-crumbs" aria-label={copy.tocTitle}>
                    <DocLink to={{}}>{copy.eyebrow}</DocLink>
                    <span aria-hidden>/</span>
                    <DocLink to={{ group: currentGroup.id }}>{currentGroup.title}</DocLink>
                  </nav>

                  <article>
                    <DocIcon name={currentEntry.icon} className="docs-entry-icon" />
                    <h1 className="docs-title">{currentEntry.title}</h1>
                    <p className="docs-lead">{currentEntry.note}</p>
                    {currentEntry.body.map((block, index) => (
                      <Block key={index} block={block} copy={copy} />
                    ))}
                  </article>

                  <nav className="docs-pager" aria-label={copy.tocTitle}>
                    {previous ? (
                      <DocLink to={{ group: previous.group.id, entry: previous.entry.id }} className="docs-pager-link">
                        <span className="docs-pager-label">
                          <ArrowLeft className="h-3.5 w-3.5" />
                          {copy.previous}
                        </span>
                        <span className="docs-pager-title">{previous.entry.title}</span>
                      </DocLink>
                    ) : (
                      <span />
                    )}
                    {next && (
                      <DocLink to={{ group: next.group.id, entry: next.entry.id }} className="docs-pager-link is-next">
                        <span className="docs-pager-label">
                          {copy.next}
                          <ArrowRight className="h-3.5 w-3.5" />
                        </span>
                        <span className="docs-pager-title">{next.entry.title}</span>
                      </DocLink>
                    )}
                  </nav>
                </>
              )}

              <aside className="docs-help">
                <p className="docs-help-title">{copy.helpTitle}</p>
                <p className="docs-help-body">{copy.helpBody}</p>
                <a href={`mailto:${DOCS_EMAIL}`} className="docs-help-link">
                  {copy.helpCta}
                  <ArrowRight className="h-4 w-4" />
                </a>
              </aside>
            </main>
          </div>

          <LandingFooter lang={lang} theme={theme} choice={choice} onChoose={choose} />
        </div>
      </div>
    </DocsNav.Provider>
  );
}
