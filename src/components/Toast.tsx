/**
 * L'avis passager de l'application.
 *
 * C'est *le* dessin des notifications ici : une pastille posée en haut de
 * l'écran, qui monte à sa place, se lit en une seconde et s'en va seule. Tout
 * ce qui a quelque chose à annoncer passe par là — une adresse copiée, un
 * message reçu sur une carte, une action confirmée. Un seul objet, un seul
 * geste, une seule façon d'apparaître : c'est ce qui fait qu'on le reconnaît
 * avant de l'avoir lu.
 *
 * Elle monte, elle ne tombe pas. Un avis qui descend du haut de l'écran a
 * l'autorité d'une alerte système ; celui-ci monte à sa place depuis le bas,
 * comme le reste de l'interface — c'est une nouvelle, pas une interruption.
 *
 * Elle reste cliquable quand on lui donne un `onClick` — un message reçu mène
 * à ce message — et se retire d'elle-même sinon.
 */

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

/** Le temps qu'il faut pour lire une ligne, sans plus. */
const DEFAULT_DURATION_MS = 4000;

export interface ToastMessage {
  /** Identité du message : la changer relance l'animation d'arrivée. */
  id: string;
  /** La ligne qu'on lit. Une phrase, pas un paragraphe. */
  text: string;
  /** Seconde ligne, plus discrète — le nom de la carte, l'arrêt concerné. */
  detail?: string;
  /** Pictogramme facultatif, à gauche du texte. */
  icon?: React.ReactNode;
}

export function Toast({
  message,
  isLight,
  durationMs = DEFAULT_DURATION_MS,
  onDismiss,
  onClick,
}: {
  /** `null` : rien à l'écran. */
  message: ToastMessage | null;
  isLight: boolean;
  durationMs?: number;
  onDismiss: () => void;
  /** Rend la pastille cliquable : la toucher la referme et déclenche l'action. */
  onClick?: () => void;
}) {
  const id = message?.id;

  useEffect(() => {
    if (!id) return;
    const timer = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, durationMs]);

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          key={message.id}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.26, ease: [0.32, 0.72, 0, 1] }}
          /* Au-dessus de tout : les pages pleines du téléphone montent à 1000,
             les feuilles de renommage à 1200. Un avis qui passe derrière une
             page n'est pas un avis. */
          className={`fixed left-1/2 z-[1300] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2.5 rounded-full py-2.5 pl-4 pr-5 shadow-2xl ${
            onClick ? 'cursor-pointer' : 'pointer-events-none'
          } ${
            isLight
              ? 'border border-slate-200 bg-white/95 text-slate-900 shadow-slate-300/50'
              : 'border border-blue-500/40 bg-slate-900/95 text-white shadow-blue-950/40'
          }`}
          style={{ top: 'max(env(safe-area-inset-top), 1rem)', backdropFilter: 'blur(10px)' }}
          onClick={onClick ? () => { onDismiss(); onClick(); } : undefined}
          role="status"
          aria-live="polite"
        >
          {message.icon && <span className="flex-shrink-0 text-blue-500">{message.icon}</span>}
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold leading-tight">{message.text}</span>
            {message.detail && (
              <span className="block truncate text-xs text-slate-500">{message.detail}</span>
            )}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
