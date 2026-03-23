import { XMarkIcon } from '@heroicons/react/24/solid';
import { motion } from 'framer-motion';
import type { TrafficDetail } from '../types';

interface TrafficPanelMobileProps {
  isOpen: boolean;
  onClose: () => void;
  trafficInfo: Map<string, TrafficDetail[]>;
}

export const TrafficPanelMobile = ({ isOpen, onClose, trafficInfo }: TrafficPanelMobileProps) => {
  return (
    <>
      {/* Full-screen overlay when open */}
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/50 z-45"
        />
      )}

      {/* Traffic panel */}
      <motion.div
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: isOpen ? 0 : '100%', opacity: isOpen ? 1 : 0 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-[#5c3d04] rounded-t-2xl shadow-2xl border-t border-amber-600 max-h-[80vh] overflow-y-auto"
      >
        <div className="p-4 sticky top-0 bg-[#5c3d04] border-b border-amber-600 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-amber-200">Live traffic info</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-amber-700 rounded transition"
          >
            <XMarkIcon className="w-5 h-5 text-amber-200" />
          </button>
        </div>

        <div className="p-4">
          {trafficInfo.size === 0 ? (
            <div className="text-sm text-amber-200 text-center py-8">
              No known incidents at the moment.
            </div>
          ) : (
            <div className="space-y-3">
              {Array.from(trafficInfo.entries())
                .filter(([line]) => {
                  const normalized = line.trim().toUpperCase();
                  if (['A', 'B', 'C', 'D', 'E'].includes(normalized)) return true;
                  if (normalized.startsWith('C')) {
                    const num = Number(normalized.substring(1));
                    return num >= 1 && num <= 14;
                  }
                  const numeric = Number(normalized);
                  return numeric >= 15 && numeric <= 92;
                })
                .map(([line, details]) => {
                  const sortedDetails = [...details].sort((a, b) => {
                    const at = new Date(a.dateFin).getTime() || 0;
                    const bt = new Date(b.dateFin).getTime() || 0;
                    return at - bt;
                  });

                  return (
                    <motion.div
                      key={line}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-md bg-amber-700/30 p-3 border border-amber-600/50"
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-sm font-bold text-amber-100">Line {line}</span>
                        <span className="text-xs text-amber-200">{sortedDetails.length} incident{sortedDetails.length > 1 ? 's' : ''}</span>
                      </div>
                      <div className="space-y-2">
                        {sortedDetails.map((detail, index) => (
                          <div key={`${line}-${index}`} className="text-xs text-amber-100 bg-amber-800/20 p-2 rounded border border-amber-600/30">
                            <div className="font-semibold text-amber-50">{detail.titre}</div>
                            <div className="mt-1 text-amber-100">{detail.description}</div>
                            <div className="text-[11px] text-amber-200 mt-1">End: {detail.dateFin || 'N/A'}</div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  );
                })}
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
};
