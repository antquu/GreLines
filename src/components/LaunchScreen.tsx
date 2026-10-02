import { useEffect, useState } from 'react';

const FADE_MS = 450;

export function LaunchScreen({
  done,
  theme,
  isMobile,
}: {
  done: boolean;
  theme: 'light' | 'dark';
  isMobile: boolean;
}) {
  const minVisibleMs = isMobile ? 1000 : 0;
  const [minElapsed, setMinElapsed] = useState(minVisibleMs === 0);
  const [removed, setRemoved] = useState(false);

  useEffect(() => {
    if (minVisibleMs === 0) return;
    const timer = window.setTimeout(() => setMinElapsed(true), minVisibleMs);
    return () => window.clearTimeout(timer);
  }, [minVisibleMs]);

  const leaving = done && minElapsed;
  const fadeMs = isMobile ? FADE_MS : 0;

  useEffect(() => {
    if (!leaving || fadeMs === 0) return;
    const timer = window.setTimeout(() => setRemoved(true), fadeMs);
    return () => window.clearTimeout(timer);
  }, [leaving, fadeMs]);

  if (removed || (leaving && fadeMs === 0)) return null;

  const light = theme === 'light';

  return (
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
    </div>
  );
}
