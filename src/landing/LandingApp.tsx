/**
 * La vitrine de GreLines.
 *
 * Servie sur `/fr` et `/en`, et sur elles seules : `/` continue de mener droit
 * à l'application. On n'arrive donc ici que délibérément — par les réglages,
 * par un lien partagé, par un moteur de recherche.
 *
 * Elle est montée avant `App`, dans `main.tsx`, et ne charge rien de
 * l'application : ni carte, ni requêtes réseau, ni service d'horaires. Une page
 * de présentation qui met trois secondes à s'afficher ne présente rien du tout.
 *
 * Aucune image n'est indispensable. Tant que `/assets/homepage` est vide, les
 * logos s'écrivent en toutes lettres et les captures laissent un cadre sombre :
 * la page se tient debout seule, et s'enrichit à mesure qu'on la remplit.
 */

import { useEffect, useRef, useState } from 'react';
import { COPY, PARTNERS, type Lang } from './content';
import './landing.css';

const ASSETS = '/assets/homepage';

/* -------------------------------------------------------------------------
 * Petits outils de page.
 * ---------------------------------------------------------------------- */

/**
 * Fait apparaître un bloc quand il entre dans le champ.
 *
 * Une seule fois : un contenu qui rejoue son animation à chaque passage donne
 * le mal de mer sur une page qu'on parcourt de haut en bas puis de bas en haut.
 */
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

/**
 * Une image qui s'efface si elle n'existe pas.
 *
 * Le dossier `/assets/homepage` se remplit au fil du temps ; d'ici là, mieux
 * vaut un cadre vide qu'une icône brisée. `onError` retire l'image, le parent
 * garde sa place.
 */
function SoftImage({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} loading="lazy" />;
}

/** Un logo de réseau, ou son nom quand le fichier n'est pas encore là. */
function PartnerLogo({ id, name }: { id: string; name: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="landing-logo-item flex flex-shrink-0 items-center justify-center px-8 py-2 sm:px-10">
      {failed ? (
        <span className="landing-logo-text">{name}</span>
      ) : (
        <img
          src={`${ASSETS}/logos/${id}.svg`}
          alt={name}
          className="landing-logo"
          onError={() => setFailed(true)}
          loading="lazy"
        />
      )}
    </div>
  );
}

/** Le mot-symbole de l'en-tête, avec le même repli. */
function Wordmark() {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="text-lg font-extrabold tracking-tight text-white">GreLines</span>
    );
  }
  return (
    <img
      src={`${ASSETS}/logo.svg`}
      alt="GreLines"
      className="h-7 w-auto"
      onError={() => setFailed(true)}
    />
  );
}

function ArrowRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/* -------------------------------------------------------------------------
 * La page.
 * ---------------------------------------------------------------------- */

export function LandingApp({ lang }: { lang: Lang }) {
  const copy = COPY[lang];
  const other: Lang = lang === 'fr' ? 'en' : 'fr';
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title =
      lang === 'fr'
        ? 'GreLines — tous vos transports de Grenoble sur un seul écran'
        : 'GreLines — every Grenoble transit network on a single screen';
  }, [lang]);

  /* L'en-tête ne prend son fond qu'une fois la page défilée. */
  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // La piste du bandeau est doublée : la seconde moitié est la copie de la
  // première, ce qui rend la reprise invisible.
  const marqueeTrack = [...PARTNERS, ...PARTNERS];

  return (
    <div className="landing">
      <div className="landing-aurora" aria-hidden />
      <div className="landing-grid" aria-hidden />

      <div className="landing-content">
        {/* ------------------------------------------------ en-tête */}
        <header className={`landing-header ${stuck ? 'is-stuck' : ''}`}>
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
            <a href={`/${lang}`} className="flex items-center gap-2">
              <Wordmark />
            </a>

            <nav className="hidden items-center gap-8 text-sm font-medium md:flex">
              <a href="#features" className="landing-link">{copy.nav.features}</a>
              <a href="#networks" className="landing-link">{copy.nav.networks}</a>
              <a href="#screens" className="landing-link">{copy.nav.screens}</a>
            </nav>

            <div className="flex items-center gap-3">
              <a href={`/${other}`} className="landing-link hidden text-sm font-medium sm:block">
                {copy.switchLang}
              </a>
              <a href="/app" className="landing-cta landing-cta-primary !h-10 !px-5 !text-sm">
                {copy.nav.open}
              </a>
            </div>
          </div>
        </header>

        {/* ------------------------------------------------ hero */}
        <section className="mx-auto max-w-6xl px-6 pb-20 pt-16 sm:pt-24">
          <div className="grid items-center gap-16 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <Reveal>
                <span className="landing-eyebrow">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {copy.hero.eyebrow}
                </span>
              </Reveal>

              <Reveal delay={80}>
                <h1 className="landing-display mt-7">
                  {copy.hero.title}
                  <br />
                  {copy.hero.titleAccent}
                </h1>
              </Reveal>

              <Reveal delay={160}>
                <p className="mt-7 max-w-xl text-[1.0625rem] leading-relaxed text-[var(--ink-soft)]">
                  {copy.hero.body}
                </p>
              </Reveal>

              <Reveal delay={240}>
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

            <Reveal delay={200}>
              <div className="mx-auto w-full max-w-[17rem]">
                <div className="landing-phone">
                  <div className="landing-phone-screen">
                    <SoftImage src={`${ASSETS}/app-carte.png`} alt="GreLines" />
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ------------------------------------------------ réseaux */}
        <section id="networks" className="border-y border-[var(--line)] py-14">
          <Reveal>
            <p className="mb-9 text-center text-sm font-medium text-[var(--ink-faint)]">
              {copy.marquee}
            </p>
          </Reveal>
          <div className="landing-marquee">
            <div className="landing-marquee-track">
              {marqueeTrack.map((partner, index) => (
                <PartnerLogo key={`${partner.id}-${index}`} id={partner.id} name={partner.name} />
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ chiffres */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid grid-cols-2 gap-x-6 gap-y-12 lg:grid-cols-4">
            {copy.stats.map((stat, index) => (
              <Reveal key={stat.label} delay={index * 70}>
                <div>
                  <div className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
                    {stat.value}
                  </div>
                  <div className="mt-2 text-sm text-[var(--ink-soft)]">{stat.label}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------ fonctionnalités */}
        <section id="features" className="mx-auto max-w-6xl px-6 py-20">
          <Reveal>
            <h2 className="landing-title max-w-2xl">{copy.featuresTitle}</h2>
            <p className="mt-5 max-w-xl text-[1.0625rem] leading-relaxed text-[var(--ink-soft)]">
              {copy.featuresBody}
            </p>
          </Reveal>

          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {copy.features.map((feature, index) => (
              <Reveal key={feature.title} delay={(index % 3) * 80}>
                <div className="landing-card h-full p-7">
                  <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--line)] bg-white/5">
                    <SoftImage
                      src={`${ASSETS}/icons/${feature.icon}.svg`}
                      alt=""
                      className="h-5 w-5 opacity-80"
                    />
                  </div>
                  <h3 className="text-[1.0625rem] font-bold text-white">{feature.title}</h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-[var(--ink-soft)]">
                    {feature.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------ captures */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <Reveal>
            <h2 className="landing-title max-w-2xl">{copy.showcaseTitle}</h2>
            <p className="mt-5 max-w-xl text-[1.0625rem] leading-relaxed text-[var(--ink-soft)]">
              {copy.showcaseBody}
            </p>
          </Reveal>

          <div className="mt-16 grid gap-10 sm:grid-cols-3">
            {copy.showcase.map((item, index) => (
              <Reveal key={item.title} delay={index * 90}>
                <div>
                  <div className="landing-phone">
                    <div className="landing-phone-screen">
                      <SoftImage src={`${ASSETS}/${item.image}`} alt={item.title} />
                    </div>
                  </div>
                  <h3 className="mt-7 text-[1.0625rem] font-bold text-white">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]">{item.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------ écrans */}
        <section id="screens" className="mx-auto max-w-6xl px-6 py-20">
          <Reveal>
            <div className="landing-card overflow-hidden p-8 sm:p-12">
              <div className="grid items-center gap-12 lg:grid-cols-2">
                <div>
                  <h2 className="landing-title">{copy.screenTitle}</h2>
                  <p className="mt-5 text-[1.0625rem] leading-relaxed text-[var(--ink-soft)]">
                    {copy.screenBody}
                  </p>
                  <p className="mt-6 text-sm text-[var(--ink-faint)]">{copy.screenNote}</p>
                  <a href="/app/screen" className="landing-cta landing-cta-ghost mt-8">
                    {copy.nav.screens}
                    <ArrowRight />
                  </a>
                </div>

                <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[#0b0f18]">
                  <div
                    className="w-full"
                    style={{ aspectRatio: '16 / 9' }}
                  >
                    <SoftImage
                      src={`${ASSETS}/ecran.png`}
                      alt="GreLines Screen"
                      className="h-full w-full object-cover"
                    />
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ------------------------------------------------ appel final */}
        <section className="mx-auto max-w-6xl px-6 py-24">
          <Reveal>
            <div className="landing-card px-8 py-20 text-center sm:px-12">
              <h2 className="landing-display mx-auto max-w-3xl !text-[clamp(2rem,5vw,3.5rem)]">
                {copy.finalTitle}
              </h2>
              <p className="mx-auto mt-6 max-w-lg text-[1.0625rem] leading-relaxed text-[var(--ink-soft)]">
                {copy.finalBody}
              </p>
              <div className="mt-10 flex justify-center">
                <a href="/app" className="landing-cta landing-cta-primary">
                  {copy.finalPrimary}
                  <ArrowRight />
                </a>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ------------------------------------------------ pied */}
        <footer className="border-t border-[var(--line)]">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-md">
              <Wordmark />
              <p className="mt-4 text-sm leading-relaxed text-[var(--ink-faint)]">
                {copy.footerNote}
              </p>
            </div>
            <div className="flex flex-col gap-3 text-sm sm:items-end">
              <a href="/app" className="landing-link">{copy.nav.open}</a>
              <a href={`/${other}`} className="landing-link">{copy.switchLang}</a>
              <span className="text-[var(--ink-faint)]">
                © {new Date().getFullYear()} GreLines · {copy.footerLegal}
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
