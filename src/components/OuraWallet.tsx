import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowsRightLeftIcon, CameraIcon, ChevronRightIcon, EllipsisVerticalIcon, PencilSquareIcon, IdentificationIcon, PlusIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/solid';
import { OuraCardFace } from './OuraCardFace';
import { ControllerView } from './ControllerView';
import { NotificationDetail } from './NotificationDetail';
import { GreenerBanner } from './GreenerBanner';
import { formatNotificationDay } from '../utils/notificationDay';
import { scanCard, toCanvas } from '../services/cardOcr';
import { cardStatusCode, cardStatusLabel, cardStatusSentence } from '../utils/cardStatus';
import {
  deleteOuraCard,
  findKnownCard,
  listNotifications,
  listOuraCards,
  lookupOuraCard,
  transferCard,
  type OuraCard,
  type OuraNotification,
} from '../services/ouraCard';
import { tx } from '../i18n';

interface OuraWalletProps {
  cards: OuraCard[];
  language: 'fr' | 'en';
  theme?: 'light' | 'dark';
  onAddCard: () => void;
  onCardsChange: (cards: OuraCard[]) => void;
  onFocusChange?: (focused: boolean) => void;
  disabled?: boolean;
  variant?: 'screen' | 'panel';
}

const STACK_OFFSET = 34;

const PEEK_HEIGHT = 54;

const STACK_STEP = 16;

function stackHeight(count: number): number {
  return count > 0 ? PEEK_HEIGHT + (count - 1) * STACK_STEP : 0;
}

const FRONT_TOP = 0;

function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function isCardValid(card: OuraCard): boolean {
  if (card.isDisabled) return false;
  if (card.isBlacklisted) return false;
  if (card.isExpired) return false;
  const end = card.contractEndingAt ?? card.expiresAt;
  if (end && new Date(end).getTime() < Date.now()) return false;
  return true;
}

export function OuraWallet({
  cards,
  language,
  theme = 'dark',
  onAddCard,
  onCardsChange,
  onFocusChange,
  disabled,
  variant = 'screen',
}: OuraWalletProps) {
  const isPanel = variant === 'panel';
  const VH = isPanel ? '100cqh' : '100vh';
  const SAFE_TOP = isPanel ? '0px' : 'var(--gl-safe-top)';
  const CARD_INSET = isPanel ? 'inset-x-6' : 'inset-x-4';
  const titleSize = isPanel ? 'text-[1.5rem]' : 'text-[2rem]';
  const nameSize = isPanel ? 'text-[1.125rem]' : 'text-[1.5rem]';
  const bodySize = isPanel ? 'text-[0.875rem]' : 'text-base';
  const metaSize = isPanel ? 'text-[0.8125rem]' : 'text-sm';
  const noticeSize = isPanel ? 'text-[1.0625rem]' : 'text-[1.375rem]';
  const isFr = language === 'fr';
  const isLight = theme === 'light';
  const cardShadow = isLight
    ? 'shadow-[0_10px_28px_rgba(15,23,42,0.10)]'
    : 'shadow-2xl';

  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [controllerCard, setControllerCard] = useState<OuraCard | null>(null);
  const [notifications, setNotifications] = useState<OuraNotification[]>([]);
  const [openNotification, setOpenNotification] = useState<OuraNotification | null>(null);
  const [entered, setEntered] = useState(false);
  const [transferFrom, setTransferFrom] = useState<OuraCard | null>(null);
  const [transferCode, setTransferCode] = useState('');
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferStep, setTransferStep] = useState<'choice' | 'scan' | 'manual'>('choice');
  const transferVideoRef = useRef<HTMLVideoElement | null>(null);
  const transferStreamRef = useRef<MediaStream | null>(null);

  const stopTransferCamera = () => {
    transferStreamRef.current?.getTracks().forEach(track => track.stop());
    transferStreamRef.current = null;
  };

  useEffect(() => {
    if (transferStep !== 'scan' || !transferFrom) {
      stopTransferCamera();
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
        transferStreamRef.current = stream;
        if (transferVideoRef.current) {
          transferVideoRef.current.srcObject = stream;
          void transferVideoRef.current.play();
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTransferError(text.transferCamera);
          setTransferStep('manual');
        }
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transferStep, transferFrom]);

  const text = {
    empty: tx(isFr).ouraWallet.noOuraCardSet,
    add: tx(isFr).ouraWallet.addACard,
    unavailable: tx(isFr).ouraWallet.unavailableOffline,
    remove: tx(isFr).ouraWallet.removeTheCard,
    transfer: tx(isFr).ouraWallet.transferToANew,
    transferHint: tx(isFr).ouraWallet.newCardNumber,
    transferDo: tx(isFr).ouraWallet.transfer,
    transferFailed: tx(isFr).ouraWallet.thisNumberWasNot,
    transferBusy: tx(isFr).ouraWallet.transferring,
    transferScan: tx(isFr).ouraWallet.scanTheNewCard,
    transferManual: tx(isFr).ouraWallet.enterTheNumber,
    transferReading: tx(isFr).ouraWallet.readingTheCard,
    transferCamera: tx(isFr).ouraWallet.theCameraIsUnavailable,
    transferExplain: tx(isFr).ouraWallet.yourNameAndPhoto,
    controller: tx(isFr).ouraWallet.inspector,
    more: tx(isFr).ouraWallet.moreActions,
    close: tx(isFr).ouraWallet.collapse,
    born: tx(isFr).ouraWallet.bornOn,
    disabled: tx(isFr).ouraWallet.cardDisabled,
    removeFromWallet: tx(isFr).ouraWallet.removeTheCard,

    notifications: tx(isFr).ouraWallet.latestNotifications,
  };

  const safeIndex = openIndex !== null && openIndex < cards.length ? openIndex : null;
  const focusedCode = safeIndex !== null ? cards[safeIndex].cardCode : null;
  const shownNotifications = focusedCode ? notifications : [];

  useEffect(() => {
    if (safeIndex === null) return;
    const frame = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(frame);
  }, [safeIndex]);

  useEffect(() => {
    if (!focusedCode) return;
    let active = true;
    void listNotifications(focusedCode).then(list => {
      if (active) setNotifications(list);
    });
    return () => { active = false; };
  }, [focusedCode]);

  const columnRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    columnRef.current?.scrollTo({ top: 0 });
  }, [focusedCode]);

  const focus = (index: number | null) => {
    if (index === null) setEntered(false);
    setOpenIndex(index);
    setIsMenuOpen(false);
    onFocusChange?.(index !== null);
  };

  if (cards.length === 0) {
    return (
      <div className="relative">
        <OuraCardFace forceFront className="opacity-40" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <XMarkIcon className="h-12 w-12 text-white drop-shadow" />
          <p className="px-6 text-center text-sm font-semibold text-white drop-shadow">
            {disabled ? text.unavailable : text.empty}
          </p>
          {!disabled && (
            <button
              type="button"
              onClick={onAddCard}
              className="flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-lg transition active:scale-95"
            >
              <PlusIcon className="h-4 w-4" />
              {text.add}
            </button>
          )}
        </div>
      </div>
    );
  }

  const opened = safeIndex !== null ? cards[safeIndex] : null;
  const others = safeIndex === null ? [] : cards.filter((_, index) => index !== safeIndex);
  const statusSentence = opened ? cardStatusSentence(opened, language) : null;

  const detailContent = opened ? (
    <>
          {statusSentence ? (
            <div className="contents">
              <div className={`${titleSize} font-semibold leading-none ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {text.disabled}
              </div>
              <div className={`mt-3 ${bodySize} leading-snug text-slate-500`}>{statusSentence}</div>
              {cardStatusCode(opened) && (
                <div className={`mt-2 ${metaSize} tabular text-slate-500`}>{cardStatusCode(opened)}</div>
              )}
            </div>
          ) : (
            <>
              <div className={`${titleSize} font-semibold leading-none ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {opened.firstName}
              </div>
              <div className={`mt-1 ${nameSize} font-bold leading-none ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {opened.lastName}
              </div>
              <div className={`mt-3 ${metaSize} tabular text-slate-500`}>{opened.cardCode}</div>
              {opened.birthDate && (
                <div className={`mt-1 ${metaSize} text-slate-500`}>
                  {text.born} {formatDate(opened.birthDate)}
                </div>
              )}
              {opened.contractLabel && (
                <div className={`mt-1 ${metaSize} text-slate-500`}>{opened.contractLabel}</div>
              )}
            </>
          )}

          <div className={isPanel ? 'mt-5' : 'mt-8'}>
            <GreenerBanner language={language} />
          </div>

          {shownNotifications.length > 0 && !statusSentence && (
          <>
          <h3
            className={`${isPanel ? 'mt-5' : 'mt-8'} ${noticeSize} font-bold leading-none ${
              isLight ? 'text-slate-900' : 'text-white'
            }`}
          >
            {text.notifications}
          </h3>

          <div
            className="pointer-events-auto mt-3 pb-2"
          >
            <div
              className={`overflow-hidden rounded-2xl ${
                isLight ? 'bg-slate-200/60' : 'bg-white/5'
              }`}
            >
                {shownNotifications.map((notification, index) => (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => setOpenNotification(notification)}
                    className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition active:bg-white/5 ${
                      index > 0 ? (isLight ? 'border-t border-slate-300/60' : 'border-t border-white/5') : ''
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[0.95rem] font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        {notification.title}
                      </span>
                      {notification.body && (
                        <span className="mt-0.5 block line-clamp-2 text-sm text-slate-500">
                          {notification.body}
                        </span>
                      )}
                      <span className="mt-0.5 block text-sm capitalize text-slate-500">
                        {formatNotificationDay(notification.createdAt, language)}
                      </span>
                    </span>
                    <ChevronRightIcon className="mt-1 h-4 w-4 flex-shrink-0 text-slate-500" />
                  </button>
                ))}
            </div>
          </div>
          </>
          )}
    </>
  ) : null;

  return (
    <div>
      {safeIndex === null ? (
        <div className="relative" style={{ paddingBottom: (cards.length - 1) * STACK_OFFSET }}>
          {cards.map((card, index) => (
            <button
              key={card.id}
              type="button"
              onClick={() => focus(index)}
              className="absolute left-0 right-0 block w-full text-left transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.99]"
              style={{ top: index * STACK_OFFSET, zIndex: index }}
            >
              <OuraCardFace
                firstName={card.firstName}
                lastName={card.lastName}
                cardCode={card.cardCode}
                expiresAt={card.expiresAt}
                photoUrl={card.photoUrl}
                valid={isCardValid(card)}
                disabled={card.isDisabled}
                statusLabel={cardStatusLabel(card, language)}
                shadowClassName={cardShadow}
              />
            </button>
          ))}
          <div className="invisible">
            <OuraCardFace forceFront />
          </div>
        </div>
      ) : (
        <div
          className={`${isPanel ? 'absolute' : 'fixed'} inset-0 z-[6]`}
          style={{ pointerEvents: 'none', containerType: isPanel ? 'size' : undefined }}
        >
          {others.map((card, rank) => {
            const y = entered
              ? `calc(${VH} - ${stackHeight(others.length - rank)}px)`
              : `calc(${SAFE_TOP} + ${FRONT_TOP + (rank + 1) * STACK_OFFSET}px)`;

            return (
              <button
                key={card.id}
                type="button"
                onClick={() => focus(cards.findIndex(entry => entry.id === card.id))}
                className={`absolute ${CARD_INSET} block origin-top text-left`}
                style={{
                  transform: `translateY(${y})`,
                  transition: 'transform 420ms cubic-bezier(0.32,0.72,0,1)',
                  zIndex: rank + 1,
                  pointerEvents: 'auto',
                }}
                aria-label={card.cardCode}
              >
                <OuraCardFace
                  firstName={card.firstName}
                  lastName={card.lastName}
                  cardCode={card.cardCode}
                  expiresAt={card.expiresAt}
                  photoUrl={card.photoUrl}
                  disabled={card.isDisabled}
                  statusLabel={cardStatusLabel(card, language)}
                  shadowClassName={cardShadow}
                />
              </button>
            );
          })}

          {opened && (
            <div
              ref={columnRef}
              className="scrollbar-hide absolute inset-0 overflow-y-auto overflow-x-hidden overscroll-contain"
              style={{ pointerEvents: 'auto', zIndex: 0 }}
            >
              <div
                className="gl-stagger"
                style={{
                  paddingTop: `calc(${SAFE_TOP} + ${FRONT_TOP}px)`,
                  paddingBottom: stackHeight(Math.max(0, cards.length - 1)) + 16,
                }}
              >
                <div className={isPanel ? 'px-3' : 'px-1.5'}>
                  <motion.button
                    key={opened.id}
                    type="button"
                    onClick={() => focus(null)}
                    className="block w-full text-left"
                    aria-label={text.close}
                    initial={{ y: 56, scale: 0.88, opacity: 0 }}
                    animate={{ y: 0, scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 34 }}
                  >
                    <OuraCardFace
                      firstName={opened.firstName}
                      lastName={opened.lastName}
                      cardCode={opened.cardCode}
                      expiresAt={opened.expiresAt}
                      photoUrl={opened.photoUrl}
                      valid={isCardValid(opened)}
                      disabled={opened.isDisabled}
                      statusLabel={cardStatusLabel(opened, language)}
                      shadowClassName={cardShadow}
                    />
                  </motion.button>
                </div>

                <div className={isPanel ? 'mt-4 px-8' : 'mt-4 px-5'}>
                {opened.isMissing && (
                  <div className="mb-4 flex justify-center">
                    <button
                      type="button"
                      onClick={async () => {
                        await deleteOuraCard(opened.cardCode);
                        onCardsChange(cards.filter(card => card.id !== opened.id));
                        focus(null);
                      }}
                      className="rounded-2xl bg-rose-600 px-5 py-3 text-sm font-bold text-white shadow-2xl transition active:scale-95"
                    >
                      {text.removeFromWallet}
                    </button>
                  </div>
                )}

                <div className="flex flex-col">{detailContent}</div>
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {safeIndex !== null && (
        <>
          {isMenuOpen && (
            <div
              className="fixed inset-0 z-[10003]"
              onClick={() => setIsMenuOpen(false)}
              aria-hidden
            />
          )}
          <div
            className="fixed bottom-0 right-0 z-[10004] flex flex-col items-end gap-2 px-4"
            style={{
              paddingBottom: `calc(max(env(safe-area-inset-bottom), 1rem) + ${stackHeight(others.length)}px)`,
            }}
          >
            {isMenuOpen && opened && (
              <div
                className={`gl-rise w-64 origin-bottom-right overflow-hidden rounded-2xl border shadow-2xl ${
                  isLight ? 'border-slate-200 bg-white' : 'border-slate-800 bg-slate-900'
                }`}
              >
                {!opened.isMissing && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    setControllerCard(opened);
                  }}
                  className={`flex w-full items-center gap-3 px-4 py-4 text-left transition active:bg-blue-500/10 ${
                    isLight ? 'text-slate-900' : 'text-white'
                  }`}
                >
                  <IdentificationIcon className="h-5 w-5 flex-shrink-0 text-blue-500" />
                  <span className="text-[0.95rem] font-semibold">{text.controller}</span>
                </button>
                )}
                {!opened.isMissing && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    setTransferCode('');
                    setTransferError(null);
                    setTransferStep('choice');
                    setTransferFrom(opened);
                  }}
                  className={`flex w-full items-center gap-3 border-t px-4 py-4 text-left transition active:bg-blue-500/10 ${
                    isLight ? 'border-slate-200 text-slate-900' : 'border-slate-800 text-white'
                  }`}
                >
                  <ArrowsRightLeftIcon className="h-5 w-5 flex-shrink-0 text-blue-500" />
                  <span className="text-[0.95rem] font-semibold">{text.transfer}</span>
                </button>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await deleteOuraCard(opened.cardCode);
                    if (!ok) return;
                    onCardsChange(cards.filter(card => card.id !== opened.id));
                    focus(null);
                  }}
                  className={`flex w-full items-center gap-3 border-t px-4 py-4 text-left text-rose-400 transition active:bg-rose-500/10 ${
                    isLight ? 'border-slate-200' : 'border-slate-800'
                  }`}
                >
                  <TrashIcon className="h-5 w-5 flex-shrink-0" />
                  <span className="text-[0.95rem] font-semibold">{text.remove}</span>
                </button>
              </div>
            )}

            <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => focus(null)}
              className={`flex h-12 w-12 items-center justify-center rounded-full border shadow-2xl transition active:scale-90 ${
                isLight
                  ? 'border-slate-200 bg-white text-slate-700'
                  : 'border-slate-800 bg-slate-900 text-slate-200'
              }`}
              aria-label={text.close}
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={() => setIsMenuOpen(open => !open)}
              className={`flex h-12 w-12 items-center justify-center rounded-full border shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-90 ${
                isMenuOpen ? 'rotate-90 scale-110' : 'rotate-0'
              } ${
                isLight
                  ? 'border-slate-200 bg-white text-slate-700'
                  : 'border-slate-800 bg-slate-900 text-slate-200'
              }`}
              aria-label={text.more}
              aria-expanded={isMenuOpen}
            >
              <EllipsisVerticalIcon className="h-6 w-6" />
            </button>
            </div>
          </div>
        </>
      )}

      <div
        className={`fixed inset-0 z-[10005] bg-black/50 transition-opacity duration-300 ${
          transferFrom ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setTransferFrom(null)}
        aria-hidden
      />
      <div
        className={`fixed inset-x-0 bottom-0 top-8 z-[10006] overflow-y-auto rounded-t-3xl border-t px-4 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          transferFrom ? 'translate-y-0' : 'translate-y-full'
        } ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950'}`}
        style={{
          pointerEvents: transferFrom ? 'auto' : 'none',
          paddingBottom: 'max(env(safe-area-inset-bottom), 2rem)',
        }}
        aria-hidden={!transferFrom}
      >
        <div className="flex justify-center pb-3 pt-3">
          <span
            aria-hidden
            className={`h-1.5 w-12 rounded-full ${isLight ? 'bg-slate-300' : 'bg-white/20'}`}
          />
        </div>

        <p className={`mb-1 text-base font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
          {text.transfer}
        </p>
        <p className="mb-4 text-sm leading-snug text-slate-500">{text.transferExplain}</p>

        {transferStep === 'choice' && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => { setTransferError(null); setTransferStep('scan'); }}
              className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-4 text-left transition active:scale-[0.99] ${
                isLight ? 'border-slate-200 bg-white' : 'border-slate-800 bg-slate-900'
              }`}
            >
              <CameraIcon className="h-5 w-5 flex-shrink-0 text-blue-500" />
              <span className={`text-[0.95rem] font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {text.transferScan}
              </span>
            </button>
            <button
              type="button"
              onClick={() => { setTransferError(null); setTransferStep('manual'); }}
              className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-4 text-left transition active:scale-[0.99] ${
                isLight ? 'border-slate-200 bg-white' : 'border-slate-800 bg-slate-900'
              }`}
            >
              <PencilSquareIcon className="h-5 w-5 flex-shrink-0 text-blue-500" />
              <span className={`text-[0.95rem] font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {text.transferManual}
              </span>
            </button>
          </div>
        )}

        {transferStep === 'scan' && (
          <>
            <div className="relative overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: '1024 / 630' }}>
              <video ref={transferVideoRef} playsInline muted className="h-full w-full object-cover" />
              <div className="pointer-events-none absolute inset-3 rounded-xl border-2 border-white/70" />
              {transferBusy && (
                <>
                  <div className="gl-scanning absolute inset-0 bg-black" />
                  <div className="absolute inset-0 flex items-end justify-center pb-3">
                    <span className="text-sm font-semibold text-white drop-shadow">
                      {text.transferReading}
                    </span>
                  </div>
                </>
              )}
            </div>
            <button
              type="button"
              disabled={transferBusy}
              onClick={async () => {
                const video = transferVideoRef.current;
                if (!video || !video.videoWidth || !transferFrom) return;
                setTransferBusy(true);
                setTransferError(null);
                const canvas = toCanvas(video, video.videoWidth, video.videoHeight);
                stopTransferCamera();
                try {
                  const result = await scanCard(canvas);
                  if (!result.cardCode) {
                    setTransferBusy(false);
                    setTransferError(text.transferFailed);
                    setTransferStep('manual');
                    return;
                  }
                  setTransferCode(result.cardCode);
                  setTransferBusy(false);
                  setTransferStep('manual');
                } catch {
                  setTransferBusy(false);
                  setTransferError(text.transferFailed);
                  setTransferStep('manual');
                }
              }}
              className="mt-4 w-full rounded-2xl bg-blue-600 py-3.5 text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-50"
            >
              {transferBusy ? text.transferReading : text.transferScan}
            </button>
          </>
        )}

        {transferStep === 'manual' && (
          <>
            <input
              value={transferCode}
              onChange={event => setTransferCode(event.target.value.replace(/\D/g, '').slice(0, 12))}
              inputMode="numeric"
              enterKeyHint="go"
              placeholder={text.transferHint}
              className={`h-14 w-full rounded-2xl border px-4 text-base tabular outline-none focus:border-blue-500 ${
                isLight ? 'border-slate-200 bg-white text-slate-900' : 'border-slate-800 bg-slate-900 text-white'
              }`}
            />
            <button
              type="button"
              disabled={transferBusy || transferCode.length < 8}
              onClick={async () => {
                if (!transferFrom) return;
                setTransferBusy(true);
                setTransferError(null);
                const found = await lookupOuraCard(transferCode);
                const known = found ? null : await findKnownCard(transferCode);
                if (!found && !known?.isTest) {
                  setTransferBusy(false);
                  setTransferError(text.transferFailed);
                  return;
                }
                const moved = await transferCard(
                  transferFrom.cardCode,
                  found ?? { testCode: known!.cardCode },
                );
                setTransferBusy(false);
                if (!moved) {
                  setTransferError(text.transferFailed);
                  return;
                }
                const refreshed = await listOuraCards();
                onCardsChange(refreshed);
                setTransferFrom(null);
                focus(null);
              }}
              className="mt-4 w-full rounded-2xl bg-blue-600 py-3.5 text-sm font-bold text-white transition active:scale-[0.98] disabled:opacity-50"
            >
              {transferBusy ? text.transferBusy : text.transferDo}
            </button>
          </>
        )}

        {transferError && (
          <p className="mt-2 text-sm font-semibold text-rose-400">{transferError}</p>
        )}
      </div>

      <NotificationDetail
        variant={isPanel ? 'dialog' : 'screen'}
        notification={openNotification}
        language={language}
        theme={theme}
        onClose={() => setOpenNotification(null)}
      />

      <ControllerView
        card={controllerCard}
        language={language}
        theme={theme}
        onClose={() => setControllerCard(null)}
      />
    </div>
  );
}
