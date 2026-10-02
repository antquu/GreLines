import { useEffect, useRef, useState } from 'react';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import { COPY, PARTNERS, type Lang, type Partner } from './content';
import { listPosts, formatPostDate, type BlogPost } from '../services/blog';
import { LandingHeader } from './LandingHeader';
import { LandingFooter } from './LandingFooter';
import './landing.css';

const ASSETS = '/assets/homepage';


function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.05 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return ref;
}

function Reveal({
  children,
  className = '',
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`landing-reveal ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

function SoftImage({
  src,
  alt,
  className = '',
  eager = false,
}: {
  src: string;
  alt: string;
  className?: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
      loading={eager ? 'eager' : 'lazy'}
      fetchPriority={eager ? 'high' : undefined}
      decoding={eager ? 'sync' : 'async'}
    />
  );
}

const LOGO_INK_HEIGHT = 26;

function PartnerLogo({ id, name, box }: Partner) {
  const [failed, setFailed] = useState(false);

  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  const canvas = 1414 / 849;
  const inkWidth = LOGO_INK_HEIGHT * (width / height) * canvas;

  return (
    <div className="landing-logo-item flex flex-shrink-0 items-center justify-center px-9 sm:px-12">
      {failed ? (
        <span className="landing-logo-text">{name}</span>
      ) : (
        <div
          className="landing-logo relative overflow-hidden"
          style={{ width: inkWidth, height: LOGO_INK_HEIGHT }}
        >
          <img
            src={`${ASSETS}/svg/mono/${id}.svg`}
            alt={name}
            className="absolute max-w-none"
            style={{
              width: `${100 / width}%`,
              left: `${(-box.x0 / width) * 100}%`,
              top: `${(-box.y0 / height) * 100}%`,
            }}
            onError={() => setFailed(true)}
          />
        </div>
      )}
    </div>
  );
}

function ArrowRight() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function Eyebrow({ children }: { children: string }) {
  return <p className="landing-eyebrow">{children}</p>;
}

function LatestNews({ lang }: { lang: Lang }) {
  const copy = COPY[lang];
  const [posts, setPosts] = useState<BlogPost[]>([]);

  useEffect(() => {
    let active = true;
    listPosts(lang).then(result => {
      if (active) setPosts(result.slice(0, 3));
    });
    return () => {
      active = false;
    };
  }, [lang]);

  if (posts.length === 0) return null;

  return (
    <section id="news" className="border-t border-[var(--line)]">
      <div className="mx-auto max-w-6xl px-6 py-28">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <Eyebrow>{copy.news.eyebrow}</Eyebrow>
              <h2 className="landing-title mt-5">{copy.news.title}</h2>
              <p className="landing-lead mt-5 max-w-xl">{copy.news.body}</p>
            </div>
            <a href={`/${lang}/newsroom`} className="landing-cta landing-cta-ghost">
              {copy.news.all}
              <ArrowRight />
            </a>
          </div>
        </Reveal>

        <div
          className={`mt-14 grid gap-6 ${
            posts.length === 1
              ? 'md:max-w-md'
              : posts.length === 2
                ? 'md:grid-cols-2'
                : 'md:grid-cols-3'
          }`}
        >
          {posts.map((post, index) => (
            <Reveal key={post.id} delay={index * 80}>
              <article className="landing-card landing-news-card">
                <h3 className="landing-news-title">{post.title}</h3>
                {post.excerpt && <p className="landing-body mt-3">{post.excerpt}</p>}

                <div className="flex-1" />

                <dl className="mt-8">
                  <div className="landing-news-meta">
                    <dt className="landing-news-label">{copy.news.dateLabel}</dt>
                    <dd className="landing-news-value">
                      {formatPostDate(post.publishedAt, lang)}
                    </dd>
                  </div>
                  <div className="landing-news-meta">
                    <dt className="landing-news-label">{copy.news.categoryLabel}</dt>
                    <dd className="landing-news-value">
                      {post.kind || post.theme || copy.news.fallbackKind}
                    </dd>
                  </div>
                </dl>

                <a
                  href={`/${lang}/newsroom/${post.slug}`}
                  className="landing-cta landing-cta-primary mt-7 self-start !h-10 !px-4 !text-[0.8125rem]"
                >
                  {copy.news.read}
                  <ArrowRight />
                </a>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

type Theme = 'light' | 'dark';
type ThemeChoice = 'auto' | Theme;

function systemTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function useLandingTheme() {
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

  const theme: Theme = choice === 'auto' ? system : choice;
  return { theme, choice, choose };
}


export function LandingApp({ lang }: { lang: Lang }) {
  const copy = COPY[lang];
  const rememberLang = (next: Lang) => {
    try { localStorage.setItem('greLines_landingLang', next); } catch { }
  };
  const [stuck, setStuck] = useState(false);
  const { theme, choice, choose } = useLandingTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  const [animated, setAnimated] = useState(() => typeof IntersectionObserver !== 'undefined');

  useEffect(() => {
    if (!animated) return;

    const timer = window.setTimeout(() => {
      if (document.querySelector('.landing-reveal.is-visible')) return;
      setAnimated(false);
    }, 2000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title =
      lang === 'fr'
        ? 'Tous vos transports de Grenoble sur un seul écran \\ GreLines'
        : 'Every Grenoble transit network on a single screen \\ GreLines';
  }, [lang]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-menu]')) setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('click', onClick);
    };
  }, [menuOpen]);

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const marqueeTrack = [...PARTNERS, ...PARTNERS];

  return (
    <div className={`landing ${animated ? 'landing-anim' : ''}`} data-theme={theme}>
      <LandingHeader lang={lang} theme={theme} stuck={stuck} local />

      <div className="landing-surface">

        <section className="mx-auto max-w-6xl px-6 pb-24 pt-20 sm:pt-28">
          <div className="grid items-center gap-12 lg:grid-cols-[1fr_0.95fr]">
            <div>
          <Reveal>
            <Eyebrow>{copy.hero.eyebrow}</Eyebrow>
          </Reveal>

          <Reveal delay={70}>
            <h1 className="landing-display mt-6 max-w-4xl">
              {copy.hero.title}
              <br />
              <span className="text-[var(--fg-muted)]">{copy.hero.titleAccent}</span>
            </h1>
          </Reveal>

          <Reveal delay={140}>
            <div className="mt-10 max-w-2xl">
              {copy.heroLines.map(line => (
                <p key={line.lead} className="landing-proof border-t border-[var(--line)] py-4">
                  <strong>{line.lead}</strong> {line.rest}
                </p>
              ))}
            </div>
          </Reveal>

          <Reveal delay={210}>
            <div className="mt-10 flex flex-wrap gap-3">
              <a href="/app" className="landing-cta landing-cta-primary">
                {copy.hero.primary}
                <ArrowRight />
              </a>
              <a href="#features" className="landing-cta landing-cta-ghost">
                {copy.hero.secondary}
              </a>
            </div>
          </Reveal>

            </div>

            <Reveal delay={240}>
              <div className="mx-auto w-full max-w-[34rem] lg:-mr-8">
                <SoftImage
                  src={`${ASSETS}/header.png`}
                  alt={copy.hero.headerAlt}
                  className="h-auto w-full"
                  eager
                />
              </div>
            </Reveal>
          </div>
        </section>

        <section id="networks" className="border-t border-[var(--line)] py-16">
          <Reveal>
            <div className="mx-auto mb-12 max-w-6xl px-6">
              <Eyebrow>{copy.eyebrows.networks}</Eyebrow>
              <p className="landing-subtitle mt-4">{copy.marquee}</p>
            </div>
          </Reveal>
          <div className="landing-marquee">
            <div className="landing-marquee-track">
              {marqueeTrack.map((partner, index) => (
                <PartnerLogo key={`${partner.id}-${index}`} {...partner} />
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-[var(--line)]">
          <div className="mx-auto grid max-w-6xl grid-cols-2 lg:grid-cols-4">
            {copy.stats.map((stat, index) => (
              <Reveal key={stat.label} delay={index * 60}>
                <div
                  className={`h-full px-6 py-12 ${
                    index % 2 === 0 ? 'border-r border-[var(--line)]' : ''
                  } ${index < 2 ? 'border-b border-[var(--line)] lg:border-b-0' : ''} ${
                    index === 2 ? 'lg:border-r lg:border-[var(--line)]' : ''
                  }`}
                >
                  <div
                    className="text-4xl sm:text-5xl"
                    style={{
                      fontFamily: 'var(--display)',
                      fontWeight: 300,
                      letterSpacing: '-0.03em',
                    }}
                  >
                    {stat.value}
                  </div>
                  <div className="landing-body mt-3">{stat.label}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>
      </div>

      <div id="features" className="landing-surface border-t border-[var(--line)]">
        {copy.pillars.map((pillar, index) => (
          <section
            key={pillar.title}
            className={`border-b border-[var(--line)] ${index % 2 === 1 ? 'landing-surface-alt' : ''}`}
          >
            <div className="mx-auto max-w-6xl px-6 py-24">
              <div className="grid items-center gap-14 lg:grid-cols-2">
                <Reveal className={index % 2 === 1 ? 'lg:order-2' : ''}>
                  <div className="mx-auto w-full max-w-[32rem]">
                    <SoftImage
                      src={`${ASSETS}/photos/${pillar.photo}`}
                      alt={pillar.alt}
                      className="h-auto w-full"
                    />
                  </div>
                </Reveal>

                <Reveal delay={90}>
                  <div>
                    <h2 className="landing-title max-w-lg">{pillar.title}</h2>
                    <p className="landing-proof mt-8">
                      <strong>{pillar.proof.strong}</strong> {pillar.proof.rest}
                    </p>
                    <div className="landing-list mt-10">
                      {pillar.items.map(item => (
                        <div key={item.name} className="landing-list-item">
                          <span className="landing-list-name">{item.name}</span>
                          <span className="landing-list-note">{item.note}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </Reveal>
              </div>
            </div>
          </section>
        ))}
      </div>

      <div className="landing-surface">
        <LatestNews lang={lang} />

        <section className="border-t border-[var(--line)]">
          <div className="mx-auto max-w-6xl px-6 py-32 text-center">
            <Reveal>
              <Eyebrow>{copy.eyebrows.start}</Eyebrow>
              <h2 className="landing-display mx-auto mt-6 max-w-3xl">{copy.finalTitle}</h2>
              <p className="landing-lead mx-auto mt-8 max-w-lg">{copy.finalBody}</p>
              <div className="mt-12 flex justify-center">
                <a href="/app" className="landing-cta landing-cta-primary">
                  {copy.finalPrimary}
                  <ArrowRight />
                </a>
              </div>
            </Reveal>
          </div>
        </section>

        <LandingFooter
          lang={lang}
          theme={theme}
          choice={choice}
          onChoose={choose}
          onPickLang={rememberLang}
          local
        />
      </div>
    </div>
  );
}
