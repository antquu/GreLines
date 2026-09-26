import { useEffect, useState } from 'react';
import { ArrowRightIcon } from '@heroicons/react/24/solid';
import { onDevCommand } from '../utils/devCommands';
import { AnimatePresence, motion } from 'framer-motion';
import { IoWifi } from 'react-icons/io5';
import { isOffline } from '../services/offlineSchedule';
import { hasOfflineSchedules } from '../services/networkSchedules';
import { useIsOffline } from '../hooks/useIsOffline';

/**
 * L'écran qui accueille une ouverture sans réseau.
 *
 * Plein écran noir partout. Sur téléphone, le texte occupe la colonne et le
 * bouton descend en bas ; sur ordinateur, c'est un bloc étroit au milieu de
 * l'écran, texte calé à gauche.
 *
 * Sans lui, l'app s'ouvrait comme d'habitude et l'on découvrait peu à peu que
 * rien n'était en direct. On le dit d'entrée, en un écran : ce qui se passe,
 * et ce qu'on peut encore faire.
 *
 * Deux cas :
 *  - les horaires sont déjà sur l'appareil : GreLines reste utilisable, un
 *    bouton « Continuer » ferme l'écran en fondu ;
 *  - rien n'a encore été téléchargé : il n'y a rien à montrer. Pas de bouton,
 *    seulement ce qu'il faut faire : ouvrir l'app une fois avec du réseau.
 *    L'écran s'efface de lui-même quand la connexion revient.
 *
 * La décision se prend à l'ouverture, une fois : une coupure en cours de
 * route n'interrompt pas ce qu'on est en train de faire.
 */
export function OfflineLaunchScreen({ language }: { language: 'fr' | 'en' }) {
  const isFr = language === 'fr';
  /* Décidé à l'ouverture. Les données se vérifient dans le stockage de
     l'appareil, ce qui prend un instant : on part du « rien », et l'on
     corrige dès que la réponse arrive. */
  const [launch, setLaunch] = useState(() => (isOffline() ? { hasData: false } : null));
  const [dismissed, setDismissed] = useState(false);
  const offline = useIsOffline();

  const launchedOffline = !!launch;
  useEffect(() => {
    if (!launchedOffline) return;
    let active = true;
    void hasOfflineSchedules().then(hasData => {
      if (active && hasData) setLaunch({ hasData: true });
    });
    return () => { active = false; };
  }, [launchedOffline]);

  /* La console développeur peut fermer l'écran, données ou pas. */
  useEffect(() => onDevCommand('bypassWIFI.popup', () => setDismissed(true)), []);

  /* Sans données, l'écran n'a pas de bouton : c'est le retour du réseau qui
     le ferme. Avec, c'est « Continuer ». */
  const visible = !!launch && !dismissed && (launch.hasData || offline);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="offline-launch"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          /* Couleurs posées en style : le thème clair recolore les classes
             utilitaires, et cet écran est le même dans les deux thèmes. */
          style={{ backgroundColor: '#0b0b0b' }}
          className="fixed inset-0 z-[10100] flex flex-col px-8 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+88px)] md:items-center md:justify-center md:p-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="offline-launch-title"
        >
          {/* Sur téléphone, la colonne occupe l'écran et le bouton descend en
              bas. Sur ordinateur, c'est un bloc étroit posé au milieu de
              l'écran noir, le texte toujours calé à gauche. */}
          <div className="flex flex-1 flex-col md:w-[400px] md:flex-none">
            <IoWifi className="h-24 w-24 md:h-16 md:w-16" style={{ color: '#333333' }} aria-hidden="true" />

            {/* Un paragraphe marqué titre, pas un <h1> : la feuille globale impose
                aux <h1> une taille et des marges qui écrasaient celles-ci. */}
            <p role="heading" aria-level={1} id="offline-launch-title" className="pt-14 text-[30px] font-medium leading-[1.15] md:pt-16 md:text-[28px]" style={{ color: '#ffffff' }}>
              {isFr ? 'Vous êtes en mode hors ligne' : 'You are offline'}
            </p>
            <p className="pt-3 text-[19px] leading-snug md:pt-5" style={{ color: '#a3a3a3' }}>
              {launch?.hasData
                ? (isFr ? 'Vous pouvez tout de même utiliser GreLines.' : 'You can still use GreLines.')
                : (isFr
                  ? 'Aucun horaire n’est encore enregistré sur cet appareil. Ouvrez GreLines une première fois avec une connexion : ensuite, il fonctionnera même sans réseau.'
                  : 'No timetable is saved on this device yet. Open GreLines once with a connection: after that, it will work even offline.')}
            </p>

            {launch?.hasData && (
              <>
                {/* Téléphone : un large bouton au pouce, en bas de l'écran. */}
                <button
                  type="button"
                  onClick={() => setDismissed(true)}
                  style={{ backgroundColor: '#ffffff', color: '#000000' }}
                  className="mt-auto w-full rounded-2xl py-4 text-[17px] font-semibold transition active:scale-[0.98] md:hidden"
                >
                  {isFr ? 'Continuer' : 'Continue'}
                </button>
                {/* Ordinateur : un rond blanc et une flèche, calé à droite du
                    bloc. Le mot n'ajoute rien à la flèche sous la souris. */}
                <button
                  type="button"
                  onClick={() => setDismissed(true)}
                  aria-label={isFr ? 'Continuer' : 'Continue'}
                  title={isFr ? 'Continuer' : 'Continue'}
                  style={{ backgroundColor: '#ffffff', color: '#000000' }}
                  className="mt-10 hidden h-12 w-12 items-center justify-center self-end rounded-full transition hover:scale-105 active:scale-95 md:flex"
                >
                  <ArrowRightIcon className="h-5 w-5" aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
