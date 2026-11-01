import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { isOffline } from '../services/offlineSchedule';
import { ArrowRightIcon, ArrowUpRightIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import { tx } from '../i18n';
import { IS_CITY_SITE } from '../site';
import { ROOM_LIGHT } from './notFound/macModel';

const STATUS_URL = 'https://status.grelines.fr';

// without a connection the 3d room cannot load, the links show instead
function MacUnavailable({ onFail }: { language: 'fr' | 'en'; onFail: () => void }) {
  useEffect(onFail, [onFail]);
  return <></>;
}

const MacTerminal = lazy(() => import('./notFound/MacTerminal').catch(() => ({ default: MacUnavailable })));
const DESKTOP = '(min-width: 768px)';

// siteUrl is empty on the site itself, and the main site address on an unknown subdomain
export function NotFoundPage({ language, siteUrl }: { language: 'fr' | 'en'; siteUrl: string }) {
  const text = tx(language === 'fr').notFoundPage;
  const [desktop, setDesktop] = useState(() => window.matchMedia(DESKTOP).matches);
  const [macFailed, setMacFailed] = useState(() => isOffline());
  const showMac = desktop && !macFailed;

  useEffect(() => {
    const query = window.matchMedia(DESKTOP);
    const update = () => setDesktop(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!showMac) return;
    // never leave the text hidden if the 3d room fails to start
    const timer = window.setTimeout(() => {
      const root = document.documentElement;
      if (!root.style.getPropertyValue(ROOM_LIGHT)) root.style.setProperty(ROOM_LIGHT, '1');
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [showMac]);

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

  const onMacFail = useCallback(() => setMacFailed(true), []);

  type Link = { key: keyof typeof text.links; href: string; external: boolean };
  const links: Link[] = [
    { key: 'app', href: `${siteUrl}/app`, external: false },
    ...(IS_CITY_SITE
      ? []
      : ([
          { key: 'traffic', href: `${siteUrl}/trafic`, external: false },
          { key: 'docs', href: `${siteUrl}/${language}/docs`, external: false },
          { key: 'news', href: `${siteUrl}/${language}/newsroom`, external: false },
          { key: 'solutions', href: `${siteUrl}/${language}/solutions`, external: false },
        ] satisfies Link[])),
    { key: 'status', href: STATUS_URL, external: true },
  ];

  return (
    <main
      style={{ backgroundColor: showMac ? '#000000' : '#0b0b0b' }}
      className="fixed inset-0 overflow-y-auto overflow-x-hidden"
    >
      <div className="relative isolate mx-auto grid min-h-full max-w-[1232px] items-center gap-16 px-6 pb-[calc(env(safe-area-inset-bottom)+48px)] pt-[calc(var(--gl-safe-top)+72px)] md:grid-cols-2 md:gap-24 md:px-10 md:py-16">
        <div style={showMac ? { opacity: `var(${ROOM_LIGHT}, 0)` } : undefined}>
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
            href={`${siteUrl}/`}
            style={{ backgroundColor: '#ffffff', color: '#000000' }}
            className="mt-8 inline-flex items-center gap-1.5 rounded-full py-3 pl-5 pr-4 text-[0.9375rem] font-medium transition hover:opacity-90 active:scale-[0.98]"
          >
            {text.homePage}
            <ChevronRightIcon className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>

        {showMac ? (
          <div>
            <Suspense fallback={<div className="h-[600px]" />}>
              <MacTerminal language={language} onFail={onMacFail} />
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
