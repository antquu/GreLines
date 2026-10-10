import { useEffect, useState } from 'react';
import { CITY_SITE } from '../site';
import { appLanguage } from '../utils/appLanguage';
import { tx } from '../i18n';

const MOBILE_SPLASH_MS = 300;
const MOBILE_FADE_MS = 200;
const SPINNER_FADE_MS = 200;

function MapLoadingSpinner({ visible, light }: { visible: boolean; light: boolean }) {
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setMounted(false), SPINNER_FADE_MS);
    return () => window.clearTimeout(timer);
  }, [visible]);

  if (!mounted) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[9998] flex items-center justify-center"
      style={{ opacity: visible ? 1 : 0, transition: `opacity ${SPINNER_FADE_MS}ms ease-out` }}
      role="status"
      aria-label={tx(!(appLanguage() === 'en')).launchScreen.loading}
    >
      <div
        className="flex h-28 w-28 items-center justify-center rounded-3xl shadow-2xl"
        style={{
          backgroundColor: light ? 'rgba(255, 255, 255, 0.94)' : 'rgba(32, 33, 40, 0.94)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        <svg className="h-14 w-14 animate-spin" viewBox="0 0 50 50" style={{ animationDuration: '0.9s' }}>
          <defs>
            <linearGradient id="map-spinner-fade" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={light ? '#6b7280' : '#d1d5db'} stopOpacity="1" />
              <stop offset="100%" stopColor={light ? '#6b7280' : '#d1d5db'} stopOpacity="0.1" />
            </linearGradient>
          </defs>
          <circle
            cx="25"
            cy="25"
            r="20"
            fill="none"
            stroke="url(#map-spinner-fade)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray="94 32"
          />
        </svg>
      </div>
    </div>
  );
}

export function LaunchScreen({
  done,
  theme,
  isMobile,
}: {
  done: boolean;
  theme: 'light' | 'dark';
  isMobile: boolean;
}) {
  const [splashElapsed, setSplashElapsed] = useState(false);
  const [removed, setRemoved] = useState(false);

  useEffect(() => {
    if (!isMobile) return;
    const timer = window.setTimeout(() => setSplashElapsed(true), MOBILE_SPLASH_MS);
    return () => window.clearTimeout(timer);
  }, [isMobile]);

  const leaving = isMobile ? splashElapsed || done : done;
  const fadeMs = isMobile ? MOBILE_FADE_MS : 0;

  useEffect(() => {
    if (!leaving || fadeMs === 0) return;
    const timer = window.setTimeout(() => setRemoved(true), fadeMs);
    return () => window.clearTimeout(timer);
  }, [leaving, fadeMs]);

  const light = theme === 'light';
  const spinner = isMobile ? <MapLoadingSpinner visible={leaving && !done} light={light} /> : null;

  if (removed || (leaving && fadeMs === 0)) return spinner;

  return (
    <>
      {spinner}
      <div
        className="fixed inset-0 z-[9999] flex w-screen items-center justify-center"
        style={{
          height: '100dvh',
          backgroundColor: light ? '#ffffff' : '#000000',
          opacity: leaving ? 0 : 1,
          transition: `opacity ${fadeMs}ms ease-out`,
          pointerEvents: leaving ? 'none' : 'auto',
        }}
        aria-hidden={leaving}
      >
        <img
          src={light ? '/assets/GreLinesLOGO_dark.png' : '/assets/GreLinesLOGO.png'}
          alt="GreLines"
          className={`${isMobile ? 'w-64' : 'w-80'} h-auto animate-pulse-opacity`}
          style={{ transform: 'translateY(-2.5%)' }}
          draggable={false}
        />
        {CITY_SITE && (
          <img
            src={light ? CITY_SITE.logo.light : CITY_SITE.logo.dark}
            alt={CITY_SITE.networkLabel}
            className="absolute left-1/2 h-auto -translate-x-1/2"
            style={{ width: CITY_SITE.logo.width, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 4rem)' }}
            draggable={false}
          />
        )}
      </div>
    </>
  );
}
