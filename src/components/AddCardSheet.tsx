/**
 * Ajouter une carte OURA.
 *
 * Trois étapes, annoncées d'avance : la carte, le visage, le nom. La première
 * lit le carton — par l'appareil photo, qui déclenche tout seul, ou en tapant
 * les dix chiffres. La deuxième demande un portrait, présenté pour ce qu'il est
 * du point de vue du voyageur : la vérification que la carte est bien la
 * sienne. La troisième lui demande comment il s'appelle, en lui montrant à
 * côté ce que la carte dit déjà de lui — grisé, impossible à corriger, mais
 * visible : c'est ce qui prouve qu'on parle bien de sa carte.
 *
 * Rien ne s'enregistre sans photo ni sans nom : une carte à moitié remplie ne
 * vaut rien au contrôle.
 */

import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeftIcon,
  CameraIcon,
  CheckCircleIcon,
  LockClosedIcon,
  PencilSquareIcon,
  XMarkIcon,
} from '@heroicons/react/24/solid';
import { attachKnownCard, findKnownCard, saveTestCard, lookupOuraCard, saveOuraCard, type OuraCard, type OuraCardLookup } from '../services/ouraCard';
import { scanCard, toCanvas, waitForSteadyFrame } from '../services/cardOcr';

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
   * L'étape du portrait tombe avec lui, pour la même raison.
   */
  allowScan?: boolean;
  /**
   * La forme que prend la fenêtre.
   *
   * `sheet` : une feuille qui monte du bas, celle du téléphone, qu'on referme
   * en la tirant. `dialog` : une boîte posée au centre, celle du bureau — sur
   * un grand écran, une feuille pleine hauteur laisse la moitié de la fenêtre
   * ouverte sur rien. `screen` : l'écran entier, sans voile ni poignée, pour la
   * mise en route — une feuille posée sur un écran d'accueil qui n'est lui-même
   * qu'un fond noir montrait un bord de feuille sur du vide.
   */
  variant?: 'sheet' | 'dialog' | 'screen';
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

type Step = 'choice' | 'scan' | 'manual' | 'selfie' | 'identity';

/**
 * Où en est la lecture de la carte.
 *
 * `aiming` : la caméra tourne, on cadre. `reading` : la photo est prise et
 * figée à l'écran, Tesseract la lit. `ok` / `fail` : le verdict, affiché une
 * seconde par-dessus la photo avant de passer à la suite.
 */
type ScanPhase = 'aiming' | 'reading' | 'ok' | 'fail';

/** Au-delà, on cesse d'insister et l'on propose la saisie à la main. */
const MAX_SCAN_ATTEMPTS = 3;

const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

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
    reading: isFr ? 'Lecture de la carte…' : 'Reading the card…',
    aiming: isFr
      ? 'Présentez la carte dans le cadre : la lecture part dès que vous ne bougez plus.'
      : 'Hold the card inside the frame: reading starts as soon as you hold still.',
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
      ? "Le numéro n'a pas été lu. Saisissez-le à la main."
      : 'The number could not be read. Type it by hand.',
    scanRetry: isFr ? 'Carte non reconnue, on recommence…' : 'Card not recognised, trying again…',
    found: isFr ? 'Carte reconnue' : 'Card recognised',
    typeInstead: isFr ? 'Saisir le numéro à la main' : 'Type the number instead',

    stepCard: isFr ? 'La carte' : 'The card',
    stepIdentity: isFr ? 'Votre identité' : 'Your identity',
    stepName: isFr ? 'Votre nom' : 'Your name',
    stepOf: isFr ? 'Étape' : 'Step',

    selfieTitle: isFr ? 'Vérifions votre identité' : "Let's verify your identity",
    selfieBody: isFr
      ? "Prenez-vous en photo : ce portrait figure sur votre carte OURA dans l'application, et confirme qu'elle est bien la vôtre."
      : 'Take a photo of yourself: this portrait appears on your OURA card in the app, and confirms the card is really yours.',
    selfieHint: isFr
      ? 'Regardez l’objectif, visage bien éclairé, sans lunettes de soleil.'
      : 'Look at the lens, face well lit, no sunglasses.',
    selfieCapture: isFr ? 'Prendre la photo' : 'Take the photo',
    selfieRetake: isFr ? 'Reprendre' : 'Retake',
    selfieContinue: isFr ? 'C’est bien moi' : "That's me",
    selfieDenied: isFr
      ? "L'appareil photo n'est pas accessible. La vérification demande une photo."
      : 'The camera is unavailable. Verification requires a photo.',
    selfieRequired: isFr ? 'La photo est obligatoire.' : 'The photo is required.',

    yourInfo: isFr ? 'Sont-ce bien vos informations ?' : 'Are these your details?',
    known: isFr
      ? 'Cette carte est déjà connue. Quel est votre nom de famille ?'
      : 'This card is already known. What is your last name?',
    knownMismatch: isFr
      ? "Ce nom ne correspond pas à celui de la carte."
      : 'That name does not match the one on the card.',
    knownImport: isFr ? 'Importer la carte' : 'Import the card',
    fillInfo: isFr ? 'Comment vous appelez-vous ?' : 'What is your name?',
    nameBody: isFr
      ? 'Le prénom et le nom doivent être ceux imprimés sur la carte.'
      : 'First and last name must match the ones printed on the card.',
    firstName: isFr ? 'Prénom' : 'First name',
    lastName: isFr ? 'Nom' : 'Last name',
    required: isFr ? 'obligatoire' : 'required',
    nameRequired: isFr ? 'Prénom et nom sont obligatoires.' : 'First and last name are required.',
    fromNetworkHint: isFr
      ? 'Déjà lues sur votre carte, elles ne se modifient pas ici.'
      : 'Already read from your card, they cannot be edited here.',
    verified: isFr ? 'Identité vérifiée' : 'Identity verified',
    save: isFr ? 'Enregistrer' : 'Save',
    saving: isFr ? 'Enregistrement…' : 'Saving…',
    saveFailed: isFr ? "L'enregistrement a échoué." : 'Saving failed.',
    contract: isFr ? 'Abonnement' : 'Pass',
    birthDate: isFr ? 'Naissance' : 'Birth date',
    validUntil: isFr ? 'Valide jusqu’au' : 'Valid until',
    mobileOnlyTitle: isFr ? 'Carte à créer sur mobile' : 'Set this card up on mobile',
    mobileOnlyBody: isFr
      ? "Ce numéro n'est rattaché à aucun porteur. Sur ordinateur, le portefeuille ne fait que retrouver des cartes déjà déclarées. Le nom et la photo se saisissent depuis l'application mobile, où l'on peut photographier le carton."
      : 'This number is not linked to any holder yet. On desktop the wallet only finds cards that already exist. Name and photo are entered from the mobile app, where the card can be photographed.',
    mobileOnlyClose: isFr ? 'Compris' : 'Got it',
  };
};

function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * La coche qui se trace.
 *
 * Le tracé de Lucide — deux segments, bouts arrondis — dessiné par un
 * `stroke-dashoffset` qui se résorbe. La version animée de la bibliothèque
 * s'installe par shadcn, que ce projet n'utilise pas ; le trait, lui, tient en
 * six lignes.
 */
function DrawnCheck({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" className="gl-check-path" />
    </svg>
  );
}

export function AddCardSheet({ isOpen, language, theme = 'dark', onClose, onSaved, allowScan = true, variant = 'sheet', linkOnly = false }: AddCardSheetProps) {
  const isDialog = variant === 'dialog';
  const isScreen = variant === 'screen';
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
  /** Vrai dès que le portrait a été validé : l'étape 2 est franchie. */
  const [identityDone, setIdentityDone] = useState(false);

  const [scanPhase, setScanPhase] = useState<ScanPhase>('aiming');
  /** La photo qu'on est en train de lire, figée à l'écran pendant la lecture. */
  const [frozenCard, setFrozenCard] = useState<string | null>(null);
  const scanRunRef = useRef(0);

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
  const selfieVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  /** Levé quand le voyageur appuie sur le déclencheur, pour capturer sans attendre l'immobilité. */
  const manualCaptureRef = useRef(false);

  const surface = isLight ? 'border-slate-200 bg-white' : 'border-slate-800 bg-slate-900';
  const strong = isLight ? 'text-slate-900' : 'text-white';
  const field = isLight
    ? 'border-slate-200 bg-white text-slate-900'
    : 'border-slate-800 bg-slate-900 text-white';
  /**
   * Les libellés se lisent comme le reste : Inter, casse normale.
   *
   * Les petites capitales espacées qu'on trouve partout dans les interfaces
   * bricolées n'apportent rien ici — elles hurlent au-dessus de champs qui
   * n'ont rien d'urgent, et rompent avec le reste de l'application.
   */
  const label = 'mb-1.5 block px-1 text-sm font-semibold text-slate-500';

  /** Referme la caméra dès qu'on quitte l'écran qui l'utilise. */
  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  };

  useEffect(() => () => stopCamera(), []);

  useEffect(() => {
    if (!isOpen) {
      scanRunRef.current += 1;
      stopCamera();
      return;
    }
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
    setIdentityDone(false);
    setFrozenCard(null);
    setScanPhase('aiming');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!photo) {
      setPhotoUrl(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  /**
   * Où l'on va une fois le numéro reconnu.
   *
   * Une carte déjà déclarée porte déjà son visage : la vérification a eu lieu
   * ailleurs, on ne la redemande pas. Sur ordinateur non plus — il n'y a rien
   * à photographier avec une webcam.
   */
  const advanceAfterVerify = (existing: OuraCard | null) => {
    const skipSelfie = existing !== null || !allowScan;
    setIdentityDone(skipSelfie);
    setStep(skipSelfie ? 'identity' : 'selfie');
  };

  /**
   * Vérifie un numéro auprès du réseau.
   *
   * Renseigne tout ce qu'on sait de la carte, mais ne change pas d'écran :
   * c'est à l'appelant de le faire, une fois son animation terminée.
   */
  const verify = async (
    rawCode: string,
    scanned: boolean,
  ): Promise<{ ok: false } | { ok: true; existing: OuraCard | null }> => {
    setBusy(true);
    setError(null);
    const found = await lookupOuraCard(rawCode);
    if (!found) {
      const test = await findKnownCard(rawCode);
      setBusy(false);
      if (test?.isTest) {
        announce(text.found);
        setTestCode(test.cardCode);
        setLookup(null);
        setWasScanned(scanned);
        if (test.lastName) {
          setKnown(test);
          if (test.firstName) setFirstName(test.firstName);
          setKnownPhotoPath(test.photoPath);
          setKnownPhotoUrl(test.photoUrl);
          return { ok: true, existing: test };
        }
        return { ok: true, existing: null };
      }
      setError(text.unknown);
      return { ok: false };
    }
    setBusy(false);
    setTestCode(null);
    setLookup(found);
    setWasScanned(scanned);
    announce(text.found);

    const existing = await findKnownCard(found.code);
    if (existing) {
      setPhoto(null);
      setKnown(existing);
      if (existing.firstName) setFirstName(existing.firstName);
      setKnownPhotoPath(existing.photoPath);
      setKnownPhotoUrl(existing.photoUrl);
    }
    return { ok: true, existing: existing ?? null };
  };

  /**
   * La lecture de la carte, qui se déclenche seule.
   *
   * Personne n'appuie sur rien : la caméra s'ouvre, on laisse le temps de
   * cadrer, puis une image est prise et lue. Ratée, on recommence — trois fois,
   * après quoi la saisie à la main vaut mieux qu'un quatrième essai. Pendant la
   * lecture, l'image prise reste à l'écran sous un voile qui respire : c'est
   * elle qu'on lit, autant la montrer.
   */
  useEffect(() => {
    if (!isOpen || step !== 'scan') {
      scanRunRef.current += 1;
      stopCamera();
      return;
    }

    const run = ++scanRunRef.current;
    const stale = () => scanRunRef.current !== run;

    const loop = async () => {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 } },
        });
      } catch {
        if (!stale()) {
          setError(text.cameraDenied);
          setStep('manual');
        }
        return;
      }
      if (stale()) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      for (let attempt = 1; attempt <= MAX_SCAN_ATTEMPTS; attempt += 1) {
        if (stale()) return;
        setScanPhase('aiming');
        setFrozenCard(null);

        for (let tick = 0; tick < 12 && !videoRef.current?.videoWidth; tick += 1) {
          await wait(200);
          if (stale()) return;
        }
        const video = videoRef.current;
        if (stale()) return;
        if (!video?.videoWidth) continue;

        /*
         * On ne photographie plus à intervalle fixe : on attend le moment où la
         * carte est présentée et la main arrêtée. Voir `waitForSteadyFrame`.
         *
         * Après un échec, on exige que le cadre ait bougé avant de reprendre —
         * sinon la même image immobile redonnerait la même lecture ratée, et
         * les trois essais se consommeraient en trois secondes sans que le
         * voyageur ait eu le temps de comprendre ce qu'on attend de lui.
         */
        const steady = await waitForSteadyFrame(video, {
          cancelled: stale,
          requireMotionFirst: attempt > 1,
          manualCapture: () => manualCaptureRef.current,
        });
        manualCaptureRef.current = false;
        if (stale()) return;
        if (!steady) break;

        const canvas = toCanvas(video, video.videoWidth, video.videoHeight);
        setFrozenCard(canvas.toDataURL('image/jpeg', 0.85));
        setScanPhase('reading');

        let read: Awaited<ReturnType<typeof scanCard>> | null = null;
        try {
          read = await scanCard(canvas);
        } catch {
          read = null;
        }
        if (stale()) return;

        if (read?.cardCode) {
          if (read.firstName) setFirstName(read.firstName);
          if (read.lastName) setLastName(read.lastName);
          setCode(read.cardCode);
          const result = await verify(read.cardCode, true);
          if (stale()) return;
          if (result.ok) {
            setScanPhase('ok');
            stopCamera();
            await wait(950);
            if (stale()) return;
            advanceAfterVerify(result.existing);
            return;
          }
        }

        setScanPhase('fail');
        await wait(1100);
        if (stale()) return;
      }

      if (stale()) return;
      setError(text.scanFailed);
      setCode('');
      setStep('manual');
    };

    void loop();
    return () => {
      scanRunRef.current += 1;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, isOpen]);

  /**
   * La caméra frontale, pour la vérification d'identité.
   *
   * `exact` et non le simple souhait : `facingMode: 'user'` n'est qu'une
   * préférence, qu'un navigateur est libre d'ignorer — et il l'ignore volontiers
   * quand un autre flux vient de tourner sur l'objectif arrière, qu'il se
   * contente alors de resservir. On demande donc la caméra avant sans échappée
   * possible, quitte à retomber sur le souhait si l'appareil n'en a pas (une
   * webcam d'ordinateur, qui n'a qu'un objectif, refuse l'`exact`).
   *
   * Le flux précédent est coupé avant, pas après : sur téléphone, les deux
   * objectifs ne filment pas en même temps, et demander l'avant pendant que
   * l'arrière tourne rend l'arrière une seconde fois.
   */
  useEffect(() => {
    if (!isOpen || step !== 'selfie' || photo) {
      if (step !== 'selfie') stopCamera();
      return;
    }
    let cancelled = false;
    stopCamera();

    const open = async () => {
      const size = { width: { ideal: 1280 }, height: { ideal: 1280 } };
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { exact: 'user' }, ...size },
        });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', ...size },
          });
        } catch {
          if (!cancelled) setError(text.selfieDenied);
          return;
        }
      }
      if (cancelled) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current = stream;
      if (selfieVideoRef.current) {
        selfieVideoRef.current.srcObject = stream;
        void selfieVideoRef.current.play();
      }
    };

    void open();
    return () => {
      cancelled = true;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, isOpen, photo]);

  /** Prend le portrait : un cadre trois quarts, centré sur le visage. */
  const handleSelfie = async () => {
    const video = selfieVideoRef.current;
    if (!video?.videoWidth) return;
    const width = Math.round(Math.min(video.videoWidth, video.videoHeight * 0.75));
    const height = Math.round(width * 4 / 3);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(
      video,
      Math.round((video.videoWidth - width) / 2),
      Math.round((video.videoHeight - height) / 2),
      width,
      height,
      0,
      0,
      width,
      height,
    );
    const blob = await new Promise<Blob | null>(resolve => {
      canvas.toBlob(result => resolve(result), 'image/jpeg', 0.9);
    });
    if (!blob) return;
    stopCamera();
    setError(null);
    setPhoto(blob);
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

  const stepIndex =
    step === 'choice' ? 0
    : step === 'identity' ? 3
    : step === 'selfie' ? 2
    : 1;

  /** Le formulaire ne se valide pas à moitié : visage et nom, ou rien. */
  const hasFace = Boolean(photo || knownPhotoPath || knownPhotoUrl);
  const canSave = known
    ? lastName.trim().length > 0
    : Boolean(firstName.trim() && lastName.trim() && hasFace);

  const goBack = () => {
    setError(null);
    if (step === 'identity') {
      setStep(identityDone && allowScan && !known ? 'selfie' : wasScanned ? 'scan' : 'manual');
      return;
    }
    if (step === 'selfie') {
      setStep(wasScanned ? 'scan' : 'manual');
      return;
    }
    setStep('choice');
    if (!allowScan && step === 'manual') onClose();
  };

  const steps = [text.stepCard, text.stepIdentity, text.stepName];
  /** L'étape en cours, comptée pour le voyageur : 1, 2, 3. */
  const humanStep = stepIndex <= 1 ? 1 : stepIndex === 2 ? 2 : 3;

  /** Numéro valide, porteur inconnu, poste qui ne crée pas de carte. */
  const isMobileOnly = Boolean((lookup || testCode) && linkOnly && !known);

  const primary = 'w-full rounded-2xl bg-blue-600 py-3.5 text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-50';

  /**
   * Ce qui fait avancer d'une étape reste au bas de la feuille.
   *
   * Sorti des panneaux qui défilent : un bouton posé à la suite d'un formulaire
   * descend hors de l'écran dès que le clavier monte ou que le contenu
   * s'allonge, et il faut alors chercher en faisant défiler ce qu'on vient de
   * remplir. Ici il est toujours au même endroit, sous le pouce.
   */
  const action = (() => {
    if (step === 'choice') return null;
    if (step === 'scan') {
      return (
        <button
          type="button"
          onClick={() => { setError(null); setStep('manual'); }}
          className="w-full py-2 text-sm font-semibold text-blue-500"
        >
          {text.typeInstead}
        </button>
      );
    }
    if (step === 'manual') {
      return (
        <button
          type="button"
          onClick={async () => {
            const result = await verify(code, false);
            if (result.ok) advanceAfterVerify(result.existing);
          }}
          disabled={busy || code.length < 8}
          className={primary}
        >
          {busy ? text.checking : text.check}
        </button>
      );
    }
    if (step === 'selfie') {
      return photoUrl ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPhoto(null)}
            className={`flex-1 rounded-2xl border py-3.5 text-sm font-bold transition active:scale-[0.98] ${surface} ${strong}`}
          >
            {text.selfieRetake}
          </button>
          <button
            type="button"
            onClick={() => { setIdentityDone(true); setStep('identity'); }}
            className={`flex-1 ${primary}`}
          >
            {text.selfieContinue}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void handleSelfie()}
          className={`flex items-center justify-center gap-2 ${primary}`}
        >
          <CameraIcon className="h-5 w-5" />
          {text.selfieCapture}
        </button>
      );
    }
    if (!lookup && !testCode) return null;
    if (isMobileOnly) {
      return (
        <button type="button" onClick={onClose} className={primary}>
          {text.mobileOnlyClose}
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={() => {
          if (!canSave) {
            setError(known || hasFace ? text.nameRequired : text.selfieRequired);
            return;
          }
          if (known) {
            const expected = (known.lastName ?? '').trim().toLowerCase();
            if (expected && lastName.trim().toLowerCase() !== expected) {
              setError(text.knownMismatch);
              return;
            }
          }
          void handleSave();
        }}
        disabled={busy || !canSave}
        className={primary}
      >
        {busy ? text.saving : known ? text.knownImport : text.save}
      </button>
    );
  })();

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
      {!isScreen && (
        <div
          className={`fixed inset-0 z-[10001] bg-black/50 transition-opacity duration-300 ${
            isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          onClick={onClose}
          aria-hidden
        />
      )}
      <div
        /* Boîte au centre sur ordinateur, feuille montante sur téléphone. La
           boîte ne se tire pas : elle se ferme par sa croix ou par le voile, et
           un geste de glissement sur une fenêtre posée au milieu de l'écran ne
           veut rien dire. */
        className={
          isScreen
            ? `fixed inset-0 z-[10002] flex flex-col overflow-hidden transition-opacity duration-300 ${
                isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
              } ${isLight ? 'bg-slate-50' : 'bg-black'}`
            : isDialog
            ? `fixed left-1/2 top-1/2 z-[10002] flex max-h-[80vh] w-[min(30rem,calc(100vw-3rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border shadow-2xl transition-all duration-200 ${
                isOpen ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
              } ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950'}`
            : `fixed inset-x-0 bottom-0 top-8 z-[10002] flex flex-col overflow-hidden rounded-t-3xl border-t transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                isOpen ? 'translate-y-0' : 'translate-y-full'
              } ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950'}`
        }
        style={{
          pointerEvents: isOpen ? 'auto' : 'none',
          transform: !isDialog && !isScreen && dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: !isDialog && !isScreen && dragY > 0 ? 'none' : undefined,
          paddingTop: isScreen ? 'env(safe-area-inset-top)' : undefined,
        }}
        aria-hidden={!isOpen}
        /* L'écran plein ne se tire pas : il n'a pas de bord à saisir, et
           glisser dessus doit faire défiler son contenu. */
        onPointerDown={isDialog || isScreen ? undefined : handleDragStart}
        onPointerMove={isDialog || isScreen ? undefined : handleDragMove}
        onPointerUp={isDialog || isScreen ? undefined : handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        {!isScreen && (
          <div className="flex justify-center pb-1 pt-3">
            <div className={`h-1.5 w-12 rounded-full ${isLight ? 'bg-slate-300' : 'bg-white/20'}`} />
          </div>
        )}
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-center gap-2 px-3 pb-2">
              {step !== 'choice' && (
                <button
                  type="button"
                  onClick={goBack}
                  className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full transition active:scale-90 ${
                    isLight ? 'text-slate-600' : 'text-slate-300'
                  }`}
                  aria-label={text.back}
                >
                  <ArrowLeftIcon className="h-5 w-5" />
                </button>
              )}
              <div className="min-w-0 flex-1">
                <div className={`truncate text-base font-bold ${strong}`}>{text.title}</div>
                {step !== 'choice' && (
                  <div className="truncate text-xs font-semibold text-slate-500">
                    {text.stepOf} {humanStep}/3 · {steps[humanStep - 1]}
                  </div>
                )}
              </div>
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

            {/* Le chemin parcouru, montré plutôt que deviné : trois traits qui
                se remplissent l'un après l'autre. */}
            {step !== 'choice' && (
              <div className="flex gap-1.5 px-4 pb-3" aria-hidden>
                {steps.map((label, index) => (
                  <div
                    key={label}
                    className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                      index < humanStep ? 'bg-blue-500' : isLight ? 'bg-slate-200' : 'bg-slate-800'
                    }`}
                  />
                ))}
              </div>
            )}

            {/* Les écrans défilent latéralement dans la feuille : on avance
                dans une même conversation, on ne change pas d'endroit. */}
            <div className="min-h-0 flex-1 overflow-hidden">
              <div
                className="flex h-full w-[400%] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
                style={{ transform: `translateX(-${(stepIndex * 100) / 4}%)` }}
              >
                {/* 1 — le choix */}
                <div className="h-full w-1/4 overflow-y-auto px-5 pb-8">
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

                {/* 2 — la carte : la caméra qui lit toute seule, ou la saisie */}
                <div className={`h-full w-1/4 ${step === 'scan' ? 'overflow-hidden' : 'overflow-y-auto px-5 pb-8'}`}>
                  {step === 'scan' ? (
                    <>
                      <div className="relative h-full w-full overflow-hidden rounded-3xl bg-black">
                        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />

                        {/* La photo prise reste sous les yeux pendant qu'on la
                            lit : c'est elle le sujet, pas un écran noir. */}
                        {frozenCard && (
                          <img src={frozenCard} alt="" className="absolute inset-0 h-full w-full object-cover" />
                        )}

                        {/* Le guide cadre la carte, au centre de toute la zone
                            caméra. Il ne change pas de couleur : c'est le voile
                            posé sur la photo qui dit que ça travaille. */}
                        <div
                          className="pointer-events-none absolute left-1/2 top-1/2 w-[85%] -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 border-white/70"
                          style={{ aspectRatio: '1024 / 630' }}
                        />

                        {scanPhase === 'reading' && (
                          <>
                            <div className="gl-scanning pointer-events-none absolute inset-0 bg-black" />
                            <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-4">
                              <span className="text-sm font-semibold text-white drop-shadow">
                                {text.reading}
                              </span>
                            </div>
                          </>
                        )}

                        {(scanPhase === 'ok' || scanPhase === 'fail') && (
                          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/55">
                            {scanPhase === 'ok' ? (
                              <span className="gl-verdict flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 ring-2 ring-emerald-400/70">
                                <DrawnCheck className="h-10 w-10" />
                              </span>
                            ) : (
                              <span className="gl-fade flex h-20 w-20 items-center justify-center rounded-full bg-rose-500/15 text-rose-400 ring-2 ring-rose-400/60">
                                <XMarkIcon className="h-10 w-10" />
                              </span>
                            )}
                            <span className="gl-fade text-sm font-semibold text-white drop-shadow">
                              {scanPhase === 'ok' ? text.found : text.scanRetry}
                            </span>
                          </div>
                        )}

                        {scanPhase === 'aiming' && (
                          <div className="pointer-events-none absolute inset-x-0 bottom-6 flex items-center justify-center">
                            <button
                              type="button"
                              onClick={() => { manualCaptureRef.current = true; }}
                              className="pointer-events-auto flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-lg ring-4 ring-white/30 transition active:scale-90"
                              aria-label={text.reading}
                            />
                          </div>
                        )}
                      </div>

                    </>
                  ) : (
                    <>
                      <label className={label}>{text.numberLabel}</label>
                      <input
                        value={code}
                        onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 12))}
                        inputMode="numeric"
                        enterKeyHint="go"
                        placeholder="0000000000"
                        className={`h-14 w-full rounded-2xl border px-4 text-base tabular outline-none focus:border-blue-500 ${field}`}
                      />
                      <p className="mt-2 px-1 text-sm leading-relaxed text-slate-500">{text.manualHint}</p>
                    </>
                  )}
                </div>

                {/*
                  3 — la vérification d'identité.

                  Le seul écran de la feuille qui ne défile pas : la caméra prend
                  toute la largeur du téléphone et toute la hauteur qui reste
                  sous le texte, jusqu'au bouton. Elle était posée dans une
                  vignette arrondie de trois quarts, ce qui débordait de l'écran
                  et donnait un cadrage à faire glisser — on se cherchait dans
                  une fenêtre qu'il fallait d'abord trouver.
                */}
                <div className="flex h-full w-1/4 flex-col overflow-hidden">
                  <div className="flex-shrink-0 px-5">
                    <p className={`text-lg font-bold ${strong}`}>{text.selfieTitle}</p>
                    <p className="mb-4 mt-2 text-sm leading-relaxed text-slate-500">{text.selfieBody}</p>
                  </div>

                  {/* Bord à bord : pas de coins arrondis, rien qui laisse voir
                      le fond derrière. C'est un viseur, pas une vignette. */}
                  <div className="relative min-h-0 w-full flex-1 bg-black">
                    {photoUrl ? (
                      <img src={photoUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <video
                        ref={selfieVideoRef}
                        playsInline
                        muted
                        className="h-full w-full object-cover"
                        /* Miroir à l'écran : on se regarde comme dans une
                           glace. L'image enregistrée, elle, ne l'est pas. */
                        style={{ transform: 'scaleX(-1)' }}
                      />
                    )}
                    {/* L'ovale place le visage là où la découpe l'attend. */}
                    {!photoUrl && (
                      <div className="pointer-events-none absolute inset-x-[16%] inset-y-[10%] rounded-[50%] border-2 border-dashed border-white/70" />
                    )}
                    {photoUrl && (
                      <span className="gl-verdict absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg">
                        <DrawnCheck className="h-5 w-5" />
                      </span>
                    )}
                  </div>
                </div>

                {/* 4 — le nom, et ce que la carte dit déjà */}
                <div className="h-full w-1/4 overflow-y-auto px-5 pb-8">
                  {/* Numéro valide mais porteur inconnu, et l'on est sur un
                      poste qui ne crée pas de carte : on le dit et l'on s'arrête
                      là. Ouvrir un formulaire de nom et de photo ici donnerait
                      une carte à moitié remplie, que le téléphone devrait
                      corriger ensuite. */}
                  {isMobileOnly ? (
                    <div className="pt-2">
                      <p className={`mb-3 text-lg font-bold ${strong}`}>{text.mobileOnlyTitle}</p>
                      <p className="text-sm leading-relaxed text-slate-500">{text.mobileOnlyBody}</p>
                    </div>
                  ) : (lookup || testCode) && (
                    <>
                      <p className={`text-lg font-bold ${strong}`}>
                        {known ? text.known : wasScanned ? text.yourInfo : text.fillInfo}
                      </p>
                      <p className="mb-6 mt-2 text-sm leading-relaxed text-slate-500">{text.nameBody}</p>

                      {/* Le visage qu'on vient de vérifier reste visible ici :
                          c'est lui qu'on est en train d'enregistrer. */}
                      {(photoUrl || knownPhotoUrl) && (
                        <div className="mb-6 flex items-center gap-4">
                          <img
                            src={photoUrl ?? knownPhotoUrl}
                            alt=""
                            className="h-20 w-16 flex-shrink-0 rounded-xl object-cover"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-500">
                              <CheckCircleIcon className="h-4 w-4 flex-shrink-0" />
                              {text.verified}
                            </span>
                            {!known && allowScan && (
                              <button
                                type="button"
                                onClick={() => setStep('selfie')}
                                className="mt-1.5 block text-sm font-semibold text-blue-500"
                              >
                                {text.selfieRetake}
                              </button>
                            )}
                          </span>
                        </div>
                      )}

                      {/* Carte connue : seul le nom de famille est demandé, et
                          il sert de vérification — le reste est déjà là. */}
                      {!known && (
                        <div className="mb-5">
                          <label className={label}>
                            {text.firstName} · {text.required}
                          </label>
                          <input
                            value={firstName}
                            onChange={event => setFirstName(event.target.value)}
                            placeholder={text.firstName}
                            className={`h-14 w-full rounded-2xl border px-4 text-base outline-none focus:border-blue-500 ${field}`}
                          />
                        </div>
                      )}
                      <div className="mb-5">
                        <label className={label}>
                          {text.lastName} · {text.required}
                        </label>
                        {/* Le nom est en capitales sur le carton : il l'est ici
                            aussi, à la saisie comme à l'affichage. */}
                        <input
                          value={lastName}
                          onChange={event => setLastName(event.target.value.toUpperCase())}
                          placeholder={text.lastName}
                          style={{ textTransform: 'uppercase' }}
                          className={`h-14 w-full rounded-2xl border px-4 text-base outline-none focus:border-blue-500 ${field}`}
                        />
                      </div>

                      {/* Ce que la carte dit, elle, ne se corrige pas — mais se
                          montre, sous la même forme que ce qu'on demande de
                          remplir : des champs, simplement grisés et cadenassés.
                          Rien n'annonce la section : on voit tout de suite que
                          ces lignes-là sont déjà remplies. Une carte d'essai
                          n'ayant rien à en dire, elle n'affiche que son numéro. */}
                      {[
                        { key: text.numberLabel, value: lookup?.code ?? testCode ?? '—', tabular: true },
                        ...(lookup?.contracts[0]
                          ? [{ key: text.contract, value: lookup.contracts[0].label, tabular: false }]
                          : []),
                        ...(lookup
                          ? [
                              { key: text.birthDate, value: formatDate(lookup.birthDate), tabular: true },
                              { key: text.validUntil, value: formatDate(lookup.expiresAt), tabular: true },
                            ]
                          : []),
                      ].map(row => (
                        <div key={row.key} className="mb-5">
                          <label className={label}>{row.key}</label>
                          <div className="relative">
                            <input
                              value={row.value}
                              readOnly
                              disabled
                              tabIndex={-1}
                              className={`h-14 w-full cursor-not-allowed rounded-2xl border pl-4 pr-11 text-base ${
                                row.tabular ? 'tabular' : ''
                              } ${
                                isLight
                                  ? 'border-slate-200 bg-slate-100 text-slate-500'
                                  : 'border-slate-800 bg-slate-900/60 text-slate-400'
                              }`}
                            />
                            <LockClosedIcon className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                          </div>
                        </div>
                      ))}

                      <p className="px-1 text-sm leading-relaxed text-slate-500">{text.fromNetworkHint}</p>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Le conseil de cadrage se tient juste au-dessus du trait qui
                sépare la photo de son bouton : c'est la dernière chose qu'on
                lit avant d'appuyer. Il ne vaut que tant qu'il y a quelque chose
                à cadrer, et s'en va donc avec la caméra, une fois le portrait
                pris. */}
            {step === 'selfie' && !photoUrl && (
              <p className="flex-shrink-0 px-5 pb-4 text-center text-sm leading-relaxed text-pretty text-slate-500">
                {text.selfieHint}
              </p>
            )}

            {/* Le pied de la feuille : ce qui fait avancer, et ce qui bloque.
                Toujours visible, quoi qu'il y ait au-dessus. */}
            {(action || error) && (
              <div
                className={`flex-shrink-0 border-t px-5 pt-4 ${
                  isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950'
                }`}
                style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1rem)' }}
              >
                {error && (
                  <p className="mb-3 text-center text-sm font-semibold text-rose-400">{error}</p>
                )}
                {action}
              </div>
            )}
          </div>
      </div>
    </>
  );
}
