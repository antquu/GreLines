import { motion, AnimatePresence } from 'framer-motion';
import { FunnelIcon } from '@heroicons/react/24/solid';
import type { Ref } from 'react';

export function TrafficFilterBar({
  filters,
  active,
  onSelect,
  subFilters,
  activeSub,
  onSelectSub,
  language,
  size = 'md',
  isLight = false,
  scrollRef,
}: {
  filters: Array<{ key: string; label: string }>;
  active: string;
  onSelect: (key: string) => void;
  subFilters: Array<{ key: string; label: string }>;
  activeSub: string | null;
  onSelectSub: (key: string | null) => void;
  language: 'fr' | 'en';
  size?: 'sm' | 'md';
  isLight?: boolean;
  scrollRef?: Ref<HTMLDivElement>;
}) {
  const small = size === 'sm';
  const pad = small ? 'px-2.5 py-1 text-xs rounded-lg' : 'px-3 py-1.5 text-sm rounded-xl';
  const idle = isLight
    ? 'bg-slate-100 border border-slate-200 text-slate-600 hover:bg-slate-200'
    : 'bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700';

  return (
    <div ref={scrollRef} className={`flex flex-shrink-0 items-center overflow-x-auto scrollbar-hide ${small ? 'gap-1.5 px-4 pb-2' : 'gap-2 px-5 pb-3'}`}>
      {filters.map(filter => {
        const selected = filter.key === active;
        const expanded = selected && subFilters.length > 0;
        return (
          <motion.div
            key={filter.key}
            layout
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={`flex flex-shrink-0 items-center font-medium ${small ? 'rounded-lg' : 'rounded-xl'} ${selected ? 'bg-amber-500 text-white' : idle}`}
          >
            <button
              type="button"
              onClick={() => { onSelect(filter.key); onSelectSub(null); }}
              className={`flex items-center gap-1 ${pad} ${expanded && activeSub === null ? 'font-bold' : ''}`}
            >
              {filter.key === 'all' && <FunnelIcon className={small ? 'h-3 w-3' : 'h-3.5 w-3.5'} />}
              {filter.label}
            </button>
            <AnimatePresence initial={false}>
              {expanded && (
                <motion.div
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="flex items-center gap-1 overflow-hidden pr-1"
                  aria-label={language === 'fr' ? 'Modes' : 'Modes'}
                >
                  <span className="h-4 w-px flex-shrink-0 bg-white/40" aria-hidden />
                  {subFilters.map(sub => (
                    <button
                      key={sub.key}
                      type="button"
                      onClick={() => onSelectSub(activeSub === sub.key ? null : sub.key)}
                      className={`flex-shrink-0 whitespace-nowrap rounded-md ${small ? 'px-1.5 py-0.5 text-[0.6875rem]' : 'px-2 py-0.5 text-xs'} transition ${
                        activeSub === sub.key ? 'bg-white font-bold text-amber-600' : 'text-white/90 hover:bg-white/20'
                      }`}
                    >
                      {sub.label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}
