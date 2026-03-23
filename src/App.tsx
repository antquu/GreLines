import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { SignalIcon, MagnifyingGlassIcon, ExclamationTriangleIcon, MapPinIcon } from '@heroicons/react/24/solid';
import { Map as TransitMap, Sidebar } from './components';
import { SearchBarMobile } from './components/SearchBarMobile';
import { TrafficPanelMobile } from './components/TrafficPanelMobile';
import { SidebarMobile } from './components/SidebarMobile';
import { getAllStops, getStopDetail, getTrafficLines } from './services/api';
import type { Stop, StopDetail, TrafficDetail } from './types';
import type { MapRef } from './components/Map';

function App() {
  const [stops, setStops] = useState<Stop[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isSearchHovered, setIsSearchHovered] = useState(false);
  const [selectedStop, setSelectedStop] = useState<StopDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [initialSelectedLines, setInitialSelectedLines] = useState<Set<string>>(new Set());
  const [signalColor, setSignalColor] = useState(true);
  const [trafficInfo, setTrafficInfo] = useState<Map<string, TrafficDetail[]>>(new Map());
  const [isTrafficButtonHovered, setIsTrafficButtonHovered] = useState(false);
  const [isTrafficPanelHovered, setIsTrafficPanelHovered] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lon: number} | null>(null);
  const [locationWatchId, setLocationWatchId] = useState<number | null>(null);
  const [isLocationEnabled, setIsLocationEnabled] = useState(() => {
    return localStorage.getItem('greLines_locationEnabled') === 'true';
  });
  const [isTrafficPanelOpenMobile, setIsTrafficPanelOpenMobile] = useState(false);
  const [sidebarState, setSidebarState] = useState<'closed' | 'peek' | 'open'>('closed');

  const isSidebarOpen = sidebarState !== 'closed';

  // Handle sidebar close
  const handleSidebarClose = useCallback(() => {
    setSidebarState('closed');
    setSelectedStop(null);
  }, []);

  // Handle sidebar open fully
  const handleSidebarOpen = useCallback(() => {
    setSidebarState('open');
  }, []);

  const isTrafficPanelOpen = isTrafficButtonHovered || isTrafficPanelHovered;

  const mapRef = useRef<MapRef>(null);

  // Detect mobile viewport changes
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const normalizeStopId = (id: string | null | undefined): string | null => {
    if (!id) return null;
    if (id.startsWith('SEM:')) return id;
    return `SEM:${id}`;
  };

  const applyConfigFromParams = async (params: URLSearchParams) => {
    const selectedLinesFromUrl = new Set<string>();
    let targetStopId: string | null = null;

    params.forEach((value, key) => {
      if (key.startsWith('T')) {
        if (value.startsWith('ALL_')) {
          const stopId = value.substring(4);
          if (stopId && !targetStopId) targetStopId = stopId;
        } else if (value.includes('_')) {
          const [lineId, stopId] = value.split('_');
          if (lineId) selectedLinesFromUrl.add(lineId);
          if (!targetStopId && stopId) targetStopId = stopId;
        }
      }
    });

    if (selectedLinesFromUrl.size > 0) {
      setInitialSelectedLines(selectedLinesFromUrl);
    }

    if (targetStopId && stops.length > 0) {
      const normalizedId = normalizeStopId(targetStopId);
      const targetStop = stops.find(stop => normalizeStopId(stop.id) === normalizedId);
      if (targetStop) {
        try {
          const stopDetail = await getStopDetail(targetStop.id);
          if (stopDetail) {
            setSelectedStop(stopDetail);
            setSidebarState('open');
            if (mapRef.current) {
              mapRef.current.centerOnStop(targetStop);
            }
          }
        } catch (err) {
          console.error('Failed to load stop from URL:', err);
        }
      }
    }
  };

  const parseConfigString = async (configUrl: string) => {
    try {
      const url = configUrl.startsWith('http')
        ? new URL(configUrl)
        : new URL(configUrl, window.location.origin);
      await applyConfigFromParams(url.searchParams);
    } catch (err) {
      const q = configUrl.split('?')[1];
      if (!q) return;
      const params = new URLSearchParams(q);
      await applyConfigFromParams(params);
    }
  };

  // Parse URL parameters and apply filters automatically
  useEffect(() => {
    applyConfigFromParams(new URLSearchParams(window.location.search));
  }, [stops]);

  // Listen for clipboard paste config strings
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const pastedText = e.clipboardData?.getData('text')?.trim();
      if (!pastedText) return;

      if (pastedText.includes('?T')) {
        parseConfigString(pastedText);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [stops]);

  // Fetch all stops on mount
  useEffect(() => {
    const fetchStops = async () => {
      try {
        setIsLoading(true);
        const stopsData = await getAllStops();
        setStops(stopsData);
      } catch (err) {
        setError('Failed to load stops');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStops();
  }, []);

  // Fetch live traffic info for the new inset panel
  useEffect(() => {
    const fetchTraffic = async () => {
      try {
        const data = await getTrafficLines();
        setTrafficInfo(data);
      } catch (err) {
        console.error('Failed to load traffic info:', err);
      }
    };

    fetchTraffic();
  }, []);

  // Update time every second - this updates footer timestamp or closed status.
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
      setSignalColor(prev => !prev);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const isNetworkClosed = (date: Date) => {
    const totalMinutes = date.getHours() * 60 + date.getMinutes();
    return totalMinutes >= 60 && totalMinutes < 270; // 01:00 à 04:30
  };

  // Handle stop click - memoized so Map doesn't re-render inutilement.
  const handleStopClick = useCallback(async (stop: Stop) => {
    try {
      const stopDetail = await getStopDetail(stop.id);
      setSelectedStop(stopDetail);
      // Center the map on the clicked stop with the same zoom as search
      mapRef.current?.centerOnStop(stop);
      // Start in peek mode at 30% of the map height, user must drag up to open fully
      setSidebarState('peek');
    } catch (err) {
      console.error('Failed to fetch stop details:', err);
    }
  }, []);

  // Handle location button click
  const handleLocationClick = useCallback(() => {
    if (!navigator.geolocation) {
      console.error('Geolocation is not supported by this browser');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setCurrentLocation({ lat: latitude, lon: longitude });
        setIsLocationEnabled(true);
        localStorage.setItem('greLines_locationEnabled', 'true');
        mapRef.current?.centerOnLocation(latitude, longitude);
      },
      (error) => {
        console.error('Error getting location:', error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 10000,
      }
    );

    // Start background tracking for marker-only updates (no forced recenter)
    if (locationWatchId !== null) {
      navigator.geolocation.clearWatch(locationWatchId);
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setCurrentLocation({ lat: latitude, lon: longitude });
      },
      (error) => {
        console.error('Error watching location:', error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 10000,
      }
    );

    setLocationWatchId(watchId);
  }, [locationWatchId]);

  // Auto-center on location when page loads if location was previously enabled
  useEffect(() => {
    if (isLocationEnabled && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setCurrentLocation({ lat: latitude, lon: longitude });
          mapRef.current?.centerOnLocation(latitude, longitude);
        },
        (error) => {
          console.error('Error getting initial location:', error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000, // 1 minute
        }
      );
    }
  }, [isLocationEnabled]);

  const matchedStops = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];

    return stops.filter((stop) =>
      stop.name.toLowerCase().includes(q) ||
      (stop.city?.toLowerCase().includes(q) ?? false) ||
      stop.id.toLowerCase().includes(q)
    );
  }, [searchQuery, stops]);

  const mapElement = useMemo(() => {
    return (
      <TransitMap
        ref={mapRef}
        stops={stops}
        selectedStop={selectedStop}
        currentLocation={currentLocation}
        onStopClick={handleStopClick}
      />
    );
  }, [stops, selectedStop, currentLocation, handleStopClick]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-white dark:bg-gray-950">
      {/* Full-screen Map */}
      <div className="absolute inset-0 z-0">
        {isLoading ? (
          <div className="fixed inset-0 z-[9999] h-screen w-screen flex flex-col items-center justify-center bg-black bg-opacity-95 pointer-events-auto">
            {/* Logo GreLines au milieu */}
            <div className="flex-1 flex items-center justify-center">
              <img
                src="/assets/GreLinesLOGO.png"
                alt="GreLines Loading"
                className="w-80 h-auto animate-pulse-opacity"
              />
            </div>

            {/* Logo M-Reso en bas */}
            <div className="pb-16">
              <img
                src="/assets/M-Reso.png"
                alt="M-Reso"
                className="w-28 h-auto"
              />
            </div>
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center bg-red-50 dark:bg-red-950">
            <div className="text-center">
              <svg
                className="h-12 w-12 text-red-600 mx-auto mb-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4v2m0 0v2m0-6v-2m0 0V7a2 2 0 012-2h2.586a1 1 0 00.707-.293l-2.414-2.414a1 1 0 00-1.414 1.414L10.586 7H8a2 2 0 00-2 2v2m0 0H4m0 0v2a2 2 0 002 2h2v2m0 0v2a2 2 0 002 2h2m0 0h2a2 2 0 002-2v-2m0 0V9"
                />
              </svg>
              <p className="text-red-600 dark:text-red-400">{error}</p>
            </div>
          </div>
        ) : (
          mapElement
        )}
      </div>

      {/* Search bar & Traffic Panel */}
      {!isLoading && (
        <>
          {isMobile && !isSidebarOpen && (
            <SearchBarMobile
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              matchedStops={matchedStops}
              onStopClick={(stop) => {
                handleStopClick(stop);
                mapRef.current?.centerOnStop(stop);
              }}
              isFocused={isSearchFocused}
              onFocus={setIsSearchFocused}
            />
          )}

          {isMobile && !isSidebarOpen && (
            <motion.button
                onClick={handleLocationClick}
                className="fixed z-60 w-10 h-10 rounded-full flex items-center justify-center cursor-pointer border-2 border-gray-300 dark:border-gray-700 bg-white/85 dark:bg-slate-900/85 hover:bg-white dark:hover:bg-slate-900 transition-all duration-300 ease-out shadow-lg"
                animate={{
                  top: '60px',
                  left: '16px',
                  scale: 1,
                  opacity: isSearchFocused ? 0 : 1
                }}
                initial={{ scale: 0, opacity: 0 }}
                transition={{
                  opacity: { duration: 0.3, ease: 'easeOut' },
                  default: { duration: 0 }
                }}
                title="Center on my location"
              >
                <MapPinIcon className="w-5 h-5 text-black dark:text-white" />
              </motion.button>
          )}

          {isMobile && !isSidebarOpen && (
            <motion.button
                onClick={() => setIsTrafficPanelOpenMobile(!isTrafficPanelOpenMobile)}
                className="fixed z-60 w-10 h-10 rounded-full flex items-center justify-center cursor-pointer border-2 border-amber-600 bg-yellow-400 hover:bg-yellow-500 transition-all duration-300 ease-out shadow-lg"
                animate={{
                  top: '104px',
                  left: '16px',
                  scale: 1,
                  opacity: isSearchFocused ? 0 : 1
                }}
                initial={{ scale: 0, opacity: 0 }}
                transition={{
                  opacity: { duration: 0.3, ease: 'easeOut' },
                  default: { duration: 0 }
                }}
                title="Show traffic info"
              >
                <ExclamationTriangleIcon className="w-5 h-5 text-white" />
              </motion.button>
          )}

          {!isMobile && (
            <div className="fixed top-4 left-4 z-50 flex items-start gap-2">
              <div
                onMouseEnter={() => setIsSearchHovered(true)}
                onMouseLeave={() => setIsSearchHovered(false)}
                className={`relative h-10 transition-[width] duration-300 ease-out ${
                  isSearchFocused || isSearchHovered ? 'w-96' : 'w-10'
                } group`}
              >
                <div className="absolute inset-0 bg-white/85 dark:bg-slate-900/85 border border-gray-300 dark:border-gray-700 shadow-lg rounded-full transition-all duration-300" />

                <div className="relative h-full flex items-center pr-2">
                  <div
                    className={`absolute z-20 flex items-center justify-center h-full ${
                      isSearchFocused || isSearchHovered
                        ? 'left-5 -translate-x-0'
                        : 'left-1/2 -translate-x-1/2'
                    }`}
                  >
                    <MagnifyingGlassIcon className="w-5 h-5 text-black dark:text-white" />
                  </div>
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setIsSearchFocused(true)}
                    onBlur={() => setIsSearchFocused(false)}
                    placeholder="Search for a stop..."
                    className="h-full pl-10 pr-4 bg-transparent border-none outline-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 transition-all duration-300 ease-out opacity-0 w-0 group-hover:opacity-100 group-hover:w-[calc(100%-48px)] focus:opacity-100 focus:w-[calc(100%-48px)]"
                    autoComplete="off"
                  />
                  {searchQuery && (isSearchFocused || isSearchHovered) && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
                      type="button"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {(isSearchFocused || isSearchHovered) && searchQuery.trim() !== '' && matchedStops.length > 0 && (
                  <div className="absolute left-0 top-12 mt-1 w-full max-h-72 overflow-auto bg-white/95 dark:bg-slate-900/95 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl">
                    {matchedStops.map((stop) => (
                      <button
                        key={stop.id}
                        onClick={() => {
                          handleStopClick(stop);
                          mapRef.current?.centerOnStop(stop);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-slate-800 transition"
                      >
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{stop.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{stop.city || 'Unknown city'}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {!isMobile && (
                <div
                  onMouseEnter={() => setIsTrafficButtonHovered(true)}
                  onMouseLeave={() => setIsTrafficButtonHovered(false)}
                  className="relative z-50"
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center cursor-pointer border border-amber-600 transition-all duration-300 ${
                      isTrafficPanelOpen
                        ? 'w-96 h-72 rounded-2xl bg-amber-800 border-amber-700'
                        : 'bg-yellow-400'
                    }`}
                  >
                    <ExclamationTriangleIcon className="w-5 h-5 text-white" />

                    <div
                      onMouseEnter={() => setIsTrafficPanelHovered(true)}
                      onMouseLeave={() => setIsTrafficPanelHovered(false)}
                      className={`absolute top-0 left-0 z-50 transition-all duration-300 ease-out ${
                        isTrafficPanelOpen
                          ? 'opacity-100 pointer-events-auto'
                          : 'opacity-0 pointer-events-none'
                      }`}
                      style={{ width: '100%', height: '100%' }}
                    >
                      <div className="h-full w-full overflow-y-auto rounded-2xl border border-amber-600 bg-[#5c3d04] p-3 text-amber-50 shadow-2xl">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-amber-200 mb-2">Live traffic info</h3>
                        {trafficInfo.size === 0 ? (
                          <div className="text-xs text-amber-200">No known incidents at the moment.</div>
                        ) : (
                          <div className="space-y-2">
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
                                <div key={line} className="rounded-md bg-amber-700/30 p-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-bold text-amber-100">Line {line}</span>
                                    <span className="text-[10px] text-amber-200">{sortedDetails.length} incidents</span>
                                  </div>
                                  {sortedDetails.map((detail, index) => (
                                    <div key={`${line}-${index}`} className="text-xs text-amber-100 mt-1 border-t border-amber-600/50 pt-1">
                                      <div className="font-semibold">{detail.titre}</div>
                                      <div>{detail.description}</div>
                                      <div className="text-[11px] text-amber-200">End: {detail.dateFin || 'N/A'}</div>
                                    </div>
                                  ))}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <TrafficPanelMobile
        isOpen={isTrafficPanelOpenMobile}
        onClose={() => setIsTrafficPanelOpenMobile(false)}
        trafficInfo={trafficInfo}
      />

      {/* Sidebar - Desktop */}
      {!isMobile && (
        <Sidebar
          stop={selectedStop}
          isOpen={isSidebarOpen}
          onClose={handleSidebarClose}
          initialSelectedLines={initialSelectedLines}
        />
      )}

      {/* Sidebar - Mobile */}
      {isMobile && (
        <SidebarMobile
          stop={selectedStop}
          isOpen={isSidebarOpen}
          sidebarState={sidebarState}
          onClose={handleSidebarClose}
          onOpen={handleSidebarOpen}
          initialSelectedLines={initialSelectedLines}
        />
      )}

      {/* Overlay backdrop */}
      {sidebarState === 'open' && (
        <div
          className="fixed inset-0 bg-black/10 backdrop-blur-sm z-20 lg:hidden"
          onClick={handleSidebarClose}
        />
      )}

      {/* Footer - Live Time / Network Closed */}
      <div className="fixed bottom-0 left-0 right-0 h-10 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 z-50 shadow-lg">
        {isNetworkClosed(currentTime) ? (
          <div className="w-full h-full flex items-center justify-center text-sm font-bold text-red-600 dark:text-red-300">
            NETWORK CURRENTLY CLOSED
          </div>
        ) : (
          <div className="h-full flex items-center justify-between px-4">
            {/* Left: By Antquu */}
            <a
              href="https://github.com/antquu"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-900 dark:text-white text-xs font-medium hover:text-blue-600 dark:hover:text-blue-400 transition cursor-pointer"
            >
              By Antquu
            </a>

            {/* Right: Live Time */}
            <div className="flex items-center gap-1.5">
              <SignalIcon
                className={`w-4 h-4 transition-colors duration-300 ${
                  signalColor
                    ? 'text-blue-600'
                    : 'text-gray-900 dark:text-white'
                }`}
              />
              <p className="text-gray-900 dark:text-white font-mono font-medium text-xs">
                {currentTime.toLocaleTimeString('fr-FR')}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
