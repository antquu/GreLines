import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon } from '@heroicons/react/24/solid';
import { submitTripSurvey, submitStopSurvey, type TripSurveyLeg } from '../services/cms';
import { getSurveyConsent } from './TripSurvey';
import { notifyTripMoment, speak } from '../services/tripNotifications';

/**
 * Les questions posées pendant le trajet, dans le bandeau du haut.
 *
 * Le questionnaire de fin de trajet arrivait au pire moment : on descend, on
 * range son téléphone, on a autre chose à faire. En roulant, en revanche, on est
 * assis avec le téléphone en main et l'on est *dans* le véhicule dont on parle —
 * la propreté et l'affluence ne se jugent pas de mémoire.
 *
 * Et en attendant sur le quai, c'est le quai qu'on a sous les yeux. Un afficheur
 * éteint ou un abri cassé ne se constate qu'en étant là ; l'attente est donc le
 * seul moment où ces questions ont un sens, et personne ne les posait.
 *
 * Une question à la fois, trois réponses, et toucher l'une passe directement à la
 * suivante. Il n'y a rien à valider : la réponse est le geste.
 */

const CHOICE_KEY = 'greLines_surveyMoreQuestions';

/**
 * Ce que l'usager a répondu à « encore des questions ? ».
 *
 * `later` n'est pas un refus : c'est un « pas sur celle-là ». On le retient pour
 * la ligne ou l'arrêt en cours seulement, et la fois suivante repart de zéro —
 * un « plus tard » qui vaudrait pour toujours serait un « non » déguisé.
 */
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
    // Navigation privée : le choix vaudra pour cette session.
  }
}

/** Trois paliers plutôt que cinq étoiles : on répond debout, dans un véhicule qui bouge. */
const ANSWERS = [
  { value: 1, slot: 0, label: (fr: boolean) => (fr ? 'Mauvais' : 'Poor') },
  { value: 3, slot: 1, label: (fr: boolean) => (fr ? 'Moyen' : 'Okay') },
  { value: 5, slot: 2, label: (fr: boolean) => (fr ? 'Bien' : 'Good') },
];

interface Question {
  key: string;
  question: string;
  emojis: [string, string, string];
}

const VEHICLE_QUESTIONS = (fr: boolean): Question[] => [
  {
    key: 'cleanliness',
    question: fr ? 'Le véhicule est-il propre ?' : 'Is the vehicle clean?',
    emojis: ['💩', '🧻', '✨'],
  },
  {
    key: 'comfort',
    question: fr ? 'Le trajet est-il confortable ?' : 'Is the ride comfortable?',
    emojis: ['🤢', '😐', '😌'],
  },
  {
    key: 'crowding',
    question: fr ? 'Combien de places libres voyez-vous ?' : 'How many free seats do you see?',
    emojis: ['🥵', '🧍', '💺'],
  },
];

const STOP_QUESTIONS = (fr: boolean): Question[] => [
  {
    key: 'displayReadable',
    question: fr ? "L'affichage des horaires est-il lisible ?" : 'Is the departure display readable?',
    emojis: ['🚫', '🔍', '📟'],
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
];

interface TripQuestionsProps {
  /**
   * Ce dont on parle : un véhicule, ou l'arrêt où l'on attend.
   *
   * Un seul composant pour les deux, parce que la mécanique est la même — poser,
   * enregistrer, enchaîner — et que la dupliquer ferait diverger deux
   * questionnaires qui doivent se ressembler.
   */
  subject: 'vehicle' | 'stop';
  /** Code de ligne, ou identifiant de poteau selon le sujet. */
  targetId: string;
  targetName?: string | null;
  boardingStop?: string | null;
  boardingTime?: string | null;
  journey?: TripSurveyLeg[];
  language: 'fr' | 'en';
  /** Signale chaque réponse : l'écran de fin les compte comme contributions. */
  onAnswered?: () => void;
}

export function TripQuestions({
  subject,
  targetId,
  targetName,
  boardingStop,
  boardingTime,
  journey,
  language,
  onAnswered,
}: TripQuestionsProps) {
  const isFr = language === 'fr';
  const questions = subject === 'stop' ? STOP_QUESTIONS(isFr) : VEHICLE_QUESTIONS(isFr);

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [dismissed, setDismissed] = useState(false);
  const [thanked, setThanked] = useState(false);

  const appetite = readAppetite();



  /*
   * Un refus vaut pour toujours. Un « plus tard » ne vaut que pour la ligne ou
   * l'arrêt qu'on venait de noter : changer de véhicule remet la question.
   *
   * Ces cas-là ne rendent pas `null` : le composant se replie d'abord. Renvoyer
   * `null` depuis l'intérieur retirait le bandeau d'un coup — `AnimatePresence`
   * du parent ne voit pas passer un enfant qui s'annule lui-même, et le
   * rétrécissement ne jouait jamais. On garde donc l'élément monté, hauteur zéro,
   * et c'est le repli qu'on voit.
   */
  const silenced =
    !targetId ||
    getSurveyConsent() === 'refused' ||
    appetite.choice === 'no' ||
    (appetite.choice === 'later' && appetite.scope === targetId);
  const open = !dismissed && !silenced;

  const done = step >= questions.length;

  /*
   * L'avis n'accompagne que la première question d'un sujet, et seulement si le
   * questionnaire s'ouvre pour de bon.
   *
   * En annoncer chacune ferait sonner le téléphone trois fois d'affilée alors
   * qu'on a déjà l'écran en main. Et l'annoncer alors que l'usager a dit non
   * serait le meilleur moyen de lui faire couper tous les avis, y compris ceux du
   * trajet.
   */
  useEffect(() => {
    if (!open || step !== 0) return;
    void notifyTripMoment({ kind: 'question' }, language);
  }, [open, step, language]);

  /*
   * La question se lit à voix haute, celle-là et pas son annonce.
   *
   * On répond dans un véhicule qui bouge, parfois debout, parfois sans regarder :
   * entendre « le véhicule est-il propre ? » suffit à savoir laquelle des trois
   * cartes toucher. Les libellés des réponses ne sont pas dits — trois mots de
   * plus à chaque question rendraient l'ensemble bavard, et leur ordre est
   * toujours le même.
   */
  useEffect(() => {
    if (!open) return;
    const line = done
      ? isFr
        ? `Encore des questions sur ${subjectLabel} ?`
        : `More questions about ${subjectLabel}?`
      : questions[step]?.question;
    if (line) speak(line, language);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, done, language]);

  const subjectLabel =
    subject === 'stop'
      ? isFr
        ? 'cet arrêt'
        : 'this stop'
      : isFr
      ? 'ce trajet'
      : 'this trip';


  const send = (finalAnswers: Record<string, number>) => {
    if (subject === 'stop') {
      void submitStopSurvey({
        stopId: targetId,
        stopName: targetName,
        displayReadable: finalAnswers.displayReadable,
        shelterCondition: finalAnswers.shelterCondition,
        feelsSafe: finalAnswers.feelsSafe,
        answeredAt: new Date().toISOString(),
      });
      return;
    }
    void submitTripSurvey({
      lineId: targetId,
      boardingStop,
      boardingTime,
      // L'heure du téléphone à la seconde de la réponse : rapportée à l'heure de
      // montée, c'est elle qui situera le véhicule sur son parcours.
      answeredAt: new Date().toISOString(),
      journey,
      cleanliness: finalAnswers.cleanliness,
      comfort: finalAnswers.comfort,
      crowding: finalAnswers.crowding,
    });
  };

  const pick = (key: string, value: number) => {
    const updated = { ...answers, [key]: value };
    setAnswers(updated);
    onAnswered?.();
    if (step + 1 >= questions.length) send(updated);
    // Un court délai laisse voir la carte se colorer avant qu'elle sorte : sans
    // lui, on ne sait pas si l'on a touché ce qu'on visait.
    window.setTimeout(() => setStep((s) => s + 1), 160);
  };

  const answer = (choice: Appetite) => {
    writeAppetite(choice, choice === 'later' ? targetId : '');
    if (choice === 'yes') {
      // On repart au début : trois questions de plus sur le même sujet, ce qui
      // est exactement ce que « oui, continuer » demande.
      setThanked(true);
      window.setTimeout(() => {
        setThanked(false);
        setAnswers({});
        setStep(0);
      }, 1200);
      return;
    }
    setDismissed(true);
  };


  return (
    /*
     * Le bandeau s'étire vers le bas quand les questions arrivent, et se
     * rétracte quand elles s'en vont. `height: auto` laisse framer mesurer :
     * les questions n'ont pas toutes la même hauteur, les libellés passent à la
     * ligne selon la largeur, et fixer une hauteur aurait laissé un vide sous
     * les courtes.
     */
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
            key={done ? 'more' : questions[step].key}
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
                    : isFr
                    ? `Encore des questions sur ${subjectLabel} ?`
                    : `More questions about ${subjectLabel}?`}
                </p>
                {!thanked && (
                  /*
                   * Trois portes, pas deux.
                   *
                   * « Non merci » ferme le sujet pour de bon. « Plus tard » ne
                   * vaut que pour ce véhicule ou ce quai — on redemandera au
                   * prochain, ce qui laisse dire non sans se fermer la porte.
                   * Et « Continuer » relance trois questions ici même.
                   */
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
                        {/* La dernière carte se présente comme les autres : même
                            émoji en haut à gauche, même libellé dessous. C'en est
                            une question de plus, pas un formulaire qui s'ouvre. */}
                        <span className="text-xl leading-none" aria-hidden>
                          {door.emoji}
                        </span>
                        {/* Aucune des trois n'est mise en avant : accepter et
                            refuser doivent se présenter pareil, sinon la question
                            n'en est plus une. */}
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
                  <p className="text-sm font-bold leading-snug text-white">
                    {questions[step].question}
                  </p>
                  <button
                    onClick={() => setDismissed(true)}
                    className="-mt-0.5 flex-shrink-0 rounded-full p-1 text-slate-500 active:text-white"
                    aria-label={isFr ? 'Masquer' : 'Dismiss'}
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                </div>

                {/* Émoji en haut à gauche, réponse alignée dessous : on lit une
                    colonne par carte, pas trois blocs centrés qu'il faut
                    comparer. */}
                <div className="grid grid-cols-3 gap-2">
                  {ANSWERS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => pick(questions[step].key, option.value)}
                      className="flex flex-col items-start rounded-xl bg-slate-800 px-2.5 py-2 text-left active:bg-slate-700"
                    >
                      <span className="text-xl leading-none" aria-hidden>
                        {questions[step].emojis[option.slot]}
                      </span>
                      <span className="mt-1.5 text-xs font-semibold text-slate-200">
                        {option.label(isFr)}
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
