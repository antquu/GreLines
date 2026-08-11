import { motion } from 'framer-motion';
import { useState } from 'react';
import { Sheet } from 'react-modal-sheet';
import { XMarkIcon } from '@heroicons/react/24/solid';
import { FaApple, FaAndroid, FaExclamation } from 'react-icons/fa';
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

const SLIDE_COUNT = 5;

const getInstallText = (language: 'fr' | 'en') => {
  const isFr = language === 'fr';
  return {
    title: isFr
      ? "Comment mettre l'app sur l'écran d'accueil"
      : 'How to add the app to your home screen',
    apple: 'Apple',
    android: 'Android',
    next: isFr ? 'Étape suivante' : 'Next step',
    done: isFr ? 'Terminé' : 'Done',
    skip: isFr ? 'Passer' : 'Skip',
    close: isFr ? 'Fermer' : 'Close',
    stepLabel: (current: number) =>
      isFr ? `Étape ${current} sur ${SLIDE_COUNT}` : `Step ${current} of ${SLIDE_COUNT}`,
    androidTitle: isFr
      ? "Nous n'avons pas de tuto Android pour l'instant"
      : 'No Android tutorial yet',
    androidDescription: isFr
      ? "Le guide d'installation Android arrive bientôt. Désolé pour cette gêne occasionnée."
      : 'The Android installation guide is coming soon. Sorry for the inconvenience.',
    slides: isFr
      ? [
          'Ouvrez GreLines dans Safari : l’ajout à l’écran d’accueil n’est possible que depuis ce navigateur sur iPhone et iPad.',
          'Appuyez sur le bouton Partager, l’icône carrée avec une flèche vers le haut, dans la barre du navigateur.',
          'Faites défiler la liste des actions proposées jusqu’à trouver « Sur l’écran d’accueil ».',
          'Appuyez sur « Sur l’écran d’accueil », vérifiez le nom de l’app puis confirmez avec « Ajouter ».',
          'L’icône GreLines apparaît sur votre écran d’accueil : l’app s’ouvre désormais en plein écran, sans barre de navigateur.',
        ]
      : [
          'Open GreLines in Safari: adding to the home screen is only possible from that browser on iPhone and iPad.',
          'Tap the Share button, the square icon with an upward arrow, in the browser bar.',
          'Scroll through the list of actions until you find “Add to Home Screen”.',
          'Tap “Add to Home Screen”, check the app name, then confirm with “Add”.',
          'The GreLines icon appears on your home screen: the app now opens full screen, with no browser bar.',
        ],
  };
};

export const InstallAppSheet = ({
  isOpen,
  onDismiss,
  onClose,
  language,
  theme = 'dark',
}: InstallAppSheetProps) => {
  const text = getInstallText(language);
  const isLight = theme === 'light';

  const [platform, setPlatform] = useState<Platform>(() =>
    isAndroidDevice() ? 'android' : 'apple'
  );
  const [slide, setSlide] = useState(0);
  // Sens de l'animation : 1 = le nouveau contenu entre par la droite,
  // -1 = il entre par la gauche.
  const [direction, setDirection] = useState(1);

  // Rouvrir la feuille depuis les réglages doit repartir de la première étape.
  // Ajustement pendant le rendu plutôt que dans un effet : pas de rendu
  // intermédiaire affichant l'ancienne étape.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setSlide(0);
      setDirection(1);
    }
  }

  const switchPlatform = (next: Platform) => {
    if (next === platform) return;
    // Apple → Android : glissement de droite à gauche. Android → Apple : l'inverse.
    setDirection(next === 'android' ? 1 : -1);
    setPlatform(next);
    setSlide(0);
  };

  const isLastSlide = slide === SLIDE_COUNT - 1;

  const handleNext = () => {
    if (isLastSlide) {
      onDismiss();
      return;
    }
    setDirection(1);
    setSlide(s => s + 1);
  };

  const tabs: { key: Platform; label: string; Icon: typeof FaApple }[] = [
    { key: 'apple', label: text.apple, Icon: FaApple },
    { key: 'android', label: text.android, Icon: FaAndroid },
  ];

  return (
    <Sheet
      style={{ zIndex: 100 }}
      isOpen={isOpen}
      onClose={onClose}
      snapPoints={[0, 0.6, 1]}
      initialSnap={2}
    >
      <Sheet.Container
        style={{
          borderRadius: '24px 24px 0 0',
          background: isLight
            ? 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(241,245,249,0.98))'
            : '#0f172a',
          border: isLight ? '1px solid rgba(203,213,225,0.75)' : undefined,
          zIndex: 100,
        }}
      >
        <Sheet.Header>
          <div className="flex justify-center pt-2 pb-1">
            <div className={`h-1.5 w-16 rounded-full ${isLight ? 'bg-slate-300' : 'bg-white/30'}`} />
          </div>
        </Sheet.Header>

        <Sheet.Content disableDrag={state => state.scrollPosition !== 'top'}>
          {/* Colonne de hauteur pleine : react-modal-sheet insère un conteneur
              intermédiaire non flex, sans lequel la capture du tutoriel pousse
              les boutons sous le bord de l'écran. */}
          <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 px-5 py-3 flex-shrink-0">
            <div className="min-w-0">
              <h3
                className={`text-base font-bold leading-tight ${
                  isLight ? 'text-slate-900' : 'text-white'
                }`}
              >
                {text.title}
              </h3>
            </div>
            <button
              onClick={onClose}
              aria-label={text.close}
              className={`w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full border transition ${
                isLight
                  ? 'bg-white border-slate-200 hover:bg-slate-100'
                  : 'bg-slate-800 border-slate-700 hover:bg-slate-700'
              }`}
            >
              <XMarkIcon className={`w-4 h-4 ${isLight ? 'text-slate-700' : 'text-white'}`} />
            </button>
          </div>

          {/* Sélecteur de plateforme */}
          <div className="flex gap-2 px-5 pb-3 flex-shrink-0">
            {tabs.map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => switchPlatform(key)}
                aria-pressed={platform === key}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition ${
                  platform === key
                    ? 'bg-blue-600 text-white'
                    : isLight
                      ? 'bg-slate-100 border border-slate-200 text-slate-600 hover:bg-slate-200'
                      : 'bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          {/* Contenu */}
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 pb-4">
            {/* Le changement de clé remonte le bloc, qui glisse alors depuis le
                côté indiqué par `direction` (voir les keyframes dans
                index.css). Pas d'animation de sortie : elle n'apporte rien ici
                et AnimatePresence en mode « wait » se bloque sous StrictMode. */}
              <div
                key={platform === 'apple' ? `apple-${slide}` : 'android'}
                className={direction > 0 ? 'install-slide-right' : 'install-slide-left'}
              >
                {platform === 'apple' ? (
                  <>
                    {/* Capture seule, sans cadre ni fond : plafonnée en hauteur
                        pour que l'étape tienne à l'écran sans défilement. */}
                    <img
                      src={`/assets/tuto/apple${slide + 1}TUTO_${
                        language === 'en' ? 'EN' : 'FR'
                      }.png`}
                      alt={text.stepLabel(slide + 1)}
                      className="mx-auto max-h-[30vh] w-auto max-w-full object-contain"
                    />

                    {/* Marges portées par des div : `p { margin: 0 }` est
                        déclaré hors layer dans index.css et neutralise les
                        utilitaires `mt-*` appliqués à un paragraphe. */}
                    <div className="mt-6">
                      <p
                        className={`text-[11px] font-semibold uppercase tracking-wide ${
                          isLight ? 'text-slate-400' : 'text-slate-500'
                        }`}
                      >
                        {text.stepLabel(slide + 1)}
                      </p>
                      <div className="mt-1">
                        <p
                          className={`text-sm leading-relaxed ${
                            isLight ? 'text-slate-600' : 'text-slate-300'
                          }`}
                        >
                          {text.slides[slide]}
                        </p>
                      </div>
                    </div>

                    {/* Progression */}
                    <div className="mt-4 flex justify-center gap-1.5">
                      {Array.from({ length: SLIDE_COUNT }).map((_, index) => (
                        <span
                          key={index}
                          className={`h-1.5 rounded-full transition-all ${
                            index === slide
                              ? 'w-6 bg-blue-600'
                              : `w-1.5 ${isLight ? 'bg-slate-300' : 'bg-slate-600'}`
                          }`}
                        />
                      ))}
                    </div>
                  </>
                ) : (
                  /* Même mise en page que l'avertissement de la sidebar TCL,
                     mais sans le fond orange. */
                  <div className="flex select-none flex-col items-center pb-2 text-center">
                    <div className="pt-[24px] pb-[8px]">
                      <FaExclamation
                        className={`h-[158px] w-[108px] ${isLight ? 'text-slate-900' : 'text-white'}`}
                        style={{ transform: 'rotate(-12deg)' }}
                      />
                    </div>

                    <div className="mt-[40px] flex flex-col items-center px-[8px]">
                      <h2
                        className={`max-w-[270px] text-[42px] leading-[1.05] tracking-[-0.3px] font-black ${
                          isLight ? 'text-slate-900' : 'text-white'
                        }`}
                      >
                        {text.androidTitle}
                      </h2>
                      <div className="mt-[14px]">
                        <p
                          className={`max-w-[270px] text-[18px] font-semibold leading-[1.3] ${
                            isLight ? 'text-slate-700' : 'text-slate-300'
                          }`}
                        >
                          {text.androidDescription}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
          </div>

          {/* Actions */}
          <div
            className={`flex-shrink-0 border-t px-5 pt-3 pb-6 ${
              isLight ? 'border-slate-200' : 'border-slate-700/60'
            }`}
          >
            {platform === 'apple' && (
              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                onClick={handleNext}
                className="w-full rounded-2xl bg-blue-600 px-4 py-3 text-[15px] font-semibold text-white transition hover:bg-blue-500"
              >
                {isLastSlide ? text.done : text.next}
              </motion.button>
            )}

            <button
              type="button"
              onClick={onDismiss}
              className={`mx-auto mt-3 block text-[13px] font-normal transition-opacity hover:opacity-60 ${
                isLight ? 'text-slate-500' : 'text-slate-400'
              }`}
            >
              {text.skip}
            </button>
          </div>
          </div>
        </Sheet.Content>
      </Sheet.Container>
      <Sheet.Backdrop onTap={onClose} style={{ zIndex: 99 }} />
    </Sheet>
  );
};
