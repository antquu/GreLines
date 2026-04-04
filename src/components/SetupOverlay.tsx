import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface SetupOverlayProps {
  isVisible: boolean;
  onComplete: (language: 'fr' | 'en') => void;
}

export function SetupOverlay({ isVisible, onComplete }: SetupOverlayProps) {
  const [setupStage, setSetupStage] = useState<0 | 1 | 2 | 3>(0);
  const [setupLanguage, setSetupLanguage] = useState<'fr' | 'en'>(() => {
    const saved = localStorage.getItem('greLines_language');
    return saved === 'en' ? 'en' : 'fr';
  });
  const [setupTheme, setSetupTheme] = useState<'dark'>(() => {
    return 'dark';
  });
  const [setupIntroLanguage, setSetupIntroLanguage] = useState<'fr' | 'en'>(() => {
    const saved = localStorage.getItem('greLines_language');
    return saved === 'en' ? 'en' : 'fr';
  });

  const setupTexts = {
    fr: {
      introPhrase: "Bienvenue sur",
      introDescription: "Personnalisez votre exp\u00e9rience pour commencer",
      introButton: "Continuer",
      stepLabel: "Étape",
      step1Heading: "Choisissez votre langue",
      step1Description: "S\u00e9lectionnez la langue de l'interface",
      step2Heading: "Personnalisez votre apparence",
      step2Description: "Choisissez le th\u00e8me de l'application",
      step3Heading: "Pr\u00eat \u00e0 partir",
      step3Description: "V\u00e9rifiez votre s\u00e9lection et lancez GreLines.",
      languageCardFr: "Français",
      languageCardEn: "English",
      languageCardSubtitle: "Langue",
      languageCardExtra: "R\u00e9gion France",
      themeCardAuto: "Automatique",
      themeCardDark: "Sombre",
      themeCardSubtitle: "Mode",
      summaryLabelLanguage: "Langue",
      summaryLabelTheme: "Mode",
      summaryLanguageFr: "Vous verrez le site en fran\u00e7ais",
      summaryLanguageEn: "You will see the site in English",
      summaryThemeAuto: "S'adapte selon votre syst\u00e8me",
      summaryThemeDark: "Toujours en th\u00e8me sombre",
      summaryReadyLabel: "Pr\u00eat",
      summaryReady: "Vous \u00eates pr\u00eat \u00e0 lancer GreLines",
      summaryReadyDesc: "Cliquez sur le bouton ci-dessous pour ouvrir l'application.",
      launchButton: "Ouvrir GreLines",
      continueButton: "Continuer",
      backButton: "Retour",
    },
    en: {
      introPhrase: 'Welcome on',
      introDescription: 'Personalize your experience to start',
      introButton: 'Continue',
      stepLabel: 'Step',
      step1Heading: 'Choose your language',
      step1Description: 'Select the interface language',
      step2Heading: 'Customize your appearance',
      step2Description: 'Choose the application theme',
      step3Heading: 'Ready to go',
      step3Description: 'Review your selection and launch GreLines.',
      languageCardFr: 'Français',
      languageCardEn: 'English',
      languageCardSubtitle: 'Language',
      languageCardExtra: 'France region',
      themeCardAuto: 'Automatic',
      themeCardDark: 'Dark',
      themeCardSubtitle: 'Mode',
      summaryLabelLanguage: 'Language',
      summaryLabelTheme: 'Theme',
      summaryLanguageFr: 'You will see the site in French',
      summaryLanguageEn: 'You will see the site in English',
      summaryThemeAuto: 'Adapts to your system',
      summaryThemeDark: 'Always in dark theme',
      summaryReadyLabel: 'Ready',
      summaryReady: 'You are ready to open GreLines',
      summaryReadyDesc: 'Click the button below to open the app.',
      launchButton: 'Open GreLines',
      continueButton: 'Continue',
      backButton: 'Back',
    },
  } as const;

  const currentSetupText = setupTexts[setupLanguage];

  useEffect(() => {
    if (!isVisible || setupStage !== 0) return;
    setSetupIntroLanguage(setupLanguage);

    const interval = setInterval(() => {
      setSetupIntroLanguage((prev) => (prev === 'fr' ? 'en' : 'fr'));
    }, 3000);

    return () => clearInterval(interval);
  }, [isVisible, setupStage, setupLanguage]);

  const handleComplete = () => {
    localStorage.setItem('greLines_setup_complete', 'true');
    onComplete(setupLanguage);
  };

  const setupCards = (
    <div className="grid gap-4 sm:grid-cols-2 w-full max-w-2xl">
      {setupStage === 1 ? (
        [
          {
            id: 'fr',
            title: currentSetupText.languageCardFr,
            subtitle: currentSetupText.languageCardSubtitle,
            extra: currentSetupText.languageCardExtra,
          },
          {
            id: 'en',
            title: currentSetupText.languageCardEn,
            subtitle: currentSetupText.languageCardSubtitle,
            extra: currentSetupText.languageCardExtra,
          },
        ].map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => {
              setSetupLanguage(option.id as 'fr' | 'en');
              setSetupIntroLanguage(option.id as 'fr' | 'en');
            }}
            className={`group rounded-3xl border p-4 sm:p-6 text-left transition-all duration-300 ${setupLanguage === option.id ? 'border-blue-400 bg-white/10 shadow-[0_30px_80px_rgba(13,93,236,0.12)]' : 'border-white/15 bg-white/5 hover:border-blue-300 hover:bg-white/10'} text-white`}
          >
            <div className="text-xs uppercase tracking-[0.2em] text-slate-300 mb-2 sm:mb-3">{option.subtitle}</div>
            <div className="text-2xl sm:text-3xl md:text-4xl font-semibold leading-tight">{option.title}</div>
            <div className="mt-4 sm:mt-6 border-t border-white/10 pt-3 sm:pt-4 text-xs sm:text-sm text-slate-300">{option.extra}</div>
          </button>
        ))
      ) : setupStage === 2 ? (
        [
          {
            id: 'dark',
            title: currentSetupText.themeCardDark,
            subtitle: currentSetupText.themeCardSubtitle,
          },
        ].map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setSetupTheme(option.id as 'dark')}
            className={`group rounded-3xl border p-4 sm:p-6 text-left transition-all duration-300 ${setupTheme === option.id ? 'border-blue-400 bg-white/10 shadow-[0_30px_80px_rgba(13,93,236,0.12)]' : 'border-white/15 bg-white/5 hover:border-blue-300 hover:bg-white/10'} text-white`}
          >
            <div className="text-xs uppercase tracking-[0.2em] text-slate-300 mb-2 sm:mb-3">{option.subtitle}</div>
            <div className="text-2xl sm:text-3xl md:text-4xl font-semibold leading-tight">{option.title}</div>
            <div className="mt-4 sm:mt-6 border-t border-white/10 pt-3 sm:pt-4 text-xs sm:text-sm text-slate-300">{currentSetupText.step2Description}</div>
          </button>
        ))
      ) : (
        <div className="space-y-4 sm:col-span-2 w-full max-w-2xl">
          <div className="grid gap-4 sm:grid-cols-2 w-full">
            <div className="rounded-3xl border border-white/15 bg-white/5 p-4 sm:p-6 text-white">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-300 mb-2 sm:mb-3">{currentSetupText.summaryLabelLanguage}</div>
              <div className="text-xl sm:text-2xl md:text-3xl font-semibold">{setupLanguage === 'fr' ? currentSetupText.languageCardFr : currentSetupText.languageCardEn}</div>
              <p className="mt-3 sm:mt-4 text-xs sm:text-sm text-slate-300">{setupLanguage === 'fr' ? currentSetupText.summaryLanguageFr : currentSetupText.summaryLanguageEn}</p>
            </div>
            <div className="rounded-3xl border border-white/15 bg-white/5 p-4 sm:p-6 text-white">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-300 mb-2 sm:mb-3">{currentSetupText.summaryLabelTheme}</div>
              <div className="text-xl sm:text-2xl md:text-3xl font-semibold">{setupTheme === 'dark' ? currentSetupText.themeCardDark : currentSetupText.themeCardAuto}</div>
              <p className="mt-3 sm:mt-4 text-xs sm:text-sm text-slate-300">
                {setupTheme === 'dark' ? currentSetupText.summaryThemeDark : currentSetupText.summaryThemeAuto}
              </p>
            </div>
          </div>
          <div className="rounded-3xl border border-white/15 bg-white/5 p-4 sm:p-6 text-white">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-300 mb-2 sm:mb-3">{currentSetupText.summaryReadyLabel}</div>
            <div className="text-lg sm:text-xl font-semibold">{currentSetupText.summaryReady}</div>
            <p className="mt-3 text-xs sm:text-sm text-slate-300">{currentSetupText.summaryReadyDesc}</p>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 lg:bg-slate-950/90"
        >
          <div className="hidden lg:block absolute inset-0 bg-[url('/assets/background/login.png')] bg-cover bg-center opacity-70" />
          <div className="absolute inset-0 bg-slate-950/75 lg:bg-slate-950/50" />
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            layout
            transition={{
              opacity: { duration: 0.4, ease: 'easeOut' },
              y: { duration: 0.4, ease: 'easeOut' },
              layout: { duration: 0.45, ease: 'easeInOut' },
            }}
            className="relative z-10 w-auto h-auto flex flex-col items-center justify-center mx-4 md:w-full md:h-auto md:mx-auto md:max-w-5xl overflow-hidden rounded-none md:rounded-[2rem] border-0 md:border border-transparent md:border-white/10 bg-transparent md:bg-slate-950/95 shadow-none md:shadow-2xl backdrop-blur-none md:backdrop-blur-xl"
          >
            <div className="hidden md:block absolute inset-0 bg-gradient-to-br from-slate-950/90 via-slate-950/40 to-transparent" />
            <motion.div layout className="relative w-auto h-auto md:w-full md:h-auto flex flex-col items-center justify-center px-4 py-6 sm:px-6 sm:py-8 md:px-12 md:py-10 overflow-hidden">
              <AnimatePresence mode="wait">
                {setupStage === 0 ? (
                  <motion.div
                    key="intro"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.35, ease: 'easeInOut' }}
                    className="flex flex-col items-center justify-center gap-6 sm:gap-8 text-center w-full"
                  >
                    <div className="space-y-4 text-center">
                      <h1 className="text-3xl font-semibold text-white font-canaro sm:text-4xl md:text-5xl lg:text-6xl whitespace-normal md:whitespace-nowrap mx-auto">
                        <span className="inline-flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3">
                          <AnimatePresence mode="wait">
                            <motion.span
                              key={`${setupIntroLanguage}-phrase`}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.45, ease: 'easeInOut' }}
                              className="inline-block"
                            >
                              {setupTexts[setupIntroLanguage].introPhrase}
                            </motion.span>
                          </AnimatePresence>
                          <span>GreLines</span>
                        </span>
                      </h1>
                      <AnimatePresence mode="wait">
                        <motion.p
                          key={`${setupIntroLanguage}-desc`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.45, ease: 'easeInOut' }}
                          className="mx-auto max-w-2xl text-xs sm:text-sm leading-6 sm:leading-7 text-slate-300 px-2 sm:px-0"
                        >
                          {setupTexts[setupIntroLanguage].introDescription}
                        </motion.p>
                      </AnimatePresence>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSetupStage(1)}
                      className="inline-flex min-w-[180px] sm:min-w-[220px] items-center justify-center rounded-full bg-white px-5 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
                    >
                      {setupTexts[setupIntroLanguage].introButton}
                    </button>
                  </motion.div>
                ) : (
                  <motion.div
                    key={`step-${setupStage}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.35, ease: 'easeInOut' }}
                    className="flex flex-col items-center justify-center md:items-start space-y-6 md:space-y-10 w-full"
                  >
                    <div className="max-w-3xl text-center md:text-left">
                      <span className="text-xs uppercase tracking-[0.35em] text-sky-300/80">{currentSetupText.stepLabel} {setupStage} / 3</span>
                      <h1 className="mt-4 text-2xl font-semibold text-white font-canaro sm:text-3xl md:text-4xl lg:text-5xl md:mx-0 mx-auto">
                        {setupStage === 1 ? currentSetupText.step1Heading : setupStage === 2 ? currentSetupText.step2Heading : currentSetupText.step3Heading}
                      </h1>
                      <p className="mt-4 max-w-2xl text-xs sm:text-sm leading-6 sm:leading-7 text-slate-300 md:mx-0 mx-auto">
                        {setupStage === 1 ? currentSetupText.step1Description : setupStage === 2 ? currentSetupText.step2Description : currentSetupText.step3Description}
                      </p>
                    </div>

                    <div className="mt-6 md:mt-10 w-full max-w-2xl">
                      {setupCards}
                    </div>

                    <div className="mt-6 md:mt-10 flex flex-col gap-3 sm:gap-4 md:flex-row md:items-center md:justify-between md:gap-6 w-full">
                      <button
                        type="button"
                        onClick={() => setSetupStage((prev) => (prev === 1 ? 0 : prev === 2 ? 1 : 2))}
                        className="w-auto inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-4 sm:px-5 py-2 sm:py-3 text-xs sm:text-sm font-semibold text-white transition hover:border-sky-300/50 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={setupStage === 1}
                      >
                        <span className="mr-2">←</span> {currentSetupText.backButton}
                      </button>

                      <button
                        type="button"
                        onClick={setupStage === 3 ? handleComplete : () => setSetupStage((prev) => (prev === 2 ? 3 : prev === 1 ? 2 : 3))}
                        className="w-auto inline-flex items-center justify-center rounded-full bg-sky-400 px-5 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm font-semibold text-slate-950 transition hover:bg-sky-300"
                      >
                        {setupStage === 3 ? currentSetupText.launchButton : currentSetupText.continueButton}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
