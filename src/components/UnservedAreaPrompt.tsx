import { AnimatePresence, motion } from 'framer-motion';
import { MapPinIcon } from '@heroicons/react/24/solid';
import { useEffect, useRef, useState } from 'react';
import { IS_NANCY } from '../site';
import { CITIES } from '../utils/cities';
import { haversineMeters } from '../utils/geo';
import { onDevCommand } from '../utils/devCommands';
import { tx } from '../i18n';

const SERVED_RADIUS_METERS = 40_000;
const SETTLE_MS = 1000;
const MOVE_METERS = 300;

function isServed(point: { lat: number; lon: number }): boolean {
  return CITIES.some(city => haversineMeters(point.lat, point.lon, city.lat, city.lon) <= SERVED_RADIUS_METERS);
}

export function UnservedAreaPrompt({
  position,
  isMobile,
  language,
  theme = 'dark',
}: {
  position: { lat: number; lon: number } | null;
  isMobile: boolean;
  language: 'fr' | 'en';
  theme?: 'light' | 'dark';
}) {
  const [dismissed, setDismissed] = useState(false);
  const [forced, setForced] = useState(false);
  const [settled, setSettled] = useState<{ lat: number; lon: number } | null>(null);
  const settledRef = useRef(settled);
  settledRef.current = settled;

  useEffect(() => {
    if (!position) return;
    const last = settledRef.current;
    if (last && haversineMeters(last.lat, last.lon, position.lat, position.lon) < MOVE_METERS) return;
    setSettled(null);
    const timer = window.setTimeout(() => {
      setSettled(position);
      setDismissed(false);
    }, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [position?.lat, position?.lon]);

  useEffect(() => {
    if (IS_NANCY) return;
    return onDevCommand('show.unserved', () => {
      setDismissed(false);
      setForced(true);
    });
  }, []);

  if (IS_NANCY) return null;

  const open = forced || (!dismissed && settled !== null && !isServed(settled));

  const isFr = language === 'fr';
  const isLight = theme === 'light';
  const ink = isLight ? '#000000' : '#ffffff';
  const soft = isLight ? '#525252' : '#a3a3a3';
  const surface = isLight ? '#ffffff' : isMobile ? 'rgb(var(--gl-sheet-rgb))' : '#0b0b0b';

  const close = () => {
    setForced(false);
    setDismissed(true);
  };

  const content = (
    <div className={`px-6 ${isMobile ? 'pt-7' : 'pt-7 pb-8'}`}>
      <MapPinIcon className="h-12 w-12" style={{ color: ink }} aria-hidden="true" />
      <p role="heading" aria-level={2} className="pt-6 text-[1.625rem] font-medium leading-[1.15]" style={{ color: ink }}>
        {tx(isFr).unservedAreaPrompt.areaNotCoveredYet}
      </p>
      <p className="pt-3 text-[1.0625rem] leading-snug" style={{ color: soft }}>
        {tx(isFr).unservedAreaPrompt.grelinesDoesNotShow}
      </p>
      <p className="pt-3 text-[1.0625rem] leading-snug" style={{ color: soft }}>
        {tx(isFr).unservedAreaPrompt.newCitiesAreAdded}
      </p>
      <button
        type="button"
        onClick={close}
        className="mt-8 block w-full rounded-2xl py-4 text-center text-[1.0625rem] font-semibold transition active:scale-[0.98]"
        style={isLight ? { backgroundColor: '#000000', color: '#ffffff' } : { backgroundColor: '#ffffff', color: '#000000' }}
      >
        {tx(isFr).unservedAreaPrompt.continue}
      </button>
    </div>
  );

  if (isMobile) {
    return (
      <AnimatePresence>
        {open && (
          <motion.div
            key="unserved-area"
            className="fixed inset-0 z-[10050] flex flex-col justify-end bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
            onClick={close}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              className={`mx-2 mb-2 overflow-hidden border ${isLight ? 'border-slate-200' : 'border-white/10'}`}
              style={{
                backgroundColor: surface,
                borderRadius: 30,
                paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)',
              }}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'tween', duration: 0.38, ease: [0.32, 0.72, 0, 1] }}
              onClick={event => event.stopPropagation()}
            >
              {content}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="unserved-area"
          className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.4, ease: 'easeOut' } }}
          onClick={close}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            className={`w-full max-w-sm overflow-hidden rounded-3xl border shadow-2xl ${isLight ? 'border-slate-200' : 'border-white/10'}`}
            style={{ backgroundColor: surface }}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.4, ease: 'easeOut' } }}
            onClick={event => event.stopPropagation()}
          >
            {content}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
