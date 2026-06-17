import { XMarkIcon, ExclamationTriangleIcon, FunnelIcon } from '@heroicons/react/24/solid';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { Sheet } from 'react-modal-sheet';
import type { TrafficDetail } from '../types';
import { stripHtml } from '../utils/stripHtml';

interface TrafficPanelMobileProps {
  isOpen: boolean;
  onClose: () => void;
  trafficInfo: Map<string, TrafficDetail[]>;
  language: 'fr' | 'en';
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

const getBadgeColor = (cat: ReturnType<typeof getLineCategory>): string => {
  switch (cat) {
    case 'tram':    return 'bg-blue-600';
    case 'chrono':  return 'bg-orange-500';
    case 'proximo': return 'bg-green-600';
    case 'flexo':   return 'bg-pink-600';
    default:        return 'bg-slate-600';
  }
};

export const TrafficPanelMobile = ({ isOpen, onClose, trafficInfo, language }: TrafficPanelMobileProps) => {
  const text = getTrafficPanelText(language);
  const [filter, setFilter] = useState<FilterType>('all');

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
      <Sheet.Container style={{ borderRadius: '24px 24px 0 0', backgroundColor: '#0f172a', zIndex: 100 }}>
        <Sheet.Header />
        <Sheet.Content disableDrag={state => state.scrollPosition !== 'top'}>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-amber-500 rounded-xl flex items-center justify-center">
                <ExclamationTriangleIcon className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-base font-bold text-white">{text.liveTrafficInfo}</h3>
              {trafficInfo.size > 0 && (
                <span className="text-xs bg-amber-500 text-white font-bold px-2 py-0.5 rounded-full">
                  {filteredEntries.length}
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center bg-slate-800 border border-slate-700 rounded-full hover:bg-slate-700 transition"
            >
              <XMarkIcon className="w-4 h-4 text-white" />
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
                <div className="w-14 h-14 bg-slate-800 border border-slate-700 rounded-2xl flex items-center justify-center">
                  <ExclamationTriangleIcon className="w-7 h-7 text-slate-500" />
                </div>
                <p className="text-sm text-slate-500 text-center">{text.noIncidents}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredEntries.map(([line, details]) => {
                  const category = getLineCategory(line);
                  const sortedDetails = [...details].sort((a, b) => {
                    const at = new Date(a.dateFin).getTime() || 0;
                    const bt = new Date(b.dateFin).getTime() || 0;
                    return at - bt;
                  });
                  const badgeColor = getBadgeColor(category);
                  const isRound = category === 'tram' || category === 'chrono';

                  return (
                    <motion.div
                      key={line}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden"
                    >
                      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
                        <div className="flex items-center gap-2">
                          <span className={`${badgeColor} text-white text-xs font-bold ${
                            isRound
                              ? 'w-7 h-7 rounded-full flex items-center justify-center'
                              : 'px-2.5 py-1 rounded-lg'
                          }`}>
                            {line}
                          </span>
                          <span className="text-xs text-slate-400">
                            {sortedDetails.length}{' '}
                            {sortedDetails.length > 1 ? text.incidentPlural : text.incidentSingular}
                          </span>
                        </div>
                      </div>
                      <div className="divide-y divide-slate-700/50">
                        {sortedDetails.map((detail, index) => (
                          <div key={`${line}-${index}`} className="px-4 py-3">
                            <p className="text-sm font-semibold text-white mb-1">
                              {stripHtml(detail.titre)}
                            </p>
                            <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-line">
                              {stripHtml(detail.description)}
                            </p>
                            <p className="text-xs text-slate-500 mt-2">
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