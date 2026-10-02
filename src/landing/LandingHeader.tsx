import { useEffect, useState } from 'react';
import type { Lang } from './content';
import { COPY } from './content';

type Theme = 'light' | 'dark';

const ASSETS = '/assets/homepage';

function Mark({ theme }: { theme: Theme }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        className="text-[1.0625rem] tracking-[-0.03em]"
        style={{ fontFamily: 'var(--display)', fontWeight: 500 }}
      >
        GreLines
      </span>
    );
  }

  return (
    <img
      src={`${ASSETS}/${theme === 'dark' ? 'logo_light.png' : 'logo.png'}`}
      alt="GreLines"
      className="h-7 w-auto rounded-full"
      onError={() => setFailed(true)}
    />
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-3 w-3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function LandingHeader({
  lang,
  theme,
  stuck = true,
  local = false,
}: {
  lang: Lang;
  theme: Theme;
  stuck?: boolean;
  local?: boolean;
}) {
  const copy = COPY[lang];
  const [openMenu, setOpenMenu] = useState<'solutions' | 'resources' | null>(null);
  const isFr = lang === 'fr';

  const resources = [
    {
      name: isFr ? 'Documentation' : 'Documentation',
      note: isFr
        ? 'Déployer GreLines sur un réseau : données, écrans, affiches.'
        : 'Deploying GreLines on a network: data, screens, posters.',
      href: `/${lang}/docs`,
    },
    {
      name: 'Newsroom',
      note: isFr
        ? "Les communiqués, les réseaux qui rejoignent l'application, et à qui écrire."
        : 'Announcements, networks joining the app, and who to write to.',
      href: `/${lang}/newsroom`,
    },
  ];
  const anchor = (id: string) => (local ? `#${id}` : `/${lang}#${id}`);
  const solutionHref = (href: string) =>
    !local && href.startsWith('#') ? `/${lang}${href}` : href;

  useEffect(() => {
    if (!openMenu) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(null);
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('[data-menu]')) setOpenMenu(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [openMenu]);

  return (
    <header
      className={`landing-header ${stuck ? 'is-stuck' : ''}`}
      onMouseLeave={() => setOpenMenu(null)}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href={`/${lang}`} className="flex items-center gap-2">
          <Mark theme={theme} />
        </a>

        <nav className="hidden items-center gap-9 text-sm md:flex">
          <div data-menu className="flex h-16 items-center" onMouseEnter={() => setOpenMenu('solutions')}>
            <button
              type="button"
              onClick={() => setOpenMenu(open => (open === 'solutions' ? null : 'solutions'))}
              aria-expanded={openMenu === 'solutions'}
              className="landing-link flex items-center gap-1.5"
            >
              {copy.nav.solutions}
              <Chevron open={openMenu === 'solutions'} />
            </button>
          </div>
          <div data-menu className="flex h-16 items-center" onMouseEnter={() => setOpenMenu('resources')}>
            <button
              type="button"
              onClick={() => setOpenMenu(open => (open === 'resources' ? null : 'resources'))}
              aria-expanded={openMenu === 'resources'}
              className="landing-link flex items-center gap-1.5"
            >
              {isFr ? 'Ressources' : 'Resources'}
              <Chevron open={openMenu === 'resources'} />
            </button>
          </div>
          <a href={anchor('features')} className="landing-link">{copy.nav.features}</a>
          <a href={anchor('networks')} className="landing-link">{copy.nav.networks}</a>
        </nav>

        <div className="flex items-center gap-4">
          <a href="/app" className="landing-cta landing-cta-primary !h-9 !px-4 !text-[0.8125rem]">
            {copy.nav.open}
          </a>
        </div>
      </div>

      <div
        data-menu
        className={`landing-menu ${openMenu === 'solutions' ? 'is-open' : ''}`}
        onMouseEnter={() => setOpenMenu('solutions')}
      >
        <div className="mx-auto max-w-6xl px-4 py-6">
          <p className="landing-eyebrow px-2 pb-4">{copy.eyebrows.solutions}</p>
          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {copy.solutions.map(solution => (
              <a key={solution.name} href={solutionHref(solution.href)} className="landing-menu-item">
                <span className="landing-menu-name">{solution.name}</span>
                <span className="landing-menu-note block">{solution.note}</span>
              </a>
            ))}
          </div>
        </div>
      </div>

      <div
        data-menu
        className={`landing-menu ${openMenu === 'resources' ? 'is-open' : ''}`}
        onMouseEnter={() => setOpenMenu('resources')}
      >
        <div className="mx-auto max-w-6xl px-4 py-6">
          <p className="landing-eyebrow px-2 pb-4">{isFr ? 'Ressources' : 'Resources'}</p>
          <div className="grid gap-1 sm:grid-cols-2">
            {resources.map(item => (
              <a key={item.name} href={item.href} className="landing-menu-item">
                <span className="landing-menu-name">{item.name}</span>
                <span className="landing-menu-note block">{item.note}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
