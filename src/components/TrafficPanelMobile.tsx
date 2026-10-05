import { foreignAsCatalogLine, isForeignLineId } from '../utils/foreignNetworks';
import { OfflinePanel } from './OfflinePanel';
import { useIsOffline } from '../hooks/useIsOffline';
import { XMarkIcon, ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import { motion } from 'framer-motion';
import { useCallback, useState } from 'react';
import { MapSheet } from './MapSheet';
import { LineBadge } from './LineBadge';
import { compareTrafficLines, matchesTrafficFilter, trafficCategory, trafficFilters, trafficSubFilters } from '../utils/trafficFilters';
import { TrafficFilterBar } from './TrafficFilterBar';
import { useWheelScroll } from '../hooks/useWheelScroll';
import { TrafficAlertCard } from './TrafficAlertCard';
import type { AllLinesLine } from '../services/allLines';
import type { TrafficDetail } from '../types';
import { tx } from '../i18n';

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
    liveTrafficInfo: tx(isFr).trafficPanelMobile.trafficInfo,
    noIncidents: tx(isFr).trafficPanelMobile.noKnownIncidentsAt,
    incidentSingular: tx(isFr).trafficPanelMobile.incident,
    incidentPlural: tx(isFr).trafficPanelMobile.incidents,
    endPrefix: tx(isFr).trafficPanelMobile.end,
  };
};

type FilterType = string;

export const TrafficPanelMobile = ({ isOpen, onClose, trafficInfo, language, theme = 'dark', lineLookup }: TrafficPanelMobileProps) => {
  const offline = useIsOffline();
  const text = getTrafficPanelText(language);
  const [filter, setFilter] = useState<FilterType>('all');
  const [subFilter, setSubFilter] = useState<string | null>(null);
  const filtersRef = useWheelScroll<HTMLDivElement>();
  const isLight = theme === 'light';

  const categoryOf = useCallback(
    (line: string) => trafficCategory(line, lineLookup),
    [lineLookup],
  );

  const filteredEntries = Array.from(trafficInfo.entries())
    .filter(([line]) => matchesTrafficFilter(line, filter, subFilter, lineLookup))
    .sort(([a], [b]) => compareTrafficLines(a, b, lineLookup));

  const presentCategories = new Set(Array.from(trafficInfo.keys()).map(categoryOf));

  const filters = trafficFilters(presentCategories, language);
  const subFilters = trafficSubFilters(filter, Array.from(trafficInfo.keys()), lineLookup, language);

  return (
    <MapSheet initialSnap={3} isOpen={isOpen} onClose={onClose} isLight={isLight} zIndex={100}>

          <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-amber-500 rounded-xl flex items-center justify-center">
                <ExclamationTriangleIcon className="w-4 h-4 text-white" />
              </div>
              <h3 className={`text-base font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{text.liveTrafficInfo}</h3>
              {!offline && trafficInfo.size > 0 && (
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

          <TrafficFilterBar
            filters={filters}
            active={filter}
            onSelect={setFilter}
            subFilters={subFilters}
            activeSub={subFilter}
            onSelectSub={setSubFilter}
            language={language}
            isLight={isLight}
            scrollRef={filtersRef}
          />

          <div className="overflow-y-auto flex-1 px-5 pb-8">
            {offline ? (
              <OfflinePanel language={language} isLight={isLight} />
            ) : filteredEntries.length === 0 ? (
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
                  const resolvedLine = isForeignLineId(line)
                    ? foreignAsCatalogLine({ id: line })
                    : lineLookup?.get(normalized) || lineLookup?.get(line.toUpperCase().trim());

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
                      <div className="space-y-2 p-3">
                        {sortedDetails.map((detail, index) => (
                          <TrafficAlertCard
                            key={`${line}-${index}`}
                            detail={detail}
                            language={language}
                            isLight={isLight}
                            expandable={false}
                          />
                        ))}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
    </MapSheet>
  );
};
