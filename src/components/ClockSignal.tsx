import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SignalIcon } from '@heroicons/react/24/solid';
import { usePerfSettings } from '../hooks/usePerfSettings';

const isNetworkClosed = (date: Date) => {
  const totalMinutes = date.getHours() * 60 + date.getMinutes();
  return totalMinutes >= 60 && totalMinutes < 270;
};


const MARQUEE_SPEED_PX_PER_SEC = 60;


function normalizeFooterMessage(message: string): string {
  return message.replace(/\s+/g, ' ').trim();
}








function ScrollingMessage({ message, color }: { message: string; color: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [durationSec, setDurationSec] = useState(12);

  const text = normalizeFooterMessage(message);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const update = () => {
      const containerWidth = container.clientWidth;
      const textWidth = measure.getBoundingClientRect().width;
      if (containerWidth === 0 || textWidth === 0) return;

      setOverflows(textWidth > containerWidth);
      
      const scrollDistance = textWidth + 48;
      setDurationSec(Math.max(6, scrollDistance / MARQUEE_SPEED_PX_PER_SEC));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [text]);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      <span
        ref={measureRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute left-0 top-0 whitespace-nowrap text-sm font-bold"
      >
        {text}
      </span>

      {overflows ? (
        <div className="absolute inset-0 flex items-center">
          <div
            className="flex w-max items-center whitespace-nowrap text-sm font-bold"
            style={{
              color,
              animationName: 'footer-marquee',
              animationDuration: `${durationSec}s`,
              animationTimingFunction: 'linear',
              animationIterationCount: 'infinite',
            }}
          >
            <span className="pr-12">{text}</span>
            <span aria-hidden="true" className="pr-12">
              {text}
            </span>
          </div>
        </div>
      ) : (
        <div className="flex h-full items-center">
          <span className="whitespace-nowrap text-sm font-bold" style={{ color }}>
            {text}
          </span>
        </div>
      )}
    </div>
  );
}

function Clock({ now }: { now: Date }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <SignalIcon
        className={`w-4 h-4 transition-colors duration-300 ${
          now.getSeconds() % 2 === 0 ? 'text-blue-600' : 'text-white'
        }`}
      />
      <p className="text-white font-mono font-medium text-xs">{now.toLocaleTimeString('fr-FR')}</p>
    </div>
  );
}

export function ClockSignal({
  closedLabel,
  overrideMessage,
  overrideColor,
  showClock = true,
}: {
  closedLabel: string;
  /** Message custom géré depuis le CRM (infotraffic/promo) — remplace le bloc horloge/fermé tant qu'il est actif. */
  overrideMessage?: string | null;
  /** Couleur du texte du message custom, configurée depuis le CRM. */
  overrideColor?: string;
  /** Affichage de l'horloge quand aucun message custom n'est actif. */
  showClock?: boolean;
}) {
  const { settings } = usePerfSettings();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const networkClosed = isNetworkClosed(now);
  // Réglages > Affichage : le bandeau défilant peut être masqué sans faire
  // disparaître l'horloge ni l'alerte « réseau fermé ».
  const displayMessage =
    overrideMessage && !settings.hideFooterTicker ? normalizeFooterMessage(overrideMessage) : null;

  // Rien à afficher : pas de message, réseau ouvert, horloge désactivée.
  if (!displayMessage && !networkClosed && !showClock) return null;

  return (
    <div className="grelines-footer-bar fixed bottom-0 left-0 right-0 h-10 bg-gray-900 border-t border-gray-800 z-50 shadow-lg">
      <div className="flex h-full items-center gap-6 pl-4 pr-4">
        <div className="min-w-0 flex-1 h-full">
          {displayMessage ? (
            <ScrollingMessage message={displayMessage} color={overrideColor || '#fbbf24'} />
          ) : networkClosed ? (
            <div className="flex h-full items-center justify-center text-sm font-bold text-red-300">
              {closedLabel}
            </div>
          ) : null}
        </div>

        {showClock && <Clock now={now} />}
      </div>
    </div>
  );
}
