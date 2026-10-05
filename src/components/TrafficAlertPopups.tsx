import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Sheet } from 'react-modal-sheet';
import { XMarkIcon } from '@heroicons/react/24/solid';
import type { TrafficDetail } from '../types';
import { TrafficAlertCard } from './TrafficAlertCard';
import { SmoothSheetContent } from './MapSheet';
import { tx } from '../i18n';

const HOVER_WIDTH = 380;
const HOVER_MAX_HEIGHT = 420;

export interface LineAlert {
  line: string;
  details: TrafficDetail[];
}

function AlertList({ alert, language, isLight }: { alert: LineAlert; language: 'fr' | 'en'; isLight: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {alert.details.map((detail, index) => (
        <TrafficAlertCard
          key={`${detail.titre}-${index}`}
          detail={detail}
          language={language}
          isLight={isLight}
          defaultExpanded
          expandable={false}
        />
      ))}
    </div>
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
  const fr = language === 'fr';
  const ink = isLight ? 'text-slate-900' : 'text-white';
  return (
    <Sheet isOpen={alert !== null} onClose={onClose} snapPoints={[0, 0.55, 1]} initialSnap={1} style={{ zIndex: 10030 }}>
      <Sheet.Container
        style={{
          backgroundColor: isLight ? '#ffffff' : '#161616',
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          boxShadow: '0 -12px 40px rgba(0,0,0,0.35)',
        }}
      >
        <Sheet.Header>
          <div className="flex justify-center pb-1 pt-2">
            <div className={`h-1.5 w-16 rounded-full ${isLight ? 'bg-slate-300' : 'bg-white/30'}`} />
          </div>
        </Sheet.Header>
        <SmoothSheetContent>
          {alert && (
            <div className="px-5 pb-10 pt-2" role="dialog" aria-label={tx(fr).journeyDetail.serviceInfoLineLine(alert.line)}>
              <div className="mb-5 flex items-start gap-3">
                <p className={`min-w-0 flex-1 text-[1.3125rem] font-bold leading-tight ${ink}`}>
                  {tx(fr).journeyDetail.serviceInfoLineLine(alert.line)}
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={tx(fr).journeyDetail.close}
                  className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full transition active:scale-90 ${
                    isLight ? 'bg-slate-100 text-slate-700' : 'bg-white/10 text-white'
                  }`}
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
              <AlertList alert={alert} language={language} isLight={isLight} />
            </div>
          )}
        </SmoothSheetContent>
      </Sheet.Container>
      <Sheet.Backdrop onTap={onClose} style={{ backgroundColor: 'rgba(0,0,0,0.45)' }} />
    </Sheet>
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
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.12 }}
      className={`pointer-events-none fixed z-[10030] overflow-hidden rounded-2xl border p-3 shadow-2xl ${
        isLight ? 'border-slate-200 bg-white' : 'border-white/10 bg-[#161616]'
      }`}
      style={{ left, top, width: HOVER_WIDTH, maxHeight: HOVER_MAX_HEIGHT }}
      role="tooltip"
    >
      <AlertList alert={alert} language={language} isLight={isLight} />
    </motion.div>,
    document.body,
  );
}
