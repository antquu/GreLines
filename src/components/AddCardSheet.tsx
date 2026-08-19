/**
 * Ajouter une carte OURA.
 *
 * Deux chemins mènent au même endroit : la photographier, ou taper son numéro.
 * Le premier lit le carton et propose ce qu'il a compris ; le second demande à
 * l'API si le numéro existe, puis laisse le voyageur se présenter. Dans les
 * deux cas, on finit par le même écran de confirmation — c'est lui qui décide
 * de ce qui sera enregistré, et il glisse par la droite comme la suite d'une
 * même conversation.
 */

import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeftIcon,
  CameraIcon,
  CheckCircleIcon,
  PencilSquareIcon,
  PhotoIcon,
  XMarkIcon,
} from '@heroicons/react/24/solid';
import { attachKnownCard, findKnownCard, saveTestCard, lookupOuraCard, saveOuraCard, type OuraCard, type OuraCardLookup } from '../services/ouraCard';
import { scanCard, toCanvas } from '../services/cardOcr';

interface AddCardSheetProps {
  isOpen: boolean;
  language: 'fr' | 'en';
  theme?: 'light' | 'dark';
  onClose: () => void;
  onSaved: (card: OuraCard) => void;
  /**
   * Proposer la lecture par l'appareil photo.
   *
   * Faux sur ordinateur : une webcam ne cadre pas une carte tenue à la main, et
   * proposer un chemin qui ne mène nulle part vaut moins que de ne pas le
   * proposer. Il ne reste alors que la saisie du numéro — et comme c'est le
   * seul chemin, on y entre directement, sans écran de choix à une option.
   */
  allowScan?: boolean;
  /**
   * La forme que prend la fenêtre.
   *
   * `sheet` : une feuille qui monte du bas, celle du téléphone, qu'on referme
   * en la tirant. `dialog` : une boîte posée au centre, celle du bureau — sur
   * un grand écran, une feuille pleine hauteur pour trois champs est une porte
   * ouverte sur rien.
   */
  variant?: 'sheet' | 'dialog';
  /**
   * Le portefeuille se contente de rattacher des cartes existantes.
   *
   * C'est le cas du bureau : on y retrouve une carte déjà déclarée, on n'en
   * crée pas. Remplir un nom, un prénom et une photo suppose d'avoir le carton
   * sous les yeux et un appareil photo à portée — c'est le téléphone, pas
   * l'ordinateur. Un numéro inconnu renvoie donc à l'application mobile au lieu
   * d'ouvrir un formulaire qu'on ne peut pas remplir correctement.
   */
  linkOnly?: boolean;
}

type Step = 'choice' | 'scan' | 'manual' | 'confirm';

const getText = (language: 'fr' | 'en') => {
  const isFr = language === 'fr';
  return {
    title: isFr ? 'Ajouter une carte' : 'Add a card',
    scanTitle: isFr ? 'Scanner ma carte' : 'Scan my card',
    scanHint: isFr ? 'La face au numéro et à la photo' : 'The side with the number and photo',
    manualTitle: isFr ? 'Saisir le numéro' : 'Enter the number',
    manualHint: isFr ? 'Les dix chiffres au dos de la carte' : 'The ten digits on the back',
    close: isFr ? 'Fermer' : 'Close',
    back: isFr ? 'Retour' : 'Back',
    capture: isFr ? 'Prendre la photo' : 'Take the photo',
    retake: isFr ? 'Reprendre' : 'Retake',
    reading: isFr ? 'Lecture de la carte…' : 'Reading the card…',
    cameraDenied: isFr
      ? "L'appareil photo n'est pas accessible. Saisissez le numéro à la main."
      : 'The camera is unavailable. Enter the number by hand.',
    numberLabel: isFr ? 'Numéro de carte' : 'Card number',
    check: isFr ? 'Vérifier' : 'Check',
    checking: isFr ? 'Vérification…' : 'Checking…',
    unknown: isFr
      ? "Ce numéro n'existe pas sur le réseau."
      : 'This number does not exist on the network.',
    scanFailed: isFr
      ? "Le numéro n'a pas été lu. Reprenez la photo ou saisissez-le."
      : 'The number could not be read. Retake the photo or type it.',
    found: isFr ? 'Carte reconnue' : 'Card recognised',
    yourInfo: isFr ? 'Sont-ce bien vos informations ?' : 'Are these your details?',
    known: isFr
      ? 'Cette carte est déjà connue. Quel est votre nom de famille ?'
      : 'This card is already known. What is your last name?',
    knownMismatch: isFr
      ? "Ce nom ne correspond pas à celui de la carte."
      : 'That name does not match the one on the card.',
    knownImport: isFr ? 'Importer la carte' : 'Import the card',
    fillInfo: isFr ? 'Renseignez vos informations' : 'Fill in your details',
    firstName: isFr ? 'Prénom' : 'First name',
    lastName: isFr ? 'Nom' : 'Last name',
    photo: isFr ? 'Photo' : 'Photo',
    addPhoto: isFr ? 'Ajouter une photo' : 'Add a photo',
    changePhoto: isFr ? 'Changer la photo' : 'Change the photo',
    photoHint: isFr
      ? "De préférence une photo d'identité — ou prenez-vous sur fond blanc, bien éclairé."
      : 'Preferably an ID photo — or take one against a white wall, well lit.',
    save: isFr ? 'Enregistrer' : 'Save',
    saving: isFr ? 'Enregistrement…' : 'Saving…',
    saveFailed: isFr ? "L'enregistrement a échoué." : 'Saving failed.',
    contract: isFr ? 'Abonnement' : 'Pass',
    birthDate: isFr ? 'Naissance' : 'Birth date',
    validUntil: isFr ? 'Valide jusqu’au' : 'Valid until',
    mobileOnlyTitle: isFr ? 'Carte à créer sur mobile' : 'Set this card up on mobile',
    mobileOnlyBody: isFr
      ? "Ce numéro n'est rattaché à aucun porteur. Sur ordinateur, le portefeuille ne fait que retrouver des cartes déjà déclarées — le nom et la photo se saisissent depuis l'application mobile, où l'on peut photographier le carton."
      : 'This number is not linked to any holder yet. On desktop the wallet only finds cards that already exist — name and photo are entered from the mobile app, where the card can be photographed.',
    mobileOnlyClose: isFr ? 'Compris' : 'Got it',
  };
};

function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function AddCardSheet({ isOpen, language, theme = 'dark', onClose, onSaved, allowScan = true, variant = 'sheet', linkOnly = false }: AddCardSheetProps) {
  const isDialog = variant === 'dialog';
  const text = getText(language);
  const isLight = theme === 'light';

  const [step, setStep] = useState<Step>(allowScan ? 'choice' : 'manual');
  const [code, setCode] = useState('');
  const [lookup, setLookup] = useState<OuraCardLookup | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Vrai quand la carte a été lue : l'écran demande alors confirmation. */
  const [wasScanned, setWasScanned] = useState(false);
  /** Photo déjà hébergée, reprise d'une carte déjà déclarée ailleurs. */
  const [knownPhotoPath, setKnownPhotoPath] = useState<string | undefined>();
  const [knownPhotoUrl, setKnownPhotoUrl] = useState<string | undefined>();
  const [known, setKnown] = useState<OuraCard | null>(null);
  /** Numéro d'une carte d'essai en cours d'ajout : elle ne passe pas par le réseau. */
  const [testCode, setTestCode] = useState<string | null>(null);
  /**
   * L'annonce « carte reconnue » descend du haut de l'écran, comme celle qui
   * confirme une adresse copiée : c'est une nouvelle, pas une ligne de plus
   * dans le formulaire qu'on est en train de remplir.
   */
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const announce = (message: string) => {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2600);
  };
  useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
  }, []);

  /**
   * Tirer la feuille vers le bas la referme, comme n'importe quelle feuille.
   * La croix reste, mais elle n'est plus le seul moyen d'en sortir.
   */
  const dragStartRef = useRef<number | null>(null);
  const dragYRef = useRef(0);
  const [dragY, setDragY] = useState(0);

  const handleDragStart = (event: React.PointerEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, video')) return;
    dragStartRef.current = event.clientY;
  };
  const handleDragMove = (event: React.PointerEvent) => {
    if (dragStartRef.current == null) return;
    const offset = Math.max(0, event.clientY - dragStartRef.current);
    dragYRef.current = offset;
    setDragY(offset);
  };
  const handleDragEnd = () => {
    if (dragStartRef.current == null) return;
    dragStartRef.current = null;
    if (dragYRef.current > 140) onClose();
    dragYRef.current = 0;
    setDragY(0);
  };

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const surface = isLight ? 'border-slate-200 bg-white' : 'border-slate-800 bg-slate-900';
  const strong = isLight ? 'text-slate-900' : 'text-white';

  /** Referme la caméra dès qu'on quitte l'écran qui l'utilise. */
  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  };

  useEffect(() => () => stopCamera(), []);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }
    // Chaque ouverture repart de la première question — la saisie du numéro
    // quand la lecture par l'appareil photo n'est pas proposée.
    setStep(allowScan ? 'choice' : 'manual');
    setCode('');
    setLookup(null);
    setFirstName('');
    setLastName('');
    setPhoto(null);
    setPhotoUrl(null);
    setError(null);
    setWasScanned(false);
    setKnownPhotoPath(undefined);
    setKnownPhotoUrl(undefined);
    setKnown(null);
    setTestCode(null);
  }, [isOpen]);

  useEffect(() => {
    if (step !== 'scan') {
      stopCamera();
      return;
    }
    let cancelled = false;
    void navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } } })
      .then(stream => {
        if (cancelled) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      })
      .catch(() => {
        if (!cancelled) setError(text.cameraDenied);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    if (!photo) {
      setPhotoUrl(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  /** Vérifie un numéro auprès du réseau, et passe à la confirmation. */
  const verify = async (rawCode: string, scanned: boolean) => {
    setBusy(true);
    setError(null);
    const found = await lookupOuraCard(rawCode);
    if (!found) {
      // Le réseau ne connaît pas ce numéro : ce peut être une carte d'essai,
      // créée à la main et qui n'existe que chez nous. Vide, c'est à celui qui
      // l'ajoute de la renseigner ; déjà remplie, elle s'importe telle quelle.
      const test = await findKnownCard(rawCode);
      setBusy(false);
      if (test?.isTest) {
        announce(text.found);
        setTestCode(test.cardCode);
        if (test.lastName) {
          setKnown(test);
          if (test.firstName) setFirstName(test.firstName);
          setKnownPhotoPath(test.photoPath);
          setKnownPhotoUrl(test.photoUrl);
        }
        setWasScanned(scanned);
        setStep('confirm');
        return true;
      }
      setError(text.unknown);
      return false;
    }
    setBusy(false);
    setTestCode(null);
    setLookup(found);
    setWasScanned(scanned);
    announce(text.found);

    // Carte déjà déclarée : on reprend son porteur et son visage plutôt que de
    // les redemander. Ce que la lecture avait cru comprendre cède la place.
    const existing = await findKnownCard(found.code);
    if (existing) {
      // Le visage déjà enregistré vaut mieux que celui qu'on vient de
      // découper d'une photo prise de travers.
      setPhoto(null);
      // On ne redemande pas tout : le porteur est déjà là. Il ne reste qu'à
      // s'assurer que c'est bien la même personne, par son nom de famille.
      setKnown(existing);
      if (existing.firstName) setFirstName(existing.firstName);
      setKnownPhotoPath(existing.photoPath);
      setKnownPhotoUrl(existing.photoUrl);
    }

    setStep('confirm');
    return true;
  };

  const handleCapture = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setBusy(true);
    setError(null);
    const canvas = toCanvas(video, video.videoWidth, video.videoHeight);
    stopCamera();
    try {
      // La progression ne sert plus à rien : le voile qui respire dit tout
      // ce qu'il y a à dire, et un pourcentage d'OCR n'avance jamais droit.
      const result = await scanCard(canvas);
      if (result.firstName) setFirstName(result.firstName);
      if (result.lastName) setLastName(result.lastName);
      if (result.photo) setPhoto(result.photo);
      if (!result.cardCode) {
        setBusy(false);
        setError(text.scanFailed);
        setCode('');
        setStep('manual');
        return;
      }
      setCode(result.cardCode);
      setBusy(false);
      const ok = await verify(result.cardCode, true);
      if (!ok) setStep('manual');
    } catch {
      setBusy(false);
      setError(text.scanFailed);
      setStep('manual');
    }
  };

  const handleSave = async () => {
    if (!lookup && !testCode) return;
    setBusy(true);
    setError(null);

    if (testCode) {
      const saved = await saveTestCard(testCode, { firstName, lastName, photo, photoPath: knownPhotoPath });
      setBusy(false);
      if (!saved) {
        setError(text.saveFailed);
        return;
      }
      onSaved(saved);
      onClose();
      return;
    }
    // Carte déjà connue : il n'y a qu'un lien à créer, rien à réécrire.
    const saved = known
      ? ((await attachKnownCard(known.cardCode)) ? known : null)
      : await saveOuraCard({ lookup: lookup!, firstName, lastName, photo, photoPath: knownPhotoPath });
    setBusy(false);
    if (!saved) {
      setError(text.saveFailed);
      return;
    }
    onSaved(saved);
    onClose();
  };

  const stepIndex = step === 'choice' ? 0 : step === 'confirm' ? 2 : 1;

  return (
    <>
      {toast && (
        <div
          className="gl-drop pointer-events-none fixed inset-x-0 top-0 z-[10010] flex justify-center px-4"
          style={{ paddingTop: 'max(env(safe-area-inset-top), 0.75rem)' }}
        >
          <div className="flex items-center gap-2 rounded-full border border-emerald-500/40 bg-slate-900/95 px-4 py-2 shadow-2xl backdrop-blur">
            <CheckCircleIcon className="h-5 w-5 flex-shrink-0 text-emerald-400" />
            <span className="text-sm font-semibold text-white">{toast}</span>
          </div>
        </div>
      )}

      {/* Feuille dessinée à la main plutôt qu'empruntée à `react-modal-sheet` :
          cette bibliothèque ne rend son conteneur visible qu'au terme d'une
          animation pilotée en JavaScript, et une animation qui n'aboutit pas la
          laisse invisible pour de bon. Ici le glissement est une transition
          CSS, dont l'état d'arrivée est déclaré donc atteint. */}
      <div
        className={`fixed inset-0 z-[10001] bg-black/50 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden
      />
      <div
        /* Boîte au centre sur ordinateur, feuille montante sur téléphone. La
           boîte ne se tire pas : elle se ferme par sa croix ou par le voile, et
           un geste de glissement sur une fenêtre posée au milieu de l'écran ne
           veut rien dire. */
        className={
          isDialog
            ? `fixed left-1/2 top-1/2 z-[10002] flex max-h-[80vh] w-[min(30rem,calc(100vw-3rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border shadow-2xl transition-all duration-200 ${
                isOpen ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
              } ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950'}`
            : `fixed inset-x-0 bottom-0 top-8 z-[10002] flex flex-col overflow-hidden rounded-t-3xl border-t transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                isOpen ? 'translate-y-0' : 'translate-y-full'
              } ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950'}`
        }
        style={{
          pointerEvents: isOpen ? 'auto' : 'none',
          transform: !isDialog && dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: !isDialog && dragY > 0 ? 'none' : undefined,
        }}
        aria-hidden={!isOpen}
        onPointerDown={isDialog ? undefined : handleDragStart}
        onPointerMove={isDialog ? undefined : handleDragMove}
        onPointerUp={isDialog ? undefined : handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        <div className="flex justify-center pb-1 pt-3">
          <div className={`h-1.5 w-12 rounded-full ${isLight ? 'bg-slate-300' : 'bg-white/20'}`} />
        </div>
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-center gap-2 px-3 pb-2">
              {step !== 'choice' && (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setStep(step === 'confirm' ? (wasScanned ? 'scan' : 'manual') : 'choice');
                    // Sans écran de choix, reculer depuis la saisie ferme la
                    // feuille : il n'y a rien derrière.
                    if (!allowScan && step === 'manual') onClose();
                  }}
                  className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full transition active:scale-90 ${
                    isLight ? 'text-slate-600' : 'text-slate-300'
                  }`}
                  aria-label={text.back}
                >
                  <ArrowLeftIcon className="h-5 w-5" />
                </button>
              )}
              <div className={`min-w-0 flex-1 text-base font-bold ${strong}`}>{text.title}</div>
              <button
                type="button"
                onClick={onClose}
                className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full transition active:scale-90 ${
                  isLight ? 'text-slate-600' : 'text-slate-300'
                }`}
                aria-label={text.close}
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Les écrans défilent latéralement dans la feuille : on avance
                dans une même conversation, on ne change pas d'endroit. */}
            <div className="min-h-0 flex-1 overflow-hidden">
              <div
                className="flex h-full w-[300%] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
                style={{ transform: `translateX(-${(stepIndex * 100) / 3}%)` }}
              >
                {/* 1 — le choix */}
                <div className="h-full w-1/3 overflow-y-auto px-4 pb-10">
                  {allowScan && (
                  <button
                    type="button"
                    onClick={() => { setError(null); setStep('scan'); }}
                    className={`mb-3 flex w-full items-center gap-3 rounded-2xl border px-4 py-4 text-left transition active:scale-[0.99] ${surface}`}
                  >
                    <CameraIcon className="h-6 w-6 flex-shrink-0 text-blue-500" />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[0.95rem] font-semibold ${strong}`}>{text.scanTitle}</span>
                      <span className="block truncate text-xs text-slate-500">{text.scanHint}</span>
                    </span>
                  </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { setError(null); setStep('manual'); }}
                    className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-4 text-left transition active:scale-[0.99] ${surface}`}
                  >
                    <PencilSquareIcon className="h-6 w-6 flex-shrink-0 text-blue-500" />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[0.95rem] font-semibold ${strong}`}>{text.manualTitle}</span>
                      <span className="block truncate text-xs text-slate-500">{text.manualHint}</span>
                    </span>
                  </button>
                </div>

                {/* 2 — la caméra, ou la saisie */}
                <div className="h-full w-1/3 overflow-y-auto px-4 pb-10">
                  {step === 'scan' ? (
                    <>
                      <div className="relative overflow-hidden rounded-3xl bg-black" style={{ aspectRatio: '1024 / 630' }}>
                        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
                        {/* Le guide cadre la carte : la découpe du portrait en
                            dépend, elle se fait par proportions. */}
                        <div className="pointer-events-none absolute inset-3 rounded-2xl border-2 border-white/70" />
                        {/* La carte s'assombrit et s'éclaircit tant qu'on la
                            lit : le voile respire, sans chiffre à interpréter. */}
                        {busy && (
                          <>
                            <div className="gl-scanning absolute inset-0 bg-black" />
                            <div className="absolute inset-0 flex items-end justify-center pb-4">
                              <span className="text-sm font-semibold text-white drop-shadow">
                                {text.reading}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={handleCapture}
                        disabled={busy}
                        className="mt-4 w-full rounded-2xl bg-blue-600 py-3.5 text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-50"
                      >
                        {text.capture}
                      </button>
                    </>
                  ) : (
                    <>
                      <label className="mb-2 block px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        {text.numberLabel}
                      </label>
                      <input
                        value={code}
                        onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 12))}
                        inputMode="numeric"
                        enterKeyHint="go"
                        placeholder="0000000000"
                        className={`h-14 w-full rounded-2xl border px-4 text-base tabular outline-none focus:border-blue-500 ${
                          isLight
                            ? 'border-slate-200 bg-white text-slate-900'
                            : 'border-slate-800 bg-slate-900 text-white'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => verify(code, false)}
                        disabled={busy || code.length < 8}
                        className="mt-4 w-full rounded-2xl bg-blue-600 py-3.5 text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-50"
                      >
                        {busy ? text.checking : text.check}
                      </button>
                    </>
                  )}
                </div>

                {/* 3 — ce que l'on va enregistrer */}
                <div className="h-full w-1/3 overflow-y-auto px-4 pb-10">
                  {/* Numéro valide mais porteur inconnu, et l'on est sur un
                      poste qui ne crée pas de carte : on le dit et l'on s'arrête
                      là. Ouvrir un formulaire de nom et de photo ici donnerait
                      une carte à moitié remplie, que le téléphone devrait
                      corriger ensuite. */}
                  {(lookup || testCode) && linkOnly && !known ? (
                    <div className="pt-2">
                      <p className={`mb-2 text-base font-bold ${strong}`}>{text.mobileOnlyTitle}</p>
                      <p className="mb-6 text-sm leading-relaxed text-slate-500">{text.mobileOnlyBody}</p>
                      <button
                        type="button"
                        onClick={onClose}
                        className="w-full rounded-2xl bg-blue-600 py-3.5 text-sm font-bold text-white transition active:scale-[0.98]"
                      >
                        {text.mobileOnlyClose}
                      </button>
                    </div>
                  ) : (lookup || testCode) && (
                    <>
                      <p className={`mb-5 text-sm font-semibold ${strong}`}>
                        {known ? text.known : wasScanned ? text.yourInfo : text.fillInfo}
                      </p>

                      <div className="mb-4 flex items-start gap-3">
                        <button
                          type="button"
                          disabled={known !== null}
                          onClick={() => fileInputRef.current?.click()}
                          className={`flex h-24 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border ${surface}`}
                        >
                          {photoUrl || knownPhotoUrl
                            ? <img src={photoUrl ?? knownPhotoUrl} alt="" className="h-full w-full object-cover" />
                            : <PhotoIcon className="h-7 w-7 text-slate-400" />}
                        </button>
                        {!known && (
                          <span className="min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              className="text-sm font-semibold text-blue-500"
                            >
                              {photoUrl || knownPhotoUrl ? text.changePhoto : text.addPhoto}
                            </button>
                            {/* Le conseil se lit sous le bouton qu'il concerne,
                                pas au bas du formulaire. */}
                            <span className="mt-1 block text-xs leading-snug text-slate-500">
                              {text.photoHint}
                            </span>
                          </span>
                        )}
                        {known?.firstName && (
                          <span className={`text-lg font-semibold ${strong}`}>{known.firstName}</span>
                        )}
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={event => {
                          const file = event.target.files?.[0];
                          if (file) setPhoto(file);
                        }}
                      />

                      {/* Carte connue : seul le nom de famille est demandé, et
                          il sert de vérification — le reste est déjà là. */}
                      {!known && (
                        <input
                          value={firstName}
                          onChange={event => setFirstName(event.target.value)}
                          placeholder={text.firstName}
                          className={`mb-2 h-14 w-full rounded-2xl border px-4 text-base outline-none focus:border-blue-500 ${
                            isLight ? 'border-slate-200 bg-white text-slate-900' : 'border-slate-800 bg-slate-900 text-white'
                          }`}
                        />
                      )}
                      {/* Le nom est en capitales sur le carton : il l'est ici
                          aussi, à la saisie comme à l'affichage. */}
                      <input
                        value={lastName}
                        onChange={event => setLastName(event.target.value.toUpperCase())}
                        placeholder={text.lastName}
                        style={{ textTransform: 'uppercase' }}
                        className={`mb-4 h-14 w-full rounded-2xl border px-4 text-base outline-none focus:border-blue-500 ${
                          isLight ? 'border-slate-200 bg-white text-slate-900' : 'border-slate-800 bg-slate-900 text-white'
                        }`}
                      />

                      {/* Ce que le réseau sait, lui, ne se corrige pas. Une
                          carte d'essai n'ayant rien à en dire, elle n'annonce
                          que son numéro. */}
                      <div className={`mb-4 space-y-1.5 rounded-2xl border px-4 py-3 text-sm ${surface}`}>
                        <div className="flex justify-between gap-3">
                          <span className="text-slate-500">{text.numberLabel}</span>
                          <span className={`tabular font-semibold ${strong}`}>
                            {lookup?.code ?? testCode}
                          </span>
                        </div>
                        {lookup?.contracts[0] && (
                          <div className="flex justify-between gap-3">
                            <span className="text-slate-500">{text.contract}</span>
                            <span className={`truncate font-semibold ${strong}`}>{lookup.contracts[0].label}</span>
                          </div>
                        )}
                        {lookup && (
                          <>
                            <div className="flex justify-between gap-3">
                              <span className="text-slate-500">{text.birthDate}</span>
                              <span className={`font-semibold ${strong}`}>{formatDate(lookup.birthDate)}</span>
                            </div>
                            <div className="flex justify-between gap-3">
                              <span className="text-slate-500">{text.validUntil}</span>
                              <span className={`font-semibold ${strong}`}>{formatDate(lookup.expiresAt)}</span>
                            </div>
                          </>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (known) {
                            const expected = (known.lastName ?? '').trim().toLowerCase();
                            if (expected && lastName.trim().toLowerCase() !== expected) {
                              setError(text.knownMismatch);
                              return;
                            }
                          }
                          void handleSave();
                        }}
                        disabled={busy}
                        className="w-full rounded-2xl bg-blue-600 py-3.5 text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-50"
                      >
                        {busy ? text.saving : known ? text.knownImport : text.save}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {error && (
              <p className="px-4 pb-4 text-center text-sm font-semibold text-rose-400">{error}</p>
            )}
          </div>
      </div>
    </>
  );
}
