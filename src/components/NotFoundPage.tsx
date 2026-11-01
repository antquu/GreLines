import { lazy, Suspense, useEffect, useState } from 'react';
import { ArrowRightIcon, ArrowUpRightIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import { tx } from '../i18n';
import { IS_CITY_SITE } from '../site';
import { ROOM_LIGHT } from './notFound/macModel';

const STATUS_URL = 'https://status.grelines.fr';

const MacTerminal = lazy(() => import('./notFound/MacTerminal'));
const DESKTOP = '(min-width: 768px)';

export function NotFoundPage({ language, homeHref }: { language: 'fr' | 'en'; homeHref: string }) {
  const text = tx(language === 'fr').notFoundPage;
  const [desktop, setDesktop] = useState(() => window.matchMedia(DESKTOP).matches);

  useEffect(() => {
    const query = window.matchMedia(DESKTOP);
    const update = () => setDesktop(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!desktop) return;
    // never leave the text hidden if the 3d room fails to start
    const timer = window.setTimeout(() => {
      const root = document.documentElement;
      if (!root.style.getPropertyValue(ROOM_LIGHT)) root.style.setProperty(ROOM_LIGHT, '1');
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [desktop]);

  useEffect(() => {
    document.title = `${text.pageNotFound} · GreLines`;
    // always dark, whatever the device theme
    document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = 'dark';
    document.documentElement.style.background = '#0b0b0b';
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex';
    document.head.appendChild(robots);
    return () => robots.remove();
  }, [text.pageNotFound]);

  type Link = { key: keyof typeof text.links; href: string; external: boolean };
  const links: Link[] = [
    { key: 'app', href: '/app', external: false },
    ...(IS_CITY_SITE
      ? []
      : ([
          { key: 'traffic', href: '/trafic', external: false },
          { key: 'docs', href: `/${language}/docs`, external: false },
          { key: 'news', href: `/${language}/newsroom`, external: false },
          { key: 'solutions', href: `/${language}/solutions`, external: false },
        ] satisfies Link[])),
    { key: 'status', href: STATUS_URL, external: true },
  ];

  return (
    <main
      style={{ backgroundColor: desktop ? '#000000' : '#0b0b0b' }}
      className="fixed inset-0 overflow-y-auto overflow-x-hidden"
    >
      <div className="relative isolate mx-auto grid min-h-full max-w-[1232px] items-center gap-16 px-6 pb-[calc(env(safe-area-inset-bottom)+48px)] pt-[calc(var(--gl-safe-top)+72px)] md:grid-cols-2 md:gap-24 md:px-10 md:py-16">
        <div style={desktop ? { opacity: `var(${ROOM_LIGHT}, 0)` } : undefined}>
          <p
            aria-hidden="true"
            className="select-none text-[7.5rem] font-medium leading-[0.85] tracking-[-0.04em] md:text-[11rem]"
            style={{ color: '#262626' }}
          >
            404
          </p>

          <h1 className="pt-8 text-[2rem] font-medium leading-tight md:text-[2.375rem]" style={{ color: '#ffffff' }}>
            {text.pageNotFound}
          </h1>
          <p className="max-w-[440px] pt-4 text-[1.0625rem] leading-relaxed" style={{ color: '#e5e5e5' }}>
            {text.thisPageDoesNot}
          </p>

          <a
            href={homeHref}
            style={{ backgroundColor: '#ffffff', color: '#000000' }}
            className="mt-8 inline-flex items-center gap-1.5 rounded-full py-3 pl-5 pr-4 text-[0.9375rem] font-medium transition hover:opacity-90 active:scale-[0.98]"
          >
            {text.homePage}
            <ChevronRightIcon className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>

        {desktop ? (
          <div>
            <Suspense fallback={<div className="h-[600px]" />}>
              <MacTerminal language={language} />
            </Suspense>
          </div>
        ) : (
          <nav aria-labelledby="not-found-links" className="relative">
            <p id="not-found-links" className="pb-6 text-[0.9375rem]" style={{ color: '#a3a3a3' }}>
              {text.usefulLinks}
            </p>
            <ul>
              {links.map(({ key, href, external }) => {
                const [label, hint] = text.links[key];
                const Arrow = external ? ArrowUpRightIcon : ArrowRightIcon;
                return (
                  <li key={key} style={{ borderBottom: '1px solid #262626' }}>
                    <a
                      href={href}
                      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
                      className="group flex items-center gap-3 py-[18px]"
                    >
                      <span className="text-[1.0625rem] font-medium" style={{ color: '#ffffff' }}>{label}</span>
                      <span className="min-w-0 flex-1 truncate text-[0.9375rem]" style={{ color: '#a3a3a3' }}>{hint}</span>
                      <Arrow
                        className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                        style={{ color: '#737373' }}
                        aria-hidden="true"
                      />
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </div>
    </main>
  );
}
