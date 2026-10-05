import { useEffect, useState } from 'react';
import { ArrowRightIcon } from '@heroicons/react/24/solid';
import { onDevCommand } from '../utils/devCommands';
import { AnimatePresence, motion } from 'framer-motion';
import { IoWifi } from 'react-icons/io5';
import { isOffline } from '../services/offlineSchedule';
import { hasOfflineSchedules } from '../services/networkSchedules';
import { useIsOffline } from '../hooks/useIsOffline';
import { tx } from '../i18n';

export function OfflineLaunchScreen({ language }: { language: 'fr' | 'en' }) {
  const isFr = language === 'fr';
  const [launch, setLaunch] = useState(() => (isOffline() ? { hasData: false } : null));
  const [dismissed, setDismissed] = useState(false);
  const offline = useIsOffline();

  const launchedOffline = !!launch;
  useEffect(() => {
    if (!launchedOffline) return;
    let active = true;
    void hasOfflineSchedules().then(hasData => {
      if (active && hasData) setLaunch({ hasData: true });
    });
    return () => { active = false; };
  }, [launchedOffline]);

  useEffect(() => onDevCommand('bypassWIFI.popup', () => setDismissed(true)), []);

  const visible = !!launch && !dismissed && (launch.hasData || offline);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="offline-launch"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          style={{ backgroundColor: '#0b0b0b' }}
          className="fixed inset-0 z-[10100] flex flex-col px-8 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(var(--gl-safe-top)+88px)] md:items-center md:justify-center md:p-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="offline-launch-title"
        >
          <div className="flex flex-1 flex-col md:w-[400px] md:flex-none">
            <IoWifi className="h-24 w-24 md:h-16 md:w-16" style={{ color: '#333333' }} aria-hidden="true" />

            <p role="heading" aria-level={1} id="offline-launch-title" className="pt-14 text-[1.875rem] font-medium leading-[1.15] md:pt-16 md:text-[1.75rem]" style={{ color: '#ffffff' }}>
              {tx(isFr).offlineLaunchScreen.youAreOffline}
            </p>
            <p className="pt-3 text-[1.1875rem] leading-snug md:pt-5" style={{ color: '#a3a3a3' }}>
              {launch?.hasData
                ? (tx(isFr).offlineLaunchScreen.youCanStillUse)
                : (tx(isFr).offlineLaunchScreen.noTimetableIsSaved)}
            </p>

            {launch?.hasData && (
              <>
                <button
                  type="button"
                  onClick={() => setDismissed(true)}
                  style={{ backgroundColor: '#ffffff', color: '#000000' }}
                  className="mt-auto w-full rounded-2xl py-4 text-[1.0625rem] font-semibold transition active:scale-[0.98] md:hidden"
                >
                  {tx(isFr).offlineLaunchScreen.continue}
                </button>
                <button
                  type="button"
                  onClick={() => setDismissed(true)}
                  aria-label={tx(isFr).offlineLaunchScreen.continue}
                  title={tx(isFr).offlineLaunchScreen.continue}
                  style={{ backgroundColor: '#ffffff', color: '#000000' }}
                  className="mt-10 hidden h-12 w-12 items-center justify-center self-end rounded-full transition hover:scale-105 active:scale-95 md:flex"
                >
                  <ArrowRightIcon className="h-5 w-5" aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
