import { useEffect, useMemo, useState } from 'react';
import './landing.css';
import { LEGAL, LEGAL_ORDER, type LegalSlug } from './legalContent';
import { LandingHeader } from './LandingHeader';
import { LandingFooter } from './LandingFooter';

type Lang = 'fr' | 'en';
type Theme = 'light' | 'dark';

const THEME_KEY = 'greLines_landingTheme';

function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function LegalPage({ lang, slug }: { lang: Lang; slug: LegalSlug }) {
  const doc = LEGAL[lang][slug];
  const [choice, setChoice] = useState<'auto' | Theme>(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'auto') return stored;
    } catch { }
    return 'auto';
  });
  const theme: Theme = choice === 'auto' ? systemTheme() : choice;
  const chooseTheme = (next: 'auto' | Theme) => {
    setChoice(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { }
  };

  const [active, setActive] = useState<string>(doc.sections[0]?.id ?? '');

  const isFr = lang === 'fr';

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = `${doc.title} \\ GreLines`;
  }, [lang, doc.title]);

  useEffect(() => {
    if (typeof IntersectionObserver !== 'function') return;
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(entry => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: '-80px 0px -70% 0px' },
    );
    for (const section of doc.sections) {
      const node = document.getElementById(section.id);
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
  }, [doc.sections]);

  const siblings = useMemo(
    () => LEGAL_ORDER.map(other => LEGAL[lang][other]).filter(other => other.slug !== slug),
    [lang, slug],
  );

  return (
    <div className="landing" data-theme={theme}>
      <div className="landing-surface">
        <LandingHeader lang={lang} theme={theme} />

        <main className="mx-auto max-w-6xl px-6 pb-24 pt-16">
          <div className="flex flex-col items-center pb-14 text-center">
            <p className="landing-eyebrow">{isFr ? 'Mentions légales' : 'Legal'}</p>
            <h1 className="landing-title mt-5">{doc.title}</h1>
            <p className="landing-lead mt-5 max-w-2xl">{doc.lede}</p>
            <p className="landing-body mt-5 text-sm">
              {isFr ? 'Dernière mise à jour : ' : 'Last updated: '}
              {doc.updated}
            </p>
          </div>

          <div className="grid gap-12 lg:grid-cols-[16rem_1fr]">
            <nav className="hidden lg:block">
              <div className="sticky top-24 rounded-xl border border-[var(--line)] bg-[var(--bg-alt)] p-5">
                <p className="mb-4 text-sm font-semibold">{isFr ? 'Sur cette page' : 'On this page'}</p>
                <ol className="flex flex-col gap-3">
                  {doc.sections.map(section => (
                    <li key={section.id}>
                      <a
                        href={`#${section.id}`}
                        className={`landing-toc-link ${active === section.id ? 'is-active' : ''}`}
                      >
                        {section.heading}
                      </a>
                    </li>
                  ))}
                </ol>
              </div>
            </nav>

            <article className="max-w-[42rem]">
              {doc.sections.map(section => (
                <section key={section.id} id={section.id} className="scroll-mt-24 pb-12">
                  <h2 className="landing-subtitle">{section.heading}</h2>
                  {section.body.map((paragraph, index) =>
                    paragraph.startsWith('- ') ? (
                      <p key={index} className="landing-body mt-3 pl-5 -indent-5">
                        <span aria-hidden className="pr-2">
                          ·
                        </span>
                        {paragraph.slice(2)}
                      </p>
                    ) : (
                      <p key={index} className="landing-body mt-4">
                        {paragraph}
                      </p>
                    ),
                  )}
                </section>
              ))}

              <div className="border-t border-[var(--line)] pt-10">
                <p className="landing-eyebrow pb-4">
                  {isFr ? 'Les autres documents' : 'The other documents'}
                </p>
                <div className="grid gap-1 sm:grid-cols-2">
                  {siblings.map(other => (
                    <a
                      key={other.slug}
                      href={`/${lang}/legals/${other.slug}`}
                      className="landing-menu-item"
                    >
                      <span className="landing-menu-name">{other.title}</span>
                      <span className="landing-menu-note block">{other.lede}</span>
                    </a>
                  ))}
                </div>
              </div>
            </article>
          </div>
        </main>

        <LandingFooter lang={lang} theme={theme} choice={choice} onChoose={chooseTheme} />
      </div>
    </div>
  );
}
