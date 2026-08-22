import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon } from '@heroicons/react/24/solid';
import { submitTripSurvey, submitStopSurvey, type TripSurveyLeg } from '../services/cms';
import { publishSignal, type SignalKind, type SignalValue } from '../services/crowdSignals';
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
 *
 * Certaines réponses ne servent pas qu'à l'exploitant : le remplissage réel, le
 * retard ressenti, le passage fantôme et l'accès du jour repartent aussi dans
 * `crowdSignals`, où ils deviennent la pastille de confiance affichée sur les
 * prochains passages. C'est la boucle complète — on répond en attendant, et le
 * voyageur suivant voit la réponse avant de décider s'il attend.
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
  /**
   * Les libellés propres à la question, quand « Mauvais / Moyen / Bien » ne veut
   * rien dire.
   *
   * « Le tram est-il passé ? » ne se répond pas par « moyen ». Les questions qui
   * ne portent pas un jugement mais un constat nomment donc leurs trois
   * réponses, et l'échelle sous-jacente reste la même pour que tout se compare.
   */
  labels?: [string, string, string];
  /**
   * Le signalement que cette réponse alimente, s'il y en a un.
   *
   * Toutes les questions ne valent pas pour les autres voyageurs : la propreté
   * d'un bus est un avis d'exploitant, son remplissage est une décision de quai.
   * Seules les secondes repartent dans la pastille de confiance.
   */
  signal?: SignalKind;
}

/**
 * Les questions du véhicule, dans l'ordre où on les pose.
 *
 * L'ordre n'est pas décoratif : les trois premières partent d'un usager qui
 * vient de monter et regarde autour de lui, les suivantes demandent d'y avoir
 * passé quelques minutes. « Continuer » descend simplement la liste, si bien
 * qu'un habitué finit par tout voir sans jamais revoir la même.
 */
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

/**
 * Les questions du quai, dans l'ordre où on les pose.
 *
 * Le passage fantôme d'abord : c'est la seule que personne d'autre ne peut
 * répondre, et celle qui rend service au voyageur suivant dans la minute.
 */
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

/** Combien de questions par tournée. Trois : au-delà, on repose le téléphone. */
const ROUND_SIZE = 3;

/**
 * L'échelle des enquêtes (1 / 3 / 5) ramenée à celle des signalements (1 / 2 / 3).
 *
 * Deux échelles parce que deux usages : les enquêtes se comparent à l'historique
 * déjà collecté, les signalements s'agrègent en une note. Les convertir ici, en
 * un seul endroit, évite d'avoir à s'en souvenir ailleurs.
 */
function toSignalValue(value: number): SignalValue {
  return value >= 5 ? 3 : value >= 3 ? 2 : 1;
}

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
  /**
   * La ligne qu'on attend, quand le sujet est un arrêt.
   *
   * « Le passage est-il passé ? » ne veut rien dire sans savoir de quelle ligne
   * on parle : c'est ce qui rattache le signalement au bon carrousel.
   */
  lineId?: string | null;
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
  lineId,
  boardingStop,
  boardingTime,
  journey,
  language,
  onAnswered,
}: TripQuestionsProps) {
  const isFr = language === 'fr';
  const pool = subject === 'stop' ? STOP_QUESTIONS(isFr) : VEHICLE_QUESTIONS(isFr);

  /**
   * Où l'on en est dans la réserve.
   *
   * « Continuer » ne relançait pas les questions : il remettait le compteur à
   * zéro sur les trois mêmes, si bien que l'usager qui acceptait d'en faire plus
   * revoyait exactement ce qu'il venait de répondre. La réserve se parcourt
   * maintenant du début à la fin, tournée par tournée, et une question posée ne
   * revient pas.
   */
  const [asked, setAsked] = useState(0);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [dismissed, setDismissed] = useState(false);
  const [thanked, setThanked] = useState(false);

  const round = pool.slice(asked, asked + ROUND_SIZE);
  /** Vrai quand la réserve est épuisée : il n'y a plus rien à proposer. */
  const exhausted = asked + round.length >= pool.length;

  const appetite = readAppetite();

  /*
   * Changer de véhicule ou de quai, c'est un nouveau sujet : la réserve repart
   * du début, et les réponses de l'arrêt précédent ne doivent pas partir avec
   * celles du suivant.
   */
  useEffect(() => {
    setAsked(0);
    setStep(0);
    setAnswers({});
    setThanked(false);
    setDismissed(false);
  }, [subject, targetId]);

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
    if (!open || step !== 0 || asked !== 0) return;
    void notifyTripMoment({ kind: 'question' }, language);
  }, [open, step, asked, language]);

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

  /**
   * Ce qui part vers les enquêtes : les colonnes que les tables connaissent.
   *
   * La réserve a grossi plus vite que le schéma — « éclairage » ou « assises »
   * n'ont pas de colonne, et les inventer à chaque question rendrait la table
   * illisible. Les nouvelles vivent donc dans les signalements, qui sont faits
   * pour ça, et les anciennes continuent d'alimenter l'historique déjà collecté.
   */
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
      // L'heure du téléphone à la seconde de la réponse : rapportée à l'heure de
      // montée, c'est elle qui situera le véhicule sur son parcours.
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

    /*
     * Le signalement part à la réponse, pas à la fin de la tournée.
     *
     * Un « jamais venu » vaut pour celui qui arrive sur le quai dans les trente
     * secondes : le retenir jusqu'à la troisième question serait le publier trop
     * tard pour la seule personne qu'il aurait aidée.
     */
    if (question.signal) {
      void publishSignal({
        kind: question.signal,
        lineId: subject === 'vehicle' ? targetId : lineId ?? null,
        stopId: subject === 'stop' ? targetId : null,
        stopName: subject === 'stop' ? targetName ?? null : null,
        value: toSignalValue(value),
      });
    }

    /*
     * L'enquête part à la fin de la tournée, et ne porte que sur elle.
     *
     * Renvoyer aussi les réponses des tournées précédentes créerait une ligne de
     * plus disant la même chose à chaque « continuer » : trois avis là où une
     * seule personne a répondu une fois.
     */
    if (step + 1 >= round.length) send(updated);
    // Un court délai laisse voir la carte se colorer avant qu'elle sorte : sans
    // lui, on ne sait pas si l'on a touché ce qu'on visait.
    window.setTimeout(() => setStep((s) => s + 1), 160);
  };

  const answer = (choice: Appetite) => {
    writeAppetite(choice, choice === 'later' ? targetId : '');
    if (choice === 'yes') {
      // On avance dans la réserve : trois questions *de plus*, jamais les mêmes.
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
                  /*
                   * Trois portes, pas deux.
                   *
                   * « Non merci » ferme le sujet pour de bon. « Plus tard » ne
                   * vaut que pour ce véhicule ou ce quai — on redemandera au
                   * prochain, ce qui laisse dire non sans se fermer la porte.
                   * Et « Continuer » ouvre les trois suivantes de la réserve.
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
                  <p className="text-sm font-bold leading-snug text-white">{current.question}</p>
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
