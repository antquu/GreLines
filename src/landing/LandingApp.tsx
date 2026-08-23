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
 * La page est entièrement claire ou entièrement sombre. Le thème est celui
 * choisi dans l'application — la vitrine relit le même réglage — et se change
 * depuis le pied de page. Les sections n'alternent plus les fonds : elles se
 * détachent par un second niveau de surface et par les filets.
 *
 * Aucune image n'est indispensable. Tant que `/assets/homepage` est vide, les
 * logos s'écrivent en toutes lettres, les captures laissent un cadre vide et
 * l'emplacement de la vidéo se remplit d'une trame. La page se tient debout
 * seule, et s'enrichit à mesure qu'on la remplit.
 */

import { useEffect, useRef, useState } from 'react';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import { COPY, PARTNERS, type Lang, type Partner } from './content';
import { LandingHeader } from './LandingHeader';
import { LandingFooter } from './LandingFooter';
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
    <div
      ref={ref}
      className={`landing-reveal ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
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
function SoftImage({
  src,
  alt,
  className = '',
  eager = false,
}: {
  src: string;
  alt: string;
  className?: string;
  /**
   * Vrai pour ce qui est visible d'emblée.
   *
   * Le chargement paresseux est une bonne idée partout, sauf sur la plus
   * grande image du haut de page : le navigateur attend alors d'avoir calculé
   * la mise en page pour décider de la télécharger, et l'on retarde
   * précisément ce qu'on voulait montrer en premier.
   */
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

/**
 * L'emplacement de la démonstration.
 *
 * Une vidéo si le fichier est là, une trame de traits obliques sinon. La trame
 * n'est empruntée à personne : elle est dessinée en CSS, et elle disparaît
 * d'elle-même le jour où la vidéo arrive.
 */
function Demo({ src, poster, ratio }: { src: string; poster?: string; ratio: string }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="landing-frame w-full" style={{ aspectRatio: ratio }}>
      {failed ? (
        <div className="landing-placeholder" aria-hidden />
      ) : (
        <video
          src={src}
          poster={poster}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

/** La hauteur d'encre commune à tous les logotypes du bandeau, en pixels. */
const LOGO_INK_HEIGHT = 26;

/**
 * Un logo de réseau, cadré sur son tracé.
 *
 * Le fichier employé est la version trouée de `svg/mono/`, produite par
 * `scripts/mono-logos.mjs` : dans les originaux, les contre-formes sont
 * peintes en blanc et non évidées, si bien qu'une fois ramenées à une seule
 * encre elles se referment — le « M » disparaît de son rond, la voiture de sa
 * goutte.
 *
 * L'image est agrandie jusqu'à ce que sa zone utile atteigne la hauteur
 * commune, puis décalée pour que le coin haut-gauche du tracé tombe dans le
 * coin de la fenêtre, qui rogne le vide. Tous les logotypes se retrouvent donc
 * à la même hauteur optique, quelle que soit la place qu'ils occupent dans
 * leur fichier — c'est ce qui fait qu'une rangée de marques paraît alignée.
 */
function PartnerLogo({ id, name, box }: Partner) {
  const [failed, setFailed] = useState(false);

  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  // La toile fait 1414 × 849, soit un rapport de 1,665.
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
            /* Pas de chargement différé : le bandeau défile, et ce qui est loin
               à droite n'entre jamais « dans la vue » au sens où le navigateur
               l'entend. Les fichiers font quelques kilo-octets, ils arrivent
               avec la page. */
          />
        </div>
      )}
    </div>
  );
}

/**
 * La pastille GL, en haut et en bas de la page.
 *
 * Deux fichiers, un par thème, et le nommage est celui du disque et non celui
 * du fond : `logo.png` est le disque noir, qu'on pose sur une page claire ;
 * `logo_light.png` est le disque blanc, pour la page sombre. Le nom du mot
 * s'écrit à côté, en toutes lettres — la pastille seule ne dit pas GreLines.
 */
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

/** L'intitulé d'une section : deux mots en mono, au-dessus du titre. */
function Eyebrow({ children }: { children: string }) {
  return <p className="landing-eyebrow">{children}</p>;
}




type Theme = 'light' | 'dark';
type ThemeChoice = 'auto' | Theme;

/** Ce que le système annonce à cet instant. */
function systemTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/**
 * Le thème de la vitrine.
 *
 * Trois choix, comme partout : suivre le système, forcer le clair, forcer le
 * sombre. Le réglage vit sous la même clé que celui de l'application —
 * `greLines_theme` — et suit la même convention : « light » ou « dark » écrits
 * en toutes lettres, tout le reste valant « suivre le système ». Quelqu'un qui
 * arrive ici depuis les réglages ne voit donc pas la page basculer sous ses
 * yeux, et ce qu'il change ici vaut aussi pour l'application.
 */
function useLandingTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(() => {
    try {
      const stored = localStorage.getItem('greLines_theme');
      if (stored === 'light' || stored === 'dark') return stored;
      // « bleu » est l'autre sombre de l'application : la vitrine, qui n'a
      // qu'un noir, le traite comme du sombre.
      if (stored === 'blue') return 'dark';
    } catch {
      // Stockage refusé : on suivra le système, comme n'importe quel visiteur.
    }
    return 'auto';
  });

  const [system, setSystem] = useState<Theme>(systemTheme);

  /* En automatique, la page suit le système jusque dans ses changements. */
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
      // Le choix ne tiendra que le temps de la visite.
    }
  };

  const theme: Theme = choice === 'auto' ? system : choice;
  return { theme, choice, choose };
}

/* -------------------------------------------------------------------------
 * La page.
 * ---------------------------------------------------------------------- */

export function LandingApp({ lang }: { lang: Lang }) {
  const copy = COPY[lang];
  /* Basculer depuis le pied de page est un choix : il est retenu, et la
     détection de langue cesse alors de s'en mêler. */
  const rememberLang = (next: Lang) => {
    try { localStorage.setItem('greLines_landingLang', next); } catch { /* ignoré */ }
  };
  const [stuck, setStuck] = useState(false);
  const { theme, choice, choose } = useLandingTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  /**
   * L'animation d'apparition, activée seulement si l'on sait la mener à bien.
   *
   * Le contenu est visible par défaut ; ce n'est qu'en posant cette classe
   * qu'on le cache en attendant qu'il entre dans le champ. Faute
   * d'`IntersectionObserver`, on ne le cache donc jamais.
   */
  const [animated, setAnimated] = useState(() => typeof IntersectionObserver !== 'undefined');

  useEffect(() => {
    if (!animated) return;

    /*
     * Le garde-fou.
     *
     * Un observateur peut exister sans jamais rien signaler — onglet en
     * arrière-plan au chargement, rendu non composité, extension qui s'en
     * mêle. Passé deux secondes sans qu'un seul bloc soit apparu, on renonce à
     * l'animation et l'on montre tout : une page de présentation vide est bien
     * pire qu'une page sans effet.
     */
    const timer = window.setTimeout(() => {
      if (document.querySelector('.landing-reveal.is-visible')) return;
      setAnimated(false);
    }, 2000);
    return () => window.clearTimeout(timer);
    // Une seule mise en place, au montage : `animated` ne passe de vrai à faux
    // qu'ici même, et relancer la minuterie sur ce changement la ferait tourner
    // pour rien.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    /*
     * « Page / Marque », la marque en dernier.
     *
     * Un onglet est souvent assez étroit pour ne montrer que ses premiers
     * caractères : ce qui distingue celui-ci des sept autres doit donc venir en
     * premier — et dans une rangée d'onglets GreLines, « GreLines » est
     * précisément ce qui ne distingue rien.
     */
    document.title =
      lang === 'fr'
        ? 'Tous vos transports de Grenoble sur un seul écran \\ GreLines'
        : 'Every Grenoble transit network on a single screen \\ GreLines';
  }, [lang]);

  /*
   * Le menu se referme comme on s'y attend : par la touche d'échappement, et
   * en cliquant ailleurs. Sans quoi il resterait ouvert dans le dos de celui
   * qui a repris sa lecture plus bas.
   */
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
    <div className={`landing ${animated ? 'landing-anim' : ''}`} data-theme={theme}>
      {/* ================================================== pièce sombre */}
      <div className="landing-surface">
        <LandingHeader lang={lang} theme={theme} stuck={stuck} local />

        {/* ------------------------------------------------ hero */}
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

          {/* Les trois raisons d'ouvrir l'application, empilées sous le titre.
              Chacune commence par sa proposition en pleine encre, la suite en
              gris : le regard descend la colonne des amorces sans avoir à lire
              les phrases entières. */}
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

            {/* Le montage du réseau, à droite du titre.
                Posé sans cadre ni filet : le fichier est détouré, et
                l'enfermer dans une boîte rendrait le détourage inutile. C'est
                aussi la seule image en couleurs de la page — le reste étant
                d'une neutralité stricte, elle porte tout le regard, et la
                désaturer reviendrait à éteindre la seule chose qui montre le
                réseau tel qu'il est. */}
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

        {/* ------------------------------------------------ réseaux */}
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

        {/* ------------------------------------------------ chiffres */}
        <section className="border-t border-[var(--line)]">
          <div className="mx-auto grid max-w-6xl grid-cols-2 lg:grid-cols-4">
            {copy.stats.map((stat, index) => (
              <Reveal key={stat.label} delay={index * 60}>
                {/* Les filets ne se posent qu'entre les cases, jamais au bord :
                    d'où ces conditions, qui suivent le nombre de colonnes. */}
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

      {/* ================================================== les piliers */}
      <div id="features" className="landing-surface border-t border-[var(--line)]">
        {copy.pillars.map((pillar, index) => (
          <section
            key={pillar.title}
            className={`border-b border-[var(--line)] ${index % 2 === 1 ? 'landing-surface-alt' : ''}`}
          >
            <div className="mx-auto max-w-6xl px-6 py-24">
              <div className="grid items-center gap-14 lg:grid-cols-2">
                {/* Le visuel change de côté d'un pilier à l'autre. `order` et
                    non deux mises en page : la lecture reste la même sur
                    téléphone, où tout se remet en colonne. */}
                <Reveal className={index % 2 === 1 ? 'lg:order-2' : ''}>
                  <div className="landing-media" style={{ aspectRatio: '4 / 3' }}>
                    <SoftImage
                      src={`${ASSETS}/photos/${pillar.photo}`}
                      alt={pillar.alt}
                      className="landing-photo"
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

      {/* ================================================== pièce sombre */}
      <div className="landing-surface">
        {/* ------------------------------------------------ écrans */}
        <section id="screens" className="mx-auto max-w-6xl px-6 py-28">
          <div className="grid items-center gap-16 lg:grid-cols-2">
            <Reveal>
              <div>
                <Eyebrow>{copy.eyebrows.screens}</Eyebrow>
                <h2 className="landing-title mt-5">{copy.screenTitle}</h2>
                <p className="landing-lead mt-6">{copy.screenBody}</p>
                <p className="landing-eyebrow mt-8">{copy.screenNote}</p>
                <a href="/app/screen" className="landing-cta landing-cta-ghost mt-8">
                  {copy.nav.screens}
                  <ArrowRight />
                </a>
              </div>
            </Reveal>

            <Reveal delay={90}>
              <Demo src={`${ASSETS}/ecran.mp4`} poster={`${ASSETS}/ecran.png`} ratio="16 / 9" />
            </Reveal>
          </div>
        </section>

        {/* ------------------------------------------------ appel final */}
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

        {/* ------------------------------------------------ pied */}
        {/* ------------------------------------------------ pied de page */}
        <LandingFooter
          lang={lang}
          theme={theme}
          choice={choice}
          onChoose={choose}
          onPickLang={rememberLang}
        />
      </div>
    </div>
  );
}
