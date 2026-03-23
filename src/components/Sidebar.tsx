import { motion } from 'framer-motion';
import type { StopDetail, Departure } from '../types';
import { formatDepartureTime, refreshStopDepartures } from '../services/api';
import { useEffect, useState, useRef } from 'react';
import { UserIcon, ChevronDownIcon, ChevronUpIcon, XMarkIcon, EllipsisVerticalIcon, ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import { MdTram, MdDirectionsBus } from 'react-icons/md';

interface SidebarProps {
  stop: StopDetail | null;
  isOpen: boolean;
  onClose: () => void;
  initialSelectedLines?: Set<string>;
}

const getMinutesUntilDeparture = (departure: Departure): number => {
  // departureTime is already in minutes until departure
  return departure.departureTime;
};

const getDepartureDisplay = (departure: Departure): string => {
  return formatDepartureTime(departure);
};

// Déterminer si c'est un tramway (lignes A, B, C, D, E)
const isTramway = (lineId: string): boolean => {
  const id = lineId.toUpperCase().trim();
  return ['A', 'B', 'C', 'D', 'E'].includes(id);
};

// Afficher les icônes d'occupancy
const OccupancyDisplay = ({ occupancy, showError = false }: { occupancy?: string | null, showError?: boolean }) => {
  const getFrequencyLevel = (occupancy?: string | null): { level: number; label: string } => {
    switch (occupancy) {
      case 'LIGHT':
        return { level: 1, label: 'low' };
      case 'MODERATE':
        return { level: 2, label: 'moderate' };
      case 'CROWDED':
        return { level: 3, label: 'high' };
      default:
        return { level: 0, label: 'unknown' };
    }
  };

  const { level, label } = getFrequencyLevel(occupancy);

  if (level === 0) {
    if (showError) {
      return (
        <div className="text-xs text-red-500 dark:text-red-400 font-medium">
          No data
        </div>
      );
    }
    return null;
  }

  return (
    <div
      className="flex items-center gap-0.5"
      title={`Frequency: ${label}`}
    >
      {Array.from({ length: 3 }).map((_, i) => (
        <UserIcon
          key={i}
          className={`w-4 h-4 ${
            i < level
              ? 'text-gray-600 dark:text-gray-300'
              : 'text-gray-300 dark:text-gray-600'
          }`}
        />
      ))}
    </div>
  );
};

const getDepartureDisplay2 = (departure: Departure): string => {
  return formatDepartureTime(departure);
};

// Composant Modal pour l'export de configuration
const ExportModal = ({ isOpen, onClose, exportUrl, position }: { isOpen: boolean; onClose: () => void; exportUrl: string; position?: { x: number; y: number } | null }) => {
  if (!isOpen || !position) return null;

  // Ensure modal stays within viewport
  const modalWidth = 288; // w-72 = 18rem = 288px
  const padding = 16;
  let left = position.x;
  let top = position.y + 8;

  // Adjust horizontal position if off-screen
  if (left + modalWidth > window.innerWidth) {
    left = Math.max(padding, window.innerWidth - modalWidth - padding);
  }

  // Adjust vertical position if off-screen
  if (top + 200 > window.innerHeight) {
    top = Math.max(padding, window.innerHeight - 200 - padding);
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      style={{
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        zIndex: 60,
      }}
      className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-xl border border-gray-200 dark:border-gray-700 w-72"
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          Exported configuration
        </h3>
        <button
          onClick={onClose}
          className="p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition"
        >
          <XMarkIcon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        </button>
      </div>

      <div className="space-y-2">
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Share link
          </label>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={exportUrl}
              readOnly
              className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white text-xs font-mono bg-gray-50 dark:bg-gray-700"
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText(exportUrl);
                const btn = document.activeElement as HTMLButtonElement;
                if (btn) {
                  const originalText = btn.textContent;
                  btn.textContent = 'Copied!';
                  btn.classList.add('bg-green-500', 'text-white');
                  setTimeout(() => {
                    btn.textContent = originalText;
                    btn.classList.remove('bg-green-500', 'text-white');
                  }, 2000);
                }
              }}
              className="px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition text-xs font-medium"
            >
              Copy
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const getLineColor = (lineId: string): string => {
  // Couleurs inspirées du style transit Grenoble
  const colors: Record<string, { bg: string; text: string }> = {
    '1': { bg: 'bg-red-500', text: 'text-white' },
    '2': { bg: 'bg-green-500', text: 'text-white' },
    '3': { bg: 'bg-blue-500', text: 'text-white' },
    '4': { bg: 'bg-pink-500', text: 'text-white' },
    '5': { bg: 'bg-yellow-400', text: 'text-gray-900' },
    '6': { bg: 'bg-purple-500', text: 'text-white' },
    '7': { bg: 'bg-orange-500', text: 'text-white' },
    '8': { bg: 'bg-indigo-500', text: 'text-white' },
    '9': { bg: 'bg-teal-500', text: 'text-white' },
    '10': { bg: 'bg-rose-500', text: 'text-white' },
  };
  return colors[lineId]?.bg || 'bg-gray-500';
};

export const Sidebar = ({ stop, isOpen, onClose, initialSelectedLines }: SidebarProps) => {
  const [currentStopDetail, setCurrentStopDetail] = useState<StopDetail | null>(null);
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [selectedLines, setSelectedLines] = useState<Set<string>>(initialSelectedLines || new Set());
  const [currentStopId, setCurrentStopId] = useState<string | null>(null);
  const [expandedTrams, setExpandedTrams] = useState<Set<string>>(new Set()); // Track expanded trams
  const [hoveredTrafficLine, setHoveredTrafficLine] = useState<string | null>(null);
  const [tooltipCoords, setTooltipCoords] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportUrl, setExportUrl] = useState('');
  const [exportModalPos, setExportModalPos] = useState<{ x: number; y: number } | null>(null);
  const exportButtonRef = useRef<HTMLButtonElement>(null);
  const [hasAppliedInitialLines, setHasAppliedInitialLines] = useState(false);

  // Synchroniser le stopDetail quand la prop change
  useEffect(() => {
    setCurrentStopDetail(stop);
    setCurrentStopId(stop?.id || null);
  }, [stop]);

  // Fonction pour mettre à jour les départs
  const updateDepartures = async () => {
    if (!currentStopDetail || !isOpen) return;

    try {
      const updatedStopDetail = await refreshStopDepartures(currentStopDetail);
      setCurrentStopDetail(updatedStopDetail);
    } catch (error) {
      console.error('Failed to update departures:', error);
    }
  };

  // Mise à jour périodique des départs toutes les 30 secondes
  useEffect(() => {
    if (!isOpen || !currentStopDetail) return;

    // Mise à jour immédiate
    updateDepartures();

    // Puis toutes les 30 secondes (stable et efficace)
    const interval = setInterval(updateDepartures, 30000);

    return () => clearInterval(interval);
  }, [isOpen, currentStopDetail?.id]);

  const getDeparturePriority = (dep: Departure): number => {
    const id = dep.lineId.toUpperCase().trim();
    const name = dep.lineName.toUpperCase();

    // Tramways A-E en priorité absolue (ordre: A > B > C > D > E)
    if (id === 'A') return 100;
    if (id === 'B') return 99;
    if (id === 'C') return 98;
    if (id === 'D') return 97;
    if (id === 'E') return 96;

    // C1-14 (numérotation avec C1,...)
    if (/^C\d+$/.test(id)) return 50;

    // Bus Chrono
    if (name.includes('CHRONO') || id.startsWith('C')) return 9;

    // Bus Proximo
    if (name.includes('PROXIMO') || id.includes('PR')) return 8;

    // Bus Flexo
    if (name.includes('FLEXO') || id.includes('FL')) return 7;

    // Autres trams
    if (dep.type === 'TRAM' || id.startsWith('T') || name.includes('TRAM')) return 10;

    // Reste
    return 1;
  };

  useEffect(() => {
    if (!currentStopDetail) {
      setDepartures([]);
      return;
    }

    console.log(`Sidebar: Received ${currentStopDetail.departures.length} departures for ${currentStopDetail.name}`);

    // Filtrer les départs futurs
    const futureDepartures = currentStopDetail.departures.filter(dep => getMinutesUntilDeparture(dep) >= 0);

    console.log(`Sidebar: Filtered to ${futureDepartures.length} future departures`);
    futureDepartures.forEach((dep, i) => {
      const minutes = getMinutesUntilDeparture(dep);
      console.log(`  ${i+1}. ${dep.lineId} to ${dep.destination}: ${minutes} min (${dep.departureTime})`);
    });

    setDepartures(futureDepartures);
  }, [currentStopDetail]);

  // Reset selectedLines only when stop changes, but apply initialSelectedLines if provided
  useEffect(() => {
    if (initialSelectedLines && initialSelectedLines.size > 0 && !hasAppliedInitialLines) {
      // Apply initial lines from URL on first load
      setSelectedLines(new Set(initialSelectedLines));
      setHasAppliedInitialLines(true);
    } else if (!initialSelectedLines || initialSelectedLines.size === 0) {
      // No initial lines, reset to empty
      setSelectedLines(new Set());
      setHasAppliedInitialLines(false);
    }
  }, [currentStopId, initialSelectedLines]);

  const displayedDepartures = (() => {
    // TOUJOURS trier par priorité (trams en haut)
    const sorted = [...departures].sort((a, b) => {
      const pa = getDeparturePriority(a);
      const pb = getDeparturePriority(b);
      if (pa !== pb) return pb - pa; // Priorité décroissante

      // À même priorité, trier par temps d'arrivée
      return a.departureTime - b.departureTime;
    });

    // Appliquer le filtre si actif
    if (selectedLines.size === 0) {
      return sorted;
    }

    return sorted.filter(dep => selectedLines.has(dep.lineId));
  })();

  const groupedDepartures = (() => {
    type Group = { first: Departure; second?: Departure; count: number };
    const groups = new Map<string, Group>();

    displayedDepartures.forEach(dep => {
      const key = `${dep.lineId}::${dep.destination}`;
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, { first: dep, count: 1 });
      } else {
        existing.count += 1;
        if (!existing.second) {
          existing.second = dep;
        }
      }
    });

    // Trier les groupes par priorité (trams toujours en haut)
    return Array.from(groups.values()).sort((a, b) => {
      const pa = getDeparturePriority(a.first);
      const pb = getDeparturePriority(b.first);
      if (pa !== pb) return pb - pa;
      
      // À même priorité, trier par temps d'arrivée du premier passage
      return a.first.departureTime - b.first.departureTime;
    });
  })();

  return (
    <motion.div
      initial={{ x: -400, opacity: 0 }}
      animate={{ x: isOpen ? 0 : -400, opacity: isOpen ? 1 : 0 }}
      exit={{ x: -400, opacity: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="fixed left-0 top-0 h-screen w-96 bg-white dark:bg-gray-900 shadow-2xl z-60 overflow-y-auto border-r border-gray-200 dark:border-gray-800"
    >
      {isOpen && currentStopDetail && (
        <div className="p-6">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Stop header */}
          <div className="mb-6">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              {currentStopDetail.name}
            </h2>
            {currentStopDetail.city && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {currentStopDetail.city}
              </p>
            )}
          </div>

          {/* Lines serving this stop */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3 uppercase tracking-wider">
              Lines
            </h3>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">Filter:</span>
                <button
                  onClick={() => setSelectedLines(new Set())}
                  className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Show all
                </button>
              </div>
              <button
                ref={exportButtonRef}
                onClick={() => {
                  // Générer l'URL d'export
                  let url: string;
                  
                  if (selectedLines.size === 0) {
                    // Aucune ligne sélectionnée: afficher toutes les lignes
                    url = `/app?T1=ALL_${currentStopDetail.id}`;
                  } else {
                    // Lignes sélectionnées
                    const selectedLinesArray = Array.from(selectedLines).sort();
                    const params = selectedLinesArray.map((lineId, index) => 
                      `T${index + 1}=${lineId}_${currentStopDetail.id}`
                    ).join('&');
                    url = `/app?${params}`;
                  }
                  
                  setExportUrl(window.location.origin + url);
                  
                  // Obtenir la position du bouton
                  if (exportButtonRef.current) {
                    const rect = exportButtonRef.current.getBoundingClientRect();
                    setExportModalPos({ x: rect.right + 8, y: rect.top });
                  }
                  
                  setIsExportModalOpen(true);
                }}
                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition"
                title="Export configuration"
              >
                <EllipsisVerticalIcon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {currentStopDetail.lines.map(line => {
                const isSelected = selectedLines.size === 0 || selectedLines.has(line.id);
                const isActive = selectedLines.has(line.id);
                return (
                  <div key={line.id} className="relative">
                    <button
                      onClick={() => {
                        setSelectedLines(prev => {
                          const next = new Set(prev);
                          if (next.has(line.id)) {
                            next.delete(line.id);
                          } else {
                            next.add(line.id);
                          }
                          return next;
                        });
                      }}
                      className={`rounded-full w-12 h-12 flex items-center justify-center text-sm font-bold transition ${
                        isActive
                          ? 'ring-2 ring-blue-500 ring-offset-1 text-white'
                          : 'text-white'
                      } ${isSelected ? '' : 'opacity-30'} ${getLineColor(line.id)}`}
                      title={line.name}
                    >
                      {line.shortName || line.id}
                    </button>
                    {line.hasTraffic && (
                      <div className="absolute -top-1 -right-1">
                        <ExclamationTriangleIcon
                          className="w-4 h-4 text-yellow-400 cursor-pointer"
                          onMouseEnter={e => {
                            setHoveredTrafficLine(line.id);
                            setTooltipCoords({ x: e.clientX, y: e.clientY });
                          }}
                          onMouseMove={e => {
                            setTooltipCoords({ x: e.clientX, y: e.clientY });
                          }}
                          onMouseLeave={() => setHoveredTrafficLine(null)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tooltip trafic */}
          {hoveredTrafficLine && currentStopDetail && (
            (() => {
              const line = currentStopDetail.lines.find(l => l.id === hoveredTrafficLine);
              if (!line) return null;

              const baseWidth = 288;
              const offsetX = 12;
              const offsetY = 12;
              const screenW = window.innerWidth;
              const screenH = window.innerHeight;
              const left = tooltipCoords.x + baseWidth + offsetX > screenW
                ? Math.max(8, tooltipCoords.x - baseWidth - offsetX)
                : Math.min(screenW - baseWidth - 8, tooltipCoords.x + offsetX);
              const top = tooltipCoords.y + 120 > screenH
                ? Math.max(8, tooltipCoords.y - 120)
                : tooltipCoords.y + offsetY;

              return (
                <div
                  style={{ left, top, width: baseWidth }}
                  className="fixed z-[55] pointer-events-none bg-black/90 text-white text-xs p-3 rounded-md shadow-xl"
                >
                  <p className="font-semibold">Disrupted traffic • Line {line.shortName || line.id}</p>
                  {line.trafficDetails?.length ? (
                    <>
                      <p className="truncate mt-1 text-[11px]">{line.trafficDetails[0].titre || 'Message indisponible'}</p>
                      <p className="mt-1 text-[10px] text-gray-200">{line.trafficDetails[0].description || '...'}</p>
                      <p className="mt-1 text-[10px] text-gray-300">Fin: {line.trafficDetails[0].dateFin || 'N/A'}</p>
                    </>
                  ) : (
                    <p>Détails non disponibles</p>
                  )}
                </div>
              );
            })()
          )}

          {/* Next departures */}
          <div>
            <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3 uppercase tracking-wider">
              Next departures
            </h3>
            <div className="space-y-3">
              {groupedDepartures.length > 0 ? (
                groupedDepartures.map((group, index) => {
                  const departure = group.first;
                  const second = group.second;
                  const minutesUntil = getMinutesUntilDeparture(departure);
                  const displayTime = getDepartureDisplay(departure);
                  const isNow = minutesUntil <= 2;
                  const isTram = isTramway(departure.lineId);
                  const tramKey = `${departure.lineId}::${departure.destination}`;
                  const isExpanded = expandedTrams.has(tramKey);

                  if (isTram && second) {
                    return (
                      <motion.div
                        key={tramKey}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="border-2 border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-800 shadow-md"
                      >
                        {/* Collapsed view - First departure */}
                        <motion.button
                          onClick={() => {
                            setExpandedTrams(prev => {
                              const next = new Set(prev);
                              if (next.has(tramKey)) {
                                next.delete(tramKey);
                              } else {
                                next.add(tramKey);
                              }
                              return next;
                            });
                          }}
                          className="w-full p-4 hover:bg-gray-100 dark:hover:bg-gray-700 transition text-left"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 flex-1">
                              <div
                                className={`${getLineColor(departure.lineId)} text-white font-bold rounded-full w-10 h-10 flex items-center justify-center text-sm shadow-md flex-shrink-0`}
                              >
                                {departure.lineShortName || departure.lineId}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                  {departure.destination.length > 20
                                    ? `${departure.destination.slice(0, 17)}...`
                                    : departure.destination}
                                </p>
                                <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                                  <MdTram className="w-4 h-4" />
                                  <span>Tramway</span>
                                  {departure.realtime && <span>• Live</span>}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                              <div className="text-right">
                                <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                                  {displayTime}
                                </p>
                                <OccupancyDisplay occupancy={departure.occupancy} />
                              </div>
                              {isExpanded ? (
                                <ChevronUpIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                              ) : (
                                <ChevronDownIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                              )}
                            </div>
                          </div>
                        </motion.button>

                        {/* Expanded view - Second departure */}
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{
                            height: isExpanded ? 'auto' : 0,
                            opacity: isExpanded ? 1 : 0,
                          }}
                          transition={{ duration: 0.3 }}
                          className="overflow-hidden border-t border-blue-300 dark:border-blue-600"
                        >
                          <div className="p-4 bg-gray-100 dark:bg-gray-700 space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                                Next departure
                              </p>
                              <button
                                onClick={() => {
                                  setExpandedTrams(prev => {
                                    const next = new Set(prev);
                                    next.delete(tramKey);
                                    return next;
                                  });
                                }}
                                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition"
                              >
                                <XMarkIcon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                              </button>
                            </div>

                            <motion.div
                              initial={{ scale: 0.95, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={{ delay: 0.1 }}
                              className="bg-white dark:bg-gray-800 rounded-lg p-4 border-2 border-gray-400 dark:border-gray-600 shadow-lg"
                            >
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3 flex-1">
                                  <div
                                    className={`${getLineColor(second.lineId)} text-white font-bold rounded-full w-12 h-12 flex items-center justify-center text-sm shadow-md flex-shrink-0`}
                                  >
                                    {second.lineShortName || second.lineId}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                                      {second.destination.length > 25
                                        ? `${second.destination.slice(0, 22)}...`
                                        : second.destination}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                <div className="bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 rounded-lg p-3">
                                  <p className="text-xs text-gray-600 dark:text-gray-300 font-semibold mb-1">
                                    TIME
                                  </p>
                                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                                    {getDepartureDisplay2(second)}
                                  </p>
                                </div>

                                <div className="bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 rounded-lg p-3">
                                  <p className="text-xs text-gray-600 dark:text-gray-300 font-semibold mb-2">
                                    OCCUPANCY
                                  </p>
                                  <div className="flex items-center justify-center gap-1">
                                    <OccupancyDisplay occupancy={second.occupancy} showError={true} />
                                  </div>
                                </div>
                              </div>

                              {second.realtime && (
                                <p className="text-xs text-green-600 dark:text-green-400 font-semibold mt-3 flex items-center gap-1">
                                  ● Real-time data
                                </p>
                              )}
                            </motion.div>

                            {group.count > 2 && (
                              <div className="text-xs text-gray-700 dark:text-gray-200 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded mb-2">
                                +{group.count - 2} more departures available
                              </div>
                            )}

                            {group.count > 2 && currentStopDetail && (() => {
                              const lineInfo = currentStopDetail.lines.find(l => l.id === departure.lineId);
                              if (!lineInfo || !lineInfo.hasTraffic) return null;

                              const detail = lineInfo.trafficDetails?.[0];
                              return (
                                <div className="relative border-2 border-yellow-500 bg-yellow-100 dark:bg-yellow-900 dark:bg-opacity-70 rounded-lg p-3 text-yellow-900 dark:text-yellow-100 pt-6">
                                  <ExclamationTriangleIcon className="absolute -top-3 -left-3 w-6 h-6 text-yellow-500" />
                                  <div>
                                    <p className="text-sm font-semibold">Disrupted traffic on line {lineInfo.shortName || lineInfo.id}</p>
                                    <p className="text-xs text-yellow-900/90 dark:text-yellow-200/80">{detail?.titre || 'Perturbation en cours'}</p>
                                    {detail?.description && (
                                      <p className="text-[10px] text-yellow-900/80 dark:text-yellow-200/80 mt-1">{detail.description}</p>
                                    )}
                                    {detail?.dateFin && (
                                      <p className="text-[10px] text-yellow-900/70 dark:text-yellow-200/70 mt-1">Fin estimée : {detail.dateFin}</p>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </motion.div>
                      </motion.div>
                    );
                  } else if (isTram) {
                    // Tramway without expandable view (single departure)
                    return (
                      <motion.div
                        key={`${departure.lineId}-${departure.destination}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="flex items-center justify-between p-3 rounded-lg transition bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <div
                            className={`${getLineColor(departure.lineId)} text-white font-bold rounded-full w-10 h-10 flex items-center justify-center text-xs shadow-md flex-shrink-0`}
                          >
                            {departure.lineShortName || departure.lineId}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {departure.destination.length > 28 ? `${departure.destination.slice(0, 25)}...` : departure.destination}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                              <MdTram className="w-3 h-3" />
                              Tram
                              {departure.realtime && ' • Live'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 ml-2">
                          <p className={`text-lg font-bold text-gray-900 dark:text-white`}>
                            {displayTime}
                          </p>
                          <OccupancyDisplay occupancy={departure.occupancy} />
                        </div>
                      </motion.div>
                    );
                  } else {
                    return (
                      <motion.div
                        key={`${departure.lineId}-${departure.destination}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className={`flex items-center justify-between p-3 rounded-lg transition ${
                          index === 0
                            ? 'bg-green-50 dark:bg-green-900 border-2 border-green-300 shadow-md'
                            : isNow
                            ? 'bg-yellow-50 dark:bg-yellow-900 border-2 border-yellow-300'
                            : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <div
                            className={`${getLineColor(departure.lineId)} text-white font-bold rounded-full w-10 h-10 flex items-center justify-center text-xs shadow-md flex-shrink-0`}
                          >
                            {departure.lineShortName || departure.lineId}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {departure.destination.length > 28
                                ? `${departure.destination.slice(0, 25)}...`
                                : departure.destination}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                              {departure.type === 'BUS' ? (
                                <>
                                  <MdDirectionsBus className="w-3 h-3" />
                                  Bus
                                </>
                              ) : (
                                <>
                                  <MdTram className="w-3 h-3" />
                                  Tram
                                </>
                              )}
                              {departure.realtime && ' • Live'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 ml-2">
                          {index === 0 && (
                            <div className="text-xs text-green-600 dark:text-green-400 font-semibold mb-1">
                              NEXT
                            </div>
                          )}
                          <p
                            className={`text-lg font-bold ${
                              index === 0
                                ? 'text-green-600 dark:text-green-400'
                                : isNow
                                ? 'text-yellow-600 dark:text-yellow-400'
                                : 'text-gray-900 dark:text-white'
                            }`}
                          >
                            {displayTime}
                          </p>
                          {second ? (
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {getDepartureDisplay(second)}
                            </p>
                          ) : minutesUntil < 30 && minutesUntil > 0 ? (
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {minutesUntil}m
                            </p>
                          ) : null}
                        </div>
                      </motion.div>
                    );
                  }
                })
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400 py-4">
                  No departures available
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal d'export */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        exportUrl={exportUrl}
        position={exportModalPos}
      />
    </motion.div>
  );
}
