/**
 * La mise en route, au premier lancement de l'application installée.
 *
 * Trois questions, une par écran, dans l'ordre où elles se posent : être
 * prévenu pendant un trajet, avoir sa carte OURA sous la main, exister sous un
 * nom auprès des autres voyageurs. Chacune se passe, aucune ne bloque — on doit
 * pouvoir consulter un horaire trente secondes après avoir installé
 * l'application.
 *
 * Chaque écran dit ce qu'il apporte avant de demander quoi que ce soit. Une
 * autorisation qu'on accorde sans savoir à quoi elle sert est une autorisation
 * qu'on retire le lendemain.
 *
 * Ce qui a déjà été fait se voit : l'écran de la carte, quand une carte est
 * déjà là, ne redemande rien — il le constate et propose de continuer. C'est ce
 * qui permet de traverser le parcours sans avoir l'impression de répondre à un
 * formulaire.
 */

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { BellAlertIcon, CheckCircleIcon } from '@heroicons/react/24/solid';
import { AddCardSheet } from './AddCardSheet';
import { notificationPermission } from '../services/tripNotifications';
import type { OuraCard } from '../services/ouraCard';

/*
 * Deux écrans, et pas un de plus.
 *
 * Le parcours en comptait quatre : notifications, carte, compte, puis un écran
 * de félicitations qui ne demandait rien. Trois questions d'affilée avant
 * d'avoir vu un horaire, c'est un formulaire, et l'on répond « plus tard » à
 * tout par réflexe. Restent les deux qui changent quelque chose tout de suite.
 *
 * Le compte n'y est plus : il n'a de sens qu'une fois la carte ajoutée, et
 * c'est l'écran Compte qui le propose alors, au bon moment.
 */
type Step = 'notifications' | 'card';

export function OnboardingFlow({
  isOpen,
  language,
  cards,
  canAddCard,
  onEnableNotifications,
  onCardsChange,
  onDone,
}: {
  isOpen: boolean;
  language: 'fr' | 'en';
  cards: OuraCard[];
  /** Faux quand la base n'est pas configurée : l'étape de la carte n'a alors rien à offrir. */
  canAddCard: boolean;
  onEnableNotifications: () => Promise<void> | void;
  onCardsChange: (cards: OuraCard[]) => void;
  onDone: () => void;
}) {
  const isFr = language === 'fr';
  const [index, setIndex] = useState(0);
  const [isAddCardOpen, setIsAddCardOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  /*
   * Le parcours s'efface au lieu de disparaître.
   *
   * « Passer » faisait sauter l'écran d'un coup, et l'application apparaissait
   * comme si l'on avait fermé une fenêtre par erreur. Un fondu de trois cents
   * millisecondes dit qu'on a bien quitté quelque chose.
   */
  const [leaving, setLeaving] = useState(false);

  /*
   * La liste des écrans est arrêtée à l'ouverture, et ne bouge plus.
   *
   * Recalculée à chaque rendu, elle raccourcissait sous les pieds : ajouter une
   * carte faisait disparaître l'écran de la carte, l'index désignait alors
   * l'écran suivant, et l'on se retrouvait projeté deux pas plus loin sans
   * avoir rien touché.
   */
  const steps = useMemo<Step[]>(() => {
    const list: Step[] = [];
    if (notificationPermission() === 'default') list.push('notifications');
    if (canAddCard) list.push('card');
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setIndex(0);
      setIsAddCardOpen(false);
      setLeaving(false);
    }
  }, [isOpen]);

  if (!isOpen || typeof document === 'undefined') return null;
  /* Notifications déjà réglées et pas de carte à proposer : il n'y a rien à
     dire, et un écran qui ne demande rien ne vaut pas d'être montré. */
  if (steps.length === 0) return null;

  const step = steps[Math.min(index, steps.length - 1)];
  const isLast = index >= steps.length - 1;

  /** Sortir : le fondu d'abord, le démontage ensuite. */
  const finish = () => {
    setLeaving(true);
    window.setTimeout(onDone, 300);
  };

  const next = () => {
    if (isLast) finish();
    else setIndex(current => current + 1);
  };

  const hasCard = cards.length > 0;

  /** Ce que chaque écran raconte, et ce qu'il propose de faire. */
  const content: Record<Step, {
    Icon?: typeof BellAlertIcon;
    /** L'image du milieu, quand elle vaut mieux qu'un pictogramme. */
    image?: string;
    title: string;
    body: string;
    action: string;
    onAction: () => void;
  }> = {
    notifications: {
      Icon: BellAlertIcon,
      title: isFr ? 'Être prévenu pendant le trajet' : 'Be warned during your trip',
      body: isFr
        ? 'Le moment de partir, la correspondance à ne pas manquer, l’arrêt où descendre. Rien d’autre : ni promotion, ni rappel, ni nouveauté.'
        : 'When to leave, the connection not to miss, the stop to get off at. Nothing else: no promotions, no reminders, no news.',
      action: isFr ? 'Activer les notifications' : 'Turn on notifications',
      onAction: () => {
        setBusy(true);
        void Promise.resolve(onEnableNotifications()).finally(() => {
          setBusy(false);
          next();
        });
      },
    },
    card: {
      /* La carte elle-même, de face, plutôt qu'un pictogramme de carte
         bancaire : c'est le carton qu'on a dans la poche, et on le reconnaît
         avant d'avoir lu le titre. */
      image: hasCard ? undefined : '/assets/oura.png',
      Icon: hasCard ? CheckCircleIcon : undefined,
      title: hasCard
        ? isFr ? 'Votre carte est là' : 'Your card is here'
        : isFr ? 'Votre carte dans le GreLines Wallet' : 'Your card in the GreLines Wallet',
      body: hasCard
        ? isFr
          ? 'Elle vous suit dans le portefeuille : vous la montrez au contrôle sans sortir le carton.'
          : 'It lives in your wallet: show it to an inspector without digging out the card.'
        : isFr
          ? 'Aucune inscription, juste un scan. L’appareil photo lit les dix chiffres du dos, et la carte est là.'
          : 'No sign-up, just a scan. The camera reads the ten digits on the back, and the card is there.',
      action: hasCard
        ? isFr ? 'Continuer' : 'Continue'
        : isFr ? 'Scanner ma carte' : 'Scan my card',
      onAction: () => (hasCard ? next() : setIsAddCardOpen(true)),
    },
  };

  const { Icon, image, title, body, action, onAction } = content[step];

  return createPortal(
    <>
      <div
        className={`fixed inset-0 z-[1450] overflow-hidden bg-[#020617] text-white transition-opacity duration-300 ${
          leaving ? 'pointer-events-none opacity-0' : 'opacity-100'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={isFr ? 'Configuration' : 'Setup'}
      >
        <motion.div
          className="flex h-[100dvh] min-h-[30rem] flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] text-center"
          initial={{ opacity: 0, y: '100%' }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.34, ease: [0.32, 0.72, 0, 1] }}
        >
          {/* Où l'on en est : autant de traits que d'écrans. On sait combien il
              en reste, ce qui suffit à accepter d'en traverser trois. */}
          <div className="flex gap-1.5" aria-hidden>
            {steps.map((entry, position) => (
              <div
                key={entry}
                className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                  position <= index ? 'bg-blue-500' : 'bg-white/15'
                }`}
              />
            ))}
          </div>

          {/*
            Le contenu se rejoue à chaque écran : la clé le remonte, et
            l'animation d'entrée repart. Sans elle, on ne verrait que le texte
            se substituer, et rien ne dirait qu'on a avancé d'un pas.
          */}
          <div key={step} className="gl-stagger flex flex-1 flex-col items-center justify-center">
            {image ? (
              <img
                src={image}
                alt=""
                draggable={false}
                className="w-full max-w-[19rem] rounded-[4.5%]"
              />
            ) : Icon ? (
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-white/10 bg-white/[0.05]">
                <Icon className="h-8 w-8" />
              </div>
            ) : null}
            <h1 className="mt-8 max-w-sm text-[30px] font-extrabold leading-tight">{title}</h1>
            <div className="mt-3 max-w-sm">
              <p className="text-[16px] leading-relaxed text-white/65">{body}</p>
            </div>
          </div>

          <div className="flex flex-shrink-0 flex-col items-center gap-3">
            <button
              type="button"
              onClick={onAction}
              disabled={busy}
              className="w-full max-w-sm rounded-2xl bg-blue-600 py-4 text-[15px] font-bold text-white transition active:scale-[0.98] disabled:opacity-60"
            >
              {action}
            </button>
            {/* La sortie est toujours là, jamais mise en avant. Un parcours dont
                on ne peut pas sortir n'est pas une proposition. */}
            <button
              type="button"
              onClick={isLast ? finish : next}
              className="py-1 text-[13px] font-normal text-white/45 transition active:text-white/80"
            >
              {isFr ? 'Passer' : 'Skip'}
            </button>
          </div>
        </motion.div>
      </div>

      {/* L'ajout de carte, en écran plein : le parcours est déjà un écran noir,
          et une feuille montante y laissait voir un bord de feuille posé sur du
          vide. Ailleurs dans l'application, elle reste une feuille. */}
      <AddCardSheet
        isOpen={isAddCardOpen && isOpen}
        language={language}
        theme="dark"
        variant="screen"
        onClose={() => setIsAddCardOpen(false)}
        onSaved={card => {
          onCardsChange([...cards.filter(entry => entry.id !== card.id), card]);
          setIsAddCardOpen(false);
        }}
      />
    </>,
    document.body,
  );
}
