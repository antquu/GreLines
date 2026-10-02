import { OfflinePanel } from './OfflinePanel';
import { useIsOffline } from '../hooks/useIsOffline';
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowPathIcon, CameraIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import { MinimalScreen } from './MinimalScreen';
import { OuraCardFace } from './OuraCardFace';
import type { OuraCard } from '../services/ouraCard';
import {
  adoptAccount,
  createAccount,
  loadAccountForCard,
  isPseudoFree,
  randomAvatar,
  suggestedPseudo,
  uploadAccountAvatar,
  type Account,
} from '../services/account';


type Step = 'card' | 'photo' | 'pseudo';

const PSEUDO_MIN = 2;
const PSEUDO_MAX = 24;

function stripAt(value: string): string {
  return value.replace(/^@+/, '');
}

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
  const offline = useIsOffline();
  const [step, setStep] = useState<Step>('card');
  const [direction, setDirection] = useState(1);

  const goTo = (next: Step, way: 1 | -1) => {
    setDirection(way);
    setStep(next);
  };
  const [picked, setPicked] = useState<OuraCard | null>(null);

  const [avatar, setAvatar] = useState<string | null>(null);
  const [avatarSpin, setAvatarSpin] = useState(0);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [pseudo, setPseudo] = useState('');
  const [taken, setTaken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checkingExistingAccount, setCheckingExistingAccount] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setStep('card');
    setDirection(1);
    setPicked(null);
    setAvatar(null);
    setPhoto(null);
    setPseudo('');
    setTaken(false);
    setCheckingExistingAccount(false);
    if (cards.length === 1) start(cards[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, cards.length]);

  useEffect(() => {
    if (!photo) {
      setPhotoUrl(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  function start(card: OuraCard) {
    setPicked(card);
    setAvatar(null);
    setPhoto(null);
    setPseudo(stripAt(suggestedPseudo(card.firstName, card.lastName)));
    setTaken(false);
    setDirection(1);
    setCheckingExistingAccount(true);
    void loadAccountForCard(card.cardCode)
      .then(existing => {
        if (!existing) {
          setStep('photo');
          return;
        }
        onDone(adoptAccount(existing));
      })
      .finally(() => setCheckingExistingAccount(false));
  }

  const pseudoTrimmed = pseudo.trim();
  const pseudoStored = `@${pseudoTrimmed}`;
  const pseudoValid = pseudoTrimmed.length >= PSEUDO_MIN && pseudoTrimmed.length <= PSEUDO_MAX;

  const confirm = async () => {
    if (!picked || saving || !pseudoValid) return;
    setSaving(true);

    const free = await isPseudoFree(pseudoStored);
    if (!free) {
      setTaken(true);
      setSaving(false);
      return;
    }

    const avatarPath = photo ? await uploadAccountAvatar(picked.cardCode, photo) : null;

    const account = await createAccount({
      cardCode: picked.cardCode,
      firstName: picked.firstName,
      lastName: picked.lastName,
      pseudo: pseudoStored,
      avatarEmoji: avatarPath ? null : avatar,
      avatarPath,
    });

    setSaving(false);
    if (account) onDone(account);
  };

  const surface = isLight ? 'border-slate-200 bg-white' : 'border-slate-800 bg-slate-900/70';
  const ink = isLight ? 'text-slate-900' : 'text-white';
  const muted = isLight ? 'text-slate-500' : 'text-slate-400';

  const footer = (label: string, onClick: () => void, disabled = false) => (
    <div
      className={`sticky bottom-0 -mx-4 mt-8 px-4 pt-3 ${isLight ? 'bg-slate-50' : 'bg-slate-950'}`}
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1rem)' }}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="w-full rounded-2xl bg-blue-600 py-3.5 text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-50"
      >
        {label}
      </button>
    </div>
  );

  const cardStep = (
    <div className="space-y-3 px-4">
      <p className={`px-1 text-sm ${muted}`}>
        {isFr
          ? 'Quelle carte portera votre compte ? Votre prénom et votre nom en seront repris.'
          : 'Which card should carry your account? Your first and last name come from it.'}
      </p>

      {cards.length === 0 && (
        <p className={`rounded-2xl border px-4 py-6 text-center text-sm ${surface} ${muted}`}>
          {isFr
            ? 'Aucune carte dans votre portefeuille. Ajoutez-en une pour créer un compte.'
            : 'No card in your wallet yet. Add one to create an account.'}
        </p>
      )}

      {cards.map(card => (
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

  const shown = photoUrl ?? (avatar ? null : picked?.photoUrl ?? null);

  const photoStep = picked && (
    <div className="flex flex-1 flex-col px-4">
      <p className={`px-1 text-center text-sm ${muted}`}>
        {isFr
          ? 'Elle vous représentera auprès des autres voyageurs.'
          : 'This is how other riders will see you.'}
      </p>

      <div className="flex flex-1 items-center justify-center py-10">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="relative aspect-square w-[min(66vw,17rem)] transition active:scale-[0.98]"
          aria-label={isFr ? 'Choisir une photo' : 'Choose a photo'}
        >
          <span
            className={`absolute inset-0 flex items-center justify-center overflow-hidden rounded-full border-2 ${
              isLight ? 'border-slate-200 bg-white' : 'border-slate-700 bg-slate-900'
            }`}
          >
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={photoUrl ?? avatar ?? 'card'}
              className="absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              {shown ? (
                <img src={shown} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-[24vw] leading-none sm:text-[7rem]" aria-hidden>
                  {avatar ?? '🙂'}
                </span>
              )}
            </motion.span>
          </AnimatePresence>
          </span>

          <span
            className={`absolute -bottom-1 right-1 z-10 flex h-12 w-12 items-center justify-center rounded-full border-4 bg-blue-600 shadow-lg ${
              isLight ? 'border-slate-50' : 'border-slate-950'
            }`}
          >
            <CameraIcon className="h-5 w-5 text-white" />
          </span>
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={event => {
          const file = event.target.files?.[0];
          if (!file) return;
          setPhoto(file);
          setAvatar(null);
          event.target.value = '';
        }}
      />

      <div className="flex items-center justify-center gap-6">
        <button
          type="button"
          onClick={() => {
            setAvatar(randomAvatar(avatar));
            setPhoto(null);
            setAvatarSpin(turns => turns + 1);
          }}
          className={`flex items-center gap-2 text-sm font-semibold ${muted}`}
        >
          <motion.span
            animate={{ rotate: avatarSpin * 360 }}
            transition={{ type: 'spring', stiffness: 180, damping: 18 }}
          >
            <ArrowPathIcon className="h-4 w-4" />
          </motion.span>
          {isFr ? 'Un émoji' : 'An emoji'}
        </button>

        {(photo || avatar) && picked.photoUrl && (
          <button
            type="button"
            onClick={() => {
              setPhoto(null);
              setAvatar(null);
            }}
            className={`text-sm font-semibold ${muted}`}
          >
            {isFr ? 'Photo de la carte' : 'Card photo'}
          </button>
        )}
      </div>

      {footer(isFr ? 'Continuer' : 'Continue', () => goTo('pseudo', 1))}
    </div>
  );

  const pseudoStep = picked && (
    <div className="flex flex-1 flex-col px-4">
      <p className={`px-1 text-center text-sm ${muted}`}>
        {isFr
          ? 'C’est le nom sous lequel les autres vous verront.'
          : 'This is the name others will see you under.'}
      </p>

      <div className="flex flex-1 flex-col items-center justify-center py-10">
        <div
          className={`flex w-full items-center rounded-2xl border px-4 py-4 transition focus-within:border-blue-500 ${
            isLight
              ? 'border-slate-200 bg-white text-slate-900'
              : 'border-slate-800 bg-slate-900 text-white'
          }`}
        >
          <span className={`select-none text-2xl font-bold ${muted}`} aria-hidden>
            @
          </span>
          <input
            value={pseudo}
            onChange={event => {
              setPseudo(stripAt(event.target.value).slice(0, PSEUDO_MAX));
              setTaken(false);
            }}
            autoFocus
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-label={isFr ? 'Votre pseudonyme' : 'Your nickname'}
            placeholder={isFr ? 'pseudonyme' : 'nickname'}
            className="min-w-0 flex-1 bg-transparent text-2xl font-bold outline-none"
          />
        </div>

        <p className={`mt-3 h-5 text-center text-xs ${taken ? 'text-rose-400' : muted}`}>
          {taken
            ? isFr
              ? 'Ce pseudonyme est déjà pris.'
              : 'That nickname is taken.'
            : `${pseudoTrimmed.length} / ${PSEUDO_MAX}`}
        </p>
      </div>

      {footer(
        saving
          ? isFr
            ? 'Création…'
            : 'Creating…'
          : isFr
            ? 'Créer mon compte'
            : 'Create my account',
        () => void confirm(),
        saving || !pseudoValid || checkingExistingAccount,
      )}
    </div>
  );

  const title =
    step === 'card'
      ? isFr
        ? 'Connecter son compte'
        : 'Connect your account'
      : step === 'photo'
        ? isFr
          ? 'Choisissez votre photo'
          : 'Choose your photo'
        : isFr
          ? 'Choisissez votre pseudonyme'
          : 'Choose your nickname';

  return (
    <MinimalScreen
      isOpen={isOpen}
      title={offline ? '' : title}
      isLight={isLight}
      bottomInset={false}
      onBack={() => {
        if (step === 'pseudo') goTo('photo', -1);
        else if (step === 'photo' && cards.length > 1) goTo('card', -1);
        else onBack();
      }}
    >
      {offline ? (
        <OfflinePanel
          language={language}
          isLight={isLight}
          detail={language === 'fr'
            ? 'La connexion d’un compte a besoin du réseau. Vous pourrez la faire dès son retour.'
            : 'Connecting an account needs the network. You can do it as soon as you are back online.'}
        />
      ) : (
      <>
      <div
        key={step}
        className={direction > 0 ? 'install-slide-right' : 'install-slide-left'}
        style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}
      >
        {step === 'card' ? cardStep : step === 'photo' ? photoStep : pseudoStep}
      </div>
      </>
      )}
    </MinimalScreen>
  );
}
