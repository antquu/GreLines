import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowPathIcon, CheckIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import { MinimalScreen } from './MinimalScreen';
import { OuraCardFace } from './OuraCardFace';
import type { OuraCard } from '../services/ouraCard';
import {
  createAccount,
  isPseudoFree,
  randomAvatar,
  randomPseudo,
  suggestedPseudo,
  type Account,
} from '../services/account';

/**
 * La création du compte, en deux pages qui glissent.
 *
 * D'abord la carte : c'est elle qui porte le compte, et la choisir est le seul
 * moment où l'on décide vraiment quelque chose. Ensuite l'apparence — avatar et
 * pseudonyme — que l'on peut retirer au sort autant qu'on veut.
 *
 * Ni l'avatar ni le pseudonyme ne se saisissent librement. Ce n'est pas une
 * économie de travail : une image ou un texte choisis demandent une modération, et
 * personne ici ne peut la faire. Tirer au sort dans des listes closes ouvre les
 * avatars et les noms d'usage à tous sans qu'aucun ne puisse être une insulte.
 */

export function AccountSetupScreen({
  isOpen,
  cards,
  language,
  isLight,
  onBack,
  onDone,
}: {
  isOpen: boolean;
  cards: OuraCard[];
  language: 'fr' | 'en';
  isLight: boolean;
  onBack: () => void;
  onDone: (account: Account) => void;
}) {
  const isFr = language === 'fr';
  const [picked, setPicked] = useState<OuraCard | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [pseudo, setPseudo] = useState('');
  const [saving, setSaving] = useState(false);
  const [taken, setTaken] = useState(false);
  /**
   * Compteurs de tours, un par bouton de tirage.
   *
   * Les incrémenter fait tourner l'icône d'un demi-tour de plus. Une animation
   * relancée à chaque appui ne repart pas de zéro — elle continue — donc appuyer
   * trois fois vite donne trois tours enchaînés au lieu d'un sursaut.
   */
  const [avatarSpin, setAvatarSpin] = useState(0);
  const [pseudoSpin, setPseudoSpin] = useState(0);

  // Chaque venue repart de la première page : on ne reprend pas une création
  // abandonnée à mi-chemin, dont on ne sait plus ce qu'elle proposait.
  useEffect(() => {
    if (isOpen) {
      setPicked(null);
      setAvatar(null);
      setPseudo('');
      setTaken(false);
    }
  }, [isOpen]);

  const start = (card: OuraCard) => {
    setPicked(card);
    // La photo de la carte par défaut : c'est déjà son visage, et la plupart des
    // gens n'iront pas plus loin.
    setAvatar(null);
    setPseudo(suggestedPseudo(card.firstName, card.lastName));
    setTaken(false);
  };

  const confirm = async () => {
    if (!picked || saving) return;
    setSaving(true);
    const free = await isPseudoFree(pseudo);
    if (!free) {
      setTaken(true);
      setSaving(false);
      return;
    }
    const account = await createAccount({
      cardCode: picked.cardCode,
      firstName: picked.firstName,
      lastName: picked.lastName,
      pseudo,
      avatarEmoji: avatar,
    });
    setSaving(false);
    if (account) onDone(account);
  };

  const surface = isLight ? 'border-slate-200 bg-white' : 'border-slate-800 bg-slate-900/70';
  const ink = isLight ? 'text-slate-900' : 'text-white';
  const muted = isLight ? 'text-slate-500' : 'text-slate-400';
  const field = isLight
    ? 'border-slate-200 bg-slate-100 text-slate-500'
    : 'border-slate-800 bg-slate-900 text-slate-400';

  /* ---------------------------------------------------------------- la carte */
  /* Les marges latérales appartiennent à la page, pas à la coquille : la
     feuille minimale n'en met pas, ses autres pensionnaires n'en veulent pas
     tous, et sans elles les champs venaient toucher le bord du téléphone. */
  const cardStep = (
    <div className="space-y-3 px-4">
      <p className={`px-1 text-sm ${muted}`}>
        {isFr
          ? 'Quelle carte voulez-vous utiliser comme compte ? Votre prénom et votre nom en seront reprises.'
          : 'Which card should carry your account? Your first and last name come from it.'}
      </p>

      {cards.length === 0 && (
        <p className={`rounded-2xl border px-4 py-6 text-center text-sm ${surface} ${muted}`}>
          {isFr
            ? 'Aucune carte dans votre portefeuille. Ajoutez-en une pour créer un compte.'
            : 'No card in your wallet yet. Add one to create an account.'}
        </p>
      )}

      {cards.map((card) => (
        <button
          key={card.id}
          type="button"
          onClick={() => start(card)}
          className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition active:scale-[0.99] ${surface}`}
        >
          <div className="w-24 flex-shrink-0">
            <OuraCardFace
              firstName={card.firstName}
              lastName={card.lastName}
              cardCode={card.cardCode}
              photoUrl={card.photoUrl}
              forceFront
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className={`truncate text-sm font-bold ${ink}`}>
              {[card.firstName, card.lastName].filter(Boolean).join(' ') || card.cardCode}
            </p>
            <p className={`tabular truncate text-xs ${muted}`}>{card.cardCode}</p>
          </div>
          <ChevronRightIcon className={`h-5 w-5 flex-shrink-0 ${muted}`} />
        </button>
      ))}
    </div>
  );

  /* ------------------------------------------------------------- l'apparence */
  const profileStep = picked && (
    <div className="space-y-5 px-4">
      {/* L'avatar et ses deux boutons. « Régénérer » tire un émoji, « Photo de la
          carte » revient au visage — les deux sont réversibles, donc on peut
          essayer sans rien risquer. */}
      <div className="flex items-center gap-4">
        <div
          className={`relative flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border text-[34px] ${
            isLight ? 'border-slate-200 bg-white' : 'border-slate-700 bg-white'
          }`}
        >
          {/* Un fondu croisé à chaque tirage.
              Sans lui, l'émoji se remplaçait d'une image sur l'autre et l'on
              doutait d'avoir appuyé — surtout en tirant deux fois de suite deux
              animaux qui se ressemblent. La clé porte la valeur, donc chaque
              nouveau visage entre pendant que le précédent s'en va. */}
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={avatar ?? 'card'}
              className="absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 0, scale: 0.82 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.82 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              {avatar ? (
                <span aria-hidden>{avatar}</span>
              ) : picked.photoUrl ? (
                <img src={picked.photoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span aria-hidden>{'🙂'}</span>
              )}
            </motion.span>
          </AnimatePresence>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              setAvatar(randomAvatar(avatar));
              setAvatarSpin((turns) => turns + 1);
            }}
            className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold ${surface} ${ink}`}
          >
            <motion.span
              animate={{ rotate: avatarSpin * 360 }}
              transition={{ type: 'spring', stiffness: 180, damping: 18 }}
            >
              <ArrowPathIcon className="h-4 w-4" />
            </motion.span>
            {isFr ? 'Régénérer la photo' : 'Regenerate photo'}
          </button>
          {avatar !== null && (
            <button
              type="button"
              onClick={() => setAvatar(null)}
              className={`rounded-xl px-3 py-2 text-xs font-semibold ${muted}`}
            >
              {isFr ? 'Réinitialiser la photo' : 'Reset photo'}
            </button>
          )}
        </div>
      </div>

      {/* Prénom et nom, en lecture seule : ce sont ceux du réseau, pas un
          formulaire. Les montrer grisés dit d'où ils viennent mieux qu'une
          phrase. */}
      <div className="space-y-4">
        <div>
          <p className={`mb-2 px-1 text-xs font-semibold uppercase tracking-wide ${muted}`}>
            {isFr ? 'Prénom' : 'First name'}
          </p>
          <p className={`rounded-xl border px-3 py-2.5 text-sm ${field}`}>
            {picked.firstName || '—'}
          </p>
        </div>
        <div>
          <p className={`mb-2 px-1 text-xs font-semibold uppercase tracking-wide ${muted}`}>
            {isFr ? 'Nom' : 'Last name'}
          </p>
          <p className={`rounded-xl border px-3 py-2.5 text-sm ${field}`}>
            {picked.lastName || '—'}
          </p>
        </div>
      </div>

      <div>
        <p className={`mb-2 px-1 text-xs font-semibold uppercase tracking-wide ${muted}`}>
          {isFr ? 'Pseudonyme' : 'Nickname'}
        </p>
        <div className="flex items-center gap-2">
          <p
            className={`min-w-0 flex-1 truncate rounded-xl border px-3 py-2.5 text-sm font-bold ${
              isLight ? 'border-slate-200 bg-slate-100 text-slate-900' : 'border-slate-800 bg-slate-900 text-white'
            }`}
          >
            {pseudo}
          </p>
          <button
            type="button"
            onClick={() => {
              setPseudo(randomPseudo());
              setTaken(false);
              setPseudoSpin((turns) => turns + 1);
            }}
            className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border ${surface} ${ink}`}
            aria-label={isFr ? 'Régénérer le pseudonyme' : 'Regenerate nickname'}
          >
            <motion.span
              animate={{ rotate: pseudoSpin * 360 }}
              transition={{ type: 'spring', stiffness: 180, damping: 18 }}
            >
              <ArrowPathIcon className="h-4 w-4" />
            </motion.span>
          </button>
        </div>
        {/* Un mot seulement quand il y a quelque chose à corriger. La règle du
            tirage au sort se comprend en appuyant sur le bouton ; l'écrire
            occupait trois lignes pour expliquer un geste évident. */}
        {taken && (
          <p className="mt-2 px-1 text-xs text-rose-400">
            {isFr ? 'Celui-là est déjà pris. Tirez-en un autre.' : 'That one is taken. Draw another.'}
          </p>
        )}
      </div>

      {/* L'action tient le bas de l'écran.
          `sticky` plutôt que `fixed` : elle reste sous le pouce pendant qu'on fait
          défiler, et suit le contenu s'il est plus court que l'écran. Le fond
          opaque évite qu'un champ passe derrière elle en transparence. */}
      <div
        className={`sticky bottom-0 -mx-4 mt-2 px-4 pt-3 ${
          isLight ? 'bg-slate-50' : 'bg-slate-950'
        }`}
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1rem)' }}
      >
        <button
          type="button"
          onClick={confirm}
          disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3.5 text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-50"
        >
          <CheckIcon className="h-5 w-5" />
          {saving ? (isFr ? 'Création…' : 'Creating…') : isFr ? 'Continuer' : 'Continue'}
        </button>
      </div>

    </div>
  );

  return (
    <MinimalScreen
      isOpen={isOpen}
      title={
        saving
          ? isFr
            ? 'Création du profil'
            : 'Creating your profile'
          : picked
          ? isFr
            ? 'Votre profil'
            : 'Your profile'
          : isFr
          ? 'Connecter son compte'
          : 'Connect your account'
      }
      isLight={isLight}
      // Reculer d'une page à la fois : depuis l'apparence on revient au choix de
      // la carte, et seulement ensuite on quitte.
      onBack={() => (picked ? setPicked(null) : onBack())}
    >
      {picked ? profileStep : cardStep}
    </MinimalScreen>
  );
}
