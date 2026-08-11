import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef, lazy } from 'react';
import { AnimatePresence, motion, useMotionValue, useTransform, MotionConfig } from 'framer-motion';
import { MagnifyingGlassIcon, ExclamationTriangleIcon, MapIcon, MapPinIcon, Cog6ToothIcon, XMarkIcon, StopCircleIcon, StarIcon, FunnelIcon, ArrowsRightLeftIcon, CloudIcon } from '@heroicons/react/24/solid';
import { resolveLineBackgroundColor, setLineColorOverrides } from './utils/lineColors';
import { useFavorites } from './hooks/useFavorites';
import { useFavoriteDetails } from './hooks/useFavoriteDetails';
import { removeFavoriteAndNotify } from './services/favorites';
import { FavoriteCard } from './components/FavoriteCard';
import { getAllSemLines, buildLineLookup, type AllLinesLine } from './services/allLines';
import { LineBadge } from './components/LineBadge';


import { Map as TransitMap } from './components/Map';
import { Sidebar } from './components/Sidebar';
import { SearchBarMobile } from './components/SearchBarMobile';
import { TrafficPanelMobile } from './components/TrafficPanelMobile';
import { InstallAppSheet } from './components/InstallAppSheet';
import { SidebarMobile } from './components/SidebarMobile';
import { HomeSheet } from './components/HomeSheet';
import { ClockSignal } from './components/ClockSignal';
import { PopupOverlay } from './components/PopupOverlay';
import { DeferredPanel } from './components/DeferredPanel';
import { DevOverlay } from './components/DevOverlay';
import {
  fetchSharedMobility,
  EMPTY_SHARED_MOBILITY,
  SHARED_MOBILITY_TTL_MS,
  type SharedMobilityData,
  type SharedOperator,
  type SharedVehiclePoint,
} from './services/sharedMobility';
import { toTimetableRouteId } from './services/timetable';
import { usePerfSettings } from './hooks/usePerfSettings';
import { canShowInstallGuide, shouldAutoOpenInstallGuide } from './utils/pwa';

import { Analytics } from '@vercel/analytics/react';





const LineSidebar = lazy(() =>
  import('./components/LineSidebar').then(m => ({ default: m.LineSidebar }))
);
const RouteSidebar = lazy(() =>
  import('./components/RouteSidebar').then(m => ({ default: m.RouteSidebar }))
);
const SettingsPanel = lazy(() =>
  import('./components/SettingsPanel').then(m => ({ default: m.SettingsPanel }))
);
const AddressSidebar = lazy(() =>
  import('./components/AddressSidebar').then(m => ({ default: m.AddressSidebar }))
);
const NavigationMode = lazy(() =>
  import('./components/NavigationMode').then(m => ({ default: m.NavigationMode }))
);
const TripSurvey = lazy(() =>
  import('./components/TripSurvey').then(m => ({ default: m.TripSurvey }))
);
const Spotlight = lazy(() =>
  import('./components/Spotlight').then(m => ({ default: m.Spotlight }))
);
const SharedMobilitySidebar = lazy(() =>
  import('./components/SharedMobilitySidebar').then(m => ({ default: m.SharedMobilitySidebar }))
);
const TimetableSidebar = lazy(() =>
  import('./components/TimetableSidebar').then(m => ({ default: m.TimetableSidebar }))
);
const LineMapViewer = lazy(() =>
  import('./components/LineMapViewer').then(m => ({ default: m.LineMapViewer }))
);
import {
  getActivePopups,
  getFooterConfig,
  getStopOverrides,
  getLineOverrides,
  subscribeToCmsChanges,
  type CmsPopup,
  type FooterConfig,
} from './services/cms';
import { getCachedStopLines, getStopDetail, getStopLines, getStopsByPrefixes, getTrafficLines, getDepartures, refreshStopLines, setActiveNetworks, type RouteLocation, type RouteItinerary } from './services/api';
import { getTclStopDetail, getTclStops, isTclId, TCL_NETWORK } from './services/tclNetwork';
import { searchAddresses, reverseGeocode, type AddressResult } from './services/geocoding';
import { getLinesGeometryPrecise, getStopsServedByLines, type LineGeometry, type ServedStopPoint } from './services/lineShapes';
import type { Line, SearchHistoryItem, Stop, StopDetail, TrafficDetail } from './types';
import type { MapRef } from './components/Map';
import { useStopUrlSync } from './hooks/useStopUrlSync';
import { useDebouncedValue } from './hooks/useDebouncedValue';
import type { LineFamily } from './services/allLines';
import { stripHtml } from './utils/stripHtml';
import { buildJourneyGeometry, type JourneyStopRef } from './utils/journeyGeometry';
import { AtmoPanel, atmoColor, atmoPicto } from './components/AtmoPanel';
import { getAtmoReportByPostalCode, getAtmoReportForCommune, DEFAULT_ATMO_POSTAL_CODE, type AtmoReport, type Commune } from './services/atmo';
import { haversineMeters, findClosestStops } from './utils/geo';

function App() {
  const [stops, setStops] = useState<Stop[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isSearchHovered, setIsSearchHovered] = useState(false);
  const [selectedStop, setSelectedStop] = useState<StopDetail | null>(null);
  const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set());
  const [selectedLine, setSelectedLine] = useState<AllLinesLine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [initialSelectedLines, setInitialSelectedLines] = useState<Set<string>>(new Set());
  const [initialSelectedLineId, setInitialSelectedLineId] = useState<string | null>(null);
  




  const [urlHydrated, setUrlHydrated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [trafficInfo, setTrafficInfo] = useState<Map<string, TrafficDetail[]>>(new Map());
  const [isRouteSidebarOpen, setIsRouteSidebarOpen] = useState(false);
  const [routeFrom, setRouteFrom] = useState<RouteLocation | null>(null);
  const [routeTo, setRouteTo] = useState<RouteLocation | null>(null);
  const [selectedRouteItinerary, setSelectedRouteItinerary] = useState<RouteItinerary | null>(null);
  




  const [itineraryLineShapes, setItineraryLineShapes] = useState<Map<string, LineGeometry>>(new Map());
  const [routeItineraryOptions, setRouteItineraryOptions] = useState<RouteItinerary[]>([]);
  




  const [autoPickFirstItinerary, setAutoPickFirstItinerary] = useState(false);
  const [sharedRouteExpired, setSharedRouteExpired] = useState(false);
  const [sharedRouteTarget, setSharedRouteTarget] = useState<{ dep?: string; arr?: string; dur?: string } | null>(null);
  const [isTrafficButtonHovered, setIsTrafficButtonHovered] = useState(false);
  const [isTrafficPanelHovered, setIsTrafficPanelHovered] = useState(false);
  




  const [isTrafficPanelPinned, setIsTrafficPanelPinned] = useState(false);
  
  
  
  const [isFavBtnHovered, setIsFavBtnHovered] = useState(false);
  const [isFavPanelHovered, setIsFavPanelHovered] = useState(false);
  
  
  
  const [isAtmoBtnHovered, setIsAtmoBtnHovered] = useState(false);
  const [isAtmoPanelHovered, setIsAtmoPanelHovered] = useState(false);
  // Code postal de repli : il ne sert qu'au tout premier chargement et aux
  // sessions ouvertes avant la recherche par nom de commune.
  const [atmoPostalCode] = useState<string>(
    () => localStorage.getItem('greLines_atmoPostalCode') || DEFAULT_ATMO_POSTAL_CODE
  );
  /**
   * Commune choisie dans la liste de suggestions. Elle l'emporte sur le code
   * postal, qui ne sert plus qu'au tout premier chargement et aux sessions
   * antérieures à la recherche par nom.
   */
  const [atmoCommune, setAtmoCommune] = useState<Commune | null>(() => {
    try {
      const stored = localStorage.getItem('greLines_atmoCommune');
      return stored ? (JSON.parse(stored) as Commune) : null;
    } catch {
      return null;
    }
  });
  const [atmoReport, setAtmoReport] = useState<AtmoReport | null>(null);
  const [atmoLoading, setAtmoLoading] = useState(false);
  
  
  const [desktopTrafficFilter, setDesktopTrafficFilter] = useState<'all' | LineFamily>('all');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  // Tutoriel « ajouter GreLines à l'écran d'accueil » : proposé une seule fois
  // aux mobiles qui naviguent depuis le navigateur, puis à la demande via les
  // réglages. Une fois l'app installée, il disparaît complètement.
  const [canOfferInstallGuide] = useState(canShowInstallGuide);
  const [autoOpenInstallGuide] = useState(shouldAutoOpenInstallGuide);
  const [isInstallSheetOpen, setIsInstallSheetOpen] = useState(false);
  const { settings: perfSettings } = usePerfSettings();
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lon: number} | null>(null);
  const [locationWatchId, setLocationWatchId] = useState<number | null>(null);
  const [searchHistoryItems, setSearchHistoryItems] = useState<SearchHistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('greLines_searchHistoryItems');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return [];
      return parsed.slice(0, 4).map((item): SearchHistoryItem | null => {
        if (typeof item === 'string') {
          return { kind: 'stop', id: item, name: item };
        }
        if (!item || typeof item !== 'object') return null;
        if (item.kind === 'stop' && typeof item.id === 'string' && typeof item.name === 'string') {
          return {
            kind: 'stop',
            id: item.id,
            name: item.name,
            city: typeof item.city === 'string' ? item.city : undefined,
          };
        }
        if (item.kind === 'line' && typeof item.id === 'string' && typeof item.shortName === 'string' && typeof item.longName === 'string') {
          return {
            kind: 'line',
            id: item.id,
            shortName: item.shortName,
            longName: item.longName,
          };
        }
        if (item.kind === 'address' && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.lat === 'number' && typeof item.lon === 'number') {
          return {
            kind: 'address',
            id: item.id,
            name: item.name,
            context: typeof item.context === 'string' ? item.context : undefined,
            lat: item.lat,
            lon: item.lon,
          };
        }
        return null;
      }).filter((item): item is SearchHistoryItem => item !== null);
    } catch { return []; }
  });
  const [isTrafficPanelOpenMobile, setIsTrafficPanelOpenMobile] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  




  const [isNearbySheetOpen, setIsNearbySheetOpen] = useState(false);
  





  const sheetProgress = useMotionValue(0.15);
  




  const [snapHomeToMiniSignal, setSnapHomeToMiniSignal] = useState(0);
  
  const [openHomeSheetSignal, setOpenHomeSheetSignal] = useState(0);
  




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
  /** Recherche universelle (Maj + Espace), ordinateur uniquement. */
  const [isSpotlightOpen, setIsSpotlightOpen] = useState(false);
  /** Voitures Citiz et trottinettes Voi superposées à la carte. */
  const [sharedMobility, setSharedMobility] = useState<SharedMobilityData>(EMPTY_SHARED_MOBILITY);
  /** Station de mobilité partagée ouverte dans sa fiche. */
  const [sharedSelection, setSharedSelection] = useState<
    { operator: SharedOperator; points: SharedVehiclePoint[] } | null
  >(null);
  /** Véhicule déplié dans la fiche : sa pastille est grossie sur la carte. */
  const [highlightedVehicleId, setHighlightedVehicleId] = useState<string | null>(null);
  /** Fiche horaire ouverte à droite de la fiche d'arrêt. */
  const [timetableTarget, setTimetableTarget] = useState<
    { line: { id: string; shortName?: string; color?: string; textColor?: string }; headsign?: string } | null
  >(null);
  /** Plan de ligne (PDF) ouvert en visionneuse plein écran. */
  const [lineMapTarget, setLineMapTarget] = useState<
    { routeId: string; label: string; color?: string } | null
  >(null);
  const [settingsState, setSettingsState] = useState<'closed' | 'peek' | 'open'>('closed');
  const isSettingsOpen = settingsState !== 'closed';

  /**
   * Sélection de réseaux réellement chargée.
   *
   * Cocher un réseau met à jour les réglages tout de suite (l'interface le
   * reflète, le choix est enregistré), mais le rechargement du catalogue
   * n'intervient qu'à la fermeture des réglages : sinon chaque clic renvoyait
   * l'écran de chargement noir en pleine face, avant de revenir aux réglages.
   */
  const [appliedNetworks, setAppliedNetworks] = useState(perfSettings.networks);
  const pendingNetworksKey = perfSettings.networks.join(',');
  if (!isSettingsOpen && pendingNetworksKey !== appliedNetworks.join(',')) {
    // Ajusté pendant le rendu : le chargement démarre dès la fermeture, sans
    // image intermédiaire montrant encore l'ancienne sélection.
    setAppliedNetworks(perfSettings.networks);
  }
  const settingsContentRef = useRef<HTMLDivElement>(null);
  const settingsPanelRef = useRef<HTMLDivElement>(null);
  const desktopSearchInputRef = useRef<HTMLInputElement>(null);
  const [appData, setAppData] = useState<{version: string; credits: Array<{role: string; name: string; link?: string}>} | null>(null);
  const [activePopups, setActivePopups] = useState<CmsPopup[]>([]);
  const [footerConfig, setFooterConfig] = useState<FooterConfig>({ message: null, color: '#fbbf24', showClock: true });
  /**
   * Incrémenté à chaque modification faite dans le CRM : force le rechargement
   * des données qui en dépendent (arrêts et lignes surchargés).
   */
  const [cmsRevision, setCmsRevision] = useState(0);
  /** Mode guidage GPS plein écran (mobile), lancé depuis un itinéraire sélectionné. */
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  /**
   * Contexte de l'enquête qualité : renseigné quand l'usager monte à bord d'un
   * véhicule pendant le guidage (moment où il est assis et disponible), pas
   * pendant qu'il marche.
   */
  const [surveyContext, setSurveyContext] = useState<
    { lineId: string; boardingStop: string | null; boardingTime: string } | null
  >(null);

  const [language, setLanguage] = useState<'fr' | 'en'>(() => {
    const saved = localStorage.getItem('greLines_language');
    return saved === 'en' ? 'en' : 'fr';
  });

  const [theme, setTheme] = useState<'light' | 'dark' | 'auto'>(() => {
    return (localStorage.getItem('greLines_theme') as 'light' | 'dark' | 'auto') || 'dark';
  });
  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return theme === 'dark' ? 'dark' : 'light';
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    return theme === 'auto' ? (prefersDark ? 'dark' : 'light') : theme;
  });
  const [fontSize, setFontSize] = useState<'small' | 'normal' | 'large'>(() => {
    return (localStorage.getItem('greLines_fontSize') as any) || 'normal';
  });
  const [compactMode, setCompactMode] = useState(() => localStorage.getItem('greLines_compactMode') === 'true');
  const [refreshInterval, setRefreshInterval] = useState<'15s' | '30s' | '1m' | '2m'>(() => {
    return (localStorage.getItem('greLines_refreshInterval') as any) || '30s';
  });
  const [searchHistory, setSearchHistory] = useState(() => localStorage.getItem('greLines_searchHistory') !== 'false');
  const [searchStopLines, setSearchStopLines] = useState<Record<string, Line[]>>({});
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
   * La fiche horaire est ouverte depuis un passage d'un arrêt : elle n'a plus
   * de sens dès que cet arrêt se ferme, ou qu'on part vers une fiche de ligne.
   * Ajusté pendant le rendu pour qu'elle disparaisse dans la même image.
   */
  if (timetableTarget && (!isSidebarOpen || selectedLine !== null)) {
    setTimetableTarget(null);
  }

  /**
   * La fiche horaire est ouverte depuis un passage d'un arrêt : elle n'a plus
   * de sens dès que cet arrêt se ferme, ou qu'on part vers une fiche de ligne.
   */
  if (timetableTarget && (!isSidebarOpen || selectedLine !== null)) {
    setTimetableTarget(null);
  }


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
    enabled: urlHydrated && !selectedLine,
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !urlHydrated || selectedStop) return;
    const basePath = window.location.pathname;
    const target = selectedLine ? `${basePath}?${selectedLine.id}` : basePath;
    const current = window.location.pathname + window.location.search;
    if (current !== target) {
      window.history.replaceState(window.history.state, '', target);
    }
  }, [selectedLine, selectedStop, urlHydrated]);

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
  const normalizeLineSearch = (value: string) =>
    value.toLowerCase().replace(/^sem[:_]/, '');

  const matchedLines = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return allLines.filter(line => {
      const normalizedId = normalizeLineSearch(line.id);
      return (
        line.shortName.toLowerCase().includes(q) ||
        normalizedId.includes(q) ||
        line.longName.toLowerCase().includes(q)
      );
    }).slice(0, 6);
  }, [searchQuery, allLines]);

  useEffect(() => {
    const trimmed = debouncedSearchQuery.trim();
    if (!isSearchFocused && !isSearchHovered) return;

    const historyStopIds = searchHistoryItems
      .filter(item => item.kind === 'stop')
      .slice(0, 4)
      .map(item => item.id);

    const targetStops =
      trimmed.length >= 3
        ? matchedStops.slice(0, 4)
        : [];

    const idsToLoad = Array.from(new Set([
      ...targetStops.map(stop => stop.id),
      ...historyStopIds,
    ]));

    if (idsToLoad.length === 0) return;

    const cacheUpdates: Record<string, Line[]> = {};
    for (const stopId of idsToLoad) {
      if (searchStopLines[stopId]) continue;
      const cached = getCachedStopLines(stopId);
      if (!cached) continue;
      cacheUpdates[stopId] = cached;
    }
    if (Object.keys(cacheUpdates).length > 0) {
      setSearchStopLines(prev => ({ ...prev, ...cacheUpdates }));
    }

    const stopsToLoad = idsToLoad.filter(stopId => !searchStopLines[stopId] && !cacheUpdates[stopId]);
    if (stopsToLoad.length === 0) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      const queue = [...stopsToLoad];
      const concurrency = 3;
      const run = async () => {
        const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
          while (queue.length > 0 && !cancelled) {
            const stopId = queue.shift();
            if (!stopId) return;
            const lines = await getStopLines(stopId);
            if (cancelled) return;
            setSearchStopLines(prev => (prev[stopId] ? prev : { ...prev, [stopId]: lines }));
          }
        });
        await Promise.all(workers);
      };
      void run().catch(() => {});
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [debouncedSearchQuery, isSearchFocused, isSearchHovered, matchedStops, searchHistoryItems, searchStopLines]);

  useEffect(() => {
    // Les surcharges de lignes du CRM (code, nom, couleurs, masquage) sont
    // appliquées par-dessus le catalogue officiel MTAG.
    Promise.all([getAllSemLines(), getLineOverrides()]).then(([lines, overrides]) => {
      // Alimente le résolveur de couleurs : toutes les couleurs de ligne de
      // l'app (badges d'arrêt, départs, itinéraires, tracés) en dépendent.
      setLineColorOverrides(
        Array.from(overrides.values()).map(o => ({
          lineId: o.line_id,
          color: o.color,
          textColor: o.text_color,
        }))
      );

      if (overrides.size === 0) {
        setAllLines(lines);
        return;
      }

      setAllLines(
        lines
          .map(line => {
            const override =
              overrides.get(line.id.toUpperCase().trim()) ||
              overrides.get(line.shortName.toUpperCase().trim());
            if (!override) return line;
            return {
              ...line,
              shortName: override.short_name || line.shortName,
              color: override.color || line.color,
              textColor: override.text_color || line.textColor,
              hidden: override.hidden,
            };
          })
          .filter(line => !(line as AllLinesLine & { hidden?: boolean }).hidden)
      );
    });
  }, [cmsRevision]);
  const allLinesLookup = useMemo(() => buildLineLookup(allLines), [allLines]);

  // Line geometries — when the user filters by line(s) inside an open stop,
  // fetch and display the polyline of each filtered line, AND the set of
  // stops served by those lines so the map can hide everything else. With
  // no filter (selectedLines empty = "all"), we don't show any polyline and
  // we keep all stops visible.
  useEffect(() => {
    if (!selectedStop) {
      if (selectedLine) {
        let active = true;
        const linesToFetch = [{ id: selectedLine.id, shortName: selectedLine.shortName }];

        Promise.all([
          getLinesGeometryPrecise(linesToFetch),
          getStopsServedByLines(linesToFetch),
        ]).then(([geos, served]) => {
          if (!active) return;

          const enriched = geos.map(g => {
            const matchKey = g.code.replace(/^SEM_/, '');
            const line = linesToFetch.find(l => {
              const candidates = [l.id, l.shortName].filter(Boolean).map(s => String(s).toUpperCase());
              return candidates.includes(matchKey);
            });
            const resolved = allLinesLookup.get(String(line?.id ?? '').toUpperCase().trim())
          || allLinesLookup.get(matchKey)
          || allLinesLookup.get(line?.shortName?.toUpperCase().trim() || '');
            const baseColor = resolveLineBackgroundColor(resolved?.color || selectedLine?.color || null, matchKey);
            return {
              ...g,
              geojson: {
                ...g.geojson,
                features: g.geojson.features.map(f => {
                  const isExceptional = Boolean((f.properties as any)?.exceptional);
                  const color = isExceptional ? `${baseColor}CC` : baseColor;
                  return {
                    ...f,
                    properties: { ...(f.properties || {}), color },
                  };
                }),
              },
            };
          });

          setLineGeometries(enriched);
          setServedStopPoints(served);

          const coords: Array<[number, number]> = enriched.flatMap(g =>
            g.geojson.features.flatMap(feature => {
              if (feature.geometry?.type === 'LineString') {
                return feature.geometry.coordinates as Array<[number, number]>;
              }
              if (feature.geometry?.type === 'MultiLineString') {
                return (feature.geometry.coordinates as Array<Array<[number, number]>>).flat();
              }
              return [] as Array<[number, number]>;
            })
          );
          if (coords.length > 0) {
            const lons = coords.map(c => c[0]);
            const lats = coords.map(c => c[1]);
            const west = Math.min(...lons);
            const east = Math.max(...lons);
            const south = Math.min(...lats);
            const north = Math.max(...lats);
            const lonPad = Math.max((east - west) * 0.18, 0.004);
            const latPad = Math.max((north - south) * 0.18, 0.004);
            mapRef.current?.fitBounds([[west - lonPad, south - latPad], [east + lonPad, north + latPad]], {
              padding: isMobile ? 120 : 160,
              duration: 1000,
            });
          }
        });
        return () => { active = false; };
      }

      setLineGeometries([]);
      setServedStopPoints(null);
      return;
    }

    if (selectedLines.size === 0) {
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

      const enriched = geos.map(g => {
        const matchKey = g.code.replace(/^SEM_/, '');
        const line = linesToFetch.find(l => {
          const candidates = [l.id, l.shortName].filter(Boolean).map(s => String(s).toUpperCase());
          return candidates.includes(matchKey);
        });
        const resolved = allLinesLookup.get(String(line?.id ?? '').toUpperCase().trim())
          || allLinesLookup.get(matchKey)
          || allLinesLookup.get(line?.shortName?.toUpperCase().trim() || '');
        const baseColor = resolveLineBackgroundColor(resolved?.color || line?.color, matchKey);
        return {
          ...g,
          geojson: {
            ...g.geojson,
            features: g.geojson.features.map(f => {
              const isExceptional = Boolean((f.properties as any)?.exceptional);
              const color = isExceptional ? `${baseColor}CC` : baseColor;
              return {
                ...f,
                properties: { ...(f.properties || {}), color },
              };
            }),
          },
        };
      });
      setLineGeometries(enriched);

      setServedStopPoints(served);
    });
    return () => { active = false; };
  }, [selectedStop?.id, selectedStop?.lines, selectedLines, allLinesLookup, selectedLine, isMobile]);

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
      const nextDark = theme === 'auto' ? prefersDark : theme === 'dark';
      applyMode(nextDark);
      setEffectiveTheme(nextDark ? 'dark' : 'light');
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
  const handleLineSidebarClose = useCallback(() => {
    setSelectedLine(null);
    setLineGeometries([]);
    setServedStopPoints(null);
  }, []);

  const isTrafficPanelOpen = isTrafficButtonHovered || isTrafficPanelHovered || isTrafficPanelPinned;
  const isFavPanelOpen = isFavBtnHovered || isFavPanelHovered;
  const isAtmoPanelOpen = isAtmoBtnHovered || isAtmoPanelHovered;

  /**
   * Indice ATMO de la commune retenue. Chargé dès le démarrage, et non au
   * survol : la couleur du bouton *est* l'information, elle doit être juste
   * avant qu'on pense à ouvrir la carte.
   */
  useEffect(() => {
    if (atmoCommune) localStorage.setItem('greLines_atmoCommune', JSON.stringify(atmoCommune));
    else localStorage.setItem('greLines_atmoPostalCode', atmoPostalCode);

    // Pas d'AbortController ici : la requête est mutualisée entre appelants
    // par le cache du service, l'annuler priverait aussi le suivant de sa
    // réponse — et en développement, le double montage de StrictMode suffirait
    // à laisser la carte vide.
    let active = true;
    setAtmoLoading(true);
    (atmoCommune ? getAtmoReportForCommune(atmoCommune) : getAtmoReportByPostalCode(atmoPostalCode))
      .then(report => {
        if (!active) return;
        setAtmoReport(report);
      })
      .finally(() => {
        if (active) setAtmoLoading(false);
      });

    return () => { active = false; };
  }, [atmoPostalCode, atmoCommune]);
  // Live favourites list + their detail (lines + departures, refreshed every 30s).
  // Loaded globally so the app can prioritize the first favorite before it
  // leaves the splash screen.
  const favoritesList = useFavorites();
  const favoritesDetails = useFavoriteDetails(favoritesList, true);
  const firstFavoriteLoading = favoritesList.length > 0 && (favoritesDetails[0]?.loading ?? true);

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
    // L'arrêt consulté est la *destination* : on ouvre sa fiche pour savoir
    // comment y aller, pas pour en partir. Le départ reste à choisir (ou la
    // position courante si elle est connue).
    setRouteTo(location);
    setRouteFrom(
      currentLocation
        ? {
            id: 'position',
            label: language === 'fr' ? 'Ma position' : 'My location',
            lat: currentLocation.lat,
            lon: currentLocation.lon,
            kind: 'address',
          }
        : null
    );
    setSelectedRouteItinerary(null);
    setMapPickTarget(null);
    setSharedRouteExpired(false);
    setSharedRouteTarget(null);
    setSelectedAddress(null);
    setSelectedStop(null);
    setSidebarState('closed');
    setIsRouteSidebarOpen(true);
    mapRef.current?.centerOnLocation(stop.lat, stop.lon);
  }, [currentLocation, language]);

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
    let requestedLineId: string | null = null;

    params.forEach((value, key) => {
      const upperKey = key.toUpperCase();
      if (!requestedLineId && value === '' && /^(?:SEM:|SEM_)[A-Z0-9]+$/.test(upperKey)) {
        requestedLineId = key;
      }
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
    } else if (requestedLineId) {
      setInitialSelectedLineId(requestedLineId);
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
    const loadCmsContent = () => {
      getActivePopups().then(setActivePopups);
      getFooterConfig().then(setFooterConfig);
    };

    loadCmsContent();
    // Les changements faits depuis le CRM se répercutent immédiatement, sans
    // rechargement de page (temps réel Supabase). `cmsRevision` propage aussi
    // le signal aux données dérivées (arrêts et lignes surchargés).
    return subscribeToCmsChanges(() => {
      loadCmsContent();
      setCmsRevision(revision => revision + 1);
    });
  }, []);

  useEffect(() => {
    let active = true;
    // Doit précéder tout appel : c'est cette sélection qui sert de défaut à la
    // résolution d'un arrêt (favoris, liens partagés, prochains passages).
    setActiveNetworks(appliedNetworks);

    const fetchStops = async () => {
      try {
        setIsLoading(true);
        // Les surcharges définies dans le CRM (renommage, repositionnement,
        // masquage) sont appliquées par-dessus la donnée officielle MTAG.
        // Les réseaux ne viennent pas tous du même fournisseur : MTAG sert
        // Grenoble, TCL sert Lyon par notre propre proxy. On les charge en
        // parallèle et on les réunit — la carte ne fait pas la différence.
        const wantsTcl = appliedNetworks.includes(TCL_NETWORK);

        const [data, overrides, tclStops] = await Promise.all([
          getStopsByPrefixes(appliedNetworks),
          getStopOverrides(),
          wantsTcl ? getTclStops() : Promise.resolve([] as Stop[]),
        ]);
        if (!active) return;

        const merged = overrides.size === 0
          ? data
          : data
              .map(stop => {
                const override = overrides.get(stop.id);
                if (!override) return stop;
                return {
                  ...stop,
                  name: override.name || stop.name,
                  lat: override.lat ?? stop.lat,
                  lon: override.lon ?? stop.lon,
                  hidden: override.hidden,
                };
              })
              .filter(stop => !(stop as Stop & { hidden?: boolean }).hidden);

        setStops(tclStops.length > 0 ? [...merged, ...tclStops] : merged);
        setError(null);
      } catch (err) {
        if (!active) return;
        setError('Failed to load stops');      } finally {
        if (active) setIsLoading(false);
      }
    };
    fetchStops();
    return () => { active = false; };
    // `join` plutôt que le tableau lui-même : recharger seulement quand la
    // sélection change vraiment, pas à chaque nouvelle référence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cmsRevision, appliedNetworks.join(',')]);

  useEffect(() => { localStorage.setItem('greLines_language', language); }, [language]);
  useEffect(() => { localStorage.setItem('greLines_fontSize', fontSize); const root = document.documentElement; root.classList.remove('text-size-small', 'text-size-large'); if (fontSize === 'small') root.classList.add('text-size-small'); else if (fontSize === 'large') root.classList.add('text-size-large'); }, [fontSize]);
  useEffect(() => { localStorage.setItem('greLines_compactMode', compactMode ? 'true' : 'false'); }, [compactMode]);
  useEffect(() => { localStorage.setItem('greLines_refreshInterval', refreshInterval); }, [refreshInterval]);
  useEffect(() => { localStorage.setItem('greLines_searchHistory', searchHistory ? 'true' : 'false'); }, [searchHistory]);
  useEffect(() => { localStorage.setItem('greLines_searchHistoryItems', JSON.stringify(searchHistoryItems)); }, [searchHistoryItems]);
  useEffect(() => { localStorage.setItem('greLines_autoSync', autoSync ? 'true' : 'false'); }, [autoSync]);
  useEffect(() => { localStorage.setItem('greLines_autoLocation', autoLocation ? 'true' : 'false'); }, [autoLocation]);

  // Ouverture automatique du tutoriel d'installation, une fois par appareil.
  // Le petit délai laisse la carte s'afficher avant de recouvrir l'écran.
  useEffect(() => {
    if (!autoOpenInstallGuide) return;
    if (localStorage.getItem('greLines_installGuideDismissed') === 'true') return;
    const timer = window.setTimeout(() => setIsInstallSheetOpen(true), 1200);
    return () => window.clearTimeout(timer);
  }, [autoOpenInstallGuide]);

  const dismissInstallGuide = useCallback(() => {
    localStorage.setItem('greLines_installGuideDismissed', 'true');
    setIsInstallSheetOpen(false);
  }, []);

  const pushSearchHistoryItem = useCallback((item: SearchHistoryItem) => {
    if (!searchHistory) return;
    setSearchHistoryItems(prev => {
      const filtered = prev.filter(entry => !(entry.kind === item.kind && entry.id === item.id));
      return [item, ...filtered].slice(0, 4);
    });
  }, [searchHistory]);

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
      pushSearchHistoryItem({
        kind: 'stop',
        id: stop.id,
        name: stop.name,
        city: stop.city,
      });
      setSelectedLine(null);
      setLineGeometries([]);
      setSelectedAddress(null); // opening a stop clears any address marker
      const placeholder: StopDetail = { ...stop, lines: [], departures: [], lastUpdate: new Date() };
      setSelectedStop(placeholder);
      mapRef.current?.centerOnStop(stop);
      setSidebarState('peek');

      // Lyon a son propre fournisseur : lignes et passages viennent de notre
      // proxy, pas de l'API grenobloise. Le reste de l'écran ne voit aucune
      // différence — c'est la même fiche d'arrêt.
      if (isTclId(stop.id)) {
        const detail = await getTclStopDetail(stop.id);
        if (detail) setSelectedStop(detail);
        return;
      }

      const cachedLines = getCachedStopLines(stop.id);
      const linesPromise = cachedLines ? Promise.resolve(cachedLines) : getStopLines(stop.id);
      const departuresPromise = getDepartures(stop.id);
      const [linesResult, departuresResult] = await Promise.allSettled([
        linesPromise,
        departuresPromise,
      ]);
      const lines = linesResult.status === 'fulfilled' ? linesResult.value : cachedLines || [];
      const departures = departuresResult.status === 'fulfilled' ? departuresResult.value : [];
      setSelectedStop(prev => prev ? { ...prev, lines, departures, lastUpdate: new Date() } : { ...placeholder, lines, departures, lastUpdate: new Date() });
      if (cachedLines) {
        void refreshStopLines(stop.id).then(({ lines: refreshedLines, changed }) => {
          if (!changed) return;
          setSelectedStop(prev => (prev && prev.id === stop.id
            ? { ...prev, lines: refreshedLines, lastUpdate: new Date() }
            : prev));
        }).catch(() => {});
      }
    } catch (err) {}
  }, [pushSearchHistoryItem]);

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
    setSelectedLine(null);
    setLineGeometries([]);
    setSelectedAddress(address);
    pushSearchHistoryItem({
      kind: 'address',
      id: address.id,
      name: address.name,
      context: address.context,
      lat: address.lat,
      lon: address.lon,
    });
    // Cadre sur l'adresse *et* les arrêts que la fiche propose : centrer sur le
    // seul point laissait la moitié des arrêts listés hors de l'écran, alors
    // que c'est justement ce qu'on vient comparer.
    const nearby = findClosestStops(stops, address.lat, address.lon, 8);
    if (nearby.length > 0) {
      const lons = [address.lon, ...nearby.map(entry => entry.stop.lon)];
      const lats = [address.lat, ...nearby.map(entry => entry.stop.lat)];
      const west = Math.min(...lons);
      const east = Math.max(...lons);
      const south = Math.min(...lats);
      const north = Math.max(...lats);
      const lonPad = Math.max((east - west) * 0.25, 0.0015);
      const latPad = Math.max((north - south) * 0.25, 0.0015);
      mapRef.current?.fitBounds(
        [[west - lonPad, south - latPad], [east + lonPad, north + latPad]],
        { padding: isMobile ? 90 : 140, duration: 900 },
      );
    } else {
      mapRef.current?.centerOnLocation(address.lat, address.lon);
    }
  }, [pushSearchHistoryItem, stops, isMobile]);

  /**
   * Maj + Espace ouvre (et referme) la recherche universelle. Réservé à
   * l'ordinateur : sur mobile il n'y a pas de clavier physique, et la barre de
   * recherche dédiée remplit déjà ce rôle.
   *
   * Ctrl + Espace est écarté volontairement : macOS s'en sert pour changer de
   * source de saisie, le raccourci n'aurait jamais atteint la page.
   */
  useEffect(() => {
    if (isMobile) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.code !== 'Space' && event.key !== ' ') return;

      // Maj + Espace insère une espace dans un champ de saisie : on ne
      // détourne jamais la frappe quand l'utilisateur est en train d'écrire.
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable) return;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      event.preventDefault();
      setIsSpotlightOpen(open => !open);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobile]);

  /**
   * Mobilités partagées. Les flux GBFS annoncent une durée de vie de cinq
   * minutes, on s'y tient : rafraîchir plus souvent n'apporterait rien et le
   * flux Voi pèse près d'un mégaoctet. Aucun appel n'est fait pour un
   * opérateur désactivé.
   */
  useEffect(() => {
    if (!perfSettings.citiz && !perfSettings.voi) {
      setSharedMobility(EMPTY_SHARED_MOBILITY);
      return;
    }

    let active = true;
    const controller = new AbortController();

    const load = async () => {
      const data = await fetchSharedMobility({
        citiz: perfSettings.citiz,
        voi: perfSettings.voi,
        signal: controller.signal,
      });
      if (active) setSharedMobility(data);
    };

    void load();
    const interval = window.setInterval(load, SHARED_MOBILITY_TTL_MS);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(interval);
    };
  }, [perfSettings.citiz, perfSettings.voi]);

  const renderTerminusPair = (longName: string) => {
    const parts = longName.split('/').map(p => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return (
        <span className="inline-flex min-w-0 items-center gap-1 truncate">
          <span className="truncate">{parts[0]}</span>
          <ArrowsRightLeftIcon className="w-3.5 h-3.5 shrink-0 text-slate-400" />
          <span className="truncate">{parts[1]}</span>
        </span>
      );
    }
    return <span>{longName || 'Terminus inconnu'}</span>;
  };

  const renderStopLineBadges = (stopId: string) => {
    const lines = searchStopLines[stopId] || [];
    if (lines.length === 0) return null;
    const visible = lines.slice(0, 4);
    const hiddenCount = lines.length - visible.length;
    return (
      <div className="flex shrink-0 items-center gap-1">
        {visible.map(line => (
          <LineBadge key={line.id} line={line} size="xs" />
        ))}
        {hiddenCount > 0 && (
          <span
            className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-slate-700 bg-slate-800 px-1.5 text-[10px] font-extrabold text-slate-300"
            title={`+${hiddenCount}`}
          >
            +{hiddenCount}
          </span>
        )}
      </div>
    );
  };

  const getHistoryItemIcon = (item: SearchHistoryItem) => {
    if (item.kind === 'line') {
      const line = allLines.find(candidate => candidate.id === item.id) || allLines.find(candidate => candidate.shortName === item.shortName);
      if (line) return <LineBadge line={line} size="sm" />;
      return (
        <div className="w-9 h-9 rounded-2xl bg-slate-700 border border-slate-600 flex items-center justify-center text-[11px] font-extrabold text-white flex-shrink-0">
          {item.shortName}
        </div>
      );
    }
    if (item.kind === 'address') return <MapPinIcon className="w-4 h-4 text-amber-400 flex-shrink-0" />;
    return <StopCircleIcon className="w-4 h-4 text-sky-400 flex-shrink-0" />;
  };

  const getHistoryItemSubtitle = (item: SearchHistoryItem) => {
    if (item.kind === 'line') return renderTerminusPair(item.longName);
    if (item.kind === 'address') return item.context || text.unknownCity;
    const stop = stops.find(s => s.id === item.id) || stops.find(s => s.name === item.name);
    return stop?.city || item.city || text.unknownCity;
  };

  const handleHistoryItemSelect = (item: SearchHistoryItem) => {
    if (item.kind === 'line') {
      const line = allLines.find(candidate => candidate.id === item.id) || allLines.find(candidate => candidate.shortName === item.shortName);
      if (line) handleLineSearchSelect(line);
      return;
    }
    if (item.kind === 'address') {
      handleAddressSelect({
        id: item.id,
        label: item.name,
        name: item.name,
        context: item.context || '',
        lat: item.lat,
        lon: item.lon,
        score: 1,
      });
      return;
    }
    const stop = stops.find(candidate => candidate.id === item.id) || stops.find(candidate => candidate.name === item.name);
    if (stop) handleSearchResultSelect(stop);
  };

  const handleLineSearchSelect = useCallback((line: AllLinesLine) => {
    desktopSearchInputRef.current?.blur();
    setSearchQuery('');
    setIsSearchFocused(false);
    setIsSearchHovered(false);
    setSelectedAddress(null);
    setSelectedStop(null);
    setSelectedLine(line);
    setSelectedLines(new Set());
    setSidebarState('closed');
    pushSearchHistoryItem({
      kind: 'line',
      id: line.id,
      shortName: line.shortName,
      longName: line.longName,
    });
  }, [pushSearchHistoryItem]);

  useEffect(() => {
    if (!initialSelectedLineId || allLines.length === 0 || selectedStop) return;
    const normalizedRequested = initialSelectedLineId.toUpperCase().replace(/^SEM[:_]/, 'SEM:');
    const line = allLines.find(l => {
      const normalizedId = l.id.toUpperCase().replace(/^SEM[:_]/, 'SEM:');
      return normalizedId === normalizedRequested || l.shortName.toUpperCase() === normalizedRequested.replace(/^SEM:/, '');
    });
    if (line) {
      handleLineSearchSelect(line);
      setInitialSelectedLineId(null);
    }
  }, [initialSelectedLineId, allLines, selectedStop, handleLineSearchSelect]);

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
      const timer = window.setTimeout(() => setLocationError(null), 3000);
      return () => window.clearTimeout(timer);
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
      networks: {
        title: 'Réseaux affichés',
        others: 'Autres opérateurs',
        shared: 'Mobilités partagées',
        citiz: 'Voitures Citiz',
        voi: 'Trottinettes et vélos Voi',
        hint: 'Les changements s’appliquent à la fermeture des réglages. Chaque réseau ajouté est téléchargé une fois, puis conservé hors ligne. Les lignes scolaires sont toujours écartées : elles ne circulent que deux fois par jour et représentent plus de la moitié du réseau.',
      },
      dev: {
        section: 'Développeur',
        devMode: 'Mode développeur',
        devModeHint: 'Affiche une section Développeur avec les options d’optimisation. Disponible sur ordinateur uniquement.',
        overlay: 'Overlay développeur',
        overlayHint: 'Compteur de FPS et indicateurs de performance en haut à droite.',
        hideFooterTicker: 'Masquer l’infotrafic du footer',
        rendering: 'Rendu',
        stopLineBadges: 'Lignes à côté des arrêts',
        stopLabels: 'Noms des arrêts sur la carte',
        lineShapes: 'Tracés des lignes',
        effects: 'Effets',
        animations: 'Animations',
        blurEffects: 'Flous d’arrière-plan',
        shadows: 'Ombres',
        markerCap: 'Marqueurs max',
        unlimited: 'Illimité',
        reset: 'Rétablir les valeurs par défaut',
        note: 'Ces options n’affectent que cet appareil. Désactiver un élément allège le rendu et réduit les requêtes.',
      },
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
      networks: {
        title: 'Networks shown',
        others: 'Other operators',
        shared: 'Shared mobility',
        citiz: 'Citiz cars',
        voi: 'Voi scooters and bikes',
        hint: 'Changes apply once you close settings. Each network is downloaded once, then kept offline. School services are always excluded: they run twice a day and account for more than half the network.',
      },
      dev: {
        section: 'Developer',
        devMode: 'Developer mode',
        devModeHint: 'Adds a Developer section with optimisation options. Desktop only.',
        overlay: 'Developer overlay',
        overlayHint: 'FPS counter and performance indicators, top right.',
        hideFooterTicker: 'Hide footer traffic ticker',
        rendering: 'Rendering',
        stopLineBadges: 'Line badges next to stops',
        stopLabels: 'Stop names on the map',
        lineShapes: 'Line shapes',
        effects: 'Effects',
        animations: 'Animations',
        blurEffects: 'Background blur',
        shadows: 'Shadows',
        markerCap: 'Max markers',
        unlimited: 'Unlimited',
        reset: 'Restore defaults',
        note: 'These options only affect this device. Turning something off lightens rendering and cuts requests.',
      },
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
  const isLoadingOverlayVisible = isLoading || firstFavoriteLoading;

  // ─── Itinéraire sur la carte ──────────────────────────────────────────────
  // Le tracé renvoyé par le planificateur est approximatif : il coupe les
  // courbes et s'arrête à quelques mètres des arrêts. On récupère donc le tracé
  // de référence de chaque ligne empruntée pour y découper le trajet réel.

  const normalizeRouteRef = useCallback((value: string | undefined | null): string | null => {
    if (!value) return null;
    const code = String(value)
      .toUpperCase()
      .replace(/^(?:SEM|SE2):?/, '')
      .replace(/^(?:SEM|SE2)_/, '')
      .trim();
    return code || null;
  }, []);

  const getRouteCandidates = useCallback((...values: Array<string | undefined | null>): string[] => {
    const candidates = values
      .map(normalizeRouteRef)
      .filter((value): value is string => Boolean(value));
    return Array.from(new Set(candidates));
  }, [normalizeRouteRef]);

  /** Codes courts des lignes empruntées par l'itinéraire affiché. */
  const itineraryLineKeys = useMemo(() => {
    const legs = selectedRouteItinerary?.allLegs || [];
    const keys = legs
      .filter((leg: any) => leg?.mode !== 'WALK')
      .map((leg: any) => getRouteCandidates(leg.routeShortName, leg.route, leg.routeId)[0])
      .filter((key: string | undefined): key is string => Boolean(key));
    return Array.from(new Set(keys)).sort();
  }, [selectedRouteItinerary, getRouteCandidates]);

  const itineraryLineKeysSignature = itineraryLineKeys.join('|');

  useEffect(() => {
    if (itineraryLineKeys.length === 0) {
      setItineraryLineShapes(new Map());
      return;
    }

    let active = true;
    getLinesGeometryPrecise(itineraryLineKeys.map(code => ({ id: code, shortName: code })))
      .then(geometries => {
        if (!active) return;
        setItineraryLineShapes(
          new Map(geometries.map(geometry => [geometry.code.replace(/^SEM_/, ''), geometry]))
        );
      })
      .catch(() => {
        if (active) setItineraryLineShapes(new Map());
      });

    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itineraryLineKeysSignature]);

  /**
   * Ramène un arrêt du planificateur (un quai précis) sur le cluster que
   * l'application affiche : c'est là que sont posés les marqueurs d'arrêts, donc
   * là que doivent tomber les pastilles et les coudes du tracé.
   */
  const resolveCluster = useMemo(() => {
    if (stops.length === 0) return undefined;

    const cellKey = (lat: number, lon: number) => `${Math.round(lat * 100)}:${Math.round(lon * 100)}`;
    const grid = new Map<string, Stop[]>();
    for (const stop of stops) {
      if (!Number.isFinite(stop.lat) || !Number.isFinite(stop.lon)) continue;
      const key = cellKey(stop.lat, stop.lon);
      const bucket = grid.get(key);
      if (bucket) bucket.push(stop);
      else grid.set(key, [stop]);
    }

    // « Grenoble, Victor Hugo » côté planificateur, « Victor Hugo » côté carte.
    const nameKey = (value: string | undefined) =>
      (value || '')
        .replace(/^[^,]+,\s*/, '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');

    return (point: JourneyStopRef): JourneyStopRef | null => {
      const wanted = nameKey(point.name);
      let best: { stop: Stop; meters: number; sameName: boolean } | null = null;

      const latCell = Math.round(point.lat * 100);
      const lonCell = Math.round(point.lon * 100);
      for (let dLat = -1; dLat <= 1; dLat++) {
        for (let dLon = -1; dLon <= 1; dLon++) {
          const bucket = grid.get(`${latCell + dLat}:${lonCell + dLon}`);
          if (!bucket) continue;
          for (const stop of bucket) {
            const meters = haversineMeters(point.lat, point.lon, stop.lat, stop.lon);
            const sameName = Boolean(wanted) && nameKey(stop.name) === wanted;
            // Un même nom autorise un écart plus large : le cluster est le
            // barycentre de quais parfois distants de 150 m. Au-delà, on
            // laisserait le tracé faire un crochet visible pour rejoindre la
            // pastille — mieux vaut garder la position du planificateur.
            if (meters > (sameName ? 250 : 120)) continue;
            if (!best || (sameName && !best.sameName) || (sameName === best.sameName && meters < best.meters)) {
              best = { stop, meters, sameName };
            }
          }
        }
      }

      if (!best) return null;
      return { lat: best.stop.lat, lon: best.stop.lon, name: best.stop.name, id: best.stop.id };
    };
  }, [stops]);

  const getItineraryLineColor = useCallback((leg: any): string => {
    const candidates = getRouteCandidates(leg?.routeShortName, leg?.route, leg?.routeId);
    const normalized = candidates[0] || null;
    if (!normalized) return '#94a3b8';
    const lineInfo = candidates
      .map(candidate => allLinesLookup.get(candidate))
      .find((line): line is AllLinesLine => Boolean(line?.color));
    return resolveLineBackgroundColor(lineInfo?.color, normalized);
  }, [allLinesLookup, getRouteCandidates]);

  const journeyGeometry = useMemo(() => {
    const legs = selectedRouteItinerary?.allLegs || [];
    if (legs.length === 0) return null;

    return buildJourneyGeometry({
      legs,
      getLineColor: getItineraryLineColor,
      getLineKey: (leg: any) => getRouteCandidates(leg?.routeShortName, leg?.route, leg?.routeId)[0] || '',
      referenceGeometries: itineraryLineShapes,
      resolveCluster,
    });
  }, [selectedRouteItinerary, getItineraryLineColor, getRouteCandidates, itineraryLineShapes, resolveCluster]);

  /**
   * Arrêts listés par la fiche adresse. La carte les nomme en toutes lettres
   * quel que soit le zoom : le cadrage les fait souvent tenir sous le seuil
   * d'affichage des étiquettes, et on lisait une liste de noms à côté de huit
   * points anonymes.
   */
  const addressNearbyStopIds = useMemo(() => {
    if (!selectedAddress) return null;
    return findClosestStops(stops, selectedAddress.lat, selectedAddress.lon, 8).map(entry => entry.stop.id);
  }, [selectedAddress, stops]);

  const routeLineGeoJSON = journeyGeometry?.lines ?? null;
  const routeStopsGeoJSON = journeyGeometry?.points ?? null;
  const routeLineBadges = journeyGeometry?.badges ?? null;

  const isDarkMode = effectiveTheme === 'dark';
  const greGoLogoSrc = isDarkMode ? '/assets/GreGoLOGO.png' : '/assets/grego_light.png';

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
      alwaysLabelledStopIds={addressNearbyStopIds}
      sharedMobility={sharedMobility}
      focusedShared={sharedSelection}
      highlightedVehicleId={highlightedVehicleId}
      onSharedSelect={selection => {
        // Une fiche à la fois : ouvrir un véhicule referme l'arrêt courant.
        setSelectedStop(null);
        setSidebarState('closed');
        setSharedSelection(selection);
        setHighlightedVehicleId(null);
      }}
      routeStart={routeFrom ? { id: routeFrom.id, lat: routeFrom.lat, lon: routeFrom.lon, label: routeFrom.label, kind: routeFrom.kind } : undefined}
      routeEnd={routeTo ? { id: routeTo.id, lat: routeTo.lat, lon: routeTo.lon, label: routeTo.label, kind: routeTo.kind } : undefined}
      routeLine={routeLineGeoJSON}
      routeStops={routeStopsGeoJSON}
      routeLineBadges={routeLineBadges}
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
      isDarkMode={isDarkMode}
    />
  ), [stops, selectedStop, currentLocation, handleStopClick, selectedAddress, addressNearbyStopIds, lineGeometries, servedStopPoints, routeFrom, routeTo, routeLineGeoJSON, routeStopsGeoJSON, routeLineBadges, selectedRouteItinerary, mapPickTarget, isDarkMode, sharedMobility, sharedSelection, highlightedVehicleId]);

  useEffect(() => {
    if (!selectedRouteItinerary || !routeLineGeoJSON) return;

    const allCoordinates = routeLineGeoJSON.features.flatMap((feature) => {
      if (feature.geometry.type === 'LineString') {
        return feature.geometry.coordinates as Array<[number, number]>;
      }
      return [] as Array<[number, number]>;
    });

    if (allCoordinates.length === 0) return;

    const featuredCoordinates = allCoordinates.slice(0, 90);
    const coordinatesForCamera = featuredCoordinates.length >= 2 ? featuredCoordinates : allCoordinates;
    const lons = coordinatesForCamera.map(([lon]) => lon);
    const lats = coordinatesForCamera.map(([, lat]) => lat);
    const west = Math.min(...lons);
    const east = Math.max(...lons);
    const south = Math.min(...lats);
    const north = Math.max(...lats);
    const lonPad = Math.max((east - west) * 0.22, 0.004);
    const latPad = Math.max((north - south) * 0.22, 0.004);

    mapRef.current?.fitBounds([[west - lonPad, south - latPad], [east + lonPad, north + latPad]], {
      padding: isMobile ? 120 : 160,
      duration: 1000,
    });
  }, [selectedRouteItinerary, routeLineGeoJSON, isMobile]);

  return (
    <MotionConfig reducedMotion={perfSettings.animations ? 'never' : 'always'}>
    <div className="relative h-screen w-screen overflow-hidden bg-gray-950">
      <AnimatePresence>
        {locationError && (
          <motion.div
            key="location-error"
            initial={{ opacity: 0, y: -32 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -32 }}
            drag="y"
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (info.offset.y > 60 || info.velocity.y > 300) {
                setLocationError(null);
              }
            }}
            className={`fixed left-1/2 top-4 z-[100] -translate-x-1/2 max-w-[min(92vw,420px)] rounded-full px-4 py-2 text-sm font-semibold shadow-2xl ${
              isDarkMode
                ? 'border border-red-500/40 bg-red-900/95 text-white shadow-red-950/40'
                : 'border border-red-300 bg-white/95 text-red-900 shadow-red-300/40'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate">{locationError}</span>
              <button
                onClick={() => setLocationError(null)}
                className="text-xs font-semibold text-current opacity-80 transition hover:opacity-100"
                aria-label="Close location notification"
              >
                ✕
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* La carte est montée dès le premier rendu, et l'écran de chargement se
          superpose par-dessus. Auparavant elle n'apparaissait qu'une fois le
          catalogue d'arrêts chargé : la requête de style MapTiler ne partait
          qu'à ce moment-là (mesuré à plus de 10 s), alors qu'elle ne dure que
          quelques millisecondes. Fond de carte et données MTAG se chargent
          désormais en parallèle. */}
      <div className="absolute inset-0 z-0">
        {error ? (
          <div className="h-full flex items-center justify-center bg-red-950">
            <p className="text-red-400">{error}</p>
          </div>
        ) : (
          mapElement
        )}
      </div>

      {isLoadingOverlayVisible && !error && (
        <div className="fixed inset-0 z-[9999] h-screen w-screen flex flex-col items-center justify-center bg-black bg-opacity-95">
          <div className="flex-1 flex items-center justify-center">
            <img src="/assets/GreLinesLOGO.png" alt="GreLines Loading" className="w-80 h-auto animate-pulse-opacity" />
          </div>
          <div className="pb-16">
            <img src="/assets/M-Reso.png" alt="M-Reso" className="w-28 h-auto" />
          </div>
        </div>
      )}

      {!isLoadingOverlayVisible && <PopupOverlay popups={activePopups} language={language} />}

      <DeferredPanel isOpen={selectedRouteItinerary !== null}>
        {selectedRouteItinerary && (
        <NavigationMode
          itinerary={selectedRouteItinerary}
          isOpen={isNavigationOpen}
          onClose={() => setIsNavigationOpen(false)}
          language={language}
          stops={stops}
          lineLookup={allLinesLookup}
          currentLocation={currentLocation}
          itineraryOptions={routeItineraryOptions}
          onItinerarySelected={setSelectedRouteItinerary}
          onBoardVehicle={({ lineShortName, boardingStop }) =>
            setSurveyContext({
              lineId: lineShortName,
              boardingStop,
              boardingTime: new Date().toISOString(),
            })
          }
          isMobile={isMobile}
        />
        )}
      </DeferredPanel>

      <DeferredPanel isOpen={surveyContext !== null}>
        <TripSurvey
          isOpen={surveyContext !== null}
          onClose={() => setSurveyContext(null)}
          lineId={surveyContext?.lineId ?? ''}
          boardingStop={surveyContext?.boardingStop}
          boardingTime={surveyContext?.boardingTime}
          language={language}
        />
      </DeferredPanel>

      <DeferredPanel isOpen={isSettingsOpen}>
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
        showInstallGuide={canOfferInstallGuide}
        onOpenInstallGuide={() => {
          setSettingsState('closed');
          setIsInstallSheetOpen(true);
        }}
        appData={appData}
        text={text}
        contentRef={settingsContentRef}
        panelRef={settingsPanelRef}
        uiTheme={effectiveTheme}
      />
      </DeferredPanel>

      <DeferredPanel isOpen={isRouteSidebarOpen}>
      <RouteSidebar
        isOpen={isRouteSidebarOpen}
        onClose={resetRoutePlanner}
        stops={stops}
        language={language}
        isMobile={isMobile}
        theme={effectiveTheme}
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
          setRouteItineraryOptions([]);
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
          setRouteItineraryOptions([]);

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
          setRouteItineraryOptions([]);
        }}
        onItinerarySelected={itinerary => setSelectedRouteItinerary(itinerary)}
        onItinerariesUpdated={options => {
          setRouteItineraryOptions(options);
          if (autoPickFirstItinerary && options.length > 0) {
            setSelectedRouteItinerary(options[0]);
            setAutoPickFirstItinerary(false);
          }
        }}
        onStartNavigation={() => setIsNavigationOpen(true)}
        onPlanNewSharedRoute={() => {
          setSharedRouteExpired(false);
          setSelectedRouteItinerary(null);
          setRouteItineraryOptions([]);
          setSharedRouteTarget(null);
          setMapPickTarget(null);
          setIsRouteSidebarOpen(true);
        }}
        onRouteReset={() => {
          setRouteFrom(null);
          setRouteTo(null);
          setSelectedRouteItinerary(null);
          setRouteItineraryOptions([]);
          setSharedRouteExpired(false);
          setSharedRouteTarget(null);
        }}
      />
      </DeferredPanel>

      {!isLoading && (
        <>
          {isMobile && !hidePageControls && !isSidebarOpen && !isSettingsOpen && !isTrafficPanelOpenMobile && !isRouteSidebarOpen && (
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
                  matchedLines={matchedLines}
                  allLines={allLines}
                  matchedStopLines={searchStopLines}
                  stops={stops}
                  searchHistoryItems={searchHistory ? searchHistoryItems : []}
                  searchPlaceholder={text.searchPlaceholder}
                  unknownCityLabel={text.unknownCity}
                  onStopClick={stop => { setSelectedAddress(null); setSelectedLine(null); handleStopClick(stop); mapRef.current?.centerOnStop(stop); }}
                  onLineClick={line => handleLineSearchSelect(line)}
                  isFocused={isSearchFocused}
                  onFocus={setIsSearchFocused}
                  addressResults={addressResults}
                  onAddressClick={handleAddressSelect}
                  language={language}
                  theme={effectiveTheme}
                />
              </div>
            </motion.div>
          )}

          {isMobile && !hidePageControls && isNearbySheetOpen && !isSidebarOpen && !isSettingsOpen && !isTrafficPanelOpenMobile && (
            <>
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
                      {searchQuery.trim() !== '' && matchedLines.length > 0 && (
                        <>
                          <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800">
                            {language === 'fr' ? 'Lignes' : 'Lines'}
                          </div>
                          {matchedLines.map(line => (
                            <button
                              key={line.id}
                              type="button"
                              onMouseDown={e => { e.preventDefault(); handleLineSearchSelect(line); }}
                              className="w-full text-left px-3 py-2 hover:bg-slate-800 transition flex items-center gap-2"
                            >
                              <LineBadge line={line} size="sm" />
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium text-gray-100 truncate">{line.shortName}</div>
                                <div className="text-xs text-slate-400 truncate">
                                  {renderTerminusPair(line.longName)}
                                </div>
                              </div>
                            </button>
                          ))}
                        </>
                      )}

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
                              className="w-full text-left px-3 py-2 hover:bg-slate-800 transition flex items-start gap-2"
                            >
                              <StopCircleIcon className="w-4 h-4 text-blue-400 flex-shrink-0" />
                              <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 items-center gap-2">
                                  <div className="min-w-0 truncate text-sm font-medium text-gray-100">{stop.name}</div>
                                  {renderStopLineBadges(stop.id)}
                                </div>
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
                        searchHistoryItems.map((item, i) => (
                          <button
                            key={`${item.kind}-${item.id}-${i}`}
                            type="button"
                            onMouseDown={e => {
                              e.preventDefault();
                              handleHistoryItemSelect(item);
                            }}
                            className="w-full text-left px-3 py-2.5 hover:bg-slate-800 transition border-b border-slate-800 last:border-b-0"
                          >
                            <div className="flex items-start gap-2.5">
                              {getHistoryItemIcon(item)}
                              <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 items-center gap-2">
                                  <div className="min-w-0 text-sm font-medium text-gray-100 truncate">
                                    {item.kind === 'line' ? item.shortName : item.name}
                                  </div>
                                  {item.kind === 'stop' && renderStopLineBadges(item.id)}
                                </div>
                                <div className="text-xs text-gray-400 truncate">
                                  {getHistoryItemSubtitle(item)}
                                </div>
                              </div>
                            </div>
                          </button>
                        ))
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
                            <img src={greGoLogoSrc} alt="GreGo" className="h-4 w-auto" />
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

              {/* ── Indice ATMO (desktop) ─────────────────────────────
                  Même mécanique de survol que les deux panneaux voisins. Replié,
                  le bouton porte la couleur du niveau du jour et son
                  pictogramme officiel : la qualité de l'air se lit sans ouvrir
                  quoi que ce soit. */}
              <div
                onMouseEnter={() => setIsAtmoBtnHovered(true)}
                onMouseLeave={() => setIsAtmoBtnHovered(false)}
                className="relative z-50"
              >
                <div
                  className={`flex items-center justify-center cursor-pointer border transition-all duration-300 ${
                    isAtmoPanelOpen ? 'w-96 h-96 rounded-2xl' : 'w-10 h-10 rounded-full shadow-lg'
                  }`}
                  style={{
                    backgroundColor: atmoColor(atmoReport),
                    borderColor: isAtmoPanelOpen ? 'transparent' : 'rgba(15,23,42,0.35)',
                  }}
                  title={
                    atmoReport?.current
                      ? `${language === 'fr' ? 'Indice Atmo air' : 'Air quality index'} — ${atmoReport.current.qualificatif}`
                      : language === 'fr' ? 'Indice Atmo air' : 'Air quality index'
                  }
                >
                  {!isAtmoPanelOpen && (
                    atmoPicto(atmoReport) ? (
                      <img
                        src={atmoPicto(atmoReport) as string}
                        alt={atmoReport?.current?.qualificatif || ''}
                        className="h-6 w-6"
                      />
                    ) : (
                      <CloudIcon className="w-5 h-5 text-white" />
                    )
                  )}
                  <div
                    onMouseEnter={() => setIsAtmoPanelHovered(true)}
                    onMouseLeave={() => setIsAtmoPanelHovered(false)}
                    className={`absolute top-0 left-0 z-50 transition-all duration-300 ease-out ${
                      isAtmoPanelOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                    }`}
                    style={{ width: '100%', height: '100%' }}
                  >
                    <AtmoPanel
                      report={atmoReport}
                      loading={atmoLoading}
                      onCommuneChange={setAtmoCommune}
                      language={language}
                    />
                  </div>
                </div>
              </div>

              {/* ── Traffic info panel (desktop) ───────────────────────
                  Same look & filter logic as TrafficPanelMobile: filter
                  tabs (All/Trams/Chrono/Bus), per-line cards with a
                  category-coloured badge (tram=blue, chrono=orange,
                  bus=slate), sorted by category then by end-date. */}
              <div onMouseEnter={() => setIsTrafficButtonHovered(true)} onMouseLeave={() => { setIsTrafficButtonHovered(false); setIsTrafficPanelPinned(false); }} className="relative z-50">
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
          onOpenItinerary={() => {
            setSnapHomeToMiniSignal(s => s + 1);
            setIsRouteSidebarOpen(true);
          }}
          language={language}
          theme={effectiveTheme}
          favorites={favoritesList}
          favoriteDetails={favoritesDetails}
          atmoReport={atmoReport}
          atmoLoading={atmoLoading}
          onAtmoCommuneChange={setAtmoCommune}
        />
      )}

      {!hidePageControls && (
        <TrafficPanelMobile
          isOpen={isTrafficPanelOpenMobile}
          onClose={() => setIsTrafficPanelOpenMobile(false)}
          trafficInfo={trafficInfo}
          language={language}
          theme={effectiveTheme}
          lineLookup={allLinesLookup}
        />
      )}

      {!hidePageControls && (
        <InstallAppSheet
          isOpen={isInstallSheetOpen}
          onDismiss={dismissInstallGuide}
          onClose={() => setIsInstallSheetOpen(false)}
          language={language}
          theme={effectiveTheme}
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
          theme={effectiveTheme}
          onPlanRouteFromStop={openRouteFromStop}
          onOpenTimetable={setTimetableTarget}
          onOpenLine={line => {
            // L'identifiant complet d'abord : « SEM:C1 » et « SNC:C1 » sont
            // deux lignes différentes, et le code nu ne les distingue pas.
            const resolved = allLinesLookup.get(line.id.toUpperCase().trim())
              ?? allLinesLookup.get((line.shortName || line.id).toUpperCase().trim());
            if (resolved) handleLineSearchSelect(resolved);
          }}
        />
      )}

      <DeferredPanel isOpen={selectedLine !== null}>
      <LineSidebar
        line={selectedLine}
        isOpen={selectedLine !== null}
        onClose={handleLineSidebarClose}
        stops={stops}
        trafficInfo={trafficInfo}
        language={language}
        autoSync={autoSync}
        refreshIntervalMs={parseRefreshInterval(refreshInterval)}
        theme={effectiveTheme}
        onPlanRoute={() => setIsRouteSidebarOpen(true)}
        onOpenTimetable={() => {
          if (!selectedLine) return;
          setTimetableTarget({
            line: {
              id: selectedLine.id,
              shortName: selectedLine.shortName,
              color: selectedLine.color,
              textColor: selectedLine.textColor,
            },
          });
        }}
        onOpenLineMap={() => {
          if (!selectedLine) return;
          setLineMapTarget({
            routeId: toTimetableRouteId(selectedLine.shortName || selectedLine.id),
            label: `${language === 'fr' ? 'Ligne' : 'Line'} ${selectedLine.shortName || selectedLine.id}`,
            color: selectedLine.color,
          });
        }}
        onStopClick={(stop) => {
          setSelectedLine(null);
          handleStopClick(stop);
          mapRef.current?.centerOnStop(stop);
        }}
      />
      </DeferredPanel>

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
          theme={effectiveTheme}
          onPlanRouteFromStop={openRouteFromStop}
          onOpenTimetable={setTimetableTarget}
          onOpenLine={line => {
            const resolved = allLinesLookup.get(line.id.toUpperCase().trim())
              ?? allLinesLookup.get((line.shortName || line.id).toUpperCase().trim());
            if (resolved) handleLineSearchSelect(resolved);
          }}
        />
      )}

      {/* Address sidebar — opens automatically when an address is picked */}
      <DeferredPanel isOpen={selectedAddress !== null && !isSidebarOpen}>
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
      </DeferredPanel>

      {/* Bottom bar with clock and signal — desktop only */}
      {!hidePageControls && !isMobile && (
        <ClockSignal
          closedLabel={text.misc.networkClosed}
          overrideMessage={footerConfig.message}
          overrideColor={footerConfig.color}
          showClock={footerConfig.showClock}
        />
      )}

      {/* Recherche universelle — ordinateur uniquement (Ctrl + Espace) */}
      {!isMobile && (
        <DeferredPanel isOpen={isSpotlightOpen}>
          <Spotlight
            isOpen={isSpotlightOpen}
            onClose={() => setIsSpotlightOpen(false)}
            language={language}
            stops={stops}
            lines={allLines}
            trafficInfo={trafficInfo}
            onSelectStop={stop => {
              setSelectedAddress(null);
              setSelectedLine(null);
              handleStopClick(stop);
              mapRef.current?.centerOnStop(stop);
            }}
            onSelectLine={handleLineSearchSelect}
            onSelectAddress={handleAddressSelect}
            onOpenSettings={tab => {
              setActiveSettingsTab(tab ?? 'general');
              setSettingsState('open');
            }}
            onOpenTraffic={() => setIsTrafficPanelPinned(true)}
            onPlanRoute={() => setIsRouteSidebarOpen(true)}
            onOpenNearby={handleLocationClick}
          />
        </DeferredPanel>
      )}

      {import.meta.env.PROD && <Analytics />}

      {/* Fiche horaire d'une ligne, à droite de la fiche d'arrêt */}
      <DeferredPanel isOpen={timetableTarget !== null}>
        <TimetableSidebar
          isOpen={timetableTarget !== null}
          onClose={() => setTimetableTarget(null)}
          line={timetableTarget?.line ?? null}
          preferredHeadsign={timetableTarget?.headsign ?? null}
          highlightStopName={selectedStop?.name ?? null}
          isMobile={isMobile}
          language={language}
          onOpenLineMap={() => {
            if (!timetableTarget) return;
            const line = timetableTarget.line;
            setLineMapTarget({
              routeId: toTimetableRouteId(line.shortName || line.id),
              label: `${language === 'fr' ? 'Ligne' : 'Line'} ${line.shortName || line.id}`,
              color: line.color,
            });
          }}
        />
      </DeferredPanel>

      {/* Plan de ligne en PDF, lu sur place */}
      <DeferredPanel isOpen={lineMapTarget !== null}>
        <LineMapViewer
          isOpen={lineMapTarget !== null}
          onClose={() => setLineMapTarget(null)}
          routeId={lineMapTarget?.routeId ?? null}
          lineLabel={lineMapTarget?.label}
          lineColor={lineMapTarget?.color}
          isMobile={isMobile}
          language={language}
        />
      </DeferredPanel>

      {/* Fiche des véhicules partagés (Citiz / Voi) */}
      <DeferredPanel isOpen={sharedSelection !== null}>
        {sharedSelection && (
          <SharedMobilitySidebar
            isOpen={sharedSelection !== null}
            onClose={() => { setSharedSelection(null); setHighlightedVehicleId(null); }}
            onVehicleFocus={setHighlightedVehicleId}
            operator={sharedSelection.operator}
            points={sharedSelection.points}
            isMobile={isMobile}
            language={language}
            onRouteTo={destination => {
              const target: RouteLocation = {
                id: `shared-${destination.lat},${destination.lon}`,
                label: destination.label,
                lat: destination.lat,
                lon: destination.lon,
                kind: 'address',
              };
              setRouteTo(target);
              setSelectedRouteItinerary(null);
              setRouteItineraryOptions([]);
              // Sur mobile avec la géolocalisation active, le départ est connu :
              // on enchaîne directement sur le premier itinéraire proposé.
              if (currentLocation) {
                setRouteFrom({
                  id: 'position',
                  label: language === 'fr' ? 'Ma position' : 'My location',
                  lat: currentLocation.lat,
                  lon: currentLocation.lon,
                  kind: 'address',
                });
                setAutoPickFirstItinerary(isMobile);
              }
              setSharedSelection(null);
              setIsRouteSidebarOpen(true);
            }}
          />
        )}
      </DeferredPanel>

      {/* Overlay de performance — mode développeur, ordinateur uniquement */}
      {!isMobile && <DevOverlay />}
    </div>
    </MotionConfig>
  );
}

export default App;
