import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const DEFAULT_DURATION_MS = 4000;

export interface ToastMessage {
  id: string;
  text: string;
  detail?: string;
  icon?: React.ReactNode;
}

export function Toast({
  message,
  isLight,
  durationMs = DEFAULT_DURATION_MS,
  onDismiss,
  onClick,
}: {
  message: ToastMessage | null;
  isLight: boolean;
  durationMs?: number;
  onDismiss: () => void;
  onClick?: () => void;
}) {
  const id = message?.id;

  useEffect(() => {
    if (!id) return;
    const timer = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, durationMs]);

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          key={message.id}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.26, ease: [0.32, 0.72, 0, 1] }}
          className={`fixed left-1/2 z-[1300] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2.5 rounded-full py-2.5 pl-4 pr-5 shadow-2xl ${
            onClick ? 'cursor-pointer' : 'pointer-events-none'
          } ${
            isLight
              ? 'border border-slate-200 bg-white/95 text-slate-900 shadow-slate-300/50'
              : 'border border-blue-500/40 bg-slate-900/95 text-white shadow-blue-950/40'
          }`}
          style={{ top: 'max(calc(var(--gl-safe-top) + 0.5rem), 1rem)', backdropFilter: 'blur(10px)' }}
          onClick={onClick ? () => { onDismiss(); onClick(); } : undefined}
          role="status"
          aria-live="polite"
        >
          {message.icon && <span className="flex-shrink-0 text-blue-500">{message.icon}</span>}
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold leading-tight">{message.text}</span>
            {message.detail && (
              <span className="block truncate text-xs text-slate-500">{message.detail}</span>
            )}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
