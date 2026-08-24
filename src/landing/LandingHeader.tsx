/**
 * La barre du haut, partagée par la page d'accueil et les pages légales.
 *
 * Elle vivait dans `LandingApp`, et les pages légales en avaient reçu une
 * version amputée : la marque, un lien de retour, le bouton d'ouverture. C'était
 * une erreur. Une page légale n'est pas une impasse — on y arrive souvent depuis
 * un pied de page, on la lit, et l'on veut ensuite voir ce que fait le produit.
 * Lui retirer la navigation, c'est obliger à revenir en arrière pour reprendre
 * sa visite.
 *
 * Les liens de section pointent vers la page d'accueil et non vers une ancre
 * locale : `#features` ne désigne rien dans un document juridique. Ils portent
 * donc leur chemin complet, `/fr#features`, ce qui marche depuis n'importe où.
 */

import { useEffect, useState } from 'react';
import type { Lang } from './content';
import { COPY } from './content';

type Theme = 'light' | 'dark';

const ASSETS = '/assets/homepage';

/**
 * La pastille seule, à gauche de la barre.
 *
 * Le nom ne l'accompagne plus. Sur un site qui n'appartient qu'à GreLines,
 * l'écrire à côté de sa propre marque ne distingue rien, et prend la place que
 * la navigation réclame. Le mot revient dans le pied de page et dans le titre
 * de l'onglet, où il sert vraiment.
 *
 * Si le fichier manque, le nom réapparaît : un en-tête sans rien à gauche
 * n'aurait plus de lien de retour visible.
 */
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
  /**
   * Sur la page d'accueil, les liens de section sont des ancres locales : le
   * défilement reste doux et l'adresse ne change pas de page. Ailleurs, ils
   * doivent d'abord ramener à l'accueil.
   */
  local = false,
}: {
  lang: Lang;
  theme: Theme;
  stuck?: boolean;
  local?: boolean;
}) {
  const copy = COPY[lang];
  /** Le panneau ouvert, s'il y en a un : « solutions », « resources », ou rien. */
  const [openMenu, setOpenMenu] = useState<'solutions' | 'resources' | null>(null);
  const isFr = lang === 'fr';

  /**
   * Les ressources : ce qu'on lit à propos du produit, par opposition aux
   * solutions, qui sont ce qu'on achète. Deux entrées seulement — mieux vaut un
   * menu court et vrai qu'un menu fourni de liens qui ne mènent nulle part.
   */
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
  /*
   * Les liens du panneau des solutions viennent du contenu, et plusieurs sont
   * de simples ancres. Hors de la page d'accueil, une ancre ne désigne rien :
   * on lui rend son chemin. Les adresses complètes et les chemins absolus
   * passent sans être touchés.
   */
  const solutionHref = (href: string) =>
    !local && href.startsWith('#') ? `/${lang}${href}` : href;

  /* Le menu se referme comme on s'y attend : par la touche d'échappement, et
     en touchant ailleurs. */
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
      /*
       * Le survol ouvre, mais ne referme pas.
       *
       * Le bouton n'occupe que la hauteur de son texte, et le panneau commence
       * au bas de l'en-tête : en descendant vers un lien, le pointeur traversait
       * une bande qui n'appartenait ni à l'un ni à l'autre, le menu se refermait,
       * et l'on n'atteignait jamais ce qu'on visait. La fermeture est donc
       * confiée à l'en-tête entier, qu'on ne quitte qu'en s'en allant pour de bon.
       */
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

      {/* Le panneau des solutions. Il appartient à l'en-tête et non à la barre :
          il court sur toute la largeur, comme un rayon qui descend. */}
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
