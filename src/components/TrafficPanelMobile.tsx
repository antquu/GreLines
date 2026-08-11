import { XMarkIcon, ExclamationTriangleIcon, FunnelIcon } from '@heroicons/react/24/solid';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { Sheet } from 'react-modal-sheet';
import { LineBadge } from './LineBadge';
import type { AllLinesLine } from '../services/allLines';
import type { TrafficDetail } from '../types';
import { stripHtml } from '../utils/stripHtml';

interface TrafficPanelMobileProps {
  isOpen: boolean;
  onClose: () => void;
  trafficInfo: Map<string, TrafficDetail[]>;
  language: 'fr' | 'en';
  theme?: 'light' | 'dark';
  lineLookup?: Map<string, AllLinesLine>;
}

const getTrafficPanelText = (language: 'fr' | 'en') => {
  const isFr = language === 'fr';
  return {
    liveTrafficInfo: isFr ? 'Infos trafic' : 'Traffic info',
    noIncidents: isFr ? 'Aucun incident connu pour le moment.' : 'No known incidents at the moment.',
    incidentSingular: isFr ? 'incident' : 'incident',
    incidentPlural: isFr ? 'incidents' : 'incidents',
    endPrefix: isFr ? 'Fin :' : 'End:',
    filterAll: isFr ? 'Tout' : 'All',
    filterTram: isFr ? 'Trams' : 'Trams',
    filterChrono: 'Chrono',
    filterProximo: 'Proximo',
    filterFlexo: 'Flexo',
  };
};

type FilterType = 'all' | 'tram' | 'chrono' | 'proximo' | 'flexo';

const getLineCategory = (line: string): 'tram' | 'chrono' | 'proximo' | 'flexo' | 'other' => {
  const n = line.trim().toUpperCase();
  if (['A', 'B', 'C', 'D', 'E'].includes(n)) return 'tram';
  if (/^C\d+$/.test(n)) {
    const num = Number(n.substring(1));
    return num >= 1 && num <= 14 ? 'chrono' : 'other';
  }
  const asNum = Number(n);
  if (!isNaN(asNum)) {
    if (asNum >= 11 && asNum <= 29) return 'proximo';
    if (asNum >= 30 && asNum <= 99) return 'flexo';
  }
  return 'other';
};

export const TrafficPanelMobile = ({ isOpen, onClose, trafficInfo, language, theme = 'dark', lineLookup }: TrafficPanelMobileProps) => {
  const text = getTrafficPanelText(language);
  const [filter, setFilter] = useState<FilterType>('all');
  const isLight = theme === 'light';

  const filteredEntries = Array.from(trafficInfo.entries())
    .filter(([line]) => {
      const cat = getLineCategory(line);
      if (cat === 'other') return false;
      if (filter === 'all') return true;
      return cat === filter;
    })
    .sort(([a], [b]) => {
      const rank: Record<string, number> = { tram: 0, chrono: 1, proximo: 2, flexo: 3, other: 99 };
      return (rank[getLineCategory(a)] ?? 99) - (rank[getLineCategory(b)] ?? 99);
    });

  const filters: { key: FilterType; label: string }[] = [
    { key: 'all',     label: text.filterAll },
    { key: 'tram',    label: text.filterTram },
    { key: 'chrono',  label: text.filterChrono },
    { key: 'proximo', label: text.filterProximo },
    { key: 'flexo',   label: text.filterFlexo },
  ];

  return (
    <Sheet
      style={{ zIndex: 100 }}
      isOpen={isOpen}
      onClose={onClose}
      snapPoints={[0, 0.6, 1]}
      initialSnap={2}
    >
      <Sheet.Container
        style={{
          borderRadius: '24px 24px 0 0',
          background: isLight
            ? 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(241,245,249,0.98))'
            : '#0f172a',
          border: isLight ? '1px solid rgba(203,213,225,0.75)' : undefined,
          zIndex: 100,
        }}
      >
        <Sheet.Header>
          <div className="flex justify-center pt-2 pb-1">
            <div className={`h-1.5 w-16 rounded-full ${isLight ? 'bg-slate-300' : 'bg-white/30'}`} />
          </div>
        </Sheet.Header>
        <Sheet.Content disableDrag={state => state.scrollPosition !== 'top'}>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-amber-500 rounded-xl flex items-center justify-center">
                <ExclamationTriangleIcon className="w-4 h-4 text-white" />
              </div>
              <h3 className={`text-base font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{text.liveTrafficInfo}</h3>
              {trafficInfo.size > 0 && (
                <span className="text-xs bg-amber-500 text-white font-bold px-2 py-0.5 rounded-full">
                  {filteredEntries.length}
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              className={`w-9 h-9 flex items-center justify-center rounded-full border transition ${
                isLight
                  ? 'bg-white border-slate-200 hover:bg-slate-100'
                  : 'bg-slate-800 border-slate-700 hover:bg-slate-700'
              }`}
            >
              <XMarkIcon className={`w-4 h-4 ${isLight ? 'text-slate-700' : 'text-white'}`} />
            </button>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-2 px-5 pb-3 flex-shrink-0 overflow-x-auto scrollbar-hide">
            {filters.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition ${
                  filter === f.key
                    ? 'bg-amber-500 text-white'
                    : isLight
                      ? 'bg-slate-100 border border-slate-200 text-slate-600 hover:bg-slate-200'
                      : 'bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {f.key === 'all' && <FunnelIcon className="w-3.5 h-3.5" />}
                {f.label}
              </button>
            ))}
          </div>

          {/* Scrollable content */}
          <div className="overflow-y-auto flex-1 px-5 pb-8">
            {filteredEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border ${
                  isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-800 border-slate-700'
                }`}>
                  <ExclamationTriangleIcon className={`w-7 h-7 ${isLight ? 'text-slate-400' : 'text-slate-500'}`} />
                </div>
                <p className={`text-sm text-center ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>{text.noIncidents}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredEntries.map(([line, details]) => {
                  const sortedDetails = [...details].sort((a, b) => {
                    const at = new Date(a.dateFin).getTime() || 0;
                    const bt = new Date(b.dateFin).getTime() || 0;
                    return at - bt;
                  });
                  const normalized = line.toUpperCase().trim().replace(/^SEM[:_]/, '');
                  const resolvedLine = lineLookup?.get(normalized) || lineLookup?.get(line.toUpperCase().trim());

                  return (
                    <motion.div
                      key={line}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`rounded-2xl overflow-hidden border ${
                        isLight ? 'bg-white border-slate-200 shadow-[0_12px_30px_rgba(148,163,184,0.18)]' : 'bg-slate-800 border-slate-700'
                      }`}
                    >
                      <div className={`flex items-center justify-between px-4 py-3 border-b ${isLight ? 'border-slate-200' : 'border-slate-700'}`}>
                        <div className="flex items-center gap-2">
                          {resolvedLine ? (
                            <LineBadge line={resolvedLine} size="sm" />
                          ) : (
                            <span className="w-7 h-7 rounded-full bg-slate-300 text-slate-800 text-xs font-bold flex items-center justify-center">
                              {line}
                            </span>
                          )}
                          <span className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                            {sortedDetails.length}{' '}
                            {sortedDetails.length > 1 ? text.incidentPlural : text.incidentSingular}
                          </span>
                        </div>
                      </div>
                      <div className={`divide-y ${isLight ? 'divide-slate-100' : 'divide-slate-700/50'}`}>
                        {sortedDetails.map((detail, index) => (
                          <div key={`${line}-${index}`} className="px-4 py-3">
                            <p className={`text-sm font-semibold mb-1 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                              {stripHtml(detail.titre)}
                            </p>
                            <p className={`text-xs leading-relaxed whitespace-pre-line ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                              {stripHtml(detail.description)}
                            </p>
                            <p className={`text-xs mt-2 ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
                              {text.endPrefix} {detail.dateFin || 'N/A'}
                            </p>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </Sheet.Content>
      </Sheet.Container>
      <Sheet.Backdrop onTap={onClose} style={{ zIndex: 99 }} />
    </Sheet>
  );
};
