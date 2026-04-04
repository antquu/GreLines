import { motion, useDragControls } from 'framer-motion';
import { XMarkIcon, EllipsisVerticalIcon, ChevronDownIcon, ChevronUpIcon, UserIcon, ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import { MdTram, MdDirectionsBus } from 'react-icons/md';
import type { StopDetail, Departure } from '../types';
import { formatDepartureTime, refreshStopDepartures } from '../services/api';
import { useEffect, useState, useRef } from 'react';

interface SidebarMobileProps {
  stop: StopDetail | null;
  isOpen: boolean;
  sidebarState: 'closed' | 'peek' | 'open';
  onClose: () => void;
  onOpen: () => void;
  initialSelectedLines?: Set<string>;
  compactMode: boolean;
  autoSync: boolean;
  refreshIntervalMs: number;
  language: 'fr' | 'en';
}

const getMinutesUntilDeparture = (departure: Departure): number => {
  return departure.departureTime;
};

const getDepartureDisplay = (departure: Departure, language: 'fr' | 'en'): string => {
  return formatDepartureTime(departure, language);
};

const getSidebarText = (language: 'fr' | 'en') => {
  const isFr = language === 'fr';
  return {
    lines: isFr ? 'Lignes' : 'Lines',
    filter: isFr ? 'Filtrer :' : 'Filter:',
    showAll: isFr ? 'Afficher tout' : 'Show all',
    exportConfiguration: isFr ? 'Exporter la configuration' : 'Export configuration',
    exportedConfiguration: isFr ? 'Configuration exportée' : 'Exported configuration',
    shareLink: isFr ? 'Lien de partage' : 'Share link',
    copy: isFr ? 'Copier' : 'Copy',
    copied: isFr ? 'Copié !' : 'Copied!',
    nextDepartures: isFr ? 'Prochains départs' : 'Next departures',
    tramway: isFr ? 'Tramway' : 'Tramway',
    bus: 'Bus',
    live: isFr ? 'Direct' : 'Live',
    nextDeparture: isFr ? 'Prochain départ' : 'Next departure',
    time: isFr ? 'Heure' : 'TIME',
    occupancy: isFr ? 'Affluence' : 'OCCUPANCY',
    realTimeData: isFr ? 'Données en temps réel' : 'Real-time data',
    disruptedTraffic: isFr ? 'Trafic perturbé sur la ligne' : 'Disrupted traffic on line',
    ongoingDisruption: isFr ? 'Perturbation en cours' : 'Ongoing disruption',
    estimatedEnd: isFr ? 'Fin estimée :' : 'Estimated end:',
    calculateItineraryWith: isFr ? 'Calculez votre itinéraire avec' : 'Calculate your itinerary with',
    nextLabel: isFr ? 'PROCHAIN' : 'NEXT',
    noDeparturesAvailable: isFr ? 'Aucun départ disponible' : 'No departures available',
  };
};

const renderDepartureTime = (timeString: string) => {
  const match = timeString.match(/^(\d+)(m)$/);
  if (match) {
    return (
      <>
        <span className="font-bold">{match[1]}</span>
        <span className="font-normal">{match[2]}</span>
      </>
    );
  }
  return timeString;
};

const normalizeHexColor = (value?: string): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  const hex = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  return /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : undefined;
};

const getContrastTextColor = (background?: string, textColor?: string): string => {
  const normalizedTextColor = normalizeHexColor(textColor);
  if (normalizedTextColor) return normalizedTextColor;
  const bg = normalizeHexColor(background);
  if (!bg) return '#FFFFFF';
  const r = parseInt(bg.slice(1, 3), 16);
  const g = parseInt(bg.slice(3, 5), 16);
  const b = parseInt(bg.slice(5, 7), 16);
  return (r * 0.299 + g * 0.587 + b * 0.114) > 186 ? '#000000' : '#FFFFFF';
};

const getLineStyle = (color?: string, textColor?: string) => {
  const backgroundColor = normalizeHexColor(color);
  if (!backgroundColor) return {};
  return {
    backgroundColor,
    color: getContrastTextColor(backgroundColor, textColor),
  };
};

const isTramway = (lineId: string): boolean => {
  const id = lineId.toUpperCase().trim();
  return ['A', 'B', 'C', 'D', 'E'].includes(id);
};

const isRoundLine = (lineId: string): boolean => {
  const id = lineId.toUpperCase().trim();
  const code = id.includes('_') ? id.split('_').pop() || id : id;
  if (['A', 'B', 'C', 'D', 'E'].includes(code)) return true;
  const match = /^C(\d+)$/.exec(code);
  return !!match && parseInt(match[1], 10) >= 1 && parseInt(match[1], 10) <= 14;
};

const getBadgeShapeClass = (isRound: boolean): string => {
  return isRound ? 'rounded-full' : 'rounded-2xl';
};

const getLineSortKey = (lineShortName?: string | null, lineId?: string): [number, string] => {
  const code = (lineShortName || lineId || '').toUpperCase().trim();
  if (code === 'A') return [0, ''];
  if (code === 'B') return [1, ''];
  if (code === 'C') return [2, ''];
  if (code === 'D') return [3, ''];
  if (code === 'E') return [4, ''];
  const cMatch = /^C(\d+)$/.exec(code);
  if (cMatch) {
    const n = parseInt(cMatch[1], 10);
    if (n >= 1 && n <= 14) return [5, n.toString().padStart(3, '0')];
    return [8, code];
  }
  const nMatch = /^(\d+)$/.exec(code);
  if (nMatch) {
    const n = parseInt(nMatch[1], 10);
    if (n >= 15 && n <= 92) return [6, n.toString().padStart(3, '0')];
    return [7, n.toString().padStart(3, '0')];
  }
  return [9, code];
};

const sortLinesByPriority = (a: { shortName?: string | null; id: string }, b: { shortName?: string | null; id: string }) => {
  const [wa, ka] = getLineSortKey(a.shortName, a.id);
  const [wb, kb] = getLineSortKey(b.shortName, b.id);
  if (wa !== wb) return wa - wb;
  return ka.localeCompare(kb, undefined, { numeric: true, sensitivity: 'base' });
};

const OccupancyDisplay = ({ occupancy, showError = false }: { occupancy?: string | null; showError?: boolean }) => {
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
    <div className="flex items-center gap-0.5" title={`Frequency: ${label}`}>
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

const getLineColor = (lineId: string): string => {
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

export const SidebarMobile = ({ stop, isOpen, sidebarState, onClose, onOpen, initialSelectedLines, compactMode, autoSync, refreshIntervalMs, language }: SidebarMobileProps) => {
  const [currentStopDetail, setCurrentStopDetail] = useState<StopDetail | null>(null);
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [selectedLines, setSelectedLines] = useState<Set<string>>(initialSelectedLines || new Set());
  const [currentStopId, setCurrentStopId] = useState<string | null>(null);
  const [expandedTrams, setExpandedTrams] = useState<Set<string>>(new Set());
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportUrl, setExportUrl] = useState('');
  const exportButtonRef = useRef<HTMLButtonElement>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isHandleDragging, setIsHandleDragging] = useState(false);
  const dragControls = useDragControls();
  const [hasAppliedInitialLines, setHasAppliedInitialLines] = useState(false);
  const text = getSidebarText(language);

  useEffect(() => {
    const stopId = stop?.id || null;
    setCurrentStopId(stopId);

    if (!stop) {
      setCurrentStopDetail(null);
      return;
    }

    setCurrentStopDetail(prev => {
      if (
        prev?.id === stop.id &&
        prev.lines?.length > 0 &&
        (!stop.lines || stop.lines.length === 0)
      ) {
        return {
          ...stop,
          lines: prev.lines,
          departures: stop.departures.length > 0 ? stop.departures : prev.departures,
          lastUpdate: stop.lastUpdate || prev.lastUpdate,
        };
      }

      return stop;
    });
  }, [stop]);

  const updateDepartures = async () => {
    if (!currentStopDetail || !isOpen || currentStopDetail.lines.length === 0) return;

    try {
      const updatedStopDetail = await refreshStopDepartures(currentStopDetail);
      setCurrentStopDetail(prev => {
        if (!prev) return updatedStopDetail;
        return {
          ...prev,
          ...updatedStopDetail,
          lines: prev.lines.length > 0 ? prev.lines : updatedStopDetail.lines,
        };
      });
    } catch (error) {
      console.error('Failed to update departures:', error);
    }
  };

  useEffect(() => {
    if (!isOpen || !currentStopDetail || currentStopDetail.lines.length === 0) return;

    updateDepartures();

    if (!autoSync) return;

    const interval = setInterval(updateDepartures, refreshIntervalMs);

    return () => clearInterval(interval);
  }, [isOpen, currentStopDetail?.id, currentStopDetail?.lines.length, autoSync, refreshIntervalMs]);

  const getDeparturePriority = (dep: Departure): number => {
    const id = dep.lineId.toUpperCase().trim();
    const name = dep.lineName.toUpperCase();

    if (id === 'A') return 1000;
    if (id === 'B') return 900;
    if (id === 'C') return 800;
    if (id === 'D') return 700;
    if (id === 'E') return 600;

    const cMatch = /^C(\d+)$/.exec(id);
    if (cMatch) {
      const n = parseInt(cMatch[1], 10);
      if (n >= 1 && n <= 14) {
        return 500 + (15 - n);
      }
    }

    const nMatch = /^(\d+)$/.exec(id);
    if (nMatch) {
      const n = parseInt(nMatch[1], 10);
      if (n >= 15 && n <= 92) {
        return 400 + (93 - n);
      }
    }

    if (name.includes('CHRONO') || id.startsWith('C')) return 50;
    if (name.includes('PROXIMO') || id.includes('PR')) return 40;
    if (name.includes('FLEXO') || id.includes('FL')) return 30;
    if (dep.type === 'TRAM' || id.startsWith('T') || name.includes('TRAM')) return 20;

    return 10;
  };

  useEffect(() => {
    if (!currentStopDetail) {
      setDepartures([]);
      return;
    }

    const futureDepartures = currentStopDetail.departures.filter(dep => getMinutesUntilDeparture(dep) >= 0);

    setDepartures(futureDepartures);
  }, [currentStopDetail]);

  useEffect(() => {
    if (initialSelectedLines && initialSelectedLines.size > 0 && !hasAppliedInitialLines) {
      setSelectedLines(new Set(initialSelectedLines));
      setHasAppliedInitialLines(true);
    } else if (!initialSelectedLines || initialSelectedLines.size === 0) {
      setSelectedLines(new Set());
      setHasAppliedInitialLines(false);
    }
  }, [currentStopId, initialSelectedLines]);

  const displayedDepartures = (() => {
    const sorted = [...departures].sort((a, b) => {
      const pa = getDeparturePriority(a);
      const pb = getDeparturePriority(b);
      if (pa !== pb) return pb - pa;

      return a.departureTime - b.departureTime;
    });

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

    return Array.from(groups.values()).sort((a, b) => {
      const pa = getDeparturePriority(a.first);
      const pb = getDeparturePriority(b.first);
      if (pa !== pb) return pb - pa;

      return a.first.departureTime - b.first.departureTime;
    });
  })();

  // Calculate the y position based on sidebar state and drag
  const getYPosition = () => {
    if (!isOpen) return '100%';

    const basePosition = sidebarState === 'peek' ? '70%' : '1%'; // 30% visible in peek, 99% open
    if (isDragging || isHandleDragging) {
      const dragY = Math.max(0, Math.min(100, dragOffset));
      return `${dragY}%`;
    }
    return basePosition;
  };

  return (
    <>
      {isOpen && (
        <div
          className={`fixed inset-0 z-40 ${sidebarState === 'open' ? 'bg-black/20 backdrop-blur-sm' : 'bg-transparent'}`}
          onClick={onClose}
        />
      )}

      <motion.div
        drag="y"
        dragControls={sidebarState === 'open' ? dragControls : undefined}
        dragListener={sidebarState === 'open' ? false : true}
        dragConstraints={{ top: 0, bottom: window.innerHeight }}
        dragElastic={0.1}
        onDragStart={() => {
          setIsDragging(true);
          if (sidebarState === 'open') {
            setIsHandleDragging(true);
          }
        }}
        onClick={(e) => e.stopPropagation()}
        onDragEnd={(_, info) => {
          setIsDragging(false);
          setIsHandleDragging(false);

          const threshold = window.innerHeight * 0.3;
          const openThreshold = window.innerHeight * 0.25;

          if (info.offset.y > threshold) {
            onClose();
          } else if (info.offset.y < -openThreshold && sidebarState !== 'open') {
            onOpen();
          } else if (sidebarState === 'peek' && info.offset.y < -threshold) {
            onOpen();
          } else {
            setDragOffset(0);
          }
        }}
        onDrag={(_, info) => {
          setDragOffset((info.offset.y / window.innerHeight) * 100);
        }}
        initial={{ y: '100%', opacity: 0 }}
        animate={{
          y: getYPosition(),
          opacity: isOpen ? 1 : 0,
        }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{
          duration: isDragging ? 0 : 0.3,
          ease: 'easeOut',
          type: isDragging ? 'tween' : 'spring',
          damping: 25,
          stiffness: 300,
        }}
        className="fixed inset-x-0 bottom-0 z-50 h-[100vh] max-h-[calc(100vh-5px)] overflow-y-auto rounded-t-3xl shadow-2xl app-panel bg-white dark:bg-gray-900"
        style={{
          touchAction: sidebarState === 'open' ? 'auto' : 'none',
        }}
    >
      {isOpen && currentStopDetail && (
        <div 
          className="p-4 pb-20"
          onClick={sidebarState === 'peek' ? onOpen : undefined}
          style={{ cursor: sidebarState === 'peek' ? 'pointer' : 'default' }}
        >
          {/* Drag handle - size closer to original and not too large visually */}
          <div
            className="flex justify-center items-center mb-4 cursor-grab h-8"
            onPointerDown={(event) => {
              if (sidebarState === 'open') {
                setIsHandleDragging(true);
                dragControls.start(event);
              }
            }}
            style={{ touchAction: 'none' }}
          >
            <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-600 rounded-full" />
          </div>
          {/* Close button */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white flex-1">
              {currentStopDetail.name}
            </h2>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition flex-shrink-0"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {currentStopDetail.city && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {currentStopDetail.city}
            </p>
          )}

          {/* Lines section */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                {text.lines}
              </h3>
              <button
                ref={exportButtonRef}
                onClick={() => {
                  let url: string;

                  if (selectedLines.size === 0) {
                    url = `/app?T1=ALL_${currentStopDetail.id}`;
                  } else {
                    const selectedLinesArray = Array.from(selectedLines).sort();
                    const params = selectedLinesArray
                      .map((lineId, index) => `T${index + 1}=${lineId}_${currentStopDetail.id}`)
                      .join('&');
                    url = `/app?${params}`;
                  }

                  setExportUrl(window.location.origin + url);
                  setIsExportModalOpen(true);
                }}
                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition"
                title={text.exportConfiguration}
              >
                <EllipsisVerticalIcon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2 mb-3">
              {[...currentStopDetail.lines].sort(sortLinesByPriority).map(line => {
                const isSelected = selectedLines.size === 0 || selectedLines.has(line.id);
                const isActive = selectedLines.has(line.id);
                const lineStyle = getLineStyle(line.color, line.textColor);
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
                      className={`${getBadgeShapeClass(isRoundLine(line.shortName || line.id))} w-12 h-12 flex items-center justify-center text-sm font-bold transition ${
                        isActive ? 'ring-2 ring-blue-500 ring-offset-1' : ''
                      } ${isSelected ? '' : 'opacity-30'} ${!lineStyle.backgroundColor ? getLineColor(line.id) : ''}`}
                      style={lineStyle}
                      title={line.name}
                    >
                      {line.shortName || line.id}
                    </button>
                    {line.hasTraffic && (
                      <div className="absolute -top-1 -right-1">
                        <ExclamationTriangleIcon className="w-4 h-4 text-yellow-400" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => setSelectedLines(new Set())}
              className="text-xs px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              {text.showAll}
            </button>
          </div>

          {/* Export Modal */}
          {isExportModalOpen && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="mb-6 bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{text.exportedConfiguration}</h3>
                <button
                  onClick={() => setIsExportModalOpen(false)}
                  className="p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition"
                >
                  <XMarkIcon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                </button>
              </div>

              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                {text.shareLink}
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={exportUrl}
                  readOnly
                  className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-gray-900 dark:text-white text-xs font-mono bg-white dark:bg-gray-700"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(exportUrl);
                    const btn = document.activeElement as HTMLButtonElement;
                    if (btn) {
                      const originalText = btn.textContent;
                      btn.textContent = text.copied;
                      btn.classList.add('bg-green-500', 'text-white');
                      setTimeout(() => {
                        btn.textContent = originalText;
                        btn.classList.remove('bg-green-500', 'text-white');
                      }, 2000);
                    }
                  }}
                  className="px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition text-xs font-medium flex-shrink-0"
                >
                  {text.copy}
                </button>
              </div>
            </motion.div>
          )}

          {/* Next departures */}
          <div>
            <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3 uppercase tracking-wider">
              {text.nextDepartures}
            </h3>
            <div className="space-y-3">
              {groupedDepartures.length > 0 ? (
                groupedDepartures.map((group, index) => {
                  const departure = group.first;
                  const second = group.second;
                  const displayTime = getDepartureDisplay(departure, language);
                  const departureLine = currentStopDetail.lines.find(l => l.id === departure.lineId || l.shortName === departure.lineShortName || l.shortName === departure.lineId);
                  const secondLine = second ? currentStopDetail.lines.find(l => l.id === second.lineId || l.shortName === second.lineShortName || l.shortName === second.lineId) : undefined;
                  const departureStyle = getLineStyle(departureLine?.color, departureLine?.textColor);
                  const secondStyle = secondLine ? getLineStyle(secondLine.color, secondLine.textColor) : undefined;
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
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div
                                className={`${getLineColor(departure.lineId)} text-white font-bold ${getBadgeShapeClass(isRoundLine(departure.lineId))} w-10 h-10 flex items-center justify-center text-sm shadow-md flex-shrink-0 overflow-hidden`}
                                style={departureStyle}
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
                                  <span>{text.tramway}</span>
                                  {departure.realtime && <span>• {text.live}</span>}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                              <div className="text-right">
                                <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{renderDepartureTime(displayTime)}</p>
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

                        {isExpanded && second && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            className="border-t border-blue-300 dark:border-blue-600 p-4 bg-gray-100 dark:bg-gray-700"
                          >
                            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase mb-3">
                              {text.nextDeparture}
                            </p>
                            <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border-2 border-gray-400 dark:border-gray-600 space-y-2">
                              <div className="flex items-center gap-3">
                                <div
                                  className={`${getLineColor(second.lineId)} text-white font-bold ${getBadgeShapeClass(isRoundLine(second.lineId))} w-10 h-10 flex items-center justify-center text-sm flex-shrink-0 overflow-hidden`}
                                  style={secondStyle}
                                >
                                  {second.lineShortName || second.lineId}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                    {second.destination.length > 20
                                      ? `${second.destination.slice(0, 17)}...`
                                      : second.destination}
                                  </p>
                                  <div className="text-xs text-gray-600 dark:text-gray-300">
                                    <MdTram className="w-4 h-4 inline mr-1" />
                                    {text.tramway} {second.realtime && `• ${text.live}`}
                                  </div>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                <div className="bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 rounded-lg p-3">
                                  <p className="text-xs text-gray-600 dark:text-gray-300 font-semibold mb-1">
                                    {text.time}
                                  </p>
                                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                                    {renderDepartureTime(getDepartureDisplay(second, language))}
                                  </p>
                                </div>

                                <div className="bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 rounded-lg p-3">
                                  <p className="text-xs text-gray-600 dark:text-gray-300 font-semibold mb-2">
                                    {text.occupancy}
                                  </p>
                                  <div className="flex items-center justify-center gap-1">
                                    {!compactMode && <OccupancyDisplay occupancy={second.occupancy} showError={true} />}
                                  </div>
                                </div>
                              </div>

                              {second.realtime && (
                                <p className="text-xs text-green-600 dark:text-green-400 font-semibold mt-3 flex items-center gap-1">
                                  ● {text.realTimeData}
                                </p>
                              )}
                            </div>

                            {group.count > 2 && (() => {
                              const lineInfo = currentStopDetail.lines.find(l => l.id === departure.lineId);
                              if (!lineInfo || !lineInfo.hasTraffic) return null;

                              const detail = lineInfo.trafficDetails?.[0];
                              return (
                                <div className="relative border-2 border-yellow-500 bg-yellow-100 dark:bg-yellow-900 dark:bg-opacity-70 rounded-lg p-3 text-yellow-900 dark:text-yellow-100 pt-6">
                                  <ExclamationTriangleIcon className="absolute -top-3 -left-3 w-6 h-6 text-yellow-500" />
                                  <div>
                                    <p className="text-sm font-semibold">{text.disruptedTraffic} {lineInfo.shortName || lineInfo.id}</p>
                                    <p className="text-xs text-yellow-900/90 dark:text-yellow-200/80">{detail?.titre || text.ongoingDisruption}</p>
                                    {detail?.description && (
                                      <p className="text-[10px] text-yellow-900/80 dark:text-yellow-200/80 mt-1">{detail.description}</p>
                                    )}
                                    {detail?.dateFin && (
                                      <p className="text-[10px] text-yellow-900/70 dark:text-yellow-200/70 mt-1">{text.estimatedEnd} {detail.dateFin}</p>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}
                          </motion.div>
                        )}
                      </motion.div>
                    );
                  }

                  // Regular bus departure - show first and second departures
                  if (second) {
                    return (
                      <motion.div
                        key={tramKey}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="border-2 border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-800 shadow-md hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                      >
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div
                              className={`${getLineColor(departure.lineId)} text-white font-bold ${getBadgeShapeClass(isRoundLine(departure.lineId))} w-10 h-10 flex items-center justify-center text-sm shadow-md flex-shrink-0 overflow-hidden`}
                              style={departureStyle}
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
                                <MdDirectionsBus className="w-4 h-4" />
                                <span>{text.bus}</span>
                                {departure.realtime && <span>• {text.live}</span>}
                              </div>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{renderDepartureTime(displayTime)}</p>
                          </div>
                        </div>

                        {/* Second departure in smaller text */}
                        <div className="flex items-center justify-end gap-2 text-sm text-gray-600 dark:text-gray-400 border-t border-gray-200 dark:border-gray-600 pt-2">
                          <span>{text.nextLabel}:</span>
                          <span className="font-semibold">{renderDepartureTime(getDepartureDisplay(second, language))}</span>
                        </div>
                      </motion.div>
                    );
                  }

                  // Single bus departure
                  return (
                    <motion.div
                      key={tramKey}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="border-2 border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-800 shadow-md hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div
                            className={`${getLineColor(departure.lineId)} text-white font-bold ${getBadgeShapeClass(isRoundLine(departure.lineId))} w-10 h-10 flex items-center justify-center text-sm shadow-md flex-shrink-0 overflow-hidden`}
                            style={departureStyle}
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
                              <MdDirectionsBus className="w-4 h-4" />
                              <span>{text.bus}</span>
                              {departure.realtime && <span>• {text.live}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{renderDepartureTime(displayTime)}</p>
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              ) : (
                <p className="text-center text-gray-500 dark:text-gray-400 py-8">{text.noDeparturesAvailable}</p>
              )}
            </div>
          </div>
          
          {/* Séparateur avec logo GreGo */}
          <div className="border-t border-gray-200 dark:border-gray-600 mt-6 pt-4">
            <a href="https://web-tag-express.vercel.app" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors cursor-pointer">
              <span>{text.calculateItineraryWith}</span>
              <img 
                src="/assets/GreGoLOGO.png" 
                alt="GreGo" 
                className="h-4 w-auto"
              />
            </a>
          </div>
        </div>
      )}
    </motion.div>
    </>
  );
};
