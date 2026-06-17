import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { MagnifyingGlassIcon, ExclamationTriangleIcon, MapIcon, MapPinIcon, Cog6ToothIcon, XMarkIcon, StopCircleIcon, StarIcon, FunnelIcon } from '@heroicons/react/24/solid';
import { resolveLineBackgroundColor } from './utils/lineColors';
import { useFavorites } from './hooks/useFavorites';
import { useFavoriteDetails } from './hooks/useFavoriteDetails';
import { removeFavoriteAndNotify } from './services/favorites';
import { FavoriteCard } from './components/FavoriteCard';
import { getAllSemLines, buildLineLookup, type AllLinesLine } from './services/allLines';
import { LineBadge } from './components/LineBadge';
import { Map as TransitMap, Sidebar } from './components';
import { SearchBarMobile } from './components/SearchBarMobile';
import { RouteSidebar } from './components/RouteSidebar';
import { TrafficPanelMobile } from './components/TrafficPanelMobile';
import { SidebarMobile } from './components/SidebarMobile';
import { HomeSheet } from './components/HomeSheet';
import { SettingsPanel } from './components/SettingsPanel';
import { AddressSidebar } from './components/AddressSidebar';
import { ClockSignal } from './components/ClockSignal';
import { getStopDetail, getStopLines, getStopsByPrefixes, getTrafficLines, getDepartures, type RouteLocation, type RouteItinerary } from './services/api';
import { searchAddresses, reverseGeocode, type AddressResult } from './services/geocoding';
import { getLinesGeometryPrecise, getStopsServedByLines, type LineGeometry, type ServedStopPoint } from './services/lineShapes';
import type { Stop, StopDetail, TrafficDetail } from './types';
import type { MapRef } from './components/Map';
import { useStopUrlSync } from './hooks/useStopUrlSync';
import { useDebouncedValue } from './hooks/useDebouncedValue';
import type { LineFamily } from './services/allLines';
import { stripHtml } from './utils/stripHtml';

function App() {
  const [stops, setStops] = useState<Stop[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isSearchHovered, setIsSearchHovered] = useState(false);
  const [selectedStop, setSelectedStop] = useState<StopDetail | null>(null);
  const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [initialSelectedLines, setInitialSelectedLines] = useState<Set<string>>(new Set());
  /**
   * `true` once the initial URL has been parsed (regardless of whether it
   * pointed at a stop or not). Until then, `useStopUrlSync` is disabled so
   * a deep-link URL isn't clobbered before the app hydrates from it.
   */
  const [urlHydrated, setUrlHydrated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [trafficInfo, setTrafficInfo] = useState<Map<string, TrafficDetail[]>>(new Map());
  const [isRouteSidebarOpen, setIsRouteSidebarOpen] = useState(false);
  const [routeFrom, setRouteFrom] = useState<RouteLocation | null>(null);
  const [routeTo, setRouteTo] = useState<RouteLocation | null>(null);
  const [selectedRouteItinerary, setSelectedRouteItinerary] = useState<RouteItinerary | null>(null);
  const [sharedRouteExpired, setSharedRouteExpired] = useState(false);
  const [sharedRouteTarget, setSharedRouteTarget] = useState<{ dep?: string; arr?: string; dur?: string } | null>(null);
  const [isTrafficButtonHovered, setIsTrafficButtonHovered] = useState(false);
  const [isTrafficPanelHovered, setIsTrafficPanelHovered] = useState(false);
  // Desktop favorites panel — same hover-to-expand pattern as the traffic
  // panel. Open while either the trigger button OR the panel itself is hovered,
  // so the cursor can travel from one to the other without the panel closing.
  const [isFavBtnHovered, setIsFavBtnHovered] = useState(false);
  const [isFavPanelHovered, setIsFavPanelHovered] = useState(false);
  // Desktop traffic panel filter — mirrors TrafficPanelMobile's filter tabs.
  // "all" by default; flips between tram/chrono/bus to slice the incident list.
  const [desktopTrafficFilter, setDesktopTrafficFilter] = useState<'all' | LineFamily>('all');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lon: number} | null>(null);
  const [locationWatchId, setLocationWatchId] = useState<number | null>(null);
  const [searchHistoryItems, setSearchHistoryItems] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('greLines_searchHistoryItems');
      return saved ? (JSON.parse(saved) as string[]).slice(0, 4) : [];
    } catch { return []; }
  });
  const [isTrafficPanelOpenMobile, setIsTrafficPanelOpenMobile] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  /**
   * Mobile-only nearby-stops bottom sheet. Opens automatically when the user
   * lands on the site if they previously enabled location (`autoLocation`).
   * Can only be closed via its X button — drag/dismiss is disabled.
   */
  const [isNearbySheetOpen, setIsNearbySheetOpen] = useState(false);
  /**
   * Live "openness" of the home sheet as a fraction of the viewport height
   * (0 = collapsed, 1 = full). The HomeSheet pushes updates here on every
   * animation frame during drag, so we can animate things that follow the
   * sheet (e.g. the floating geolocation button) without any snapping.
   */
  const sheetProgress = useMotionValue(0.15);
  /**
   * Increment this to ask the HomeSheet to collapse back to its mini snap.
   * We bump it every time a foreground sheet opens on top, so the home sheet
   * is back at its initial position when the user closes the foreground.
   */
  const [snapHomeToMiniSignal, setSnapHomeToMiniSignal] = useState(0);
  /** Bumping this asks the HomeSheet to snap up to its mid position (0.6). */
  const [openHomeSheetSignal, setOpenHomeSheetSignal] = useState(0);
  /**
   * Derived motion values for the floating geoloc button: its `bottom` offset
   * follows the top edge of the sheet (with a small gap), and it fades out as
   * the sheet approaches full screen.
   */
  const geolocButtonBottom = useTransform(sheetProgress, p => {
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    return `${Math.round(p * vh + 12)}px`;
  });
  const geolocButtonOpacity = useTransform(sheetProgress, [0, 0.85, 1], [1, 1, 0]);
  const geolocButtonScale = useTransform(sheetProgress, [0, 0.85, 1], [1, 1, 0.85]);
  /**
   * Search bar opacity: fades out as sheet opens, becomes invisible when fully open
   */
  const searchBarOpacity = useTransform(sheetProgress, [0, 0.6, 1], [1, 0.5, 0]);
  const [sidebarState, setSidebarState] = useState<'closed' | 'peek' | 'open'>('closed');
  const [activeSettingsTab, setActiveSettingsTab] = useState('general');
  const [settingsState, setSettingsState] = useState<'closed' | 'peek' | 'open'>('closed');
  const isSettingsOpen = settingsState !== 'closed';
  const settingsContentRef = useRef<HTMLDivElement>(null);
  const settingsPanelRef = useRef<HTMLDivElement>(null);
  const desktopSearchInputRef = useRef<HTMLInputElement>(null);
  const [appData, setAppData] = useState<{version: string; credits: Array<{role: string; name: string; link?: string}>} | null>(null);

  const [language, setLanguage] = useState<'fr' | 'en'>(() => {
    const saved = localStorage.getItem('greLines_language');
    return saved === 'en' ? 'en' : 'fr';
  });

  const [theme, setTheme] = useState<'light' | 'dark' | 'auto'>(() => {
    return (localStorage.getItem('greLines_theme') as 'light' | 'dark' | 'auto') || 'dark';
  });
  const [fontSize, setFontSize] = useState<'small' | 'normal' | 'large'>(() => {
    return (localStorage.getItem('greLines_fontSize') as any) || 'normal';
  });
  const [compactMode, setCompactMode] = useState(() => localStorage.getItem('greLines_compactMode') === 'true');
  const [refreshInterval, setRefreshInterval] = useState<'15s' | '30s' | '1m' | '2m'>(() => {
    return (localStorage.getItem('greLines_refreshInterval') as any) || '30s';
  });
  const [searchHistory, setSearchHistory] = useState(() => localStorage.getItem('greLines_searchHistory') !== 'false');
  const [autoSync, setAutoSync] = useState(() => localStorage.getItem('greLines_autoSync') !== 'false');
  const [autoLocation, setAutoLocation] = useState(() => localStorage.getItem('greLines_autoLocation') === 'true');

  // Address search results (BAN geocoder), the currently picked address marker,
  // and the geometries of the lines currently filtered in the open stop.
  const [addressResults, setAddressResults] = useState<AddressResult[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<AddressResult | null>(null);
  const [lineGeometries, setLineGeometries] = useState<LineGeometry[]>([]);
  /**
   * When a line filter is active inside the open stop, this holds the lat/lon
   * positions of every stop served by those lines. The map then matches local
   * stops by proximity (id formats differ between MTAG endpoints, so we can't
   * compare ids reliably — we compare positions instead).
   * Null means "no filter active" → show all stops.
   */
  const [servedStopPoints, setServedStopPoints] = useState<ServedStopPoint[] | null>(null);
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 250);

  // Match stops against the (live) search query — used both by the dropdown
  // and to gate the address geocoder so we don't hit the network when stop
  // matches alone are plenty.
  const matchedStops = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return stops.filter(stop =>
      stop.name.toLowerCase().includes(q) ||
      (stop.city?.toLowerCase().includes(q) ?? false) ||
      stop.id.toLowerCase().includes(q)
    );
  }, [searchQuery, stops]);

  const isSidebarOpen = sidebarState !== 'closed';

  /**
   * On first paint, redirect bare `/` to `/app` so the canonical home is `/app`.
   * If the URL already has a stop config (`?T1=...`) or any search params, we
   * stay put — this preserves shared/bookmarked links like `/?T1=25_SEM:CAB`.
   * The app opens directly in French by default, with `/app` as the canonical
   * route.
   */
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    const { pathname, search, hash } = window.location;
    const isReservedRoute = pathname.startsWith('/app');
    if (pathname !== '/app' && !search && !isReservedRoute) {
      // Use replaceState so the user's "back" button still works as expected.
      window.history.replaceState(window.history.state, '', `/app${hash || ''}`);
    }
  }, []);

  // Reset selectedLines when the user opens a different stop, unless we just
  // hydrated from URL params (initialSelectedLines).
  useEffect(() => {
    if (!selectedStop) {
      setSelectedLines(new Set());
      return;
    }
    // When initialSelectedLines was set from URL, sync them in once per stop.
    if (initialSelectedLines.size > 0) {
      setSelectedLines(new Set(initialSelectedLines));
      setInitialSelectedLines(new Set()); // consume — only apply once
      return;
    }
    // Auto-show the line trace when this stop has exactly one line. Saves the
    // user a click and gives them an immediate visual hint of where it goes.
    if (selectedStop.lines && selectedStop.lines.length === 1) {
      setSelectedLines(new Set([selectedStop.lines[0].id]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStop?.id, selectedStop?.lines?.length]);

  // URL sync: stop + selected lines → /<path>?T1=...&T2=... (no reload).
  // We disable the sync until the initial URL has been parsed (`urlHydrated`),
  // otherwise on first paint `selectedStop` is null and the hook would
  // overwrite a deep-link URL like "/app?T1=ALL_SEM:CHAVANT" with just "/app".
  useStopUrlSync({
    stopId: selectedStop?.id ?? null,
    selectedLines,
    enabled: urlHydrated,
  });

  // Address geocoding — only fires when there are fewer than 4 matching stops,
  // so common stop searches (where stops dominate) don't pay the network cost.
  // We re-evaluate on every debounced query change AND when matchedStops shrinks
  // past the threshold (e.g. user types more letters and stops drop off).
  useEffect(() => {
    const trimmed = debouncedSearchQuery.trim();
    if (trimmed.length < 3 || matchedStops.length >= 4) {
      setAddressResults([]);
      return;
    }
    const ctrl = new AbortController();
    let active = true;
    searchAddresses(trimmed, { limit: 5, signal: ctrl.signal })
      .then(results => {
        if (!active) return;
        setAddressResults(results);
      })
      .catch(() => {
        if (active) setAddressResults([]);
      });
    return () => {
      active = false;
      ctrl.abort();
    };
  }, [debouncedSearchQuery, matchedStops.length]);

  // Full SEM line catalogue (with real MTAG colours), fetched once at mount.
  // Used by route previews, itinerary vectors and traffic panels.
  const [allLines, setAllLines] = useState<AllLinesLine[]>([]);
  useEffect(() => {
    getAllSemLines().then(setAllLines);
  }, []);
  const allLinesLookup = useMemo(() => buildLineLookup(allLines), [allLines]);

  // Line geometries — when the user filters by line(s) inside an open stop,
  // fetch and display the polyline of each filtered line, AND the set of
  // stops served by those lines so the map can hide everything else. With
  // no filter (selectedLines empty = "all"), we don't show any polyline and
  // we keep all stops visible.
  useEffect(() => {
    if (!selectedStop || selectedLines.size === 0) {
      setLineGeometries([]);
      setServedStopPoints(null);
      return;
    }
    const linesToFetch = selectedStop.lines?.filter(l => selectedLines.has(l.id)) || [];
    if (linesToFetch.length === 0) {
      setLineGeometries([]);
      setServedStopPoints(null);
      return;
    }
    let active = true;

    Promise.all([
      getLinesGeometryPrecise(linesToFetch),
      getStopsServedByLines(linesToFetch),
    ]).then(([geos, served]) => {
      if (!active) return;

      // Inject each line's official colour into every feature's properties so
      // the map layer can read `['get','color']` and tint each polyline correctly.
      const enriched = geos.map(g => {
        const matchKey = g.code.replace(/^SEM_/, '');
        const line = linesToFetch.find(l => {
          const candidates = [l.id, l.shortName].filter(Boolean).map(s => String(s).toUpperCase());
          return candidates.includes(matchKey);
        });
        const resolved = allLinesLookup.get(matchKey) || allLinesLookup.get(line?.shortName?.toUpperCase().trim() || '');
        const color = resolveLineBackgroundColor(resolved?.color || line?.color, matchKey);
        return {
          ...g,
          geojson: {
            ...g.geojson,
            features: g.geojson.features.map(f => ({
              ...f,
              properties: { ...(f.properties || {}), color },
            })),
          },
        };
      });
      setLineGeometries(enriched);

      setServedStopPoints(served);
    });
    return () => { active = false; };
  }, [selectedStop?.id, selectedStop?.lines, selectedLines, allLinesLookup]);

  useLayoutEffect(() => {
    localStorage.setItem('greLines_theme', theme);
    const root = document.documentElement;
    const body = document.body;

    const applyMode = (isDark: boolean) => {
      root.classList.toggle('dark', isDark);
      body.classList.toggle('dark', isDark);
      root.style.colorScheme = isDark ? 'dark' : 'light';
      body.style.colorScheme = isDark ? 'dark' : 'light';
    };

    const prefersDarkMedia = window.matchMedia('(prefers-color-scheme: dark)');

    const updateThemeMode = (prefersDark: boolean) => {
      if (theme === 'auto') applyMode(prefersDark);
      else applyMode(theme === 'dark');
    };

    updateThemeMode(prefersDarkMedia.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      if (theme === 'auto') applyMode(e.matches);
    };

    prefersDarkMedia.addEventListener('change', handleChange);
    return () => prefersDarkMedia.removeEventListener('change', handleChange);
  }, [theme]);

  const handleSidebarClose = useCallback(() => {
    setSidebarState('closed');
    setSelectedStop(null);
    setSelectedLines(new Set());
  }, []);

  const handleSidebarOpen = useCallback(() => setSidebarState('open'), []);

  const isTrafficPanelOpen = isTrafficButtonHovered || isTrafficPanelHovered;
  const isFavPanelOpen = isFavBtnHovered || isFavPanelHovered;
  // Live favourites list + their detail (lines + departures, refreshed every 30s).
  // Used by both the desktop panel and indirectly by HomeSheet on mobile.
  const favoritesList = useFavorites();
  // Only fetch detail when the desktop panel is actually visible OR on mobile
  // (HomeSheet uses its own internal hook). This keeps the desktop quiet
  // until the user hovers the favorites button.
  const favoritesDetails = useFavoriteDetails(favoritesList, !isMobile && isFavPanelOpen);

  /**
   * Resolve a raw traffic-info line name ("A", "C1", "16", "TPV") to its
   * family. Primary source is the MTAG route catalogue (`allLinesLookup`),
   * which has the exact MTAG type. Fallback to a regex-based guess so the
   * filter still works during the brief window where the catalogue hasn't
   * loaded yet.
   */
  const getLineCategory = useCallback(
    (line: string): LineFamily => {
      const n = line.trim().toUpperCase();
      const resolved = allLinesLookup.get(n);
      if (resolved) return resolved.family;
      // Catalogue not loaded yet — best-effort guess based on the line code
      // shape. Same buckets as the catalogue uses.
      if (['A', 'B', 'C', 'D', 'E'].includes(n)) return 'tram';
      if (/^C\d+$/.test(n)) return 'chrono';
      const asNum = Number(n);
      if (!isNaN(asNum)) {
        if (asNum >= 11 && asNum <= 29) return 'proximo';
        if (asNum >= 30 && asNum <= 99) return 'flexo';
      }
      return 'other';
    },
    [allLinesLookup]
  );

  const mapRef = useRef<MapRef>(null);
  const [mapPickTarget, setMapPickTarget] = useState<'from' | 'to' | null>(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (settingsState === 'closed') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSettingsState('closed');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settingsState]);

  useEffect(() => {
    if (settingsState !== 'peek' || !settingsPanelRef.current) return;
    const panelDiv = settingsPanelRef.current;
    let hasInteracted = false;
    const handleInteraction = () => { if (!hasInteracted) { hasInteracted = true; setSettingsState('open'); } };
    const handleScroll = (e: Event) => { if ((e.target as HTMLDivElement).scrollTop > 10) setSettingsState('open'); };
    panelDiv.addEventListener('click', handleInteraction);
    panelDiv.addEventListener('touchstart', handleInteraction);
    settingsContentRef.current?.addEventListener('scroll', handleScroll);
    return () => {
      panelDiv.removeEventListener('click', handleInteraction);
      panelDiv.removeEventListener('touchstart', handleInteraction);
      settingsContentRef.current?.removeEventListener('scroll', handleScroll);
    };
  }, [settingsState]);

  const normalizeStopId = (id: string | null | undefined): string | null => {
    if (!id) return null;
    if (/^SEM:/.test(id)) return id;
    return `SEM:${id}`;
  };

  /**
   * Parse a single T<n>= value. Stop ids contain ":" (e.g. "SEM:CHAVANT") so we
   * split on the *first* "_" only.
   */
  const parseTValue = (value: string): { lineId: string | null; stopId: string | null } => {
    const idx = value.indexOf('_');
    if (idx === -1) return { lineId: null, stopId: null };
    const lineId = value.slice(0, idx);
    const stopId = value.slice(idx + 1);
    return {
      lineId: lineId === 'ALL' ? null : lineId,
      stopId,
    };
  };

  const parseSharedRouteLocation = (params: URLSearchParams, prefix: 'from' | 'to'): RouteLocation | null => {
    const id = params.get(`${prefix}Id`);
    const label = params.get(`${prefix}Label`);
    const lat = Number(params.get(`${prefix}Lat`));
    const lon = Number(params.get(`${prefix}Lon`));
    const kind = params.get(`${prefix}Kind`);
    if (!id || !label || !Number.isFinite(lat) || !Number.isFinite(lon) || (kind !== 'stop' && kind !== 'address')) {
      return null;
    }

    const stop = kind === 'stop'
      ? stops.find(candidate => normalizeStopId(candidate.id) === normalizeStopId(id))
      : null;

    return {
      id,
      label: stop?.name || label,
      lat: stop?.lat ?? lat,
      lon: stop?.lon ?? lon,
      kind,
      raw: stop || undefined,
    };
  };

  const resetRoutePlanner = () => {
    setIsRouteSidebarOpen(false);
    setRouteFrom(null);
    setRouteTo(null);
    setSelectedRouteItinerary(null);
    setMapPickTarget(null);
    setSharedRouteExpired(false);
    setSharedRouteTarget(null);
  };

  const openRouteFromStop = useCallback((stop: StopDetail) => {
    const location: RouteLocation = {
      id: stop.id,
      label: stop.name,
      lat: stop.lat,
      lon: stop.lon,
      kind: 'stop',
      raw: stop,
    };
    setRouteFrom(location);
    setRouteTo(null);
    setSelectedRouteItinerary(null);
    setMapPickTarget(null);
    setSharedRouteExpired(false);
    setSharedRouteTarget(null);
    setSelectedAddress(null);
    setSelectedStop(null);
    setSidebarState('closed');
    setIsRouteSidebarOpen(true);
    mapRef.current?.centerOnLocation(stop.lat, stop.lon);
  }, []);

  const applyConfigFromParams = async (params: URLSearchParams) => {
    if (params.get('route') === '1') {
      const sharedFrom = parseSharedRouteLocation(params, 'from');
      const sharedTo = parseSharedRouteLocation(params, 'to');
      const expiresAt = Number(params.get('expiresAt'));
      const isExpiredSharedJourney =
        params.get('sharedJourney') === '1' &&
        Number.isFinite(expiresAt) &&
        expiresAt < Date.now();
      if (sharedFrom || sharedTo) {
        setRouteFrom(sharedFrom);
        setRouteTo(sharedTo);
        setSelectedRouteItinerary(null);
        setIsRouteSidebarOpen(true);
        setSharedRouteExpired(isExpiredSharedJourney);
        setSharedRouteTarget(isExpiredSharedJourney ? null : {
          dep: params.get('journeyDep') || undefined,
          arr: params.get('journeyArr') || undefined,
          dur: params.get('journeyDur') || undefined,
        });
        setSelectedStop(null);
        const focus = sharedFrom || sharedTo;
        if (focus) mapRef.current?.centerOnLocation(focus.lat, focus.lon);
      }
    }

    const selectedLinesFromUrl = new Set<string>();
    let targetStopId: string | null = null;
    params.forEach((value, key) => {
      if (!key.startsWith('T')) return;
      const { lineId, stopId } = parseTValue(value);
      if (lineId) selectedLinesFromUrl.add(lineId);
      if (!targetStopId && stopId) targetStopId = stopId;
    });
    if (selectedLinesFromUrl.size > 0) setInitialSelectedLines(selectedLinesFromUrl);
    if (targetStopId && stops.length > 0) {
      const normalizedId = normalizeStopId(targetStopId);
      const targetStop = stops.find(stop => normalizeStopId(stop.id) === normalizedId);
      if (targetStop) {
        try {
          const stopDetail = await getStopDetail(targetStop.id);
          if (stopDetail) {
            setSelectedStop(stopDetail);
            setSidebarState('open');
            mapRef.current?.centerOnStop(targetStop);
          }
        } catch (err) {}
      }
    }
  };

  const parseConfigString = async (configUrl: string) => {
    try {
      const url = configUrl.startsWith('http') ? new URL(configUrl) : new URL(configUrl, window.location.origin);
      await applyConfigFromParams(url.searchParams);
    } catch {
      const q = configUrl.split('?')[1];
      if (!q) return;
      await applyConfigFromParams(new URLSearchParams(q));
    }
  };

  useEffect(() => {
    // Only run once stops are loaded — applyConfigFromParams needs them to
    // resolve a stop id from the URL.
    if (stops.length === 0) return;
    let active = true;
    applyConfigFromParams(new URLSearchParams(window.location.search))
      .finally(() => {
        // Mark hydrated regardless of whether the URL pointed at a known stop.
        // After this, the URL sync hook is allowed to start overwriting the URL.
        if (active) setUrlHydrated(true);
      });
    return () => { active = false; };
  }, [stops]);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const pastedText = e.clipboardData?.getData('text')?.trim();
      if (pastedText?.includes('?T')) parseConfigString(pastedText);
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [stops]);

  useEffect(() => {
    fetch('/grelines.json')
      .then(r => r.json())
      .then(data => setAppData(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    const fetchStops = async () => {
      try {
        setIsLoading(true);
        const data = await getStopsByPrefixes(['SEM']);
        if (!active) return;
        setStops(data);
        setError(null);
      } catch (err) {
        if (!active) return;
        setError('Failed to load stops');      } finally {
        if (active) setIsLoading(false);
      }
    };
    fetchStops();
    return () => { active = false; };
  }, []);

  useEffect(() => { localStorage.setItem('greLines_language', language); }, [language]);
  useEffect(() => { localStorage.setItem('greLines_fontSize', fontSize); const root = document.documentElement; root.classList.remove('text-size-small', 'text-size-large'); if (fontSize === 'small') root.classList.add('text-size-small'); else if (fontSize === 'large') root.classList.add('text-size-large'); }, [fontSize]);
  useEffect(() => { localStorage.setItem('greLines_compactMode', compactMode ? 'true' : 'false'); }, [compactMode]);
  useEffect(() => { localStorage.setItem('greLines_refreshInterval', refreshInterval); }, [refreshInterval]);
  useEffect(() => { localStorage.setItem('greLines_searchHistory', searchHistory ? 'true' : 'false'); }, [searchHistory]);
  useEffect(() => { localStorage.setItem('greLines_searchHistoryItems', JSON.stringify(searchHistoryItems)); }, [searchHistoryItems]);
  useEffect(() => { localStorage.setItem('greLines_autoSync', autoSync ? 'true' : 'false'); }, [autoSync]);
  useEffect(() => { localStorage.setItem('greLines_autoLocation', autoLocation ? 'true' : 'false'); }, [autoLocation]);

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', '#3b82f6');
  }, []);

  useEffect(() => {
    const fetchTraffic = async () => {
      try {
        const data = await getTrafficLines();
        setTrafficInfo(data);
      } catch (err) {}
    };
    fetchTraffic();
  }, []);

  const handleStopClick = useCallback(async (stop: Stop) => {
    try {
      if (searchHistory) {
        setSearchHistoryItems(prev => [stop.name, ...prev.filter(i => i !== stop.name)].slice(0, 4));
      }
      setSelectedAddress(null); // opening a stop clears any address marker
      const placeholder: StopDetail = { ...stop, lines: [], departures: [], lastUpdate: new Date() };
      setSelectedStop(placeholder);
      mapRef.current?.centerOnStop(stop);
      setSidebarState('peek');
      const lines = await getStopLines(stop.id);
      setSelectedStop(prev => prev ? { ...prev, lines } : { ...placeholder, lines });
      const departures = await getDepartures(stop.id);
      setSelectedStop(prev => prev ? { ...prev, departures, lastUpdate: new Date() } : { ...placeholder, departures, lines });
    } catch (err) {}
  }, [searchHistory]);

  /**
   * Selecting a stop from the search dropdown:
   *   - blur the desktop input (closes "edit mode")
   *   - clear the query and close the dropdown
   *   - load the stop
   *
   * Must run on `onMouseDown`/`onPointerDown` so we don't lose the click to the
   * input's `onBlur`, which would otherwise unmount the dropdown first.
   */
  const handleSearchResultSelect = useCallback((stop: Stop) => {
    desktopSearchInputRef.current?.blur();
    setSearchQuery('');
    setIsSearchFocused(false);
    setIsSearchHovered(false);
    setSelectedAddress(null); // a stop pick clears any address marker
    handleStopClick(stop);
    mapRef.current?.centerOnStop(stop);
  }, [handleStopClick]);

  /**
   * Selecting an address from the search dropdown: drop a marker, recentre,
   * and close the dropdown. We don't open the sidebar — addresses aren't
   * stops, just points of interest.
   */
  const handleAddressSelect = useCallback((address: AddressResult) => {
    desktopSearchInputRef.current?.blur();
    setSearchQuery('');
    setIsSearchFocused(false);
    setIsSearchHovered(false);
    setSelectedAddress(address);
    mapRef.current?.centerOnLocation(address.lat, address.lon);
  }, []);

  const handleLocationClick = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('Géolocalisation non disponible sur votre appareil');
      return;
    }

    setLocationError(null);

    // Stop any existing watch before starting a fresh one.
    if (locationWatchId !== null) {
      navigator.geolocation.clearWatch(locationWatchId);
      setLocationWatchId(null);
    }

    // Single fresh fix — centers the map and places the dot.
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setCurrentLocation({ lat: coords.latitude, lon: coords.longitude });
        mapRef.current?.centerOnLocation(coords.latitude, coords.longitude);
        setLocationError(null);

        // Start continuous watch ONLY after successful position
        const watchId = navigator.geolocation.watchPosition(
          ({ coords }) => {
            setCurrentLocation({ lat: coords.latitude, lon: coords.longitude });
          },
          () => {},
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
        );
        setLocationWatchId(watchId);
      },
      (err) => {        let message = 'Erreur de géolocalisation';
        if (err.code === 1) {
          message = 'Accès géolocalisation refusé. Vérifiez les permissions du navigateur.';
        } else if (err.code === 2) {
          message = 'Position indisponible. Essayez dans une zone avec meilleure réception.';
        } else if (err.code === 3) {
          message = 'Délai d\'attente dépassé. Réessayez.';
        }
        setLocationError(message);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, [locationWatchId]);

  useEffect(() => {
    if (!autoLocation || !navigator.geolocation || !isMobile) return;
    
    // Simply call handleLocationClick which has all the logic we need
    handleLocationClick();
    
    // Note: handleLocationClick already manages the watch, so we just call it
    // The cleanup of the watch is handled by the existing return statement in the next useEffect
  }, [autoLocation, isMobile, handleLocationClick]);

  /**
   * Auto-clear geolocation error message after 5 seconds
   */
  useEffect(() => {
    if (locationError) {
      const timer = setTimeout(() => setLocationError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [locationError]);
  useEffect(() => {
    return () => {
      if (locationWatchId !== null) {
        navigator.geolocation?.clearWatch(locationWatchId);
      }
    };
  }, [locationWatchId]);

  /**
   * Mobile-only: at first paint we ask the browser for the user's location
   * (one-shot, no watch). If granted we (a) center the map, (b) open the
   * NearbyStopsSheet at its mini snap. If the user declines we still open
   * the sheet so they can browse manually.
   *
   * Important — we wait until BOTH the map ref is mounted AND stops have
   * loaded before kicking off the geolocation request, otherwise the sheet
   * pops up over the splash/loading screen and `mapRef.current.centerOnLocation`
   * is a no-op (the ref is still null).
   *
   * `hasOpenedNearbyOnce` makes sure we never re-trigger after the first
   * permission dance, even if React re-runs the effect.
   */
  /**
   * Mobile-only: at first paint we ask the browser for the user's location
   * (one-shot, no watch). If granted we (a) center the map, (b) open the
   * NearbyStopsSheet at its mini snap. If the user declines we still open
   * the sheet so they can browse manually.
   *
   * We wait until stops have loaded before kicking off the request — until
   * then the splash screen is showing and the map ref isn't ready, so an
   * early sheet would flash over the loader and `centerOnLocation` would
   * silently no-op on a null ref.
   *
   * `hasOpenedNearbyOnce` makes sure we never re-trigger after the first
   * permission dance, even if React re-runs the effect.
   */
  const [hasOpenedNearbyOnce, setHasOpenedNearbyOnce] = useState(false);
  // Hard guard against React 18 StrictMode's double-effect-invoke in dev:
  // we want the geoloc request to fire EXACTLY once, even if the effect's
  // cleanup runs between the two passes. Using a ref bypasses the
  // setHasOpenedNearbyOnce → re-render → effect-rerun loop.
  const geolocStartedRef = useRef(false);

  /**
   * Mobile home sheet behaviour:
   *  - Opens automatically on first paint once stops are loaded.
   *  - Stays mounted while the user is browsing. When a stop sidebar /
   *    settings / traffic panel opens on top, the home sheet stays at its
   *    mini snap underneath (z-index of new sheets is higher).
   *  - Re-opens automatically when the user closes those other sheets.
   * We only flip it OFF when the user explicitly closes it via the X.
   */
  useEffect(() => {
    if (!isMobile) return;
    if (geolocStartedRef.current) return;
    if (stops.length === 0) return;
    if (selectedStop) return;
    geolocStartedRef.current = true;
    setHasOpenedNearbyOnce(true);
    setIsNearbySheetOpen(true);

    // Trigger the same flow as if the user had tapped the geolocation button.
    // `handleLocationClick` already handles the permission popup, position
    // acquisition, map centering, and starts the watch — no need to duplicate
    // any of that here.
    handleLocationClick();
  }, [isMobile, stops.length, selectedStop, handleLocationClick]);

  /**
   * Re-open the home sheet whenever the user closes a foreground sheet
   * (stop sidebar / traffic / settings). We only respect the user's explicit
   * "close" (X button on the home sheet itself) — every other state change
   * brings it back so they always have a navigation anchor.
   */
  const [hasUserClosedHome, setHasUserClosedHome] = useState(false);
  useEffect(() => {
    if (!isMobile) return;
    if (hasUserClosedHome) return;
    if (!hasOpenedNearbyOnce) return; // wait until first auto-open ran
    if (isNearbySheetOpen) return;
    // None of the conditions that should keep the home sheet closed are
    // active — bring it back.
    setIsNearbySheetOpen(true);
  }, [isMobile, hasUserClosedHome, hasOpenedNearbyOnce, isNearbySheetOpen, isSidebarOpen, isSettingsOpen, isTrafficPanelOpenMobile]);

  const parseRefreshInterval = (interval: string): number => {
    switch (interval) {
      case '15s': return 15000;
      case '1m': return 60000;
      case '2m': return 120000;
      default: return 30000;
    }
  };

  const translations = {
    fr: {
      searchPlaceholder: 'Rechercher un arrêt...',
      recentSearch: 'Recherche récente',
      unknownCity: 'Ville inconnue',
      settings: { general: 'Général', display: 'Affichage', data: 'Données', about: 'À propos' },
      labels: {
        language: 'Langue', refreshInterval: 'Rafraîchissement', autoLocation: 'Centrer automatiquement',
        searchHistory: 'Historique de recherche', theme: 'Thème', accentColor: 'Couleur accent',
        fontSize: 'Taille du texte', compactMode: 'Mode compact', autoSync: 'Actualisation auto',
        clearCache: 'Effacer le cache', localStorageInfo: 'Paramètres stockés localement', noStops: 'Aucun arrêt visible',
      },
      options: {
        refreshInterval: ['Toutes les 15s', 'Toutes les 30s', 'Toutes les 1 min', 'Toutes les 2 min'],
        theme: ['Automatique', 'Clair', 'Sombre'],
        fontSize: ['Petit', 'Normal', 'Grand'],
      },
      buttons: { clearCache: 'Effacer les données' },
      misc: {
        settings: 'Paramètres', showTraffic: 'Voir le trafic', centerLocation: 'Centrer sur ma position',
        liveTrafficInfo: 'Infos trafic en direct', noIncidents: 'Aucun incident connu.',
        linePrefix: 'Ligne', incidentSingular: 'incident', incidentPlural: 'incidents',
        endPrefix: 'Fin :', networkClosed: 'RÉSEAU ACTUELLEMENT FERMÉ', localStorageTitle: 'Stockage local :',
        aboutDescription1: 'GreLines est une application web pour visualiser les arrêts de transport en commun de Grenoble avec des informations de départ en temps réel.',
        aboutDescription2: 'Construit avec React, Tailwind CSS et Leaflet/MapTiler.',
        versionLabel: 'Version :', dataSourceLabel: 'Source :', designLabel: 'Design :',
        pleaseReload: 'Veuillez recharger la page.',
        calculateItineraryWith: 'Calculez votre itinéraire avec',
        planRoute: 'Planifier un itinéraire',
      },
      onboarding: { title: 'Sélectionnez vos réseaux', description: 'Choisissez les opérateurs à afficher.', action: 'Voir les arrêts', noSelection: 'Sélectionnez au moins un réseau' },
    },
    en: {
      searchPlaceholder: 'Search for a stop...',
      recentSearch: 'Recent search',
      unknownCity: 'Unknown city',
      settings: { general: 'General', display: 'Display', data: 'Data', about: 'About' },
      labels: {
        language: 'Language', refreshInterval: 'Refresh Interval', autoLocation: 'Auto-center location',
        searchHistory: 'Search history', theme: 'Theme', accentColor: 'Accent color',
        fontSize: 'Font Size', compactMode: 'Compact mode', autoSync: 'Auto-sync departures',
        clearCache: 'Clear cache & data', localStorageInfo: 'Settings saved locally', noStops: 'No stops visible',
      },
      options: {
        refreshInterval: ['Every 15s', 'Every 30s', 'Every 1 min', 'Every 2 min'],
        theme: ['Automatic', 'Light', 'Dark'],
        fontSize: ['Small', 'Normal', 'Large'],
      },
      buttons: { clearCache: 'Clear data' },
      misc: {
        settings: 'Settings', showTraffic: 'Show traffic info', centerLocation: 'Center on my location',
        liveTrafficInfo: 'Live traffic info', noIncidents: 'No known incidents.',
        linePrefix: 'Line', incidentSingular: 'incident', incidentPlural: 'incidents',
        endPrefix: 'End:', networkClosed: 'NETWORK CURRENTLY CLOSED', localStorageTitle: 'Local storage:',
        aboutDescription1: 'GreLines is a web app for viewing Grenoble public transport stops with real-time departure info.',
        aboutDescription2: 'Built with React, Tailwind CSS, and Leaflet/MapTiler.',
        versionLabel: 'Version:', dataSourceLabel: 'Data source:', designLabel: 'Design:',
        pleaseReload: 'Please reload the page.',
        calculateItineraryWith: 'Calculate your itinerary with',
        planRoute: 'Route planner',
      },
      onboarding: { title: 'Select your networks', description: 'Choose the operators to show.', action: 'Show stops', noSelection: 'Pick at least one network' },
    },
  } as const;

  const text = translations[language];

  const hidePageControls = false;
  const isLoadingOverlayVisible = isLoading;

  const routeLineGeoJSON = useMemo(() => {
    if (!selectedRouteItinerary) {
      return null;
    }

    const allLegs = selectedRouteItinerary.allLegs || [];
    if (allLegs.length === 0) {
      return null;
    }

    const features: GeoJSON.Feature[] = [];
    
    // Helper to get line color from lookup
    const normalizeRouteRef = (value: string | undefined | null): string | null => {
      if (!value) return null;
      const code = String(value)
        .toUpperCase()
        .replace(/^(?:SEM|SE2):?/, '')
        .replace(/^(?:SEM|SE2)_/, '')
        .trim();
      return code || null;
    };

    const getRouteCandidates = (...values: Array<string | undefined | null>): string[] => {
      const candidates = values
        .map(normalizeRouteRef)
        .filter((value): value is string => Boolean(value));
      return Array.from(new Set(candidates));
    };

    const getLineColor = (routeId: string | undefined, routeShortName?: string, route?: string): string => {
      const candidates = getRouteCandidates(routeShortName, route, routeId);
      const normalized = candidates[0] || null;
      if (!normalized) return '#94a3b8';
      const lineInfo = candidates
        .map(candidate => allLinesLookup.get(candidate))
        .find((line): line is AllLinesLine => Boolean(line?.color));
      const rawColor = lineInfo?.color;
      return resolveLineBackgroundColor(rawColor, normalized);
    };

    // Helper to decode polyline (from api.ts)
    const decodePolyline = (encoded: string): Array<[number, number]> => {
      const coordinates: Array<[number, number]> = [];
      let index = 0;
      let lat = 0;
      let lng = 0;
      while (index < encoded.length) {
        let result = 0;
        let shift = 0;
        let byte = 0;
        do {
          byte = encoded.charCodeAt(index++) - 63;
          result |= (byte & 0x1f) << shift;
          shift += 5;
        } while (byte >= 0x20);
        const deltaLat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
        lat += deltaLat;
        result = 0;
        shift = 0;
        do {
          byte = encoded.charCodeAt(index++) - 63;
          result |= (byte & 0x1f) << shift;
          shift += 5;
        } while (byte >= 0x20);
        const deltaLng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
        lng += deltaLng;
        coordinates.push([lng / 1e5, lat / 1e5]);
      }
      return coordinates;
    };

    // Create a feature for each leg
    for (let i = 0; i < allLegs.length; i++) {
      const leg = allLegs[i];
      const points = leg?.legGeometry?.points;
      
      if (typeof points === 'string' && points.length > 0) {
        const coordinates = decodePolyline(points);
        if (coordinates.length >= 2) {
          const isWalk = leg.mode === 'WALK';
          const routeShortName = String(leg.routeShortName || leg.route || leg.routeId || '').replace(/^SEM:/, '').replace(/^SEM_/, '').toUpperCase();
          const lineColor = isWalk ? '#94a3b8' : getLineColor(leg.routeId, leg.routeShortName, leg.route);
          const routeCandidates = getRouteCandidates(leg.routeShortName, leg.route, leg.routeId);

          features.push({
            type: 'Feature' as const,
            geometry: {
              type: 'LineString' as const,
              coordinates,
            },
            properties: {
              mode: leg.mode,
              routeShortName,
              routeId: leg.routeId,
              routeCandidates,
              isWalk,
              color: lineColor,
              index: i,
            },
          });
        }
      }
    }

    if (features.length === 0) {
      return null;
    }

    return {
      type: 'FeatureCollection' as const,
      features,
    };
  }, [selectedRouteItinerary, allLinesLookup]);

  const mapElement = useMemo(() => (
    <TransitMap
      ref={mapRef}
      stops={stops}
      selectedStop={selectedStop}
      currentLocation={currentLocation}
      onStopClick={(stop) => {
        if (mapPickTarget) {
          const location: RouteLocation = {
            id: stop.id,
            label: stop.name,
            lat: stop.lat,
            lon: stop.lon,
            kind: 'stop',
            raw: stop,
          };
          if (mapPickTarget === 'from') {
            setRouteFrom(location);
          } else {
            setRouteTo(location);
          }
          setSelectedAddress(null);
          setSelectedRouteItinerary(null);
          setMapPickTarget(null);
          mapRef.current?.centerOnStop(stop);
          return;
        }
        handleStopClick(stop);
      }}
      selectedAddress={selectedAddress}
      routeStart={routeFrom ? { id: routeFrom.id, lat: routeFrom.lat, lon: routeFrom.lon, label: routeFrom.label, kind: routeFrom.kind } : undefined}
      routeEnd={routeTo ? { id: routeTo.id, lat: routeTo.lat, lon: routeTo.lon, label: routeTo.label, kind: routeTo.kind } : undefined}
      routeLine={routeLineGeoJSON}
      lineGeometries={lineGeometries}
      pickMode={mapPickTarget}
      onMapClick={async (lat: number, lon: number) => {
        // Try reverse geocoding first, fall back to coordinate label
        const addr = await reverseGeocode(lat, lon);
        const location: RouteLocation = {
          id: addr?.id || `mappick-${lat}-${lon}`,
          label: addr?.label || `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
          lat,
          lon,
          kind: 'address',
          raw: addr || null,
        } as RouteLocation;
        if (mapPickTarget === 'from') {
          setRouteFrom(location);
        } else if (mapPickTarget === 'to') {
          setRouteTo(location);
        }
        setMapPickTarget(null);
        setSelectedRouteItinerary(null);
        mapRef.current?.centerOnLocation(lat, lon);
      }}
      visibleStopPoints={selectedRouteItinerary ? (
        // When an itinerary is selected, only show stops near the itinerary's path
        (selectedRouteItinerary.routePath || []).map(([lon, lat]) => ({ lat, lon }))
      ) : servedStopPoints}
    />
  ), [stops, selectedStop, currentLocation, handleStopClick, selectedAddress, lineGeometries, servedStopPoints, routeFrom, routeTo, routeLineGeoJSON, selectedRouteItinerary, mapPickTarget]);

  useEffect(() => {
    if (!selectedRouteItinerary || !routeLineGeoJSON) return;

    const allCoordinates = routeLineGeoJSON.features.flatMap((feature) => {
      if (feature.geometry.type === 'LineString') {
        return feature.geometry.coordinates as Array<[number, number]>;
      }
      return [] as Array<[number, number]>;
    });

    if (allCoordinates.length === 0) return;

    const lons = allCoordinates.map(([lon]) => lon);
    const lats = allCoordinates.map(([, lat]) => lat);
    const west = Math.min(...lons);
    const east = Math.max(...lons);
    const south = Math.min(...lats);
    const north = Math.max(...lats);

    mapRef.current?.fitBounds([[west, south], [east, north]], {
      padding: 80,
      duration: 1000,
    });
  }, [selectedRouteItinerary, routeLineGeoJSON]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-gray-950">
      <div className="absolute inset-0 z-0">
        {isLoadingOverlayVisible ? (
          <div className="fixed inset-0 z-[9999] h-screen w-screen flex flex-col items-center justify-center bg-black bg-opacity-95">
            <div className="flex-1 flex items-center justify-center">
              <img src="/assets/GreLinesLOGO.png" alt="GreLines Loading" className="w-80 h-auto animate-pulse-opacity" />
            </div>
            <div className="pb-16">
              <img src="/assets/M-Reso.png" alt="M-Reso" className="w-28 h-auto" />
            </div>
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center bg-red-950">
            <p className="text-red-400">{error}</p>
          </div>
        ) : (
          mapElement
        )}
      </div>

      <SettingsPanel
        isOpen={isSettingsOpen}
        settingsState={settingsState}
        setSettingsState={setSettingsState}
        activeTab={activeSettingsTab}
        setActiveTab={setActiveSettingsTab}
        isMobile={isMobile}
        language={language}
        setLanguage={setLanguage}
        theme={theme}
        setTheme={setTheme}
        fontSize={fontSize}
        setFontSize={setFontSize}
        compactMode={compactMode}
        setCompactMode={setCompactMode}
        refreshInterval={refreshInterval}
        setRefreshInterval={setRefreshInterval}
        searchHistory={searchHistory}
        setSearchHistory={setSearchHistory}
        autoSync={autoSync}
        setAutoSync={setAutoSync}
        autoLocation={autoLocation}
        setAutoLocation={setAutoLocation}
        appData={appData}
        text={text}
        contentRef={settingsContentRef}
        panelRef={settingsPanelRef}
      />

      <RouteSidebar
        isOpen={isRouteSidebarOpen}
        onClose={resetRoutePlanner}
        stops={stops}
        language={language}
        isMobile={isMobile}
        routeFrom={routeFrom}
        routeTo={routeTo}
        selectedItinerary={selectedRouteItinerary}
        sharedRouteExpired={sharedRouteExpired}
        sharedRouteTarget={sharedRouteTarget}
        lineLookup={allLinesLookup}
        trafficInfo={trafficInfo}
        pickMode={mapPickTarget}
        onRequestPickLocation={(field) => {
          setMapPickTarget(field);
          setSelectedRouteItinerary(null);
          setSharedRouteExpired(false);
          setSharedRouteTarget(null);
        }}
        onLocationSelected={(location, field) => {
          setSelectedAddress(null);
          if (field === 'from') {
            setRouteFrom(location);
          } else {
            setRouteTo(location);
          }
          setSharedRouteExpired(false);
          setSharedRouteTarget(null);

          if (location.kind === 'stop') {
            const stop = stops.find(stop => stop.id === location.id);
            if (stop) {
              mapRef.current?.centerOnStop(stop);
              return;
            }
          }
          mapRef.current?.centerOnLocation(location.lat, location.lon);
        }}
        onLocationCleared={(field) => {
          if (field === 'from') {
            setRouteFrom(null);
          } else {
            setRouteTo(null);
          }
          setSelectedRouteItinerary(null);
        }}
        onItinerarySelected={itinerary => setSelectedRouteItinerary(itinerary)}
        onPlanNewSharedRoute={() => {
          setSharedRouteExpired(false);
          setSelectedRouteItinerary(null);
          setSharedRouteTarget(null);
          setMapPickTarget(null);
          setIsRouteSidebarOpen(true);
        }}
        onRouteReset={() => {
          setRouteFrom(null);
          setRouteTo(null);
          setSelectedRouteItinerary(null);
          setSharedRouteExpired(false);
          setSharedRouteTarget(null);
        }}
      />

      {!isLoading && (
        <>
          {isMobile && !hidePageControls && !isSidebarOpen && !isSettingsOpen && !isTrafficPanelOpenMobile && (
            <motion.div
              style={{ opacity: searchBarOpacity }}
              className="pointer-events-none"
              initial={false}
            >
              <div className="pointer-events-auto">
                <SearchBarMobile
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                  matchedStops={matchedStops}
                  stops={stops}
                  searchHistoryItems={searchHistory ? searchHistoryItems : []}
                  searchPlaceholder={text.searchPlaceholder}
                  unknownCityLabel={text.unknownCity}
                  onStopClick={stop => { setSelectedAddress(null); handleStopClick(stop); mapRef.current?.centerOnStop(stop); }}
                  isFocused={isSearchFocused}
                  onFocus={setIsSearchFocused}
                  addressResults={addressResults}
                  onAddressClick={handleAddressSelect}
                  language={language}
                />
              </div>
            </motion.div>
          )}

          {isMobile && !hidePageControls && isNearbySheetOpen && !isSidebarOpen && !isSettingsOpen && !isTrafficPanelOpenMobile && (
            <>
              {locationError && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="fixed top-4 left-4 right-4 rounded-lg bg-red-900/90 border border-red-700 px-4 py-3 text-sm text-red-200 shadow-lg z-10"
                >
                  {locationError}
                  <button
                    onClick={() => setLocationError(null)}
                    className="ml-3 text-red-300 hover:text-red-100 text-xs font-semibold"
                  >
                    ✕
                  </button>
                </motion.div>
              )}
              <motion.button
                onClick={() => {
                  handleLocationClick();
                  // Open the HomeSheet and snap it to the mid snap (0.6) so the
                  // nearby stops list is immediately visible.
                  setIsNearbySheetOpen(true);
                  setSnapHomeToMiniSignal(0); // don't collapse, let it open
                  // We bump snapHomeToMiniSignal only when foreground sheets open,
                  // not here — instead we target snap index 2 (=0.6) directly by
                  // using a separate signal prop on HomeSheet.
                  setOpenHomeSheetSignal(s => s + 1);
                }}
                style={{
                  zIndex: 5,
                  bottom: geolocButtonBottom,
                  opacity: geolocButtonOpacity,
                  scale: geolocButtonScale,
              }}
              initial={false}
              className="fixed right-4 w-12 h-12 rounded-full flex items-center justify-center cursor-pointer border-2 border-gray-700 bg-slate-900/85 hover:bg-slate-900 transition-colors shadow-lg"
              title={text.misc.centerLocation}
            >
              <MapPinIcon className="w-5 h-5 text-white" />
            </motion.button>
            </>
          )}

          {!hidePageControls && !isMobile && (
            <div className="fixed top-4 left-4 z-50 flex items-start gap-2">
              <button onClick={() => setSettingsState('open')}
                className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer bg-slate-900/85 hover:bg-slate-900 transition shadow-lg"
                title={text.misc.settings}>
                <Cog6ToothIcon className="w-5 h-5 text-white" />
              </button>

              <div onMouseEnter={() => setIsSearchHovered(true)} onMouseLeave={() => !isSearchFocused && setIsSearchHovered(false)}
                className={`relative h-10 transition-[width] duration-300 ease-out ${isSearchFocused || isSearchHovered ? 'w-96' : 'w-10'} group`}>
                <div className="absolute inset-0 bg-slate-900/85 border border-gray-700 shadow-lg rounded-full transition-all duration-300" />
                <div className="relative h-full flex items-center pr-2">
                  <div className={`absolute z-20 flex items-center justify-center h-full ${isSearchFocused || isSearchHovered ? 'left-5 -translate-x-0' : 'left-1/2 -translate-x-1/2'}`}>
                    <MagnifyingGlassIcon className="w-5 h-5 text-white" />
                  </div>
                  <input
                    ref={desktopSearchInputRef}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onFocus={() => setIsSearchFocused(true)}
                    onBlur={() => { setIsSearchFocused(false); setIsSearchHovered(false); }}
                    placeholder={text.searchPlaceholder}
                    className="h-full pl-10 pr-4 bg-transparent border-none outline-none text-sm text-gray-100 placeholder-gray-400 transition-all duration-300 ease-out opacity-0 w-0 group-hover:opacity-100 group-hover:w-[calc(100%-48px)] focus:opacity-100 focus:w-[calc(100%-48px)]"
                    autoComplete="off"
                  />
                  {searchQuery && (isSearchFocused || isSearchHovered) && (
                    <button
                      onMouseDown={e => { e.preventDefault(); setSearchQuery(''); desktopSearchInputRef.current?.focus(); }}
                      className="absolute right-2 text-gray-500 hover:text-gray-200"
                      type="button"
                    >
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {(isSearchFocused || isSearchHovered) && (
                  <>
                    <div onMouseEnter={() => setIsSearchHovered(true)} onMouseLeave={() => setIsSearchHovered(false)}
                      className="absolute left-0 top-10 w-96 h-2 pointer-events-auto" />
                    <div onMouseEnter={() => setIsSearchHovered(true)} onMouseLeave={() => setIsSearchHovered(false)}
                      className="absolute left-0 top-12 w-full max-h-72 overflow-auto bg-slate-900/95 border border-gray-700 rounded-2xl shadow-xl">
                      {/* Stops first — they outrank addresses */}
                      {searchQuery.trim() !== '' && matchedStops.length > 0 && (
                        <>
                          <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800">
                            {language === 'fr' ? 'Arrêts' : 'Stops'}
                          </div>
                          {matchedStops.map(stop => (
                            <button
                              key={stop.id}
                              type="button"
                              onMouseDown={e => { e.preventDefault(); handleSearchResultSelect(stop); }}
                              className="w-full text-left px-3 py-2 hover:bg-slate-800 transition flex items-center gap-2"
                            >
                              <StopCircleIcon className="w-4 h-4 text-blue-400 flex-shrink-0" />
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium text-gray-100 truncate">{stop.name}</div>
                                <div className="text-xs text-gray-400 truncate">{stop.city || text.unknownCity}</div>
                              </div>
                            </button>
                          ))}
                        </>
                      )}

                      {/* Addresses come after stops */}
                      {searchQuery.trim() !== '' && addressResults.length > 0 && (
                        <>
                          <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-t border-b border-slate-800">
                            {language === 'fr' ? 'Adresses' : 'Addresses'}
                          </div>
                          {addressResults.map(addr => (
                            <button
                              key={addr.id}
                              type="button"
                              onMouseDown={e => { e.preventDefault(); handleAddressSelect(addr); }}
                              className="w-full text-left px-3 py-2 hover:bg-slate-800 transition flex items-center gap-2"
                            >
                              <MapPinIcon className="w-4 h-4 text-amber-400 flex-shrink-0" />
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium text-gray-100 truncate">{addr.name}</div>
                                <div className="text-xs text-gray-400 truncate">{addr.context}</div>
                              </div>
                            </button>
                          ))}
                        </>
                      )}

                      {/* No matches at all */}
                      {searchQuery.trim() !== '' && matchedStops.length === 0 && addressResults.length === 0 && (
                        <div className="px-3 py-4 text-center text-xs text-gray-500">
                          {language === 'fr' ? 'Aucun résultat' : 'No results'}
                        </div>
                      )}

                      {/* Recent searches when no query */}
                      {searchQuery.trim() === '' && searchHistory && searchHistoryItems.length > 0 && (
                        <>
                          <div className="px-3 py-2 text-xs text-gray-400 border-b border-gray-600">Recherches récentes</div>
                          {searchHistoryItems.map((item, i) => {
                            const s = stops.find(stop => stop.name === item);
                            return (
                              <button key={`${item}-${i}`}
                                type="button"
                                onMouseDown={e => { e.preventDefault(); if (s) handleSearchResultSelect(s); }}
                                className="w-full text-left px-3 py-2 hover:bg-slate-800 transition border-b border-slate-800">
                                <div className="text-sm font-medium text-gray-100">{item}</div>
                                <div className="text-xs text-gray-400">{s?.city || text.unknownCity}</div>
                              </button>
                            );
                          })}
                        </>
                      )}
                      <div className="border-t border-gray-600 px-3 py-3">
                        {!isMobile && (
                          <button
                            type="button"
                            onClick={() => {
                              setSearchQuery('');
                              setIsSearchFocused(false);
                              setIsSearchHovered(false);
                              setIsRouteSidebarOpen(true);
                            }}
                            className="flex w-full items-center justify-center gap-2 px-0 py-0 cursor-pointer text-xs text-slate-400 transition hover:text-slate-200"
                          >
                            <span>{text.misc.calculateItineraryWith}</span>
                            <img src="/assets/GreGoLOGO.png" alt="GreGo" className="h-4 w-auto" />
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {!isMobile && (
                <button onClick={() => setIsRouteSidebarOpen(true)}
                  className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer bg-slate-900/85 hover:bg-slate-900 transition shadow-lg"
                  title={text.misc.planRoute}>
                  <MapIcon className="w-5 h-5 text-white" />
                </button>
              )}

              {/* ── Favorites panel (desktop) ──────────────────────────
                  Hover-to-expand panel sitting between the search bar and the
                  traffic info button. Shows the same favorite cards as the
                  mobile HomeSheet, with the same per-line live departures. */}
              <div
                onMouseEnter={() => setIsFavBtnHovered(true)}
                onMouseLeave={() => setIsFavBtnHovered(false)}
                className="relative z-50"
              >
                <div className={`flex items-center justify-center cursor-pointer border border-gray-700 transition-all duration-300 ${isFavPanelOpen ? 'w-96 h-96 rounded-2xl bg-slate-900/95' : 'w-10 h-10 rounded-full bg-slate-900/85 hover:bg-slate-900 shadow-lg'}`}>
                  {!isFavPanelOpen && <StarIcon className="w-5 h-5 text-white" />}
                  <div
                    onMouseEnter={() => setIsFavPanelHovered(true)}
                    onMouseLeave={() => setIsFavPanelHovered(false)}
                    className={`absolute top-0 left-0 z-50 transition-all duration-300 ease-out ${isFavPanelOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                    style={{ width: '100%', height: '100%' }}
                  >
                    <div className="h-full w-full overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900/95 p-3 shadow-2xl">
                      <div className="flex items-center gap-2 mb-3">
                        <StarIcon className="w-4 h-4 text-amber-400" />
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                          {language === 'fr' ? 'Favoris' : 'Favorites'}
                        </h3>
                      </div>
                      {favoritesList.length === 0 ? (
                        <div className="text-xs text-slate-400 leading-relaxed bg-slate-800 border border-slate-700 rounded-xl p-3">
                          {language === 'fr'
                            ? 'Aucun favori pour le moment. Ouvre un arrêt et clique sur l\u2019étoile pour en ajouter un.'
                            : 'No favorites yet. Open a stop and tap the star to add one.'}
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {favoritesDetails.map(({ favorite, detail, loading }) => (
                            <FavoriteCard
                              key={favorite.stopId}
                              stopName={favorite.stopName}
                              city={favorite.city}
                              lineFilter={favorite.lines}
                              detail={detail}
                              loading={loading}
                              onOpen={() => {
                                const lineFilter =
                                  favorite.lines === 'all' ? undefined : favorite.lines;
                                if (lineFilter && lineFilter.length > 0) {
                                  setInitialSelectedLines(new Set(lineFilter));
                                }
                                // Hand a minimal Stop to handleStopClick; it
                                // refetches the full detail anyway.
                                const stub: Stop = (detail as Stop) ?? {
                                  id: favorite.stopId,
                                  name: favorite.stopName,
                                  lat: 0,
                                  lon: 0,
                                  city: favorite.city,
                                };
                                // Close the favorites panel so it doesn't
                                // stay hovering over the freshly-opened stop.
                                setIsFavBtnHovered(false);
                                setIsFavPanelHovered(false);
                                handleStopClick(stub);
                              }}
                              onRemove={() => removeFavoriteAndNotify(favorite.stopId)}
                              language={language}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Traffic info panel (desktop) ───────────────────────
                  Same look & filter logic as TrafficPanelMobile: filter
                  tabs (All/Trams/Chrono/Bus), per-line cards with a
                  category-coloured badge (tram=blue, chrono=orange,
                  bus=slate), sorted by category then by end-date. */}
              <div onMouseEnter={() => setIsTrafficButtonHovered(true)} onMouseLeave={() => setIsTrafficButtonHovered(false)} className="relative z-50">
                <div className={`flex items-center justify-center cursor-pointer border transition-all duration-300 ${isTrafficPanelOpen ? 'w-96 h-96 rounded-2xl bg-slate-900/95 border-slate-700' : 'w-10 h-10 rounded-full bg-amber-500 border-amber-600 shadow-lg'}`}>
                  {!isTrafficPanelOpen && <ExclamationTriangleIcon className="w-5 h-5 text-white" />}
                  <div onMouseEnter={() => setIsTrafficPanelHovered(true)} onMouseLeave={() => setIsTrafficPanelHovered(false)}
                    className={`absolute top-0 left-0 z-50 transition-all duration-300 ease-out ${isTrafficPanelOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                    style={{ width: '100%', height: '100%' }}>
                    <div className="h-full w-full flex flex-col rounded-2xl border border-slate-700 bg-slate-900/95 shadow-2xl overflow-hidden">
                      {/* Header */}
                      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-amber-500 rounded-xl flex items-center justify-center">
                            <ExclamationTriangleIcon className="w-4 h-4 text-white" />
                          </div>
                          <h3 className="text-sm font-bold text-white">{text.misc.liveTrafficInfo}</h3>
                          {trafficInfo.size > 0 && (() => {
                            // Count entries after the filter so the badge
                            // matches what the user actually sees below.
                            const visibleCount = Array.from(trafficInfo.entries())
                              .filter(([line]) => {
                                const cat = getLineCategory(line);
                                if (cat === 'other') return false;
                                if (desktopTrafficFilter === 'all') return true;
                                return cat === desktopTrafficFilter;
                              }).length;
                            return (
                              <span className="text-xs bg-amber-500 text-white font-bold px-2 py-0.5 rounded-full">
                                {visibleCount}
                              </span>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Filter tabs — Tout / Trams / Chrono / Proximo / Flexo */}
                      <div className="flex gap-1.5 px-4 pb-2 flex-shrink-0 overflow-x-auto scrollbar-hide">
                        {([
                          { key: 'all',     label: language === 'fr' ? 'Tout'    : 'All' },
                          { key: 'tram',    label: language === 'fr' ? 'Trams'   : 'Trams' },
                          { key: 'chrono',  label: language === 'fr' ? 'Chrono'  : 'Chrono' },
                          { key: 'proximo', label: language === 'fr' ? 'Proximo' : 'Proximo' },
                          { key: 'flexo',   label: language === 'fr' ? 'Flexo'   : 'Flexo' },
                        ] as const).map(f => (
                          <button
                            key={f.key}
                            onClick={() => setDesktopTrafficFilter(f.key)}
                            className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                              desktopTrafficFilter === f.key
                                ? 'bg-amber-500 text-white'
                                : 'bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            {f.key === 'all' && <FunnelIcon className="w-3 h-3" />}
                            {f.label}
                          </button>
                        ))}
                      </div>

                      {/* Scrollable content */}
                      <div className="overflow-y-auto flex-1 px-4 pb-4">
                        {(() => {
                          // Sort order in the list: trams first, then chrono,
                          // then proximo, then flexo. Within each category
                          // we let the natural string order do the job.
                          const sortRank: Record<LineFamily, number> = {
                            tram: 0, chrono: 1, proximo: 2, flexo: 3, other: 99,
                          };
                          const filteredEntries = Array.from(trafficInfo.entries())
                            .filter(([line]) => {
                              const cat = getLineCategory(line);
                              if (cat === 'other') return false;
                              if (desktopTrafficFilter === 'all') return true;
                              return cat === desktopTrafficFilter;
                            })
                            .sort(([a], [b]) => {
                              return sortRank[getLineCategory(a)] - sortRank[getLineCategory(b)];
                            });

                          if (filteredEntries.length === 0) {
                            return (
                              <div className="flex flex-col items-center justify-center py-10 gap-2">
                                <div className="w-12 h-12 bg-slate-800 border border-slate-700 rounded-2xl flex items-center justify-center">
                                  <ExclamationTriangleIcon className="w-6 h-6 text-slate-500" />
                                </div>
                                <p className="text-xs text-slate-500 text-center">{text.misc.noIncidents}</p>
                              </div>
                            );
                          }

                          return (
                            <div className="space-y-2">
                              {filteredEntries.map(([line, details]) => {
                                const n = line.trim().toUpperCase();
                                const sortedDetails = [...details].sort((a, b) => {
                                  const at = new Date(a.dateFin).getTime() || 0;
                                  const bt = new Date(b.dateFin).getTime() || 0;
                                  return at - bt;
                                });
                                // Try to resolve the real MTAG line object (with
                                // its official colour) from the catalogue we
                                // fetched at mount. Fallback to a synthetic line
                                // so `LineBadge` still renders something
                                // meaningful before/while the catalogue loads.
                                const resolved = allLinesLookup.get(n);
                                const badgeLine = resolved ?? {
                                  id: `SEM:${n}`,
                                  shortName: line,
                                  color: '#3b82f6',
                                };
                                return (
                                  <div
                                    key={line}
                                    className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden"
                                  >
                                    <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
                                      <div className="flex items-center gap-2">
                                        <LineBadge line={badgeLine} size="sm" />
                                        <span className="text-[10px] text-slate-400">
                                          {sortedDetails.length}{' '}
                                          {sortedDetails.length > 1 ? text.misc.incidentPlural : text.misc.incidentSingular}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="divide-y divide-slate-700/50">
                                      {sortedDetails.map((detail, i) => (
                                        <div key={i} className="px-3 py-2">
                                          <p className="text-xs font-semibold text-white mb-0.5">{stripHtml(detail.titre)}</p>
                                          <p className="text-[11px] text-slate-400 leading-relaxed whitespace-pre-line">{stripHtml(detail.description)}</p>
                                          <p className="text-[10px] text-slate-500 mt-1">
                                            {text.misc.endPrefix} {detail.dateFin || 'N/A'}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Mobile-only: home menu sheet. Rendered FIRST among sheets so it
          sits at the bottom of the DOM stacking order — every other sheet
          mounted afterwards (stop sidebar / traffic / settings) appears
          above it visually. Stays open in the background and only closes
          via the user's explicit X tap. */}
      {isMobile && (
        <HomeSheet
          isOpen={isNearbySheetOpen}
          onClose={() => {
            setIsNearbySheetOpen(false);
            setHasUserClosedHome(true);
          }}
          onSheetProgress={(p) => sheetProgress.set(p)}
          snapToMiniSignal={snapHomeToMiniSignal}
          openToMidSignal={openHomeSheetSignal}
          stops={stops}
          currentLocation={currentLocation}
          onStopClick={(stop, lineFilter) => {
            if (lineFilter && lineFilter.length > 0) {
              setInitialSelectedLines(new Set(lineFilter));
            }
            // Collapse the home sheet back to mini so it's in its initial
            // state when the user closes the stop sidebar later.
            setSnapHomeToMiniSignal(s => s + 1);
            handleStopClick(stop);
          }}
          onOpenTraffic={() => {
            setSnapHomeToMiniSignal(s => s + 1);
            setIsTrafficPanelOpenMobile(true);
          }}
          onOpenSettings={() => {
            setSnapHomeToMiniSignal(s => s + 1);
            setSettingsState('open');
          }}
          language={language}
        />
      )}

      {!hidePageControls && (
        <TrafficPanelMobile
          isOpen={isTrafficPanelOpenMobile}
          onClose={() => setIsTrafficPanelOpenMobile(false)}
          trafficInfo={trafficInfo}
          language={language}
        />
      )}

      {!isMobile && (
        <Sidebar
          stop={selectedStop}
          isOpen={isSidebarOpen}
          onClose={handleSidebarClose}
          initialSelectedLines={initialSelectedLines}
          selectedLines={selectedLines}
          onSelectedLinesChange={setSelectedLines}
          compactMode={compactMode}
          autoSync={autoSync}
          refreshIntervalMs={parseRefreshInterval(refreshInterval)}
          language={language}
          onPlanRouteFromStop={openRouteFromStop}
        />
      )}

      {isMobile && (
        <SidebarMobile
          stop={selectedStop}
          isOpen={isSidebarOpen}
          sidebarState={sidebarState}
          onClose={handleSidebarClose}
          onOpen={handleSidebarOpen}
          initialSelectedLines={initialSelectedLines}
          selectedLines={selectedLines}
          onSelectedLinesChange={setSelectedLines}
          compactMode={compactMode}
          autoSync={autoSync}
          refreshIntervalMs={parseRefreshInterval(refreshInterval)}
          language={language}
          
        />
      )}

      {/* Address sidebar — opens automatically when an address is picked */}
      <AddressSidebar
        address={selectedAddress}
        stops={stops}
        isOpen={selectedAddress !== null && !isSidebarOpen}
        onClose={() => setSelectedAddress(null)}
        onStopClick={stop => {
          setSelectedAddress(null);
          handleStopClick(stop);
          mapRef.current?.centerOnStop(stop);
        }}
        isMobile={isMobile}
        language={language}
      />

      {/* Bottom bar with clock and signal — desktop only */}
      {!hidePageControls && !isMobile && (
        <ClockSignal closedLabel={text.misc.networkClosed} />
      )}
    </div>
  );
}

export default App;
