/**
 * Mettre GreLines sur l'écran d'accueil.
 *
 * Deux tutoriels, un par famille d'appareils, et l'appareil décide seul lequel
 * s'affiche. Il n'y a rien à choisir : quelqu'un qui tient un iPhone n'a pas à
 * se demander s'il est « Apple » ou « Android » avant de pouvoir lire la
 * première étape, et un onglet qui ne servira jamais à ce téléphone-là ne fait
 * qu'occuper la place.
 *
 * La capture prend le haut de la feuille, le texte et les boutons restent en
 * bas : d'une étape à l'autre, seule l'image change, et l'on n'a pas à
 * rattraper des yeux un bouton qui a bougé parce que la capture précédente
 * était plus haute.
 *
 * Les captures viennent de `/assets/tuto`. Elles sont toutes dessinées sur une
 * toile deux fois plus large que haute, mais ce qu'elles montrent n'occupe pas
 * la même part de cette toile : la barre d'adresse est un ruban très large et
 * très plat, le menu de Safari une colonne plus haute que large. Affichées
 * toutes au même format, les unes déborderaient et les autres seraient perdues
 * au milieu du vide. Chacune porte donc la mesure de sa zone utile, et c'est
 * elle qu'on cadre — voir `INK` plus bas.
 */

import { motion } from 'framer-motion';
import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon } from '@heroicons/react/24/solid';
import { isAndroidDevice } from '../utils/pwa';

interface InstallAppSheetProps {
  isOpen: boolean;
  /** Fermeture « Passer » : l'utilisateur ne reverra plus la feuille au lancement. */
  onDismiss: () => void;
  /** Fermeture simple (croix / backdrop), sans marquer comme vu définitivement. */
  onClose: () => void;
  language: 'fr' | 'en';
  theme?: 'light' | 'dark';
}

type Platform = 'apple' | 'android';

/**
 * La zone utile d'une capture, en fractions de la toile.
 *
 * Mesurée sur le canal alpha de chaque fichier : c'est la boîte englobante de
 * ce qui n'est pas transparent. Les versions française et anglaise d'une même
 * étape tombent à deux millièmes près, une seule mesure suffit donc pour les
 * deux langues.
 *
 * `ratio` en découle : largeur sur hauteur de cette zone une fois la toile
 * 2:1 prise en compte. Il va de 5,6 pour la barre d'adresse — un ruban — à
 * 0,64 pour le menu de Chrome, plus haut que large.
 */
interface InkBox {
  /** Bords gauche et droit, en fraction de la largeur de la toile. */
  x0: number;
  x1: number;
  /** Bords haut et bas, en fraction de la hauteur de la toile. */
  y0: number;
  y1: number;
}

const ink = (x0: number, x1: number, y0: number, y1: number): InkBox => ({ x0, x1, y0, y1 });

/** Le nom du fichier, sans la langue, et la zone utile qui va avec. */
interface Step {
  /** Le fichier : `/assets/tuto/{platform}/{file}_{FR|EN}.png`. */
  file: string;
  box: InkBox;
}

const STEPS: Record<Platform, Step[]> = {
  /*
   * L'ordre suit la manœuvre, pas la numérotation des fichiers : `apple4`
   * (« Ajouter à l'écran d'accueil », dans la liste de partage) vient avant
   * `apple3` (la fenêtre de confirmation), alors que les noms disent
   * l'inverse. On suit ce que fait la main, pas ce que dit le nom de fichier.
   */
  apple: [
    { file: 'apple1', box: ink(0.05, 0.95, 0.297, 0.7) },
    { file: 'apple2', box: ink(0.325, 0.675, 0.048, 0.969) },
    { file: 'apple4', box: ink(0.191, 0.808, 0.075, 0.926) },
    { file: 'apple3', box: ink(0.229, 0.771, 0.036, 0.966) },
  ],
  android: [
    { file: 'android1', box: ink(0.05, 0.95, 0.34, 0.66) },
    { file: 'android2', box: ink(0.351, 0.649, 0.031, 0.97) },
    { file: 'android3', box: ink(0.244, 0.756, 0.199, 0.803) },
    { file: 'android4', box: ink(0.155, 0.845, 0.108, 0.895) },
  ],
};

const getInstallText = (language: 'fr' | 'en') => {
  const isFr = language === 'fr';
  return {
    title: isFr
      ? "Comment mettre l'app sur l'écran d'accueil"
      : 'How to add the app to your home screen',
    next: isFr ? 'Étape suivante' : 'Next step',
    done: isFr ? 'Terminé' : 'Done',
    skip: isFr ? 'Passer' : 'Skip',
    otherPlatform: (platform: Platform) =>
      platform === 'android'
        ? isFr
          ? 'Vous êtes sur iPhone ou iPad ?'
          : 'On an iPhone or iPad?'
        : isFr
          ? 'Vous êtes sur Android ?'
          : 'On an Android device?',
    close: isFr ? 'Fermer' : 'Close',
    stepLabel: (current: number, total: number) =>
      isFr ? `Étape ${current} sur ${total}` : `Step ${current} of ${total}`,
    slides: {
      apple: isFr
        ? [
            'Ouvrez grelines.fr dans Safari, puis touchez le bouton « … » à droite de la barre d’adresse.',
            'Dans le menu qui s’ouvre, touchez « Partager », tout en haut.',
            'Faites défiler la liste jusqu’à « Ajouter à l’écran d’accueil », puis touchez-la.',
            'Vérifiez le nom de l’app, laissez « Ouvrir en tant qu’app web » activé, et touchez « Ajouter ».',
          ]
        : [
            'Open grelines.fr in Safari, then tap the “…” button to the right of the address bar.',
            'In the menu that opens, tap “Share”, right at the top.',
            'Scroll down the list to “Add to Home Screen”, then tap it.',
            'Check the app name, leave “Open as Web App” on, and tap “Add”.',
          ],
      android: isFr
        ? [
            'Ouvrez grelines.fr dans Chrome, puis touchez les trois points à droite de la barre d’adresse.',
            'Dans le menu, touchez « Installer et créer un raccourci ».',
            'Choisissez « Installer » — et non « Créer un raccourci », qui rouvrirait le site dans Chrome.',
            'Vérifiez le nom de l’app, puis touchez « Installer ».',
          ]
        : [
            'Open grelines.fr in Chrome, then tap the three dots to the right of the address bar.',
            'In the menu, tap “Install and create a shortcut”.',
            'Choose “Install” — not “Create shortcut”, which would reopen the site inside Chrome.',
            'Check the app name, then tap “Install”.',
          ],
    },
  };
};

/**
 * Une capture, cadrée sur ce qu'elle montre.
 *
 * L'image est agrandie jusqu'à ce que sa zone utile occupe toute la largeur du
 * cadre, puis décalée pour que le coin haut-gauche de cette zone tombe dans le
 * coin du cadre. Le vide transparent passe derrière les bords. Le cadre prend
 * la forme de la zone utile, si bien qu'un ruban reste un ruban et qu'une
 * colonne reste une colonne.
 *
 * La capture vit dans la place que lui laissent l'en-tête et le bloc du bas :
 * elle ne la pousse jamais. `100%` de largeur et `100%` de hauteur sont donc
 * tous deux des plafonds, et c'est le plus contraignant des deux qui décide —
 * la largeur pour un ruban, la hauteur pour une colonne.
 */
function TutorialShot({
  src,
  box,
  alt,
  area,
}: {
  src: string;
  box: InkBox;
  alt: string;
  /** La place laissée par l'en-tête et le bloc du bas, en pixels. */
  area: { width: number; height: number };
}) {
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  const ratio = (width * 2) / height;

  /*
   * La plus grande taille qui tienne dans la place disponible.
   *
   * Calculée ici et non en CSS : `max-height` et `aspect-ratio` ne se
   * combinent pas — le navigateur applique le plafond de hauteur sans réduire
   * la largeur, et l'image se retrouve rognée au lieu d'être réduite. Un
   * `min()` sur deux mesures connues fait ce que l'on veut, et le
   * redimensionnement de la fenêtre le refait.
   */
  const shotWidth = Math.max(0, Math.min(area.width, area.height * ratio));

  return (
    <div
      className="relative mx-auto overflow-hidden"
      style={{ width: shotWidth, height: shotWidth / ratio }}
    >
      <img
        src={src}
        alt={alt}
        className="absolute max-w-none"
        style={{
          width: `${100 / width}%`,
          left: `${(-box.x0 / width) * 100}%`,
          top: `${(-box.y0 / height) * 100}%`,
        }}
      />
    </div>
  );
}

/** Le rembourrage horizontal de la colonne, `px-5`, des deux côtés. */
const SIDE_PADDING = 40;

/**
 * La place qui reste à la capture, en pixels.
 *
 * Mesurée, et non déduite du CSS, parce que la colonne du tutoriel ne peut pas
 * s'étirer toute seule : `react-modal-sheet` la pose dans un conteneur de
 * hauteur automatique, où ni `h-full` ni `flex-1` ne trouvent de hauteur à
 * remplir. Sans mesure, la zone de l'image se réduit à son propre contenu —
 * c'est-à-dire à rien, puisque c'est elle qui doit dimensionner l'image — et
 * le bloc du bas remonte au milieu de la feuille.
 *
 * On prend donc la hauteur du conteneur défilant de la feuille, on retranche
 * l'en-tête et le bloc du bas, et le reste est pour la capture. Le tout est
 * refait quand la feuille change de cran, quand le téléphone pivote, et quand
 * le texte d'une étape prend une ligne de plus.
 */
function useShotArea(
  isOpen: boolean,
  /*
   * La colonne arrive par un état et non par une `ref` : `react-modal-sheet`
   * ne monte son contenu qu'une fois la feuille ouverte, donc après le passage
   * de `isOpen` à vrai. Un effet qui n'écouterait que `isOpen` chercherait un
   * nœud qui n'existe pas encore, et ne repasserait jamais.
   */
  column: HTMLDivElement | null,
  refs: {
    header: React.RefObject<HTMLDivElement | null>;
    footer: React.RefObject<HTMLDivElement | null>;
  },
) {
  const [area, setArea] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    if (!column || !isOpen) return;
    const host =
      (column.closest('.react-modal-sheet-content-scroller') as HTMLElement | null) ??
      column.parentElement;
    if (!host) return;

    const measure = () => {
      const taken =
        (refs.header.current?.offsetHeight ?? 0) + (refs.footer.current?.offsetHeight ?? 0);
      const next = {
        width: Math.max(0, column.clientWidth - SIDE_PADDING),
        height: Math.max(0, host.clientHeight - taken),
      };
      setArea(current =>
        current.width === next.width && current.height === next.height ? current : next,
      );
    };
    measure();

    /*
     * La feuille monte en s'animant : à l'instant où l'on mesure pour la
     * première fois, elle n'a pas encore sa hauteur définitive, et le
     * `ResizeObserver` posé sur un conteneur que `react-modal-sheet` remplace
     * pendant l'ouverture ne rattrape pas toujours le coup. On remesure donc à
     * chaque image pendant le temps de l'animation, puis on s'arrête : mesurer
     * indéfiniment pour une feuille qui ne bouge plus ne sert à rien.
     */
    let frame = 0;
    const deadline = performance.now() + 900;
    const tick = () => {
      measure();
      if (performance.now() < deadline) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    const observer = new ResizeObserver(measure);
    observer.observe(host);
    observer.observe(column);
    if (refs.header.current) observer.observe(refs.header.current);
    if (refs.footer.current) observer.observe(refs.footer.current);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [isOpen, column, refs.header, refs.footer]);

  return area;
}

export const InstallAppSheet = ({
  isOpen,
  onDismiss,
  onClose,
  language,
}: InstallAppSheetProps) => {
  const text = getInstallText(language);

  /**
   * L'appareil décide, et lui seul.
   *
   * Android reconnu, tutoriel Chrome ; tout le reste, tutoriel Safari — c'est
   * celui qui vaut pour iPhone et iPad, et sur un ordinateur, où la question ne
   * se pose pas vraiment, c'est celui qui sert le plus souvent à montrer la
   * manœuvre à quelqu'un. Rien n'est modifiable en cours de route : il n'y a
   * qu'un tutoriel utile par appareil.
   */
  /*
   * L'appareil choisit, mais son avis n'est pas sans appel.
   *
   * La détection se trompe : « Site pour ordinateur » coché dans Chrome, un
   * navigateur qui déguise sa signature, quelqu'un qui montre la manœuvre sur
   * le téléphone d'un autre. Sans les onglets, une erreur de détection
   * enfermait dans le mauvais tutoriel. Une ligne discrète, tout en bas,
   * permet d'en changer — ce n'est pas un choix qu'on impose à l'arrivée,
   * seulement une porte de sortie pour les cas où l'on s'est trompé.
   */
  const [platform, setPlatform] = useState<Platform>(() =>
    isAndroidDevice() ? 'android' : 'apple',
  );
  const [slide, setSlide] = useState(0);
  /* Sortir en fondu plutôt que d'un coup : voir le même mécanisme dans le
     parcours de mise en route. */
  const [leaving, setLeaving] = useState(false);
  const [direction, setDirection] = useState(1);

  const steps = STEPS[platform];
  const total = steps.length;

  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setSlide(0);
      setDirection(1);
      setLeaving(false);
    }
  }

  const isLastSlide = slide === total - 1;

  /** Sortir : le fondu d'abord, le démontage ensuite. */
  const leave = (done: () => void) => {
    setLeaving(true);
    window.setTimeout(done, 300);
  };

  const handleNext = () => {
    if (isLastSlide) {
      leave(onDismiss);
      return;
    }
    setDirection(1);
    setSlide(s => s + 1);
  };

  const handlePrevious = () => {
    if (slide === 0) return;
    setDirection(-1);
    setSlide(s => s - 1);
  };

  const step = steps[slide];
  const suffix = language === 'en' ? 'EN' : 'FR';

  const [columnNode, setColumnNode] = useState<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const area = useShotArea(isOpen, columnNode, { header: headerRef, footer: footerRef });

  if (!isOpen || typeof document === 'undefined') return null;

  /*
   * Un écran, pas une feuille.
   *
   * Le tutoriel vivait dans une feuille qui montait du bas, à moitié posée sur
   * la carte : on lisait « touchez les trois points » avec, sous les yeux, une
   * application dont ce n'était plus le moment. L'écran entier, en noir, ne
   * laisse rien d'autre à regarder que la manœuvre à faire.
   *
   * Toujours noir, quel que soit le thème : ce sont des captures d'écran de
   * navigateur qu'on regarde, et elles se détachent sur du noir.
   */
  return createPortal(
    <div
      className={`fixed inset-0 z-[10040] flex flex-col bg-black text-white transition-opacity duration-300 ${
        leaving ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      <div
        ref={headerRef}
        className="flex flex-shrink-0 items-start justify-between gap-3 px-6 pb-4"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}
      >
        <h3
          style={{
            fontSize: '26px',
            lineHeight: 1.15,
            fontWeight: 700,
            color: '#ffffff',
            margin: 0,
            minWidth: 0,
            flex: '1 1 auto',
          }}
        >
          {text.title}
        </h3>
        <button
          onClick={() => leave(onClose)}
          aria-label={text.close}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-white/10 transition active:scale-90"
        >
          <XMarkIcon className="h-5 w-5 text-white" />
        </button>
      </div>

      {/* La capture, au milieu, dans toute la place qui reste. */}
      <div
        ref={setColumnNode}
        className="flex min-h-0 flex-1 items-center justify-center px-6"
      >
        <div
          key={`${platform}-${slide}`}
          className={direction > 0 ? 'install-slide-right' : 'install-slide-left'}
        >
          <TutorialShot
            src={`/assets/tuto/${platform}/${step.file}_${suffix}.png`}
            box={step.box}
            alt={text.stepLabel(slide + 1, total)}
            area={area}
          />
        </div>
      </div>

      {/* Ce qu'il faut lire, et ce qu'il faut toucher. Ancré en bas, immobile
          d'une étape à l'autre quelle que soit la hauteur de la capture. */}
      <div
        ref={footerRef}
        className="flex-shrink-0 px-6 pt-5"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}
      >
        <p className="text-sm font-semibold text-white/45">
          {text.stepLabel(slide + 1, total)}
        </p>
        {/* Une hauteur minimale réservée au texte, calée sur l'étape la plus
            longue : sans elle les boutons remontent d'un cran d'une étape à
            l'autre, et l'on vise un bouton qui a bougé. */}
        <div className="mt-2 min-h-[5rem]">
          <p className="text-[17px] leading-relaxed text-white/85">
            {text.slides[platform][slide]}
          </p>
        </div>

        <div className="mb-5 mt-4 flex justify-center gap-1.5">
          {steps.map((entry, index) => (
            <button
              key={entry.file}
              type="button"
              aria-label={text.stepLabel(index + 1, total)}
              onClick={() => {
                setDirection(index >= slide ? 1 : -1);
                setSlide(index);
              }}
              className={`h-1.5 rounded-full transition-all ${
                index === slide ? 'w-6 bg-blue-500' : 'w-1.5 bg-white/25'
              }`}
            />
          ))}
        </div>

        <div className="flex gap-2">
          {slide > 0 && (
            <button
              type="button"
              onClick={handlePrevious}
              className="rounded-2xl bg-white/10 px-5 py-4 text-[15px] font-bold text-white transition active:scale-[0.98]"
            >
              {language === 'fr' ? 'Retour' : 'Back'}
            </button>
          )}
          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={handleNext}
            className="flex-1 rounded-2xl bg-blue-600 px-4 py-4 text-[15px] font-bold text-white transition"
          >
            {isLastSlide ? text.done : text.next}
          </motion.button>
        </div>

        <div className="mt-4 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setDirection(platform === 'apple' ? 1 : -1);
              setPlatform(platform === 'apple' ? 'android' : 'apple');
              setSlide(0);
            }}
            className="text-[14px] font-semibold text-blue-400 transition-opacity active:opacity-60"
          >
            {text.otherPlatform(platform)}
          </button>
          <button
            type="button"
            onClick={() => leave(onDismiss)}
            className="py-1 text-[13px] font-normal text-white/45 transition active:text-white/80"
          >
            {text.skip}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
