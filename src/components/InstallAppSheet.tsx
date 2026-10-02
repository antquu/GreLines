import { motion } from 'framer-motion';
import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon } from '@heroicons/react/24/solid';
import { isAndroidDevice } from '../utils/pwa';

interface InstallAppSheetProps {
  isOpen: boolean;
  onDismiss: () => void;
  onClose: () => void;
  language: 'fr' | 'en';
  theme?: 'light' | 'dark';
}

type Platform = 'apple' | 'android';

interface InkBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const ink = (x0: number, x1: number, y0: number, y1: number): InkBox => ({ x0, x1, y0, y1 });

interface Step {
  file: string;
  box: InkBox;
}

const STEPS: Record<Platform, Step[]> = {
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

function TutorialShot({
  src,
  box,
  alt,
  area,
}: {
  src: string;
  box: InkBox;
  alt: string;
  area: { width: number; height: number };
}) {
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  const ratio = (width * 2) / height;

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

const SIDE_PADDING = 40;

function useShotArea(
  isOpen: boolean,
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

  const [platform, setPlatform] = useState<Platform>(() =>
    isAndroidDevice() ? 'android' : 'apple',
  );
  const [slide, setSlide] = useState(0);
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

  return createPortal(
    <div
      className={`fixed inset-0 z-[10040] flex flex-col bg-black text-white transition-opacity duration-300 ${
        leaving ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      <div
        ref={headerRef}
        className="flex flex-shrink-0 items-start justify-between gap-3 px-6 pb-4"
        style={{ paddingTop: 'calc(var(--gl-safe-top) + 1rem)' }}
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

      <div
        ref={footerRef}
        className="flex-shrink-0 px-6 pt-5"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}
      >
        <p className="text-sm font-semibold text-white/45">
          {text.stepLabel(slide + 1, total)}
        </p>
        <div className="mt-2 min-h-[5rem]">
          <p className="text-[1.0625rem] leading-relaxed text-white/85">
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
              className="rounded-2xl bg-white/10 px-5 py-4 text-[0.9375rem] font-bold text-white transition active:scale-[0.98]"
            >
              {language === 'fr' ? 'Retour' : 'Back'}
            </button>
          )}
          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={handleNext}
            className="flex-1 rounded-2xl bg-blue-600 px-4 py-4 text-[0.9375rem] font-bold text-white transition"
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
            className="text-[0.875rem] font-semibold text-blue-400 transition-opacity active:opacity-60"
          >
            {text.otherPlatform(platform)}
          </button>
          <button
            type="button"
            onClick={() => leave(onDismiss)}
            className="py-1 text-[0.8125rem] font-normal text-white/45 transition active:text-white/80"
          >
            {text.skip}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
