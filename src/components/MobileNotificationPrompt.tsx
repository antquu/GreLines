import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpIcon, BellAlertIcon, XMarkIcon } from '@heroicons/react/24/solid';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface MobileNotificationPromptProps {
  isOpen: boolean;
  language: 'fr' | 'en';
  onEnable: () => void;
  onDismiss: () => void;
}

export function MobileNotificationPrompt({
  isOpen,
  language,
  onEnable,
  onDismiss,
}: MobileNotificationPromptProps) {
  const [canContinueWithoutNotifications, setCanContinueWithoutNotifications] = useState(false);
  const isFr = language === 'fr';

  useEffect(() => {
    if (!isOpen) {
      setCanContinueWithoutNotifications(false);
      return;
    }

    const timer = window.setTimeout(() => setCanContinueWithoutNotifications(true), 4000);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1450] overflow-hidden bg-[#020617] text-white"
      role="dialog"
      aria-modal="true"
      aria-label={isFr ? 'Activer les notifications' : 'Enable notifications'}
    >
      <motion.div
        className="flex h-[100dvh] min-h-[30rem] flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] text-center"
        initial={{ opacity: 0, y: '100%' }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.34, ease: [0.32, 0.72, 0, 1] }}
      >
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onDismiss}
            aria-label={isFr ? 'Fermer' : 'Close'}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-white/80"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-white/10 bg-white/[0.05]">
            <BellAlertIcon className="h-8 w-8" />
          </div>
          <h1 className="mt-6 max-w-sm text-3xl font-black leading-tight">
            {isFr ? 'Restez informe pendant votre trajet' : 'Stay informed during your trip'}
          </h1>
          <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-white/65">
            {isFr
              ? 'Nous vous avertirons au moment de partir, de changer ou de descendre.'
              : 'We will alert you when it is time to leave, transfer, or get off.'}
          </p>
        </div>

        <div className="flex flex-col items-center">
          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={onEnable}
            className="rounded-full bg-white px-6 py-3 text-[15px] font-extrabold text-slate-950"
          >
            {isFr ? 'Activer les notifications' : 'Enable notifications'}
          </motion.button>

          <ArrowUpIcon className="mt-5 h-14 w-14 animate-bounce text-white" aria-hidden="true" />

          <div className="h-9">
            <AnimatePresence>
              {canContinueWithoutNotifications && (
                <motion.button
                  type="button"
                  onClick={onDismiss}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.22 }}
                  className="text-[15px] font-semibold text-white/55"
                >
                  {isFr ? 'Continuer sans notifications' : 'Continue without notifications'}
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
