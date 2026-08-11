import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon, CheckCircleIcon, ShieldCheckIcon } from '@heroicons/react/24/solid';
import { submitTripSurvey } from '../services/cms';

const CONSENT_KEY = 'greLines_surveyConsent';

type Consent = 'granted' | 'refused' | null;

export function getSurveyConsent(): Consent {
  try {
    return (localStorage.getItem(CONSENT_KEY) as Consent) ?? null;
  } catch {
    return null;
  }
}

function setSurveyConsent(value: Exclude<Consent, null>) {
  try {
    localStorage.setItem(CONSENT_KEY, value);
  } catch {
    
  }
}

interface TripSurveyProps {
  isOpen: boolean;
  onClose: () => void;
  lineId: string;
  
  boardingStop?: string | null;
  
  boardingTime?: string | null;
  language: 'fr' | 'en';
}

/**
 * Trois paliers plutôt que cinq étoiles.
 *
 * On répond debout, dans un véhicule qui bouge : « 3 sur 5 » demande un arbitrage
 * que personne ne fait honnêtement dans ces conditions. Mauvais / Moyen / Bien
 * se choisit d'un pouce, et l'émoji dit lequel avant même qu'on lise.
 *
 * La valeur envoyée reste sur l'échelle de 1 à 5 (1, 3, 5) : le questionnaire
 * change, pas l'historique déjà collecté côté exploitant.
 */
const TIERS = [
  { value: 1, tone: 'bad' as const, label: (isFr: boolean) => (isFr ? 'Mauvais' : 'Poor') },
  { value: 3, tone: 'mid' as const, label: (isFr: boolean) => (isFr ? 'Moyen' : 'Okay') },
  { value: 5, tone: 'good' as const, label: (isFr: boolean) => (isFr ? 'Bien' : 'Good') },
];

/** Un émoji par question et par palier : le même mot ne pèse pas pareil selon le sujet. */
const QUESTIONS = (isFr: boolean) => [
  {
    key: 'cleanliness' as const,
    label: isFr ? 'Propreté du véhicule' : 'Vehicle cleanliness',
    emojis: { bad: '💩', mid: '🧻', good: '✨' },
  },
  {
    key: 'comfort' as const,
    label: isFr ? 'Confort du trajet' : 'Ride comfort',
    emojis: { bad: '🤢', mid: '😐', good: '😌' },
  },
  {
    key: 'crowding' as const,
    label: isFr ? "Niveau d'affluence" : 'Crowding level',
    emojis: { bad: '🥵', mid: '🧍', good: '💺' },
  },
];

function TierRow({
  value,
  emojis,
  isFr,
  onChange,
}: {
  value: number | undefined;
  emojis: { bad: string; mid: string; good: string };
  isFr: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {TIERS.map(tier => {
        const selected = value === tier.value;
        const selectedClass =
          tier.tone === 'bad'
            ? 'border-red-400 bg-red-500/15 text-red-200'
            : tier.tone === 'mid'
            ? 'border-amber-400 bg-amber-500/15 text-amber-200'
            : 'border-emerald-400 bg-emerald-500/15 text-emerald-200';
        return (
          <button
            key={tier.value}
            type="button"
            onClick={() => onChange(tier.value)}
            aria-pressed={selected}
            className={`flex flex-col items-center gap-1 rounded-xl border py-2.5 text-xs font-semibold transition-colors ${
              selected ? selectedClass : 'border-slate-700 bg-slate-800 text-slate-400 active:bg-slate-700'
            }`}
          >
            <span className="text-2xl leading-none" aria-hidden="true">{emojis[tier.tone]}</span>
            {tier.label(isFr)}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Enquête qualité proposée à la fin d'un trajet guidé. Recueil strictement
 * anonyme et soumis à consentement explicite (RGPD) : aucune donnée
 * identifiante, aucune position, refus possible et mémorisé.
 */
export function TripSurvey({
  isOpen,
  onClose,
  lineId,
  boardingStop,
  boardingTime,
  language,
}: TripSurveyProps) {
  const isFr = language === 'fr';
  const [consent, setConsent] = useState<Consent>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setConsent(getSurveyConsent());
      setAnswers({});
      setComment('');
      setDone(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;
  if (consent === 'refused') return null;

  const handleAccept = () => {
    setSurveyConsent('granted');
    setConsent('granted');
  };

  const handleRefuse = () => {
    setSurveyConsent('refused');
    setConsent('refused');
    onClose();
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    await submitTripSurvey({
      lineId,
      boardingStop,
      boardingTime,
      cleanliness: answers.cleanliness,
      comfort: answers.comfort,
      crowding: answers.crowding,
      comment,
    });
    setSubmitting(false);
    setDone(true);
    setTimeout(onClose, 1600);
  };

  const hasAnswer = Object.keys(answers).length > 0 || comment.trim().length > 0;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[10002] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="w-full max-w-md rounded-t-3xl border border-slate-800 bg-slate-900 p-6 sm:rounded-3xl"
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {done ? (
            <div className="flex flex-col items-center py-8 text-center">
              <CheckCircleIcon className="mb-3 h-14 w-14 text-emerald-400" />
              <p className="text-lg font-semibold text-white">{isFr ? 'Merci !' : 'Thank you!'}</p>
              <p className="mt-1 text-sm text-slate-400">
                {isFr ? 'Votre retour aide à améliorer le réseau.' : 'Your feedback helps improve the network.'}
              </p>
            </div>
          ) : consent === null ? (
            <div>
              <ShieldCheckIcon className="mb-3 h-10 w-10 text-indigo-400" />
              <h2 className="text-xl font-bold text-white">
                {isFr ? 'Donnez votre avis sur ce trajet ?' : 'Rate this trip?'}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                {isFr
                  ? "Quelques questions rapides sur la qualité du service. Vos réponses sont anonymes : aucun compte ni identifiant d'appareil n'est enregistré. Sont transmis la ligne, l'arrêt et l'heure de montée, afin que l'exploitant sache de quel passage il s'agit. Vous pouvez refuser, ce choix sera mémorisé."
                  : 'A few quick questions about service quality. Your answers are anonymous: no account or device identifier is stored. The line, boarding stop and boarding time are sent so the operator knows which run is concerned. You may decline, and your choice will be remembered.'}
              </p>
              <div className="mt-5 flex gap-2">
                <button
                  onClick={handleRefuse}
                  className="flex-1 rounded-xl bg-slate-800 py-3 text-sm font-semibold text-slate-300 active:bg-slate-700"
                >
                  {isFr ? 'Non merci' : 'No thanks'}
                </button>
                <button
                  onClick={handleAccept}
                  className="flex-1 rounded-xl bg-indigo-500 py-3 text-sm font-semibold text-white active:bg-indigo-600"
                >
                  {isFr ? 'Participer' : 'Participate'}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white">
                    {isFr ? 'Votre trajet' : 'Your trip'} · {lineId}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {isFr ? 'Réponses anonymes · trois réponses possibles' : 'Anonymous · three answers'}
                  </p>
                </div>
                <button onClick={onClose} className="rounded-full p-1 text-slate-500 active:text-white">
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                {QUESTIONS(isFr).map((q) => (
                  <div key={q.key}>
                    <p className="mb-1.5 text-sm font-medium text-slate-300">{q.label}</p>
                    <TierRow
                      value={answers[q.key]}
                      emojis={q.emojis}
                      isFr={isFr}
                      onChange={(value) => setAnswers({ ...answers, [q.key]: value })}
                    />
                  </div>
                ))}

                <div>
                  <p className="mb-1.5 text-sm font-medium text-slate-300">
                    {isFr ? 'Commentaire (facultatif)' : 'Comment (optional)'}
                  </p>
                  <textarea
                    rows={2}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder={isFr ? 'Une remarque à partager ?' : 'Anything to share?'}
                  />
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={submitting || !hasAnswer}
                className="mt-5 w-full rounded-xl bg-indigo-500 py-3 text-sm font-semibold text-white disabled:opacity-40 active:bg-indigo-600"
              >
                {submitting ? (isFr ? 'Envoi…' : 'Sending…') : isFr ? 'Envoyer' : 'Send'}
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
