import { XMarkIcon, ExclamationTriangleIcon, FunnelIcon } from '@heroicons/react/24/solid';
import { motion } from 'framer-motion';
import { useCallback, useState } from 'react';
import { MapSheet } from './MapSheet';
import { LineBadge } from './LineBadge';
import { categoryRank, trafficCategory, trafficFilters } from '../utils/trafficFilters';
import { useWheelScroll } from '../hooks/useWheelScroll';
import { TrafficAlertCard } from './TrafficAlertCard';
import type { AllLinesLine } from '../services/allLines';
import type { TrafficDetail } from '../types';

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
  };
};

type FilterType = string;

export const TrafficPanelMobile = ({ isOpen, onClose, trafficInfo, language, theme = 'dark', lineLookup }: TrafficPanelMobileProps) => {
  const text = getTrafficPanelText(language);
  const [filter, setFilter] = useState<FilterType>('all');
  /* La même barre s'ouvre sur ordinateur, où l'on n'a que la molette. */
  const filtersRef = useWheelScroll<HTMLDivElement>();
  const isLight = theme === 'light';

  /*
   * La catégorie d'une ligne : sa famille dans la Métropole, ou son réseau.
   *
   * Auparavant, tout ce qui n'entrait pas dans les quatre familles urbaines
   * était écarté — pas seulement des onglets, mais de la liste entière. Les
   * perturbations du Grésivaudan, du Pays Voironnais, des Cars Région et du TER
   * n'apparaissaient nulle part, y compris sous « Tout ».
   */
  const categoryOf = useCallback(
    (line: string) => trafficCategory(line, lineLookup),
    [lineLookup],
  );

  const filteredEntries = Array.from(trafficInfo.entries())
    .filter(([line]) => filter === 'all' || categoryOf(line) === filter)
    .sort(([a], [b]) => {
      const ra = categoryRank(categoryOf(a));
      const rb = categoryRank(categoryOf(b));
      if (ra !== rb) return ra - rb;
      return a.localeCompare(b, undefined, { numeric: true });
    });

  /* Un onglet de réseau ne paraît que s'il a des perturbations à montrer. */
  const presentCategories = new Set(Array.from(trafficInfo.keys()).map(categoryOf));

  const filters = trafficFilters(presentCategories, language);

  return (
    <MapSheet initialSnap={3} isOpen={isOpen} onClose={onClose} isLight={isLight} zIndex={100}>

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
          <div ref={filtersRef} className="flex gap-2 px-5 pb-3 flex-shrink-0 overflow-x-auto scrollbar-hide">
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
                      {/* La même carte que dans la fiche d'un arrêt, d'une
                          ligne ou d'un trajet. Le regroupement par ligne reste,
                          lui : c'est ce qui fait de cet écran un répertoire
                          plutôt qu'une liste. */}
                      <div className="space-y-2 p-3">
                        {sortedDetails.map((detail, index) => (
                          <TrafficAlertCard
                            key={`${line}-${index}`}
                            detail={detail}
                            language={language}
                            isLight={isLight}
                            /* Cet écran ne montre que des perturbations : les
                               replier obligerait à ouvrir une à une des cartes
                               dont la lecture est le seul objet de la page. */
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
