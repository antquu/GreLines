import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import type { Line, TrafficDetail } from '../types';
import { LineBadge } from './LineBadge';
import { MapSheet, MapSheetBottomSpacer } from './MapSheet';
import { stripHtml } from '../utils/stripHtml';
import { formatTrafficEnd } from '../utils/trafficEnd';
import { useTranslated } from '../hooks/useTranslated';
import { tx } from '../i18n';

const HOVER_WIDTH = 384;
const HOVER_MAX_HEIGHT = 460;

export interface LineAlert {
  line: string;
  badge?: Pick<Line, 'id' | 'shortName' | 'color' | 'textColor'>;
  details: TrafficDetail[];
}

function colorsFor(isLight: boolean) {
  return {
    ink: isLight ? '#000000' : '#ffffff',
    soft: isLight ? '#525252' : '#a3a3a3',
    faint: '#737373',
  };
}

function AlertSection({
  detail,
  alert,
  language,
  isLight,
  first,
}: {
  detail: TrafficDetail;
  alert: LineAlert;
  language: 'fr' | 'en';
  isLight: boolean;
  first: boolean;
}) {
  const { ink, soft, faint } = colorsFor(isLight);
  const fr = language === 'fr';
  const title = useTranslated(stripHtml(detail.titre ?? '').trim(), language) || tx(fr).popupOverlay.ongoingDisruption;
  const message = useTranslated(stripHtml(detail.description ?? '').trim(), language);
  const end = formatTrafficEnd(detail.dateFin ?? '', language);
  return (
    <section className={first ? '' : `mt-6 border-t pt-6 ${isLight ? 'border-slate-200' : 'border-white/10'}`}>
      <p role="heading" aria-level={2} className={`${first ? 'pt-6' : ''} text-[1.5rem] font-medium leading-[1.15]`} style={{ color: ink }}>
        {title}
        {alert.badge && (
          <span className="ml-2 inline-flex translate-y-[-3px] align-middle">
            <LineBadge line={alert.badge} size="sm" />
          </span>
        )}
      </p>
      {message && (
        <p className="whitespace-pre-line pt-3 text-[1.0625rem] leading-snug" style={{ color: soft }}>
          {message}
        </p>
      )}
      <p className="pt-3 text-[0.875rem]" style={{ color: faint }}>
        {end ? tx(fr).popupOverlay.estimatedEndEnd(end) : tx(fr).popupOverlay.noEndDateGiven}
      </p>
    </section>
  );
}

function AlertContent({ alert, language, isLight }: { alert: LineAlert; language: 'fr' | 'en'; isLight: boolean }) {
  const { ink } = colorsFor(isLight);
  return (
    <>
      <ExclamationTriangleIcon className="h-12 w-12" style={{ color: ink }} aria-hidden="true" />
      {alert.details.map((detail, index) => (
        <AlertSection
          key={`${detail.titre}-${index}`}
          detail={detail}
          alert={alert}
          language={language}
          isLight={isLight}
          first={index === 0}
        />
      ))}
    </>
  );
}

export function TrafficAlertSheet({
  alert,
  language,
  isLight,
  onClose,
}: {
  alert: LineAlert | null;
  language: 'fr' | 'en';
  isLight: boolean;
  onClose: () => void;
}) {
  return (
    <MapSheet isOpen={alert !== null} onClose={onClose} isLight={isLight} zIndex={10030} initialSnap={2}>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        {alert && (
          <div className="px-6 pb-8 pt-4" role="dialog" aria-label={tx(language === 'fr').journeyDetail.serviceInfoLineLine(alert.line)}>
            <AlertContent alert={alert} language={language} isLight={isLight} />
            <button
              type="button"
              onClick={onClose}
              className="mt-8 w-full rounded-2xl py-4 text-[1.0625rem] font-semibold transition active:scale-[0.98]"
              style={isLight ? { backgroundColor: '#000000', color: '#ffffff' } : { backgroundColor: '#ffffff', color: '#000000' }}
            >
              {tx(language === 'fr').popupOverlay.gotIt}
            </button>
          </div>
        )}
        <MapSheetBottomSpacer />
      </div>
    </MapSheet>
  );
}

export function TrafficAlertHover({
  alert,
  point,
  language,
  isLight,
}: {
  alert: LineAlert;
  point: { x: number; y: number };
  language: 'fr' | 'en';
  isLight: boolean;
}) {
  const left = Math.max(8, Math.min(point.x - HOVER_WIDTH + 24, window.innerWidth - HOVER_WIDTH - 8));
  const top = Math.max(8, Math.min(point.y + 10, window.innerHeight - HOVER_MAX_HEIGHT - 8));
  return createPortal(
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.14 }}
      className={`pointer-events-none fixed z-[10030] overflow-hidden rounded-3xl border shadow-2xl ${
        isLight ? 'border-slate-200' : 'border-white/10'
      }`}
      style={{ left, top, width: HOVER_WIDTH, maxHeight: HOVER_MAX_HEIGHT, backgroundColor: isLight ? '#ffffff' : '#0b0b0b' }}
      role="tooltip"
    >
      <div className="px-6 pb-7 pt-6" style={{ maskImage: 'linear-gradient(to bottom, black calc(100% - 24px), transparent)' }}>
        <AlertContent alert={alert} language={language} isLight={isLight} />
      </div>
    </motion.div>,
    document.body,
  );
}
