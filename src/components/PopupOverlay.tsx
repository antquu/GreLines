import { AnimatePresence, motion } from 'framer-motion';
import { XMarkIcon, MegaphoneIcon, ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import { useEffect, useState } from 'react';
import type { CmsPopup } from '../services/cms';
import { MapSheet } from './MapSheet';

interface PopupOverlayProps {
  popups: CmsPopup[];
  language: 'fr' | 'en';
  /** L'apparence résolue : la feuille de carte s'habille comme les autres. */
  theme?: 'light' | 'dark';
}






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
    
  }
}






export function PopupOverlay({ popups, language, theme = 'dark' }: PopupOverlayProps) {
  const isLight = theme === 'light';
  const surfaceClass = isLight ? 'border-slate-200 bg-white' : 'border-gray-800 bg-gray-900';
  const titleClass = isLight ? 'text-slate-900' : 'text-white';
  const textClass = isLight ? 'text-slate-600' : 'text-gray-300';
  const mutedClass = isLight ? 'text-slate-500' : 'text-gray-400';
  const ruleClass = isLight ? 'border-slate-200' : 'border-gray-800';
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

  
  const handleClose = () => setVisiblePopup(null);

  
  const handleOptOut = () => {
    markOptedOut(visiblePopup.id);
    setVisiblePopup(null);
  };

  const isPromo = visiblePopup.type === 'promo';

  /*
   * Le contenu, une seule fois.
   *
   * Il sert à la feuille du téléphone comme à la carte de l'ordinateur : la même
   * annonce, deux contenants. L'écrire deux fois aurait garanti qu'un lien ou un
   * bouton finisse par ne plus exister que d'un côté.
   */
  const body = (
    <>
      {visiblePopup.image_url && (
        <img src={visiblePopup.image_url} alt="" className="h-40 w-full object-cover" />
      )}

      <div className="p-5">
        <div className="mb-2 flex items-center gap-2">
          {isPromo ? (
            <MegaphoneIcon className="h-5 w-5 text-blue-400" />
          ) : (
            <ExclamationTriangleIcon className="h-5 w-5 text-amber-400" />
          )}
          <span className={`text-xs font-semibold uppercase tracking-wide ${mutedClass}`}>
            {isPromo ? (language === 'fr' ? 'Promotion' : 'Promotion') : 'Infotraffic'}
          </span>
        </div>

        <h2 className={`mb-1 text-lg font-semibold ${titleClass}`}>{visiblePopup.title}</h2>
        <p className={`whitespace-pre-line text-sm ${textClass}`}>{visiblePopup.message}</p>

        {visiblePopup.link_url && (
          <a
            href={visiblePopup.link_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block text-sm font-medium text-blue-400 hover:text-blue-300"
          >
            {language === 'fr' ? 'En savoir plus' : 'Learn more'} &rarr;
          </a>
        )}

        <div className={`mt-5 flex flex-col items-center gap-2 border-t pt-3 ${ruleClass}`}>
          {/* Le libellé est peint en style en ligne : la feuille du thème clair
              repeint `.text-white` en sombre, et « Compris » disparaissait sur le
              bleu. */}
          <button
            onClick={handleClose}
            className="w-full rounded-xl bg-blue-600 py-2.5 text-sm font-semibold transition hover:bg-blue-500 active:bg-blue-700"
            style={{ color: '#ffffff' }}
          >
            {language === 'fr' ? 'Compris' : 'Got it'}
          </button>
          <button
            onClick={handleOptOut}
            className={`text-[11px] underline-offset-2 transition hover:underline ${mutedClass}`}
          >
            {language === 'fr' ? 'Ne plus afficher ce message' : "Don't show this again"}
          </button>
        </div>
      </div>
    </>
  );

  /*
   * Sur téléphone, l'annonce est une feuille de carte, comme le reste.
   *
   * C'était la dernière surface à s'ouvrir autrement : un panneau qui montait du
   * bas avec sa propre poignée, son propre voile et sa propre façon de se
   * refermer. Passer par `MapSheet` lui donne les paliers, la poignée et le geste
   * de fermeture de toutes les autres — et surtout, la carte reste vivante
   * derrière, ce qui vaut mieux pour une annonce qui parle du réseau qu'on est en
   * train de regarder.
   */
  if (isMobile) {
    return (
      <MapSheet
        isOpen
        onClose={handleClose}
        isLight={isLight}
        zIndex={10000}
        /* Palier médian : l'annonce se lit sans couvrir la carte, et se déplie
           d'un geste si elle porte une image. */
        initialSnap={2}
      >
        <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
      </MapSheet>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleClose}
      >
        <motion.div
          className={`relative w-full max-w-sm overflow-hidden rounded-2xl border shadow-2xl ${surfaceClass}`}
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          onClick={(e) => e.stopPropagation()}
        >
          {body}

          <button
            onClick={handleClose}
            className="absolute right-3 top-3 rounded-full bg-black/30 p-1.5 text-white hover:bg-black/50"
            aria-label={language === 'fr' ? 'Fermer' : 'Close'}
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
