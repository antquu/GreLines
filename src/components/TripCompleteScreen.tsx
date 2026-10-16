import { useEffect, useState } from 'react';
import Confetti from 'react-confetti-boom';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircleIcon, XMarkIcon } from '@heroicons/react/24/solid';
import { LineBadge } from './LineBadge';
import { MapSheet, MapSheetBottomSpacer } from './MapSheet';
import type { TripAward } from '../services/greLinesPoints';
import { AVATARS, type Account } from '../services/account';
import { Avatars } from './navigation/GuidanceParts';
import { navPalette } from './navigation/palette';
import { tx } from '../i18n';

const CONFETTI_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ec4899', '#a855f7'];

interface TripCompleteScreenProps {
  isOpen: boolean;
  onClose: () => void;
  award: TripAward | null;
  showPoints?: boolean;
  language: 'fr' | 'en';
  theme?: 'light' | 'dark';
  account?: Account | null;
  photoUrl?: string | null;
  lines?: Array<{ label: string; color: string }>;
  origin?: string;
  destination?: string;
}

function stopLabel(value: string | undefined): string {
  return String(value ?? '').replace(/^[^,]+,\s*/, '');
}

export function TripCompleteScreen({
  isOpen,
  onClose,
  award,
  showPoints = true,
  language,
  theme = 'dark',
  lines = [],
  origin,
  destination,
}: TripCompleteScreenProps) {
  const isFr = language === 'fr';
  const t = tx(isFr).tripCompleteScreen;
  const isLight = theme === 'light';
  const palette = navPalette(isLight);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024);
  const open = isOpen && award !== null;
  const helpedFaces = award ? AVATARS.slice(0, Math.min(4, Math.max(1, award.travellersHelped))) : [];
  const surface = isLight ? '#ffffff' : isMobile ? 'rgb(var(--gl-sheet-rgb))' : '#0b0b0b';

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const content = award && (
    <div className={`px-6 pb-8 ${isMobile ? 'pt-4' : 'pt-7'}`}>
      <CheckCircleIcon className="h-12 w-12" style={{ color: palette.ink }} aria-hidden="true" />
      <p role="heading" aria-level={2} className="pt-6 text-[1.625rem] font-medium leading-[1.15]" style={{ color: palette.ink }}>
        {t.tripComplete}
      </p>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1.5 pt-3 text-[1.0625rem] leading-snug" style={{ color: palette.soft }}>
        <span>
          {stopLabel(origin) || t.start} · {stopLabel(destination) || t.arrival}
        </span>
        {lines.map((line, index) => (
          <LineBadge key={`${line.label}-${index}`} line={{ id: line.label, shortName: line.label, color: line.color }} size="xs" />
        ))}
      </p>

      <div className="mt-6 border-t" style={{ borderColor: palette.rule }}>
        <div className="flex items-center gap-3 border-b py-4" style={{ borderColor: palette.rule }}>
          <Avatars faces={helpedFaces} />
          <p className="min-w-0 flex-1 text-[1.0625rem] leading-snug" style={{ color: palette.ink }}>
            <span className="font-semibold tabular-nums">{award.travellersHelped}</span> {t.travellersInformed(award.travellersHelped)}
          </p>
        </div>
        {showPoints && (
          <div className="flex items-baseline justify-between gap-3 border-b py-4" style={{ borderColor: palette.rule }}>
            <span className="text-[1.0625rem]" style={{ color: palette.ink }}>
              GreLines Points
            </span>
            <span className="text-right">
              <span className="block text-[1.375rem] font-medium tabular-nums" style={{ color: palette.ink }}>
                +{award.points}
              </span>
              <span className="block text-[0.9375rem] tabular-nums" style={{ color: palette.soft }}>
                {t.pointsPointsInTotal(award.total.points)}
              </span>
            </span>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onClose}
        className="mt-8 w-full rounded-2xl py-4 text-[1.0625rem] font-semibold transition active:scale-[0.98]"
        style={isLight ? { backgroundColor: '#000000', color: '#ffffff' } : { backgroundColor: '#ffffff', color: '#000000' }}
      >
        {t.close}
      </button>
    </div>
  );

  const confetti =
    open &&
    createPortal(
      <div className="pointer-events-none fixed inset-0 z-[10080]">
        <Confetti mode="fall" particleCount={80} shapeSize={12} colors={CONFETTI_COLORS} fadeOutHeight={0.9} />
      </div>,
      document.body,
    );

  if (isMobile) {
    return (
      <>
        {confetti}
        <MapSheet isOpen={open} onClose={onClose} isLight={isLight} zIndex={10070} initialSnap={2}>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            {content}
            <MapSheetBottomSpacer />
          </div>
        </MapSheet>
      </>
    );
  }

  return (
    <>
      {confetti}
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              key="trip-complete"
              className="fixed inset-0 z-[10070] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.4, ease: 'easeOut' } }}
              onClick={onClose}
            >
              <motion.div
                className={`relative w-full max-w-sm rounded-3xl border shadow-2xl ${isLight ? 'border-slate-200' : 'border-white/10'}`}
                style={{ backgroundColor: surface }}
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.4, ease: 'easeOut' } }}
                onClick={event => event.stopPropagation()}
              >
                <div className="max-h-[85vh] overflow-y-auto overflow-x-hidden rounded-3xl">{content}</div>
                <button
                  onClick={onClose}
                  className="absolute right-3 top-3 rounded-full bg-black/30 p-1.5 hover:bg-black/50"
                  style={{ color: '#ffffff' }}
                  aria-label={t.close}
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
