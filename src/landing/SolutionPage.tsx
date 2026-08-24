/**
 * La page d'une solution, servie sur `/fr/solutions/<slug>`.
 *
 * Six pages, un seul composant, une seule charpente. C'est délibéré : un
 * exploitant qui compare deux offres ne veut pas réapprendre où regarder à
 * chaque page. Le plan est toujours le même, du haut vers le bas :
 *
 *   une affirmation et un visuel
 *   trois raisons, en une ligne chacune
 *   quatre chiffres
 *   trois étapes, en images
 *   quatre capacités, en images
 *   une bande large
 *   trois détails
 *   les autres solutions, puis un appel
 *
 * L'en-tête et le pied de page sont ceux du site. Ces pages ne sont pas des
 * pages d'atterrissage détachées : on y arrive depuis le menu « Solutions »,
 * et l'on doit pouvoir en repartir par où l'on est venu.
 *
 * Les images sont toutes facultatives. Tant qu'un fichier manque, son cadre
 * disparaît et le texte se referme dessus : la page se tient debout vide, et
 * s'enrichit à mesure qu'on remplit `/assets/homepage/solutions/<slug>/`.
 */

import { useEffect, useRef, useState } from 'react';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './landing.css';
import { type Lang } from './content';
import { LandingHeader } from './LandingHeader';
import { LandingFooter } from './LandingFooter';
import { CHROME, SOLUTIONS, findSolution } from './solutionsContent';

const ASSETS = '/assets/homepage';

type Theme = 'light' | 'dark';
type ThemeChoice = 'auto' | Theme;

/* -------------------------------------------------------------------------
 * Le thème, tenu comme sur le reste du site.
 * ---------------------------------------------------------------------- */

function systemTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function useSolutionTheme() {
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
 * Petits outils de page, repris de la vitrine.
 * ---------------------------------------------------------------------- */

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
    <div ref={ref} className={`landing-reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
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

/**
 * Une image qui s'efface si elle n'existe pas, et son cadre avec elle.
 *
 * Le dossier des visuels se remplit au fil du temps. D'ici là, mieux vaut que
 * la place disparaisse qu'un rectangle vide reste : douze cadres gris sur une
 * page de vente donnent l'impression d'un site en travaux.
 */
function Shot({
  src,
  alt,
  className = '',
  eager = false,
  onMissing,
}: {
  src: string;
  alt: string;
  className?: string;
  eager?: boolean;
  /**
   * Prévenu quand le fichier n'est pas là.
   *
   * Le cadre disparaît tout seul, mais la place qu'il occupait dans une mise en
   * page à deux colonnes, elle, ne disparaît pas : la colonne reste, vide. Ce
   * signal permet au parent de refermer la mise en page dessus.
   */
  onMissing?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <div className={`solution-shot ${className}`}>
      <img
        src={src}
        alt={alt}
        onError={() => {
          setFailed(true);
          onMissing?.();
        }}
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={eager ? 'high' : undefined}
        decoding={eager ? 'sync' : 'async'}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------
 * La page.
 * ---------------------------------------------------------------------- */

export function SolutionPage({ lang, slug }: { lang: Lang; slug?: string }) {
  const { theme, choice, choose } = useSolutionTheme();
  const [stuck, setStuck] = useState(false);
  /* Le visuel de tête manque tant qu'il n'a pas été dessiné. Sans lui, le titre
     prend toute la largeur au lieu de laisser la moitié de la page blanche. */
  const [hasHero, setHasHero] = useState(true);
  const chrome = CHROME[lang];
  const solution = findSolution(lang, slug);

  /*
   * L'animation d'apparition, activée seulement si l'on sait la mener à bien.
   * Le contenu est visible par défaut ; c'est en posant cette classe qu'on le
   * cache en attendant qu'il entre dans le champ.
   */
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
    const onScroll = () => setStuck(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = solution ? `${solution.name} \\ GreLines` : 'Solutions \\ GreLines';
  }, [lang, solution]);

  /*
   * Une adresse inventée renvoie la liste des six solutions plutôt qu'une page
   * vide. Un lien devenu faux après un renommage rend donc quelque chose
   * d'utile, et l'on ne perd pas le visiteur.
   */
  if (!solution) {
    return (
      <SolutionIndex
        lang={lang}
        theme={theme}
        choice={choice}
        choose={choose}
        stuck={stuck}
        animated={animated}
      />
    );
  }

  /* Les visuels d'une solution vivent dans son dossier. Le seul qui puisse
     être ailleurs est celui de tête, quand le contenu lui donne un chemin. */
  const asset = (name: string) => `${ASSETS}/solutions/${solution.slug}/${name}`;
  const hero = `${ASSETS}/${solution.hero ?? `solutions/${solution.slug}/hero.png`}`;
  const others = SOLUTIONS[lang].filter(item => item.slug !== solution.slug);

  return (
    <div className={`landing ${animated ? 'landing-anim' : ''}`} data-theme={theme}>
      <LandingHeader lang={lang} theme={theme} stuck={stuck} />

      <div className="landing-surface">
        {/* ------------------------------------------------ hero */}
        <section className="mx-auto max-w-6xl px-6 pb-20 pt-16 sm:pt-24">
          <nav className="solution-crumbs" aria-label={chrome.eyebrow}>
            <a href={`/${lang}`}>{chrome.home}</a>
            <span aria-hidden>/</span>
            <span className="solution-crumb-current">{solution.name}</span>
          </nav>

          <div
            className={`mt-8 grid items-center gap-12 ${hasHero ? 'lg:grid-cols-[1fr_0.9fr]' : ''}`}
          >
            <div>
              <Reveal>
                <Eyebrow>{solution.eyebrow}</Eyebrow>
              </Reveal>

              <Reveal delay={70}>
                <h1 className={`landing-title mt-5 ${hasHero ? 'max-w-2xl' : 'max-w-4xl'}`}>
                  {solution.title}
                </h1>
              </Reveal>

              <Reveal delay={140}>
                <p className={`landing-lead mt-6 ${hasHero ? 'max-w-xl' : 'max-w-2xl'}`}>
                  {solution.lead}
                </p>
              </Reveal>

              {/* Les trois raisons, chacune ouverte par sa proposition en pleine
                  encre : le regard descend la colonne des amorces sans avoir à
                  lire les phrases entières. */}
              <Reveal delay={210}>
                <div className={`mt-10 ${hasHero ? 'max-w-xl' : 'max-w-2xl'}`}>
                  {solution.points.map(point => (
                    <p key={point.lead} className="landing-proof border-t border-[var(--line)] py-4">
                      <strong>{point.lead}</strong> {point.rest}
                    </p>
                  ))}
                </div>
              </Reveal>

              <Reveal delay={280}>
                <div className="mt-10 flex flex-wrap gap-3">
                  <a href={solution.primary.href} className="landing-cta landing-cta-primary">
                    {solution.primary.label}
                    <ArrowRight />
                  </a>
                  <a href={solution.secondary.href} className="landing-cta landing-cta-ghost">
                    {solution.secondary.label}
                  </a>
                </div>
              </Reveal>
            </div>

            <Reveal delay={240}>
              <Shot
                src={hero}
                alt={solution.heroAlt}
                className="is-bare"
                eager
                onMissing={() => setHasHero(false)}
              />
            </Reveal>
          </div>
        </section>

        {/* ------------------------------------------------ chiffres */}
        <section className="border-t border-[var(--line)]">
          <div className="mx-auto grid max-w-6xl grid-cols-2 lg:grid-cols-4">
            {solution.stats.map((stat, index) => (
              <Reveal key={stat.label} delay={index * 60}>
                {/* Les filets ne se posent qu'entre les cases, jamais au bord. */}
                <div
                  className={`h-full px-6 py-12 ${
                    index % 2 === 0 ? 'border-r border-[var(--line)]' : ''
                  } ${index < 2 ? 'border-b border-[var(--line)] lg:border-b-0' : ''} ${
                    index === 2 ? 'lg:border-r lg:border-[var(--line)]' : ''
                  }`}
                >
                  <div
                    className="text-3xl sm:text-4xl"
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

      {/* ------------------------------------------------ les trois étapes */}
      <div className="landing-surface-alt border-t border-[var(--line)]">
        <section className="mx-auto max-w-6xl px-6 py-24">
          <Reveal>
            <h2 className="landing-title max-w-2xl">{solution.stepsTitle}</h2>
            <p className="landing-lead mt-5 max-w-xl">{solution.stepsLead}</p>
          </Reveal>

          <div className="mt-14 grid gap-10 md:grid-cols-3">
            {solution.steps.map((step, index) => (
              <Reveal key={step.title} delay={index * 80}>
                <div>
                  <Shot src={asset(`step-${index + 1}.png`)} alt={step.title} />
                  <p className="solution-step-mark mt-6">{String(index + 1).padStart(2, '0')}</p>
                  <h3 className="landing-subtitle mt-2">{step.title}</h3>
                  <p className="landing-body mt-3">{step.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>
      </div>

      {/* ------------------------------------------------ les capacités */}
      <div className="landing-surface border-t border-[var(--line)]">
        <section className="mx-auto max-w-6xl px-6 py-24">
          <Reveal>
            <h2 className="landing-title max-w-2xl">{solution.featuresTitle}</h2>
            <p className="landing-lead mt-5 max-w-xl">{solution.featuresLead}</p>
          </Reveal>

          <div className="mt-14 grid gap-6 sm:grid-cols-2">
            {solution.features.map((feature, index) => (
              <Reveal key={feature.title} delay={index * 70}>
                <div className="landing-card solution-feature">
                  <Shot src={asset(`feature-${index + 1}.png`)} alt={feature.title} />
                  <h3 className="landing-subtitle mt-6">{feature.title}</h3>
                  <p className="landing-body mt-3">{feature.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>
      </div>

      {/* ------------------------------------------------ la bande large */}
      <div className="landing-surface-alt border-t border-[var(--line)]">
        <section className="mx-auto max-w-6xl px-6 py-24">
          <Reveal>
            <Shot src={asset('wide.png')} alt={solution.bandAlt} className="is-wide" />
          </Reveal>
          <Reveal delay={80}>
            <div className="mt-12 grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
              <h2 className="landing-title">{solution.bandTitle}</h2>
              <p className="landing-lead">{solution.bandBody}</p>
            </div>
          </Reveal>
        </section>
      </div>

      {/* ------------------------------------------------ les trois détails */}
      <div className="landing-surface border-t border-[var(--line)]">
        <section className="mx-auto max-w-6xl px-6 py-24">
          <Reveal>
            <h2 className="landing-title max-w-2xl">{solution.galleryTitle}</h2>
          </Reveal>

          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {solution.gallery.map((item, index) => (
              <Reveal key={item.title} delay={index * 70}>
                <div>
                  <Shot src={asset(`detail-${index + 1}.png`)} alt={item.title} />
                  <h3 className="landing-subtitle mt-5">{item.title}</h3>
                  <p className="landing-body mt-3">{item.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>
      </div>

      {/* ------------------------------------------------ les autres solutions */}
      <div className="landing-surface-alt border-t border-[var(--line)]">
        <section className="mx-auto max-w-6xl px-6 py-24">
          <Reveal>
            <Eyebrow>{chrome.eyebrow}</Eyebrow>
            <h2 className="landing-title mt-4">{chrome.othersTitle}</h2>
            <p className="landing-lead mt-4 max-w-xl">{chrome.othersLead}</p>
          </Reveal>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((item, index) => (
              <Reveal key={item.slug} delay={index * 50}>
                <a
                  href={`/${lang}/solutions/${item.slug}`}
                  className="landing-card solution-other h-full"
                >
                  <p className="landing-eyebrow">{item.eyebrow}</p>
                  <h3 className="solution-other-name mt-3">{item.name}</h3>
                  <p className="landing-list-note mt-2">{item.lead.split('.')[0]}.</p>
                </a>
              </Reveal>
            ))}
          </div>
        </section>
      </div>

      {/* ------------------------------------------------ appel final */}
      <div className="landing-surface border-t border-[var(--line)]">
        <section className="mx-auto max-w-6xl px-6 py-28 text-center">
          <Reveal>
            <h2 className="landing-display mx-auto max-w-3xl">{solution.finalTitle}</h2>
            <p className="landing-lead mx-auto mt-8 max-w-lg">{solution.finalBody}</p>
            <div className="mt-12 flex flex-wrap justify-center gap-3">
              <a href={solution.primary.href} className="landing-cta landing-cta-primary">
                {solution.primary.label}
                <ArrowRight />
              </a>
              <a href={`/${lang}/docs`} className="landing-cta landing-cta-ghost">
                {chrome.docs}
              </a>
            </div>
          </Reveal>
        </section>

        <LandingFooter lang={lang} theme={theme} choice={choice} onChoose={choose} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * La liste, quand aucune solution n'est nommée.
 * ---------------------------------------------------------------------- */

function SolutionIndex({
  lang,
  theme,
  choice,
  choose,
  stuck,
  animated,
}: {
  lang: Lang;
  theme: Theme;
  choice: ThemeChoice;
  choose: (next: ThemeChoice) => void;
  stuck: boolean;
  animated: boolean;
}) {
  const chrome = CHROME[lang];
  const all = SOLUTIONS[lang];

  return (
    <div className={`landing ${animated ? 'landing-anim' : ''}`} data-theme={theme}>
      <LandingHeader lang={lang} theme={theme} stuck={stuck} />

      <div className="landing-surface min-h-screen">
        <section className="mx-auto max-w-6xl px-6 pb-24 pt-20">
          <Reveal>
            <Eyebrow>{chrome.eyebrow}</Eyebrow>
            <h1 className="landing-title mt-5 max-w-2xl">{chrome.indexTitle}</h1>
            <p className="landing-lead mt-5 max-w-xl">{chrome.indexLead}</p>
          </Reveal>

          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {all.map((item, index) => (
              <Reveal key={item.slug} delay={index * 50}>
                <a
                  href={`/${lang}/solutions/${item.slug}`}
                  className="landing-card solution-other h-full"
                >
                  <p className="landing-eyebrow">{item.eyebrow}</p>
                  <h2 className="solution-other-name mt-3">{item.name}</h2>
                  <p className="landing-list-note mt-2">{item.lead.split('.')[0]}.</p>
                </a>
              </Reveal>
            ))}
          </div>
        </section>

        <LandingFooter lang={lang} theme={theme} choice={choice} onChoose={choose} />
      </div>
    </div>
  );
}
