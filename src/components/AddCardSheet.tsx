import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeftIcon,
  CameraIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  CreditCardIcon,
  DocumentCheckIcon,
  LockClosedIcon,
  PencilSquareIcon,
  UserCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/solid';
import { attachKnownCard, findKnownCard, saveTestCard, lookupOuraCard, saveOuraCard, recordTermsAcceptance, type OuraCard, type OuraCardLookup } from '../services/ouraCard';
import { getOuraTerms } from './ouraTermsContent';
import { scanCard, toCanvas, waitForSteadyFrame } from '../services/cardOcr';
import { tx } from '../i18n';

interface AddCardSheetProps {
  isOpen: boolean;
  language: 'fr' | 'en';
  theme?: 'light' | 'dark';
  onClose: () => void;
  onSaved: (card: OuraCard) => void;
  allowScan?: boolean;
  variant?: 'sheet' | 'dialog' | 'screen';
  linkOnly?: boolean;
}

type Step = 'choice' | 'scan' | 'manual' | 'terms' | 'selfie' | 'identity';

type ScanPhase = 'aiming' | 'reading' | 'ok' | 'fail';

const MAX_SCAN_ATTEMPTS = 3;

const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

const getText = (language: 'fr' | 'en') => {
  const isFr = language === 'fr';
  return {
    title: tx(isFr).addCardSheet.addACard,
    choiceTitle: tx(isFr).addCardSheet.addAnOuraCard,
    choiceBody: tx(isFr).addCardSheet.yourCardWillAppear,
    stepTerms: tx(isFr).addCardSheet.terms,
    termsRequired: tx(isFr).addCardSheet.acceptTheTermsTo,
    scanTitle: tx(isFr).addCardSheet.scanMyCard,
    scanHint: tx(isFr).addCardSheet.theSideWithThe,
    manualTitle: tx(isFr).addCardSheet.enterTheNumber,
    manualHint: tx(isFr).addCardSheet.theTenDigitsOn,
    close: tx(isFr).addCardSheet.close,
    back: tx(isFr).addCardSheet.back,
    reading: tx(isFr).addCardSheet.readingTheCard,
    aiming: tx(isFr).addCardSheet.holdTheCardInside,
    cameraDenied: tx(isFr).addCardSheet.theCameraIsUnavailable,
    numberLabel: tx(isFr).addCardSheet.cardNumber,
    check: tx(isFr).addCardSheet.check,
    checking: tx(isFr).addCardSheet.checking,
    unknown: tx(isFr).addCardSheet.thisNumberDoesNot,
    scanFailed: tx(isFr).addCardSheet.theNumberCouldNot,
    scanRetry: tx(isFr).addCardSheet.cardNotRecognisedTrying,
    found: tx(isFr).addCardSheet.cardRecognised,
    typeInstead: tx(isFr).addCardSheet.typeTheNumberInstead,

    stepCard: tx(isFr).addCardSheet.theCard,
    stepIdentity: tx(isFr).addCardSheet.yourIdentity,
    stepName: tx(isFr).addCardSheet.yourName,
    stepOf: tx(isFr).addCardSheet.step,

    selfieTitle: tx(isFr).addCardSheet.letSVerifyYour,
    selfieBody: tx(isFr).addCardSheet.takeAPhotoOf,
    selfieHint: tx(isFr).addCardSheet.lookAtTheLens,
    selfieCapture: tx(isFr).addCardSheet.takeThePhoto,
    selfieRetake: tx(isFr).addCardSheet.retake,
    selfieContinue: tx(isFr).addCardSheet.thatSMe,
    selfieDenied: tx(isFr).addCardSheet.theCameraIsUnavailable2,
    selfieRequired: tx(isFr).addCardSheet.thePhotoIsRequired,

    yourInfo: tx(isFr).addCardSheet.areTheseYourDetails,
    known: tx(isFr).addCardSheet.thisCardIsAlready,
    knownMismatch: tx(isFr).addCardSheet.thatNameDoesNot,
    knownImport: tx(isFr).addCardSheet.importTheCard,
    fillInfo: tx(isFr).addCardSheet.whatIsYourName,
    nameBody: tx(isFr).addCardSheet.firstAndLastName,
    firstName: tx(isFr).addCardSheet.firstName,
    lastName: tx(isFr).addCardSheet.lastName,
    required: tx(isFr).addCardSheet.required,
    nameRequired: tx(isFr).addCardSheet.firstAndLastName2,
    fromNetworkHint: tx(isFr).addCardSheet.alreadyReadFromYour,
    verified: tx(isFr).addCardSheet.identityVerified,
    save: tx(isFr).addCardSheet.save,
    saving: tx(isFr).addCardSheet.saving,
    saveFailed: tx(isFr).addCardSheet.savingFailed,
    contract: tx(isFr).addCardSheet.pass,
    birthDate: tx(isFr).addCardSheet.birthDate,
    validUntil: tx(isFr).addCardSheet.validUntil,
    mobileOnlyTitle: tx(isFr).addCardSheet.setThisCardUp,
    mobileOnlyBody: tx(isFr).addCardSheet.thisNumberIsNot,
    mobileOnlyClose: tx(isFr).addCardSheet.gotIt,
  };
};

function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

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
  const [wasScanned, setWasScanned] = useState(false);
  const [knownPhotoPath, setKnownPhotoPath] = useState<string | undefined>();
  const [knownPhotoUrl, setKnownPhotoUrl] = useState<string | undefined>();
  const [known, setKnown] = useState<OuraCard | null>(null);
  const [testCode, setTestCode] = useState<string | null>(null);
  const [identityDone, setIdentityDone] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsChecked, setTermsChecked] = useState(false);
  const terms = getOuraTerms(language);

  const [scanPhase, setScanPhase] = useState<ScanPhase>('aiming');
  const [frozenCard, setFrozenCard] = useState<string | null>(null);
  const scanRunRef = useRef(0);

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
  const manualCaptureRef = useRef(false);

  const surface = isLight ? 'border-transparent bg-[rgba(0,0,0,0.05)]' : 'border-transparent bg-[rgba(255,255,255,0.06)]';
  const strong = isLight ? 'text-[#000000]' : 'text-[#ffffff]';
  const soft = isLight ? 'text-[#525252]' : 'text-[#a3a3a3]';
  const field = isLight
    ? 'border-transparent bg-[rgba(0,0,0,0.05)] text-[#000000]'
    : 'border-transparent bg-[rgba(255,255,255,0.06)] text-[#ffffff]';
  const pageBg = isLight ? 'bg-[#ffffff]' : 'bg-[#0b0b0b]';
  const focus = isLight ? 'focus:border-[#000000]' : 'focus:border-[rgba(255,255,255,0.6)]';
  const pageIcon = `h-12 w-12 ${strong}`;
  const pageTitle = `pt-5 text-[1.625rem] font-medium leading-[1.15] ${strong}`;
  const pageBody = `pt-3 text-[1.0625rem] leading-snug ${soft}`;
  const label = 'mb-1.5 block px-1 text-sm font-semibold text-slate-500';

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
    setTermsAccepted(false);
    setTermsChecked(false);
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

  const advanceAfterVerify = (existing: OuraCard | null) => {
    if (existing === null && !linkOnly) {
      setStep('terms');
      return;
    }
    const skipSelfie = existing !== null || !allowScan;
    setIdentityDone(skipSelfie);
    setStep(skipSelfie ? 'identity' : 'selfie');
  };

  const acceptTerms = () => {
    setTermsAccepted(true);
    setIdentityDone(!allowScan);
    setStep(allowScan ? 'selfie' : 'identity');
  };

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
      if (termsAccepted) void recordTermsAcceptance(testCode);
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
    if (!known && termsAccepted) void recordTermsAcceptance(saved.cardCode);
    onSaved(saved);
    onClose();
  };

  const stepIndex =
    step === 'choice' ? 0
    : step === 'identity' ? 4
    : step === 'selfie' ? 3
    : step === 'terms' ? 2
    : 1;

  const hasFace = Boolean(photo || knownPhotoPath || knownPhotoUrl);
  const canSave = known
    ? lastName.trim().length > 0
    : Boolean(firstName.trim() && lastName.trim() && hasFace && termsAccepted);

  const goBack = () => {
    setError(null);
    if (step === 'identity') {
      setStep(
        identityDone && allowScan && !known ? 'selfie'
        : !known && termsAccepted ? 'terms'
        : wasScanned ? 'scan' : 'manual',
      );
      return;
    }
    if (step === 'selfie') {
      setStep(!known && termsAccepted ? 'terms' : wasScanned ? 'scan' : 'manual');
      return;
    }
    if (step === 'terms') {
      setStep(wasScanned ? 'scan' : 'manual');
      return;
    }
    setStep('choice');
    if (!allowScan && step === 'manual') onClose();
  };

  const steps = [text.stepCard, text.stepTerms, text.stepIdentity, text.stepName];
  const humanStep = stepIndex <= 1 ? 1 : stepIndex;

  const isMobileOnly = Boolean((lookup || testCode) && linkOnly && !known);

  const primary = `w-full rounded-2xl py-4 text-[1.0625rem] font-semibold transition active:scale-[0.98] disabled:opacity-40 ${
    isLight ? 'bg-[#000000] text-[#ffffff]' : 'bg-[#ffffff] text-[#000000]'
  }`;

  const action = (() => {
    if (step === 'choice') return null;
    if (step === 'scan') {
      return (
        <button
          type="button"
          onClick={() => { setError(null); setStep('manual'); }}
          className={`w-full py-2 text-[0.9375rem] font-semibold underline underline-offset-4 ${strong}`}
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
    if (step === 'terms') {
      return (
        <button
          type="button"
          onClick={() => {
            if (!termsChecked) {
              setError(text.termsRequired);
              return;
            }
            setError(null);
            acceptTerms();
          }}
          disabled={!termsChecked}
          className={primary}
        >
          {terms.accept}
        </button>
      );
    }
    if (step === 'selfie') {
      return photoUrl ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPhoto(null)}
            className={`flex-1 rounded-2xl border py-4 text-[1.0625rem] font-semibold transition active:scale-[0.98] ${surface} ${strong}`}
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
          style={{ paddingTop: 'max(calc(var(--gl-safe-top) + 4px), 0.75rem)' }}
        >
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-[#141414] px-4 py-2 shadow-2xl">
            <CheckCircleIcon className="h-5 w-5 flex-shrink-0 text-emerald-400" />
            <span className="text-sm font-semibold text-white">{toast}</span>
          </div>
        </div>
      )}

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
        className={
          isScreen
            ? `fixed inset-0 z-[10002] flex flex-col overflow-hidden transition-opacity duration-300 ${
                isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
              } ${pageBg}`
            : isDialog
            ? `fixed left-1/2 top-1/2 z-[10002] flex max-h-[80vh] w-[min(30rem,calc(100vw-3rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border shadow-2xl transition-all duration-200 ${
                isOpen ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
              } ${isLight ? 'border-slate-200' : 'border-white/10'} ${pageBg}`
            : `fixed inset-x-0 bottom-0 top-8 z-[10002] flex flex-col overflow-hidden rounded-t-3xl border-t transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                isOpen ? 'translate-y-0' : 'translate-y-full'
              } ${isLight ? 'border-slate-200' : 'border-white/10'} ${pageBg}`
        }
        style={{
          pointerEvents: isOpen ? 'auto' : 'none',
          transform: !isDialog && !isScreen && dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: !isDialog && !isScreen && dragY > 0 ? 'none' : undefined,
          paddingTop: isScreen ? 'var(--gl-safe-top)' : undefined,
        }}
        aria-hidden={!isOpen}
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
                {step !== 'choice' && <div className={`truncate text-base font-bold ${strong}`}>{text.title}</div>}
                {step !== 'choice' && (
                  <div className="truncate text-xs font-semibold text-slate-500">
                    {text.stepOf} {humanStep}/{steps.length} · {steps[humanStep - 1]}
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

            {step !== 'choice' && (
              <div className="flex gap-1.5 px-4 pb-3" aria-hidden>
                {steps.map((label, index) => (
                  <div
                    key={label}
                    className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                      index < humanStep ? (isLight ? 'bg-[#000000]' : 'bg-[#ffffff]') : isLight ? 'bg-slate-200' : 'bg-white/10'
                    }`}
                  />
                ))}
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-hidden">
              <div
                className="flex h-full w-[500%] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
                style={{ transform: `translateX(-${(stepIndex * 100) / 5}%)` }}
              >
                <div className="h-full w-1/5 overflow-y-auto px-6 pb-8 pt-2">
                  <CreditCardIcon className={pageIcon} aria-hidden="true" />
                  <p className={pageTitle}>{text.choiceTitle}</p>
                  <p className={`${pageBody} mb-7`}>{text.choiceBody}</p>
                  {allowScan && (
                  <button
                    type="button"
                    onClick={() => { setError(null); setStep('scan'); }}
                    className={`mb-3 flex w-full items-center gap-4 rounded-2xl border px-4 py-4 text-left transition active:scale-[0.99] ${surface}`}
                  >
                    <CameraIcon className={`h-6 w-6 flex-shrink-0 ${strong}`} />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[1.0625rem] font-medium ${strong}`}>{text.scanTitle}</span>
                      <span className={`block truncate text-sm ${soft}`}>{text.scanHint}</span>
                    </span>
                    <ChevronRightIcon className={`h-5 w-5 flex-shrink-0 ${soft}`} />
                  </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { setError(null); setStep('manual'); }}
                    className={`flex w-full items-center gap-4 rounded-2xl border px-4 py-4 text-left transition active:scale-[0.99] ${surface}`}
                  >
                    <PencilSquareIcon className={`h-6 w-6 flex-shrink-0 ${strong}`} />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[1.0625rem] font-medium ${strong}`}>{text.manualTitle}</span>
                      <span className={`block truncate text-sm ${soft}`}>{text.manualHint}</span>
                    </span>
                    <ChevronRightIcon className={`h-5 w-5 flex-shrink-0 ${soft}`} />
                  </button>
                </div>

                <div className={`h-full w-1/5 ${step === 'scan' ? 'overflow-hidden' : 'overflow-y-auto px-6 pb-8 pt-2'}`}>
                  {step === 'scan' ? (
                    <>
                      <div className="relative h-full w-full overflow-hidden rounded-3xl bg-black">
                        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />

                        {frozenCard && (
                          <img src={frozenCard} alt="" className="absolute inset-0 h-full w-full object-cover" />
                        )}

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
                      <PencilSquareIcon className={pageIcon} aria-hidden="true" />
                      <p className={pageTitle}>{text.manualTitle}</p>
                      <p className={`${pageBody} mb-7`}>{text.manualHint}</p>
                      <label className={label}>{text.numberLabel}</label>
                      <input
                        value={code}
                        onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 12))}
                        inputMode="numeric"
                        enterKeyHint="go"
                        placeholder="0000000000"
                        className={`h-14 w-full rounded-2xl border px-4 text-base tabular outline-none ${focus} ${field}`}
                      />
                    </>
                  )}
                </div>

                <div className="h-full w-1/5 overflow-y-auto px-6 pb-8 pt-2">
                  <DocumentCheckIcon className={pageIcon} aria-hidden="true" />
                  <p className={pageTitle}>{terms.title}</p>
                  <p className={pageBody}>{terms.intro}</p>
                  {terms.sections.map(section => (
                    <section key={section.title} className="pt-6">
                      <p className={`text-[1.125rem] font-medium leading-tight ${strong}`}>{section.title}</p>
                      {section.paragraphs.map((paragraph, index) => (
                        <p key={index} className={`pt-2 text-[0.9375rem] leading-snug ${soft}`}>{paragraph}</p>
                      ))}
                    </section>
                  ))}
                  <label className={`mt-7 flex cursor-pointer items-start gap-3 rounded-2xl p-4 ${surface}`}>
                    <input
                      type="checkbox"
                      checked={termsChecked}
                      onChange={event => {
                        setTermsChecked(event.target.checked);
                        if (event.target.checked) setError(null);
                      }}
                      className="mt-0.5 h-5 w-5 flex-shrink-0 accent-[#ffffff]"
                    />
                    <span className={`text-[0.9375rem] leading-snug ${strong}`}>{terms.checkbox}</span>
                  </label>
                  <p className={`pt-4 text-center text-[0.8125rem] ${soft}`}>{terms.version}</p>
                </div>

                <div className="flex h-full w-1/5 flex-col overflow-hidden">
                  <div className="flex-shrink-0 px-6 pt-2">
                    <CameraIcon className={pageIcon} aria-hidden="true" />
                    <p className={pageTitle}>{text.selfieTitle}</p>
                    <p className={`${pageBody} mb-5`}>{text.selfieBody}</p>
                  </div>

                  <div className="relative min-h-0 w-full flex-1 bg-black">
                    {photoUrl ? (
                      <img src={photoUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <video
                        ref={selfieVideoRef}
                        playsInline
                        muted
                        className="h-full w-full object-cover"
                        style={{ transform: 'scaleX(-1)' }}
                      />
                    )}
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

                <div className="h-full w-1/5 overflow-y-auto px-6 pb-8 pt-2">
                  {isMobileOnly ? (
                    <div className="pt-2">
                      <CreditCardIcon className={pageIcon} aria-hidden="true" />
                      <p className={pageTitle}>{text.mobileOnlyTitle}</p>
                      <p className={pageBody}>{text.mobileOnlyBody}</p>
                    </div>
                  ) : (lookup || testCode) && (
                    <>
                      <UserCircleIcon className={pageIcon} aria-hidden="true" />
                      <p className={pageTitle}>
                        {known ? text.known : wasScanned ? text.yourInfo : text.fillInfo}
                      </p>
                      <p className={`${pageBody} mb-7`}>{text.nameBody}</p>

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
                                className={`mt-1.5 block text-sm font-semibold underline underline-offset-4 ${strong}`}
                              >
                                {text.selfieRetake}
                              </button>
                            )}
                          </span>
                        </div>
                      )}

                      {!known && (
                        <div className="mb-5">
                          <label className={label}>
                            {text.firstName} · {text.required}
                          </label>
                          <input
                            value={firstName}
                            onChange={event => setFirstName(event.target.value)}
                            placeholder={text.firstName}
                            className={`h-14 w-full rounded-2xl border px-4 text-base outline-none ${focus} ${field}`}
                          />
                        </div>
                      )}
                      <div className="mb-5">
                        <label className={label}>
                          {text.lastName} · {text.required}
                        </label>
                        <input
                          value={lastName}
                          onChange={event => setLastName(event.target.value.toUpperCase())}
                          placeholder={text.lastName}
                          style={{ textTransform: 'uppercase' }}
                          className={`h-14 w-full rounded-2xl border px-4 text-base outline-none ${focus} ${field}`}
                        />
                      </div>

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

            {step === 'selfie' && !photoUrl && (
              <p className="flex-shrink-0 px-5 pb-4 text-center text-sm leading-relaxed text-pretty text-slate-500">
                {text.selfieHint}
              </p>
            )}

            {(action || error) && (
              <div
                className={`flex-shrink-0 px-5 pt-4 ${pageBg}`}
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
