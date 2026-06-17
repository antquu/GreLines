import { motion } from 'framer-motion';
import { Sheet } from 'react-modal-sheet';
import { XMarkIcon, MapPinIcon } from '@heroicons/react/24/solid';
import type { Stop } from '../types';
import type { AddressResult } from '../services/geocoding';
import { findClosestStops, formatDistance } from '../utils/geo';
import { useMemo } from 'react';

interface AddressSidebarProps {
  address: AddressResult | null;
  stops: Stop[];
  isOpen: boolean;
  onClose: () => void;
  onStopClick: (stop: Stop) => void;
  isMobile: boolean;
  language: 'fr' | 'en';
}

const getText = (language: 'fr' | 'en') => ({
  nearbyStops: language === 'fr' ? 'Arrêts à proximité' : 'Nearby stops',
  noStops: language === 'fr' ? 'Aucun arrêt à proximité' : 'No stops nearby',
});

/**
 * Stop card — same visual language as the departure cards in `Sidebar.tsx`.
 */
const StopCard = ({
  stop,
  meters,
  onClick,
  language,
  delay,
}: {
  stop: Stop;
  meters: number;
  onClick: () => void;
  language: 'fr' | 'en';
  delay: number;
}) => (
  <motion.button
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    onClick={onClick}
    className="w-full text-left flex items-center justify-between gap-3 p-4 rounded-2xl border border-slate-700 bg-slate-800 hover:bg-slate-750 active:bg-slate-700 transition"
  >
    <div className="flex items-center gap-3 flex-1 min-w-0">
      <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-300 flex-shrink-0">
        <MapPinIcon className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white truncate">{stop.name}</p>
        {stop.city && (
          <p className="text-xs text-slate-400 truncate mt-0.5">{stop.city}</p>
        )}
      </div>
    </div>
    <span className="text-sm font-mono font-semibold text-slate-300 flex-shrink-0">
      {formatDistance(meters, language)}
    </span>
  </motion.button>
);

export const AddressSidebar = ({
  address,
  stops,
  isOpen,
  onClose,
  onStopClick,
  isMobile,
  language,
}: AddressSidebarProps) => {
  const text = getText(language);

  const nearbyStops = useMemo(() => {
    if (!address) return [];
    return findClosestStops(stops, address.lat, address.lon, 8);
  }, [address, stops]);

  if (!address) return null;

  // ── Desktop sidebar — matches Sidebar.tsx layout ────────────────────────
  if (!isMobile) {
    return (
      <motion.div
        initial={{ x: -420, opacity: 0 }}
        animate={{ x: isOpen ? 0 : -420, opacity: isOpen ? 1 : 0 }}
        exit={{ x: -420, opacity: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="fixed left-0 top-0 h-screen w-96 bg-slate-900 border-r border-slate-800 shadow-2xl z-60 overflow-y-auto"
      >
        <div className="p-6 pb-10">
          <div className="flex items-start justify-between mb-6 pt-1">
            <div className="flex-1 min-w-0 pr-3">
              <h2 className="text-3xl font-extrabold text-white leading-tight">{address.name}</h2>
              {address.context && (
                <p className="text-sm text-slate-400 mt-1">{address.context}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center bg-slate-800 border border-slate-700 rounded-full hover:bg-slate-700 transition flex-shrink-0"
            >
              <XMarkIcon className="w-4 h-4 text-white" />
            </button>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              {text.nearbyStops}
            </h3>
            {nearbyStops.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">{text.noStops}</p>
            ) : (
              <div className="space-y-2">
                {nearbyStops.map(({ stop, meters }, idx) => (
                  <StopCard
                    key={stop.id}
                    stop={stop}
                    meters={meters}
                    onClick={() => onStopClick(stop)}
                    language={language}
                    delay={idx * 0.04}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  // ── Mobile bottom sheet (react-modal-sheet) ──────────────────────────────
  return (
    <Sheet
      style={{ zIndex: 100 }}
      isOpen={isOpen}
      onClose={onClose}
      snapPoints={[0, 0.6, 1]}
      initialSnap={2}
    >
      <Sheet.Container style={{ borderRadius: '24px 24px 0 0', backgroundColor: '#0f172a', zIndex: 100 }}>
        <Sheet.Header />
        <Sheet.Content disableDrag={state => state.scrollPosition !== 'top'}>
          <div className="overflow-y-auto flex-1 px-5 pb-8">
            {/* Header */}
            <div className="flex items-start justify-between pt-2 pb-4">
              <div className="flex-1 min-w-0 pr-3">
                <h2 className="text-2xl font-extrabold text-white leading-tight">{address.name}</h2>
                {address.context && (
                  <p className="text-sm text-slate-400 mt-0.5">{address.context}</p>
                )}
              </div>
              <button
                onClick={onClose}
                className="w-9 h-9 flex items-center justify-center bg-slate-800 border border-slate-700 rounded-full hover:bg-slate-700 transition flex-shrink-0 mt-0.5"
              >
                <XMarkIcon className="w-4 h-4 text-white" />
              </button>
            </div>

            {/* Nearby stops */}
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                {text.nearbyStops}
              </h3>
              {nearbyStops.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">{text.noStops}</p>
              ) : (
                <div className="space-y-2.5">
                  {nearbyStops.map(({ stop, meters }, idx) => (
                    <StopCard
                      key={stop.id}
                      stop={stop}
                      meters={meters}
                      onClick={() => onStopClick(stop)}
                      language={language}
                      delay={idx * 0.04}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </Sheet.Content>
      </Sheet.Container>
      <Sheet.Backdrop onTap={onClose} style={{ zIndex: 99 }} />
    </Sheet>
  );
};