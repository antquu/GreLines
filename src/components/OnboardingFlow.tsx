import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { BellAlertIcon, CheckCircleIcon, CreditCardIcon } from '@heroicons/react/24/solid';
import { AddCardSheet } from './AddCardSheet';
import { notificationPermission } from '../services/tripNotifications';
import type { OuraCard } from '../services/ouraCard';

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
  canAddCard: boolean;
  onEnableNotifications: () => Promise<void> | void;
  onCardsChange: (cards: OuraCard[]) => void;
  onDone: () => void;
}) {
  const isFr = language === 'fr';
  const [index, setIndex] = useState(0);
  const [isAddCardOpen, setIsAddCardOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);

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
  if (steps.length === 0) return null;

  const step = steps[Math.min(index, steps.length - 1)];
  const isLast = index >= steps.length - 1;

  const finish = () => {
    setLeaving(true);
    window.setTimeout(onDone, 300);
  };

  const next = () => {
    if (isLast) finish();
    else setIndex(current => current + 1);
  };

  const hasCard = cards.length > 0;

  const content: Record<Step, {
    Icon: typeof BellAlertIcon;
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
      Icon: hasCard ? CheckCircleIcon : CreditCardIcon,
      title: hasCard
        ? isFr ? 'Votre carte OURA est là' : 'Your OURA card is here'
        : isFr ? 'Votre carte OURA dans le GreLines Wallet' : 'Your OURA card in the GreLines Wallet',
      body: hasCard
        ? isFr
          ? 'Elle vous suit dans le portefeuille : vous la montrez au contrôle sans sortir le carton.'
          : 'It lives in your wallet: show it to an inspector without digging out the card.'
        : isFr
          ? 'Votre carte de transport OURA, sans inscription, juste un scan. L’appareil photo lit les dix chiffres au dos de la carte, et elle est là.'
          : 'Your OURA transport card, no sign-up, just a scan. The camera reads the ten digits on the back of the card, and it is there.',
      action: hasCard
        ? isFr ? 'Continuer' : 'Continue'
        : isFr ? 'Scanner ma carte OURA' : 'Scan my OURA card',
      onAction: () => (hasCard ? next() : setIsAddCardOpen(true)),
    },
  };

  const { Icon, title, body, action, onAction } = content[step];

  return createPortal(
    <>
      <div
        className={`fixed inset-0 z-[1450] overflow-hidden transition-opacity duration-300 ${
          leaving ? 'pointer-events-none opacity-0' : 'opacity-100'
        }`}
        style={{ backgroundColor: '#0b0b0b' }}
        role="dialog"
        aria-modal="true"
        aria-label={isFr ? 'Configuration' : 'Setup'}
      >
        <motion.div
          className="flex h-[100dvh] min-h-[30rem] flex-col px-8 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(var(--gl-safe-top)+20px)]"
          initial={{ opacity: 0, y: '100%' }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.34, ease: [0.32, 0.72, 0, 1] }}
        >
          <div className="flex gap-1.5" aria-hidden>
            {steps.map((entry, position) => (
              <div
                key={entry}
                className="h-1 flex-1 rounded-full transition-colors duration-300"
                style={{ backgroundColor: position <= index ? '#ffffff' : '#262626' }}
              />
            ))}
          </div>

          <div key={step} className="gl-stagger flex flex-1 flex-col pt-16">
            <Icon className="h-24 w-24" style={{ color: '#333333' }} aria-hidden="true" />

            <p role="heading" aria-level={1} className="pt-14 text-[1.875rem] font-medium leading-[1.15]" style={{ color: '#ffffff' }}>
              {title}
            </p>
            <p className="pt-3 text-[1.1875rem] leading-snug" style={{ color: '#a3a3a3' }}>
              {body}
            </p>
          </div>

          <div className="flex flex-shrink-0 flex-col items-center gap-3">
            <button
              type="button"
              onClick={onAction}
              disabled={busy}
              style={{ backgroundColor: '#ffffff', color: '#000000' }}
              className="w-full rounded-2xl py-4 text-[1.0625rem] font-semibold transition active:scale-[0.98] disabled:opacity-60"
            >
              {action}
            </button>
            <button
              type="button"
              onClick={isLast ? finish : next}
              className="py-1 text-[0.875rem] font-normal transition active:opacity-70"
              style={{ color: '#737373' }}
            >
              {isFr ? 'Passer' : 'Skip'}
            </button>
          </div>
        </motion.div>
      </div>

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
