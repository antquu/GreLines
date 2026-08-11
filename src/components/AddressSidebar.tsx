import { motion } from 'framer-motion';
import { Sheet } from 'react-modal-sheet';
import { XMarkIcon } from '@heroicons/react/24/solid';
import type { Stop } from '../types';
import type { AddressResult } from '../services/geocoding';
import { findClosestStops, formatDistance } from '../utils/geo';
import { useEffect, useMemo, useState } from 'react';
import type { Line } from '../types';
import { getStopLines } from '../services/api';
import { LineBadge } from './LineBadge';

interface AddressSidebarProps {
  address: AddressResult | null;
  stops: Stop[];
  isOpen: boolean;
  onClose: () => void;
  onStopClick: (stop: Stop) => void;
  isMobile: boolean;
  language: 'fr' | 'en';
}






const WALK_METRES_PER_MINUTE = 75;

const walkMinutes = (meters: number): number => Math.max(1, Math.ceil(meters / WALK_METRES_PER_MINUTE));

const getText = (language: 'fr' | 'en') => ({
  eyebrow: language === 'fr' ? 'Adresse' : 'Address',
  onFoot: language === 'fr' ? 'À pied depuis ce point' : 'On foot from here',
  minute: language === 'fr' ? 'min' : 'min',
  stopsCount: (n: number) =>
    language === 'fr' ? `${n} arrêt${n > 1 ? 's' : ''}` : `${n} stop${n > 1 ? 's' : ''}`,
  noStops:
    language === 'fr'
      ? 'Aucun arrêt trouvé autour de cette adresse. Déplacez le repère ou cherchez une autre adresse.'
      : 'No stop found around this address. Move the pin or search another address.',
  close: language === 'fr' ? 'Fermer' : 'Close',
});

/** Au-delà, les pastilles chassent le nom de l'arrêt hors de la carte. */
const MAX_BADGES = 4;

/**
 * Une carte de l'échelle de marche.
 *
 * Chaque arrêt est une carte autonome : le rail vertical qui les enfilait
 * suggérait un parcours d'un arrêt à l'autre, alors qu'il s'agit de huit
 * destinations concurrentes depuis le même point. La barre sous le nom reste,
 * elle : sa longueur encode la distance, et on compare d'un coup d'œil sans
 * lire les chiffres.
 */
const WalkRow = ({
  stop,
  meters,
  ratio,
  isFirst,
  lines,
  onClick,
  language,
  text,
  delay,
}: {
  stop: Stop;
  meters: number;
  ratio: number;
  isFirst: boolean;
  lines: Line[];
  onClick: () => void;
  language: 'fr' | 'en';
  text: ReturnType<typeof getText>;
  delay: number;
}) => {
  const visible = lines.slice(0, MAX_BADGES);
  const overflow = lines.length - visible.length;

  return (
    <motion.button
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.22, ease: 'easeOut' }}
      onClick={onClick}
      className="group flex w-full items-stretch gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 px-3.5 py-3 text-left transition hover:border-slate-700 hover:bg-slate-800/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold text-white">{stop.name}</span>
            {stop.city && <span className="mt-0.5 block truncate text-xs text-slate-400">{stop.city}</span>}
          </span>

          <span className="flex flex-shrink-0 flex-col items-end">
            <span className="tabular text-[17px] font-bold leading-none text-white">
              {walkMinutes(meters)}
              <span className="ml-1 text-[11px] font-medium text-slate-400">{text.minute}</span>
            </span>
            <span className="tabular mt-1 text-[11px] text-slate-500">
              {formatDistance(meters, language)}
            </span>
          </span>
        </span>

        {/* Lignes desservies, comme sur l'étiquette d'un arrêt sur la carte :
            les quatre premières, puis le compte de celles qui restent. */}
        {visible.length > 0 && (
          <span className="mt-2 flex flex-wrap items-center gap-1">
            {visible.map(line => (
              <LineBadge key={line.routeId || line.id} line={line} size="xs" />
            ))}
            {overflow > 0 && (
              <span className="tabular flex h-6 items-center rounded-md bg-slate-800 px-1.5 text-[10px] font-bold text-slate-300">
                +{overflow}
              </span>
            )}
          </span>
        )}

        {/* Barre proportionnelle : longueur = distance relative au plus éloigné. */}
        <span className="mt-2.5 block h-px w-full bg-slate-800">
          <span
            className={`block h-px ${isFirst ? 'bg-blue-400' : 'bg-slate-600'}`}
            style={{ width: `${Math.max(4, ratio * 100)}%` }}
          />
        </span>
      </span>
    </motion.button>
  );
};

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

  const maxMeters = nearbyStops.length > 0 ? nearbyStops[nearbyStops.length - 1].meters : 1;

  /**
   * Lignes desservies par chaque arrêt proposé, chargées à l'ouverture. Le
   * service les met en cache : rouvrir la même adresse n'entraîne aucune
   * requête. L'affichage n'attend pas — les pastilles apparaissent au fil des
   * réponses.
   */
  const [linesByStop, setLinesByStop] = useState<Record<string, Line[]>>({});
  useEffect(() => {
    if (!isOpen || nearbyStops.length === 0) return;
    let cancelled = false;
    for (const { stop } of nearbyStops) {
      if (linesByStop[stop.id]) continue;
      void getStopLines(stop.id)
        .then(lines => {
          if (!cancelled) setLinesByStop(prev => ({ ...prev, [stop.id]: lines }));
        })
        .catch(() => { /* silencieux : la carte s'affiche sans pastille */ });
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, nearbyStops.map(entry => entry.stop.id).join('|')]);

  if (!address) return null;

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="signal-label text-slate-500">{text.eyebrow}</p>
          <h2 className="mt-1.5 text-[26px] font-extrabold leading-[1.1] tracking-tight text-white">
            {address.name}
          </h2>
          {address.context && <p className="mt-1 text-sm text-slate-400">{address.context}</p>}
        </div>
        <button
          onClick={onClose}
          aria-label={text.close}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-800 transition hover:bg-slate-700"
        >
          <XMarkIcon className="h-4 w-4 text-white" />
        </button>
      </div>

      <div className="mt-7 flex items-baseline justify-between border-b border-slate-800 pb-2">
        <p className="signal-label text-slate-400">{text.onFoot}</p>
        <p className="tabular text-xs text-slate-500">{text.stopsCount(nearbyStops.length)}</p>
      </div>

      {nearbyStops.length === 0 ? (
        <p className="py-8 text-sm leading-relaxed text-slate-500">{text.noStops}</p>
      ) : (
        <div className="mt-3 space-y-2.5">
          {nearbyStops.map(({ stop, meters }, index) => (
            <WalkRow
              key={stop.id}
              stop={stop}
              meters={meters}
              ratio={maxMeters > 0 ? meters / maxMeters : 0}
              isFirst={index === 0}
              lines={linesByStop[stop.id] ?? []}
              onClick={() => onStopClick(stop)}
              language={language}
              text={text}
              delay={index * 0.03}
            />
          ))}
        </div>
      )}
    </>
  );

  // ── Ordinateur : panneau latéral ────────────────────────────────────────
  if (!isMobile) {
    return (
      <motion.div
        initial={{ x: -420, opacity: 0 }}
        animate={{ x: isOpen ? 0 : -420, opacity: isOpen ? 1 : 0 }}
        exit={{ x: -420, opacity: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="fixed left-0 top-0 z-60 h-screen w-96 overflow-y-auto border-r border-slate-800 bg-slate-900 shadow-2xl"
      >
        <div className="p-6 pb-12">{body}</div>
      </motion.div>
    );
  }

  // ── Téléphone : feuille remontant du bas ────────────────────────────────
  return (
    <Sheet
      style={{ zIndex: 100 }}
      isOpen={isOpen}
      onClose={onClose}
      snapPoints={[0, 0.6, 1]}
      initialSnap={2}
    >
      <Sheet.Container style={{ borderRadius: '24px 24px 0 0', backgroundColor: '#0f172a', zIndex: 100 }}>
        <Sheet.Header>
          <div className="flex justify-center pt-3 pb-1">
            <div className="h-1.5 w-16 rounded-full bg-white/20" />
          </div>
        </Sheet.Header>
        <Sheet.Content disableDrag={state => state.scrollPosition !== 'top'}>
          <div className="flex-1 overflow-y-auto px-5 pb-10 pt-2">{body}</div>
        </Sheet.Content>
      </Sheet.Container>
      <Sheet.Backdrop onTap={onClose} style={{ zIndex: 99 }} />
    </Sheet>
  );
};
