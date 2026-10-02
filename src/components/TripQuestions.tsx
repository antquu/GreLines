import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon } from '@heroicons/react/24/solid';
import { submitTripSurvey, submitStopSurvey, type TripSurveyLeg } from '../services/cms';
import { publishSignal, type SignalKind, type SignalValue } from '../services/crowdSignals';
import { getSurveyConsent } from './TripSurvey';
import { notifyTripMoment, speak } from '../services/tripNotifications';


const CHOICE_KEY = 'greLines_surveyMoreQuestions';

type Appetite = 'yes' | 'later' | 'no';

function readAppetite(): { choice: Appetite; scope: string } {
  try {
    const raw = localStorage.getItem(CHOICE_KEY);
    if (!raw) return { choice: 'yes', scope: '' };
    const parsed = JSON.parse(raw);
    const choice: Appetite =
      parsed?.choice === 'no' || parsed?.choice === 'later' ? parsed.choice : 'yes';
    return { choice, scope: String(parsed?.scope ?? '') };
  } catch {
    return { choice: 'yes', scope: '' };
  }
}

function writeAppetite(choice: Appetite, scope: string) {
  try {
    localStorage.setItem(CHOICE_KEY, JSON.stringify({ choice, scope }));
  } catch {
  }
}

const ANSWERS = [
  { value: 1, slot: 0, label: (fr: boolean) => (fr ? 'Mauvais' : 'Poor') },
  { value: 3, slot: 1, label: (fr: boolean) => (fr ? 'Moyen' : 'Okay') },
  { value: 5, slot: 2, label: (fr: boolean) => (fr ? 'Bien' : 'Good') },
];

interface Question {
  key: string;
  question: string;
  emojis: [string, string, string];
  labels?: [string, string, string];
  signal?: SignalKind;
}

const VEHICLE_QUESTIONS = (fr: boolean): Question[] => [
  {
    key: 'crowding',
    question: fr ? 'Reste-t-il de la place à bord ?' : 'Any room left on board?',
    emojis: ['🥵', '🧍', '💺'],
    labels: fr ? ['Bondé', 'Debout', 'Assis'] : ['Packed', 'Standing', 'Seats free'],
    signal: 'crowding',
  },
  {
    key: 'punctuality',
    question: fr ? 'Ce véhicule est-il à l’heure ?' : 'Is this vehicle on time?',
    emojis: ['🐢', '⏱️', '✅'],
    labels: fr ? ['En retard', 'Un peu', 'À l’heure'] : ['Late', 'A bit', 'On time'],
    signal: 'delay',
  },
  {
    key: 'cleanliness',
    question: fr ? 'Le véhicule est-il propre ?' : 'Is the vehicle clean?',
    emojis: ['💩', '🧻', '✨'],
  },
  {
    key: 'accessibility',
    question: fr ? 'La rampe et le plancher bas fonctionnent-ils ?' : 'Do the ramp and low floor work?',
    emojis: ['🚫', '😬', '♿'],
    labels: fr ? ['Hors service', 'Difficile', 'Praticable'] : ['Broken', 'Awkward', 'Works'],
    signal: 'access',
  },
  {
    key: 'comfort',
    question: fr ? 'Le trajet est-il confortable ?' : 'Is the ride comfortable?',
    emojis: ['🤢', '😐', '😌'],
  },
  {
    key: 'temperature',
    question: fr ? 'La température est-elle supportable ?' : 'Is the temperature bearable?',
    emojis: ['🥶', '😐', '👌'],
  },
  {
    key: 'onboardInfo',
    question: fr ? 'Les annonces et écrans marchent-ils ?' : 'Do announcements and screens work?',
    emojis: ['🙈', '😐', '📣'],
    labels: fr ? ['Rien', 'Partiel', 'Clair'] : ['Nothing', 'Partial', 'Clear'],
  },
  {
    key: 'quiet',
    question: fr ? 'Le trajet est-il calme ?' : 'Is the ride quiet?',
    emojis: ['🔊', '😐', '🤫'],
  },
  {
    key: 'feelsSafeOnboard',
    question: fr ? 'Vous sentez-vous à l’aise à bord ?' : 'Do you feel at ease on board?',
    emojis: ['😟', '😐', '🙂'],
  },
];

const STOP_QUESTIONS = (fr: boolean): Question[] => [
  {
    key: 'ghost',
    question: fr ? 'Le passage annoncé est-il bien passé ?' : 'Did the announced run actually show up?',
    emojis: ['👻', '🐢', '✅'],
    labels: fr ? ['Jamais venu', 'En retard', 'Bien passé'] : ['Never came', 'Late', 'Showed up'],
    signal: 'ghost',
  },
  {
    key: 'waitingCrowd',
    question: fr ? 'Combien de monde attend ici ?' : 'How many people are waiting here?',
    emojis: ['👨‍👩‍👧‍👦', '🧍', '🙋'],
    labels: fr ? ['La foule', 'Quelques-uns', 'Presque personne'] : ['A crowd', 'A few', 'Almost nobody'],
    signal: 'crowding',
  },
  {
    key: 'displayReadable',
    question: fr ? "L'affichage des horaires est-il lisible ?" : 'Is the departure display readable?',
    emojis: ['🚫', '🔍', '📟'],
  },
  {
    key: 'stopAccess',
    question: fr ? "L'accès au quai est-il praticable ?" : 'Is the platform reachable?',
    emojis: ['🚧', '😬', '♿'],
    labels: fr ? ['Bloqué', 'Difficile', 'Praticable'] : ['Blocked', 'Awkward', 'Fine'],
    signal: 'access',
  },
  {
    key: 'shelterCondition',
    question: fr ? "L'abri et le mobilier sont-ils en bon état ?" : 'Is the shelter in good shape?',
    emojis: ['🧹', '🪑', '✨'],
  },
  {
    key: 'feelsSafe',
    question: fr ? 'Vous sentez-vous à l’aise à cet arrêt ?' : 'Do you feel at ease at this stop?',
    emojis: ['😟', '😐', '🙂'],
  },
  {
    key: 'lighting',
    question: fr ? "L'éclairage est-il suffisant ?" : 'Is the lighting good enough?',
    emojis: ['🌑', '🔅', '💡'],
  },
  {
    key: 'seating',
    question: fr ? 'Y a-t-il de quoi s’asseoir ?' : 'Is there anywhere to sit?',
    emojis: ['🚫', '🪑', '🛋️'],
    labels: fr ? ['Rien', 'Une assise', 'De la place'] : ['Nothing', 'One perch', 'Plenty'],
  },
  {
    key: 'stopCleanliness',
    question: fr ? 'Le quai est-il propre ?' : 'Is the platform clean?',
    emojis: ['💩', '🧻', '✨'],
  },
];

const ROUND_SIZE = 3;

function toSignalValue(value: number): SignalValue {
  return value >= 5 ? 3 : value >= 3 ? 2 : 1;
}

interface TripQuestionsProps {
  subject: 'vehicle' | 'stop';
  targetId: string;
  targetName?: string | null;
  lineId?: string | null;
  boardingStop?: string | null;
  boardingTime?: string | null;
  journey?: TripSurveyLeg[];
  language: 'fr' | 'en';
  onAnswered?: () => void;
}

export function TripQuestions({
  subject,
  targetId,
  targetName,
  lineId,
  boardingStop,
  boardingTime,
  journey,
  language,
  onAnswered,
}: TripQuestionsProps) {
  const isFr = language === 'fr';
  const pool = subject === 'stop' ? STOP_QUESTIONS(isFr) : VEHICLE_QUESTIONS(isFr);

  const [asked, setAsked] = useState(0);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [dismissed, setDismissed] = useState(false);
  const [thanked, setThanked] = useState(false);

  const round = pool.slice(asked, asked + ROUND_SIZE);
  const exhausted = asked + round.length >= pool.length;

  const appetite = readAppetite();

  useEffect(() => {
    setAsked(0);
    setStep(0);
    setAnswers({});
    setThanked(false);
    setDismissed(false);
  }, [subject, targetId]);

  const silenced =
    !targetId ||
    round.length === 0 ||
    getSurveyConsent() === 'refused' ||
    appetite.choice === 'no' ||
    (appetite.choice === 'later' && appetite.scope === targetId);
  const open = !dismissed && !silenced;

  const done = step >= round.length;

  const subjectLabel =
    subject === 'stop'
      ? isFr
        ? 'cet arrêt'
        : 'this stop'
      : isFr
      ? 'ce trajet'
      : 'this trip';

  useEffect(() => {
    if (!open || step !== 0 || asked !== 0) return;
    void notifyTripMoment({ kind: 'question' }, language);
  }, [open, step, asked, language]);

  useEffect(() => {
    if (!open) return;
    const line = done
      ? exhausted
        ? isFr
          ? 'Merci, c’est tout pour cet arrêt.'
          : 'Thanks, that’s everything here.'
        : isFr
        ? `Encore des questions sur ${subjectLabel} ?`
        : `More questions about ${subjectLabel}?`
      : round[step]?.question;
    if (line) speak(line, language);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, asked, done, exhausted, language]);

  const send = (collected: Record<string, number>) => {
    if (subject === 'stop') {
      const hasKnown =
        collected.displayReadable != null ||
        collected.shelterCondition != null ||
        collected.feelsSafe != null;
      if (!hasKnown) return;
      void submitStopSurvey({
        stopId: targetId,
        stopName: targetName,
        displayReadable: collected.displayReadable,
        shelterCondition: collected.shelterCondition,
        feelsSafe: collected.feelsSafe,
        answeredAt: new Date().toISOString(),
      });
      return;
    }
    const hasKnown =
      collected.cleanliness != null ||
      collected.comfort != null ||
      collected.crowding != null ||
      collected.punctuality != null;
    if (!hasKnown) return;
    void submitTripSurvey({
      lineId: targetId,
      boardingStop,
      boardingTime,
      answeredAt: new Date().toISOString(),
      journey,
      cleanliness: collected.cleanliness,
      comfort: collected.comfort,
      crowding: collected.crowding,
      punctuality: collected.punctuality,
    });
  };

  const pick = (question: Question, value: number) => {
    const updated = { ...answers, [question.key]: value };
    setAnswers(updated);
    onAnswered?.();

    if (question.signal) {
      void publishSignal({
        kind: question.signal,
        lineId: subject === 'vehicle' ? targetId : lineId ?? null,
        stopId: subject === 'stop' ? targetId : null,
        stopName: subject === 'stop' ? targetName ?? null : null,
        value: toSignalValue(value),
      });
    }

    if (step + 1 >= round.length) send(updated);
    window.setTimeout(() => setStep((s) => s + 1), 160);
  };

  const answer = (choice: Appetite) => {
    writeAppetite(choice, choice === 'later' ? targetId : '');
    if (choice === 'yes') {
      setThanked(true);
      window.setTimeout(() => {
        setThanked(false);
        setAnswers({});
        setAsked((n) => n + ROUND_SIZE);
        setStep(0);
      }, 1200);
      return;
    }
    setDismissed(true);
  };

  const current = round[step];

  return (
    <motion.div
      className="overflow-hidden"
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
      transition={{
        height: { type: 'spring', stiffness: 300, damping: 32 },
        opacity: { duration: 0.2 },
      }}
    >
      <div className="mt-3 border-t border-white/10 pt-3">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div
            key={done ? `more-${asked}` : current?.key}
            initial={{ x: '60%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '-60%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 460, damping: 40 }}
          >
            {done ? (
              <div>
                <p className="mb-2.5 text-sm font-bold leading-snug text-white">
                  {thanked
                    ? isFr
                      ? 'Merci, on continue.'
                      : 'Thanks, let’s continue.'
                    : exhausted
                    ? isFr
                      ? 'Merci — on a fait le tour.'
                      : 'Thanks — that’s everything.'
                    : isFr
                    ? `Encore des questions sur ${subjectLabel} ?`
                    : `More questions about ${subjectLabel}?`}
                </p>
                {!thanked && !exhausted && (
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { choice: 'no' as const, emoji: '🙅', label: isFr ? 'Non merci' : 'No thanks' },
                      { choice: 'later' as const, emoji: '⏳', label: isFr ? 'Plus tard' : 'Later' },
                      { choice: 'yes' as const, emoji: '🙋', label: isFr ? 'Continuer' : 'Continue' },
                    ].map((door) => (
                      <button
                        key={door.choice}
                        onClick={() => answer(door.choice)}
                        className="flex flex-col items-start rounded-xl bg-slate-800 px-2.5 py-2 text-left active:bg-slate-700"
                      >
                        <span className="text-xl leading-none" aria-hidden>
                          {door.emoji}
                        </span>
                        <span className="mt-1.5 text-xs font-semibold text-slate-200">
                          {door.label}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div className="mb-2 flex items-start justify-between gap-3">
                  <p className="text-sm font-bold leading-snug text-white">{current.question}</p>
                  <button
                    onClick={() => setDismissed(true)}
                    className="-mt-0.5 flex-shrink-0 rounded-full p-1 text-slate-500 active:text-white"
                    aria-label={isFr ? 'Masquer' : 'Dismiss'}
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {ANSWERS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => pick(current, option.value)}
                      className="flex flex-col items-start rounded-xl bg-slate-800 px-2.5 py-2 text-left active:bg-slate-700"
                    >
                      <span className="text-xl leading-none" aria-hidden>
                        {current.emojis[option.slot]}
                      </span>
                      <span className="mt-1.5 text-xs font-semibold text-slate-200">
                        {current.labels?.[option.slot] ?? option.label(isFr)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
