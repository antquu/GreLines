import { useEffect } from 'react';
import { motion, useAnimation } from 'framer-motion';

const WIFI_LEVELS = [
  { d: 'M12 20h.01', delay: 0 },
  { d: 'M8.5 16.429a5 5 0 0 1 7 0', delay: 0.1 },
  { d: 'M5 12.859a10 10 0 0 1 14 0', delay: 0.2 },
  { d: 'M2 8.82a15 15 0 0 1 20 0', delay: 0.3 },
];

const PULSE_MS = 3000;

export interface RealtimeWifiProps {
  size?: number;
  className?: string;
  label?: string;
}

export function RealtimeWifi({ size = 14, className = '', label }: RealtimeWifiProps) {
  const controls = useAnimation();

  useEffect(() => {
    let cancelled = false;
    const beat = async () => {
      await controls.start('fadeOut');
      if (!cancelled) controls.start('fadeIn');
    };
    void beat();
    const timer = window.setInterval(beat, PULSE_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [controls]);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`flex-shrink-0 ${className}`}
      style={{ transform: 'scaleX(-1) rotate(-45deg)' }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {WIFI_LEVELS.map((level, index) => (
        <motion.path
          key={level.d}
          d={level.d}
          animate={controls}
          initial={{ opacity: 1 }}
          variants={{
            fadeOut: { opacity: index === 0 ? 1 : 0, transition: { duration: 0.2 } },
            fadeIn: {
              opacity: 1,
              transition: { type: 'spring', stiffness: 300, damping: 20, delay: level.delay },
            },
          }}
        />
      ))}
    </svg>
  );
}
