import { AnimatePresence, motion } from 'framer-motion';
import { XMarkIcon } from '@heroicons/react/24/solid';
import { FaExclamation } from 'react-icons/fa';
import { useEffect, useState } from 'react';

interface TclSidebarProps {
  visible: boolean;
  onContinue: () => void;
  onClose: () => void;
  language: 'fr' | 'en';
}

const getTclText = (language: 'fr' | 'en') => {
  if (language === 'en') {
    return {
      title: 'TCL network is still under A/B testing',
      description:
        'You can continue, but the experience shown here may not be the one you expect. We apologize for the inconvenience.',
      continueLabel: 'Continue anyway',
      closeLabel: 'Close',
    };
  }

  return {
    title: 'Le réseau TCL est une fonctionnalité encore en A/B testing',
    description:
      "Vous pouvez continuer, mais l'expérience affichée ici peut ne pas être celle à laquelle vous vous attendez. Nous nous excusons pour la gêne occasionnée.",
    continueLabel: 'Continuer quand même',
    closeLabel: 'Fermer',
  };
};

export const TclSidebar = ({
  visible,
  onContinue,
  onClose,
  language,
}: TclSidebarProps) => {
  const text = getTclText(language);

  const [showWarning, setShowWarning] = useState(false);

  
  
  useEffect(() => {
    if (visible) {
      setShowWarning(true);
    }
  }, [visible]);

  const handleContinue = () => {
    setShowWarning(false);
    onContinue();
  };

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 30 }}
          transition={{ duration: 0.24, ease: 'easeOut' }}
          className="
            absolute
            inset-0
            z-50
            overflow-hidden
            bg-white
            shadow-2xl
          "
          role="dialog"
          aria-modal="true"
          aria-label="TCL sidebar"
        >
          {

}

          <div
            className={`h-full overflow-y-auto ${
              showWarning ? 'pointer-events-none' : ''
            }`}
          >
            {/* 
              TON CONTENU DE SIDEBAR ICI

              Exemple :
              
              <div className="p-6">
                ...
              </div>
            */}
          </div>

          {/* =====================================================
              WARNING
              
              PAS DE MOTION
              PAS D'ANIMATION
              PAS DE PORTAL
              
              Il couvre uniquement la sidebar.
              ===================================================== */}

            {showWarning && (
            <div
                className="
                absolute
                inset-0
                z-[100]
                overflow-hidden
                overscroll-none
                bg-[#E8993A]
                text-black
                select-none
                "
                role="alertdialog"
                aria-modal="true"
                aria-label="A/B testing warning"
                style={{
                touchAction: 'none',
                }}
            >
                {/* X */}
                <button
                type="button"
                onClick={onClose}
                className="
                    absolute
                    right-[18px]
                    top-[17px]
                    z-20
                    flex
                    h-[26px]
                    w-[26px]
                    items-center
                    justify-center
                    rounded-full
                    bg-[#f1f1f1]
                    text-[#777]
                    transition
                    hover:bg-white
                "
                aria-label={text.closeLabel}
                >
                <XMarkIcon className="h-[15px] w-[15px]" />
                </button>

                {/* Contenu du warning */}
                <div
                className="
                    flex
                    h-full
                    w-full
                    flex-col
                    overflow-hidden
                    px-[12px]
                    pb-[32px]
                "
                style={{
                    touchAction: 'none',
                }}
                onWheel={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.preventDefault()}
                >
                {/* =========================
                    GROS !
                    ========================= */}
                <div className="pt-[88px] pl-[8px] pb-[24px]">
                    <FaExclamation
                    className="
                        h-[158px]
                        w-[108px]
                        text-black
                    "
                    style={{
                        transform: 'rotate(-12deg)',
                    }}
                    />
                </div>

                {/* =========================
                    TEXTE
                    ========================= */}
                <div className="mt-[76px] px-[8px]">
                    <h2
                    className="
                        max-w-[270px]
                        text-[56px]
                        leading-[1.05]
                        tracking-[-0.3px]
                        font-black
                    "
                    style={{ color: '#000' }}
                    >
                    {text.title}
                    </h2>

                    <p
                    className="
                        mt-[14px]
                        max-w-[270px]
                        text-[18px]
                        font-semibold
                        leading-[1.3]
                    "
                    style={{ color: '#000' }}
                    >
                    {text.description}
                    </p>
                </div>

                {/* =========================
                    CONTINUER
                    ========================= */}
                <div className="mt-auto flex justify-center">
                    <button
                    type="button"
                    onClick={handleContinue}
                    className="
                        text-[13px]
                        font-normal
                        text-black
                        transition-opacity
                        hover:opacity-60
                    "
                    >
                    {text.continueLabel}
                    </button>
                </div>
                </div>
            </div>
            )}

          {/* =====================================================
              X NORMAL DE LA SIDEBAR

              On le laisse disponible une fois le warning fermé.
              ===================================================== */}

          {!showWarning && (
            <button
              type="button"
              onClick={onClose}
              className="
                absolute
                right-4
                top-4
                z-10
                inline-flex
                h-9
                w-9
                items-center
                justify-center
                rounded-full
                bg-slate-950/10
                text-slate-950
                transition
                hover:bg-slate-950/20
              "
              aria-label={text.closeLabel}
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          )}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};