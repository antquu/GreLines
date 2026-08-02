import { AnimatePresence, motion } from 'framer-motion';
import { XMarkIcon, MegaphoneIcon, ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import { useEffect, useState } from 'react';
import type { CmsPopup } from '../services/cms';

interface PopupOverlayProps {
  popups: CmsPopup[];
  language: 'fr' | 'en';
}

/**
 * Popups que l'usager a explicitement choisi de ne plus revoir. Stocké
 * durablement (localStorage) : une simple fermeture ne suffit pas, le popup
 * réapparaît donc à chaque visite tant que ce choix n'a pas été fait.
 */
const OPTED_OUT_KEY = 'greLines_optedOutPopups';

function getOptedOutIds(): Set<string> {
  try {
    const raw = localStorage.getItem(OPTED_OUT_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function markOptedOut(id: string) {
  const optedOut = getOptedOutIds();
  optedOut.add(id);
  try {
    localStorage.setItem(OPTED_OUT_KEY, JSON.stringify(Array.from(optedOut)));
  } catch {
    // ignore
  }
}

/**
 * Affiche le popup actif (promo/infotraffic) de plus haute priorité géré depuis
 * le CRM GreStudio. Il réapparaît à chaque ouverture du site : seul le lien
 * « Ne plus afficher » le masque définitivement.
 */
export function PopupOverlay({ popups, language }: PopupOverlayProps) {
  const [visiblePopup, setVisiblePopup] = useState<CmsPopup | null>(null);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const optedOut = getOptedOutIds();
    const next = popups.find((p) => !optedOut.has(p.id));
    setVisiblePopup(next ?? null);
  }, [popups]);

  if (!visiblePopup) return null;

  /** Fermeture simple : le popup réapparaîtra à la prochaine visite. */
  const handleClose = () => setVisiblePopup(null);

  /** Choix explicite : ce popup ne sera plus jamais présenté. */
  const handleOptOut = () => {
    markOptedOut(visiblePopup.id);
    setVisiblePopup(null);
  };

  const isPromo = visiblePopup.type === 'promo';

  return (
    <AnimatePresence>
      <motion.div
        className={`fixed inset-0 z-[10000] flex bg-black/60 backdrop-blur-sm ${
          isMobile ? 'items-end justify-center' : 'items-center justify-center px-4'
        }`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleClose}
      >
        {/* Card centrée sur desktop, feuille remontant du bas sur mobile. */}
        <motion.div
          className={
            isMobile
              ? 'relative w-full overflow-hidden rounded-t-3xl border-t border-gray-800 bg-gray-900 shadow-2xl pb-[env(safe-area-inset-bottom)]'
              : 'relative w-full max-w-sm overflow-hidden rounded-2xl border border-gray-800 bg-gray-900 shadow-2xl'
          }
          initial={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.95, y: 10 }}
          animate={isMobile ? { y: 0 } : { opacity: 1, scale: 1, y: 0 }}
          exit={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.95, y: 10 }}
          transition={isMobile ? { type: 'spring', stiffness: 300, damping: 32 } : undefined}
          onClick={(e) => e.stopPropagation()}
        >
          {isMobile && <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-gray-700" />}
          {visiblePopup.image_url && (
            <img src={visiblePopup.image_url} alt="" className="w-full h-40 object-cover" />
          )}

          <div className="p-5">
            <div className="flex items-center gap-2 mb-2">
              {isPromo ? (
                <MegaphoneIcon className="w-5 h-5 text-indigo-400" />
              ) : (
                <ExclamationTriangleIcon className="w-5 h-5 text-amber-400" />
              )}
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {isPromo ? (language === 'fr' ? 'Promotion' : 'Promotion') : 'Infotraffic'}
              </span>
            </div>

            <h2 className="text-lg font-semibold text-white mb-1">{visiblePopup.title}</h2>
            <p className="text-sm text-gray-300 whitespace-pre-line">{visiblePopup.message}</p>

            {visiblePopup.link_url && (
              <a
                href={visiblePopup.link_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-4 text-sm font-medium text-indigo-400 hover:text-indigo-300"
              >
                {language === 'fr' ? 'En savoir plus' : 'Learn more'} →
              </a>
            )}

            <div className="mt-5 flex flex-col items-center gap-2 border-t border-gray-800 pt-3">
              <button
                onClick={handleClose}
                className="w-full rounded-xl bg-indigo-500 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400 active:bg-indigo-600"
              >
                {language === 'fr' ? 'Compris' : 'Got it'}
              </button>
              <button
                onClick={handleOptOut}
                className="text-[11px] text-gray-500 underline-offset-2 transition hover:text-gray-300 hover:underline"
              >
                {language === 'fr' ? 'Ne plus afficher ce message' : "Don't show this again"}
              </button>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="absolute top-3 right-3 p-1.5 rounded-full bg-black/30 hover:bg-black/50 text-white"
            aria-label={language === 'fr' ? 'Fermer' : 'Close'}
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
