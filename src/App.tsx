import { cityNear, cityOfNetwork } from './utils/cities';
import { GUIDANCE_ENABLED, IS_NANCY } from './site';
import { locateByIp } from './services/ipLocation';
import { getLocatedCity, setIpArea, setMapArea, setUserArea, subscribeCurrentCity } from './utils/currentArea';
import { getFakeLocation, subscribeFakeLocation } from './utils/devLocation';
import { getForeignTraffic } from './services/foreignTraffic';
import { sortStopPreviewLines } from './utils/lineOrder';
import { DevConsole } from './components/DevConsole';
import { NetOverlay } from './components/NetOverlay';
import { OfflineLaunchScreen } from './components/OfflineLaunchScreen';
import { IoWifi } from 'react-icons/io5';
import { useIsOffline, useReconnectCount } from './hooks/useIsOffline';
import { OfflinePanel } from './components/OfflinePanel';
import { tx } from './i18n';
﻿import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef, useSyncExternalStore, lazy } from 'react';
import { AnimatePresence, animate, motion, useMotionValue, useTransform, MotionConfig } from 'framer-motion';
import { MagnifyingGlassIcon, ExclamationTriangleIcon, MapIcon, MapPinIcon, Cog6ToothIcon, XMarkIcon, StarIcon, CloudIcon, BellAlertIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import { PlaceIcon } from './components/PlaceIcon';
import { DesktopSearchResults, TerminusPair } from './components/DesktopSearchResults';
import { TbBusStop } from 'react-icons/tb';
import { resolveLineBackgroundColor, setLineColorOverrides } from './utils/lineColors';
import { useFavorites } from './hooks/useFavorites';
import { useFavoriteLines } from './hooks/useFavoriteLines';
import { useFavoriteDetails } from './hooks/useFavoriteDetails';
import { useFavoriteJourneys } from './hooks/useFavoriteJourneys';
import { useJourneyHistory } from './hooks/useJourneyHistory';
import { addFavoriteJourney, journeyKey, FAVORITE_JOURNEYS_MAX } from './services/favoriteJourneys';
import { recordJourney } from './services/journeyHistory';
import { getAllSemLines, buildLineLookup, type AllLinesLine } from './services/allLines';
import { LineBadge } from './components/LineBadge';
import { favoriteStopLines } from './utils/favoriteDepartures';

import { Map as TransitMap } from './components/Map';
import { Sidebar } from './components/Sidebar';
import { SearchBarMobile } from './components/SearchBarMobile';
import { TrafficPanelMobile } from './components/TrafficPanelMobile';
import { TrafficAlertCard } from './components/TrafficAlertCard';
import { useWheelScroll } from './hooks/useWheelScroll';
import { InstallAppSheet } from './components/InstallAppSheet';
import { NancyAreaPrompt } from './components/NancyAreaPrompt';
import { UnservedAreaPrompt } from './components/UnservedAreaPrompt';
import { getSncfLines, getSncfStopDetail, getSncfStops, isSncfStopId, sncfStationsLinkedTo } from './services/sncfNetwork';
import { DepartureLabOverlay } from './components/DepartureLabOverlay';
import { closeLab, getLabState, openLab, setLabSelectedLines, subscribeLab } from './dev/departureLab';
import { MobileNotificationPrompt } from './components/MobileNotificationPrompt';
import { LaunchScreen } from './components/LaunchScreen';
import { SidebarMobile } from './components/SidebarMobile';
import { HomeSheet } from './components/HomeSheet';
import { AccountScreen } from './components/AccountScreen';
import { FavoritesScreen } from './components/FavoritesScreen';
import { Toast, type ToastMessage } from './components/Toast';
import { onDevCommand } from './utils/devCommands';
import { listOuraCards, subscribeToCards, verifyCards, isSupabaseConfigured, type OuraCard } from './services/ouraCard';
import { awardTrip, type TripAward } from './services/greLinesPoints';
import { loadAccount, creditAccount, recordTrip, type Account } from './services/account';
import { resolveRouteLine } from './utils/routeLineResolver';
import { rememberStop } from './utils/recentStops';
import { scheduleOfflinePrefetch } from './services/offlinePrefetch';
import { AccountSetupScreen } from './components/AccountSetupScreen';
import { ProfileScreen } from './components/ProfileScreen';
import { TripCompleteScreen } from './components/TripCompleteScreen';
import { useCardNotices } from './hooks/useCardNotices';
import { JourneyConfigScreen } from './components/JourneyConfigScreen';
import { AddJourneyDialog, type PendingJourney } from './components/AddJourneyDialog';
import { LinesExplorerSheet } from './components/LinesExplorerSheet';
import { ClockSignal } from './components/ClockSignal';
import { PopupOverlay } from './components/PopupOverlay';
import { DeferredPanel } from './components/DeferredPanel';
import { DevOverlay } from './components/DevOverlay';
import {
  fetchSharedMobility,
  EMPTY_SHARED_MOBILITY,
  SHARED_MOBILITY_TTL_MS,
  SHARED_OPERATOR_COLORS,
  type SharedMobilityData,
  type SharedOperator,
  type SharedVehiclePoint,
} from './services/sharedMobility';
import { toTimetableRouteId } from './services/timetable';
import { usePerfSettings } from './hooks/usePerfSettings';
import {
  canShowInstallGuide,
  hasSeenInstallGuide,
  markInstallGuideSeen,
  shouldAutoOpenInstallGuide,
} from './utils/pwa';
import { markMobileNotificationPromptDismissed } from './utils/mobileNotificationPrompt';
import { shouldRunOnboarding, markOnboardingDone } from './utils/onboarding';
import { OnboardingFlow } from './components/OnboardingFlow';
import { requestNotificationPermission, setNotificationsEnabled } from './services/tripNotifications';

import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';

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
  type CmsPopupLine,
  type FooterConfig,
  type TripSurveyLeg,
} from './services/cms';
import { isCarpoolStop, isCarpoolLine } from './components/CarpoolStopPanel';
import { getMcoLines, type McoLine } from './services/mcoLines';
import { compareTrafficLines, matchesTrafficFilter, trafficCategory, trafficFilters, trafficSubFilters } from './utils/trafficFilters';
import { TrafficFilterBar } from './components/TrafficFilterBar';
import { getCachedStopLines, getStopDetail, getStopLines, getStopsByPrefixes, getTrafficLines, getDepartures, refreshStopLines, setActiveNetworks, type RouteLocation, type RouteItinerary } from './services/api';
import { getTclLines, getTclLinesForStop, getTclStopDetail, getTclStops, isTclId, TCL_NETWORK } from './services/tclNetwork';
import { getGtfsLines, getGtfsLinesForStop, getGtfsStopDetail, getGtfsStops, gtfsStopMembers, GTFS_NETWORKS, isGtfsNetworkId } from './services/gtfsNetwork';
import { foreignAsCatalogLine, foreignSolidStyle, isForeignLineId } from './utils/foreignNetworks';
import { searchAddresses, reverseGeocode, setSearchFocus, distanceFromFocusKm, type AddressResult } from './services/geocoding';
import { getLinesGeometryPrecise, getStopsServedByLines, type LineGeometry, type ServedStopPoint } from './services/lineShapes';
import type { Line, SearchHistoryItem, Stop, StopDetail, TrafficDetail } from './types';
import type { MapRef } from './components/Map';
import { usePanelManager } from './hooks/usePanelManager';
import { useSpotlightShortcut } from './hooks/useSpotlightShortcut';
import { buildStopSearchIndex, inServedZones, matchStops } from './utils/stopCatalog';
import { useStopUrlSync } from './hooks/useStopUrlSync';
import { screenFromPath, useScreenUrl } from './hooks/useScreenUrl';
import { MapLayersButton } from './components/MapLayersButton';
import { readCampaign, recordCampaignVisit } from './services/campaign';
import { resolveStopFromUrlId } from './services/stopAliases';
import { useDebouncedValue } from './hooks/useDebouncedValue';
import { buildJourneyGeometry, type JourneyStopRef } from './utils/journeyGeometry';
import { AtmoPanel, atmoColor, atmoPicto } from './components/AtmoPanel';
import { getCommuneAtCoords, getAtmoReportByPostalCode, getAtmoReportForCommune, DEFAULT_ATMO_POSTAL_CODE, type AtmoReport, type Commune } from './services/atmo';
import { haversineMeters, findClosestStops, formatCoordinates, currentPositionLocation, CURRENT_POSITION_ID } from './utils/geo';
import { clearNavigationSession, loadNavigationSession, saveNavigationSession } from './services/navigationSession';
import { setSavedPlace, type SavedPlaceKind } from './services/savedPlaces';

export type MapPickTarget = 'from' | 'to' | SavedPlaceKind;

const SHARED_CITY_RADIUS_METERS = 12_000;

const MAP_PADDING_MAX_RATIO = 0.62;
const MAP_PIN_MAGNET_PX = 28;
const STOP_TAP_GUARD_MS = 700;
const MAP_PIN_COLOR = '#c026d3';
const MAP_PIN_MIN_MOVE_METERS = 30;

function App() {
  const isOffline = useIsOffline();
  const reconnects = useReconnectCount();
  const [stops, setStops] = useState<Stop[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isSearchHovered, setIsSearchHovered] = useState(false);
  const [selectedStop, setSelectedStop] = useState<StopDetail | null>(null);
  const [carpoolMapLines, setCarpoolMapLines] = useState<McoLine[]>([]);
  const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set());
  const autoSelectedLineRef = useRef<string | null>(null);
  const [selectedLine, setSelectedLine] = useState<AllLinesLine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [initialSelectedLines, setInitialSelectedLines] = useState<Set<string>>(new Set());
  const [initialSelectedLineId, setInitialSelectedLineId] = useState<string | null>(null);

  const [urlHydrated, setUrlHydrated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [trafficInfo, setTrafficInfo] = useState<Map<string, TrafficDetail[]>>(new Map());
  const [foreignCatalog, setForeignCatalog] = useState<AllLinesLine[]>([]);
  const [isRouteSidebarOpen, setIsRouteSidebarOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isFavoritesOpen, setIsFavoritesOpen] = useState(false);
  const [isJourneyConfigOpen, setIsJourneyConfigOpen] = useState(false);
  const [isJourneyPickerOpen, setIsJourneyPickerOpen] = useState(false);
  const [pickerFrom, setPickerFrom] = useState<RouteLocation | null>(null);
  const [pickerTo, setPickerTo] = useState<RouteLocation | null>(null);
  const [pickerResults, setPickerResults] = useState<RouteItinerary[]>([]);
  const [pendingJourney, setPendingJourney] = useState<PendingJourney | null>(null);
  const [isCardFocused, setIsCardFocused] = useState(false);
  const [isNavCompact, setIsNavCompact] = useState(false);

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

  const [walletCards, setWalletCards] = useState<OuraCard[]>([]);
  const [isAtmoBtnHovered, setIsAtmoBtnHovered] = useState(false);
  const [isAtmoPanelHovered, setIsAtmoPanelHovered] = useState(false);
  const [atmoPostalCode] = useState<string>(
    () => localStorage.getItem('greLines_atmoPostalCode') || DEFAULT_ATMO_POSTAL_CODE
  );
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
  const [atmoFollowMap, setAtmoFollowMap] = useState(
    () => localStorage.getItem('greLines_atmoFollowMap') !== 'false',
  );
  useEffect(() => {
    localStorage.setItem('greLines_atmoFollowMap', String(atmoFollowMap));
  }, [atmoFollowMap]);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lon: number } | null>(null);
  const [exploringMap, setExploringMap] = useState(false);
  const exploringMapRef = useRef(false);
  exploringMapRef.current = exploringMap;
  const [mapPin, setMapPin] = useState<{ lat: number; lon: number } | null>(null);
  const [mapPanSignal, setMapPanSignal] = useState(0);
  const [stopSheetCloseSignal, setStopSheetCloseSignal] = useState(0);
  const stopOpenedAtRef = useRef(0);
  const placeMapPin = useCallback((lat: number, lon: number) => {
    setMapPin(current =>
      current && haversineMeters(current.lat, current.lon, lat, lon) < MAP_PIN_MIN_MOVE_METERS ? current : { lat, lon },
    );
  }, []);
  const handleMapCenterChange = useCallback((lat: number, lon: number) => {
    if (exploringMapRef.current) placeMapPin(lat, lon);
    setMapArea(lat, lon);
    setSearchFocus(lat, lon);
    setMapCenter(current => {
      if (current && Math.abs(current.lat - lat) < 0.01 && Math.abs(current.lon - lon) < 0.01) {
        return current;
      }
      return { lat, lon };
    });
  }, [placeMapPin]);

  const [desktopTrafficFilter, setDesktopTrafficFilter] = useState<string>('all');
  const [desktopTrafficSubFilter, setDesktopTrafficSubFilter] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const currentScreen = isCardFocused
    ? 'card'
    : isAccountOpen
    ? 'account'
    : isFavoritesOpen
    ? 'favorites'
    : isRouteSidebarOpen
    ? 'route'
    : 'home';
  useScreenUrl(currentScreen, isMobile);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    if (!screenFromPath(window.location.pathname)) return;
    window.history.replaceState(
      window.history.state,
      '',
      `/app${window.location.search}${window.location.hash}`,
    );
  }, []);
  const [canOfferInstallGuide] = useState(canShowInstallGuide);
  const [autoOpenInstallGuide] = useState(shouldAutoOpenInstallGuide);
  const [isInstallSheetOpen, setIsInstallSheetOpen] = useState(false);
  const lab = useSyncExternalStore(subscribeLab, getLabState);
  const [isMobileNotificationPromptOpen, setIsMobileNotificationPromptOpen] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const { settings: perfSettings, setSetting: setPerfSetting } = usePerfSettings();
  const [currentLocation, setCurrentLocationState] = useState<{lat: number, lon: number} | null>(null);
  const setCurrentLocation = useCallback((value: { lat: number; lon: number } | null) => {
    if (getFakeLocation()) return;
    setCurrentLocationState(value);
  }, []);
  useEffect(() => subscribeFakeLocation(() => {
    const fake = getFakeLocation();
    setCurrentLocationState(fake);
  }), []);
  useEffect(() => {
    if (currentLocation) setUserArea(currentLocation.lat, currentLocation.lon);
  }, [currentLocation]);
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
            category: typeof item.category === 'string' ? item.category : undefined,
          };
        }
        return null;
      }).filter((item): item is SearchHistoryItem => item !== null);
    } catch { return []; }
  });
  const [isTrafficPanelOpenMobile, setIsTrafficPanelOpenMobile] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [testToast, setTestToast] = useState<ToastMessage | null>(null);

  const [isNearbySheetOpen, setIsNearbySheetOpen] = useState(false);

  const sheetProgress = useMotionValue(0.15);
  const homeSheetProgress = useMotionValue(0.15);

  const [snapHomeToMiniSignal, setSnapHomeToMiniSignal] = useState(0);

  const [isLinesExplorerOpen, setIsLinesExplorerOpen] = useState(false);

  const geolocButtonBottom = useTransform(sheetProgress, p => {
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    return `${Math.round(p * vh + 12)}px`;
  });
  const layersLift = useMotionValue(56);
  const layersButtonBottom = useTransform([sheetProgress, layersLift], ([p, lift]: number[]) => {
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    return `${Math.round(p * vh + 12 + lift)}px`;
  });
  const mapControlsOpacity = useTransform(sheetProgress, [0, 0.22, 0.55], [1, 1, 0]);
  const geolocButtonScale = useTransform(sheetProgress, [0, 0.22, 0.55], [1, 1, 0.85]);
  const layersButtonPointer = useTransform<number, string>(sheetProgress, p => (p > 0.45 ? 'none' : 'auto'));
  const recenterShown = useMotionValue(1);
  const geolocButtonOpacity = useTransform([mapControlsOpacity, recenterShown], ([base, shown]: number[]) => base * shown);
  const geolocButtonPointer = useTransform([sheetProgress, recenterShown], ([p, shown]: number[]) => (p > 0.45 || shown < 0.5 ? 'none' : 'auto'));
  const mapVisibleBottom = useTransform(homeSheetProgress, p => {
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    return Math.min(p * vh, vh * MAP_PADDING_MAX_RATIO);
  });
  const mapPinTop = useTransform(mapVisibleBottom, bottom => {
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    return `${Math.round((vh - bottom) / 2)}px`;
  });
  useEffect(() => {
    if (!isMobile) {
      mapRef.current?.setBottomPadding(0);
      return;
    }
    let frame = 0;
    const apply = () => {
      frame = 0;
      mapRef.current?.setBottomPadding(Math.round(mapVisibleBottom.get()));
    };
    apply();
    const unsubscribe = mapVisibleBottom.on('change', () => {
      if (!frame) frame = requestAnimationFrame(apply);
    });
    return () => {
      unsubscribe();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [isMobile, mapVisibleBottom]);
  const showRecenter = exploringMap || !currentLocation;
  useEffect(() => {
    const fade = animate(recenterShown, showRecenter ? 1 : 0, { duration: 0.25 });
    const lift = animate(layersLift, showRecenter ? 56 : 0, { type: 'spring', stiffness: 380, damping: 32 });
    return () => { fade.stop(); lift.stop(); };
  }, [showRecenter, recenterShown, layersLift]);
  const [sidebarState, setSidebarState] = useState<'closed' | 'peek' | 'open'>('closed');
  const [activeSettingsTab, setActiveSettingsTab] = useState('general');
  const [isSpotlightOpen, setIsSpotlightOpen] = useState(false);
  const [sharedMobility, setSharedMobility] = useState<SharedMobilityData>(EMPTY_SHARED_MOBILITY);
  const [hiddenSharedLayers, setHiddenSharedLayers] = useState<Set<SharedOperator>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('greLines_hiddenSharedLayers') ?? '[]');
      return new Set(Array.isArray(saved) ? (saved as SharedOperator[]) : []);
    } catch {
      return new Set();
    }
  });
  const [isMapLayersOpen, setIsMapLayersOpen] = useState(false);

  const sharedOperatorsNearby = useMemo(() => {
    if (!mapCenter) return [] as SharedOperator[];
    return (Object.keys(sharedMobility) as SharedOperator[]).filter(operator =>
      sharedMobility[operator].some(point =>
        haversineMeters(mapCenter.lat, mapCenter.lon, point.lat, point.lon) <= SHARED_CITY_RADIUS_METERS,
      ),
    );
  }, [mapCenter, sharedMobility]);

  const visibleSharedMobility = useMemo<SharedMobilityData>(() => ({
    citiz: hiddenSharedLayers.has('citiz') ? [] : sharedMobility.citiz,
    voi: hiddenSharedLayers.has('voi') ? [] : sharedMobility.voi,
    velostan: hiddenSharedLayers.has('velostan') ? [] : sharedMobility.velostan,
  }), [sharedMobility, hiddenSharedLayers]);

  const toggleSharedLayer = useCallback((operator: SharedOperator) => {
    setHiddenSharedLayers(current => {
      const next = new Set(current);
      if (next.has(operator)) next.delete(operator);
      else next.add(operator);
      try {
        localStorage.setItem('greLines_hiddenSharedLayers', JSON.stringify([...next]));
      } catch {
      }
      setSharedSelection(selection =>
        selection && next.has(selection.operator) ? null : selection,
      );
      return next;
    });
  }, []);
  const [sharedSelection, setSharedSelection] = useState<
    { operator: SharedOperator; points: SharedVehiclePoint[] } | null
  >(null);
  const [highlightedVehicleId, setHighlightedVehicleId] = useState<string | null>(null);
  const [timetableTarget, setTimetableTarget] = useState<
    {
      line: { id: string; shortName?: string; color?: string; textColor?: string };
      headsign?: string;
      stopName?: string;
      stopId?: string;
    } | null
  >(null);
  const [lineMapTarget, setLineMapTarget] = useState<
    { routeId: string; label: string; color?: string; lineId?: string } | null
  >(null);
  const [settingsState, setSettingsState] = useState<'closed' | 'peek' | 'open'>('closed');
  const isSettingsOpen = settingsState !== 'closed';

  const [appliedNetworks, setAppliedNetworks] = useState(perfSettings.networks);
  const hasLoadedCatalogueRef = useRef(false);
  const pendingNetworksKey = perfSettings.networks.join(',');
  if (!isSettingsOpen && pendingNetworksKey !== appliedNetworks.join(',')) {
    setAppliedNetworks(perfSettings.networks);
  }
  const settingsContentRef = useRef<HTMLDivElement>(null);
  const settingsPanelRef = useRef<HTMLDivElement>(null);
  const desktopSearchInputRef = useRef<HTMLInputElement>(null);
  const [appData, setAppData] = useState<{version: string; credits: Array<{role: string; name: string; link?: string}>} | null>(null);
  const [activePopups, setActivePopups] = useState<CmsPopup[]>([]);
  const [locatedArea, setLocatedArea] = useState(getLocatedCity);
  useEffect(() => subscribeCurrentCity(() => setLocatedArea(getLocatedCity())), []);
  useEffect(() => {
    let alive = true;
    void locateByIp().then(area => {
      if (alive && area) setIpArea(area.lat, area.lon);
    });
    return () => { alive = false; };
  }, []);
  const locatedPopups = useMemo(() => activePopups.filter(popup => {
    if (IS_NANCY) {
      if (!popup.target_network) {
        return (popup.target_lines ?? []).every(line => line.id.toUpperCase().startsWith('STAN:'));
      }
      if (popup.target_network !== 'STAN') return false;
      if (!locatedArea.city) return true;
      return cityOfNetwork(popup.target_network)?.id === locatedArea.city.id;
    }
    if (!popup.target_network) return true;
    if (!locatedArea.city) return false;
    return cityOfNetwork(popup.target_network)?.id === locatedArea.city.id;
  }), [activePopups, locatedArea]);
  const [footerConfig, setFooterConfig] = useState<FooterConfig>({ message: null, color: '#fbbf24', showClock: true });
  const [cmsRevision, setCmsRevision] = useState(0);
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const [tripAward, setTripAward] = useState<TripAward | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [isAccountSetupOpen, setIsAccountSetupOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  useEffect(() => {
    if (IS_NANCY) return;
    void loadAccount().then(setAccount);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    if (IS_NANCY) return;
    void listOuraCards().then(setWalletCards);
  }, []);
  const [surveyContext, setSurveyContext] = useState<
    { lineId: string; boardingStop: string | null; boardingTime: string } | null
  >(null);

  useEffect(() => {
    if (!isMobile || !GUIDANCE_ENABLED) return;
    const resumed = loadNavigationSession();
    if (!resumed) return;
    setSelectedRouteItinerary(resumed);
    setIsNavigationOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [language, setLanguage] = useState<'fr' | 'en'>(() => {
    const saved = localStorage.getItem('greLines_language');
    if (saved === 'en' || saved === 'fr') return saved;

    const preferred =
      typeof navigator === 'undefined'
        ? []
        : navigator.languages?.length
          ? navigator.languages
          : [navigator.language];

    for (const tag of preferred) {
      const base = tag?.toLowerCase().split('-')[0];
      if (base === 'fr') return 'fr';
      if (base === 'en') return 'en';
    }
    return 'fr';
  });

  useEffect(() => onDevCommand('notify.test', args => {
    if (args[0] === 'location') {
      setLocationError(tx(language === 'fr').app.testLocationUnavailable);
      return;
    }
    setTestToast({
      id: `test-${Date.now()}`,
      text: tx(language === 'fr').app.testNotification,
      detail: tx(language === 'fr').app.onTheTestCard,
    });
  }), [language]);

  useEffect(() => {
    const offs = [
      onDevCommand('show.onboarding', () => setIsOnboardingOpen(true)),
      onDevCommand('show.notifications', () => setIsMobileNotificationPromptOpen(true)),
      onDevCommand('show.install', () => setIsInstallSheetOpen(true)),
      onDevCommand('show.teststop', () => openLab()),
      onDevCommand('show.popup', args => {
        const kind = args[0] === 'promo' ? 'promo' : 'infotraffic';
        const isFr = language === 'fr';
        const popup: CmsPopup = {
          id: `dev-test-${kind}-${Date.now()}`,
          type: kind,
          title: kind === 'promo'
            ? (tx(isFr).app.testPopup)
            : (tx(isFr).app.testTrafficInfo),
          message: kind === 'promo'
            ? (tx(isFr).app.aTestAnnouncementShown)
            : (tx(isFr).app.testDisruptionOnThe),
          image_url: null,
          link_url: null,
          target_scope: 'global',
          target_id: null,
          target_network: null,
          target_lines: kind === 'promo' ? [] : [
            { id: 'SEM:A', short: 'A', name: 'Fontaine La Poya ↔ Échirolles Denis Papin', color: '#3376B8', textColor: '#FFFFFF', category: 'tram' },
            { id: 'SEM:B', short: 'B', name: 'Gares ↔ Oxford', color: '#479A45', textColor: '#FFFFFF', category: 'tram' },
            { id: 'SEM:C', short: 'C', name: 'Seyssins Le Prisme ↔ Saint-Martin-d’Hères Condillac', color: '#C20078', textColor: '#FFFFFF', category: 'tram' },
            { id: 'SEM:D', short: 'D', name: 'Étienne Grappe ↔ Les Taillées', color: '#DE9917', textColor: '#FFFFFF', category: 'tram' },
            { id: 'SEM:E', short: 'E', name: 'Fontanil ↔ Louise Michel', color: '#533786', textColor: '#FFFFFF', category: 'tram' },
            { id: 'SEM:C1', short: 'C1', name: 'Cité Jean Macé ↔ Meylan Maupertuis', color: '#FFDD00', textColor: '#000000', category: 'chrono' },
          ],
          priority: 1000,
        };
        setActivePopups(previous => [popup, ...previous]);
      }),
      onDevCommand('popup.reset', () => {
        void getActivePopups().then(setActivePopups);
      }),
      onDevCommand('bypass.onboarding', () => {
        markOnboardingDone();
        setIsOnboardingOpen(false);
      }),
      onDevCommand('bypass.notifications', () => {
        markMobileNotificationPromptDismissed();
        setIsMobileNotificationPromptOpen(false);
      }),
      onDevCommand('bypass.install', () => setIsInstallSheetOpen(false)),
      onDevCommand('bypass.popup', () => setActivePopups([])),
    ];
    return () => { for (const off of offs) off(); };
  }, [language]);

  const [theme, setTheme] = useState<'light' | 'dark' | 'blue' | 'auto'>(() => {
    const stored = localStorage.getItem('greLines_theme');
    return stored === 'light' || stored === 'dark' || stored === 'blue' ? stored : 'auto';
  });
  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>(() => {
    if (theme === 'light') return 'light';
    if (theme === 'dark' || theme === 'blue') return 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
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

  const [addressResults, setAddressResults] = useState<AddressResult[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<AddressResult | null>(null);
  const [lineGeometries, setLineGeometries] = useState<LineGeometry[]>([]);
  const [servedStopPoints, setServedStopPoints] = useState<ServedStopPoint[] | null>(null);
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 250);

  const MAX_STOP_MATCHES = 50;
  const stopSearchIndex = useMemo(() => buildStopSearchIndex(stops), [stops]);
  const matchedStops = useMemo(
    () => matchStops(stopSearchIndex, searchQuery, distanceFromFocusKm, MAX_STOP_MATCHES),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchQuery, stopSearchIndex, mapCenter],
  );

  const isSidebarOpen = sidebarState !== 'closed';

  if (timetableTarget && !isSidebarOpen && selectedLine === null) {
    setTimetableTarget(null);
  }

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    const { pathname, search, hash } = window.location;
    const isReservedRoute = pathname.startsWith('/app');
    if (pathname !== '/app' && !search && !isReservedRoute) {
      window.history.replaceState(window.history.state, '', `/app${hash || ''}`);
    }
  }, []);

  useEffect(() => {
    if (!isCarpoolStop(selectedStop?.id)) { setCarpoolMapLines([]); return; }
    let active = true;
    const served = new Set((selectedStop?.lines ?? []).filter(isCarpoolLine).map(l => l.id.toUpperCase()));
    getMcoLines().then(lines => {
      if (!active) return;
      const kept = served.size > 0 ? lines.filter(l => served.has(l.code.toUpperCase())) : lines;
      setCarpoolMapLines(kept.length > 0 ? kept : lines);
    });
    return () => { active = false; };
  }, [selectedStop?.id, selectedStop?.lines]);

  useEffect(() => {
    if (!selectedStop) {
      setSelectedLines(new Set());
      return;
    }
    if (initialSelectedLines.size > 0) {
      const [only] = initialSelectedLines;
      autoSelectedLineRef.current = initialSelectedLines.size === 1 && (selectedStop.lines?.length ?? 0) <= 1
        ? `${selectedStop.id}::${only}`
        : null;
      setSelectedLines(new Set(initialSelectedLines));
      setInitialSelectedLines(new Set());
      return;
    }
    const stopLines = selectedStop.lines ?? [];
    if (stopLines.length === 1) {
      autoSelectedLineRef.current = `${selectedStop.id}::${stopLines[0].id}`;
      setSelectedLines(new Set([stopLines[0].id]));
      return;
    }
    const auto = autoSelectedLineRef.current;
    if (stopLines.length > 1 && auto) {
      autoSelectedLineRef.current = null;
      setSelectedLines(prev => (prev.size === 1 && `${selectedStop.id}::${[...prev][0]}` === auto ? new Set() : prev));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStop?.id, selectedStop?.lines?.length]);

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
    Promise.all([
      IS_NANCY
        ? getGtfsLines('STAN').then(list => list.map(line => foreignAsCatalogLine(line))).catch(() => [] as AllLinesLine[])
        : getAllSemLines(),
      getLineOverrides(),
    ]).then(([lines, overrides]) => {
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
            const tclColor = line && isForeignLineId(line.id) ? foreignSolidStyle(line)?.backgroundColor : undefined;
            const baseColor = tclColor ?? resolveLineBackgroundColor(resolved?.color || selectedLine?.color || null, matchKey);
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
        const tclColor = line && isForeignLineId(line.id) ? foreignSolidStyle(line)?.backgroundColor : undefined;
        const baseColor = tclColor ?? resolveLineBackgroundColor(resolved?.color || line?.color, matchKey);
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

    const applyMode = (isDark: boolean, isBlue: boolean) => {
      root.classList.toggle('dark', isDark);
      body.classList.toggle('dark', isDark);
      root.classList.toggle('theme-blue', isDark && isBlue);
      body.classList.toggle('theme-blue', isDark && isBlue);
      root.style.colorScheme = isDark ? 'dark' : 'light';
      body.style.colorScheme = isDark ? 'dark' : 'light';
    };

    const darkIsBlue = theme === 'blue';

    if (theme !== 'auto') {
      applyMode(theme !== 'light', darkIsBlue);
      setEffectiveTheme(theme === 'light' ? 'light' : 'dark');
      return;
    }

    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => {
      applyMode(query.matches, darkIsBlue);
      setEffectiveTheme(query.matches ? 'dark' : 'light');
    };
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, [theme, isMobile]);

  const handleSidebarClose = useCallback(() => {
    setSidebarState('closed');
    setSelectedStop(null);
    setSelectedLines(new Set());
    setSnapHomeToMiniSignal(s => s + 1);
    mapRef.current?.clearStopLabel();
  }, []);

  const handleSidebarOpen = useCallback(() => setSidebarState('open'), []);
  const handleLineSidebarClose = useCallback(() => {
    setSelectedLine(null);
    setLineGeometries([]);
    setServedStopPoints(null);
  }, []);

  const isTrafficPanelOpen = isTrafficButtonHovered || isTrafficPanelHovered || isTrafficPanelPinned;
  const [trafficPanelContentMounted, setTrafficPanelContentMounted] = useState(false);
  useEffect(() => {
    if (isTrafficPanelOpen) {
      setTrafficPanelContentMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setTrafficPanelContentMounted(false), 320);
    return () => window.clearTimeout(timer);
  }, [isTrafficPanelOpen]);
  const isFavPanelOpen = isFavBtnHovered || isFavPanelHovered;
  const isAtmoPanelOpen = isAtmoBtnHovered || isAtmoPanelHovered;

  useEffect(() => {
    if (IS_NANCY) return;
    if (atmoCommune) localStorage.setItem('greLines_atmoCommune', JSON.stringify(atmoCommune));
    else localStorage.setItem('greLines_atmoPostalCode', atmoPostalCode);

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
  }, [atmoPostalCode, atmoCommune, reconnects]);

  const mapCenterKey = mapCenter ? `${mapCenter.lat.toFixed(2)},${mapCenter.lon.toFixed(2)}` : null;
  useEffect(() => {
    if (!atmoFollowMap || !mapCenter) return;
    let active = true;
    void getCommuneAtCoords(mapCenter.lat, mapCenter.lon).then(commune => {
      if (!active || !commune) return;
      setAtmoCommune(current => (current?.code === commune.code ? current : commune));
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atmoFollowMap, mapCenterKey]);
  const favoritesList = useFavorites();
  const favoritesDetails = useFavoriteDetails(favoritesList, true);
  const favoriteLinesList = useFavoriteLines();
  const favoriteJourneys = useFavoriteJourneys();
  const journeyHistory = useJourneyHistory();

  const [walletLoaded, setWalletLoaded] = useState(false);
  useEffect(() => {
    if (IS_NANCY || isMobile || walletLoaded || !isSupabaseConfigured) return;
    let active = true;
    void listOuraCards().then(async list => {
      if (!active) return;
      setWalletCards(list);
      setWalletLoaded(true);
      const checked = await verifyCards(list);
      if (active) setWalletCards(checked);
    });
    return () => { active = false; };
  }, [isMobile, walletLoaded]);

  useEffect(() => {
    if (isMobile || !walletLoaded) return;
    return subscribeToCards(() => {
      void listOuraCards().then(setWalletCards);
    });
  }, [isMobile, walletLoaded]);
  const { notice: cardNotice, dismiss: dismissCardNotice } = useCardNotices(isMobile && !IS_NANCY);
  const disruptedLineCodes = useMemo(() => new Set(trafficInfo.keys()), [trafficInfo]);
  const firstFavoriteLoading = favoritesList.length > 0 && (favoritesDetails[0]?.loading ?? true);

  const trafficFiltersRef = useWheelScroll<HTMLDivElement>();

  const mapRef = useRef<MapRef>(null);
  const [mapPickTarget, setMapPickTarget] = useState<MapPickTarget | null>(null);

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

    const stop = kind === 'stop' ? resolveStopFromUrlId(id, stops) ?? null : null;

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

  const closePanels = usePanelManager({
    stop: () => { setSelectedStop(null); setSidebarState('closed'); },
    line: () => { setSelectedLine(null); setLineGeometries([]); },
    address: () => setSelectedAddress(null),
    route: resetRoutePlanner,
    timetable: () => setTimetableTarget(null),
    shared: () => { setSharedSelection(null); setHighlightedVehicleId(null); },
    traffic: () => setIsTrafficPanelPinned(false),
    linesExplorer: () => setIsLinesExplorerOpen(false),
    settings: () => setSettingsState('closed'),
  });

  const describeMapPoint = useCallback(async (lat: number, lon: number): Promise<AddressResult> => {
    const found = await reverseGeocode(lat, lon);
    if (found) return { ...found, lat, lon };

    const [closest] = findClosestStops(stops, lat, lon, 1);
    const id = `map-${lat.toFixed(5)}-${lon.toFixed(5)}`;
    if (closest && closest.meters <= 400) {
      const label = `${tx(!(language === 'en')).app.near} ${closest.stop.name}`;
      return { id, label, name: label, context: closest.stop.city || '', lat, lon, score: 0 };
    }

    const label = tx(language === 'fr').app.pointOnTheMap;
    return { id, label, name: label, context: formatCoordinates(lat, lon), lat, lon, score: 0 };
  }, [stops, language]);

  const recentRoutePlaces = useMemo((): RouteLocation[] => (
    searchHistoryItems.flatMap((item): RouteLocation[] => {
      if (item.kind === 'address') {
        return [{ id: item.id, label: item.name, lat: item.lat, lon: item.lon, kind: 'address', raw: item }];
      }
      if (item.kind === 'stop') {
        const stop = stops.find(entry => entry.id === item.id);
        if (!stop) return [];
        return [{ id: stop.id, label: stop.name, lat: stop.lat, lon: stop.lon, kind: 'stop', raw: stop }];
      }
      return [];
    })
  ), [searchHistoryItems, stops]);

  const handleMapLongPress = useCallback(async (lat: number, lon: number) => {
    if (mapPickTarget) return;

    const address = await describeMapPoint(lat, lon);

    setSelectedStop(null);
    setSidebarState('closed');
    setSharedSelection(null);
    setSelectedAddress(address);
  }, [mapPickTarget, describeMapPoint]);

  const openRouteToAddress = useCallback((address: AddressResult) => {
    setRouteTo({
      id: address.id,
      label: address.name || address.label,
      lat: address.lat,
      lon: address.lon,
      kind: 'address',
      raw: address,
    });
    setRouteFrom(currentLocation ? currentPositionLocation(currentLocation) : null);
    setSelectedRouteItinerary(null);
    setRouteItineraryOptions([]);
    setMapPickTarget(null);
    setSharedRouteExpired(false);
    setSharedRouteTarget(null);
    setSelectedAddress(null);
    setSelectedStop(null);
    setSidebarState('closed');
    setIsRouteSidebarOpen(true);
  }, [currentLocation]);

  const openRouteFromStop = useCallback((stop: StopDetail) => {
    const location: RouteLocation = {
      id: stop.id,
      label: stop.name,
      lat: stop.lat,
      lon: stop.lon,
      kind: 'stop',
      raw: stop,
    };
    setRouteTo(location);
    setRouteFrom(currentLocation ? currentPositionLocation(currentLocation) : null);
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
      const targetStop = resolveStopFromUrlId(targetStopId, stops);
      if (targetStop) {
        try {
          const stopDetail = isTclId(targetStop.id)
            ? await getTclStopDetail(targetStop.id)
            : isGtfsNetworkId(targetStop.id)
              ? await getGtfsStopDetail(targetStop.id)
              : await getStopDetail(targetStop.id);
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
    if (typeof window === 'undefined' || stops.length === 0) return;
    const visit = readCampaign(window.location.search);
    if (!visit) return;
    void recordCampaignVisit(visit);
    if (visit.stopId) {
      const stop = resolveStopFromUrlId(visit.stopId, stops);
      if (stop) handleStopClick(stop);
    }
    const url = new URL(window.location.href);
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('utm_')) url.searchParams.delete(key);
    }
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops.length]);

  useEffect(() => {
    if (stops.length === 0) return;
    let active = true;
    applyConfigFromParams(new URLSearchParams(window.location.search))
      .finally(() => {
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

  useEffect(() => { scheduleOfflinePrefetch(); }, []);

  useEffect(() => {
    fetch('/grelines.json')
      .then(r => r.json())
      .then(data => setAppData(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const loadCmsContent = () => {
      getActivePopups().then(setActivePopups);
      getFooterConfig().then(config => setFooterConfig(IS_NANCY ? { ...config, message: null } : config));
    };

    loadCmsContent();
    return subscribeToCmsChanges(() => {
      loadCmsContent();
      setCmsRevision(revision => revision + 1);
    });
  }, []);

  useEffect(() => {
    let active = true;
    setActiveNetworks(appliedNetworks);

    const fetchStops = async () => {
      try {
        if (!hasLoadedCatalogueRef.current) setIsLoading(true);
        const wantsTcl = appliedNetworks.includes(TCL_NETWORK);
        const gtfsCodes = GTFS_NETWORKS.map(network => network.code).filter(code => appliedNetworks.includes(code));
        if (wantsTcl) void getTclLines({ includeSchool: true });

        const wantsSncf = !IS_NANCY && appliedNetworks.includes('SNC');
        const [data, overrides, tclStops, gtfsStopLists, sncfStops] = await Promise.all([
          IS_NANCY ? Promise.resolve([] as Stop[]) : getStopsByPrefixes(appliedNetworks),
          getStopOverrides(),
          wantsTcl ? getTclStops() : Promise.resolve([] as Stop[]),
          Promise.all(gtfsCodes.map(code => getGtfsStops(code).catch(() => [] as Stop[]))),
          wantsSncf ? getSncfStops().catch(() => [] as Stop[]) : Promise.resolve([] as Stop[]),
        ]);
        if (!active) return;

        const applyOverrides = (list: Stop[], withMembers = false): Stop[] => overrides.size === 0
          ? list
          : list
              .map(stop => {
                const override = overrides.get(stop.id)
                  ?? (withMembers ? gtfsStopMembers(stop.id).map(member => overrides.get(member)).find(Boolean) : undefined);
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

        const merged = applyOverrides(data);
        const editedTclStops = applyOverrides(tclStops);
        const gtfsStops = applyOverrides(gtfsStopLists.flat(), true);
        const allStations = applyOverrides(sncfStops);
        const anchorStations = inServedZones(allStations, [...merged, ...editedTclStops, ...gtfsStops]);
        const linkedStations = await sncfStationsLinkedTo(anchorStations, allStations);
        const anchorIds = new Set(anchorStations.map(station => station.id));
        const shownStations = [...anchorStations, ...linkedStations.filter(station => !anchorIds.has(station.id))];
        const deduplicated = [...merged, ...shownStations];
        setStops(editedTclStops.length > 0 || gtfsStops.length > 0 ? [...deduplicated, ...editedTclStops, ...gtfsStops] : deduplicated);
        setError(null);
      } catch (err) {
        if (!active) return;
        setError('Failed to load stops');      } finally {
        if (active) {
          setIsLoading(false);
          hasLoadedCatalogueRef.current = true;
        }
      }
    };
    fetchStops();
    return () => { active = false; };
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

  useEffect(() => {
    if (!autoOpenInstallGuide) return;
    if (hasSeenInstallGuide()) return;
    const timer = window.setTimeout(() => {
      markInstallGuideSeen();
      setIsInstallSheetOpen(true);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [autoOpenInstallGuide]);

  useEffect(() => {
    if (!shouldRunOnboarding()) return;
    const timer = window.setTimeout(() => {
      markOnboardingDone();
      markMobileNotificationPromptDismissed();
      setIsOnboardingOpen(true);
    }, 900);
    return () => window.clearTimeout(timer);
  }, []);

  const dismissInstallGuide = useCallback(() => {
    markInstallGuideSeen();
    setIsInstallSheetOpen(false);
  }, []);

  const dismissMobileNotificationPrompt = useCallback(() => {
    markMobileNotificationPromptDismissed();
    setIsMobileNotificationPromptOpen(false);
  }, []);

  const enableMobileNotifications = useCallback(async () => {
    const granted = await requestNotificationPermission();
    setNotificationsEnabled(granted);
    markMobileNotificationPromptDismissed();
    setIsMobileNotificationPromptOpen(false);
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
    let active = true;
    const codes = GTFS_NETWORKS.map(network => network.code).filter(code => appliedNetworks.includes(code));
    void Promise.all([
      appliedNetworks.includes(TCL_NETWORK) ? getTclLines().catch(() => []) : Promise.resolve([]),
      ...codes.map(code => getGtfsLines(code).catch(() => [])),
      appliedNetworks.includes('SNC') ? getSncfLines().catch(() => []) : Promise.resolve([]),
    ]).then(lists => {
      if (active) setForeignCatalog(IS_NANCY ? [] : lists.flat().map(line => foreignAsCatalogLine(line)));
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedNetworks.join(',')]);
  const spotlightLines = useMemo(() => [...allLines, ...foreignCatalog], [allLines, foreignCatalog]);

  useEffect(() => {
    const fetchTraffic = async () => {
      try {
        const [data, foreign] = await Promise.all([
          IS_NANCY ? Promise.resolve(new Map<string, TrafficDetail[]>()) : getTrafficLines(),
          getForeignTraffic(appliedNetworks).catch(() => new Map<string, TrafficDetail[]>()),
        ]);
        setTrafficInfo(foreign.size > 0 ? new Map([...data, ...foreign]) : data);
      } catch (err) {}
    };
    fetchTraffic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reconnects, appliedNetworks.join(',')]);

  const handleStopClick = useCallback(async (stop: Stop) => {
    stopOpenedAtRef.current = Date.now();
    try {
      pushSearchHistoryItem({
        kind: 'stop',
        id: stop.id,
        name: stop.name,
        city: stop.city,
      });
      rememberStop(stop);
      setSelectedLine(null);
      setLineGeometries([]);
      setSelectedAddress(null);
      const placeholder: StopDetail = { ...stop, lines: [], departures: [], lastUpdate: new Date() };
      setSelectedStop(placeholder);
      mapRef.current?.centerOnStop(stop);
      setSidebarState('peek');

      const showLinesFirst = (lines: Line[]) => {
        if (lines.length === 0) return;
        setSelectedStop(prev => (prev && prev.id === stop.id && prev.lines.length === 0 ? { ...prev, lines } : prev));
      };
      if (isTclId(stop.id)) {
        void getTclLinesForStop(stop.id).then(showLinesFirst);
        const detail = await getTclStopDetail(stop.id);
        if (detail) setSelectedStop(detail);
        return;
      }
      if (isGtfsNetworkId(stop.id)) {
        void getGtfsLinesForStop(stop.id).then(showLinesFirst);
        const detail = await getGtfsStopDetail(stop.id);
        if (detail) setSelectedStop(detail);
        return;
      }
      if (isSncfStopId(stop.id)) {
        const detail = await getSncfStopDetail(stop.id);
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

  const handleSearchResultSelect = useCallback((stop: Stop) => {
    desktopSearchInputRef.current?.blur();
    setSearchQuery('');
    setIsSearchFocused(false);
    setIsSearchHovered(false);
    setSelectedAddress(null);
    handleStopClick(stop);
    mapRef.current?.centerOnStop(stop);
  }, [handleStopClick]);

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
      category: address.category,
    });
    const nearby = findClosestStops(stops, address.lat, address.lon, 8).filter(entry => entry.meters <= 2000);
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

  const toggleSpotlight = useCallback(() => setIsSpotlightOpen(open => !open), []);
  useSpotlightShortcut(!isMobile, toggleSpotlight);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const load = async () => {
      const data = await fetchSharedMobility({ signal: controller.signal });
      if (active) setSharedMobility(data);
    };

    void load();
    const interval = window.setInterval(load, SHARED_MOBILITY_TTL_MS);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(interval);
    };
  }, [reconnects]);

  const renderTerminusPair = (longName: string) => <TerminusPair longName={longName} language={language} />;

  const renderStopLineBadges = (stopId: string) => {
    const lines = sortStopPreviewLines(searchStopLines[stopId] || []);
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
            className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-slate-700 bg-slate-800 px-1.5 text-[0.625rem] font-extrabold text-slate-300"
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
      const line = isForeignLineId(item.id)
        ? foreignAsCatalogLine(item)
        : allLines.find(candidate => candidate.id === item.id) || allLines.find(candidate => candidate.shortName === item.shortName);
      if (line) return <LineBadge line={line} size="sm" />;
      return (
        <div className="w-9 h-9 rounded-2xl bg-slate-700 border border-slate-600 flex items-center justify-center text-[0.6875rem] font-extrabold text-white flex-shrink-0">
          {item.shortName}
        </div>
      );
    }
    if (item.kind === 'address') return <PlaceIcon category={item.category} className="w-4 h-4 flex-shrink-0" fallback={<MapPinIcon className="w-4 h-4 text-amber-400 flex-shrink-0" />} />;
    return <TbBusStop className="w-4 h-4 text-sky-400 flex-shrink-0" />;
  };

  const getHistoryItemSubtitle = (item: SearchHistoryItem) => {
    if (item.kind === 'line') return renderTerminusPair(item.longName);
    if (item.kind === 'address') return item.context || text.unknownCity;
    const stop = stops.find(s => s.id === item.id) || stops.find(s => s.name === item.name);
    return stop?.city || item.city || text.unknownCity;
  };

  const handleHistoryItemSelect = (item: SearchHistoryItem) => {
    if (item.kind === 'line') {
      const line = isForeignLineId(item.id)
        ? foreignAsCatalogLine(item)
        : allLines.find(candidate => candidate.id === item.id) || allLines.find(candidate => candidate.shortName === item.shortName);
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

  const popupLineTraffic = useCallback((lineId: string): TrafficDetail[] => {
    const id = lineId.toUpperCase();
    return trafficInfo.get(lineId) ?? trafficInfo.get(id) ?? trafficInfo.get(id.replace(/^SEM[:_]/, '')) ?? [];
  }, [trafficInfo]);

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
    setTimetableTarget(null);
    pushSearchHistoryItem({
      kind: 'line',
      id: line.id,
      shortName: line.shortName,
      longName: line.longName,
    });
  }, [pushSearchHistoryItem]);

  const openPopupLine = useCallback((line: CmsPopupLine) => {
    const target = isForeignLineId(line.id)
      ? foreignAsCatalogLine({ id: line.id, shortName: line.short, longName: line.name, color: line.color, textColor: line.textColor })
      : allLines.find(candidate => candidate.id.toUpperCase() === line.id.toUpperCase())
        ?? allLines.find(candidate => candidate.shortName === line.short);
    if (target) handleLineSearchSelect(target);
  }, [allLines, handleLineSearchSelect]);

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
    const fake = getFakeLocation();
    if (fake) {
      mapRef.current?.centerOnLocation(fake.lat, fake.lon);
      return;
    }
    if (!navigator.geolocation) {
      setLocationError('Géolocalisation non disponible sur votre appareil');
      return;
    }

    setLocationError(null);

    if (locationWatchId !== null) {
      navigator.geolocation.clearWatch(locationWatchId);
      setLocationWatchId(null);
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setCurrentLocation({ lat: coords.latitude, lon: coords.longitude });
        mapRef.current?.centerOnLocation(coords.latitude, coords.longitude);
        setLocationError(null);

        const watchId = navigator.geolocation.watchPosition(
          ({ coords }) => {
            setCurrentLocation({ lat: coords.latitude, lon: coords.longitude });
          },
          () => {},
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
        );
        setLocationWatchId(watchId);
      },
      (err) => {
        const isFr = language === 'fr';
        let message = tx(isFr).app.locationError;
        if (err.code === 1) {
          message = tx(isFr).app.locationAccessDeniedCheck;
        } else if (err.code === 2) {
          message = tx(isFr).app.positionUnavailableTrySomewhere;
        } else if (err.code === 3) {
          message = tx(isFr).app.timedOutTryAgain;
        }
        setLocationError(message);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, [locationWatchId, language]);

  const launchLocatedRef = useRef(false);
  const networksRef = useRef(perfSettings.networks);
  networksRef.current = perfSettings.networks;
  useEffect(() => {
    if (!isMobile || launchLocatedRef.current || !navigator.geolocation) return;
    launchLocatedRef.current = true;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const city = cityNear(coords.latitude, coords.longitude);
        if (!city?.network) return;
        if (!networksRef.current.includes(city.network)) {
          setPerfSetting('networks', [...networksRef.current, city.network]);
        }
        setCurrentLocation({ lat: coords.latitude, lon: coords.longitude });
        let tries = 0;
        const center = () => {
          if (mapRef.current) mapRef.current.centerOnLocation(coords.latitude, coords.longitude);
          else if (tries++ < 20) window.setTimeout(center, 250);
        };
        center();
      },
      () => {},
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60 * 1000 },
    );
  }, [isMobile, setPerfSetting]);

  useEffect(() => {
    if (!selectedAddress) return;
    const city = cityNear(selectedAddress.lat, selectedAddress.lon);
    if (city?.network && !networksRef.current.includes(city.network)) {
      setPerfSetting('networks', [...networksRef.current, city.network]);
    }
  }, [selectedAddress, setPerfSetting]);

  useEffect(() => {
    if (!autoLocation || !navigator.geolocation || !isMobile) return;

    handleLocationClick();

  }, [autoLocation, isMobile, handleLocationClick]);

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

  const [hasOpenedNearbyOnce, setHasOpenedNearbyOnce] = useState(false);
  const geolocStartedRef = useRef(false);

  useEffect(() => {
    if (!isMobile) return;
    if (geolocStartedRef.current) return;
    if (stops.length === 0) return;
    if (selectedStop) return;
    geolocStartedRef.current = true;
    setHasOpenedNearbyOnce(true);
    setIsNearbySheetOpen(true);

    handleLocationClick();
  }, [isMobile, stops.length, selectedStop, handleLocationClick]);

  const [hasUserClosedHome, setHasUserClosedHome] = useState(false);
  useEffect(() => {
    if (!isMobile) return;
    if (hasUserClosedHome) return;
    if (!hasOpenedNearbyOnce) return;
    if (isNearbySheetOpen) return;
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
        atmoFollowMap: 'Qualité de l’air de la ville regardée',
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
        hint: 'Les changements s’appliquent à la fermeture des réglages, sans recharger l’application. Chaque réseau ajouté est téléchargé une fois, puis conservé hors ligne. Les lignes scolaires sont toujours écartées : elles ne circulent que deux fois par jour et représentent plus de la moitié du réseau.',
      },
      dev: {
        section: 'Développeur',
        devMode: 'Mode développeur',
        devModeHint: 'Affiche une section Développeur avec les options d’optimisation. Disponible sur ordinateur uniquement.',
        overlay: 'Overlay développeur',
        overlayHint: 'Compteur de FPS et indicateurs de performance en haut à droite.',
        cutConnection: 'Couper la connexion',
        cutConnectionHint: 'Fait comme si le réseau était perdu : l’app ne reçoit plus rien et passe aux horaires gardés sur l’appareil.',
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
        versionLabel: 'Version :', dataSourceLabel: 'Source :', designLabel: 'Design :',
        pleaseReload: 'Veuillez recharger la page.',
        calculateItinerary: 'Calculer un itinéraire',
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
        atmoFollowMap: 'Air quality follows the map',
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
        hint: 'Changes apply once you close settings, without reloading the app. Each network is downloaded once, then kept offline. School services are always excluded: they run twice a day and account for more than half the network.',
      },
      dev: {
        section: 'Developer',
        devMode: 'Developer mode',
        devModeHint: 'Adds a Developer section with optimisation options. Desktop only.',
        overlay: 'Developer overlay',
        overlayHint: 'FPS counter and performance indicators, top right.',
        cutConnection: 'Cut the connection',
        cutConnectionHint: 'Acts as if the network were lost: the app receives nothing and falls back to the schedules saved on the device.',
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
        versionLabel: 'Version:', dataSourceLabel: 'Data source:', designLabel: 'Design:',
        pleaseReload: 'Please reload the page.',
        calculateItinerary: 'Plan a journey',
        planRoute: 'Route planner',
      },
      onboarding: { title: 'Select your networks', description: 'Choose the operators to show.', action: 'Show stops', noSelection: 'Pick at least one network' },
    },
  } as const;

  const text = translations[language];

  const hidePageControls = false;
  const [hasBooted, setHasBooted] = useState(false);
  const isLoadingOverlayVisible = !hasBooted && (isLoading || firstFavoriteLoading);
  useEffect(() => {
    if (!isLoading && !firstFavoriteLoading) setHasBooted(true);
  }, [isLoading, firstFavoriteLoading]);
  const popupsReleased = hasBooted;

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
    const sharedOperator = leg?.sharedOperator as SharedOperator | undefined;
    if (sharedOperator) return SHARED_OPERATOR_COLORS[sharedOperator];
    if (leg?.taxiCompany) return '#f59e0b';

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

  const surveyJourney = useMemo((): TripSurveyLeg[] => {
    const legs = selectedRouteItinerary?.allLegs ?? [];
    return legs
      .filter((leg: any) => leg?.mode && leg.mode !== 'WALK')
      .map((leg: any) => ({
        line: String(leg.routeShortName || leg.route || leg.routeId || '').replace(/^SEM[:_]/, ''),
        from: String(leg.from?.name ?? ''),
        to: String(leg.to?.name ?? ''),
        departure: leg.startTime ? new Date(leg.startTime).toISOString() : undefined,
        arrival: leg.endTime ? new Date(leg.endTime).toISOString() : undefined,
      }))
      .filter(leg => leg.line && leg.from && leg.to);
  }, [selectedRouteItinerary]);

  const navigationLegPaths = useMemo(() => {
    if (!journeyGeometry) return undefined;
    const paths = new Map<number, Array<[number, number]>>();
    for (const leg of journeyGeometry.legGeometries) {
      if (leg.coordinates.length >= 2) paths.set(leg.index, leg.coordinates);
    }
    return paths;
  }, [journeyGeometry]);

  const addressNearbyStopIds = useMemo(() => {
    if (!selectedAddress) return null;
    return findClosestStops(stops, selectedAddress.lat, selectedAddress.lon, 8).map(entry => entry.stop.id);
  }, [selectedAddress, stops]);

  const routeLineGeoJSON = journeyGeometry?.lines ?? null;
  const routeStopsGeoJSON = journeyGeometry?.points ?? null;
  const routeLineBadges = journeyGeometry?.badges ?? null;

  const isDarkMode = effectiveTheme === 'dark';

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
          } else if (mapPickTarget === 'to') {
            setRouteTo(location);
          } else {
            setSavedPlace(mapPickTarget, location);
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
      disruptedLineIds={disruptedLineCodes}
      sharedMobility={visibleSharedMobility}
      focusedShared={sharedSelection}
      highlightedVehicleId={highlightedVehicleId}
      onSharedSelect={selection => {
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
      carpoolLines={carpoolMapLines}
      onCenterChange={handleMapCenterChange}
      onUserPan={() => {
        if (!isMobile) return;
        setMapPanSignal(signal => signal + 1);
        if (exploringMapRef.current) return;
        exploringMapRef.current = true;
        setExploringMap(true);
      }}
      onMoveSettled={(lat, lon) => {
        if (!exploringMapRef.current || !currentLocation) return;
        const gap = mapRef.current?.distancePx({ lat, lon }, currentLocation);
        if (gap === null || gap === undefined || gap > MAP_PIN_MAGNET_PX) return;
        exploringMapRef.current = false;
        setExploringMap(false);
        setMapPin(null);
        mapRef.current?.snapCenterTo(currentLocation.lat, currentLocation.lon);
      }}
      pickMode={mapPickTarget}
      onLongPress={handleMapLongPress}
      onMapClick={async (lat: number, lon: number) => {
        if (!mapPickTarget) {
          if (isMobile && isSidebarOpen && !lab.open && Date.now() - stopOpenedAtRef.current > STOP_TAP_GUARD_MS) setStopSheetCloseSignal(signal => signal + 1);
          return;
        }
        const addr = await describeMapPoint(lat, lon);
        const location: RouteLocation = {
          id: addr.id || `mappick-${lat}-${lon}`,
          label: addr.label,
          lat,
          lon,
          kind: 'address',
          raw: addr,
        } as RouteLocation;
        if (mapPickTarget === 'from') {
          setRouteFrom(location);
        } else if (mapPickTarget === 'to') {
          setRouteTo(location);
        } else if (mapPickTarget) {
          setSavedPlace(mapPickTarget, location);
        }
        setMapPickTarget(null);
        setSelectedRouteItinerary(null);
        mapRef.current?.centerOnLocation(lat, lon);
      }}
      visibleStopPoints={selectedRouteItinerary ? (
        (selectedRouteItinerary.routePath || []).map(([lon, lat]) => ({ lat, lon }))
      ) : servedStopPoints}
      isDarkMode={isDarkMode}
    />
  ), [stops, selectedStop, currentLocation, handleStopClick, selectedAddress, addressNearbyStopIds, lineGeometries, servedStopPoints, routeFrom, routeTo, routeLineGeoJSON, routeStopsGeoJSON, routeLineBadges, selectedRouteItinerary, mapPickTarget, isDarkMode, visibleSharedMobility, sharedSelection, highlightedVehicleId]);

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
            style={{ top: 'max(calc(var(--gl-safe-top) + 0.5rem), 1rem)' }}
            className={`fixed left-1/2 z-[1300] -translate-x-1/2 max-w-[min(92vw,420px)] rounded-full px-4 py-2 text-sm font-semibold shadow-2xl ${
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
                aria-label={tx(language === 'fr').common.closeLocationNotice}
              >
                ✕
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="absolute inset-0 z-0">
        {error ? (
          <div className="h-full flex items-center justify-center bg-red-950">
            <p className="text-red-400">{error}</p>
          </div>
        ) : (
          mapElement
        )}
      </div>

      {!error && (
        <LaunchScreen done={!isLoadingOverlayVisible} theme={effectiveTheme} isMobile={isMobile} />
      )}

      <OfflineLaunchScreen language={language} />

      <DevConsole />
      <NetOverlay />
      <DepartureLabOverlay />


      {popupsReleased && (
        <PopupOverlay
          popups={locatedPopups}
          language={language}
          theme={effectiveTheme}
          trafficFor={popupLineTraffic}
          onOpenLine={openPopupLine}
        />
      )}

      {!IS_NANCY && (
        <UnservedAreaPrompt
          position={exploringMap && mapPin && !mapPickTarget ? mapPin : currentLocation}
          isMobile={isMobile}
          language={language}
          theme={effectiveTheme}
        />
      )}

      {IS_NANCY && (
        <NancyAreaPrompt
          position={currentLocation}
          isMobile={isMobile}
          language={language}
          theme={effectiveTheme}
        />
      )}

      <DeferredPanel isOpen={selectedRouteItinerary !== null}>
        {selectedRouteItinerary && (
        <NavigationMode
          itinerary={selectedRouteItinerary}
          isOpen={isNavigationOpen}
          onClose={() => {
            clearNavigationSession();
            setIsNavigationOpen(false);
          }}
          language={language}
          stops={stops}
          lineLookup={allLinesLookup}
          currentLocation={currentLocation}
          legPaths={navigationLegPaths}
          refreshIntervalMs={parseRefreshInterval(refreshInterval)}
          itineraryOptions={routeItineraryOptions}
          onItinerarySelected={setSelectedRouteItinerary}
          onArrived={(contributions) => {
            const award = awardTrip(contributions);
            setTripAward(award);
            if (account) {
              const legs = (selectedRouteItinerary?.allLegs ?? [])
                .filter((leg: any) => leg?.mode && leg.mode !== 'WALK')
                .map((leg: any) => ({
                  line: String(leg.routeShortName || leg.route || leg.routeId || '').replace(
                    /^SEM[:_]/,
                    ''
                  ),
                  from: String(leg.from?.name ?? ''),
                  to: String(leg.to?.name ?? ''),
                  departure: leg.startTime ? new Date(leg.startTime).toISOString() : undefined,
                  arrival: leg.endTime ? new Date(leg.endTime).toISOString() : undefined,
                  color:
                    resolveRouteLine({
                      routeShortName: leg.routeShortName,
                      route: leg.route,
                      routeId: leg.routeId,
                      lineLookup: allLinesLookup,
                      stops,
                    })?.color || '#3b82f6',
                }))
                .filter(leg => leg.line && leg.from && leg.to);

              void recordTrip(account.cardCode, {
                origin: selectedRouteItinerary?.depName ?? null,
                destination: selectedRouteItinerary?.arrName ?? null,
                startedAt: legs[0]?.departure ?? null,
                endedAt: legs[legs.length - 1]?.arrival ?? null,
                legs,
                path: (selectedRouteItinerary?.routePath ?? []) as Array<[number, number]>,
                points: award.points,
                travellersHelped: award.travellersHelped,
              });

              void creditAccount(account.cardCode, {
                points: award.points,
                trips: 1,
                travellersHelped: award.travellersHelped,
              }).then(() => loadAccount().then(setAccount));
            }
            clearNavigationSession();
            window.setTimeout(() => setIsNavigationOpen(false), 700);
          }}
          isMobile={isMobile}
          theme={effectiveTheme}
        />
        )}
      </DeferredPanel>

      <TripCompleteScreen
        isOpen={tripAward !== null}
        award={tripAward}
        showPoints={account !== null}
        language={language}
        origin={selectedRouteItinerary?.depName}
        destination={selectedRouteItinerary?.arrName}
        account={account}
        photoUrl={
          walletCards.find(entry => entry.cardCode === account?.cardCode)?.photoUrl ?? null
        }
        lines={(selectedRouteItinerary?.allLegs ?? [])
          .filter((leg: any) => leg?.mode && leg.mode !== 'WALK')
          .map((leg: any) => ({
            label: String(leg.routeShortName || leg.route || leg.routeId || '').replace(
              /^SEM[:_]/,
              ''
            ),
            color:
              resolveRouteLine({
                routeShortName: leg.routeShortName,
                route: leg.route,
                routeId: leg.routeId,
                lineLookup: allLinesLookup,
                stops,
              })?.color || '#3b82f6',
          }))
          .filter((line: { label: string }) => line.label)}
        onClose={() => {
          setTripAward(null);
          setSelectedRouteItinerary(null);
          setIsRouteSidebarOpen(false);
        }}
      />

      <AccountSetupScreen
        isOpen={isAccountSetupOpen}
        cards={walletCards}
        language={language}
        isLight={effectiveTheme === 'light'}
        onBack={() => setIsAccountSetupOpen(false)}
        onDone={created => {
          setAccount(created);
          setIsAccountSetupOpen(false);
        }}
      />

      <ProfileScreen
        isOpen={isProfileOpen}
        account={account}
        card={walletCards.find(card => card.cardCode === account?.cardCode) ?? null}
        language={language}
        isLight={effectiveTheme === 'light'}
        onBack={() => setIsProfileOpen(false)}
      />

      <DeferredPanel isOpen={surveyContext !== null}>
        <TripSurvey
          isOpen={surveyContext !== null}
          onClose={() => setSurveyContext(null)}
          lineId={surveyContext?.lineId ?? ''}
          boardingStop={surveyContext?.boardingStop}
          boardingTime={surveyContext?.boardingTime}
          journey={surveyJourney}
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
        atmoFollowMap={atmoFollowMap}
        setAtmoFollowMap={setAtmoFollowMap}
        showInstallGuide={ isMobile && canOfferInstallGuide}
        compactThemes={isMobile}
        onOpenInstallGuide={() => {
          setSettingsState('closed');
          setIsInstallSheetOpen(true);
        }}
        appData={appData}
        text={text}
        contentRef={settingsContentRef}
        panelRef={settingsPanelRef}
        uiTheme={effectiveTheme}
        accountPseudo={account?.pseudo ?? null}
        accountAvatar={account?.avatarEmoji ?? null}
        onOpenAccount={IS_NANCY ? undefined : () =>
        account ? setIsProfileOpen(true) : setIsAccountSetupOpen(true)
        }
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
        recentPlaces={recentRoutePlaces}
        onRequestPickLocation={(field) => {
          setMapPickTarget(field);
          setSelectedRouteItinerary(null);
          setRouteItineraryOptions([]);
          setSharedRouteExpired(false);
          setSharedRouteTarget(null);
        }}
        onCancelPickLocation={() => setMapPickTarget(null)}
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
        onItinerarySelected={itinerary => {
          setSelectedRouteItinerary(itinerary);
          if (
            itinerary &&
            routeFrom &&
            routeTo &&
            routeFrom.id !== CURRENT_POSITION_ID &&
            routeTo.id !== CURRENT_POSITION_ID
          ) {
            recordJourney(routeFrom, routeTo, {
              lines: itinerary.lineKeys,
              duration: itinerary.dur,
            });
          }
        }}
        onItinerariesUpdated={options => {
          setRouteItineraryOptions(options);
          if (autoPickFirstItinerary && options.length > 0) {
            setSelectedRouteItinerary(options[0]);
            setAutoPickFirstItinerary(false);
          }
        }}
        onStartNavigation={GUIDANCE_ENABLED ? () => {
          if (isMobile && selectedRouteItinerary) saveNavigationSession(selectedRouteItinerary);
          setIsNavigationOpen(true);
        } : undefined}
        onOpenLine={line => {
          setIsRouteSidebarOpen(false);
          handleLineSearchSelect(line);
        }}
        currentLocation={currentLocation}
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

          <AnimatePresence>
            {isMobile && exploringMap && !mapPickTarget && isNearbySheetOpen && !isSidebarOpen && !isSettingsOpen && !isTrafficPanelOpenMobile && (
              <motion.div
                key="map-pin"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ duration: 0.2 }}
                className="pointer-events-none fixed z-[4] -ml-3 -mt-3"
                style={{ left: '50%', top: mapPinTop }}
                aria-hidden
              >
                <span className="relative flex h-6 w-6 items-center justify-center">
                  <span className="relative h-5 w-5 rounded-full border-[3px] border-white shadow-lg" style={{ backgroundColor: MAP_PIN_COLOR }} />
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {isMobile && !hidePageControls && isNearbySheetOpen && !isSidebarOpen && !isSettingsOpen && !isTrafficPanelOpenMobile && (
            <>
              <motion.button
                onClick={() => {
                  setExploringMap(false);
                  setMapPin(null);
                  handleLocationClick();
                  setIsNearbySheetOpen(true);
                }}
                style={{
                  zIndex: 5,
                  bottom: geolocButtonBottom,
                  opacity: geolocButtonOpacity,
                  scale: geolocButtonScale,
                  pointerEvents: geolocButtonPointer,
              }}
              initial={false}
              className="fixed right-4 w-12 h-12 rounded-full flex items-center justify-center cursor-pointer border-2 border-gray-700 bg-slate-900/85 hover:bg-slate-900 transition-colors shadow-lg"
              title={text.misc.centerLocation}
            >
              <MapPinIcon className="w-5 h-5 text-white" />
            </motion.button>

            <MapLayersButton
              language={language}
              isOpen={isMapLayersOpen}
              onToggle={() => setIsMapLayersOpen(open => !open)}
              onClose={() => setIsMapLayersOpen(false)}
              hidden={hiddenSharedLayers}
              onToggleLayer={toggleSharedLayer}
              operators={sharedOperatorsNearby}
              bottom={layersButtonBottom}
              opacity={mapControlsOpacity}
              scale={geolocButtonScale}
              pointerEvents={layersButtonPointer}
            />
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
                  <div className="absolute left-2.5 z-20 flex h-full items-center justify-center">
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
                      <DesktopSearchResults
                        query={searchQuery}
                        language={language}
                        lines={matchedLines}
                        stops={matchedStops}
                        addresses={addressResults}
                        history={searchHistory ? searchHistoryItems : []}
                        unknownCity={text.unknownCity}
                        stopBadges={renderStopLineBadges}
                        historyIcon={getHistoryItemIcon}
                        historySubtitle={getHistoryItemSubtitle}
                        onSelectLine={line => { closePanels(['line']); handleLineSearchSelect(line); }}
                        onSelectStop={stop => { closePanels(['stop']); handleSearchResultSelect(stop); }}
                        onSelectAddress={address => { closePanels(['address']); handleAddressSelect(address); }}
                        onSelectHistory={handleHistoryItemSelect}
                      />
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
                            <span>{text.misc.calculateItinerary}</span>
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
                      <div className="mb-3 flex items-center gap-2">
                        <StarIcon className="w-4 h-4 text-amber-400" />
                        <h3 className="text-sm font-semibold text-slate-300">
                          {tx(language === 'fr').app.favorites}
                        </h3>
                      </div>
                      {favoritesList.length === 0 ? (
                        <p className="rounded-[26px] border border-slate-800 bg-slate-900 px-4 py-5 text-center text-sm text-slate-400">
                          {tx(language === 'fr').app.noFavoritesYetOpen}
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {favoritesDetails.map(entry => {
                            const { favorite, detail } = entry;
                            const lines = favoriteStopLines(entry, allLinesLookup);
                            const shown = lines.slice(0, 3);
                            const extra = lines.length - shown.length;

                            const open = (lineId?: string) => {
                              const filter = lineId
                                ? [lineId]
                                : favorite.lines === 'all'
                                  ? undefined
                                  : favorite.lines;
                              if (filter && filter.length > 0) {
                                setInitialSelectedLines(new Set(filter));
                              }
                              const stub: Stop = (detail as Stop) ?? {
                                id: favorite.stopId,
                                name: favorite.stopName,
                                lat: 0,
                                lon: 0,
                                city: favorite.city,
                              };
                              setIsFavBtnHovered(false);
                              setIsFavPanelHovered(false);
                              handleStopClick(stub);
                            };

                            return (
                              <div
                                key={favorite.stopId}
                                className="flex w-full items-center gap-3 rounded-[26px] border border-slate-800 bg-slate-900 px-3.5 py-3 text-left transition hover:bg-slate-800/70"
                              >
                                <span className="flex flex-shrink-0 items-center gap-1">
                                  {shown.map(line => (
                                    <button
                                      key={line.lineId}
                                      type="button"
                                      onClick={() => open(line.lineId)}
                                      className="transition active:scale-90"
                                      aria-label={`${line.shortName} · ${favorite.stopName}`}
                                    >
                                      <LineBadge
                                        line={{
                                          id: line.lineId,
                                          shortName: line.shortName,
                                          color: line.color || undefined,
                                          textColor: line.textColor || undefined,
                                          hasTraffic: disruptedLineCodes?.has(line.shortName.toUpperCase()),
                                        }}
                                        size="xs"
                                      />
                                    </button>
                                  ))}
                                  {extra > 0 && (
                                    <span className="text-xs font-bold text-slate-400">+{extra}</span>
                                  )}
                                </span>

                                <button
                                  type="button"
                                  onClick={() => open()}
                                  className="flex min-w-0 flex-1 items-center gap-3 text-left text-white"
                                >
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[0.9375rem] font-semibold">
                                      {favorite.stopName}
                                    </span>
                                    {favorite.city && (
                                      <span className="block truncate text-xs text-slate-400">
                                        {favorite.city}
                                      </span>
                                    )}
                                  </span>
                                  <ChevronRightIcon className="h-5 w-5 flex-shrink-0 text-slate-400" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {favoriteLinesList.length > 0 && (
                        <div className="mt-4">
                          <h3 className="mb-2 text-sm font-semibold text-slate-300">
                            {tx(language === 'fr').app.lines}
                          </h3>
                          <div className="space-y-2">
                            {favoriteLinesList.map(fav => (
                              <button
                                key={fav.lineId}
                                type="button"
                                onClick={() => {
                                  setIsFavBtnHovered(false);
                                  setIsFavPanelHovered(false);
                                  const line = allLines.find(l => l.id === fav.lineId);
                                  handleLineSearchSelect(
                                    line || {
                                      id: fav.lineId,
                                      shortName: fav.shortName,
                                      longName: fav.longName,
                                      color: fav.color,
                                      textColor: fav.textColor,
                                      family: 'other',
                                    }
                                  );
                                }}
                                className="flex w-full items-center gap-3 rounded-[26px] border border-slate-800 bg-slate-900 px-3.5 py-3 text-left transition hover:bg-slate-800/70"
                              >
                                <LineBadge
                                  line={{ id: fav.lineId, shortName: fav.shortName, color: fav.color, textColor: fav.textColor }}
                                  size="xs"
                                />
                                <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold text-white">
                                  {fav.longName}
                                </span>
                                <ChevronRightIcon className="h-5 w-5 flex-shrink-0 text-slate-400" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>


              {!IS_NANCY && (
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
                    backgroundColor: atmoColor(isOffline ? null : atmoReport),
                    borderColor: isAtmoPanelOpen ? 'transparent' : 'rgba(var(--gl-ink-rgb), 0.35)',
                  }}
                  title={
                    atmoReport?.current
                      ? `${tx(language === 'fr').app.airQualityIndex} · ${atmoReport.current.qualificatif}`
                      : tx(language === 'fr').app.airQualityIndex
                  }
                >
                  {!isAtmoPanelOpen && (
                    isOffline ? (
                      <IoWifi className="w-5 h-5 text-white" aria-hidden="true" />
                    ) : atmoPicto(atmoReport) ? (
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
                      followMap={atmoFollowMap}
                    />
                  </div>
                </div>
              </div>
              )}

              <div onMouseEnter={() => setIsTrafficButtonHovered(true)} onMouseLeave={() => { setIsTrafficButtonHovered(false); setIsTrafficPanelPinned(false); }} className="relative z-50">
                <div className={`flex items-center justify-center cursor-pointer border transition-all duration-300 ${isTrafficPanelOpen ? 'w-96 h-96 rounded-2xl bg-slate-900/95 border-slate-700' : 'w-10 h-10 rounded-full bg-amber-500 border-amber-600 shadow-lg'}`}>
                  {!isTrafficPanelOpen && <ExclamationTriangleIcon className="w-5 h-5 text-white" />}
                  <div onMouseEnter={() => setIsTrafficPanelHovered(true)} onMouseLeave={() => setIsTrafficPanelHovered(false)}
                    className={`absolute top-0 left-0 z-50 transition-all duration-300 ease-out ${isTrafficPanelOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                    style={{ width: '100%', height: '100%' }}>
                    <div className="h-full w-full flex flex-col rounded-2xl border border-slate-700 bg-slate-900/95 shadow-2xl overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-amber-500 rounded-xl flex items-center justify-center">
                            <ExclamationTriangleIcon className="w-4 h-4 text-white" />
                          </div>
                          <h3 className="text-sm font-bold text-white">{text.misc.liveTrafficInfo}</h3>
                          {trafficPanelContentMounted && !isOffline && trafficInfo.size > 0 && (() => {
                            const visibleCount = Array.from(trafficInfo.entries())
                              .filter(([line]) =>
                                matchesTrafficFilter(line, desktopTrafficFilter, desktopTrafficSubFilter, allLinesLookup),
                              ).length;
                            return (
                              <span className="text-xs bg-amber-500 text-white font-bold px-2 py-0.5 rounded-full">
                                {visibleCount}
                              </span>
                            );
                          })()}
                        </div>
                      </div>

                      {trafficPanelContentMounted && <TrafficFilterBar
                        filters={trafficFilters(
                          new Set(Array.from(trafficInfo.keys()).map(line => trafficCategory(line, allLinesLookup))),
                          language,
                        )}
                        active={desktopTrafficFilter}
                        onSelect={setDesktopTrafficFilter}
                        subFilters={trafficSubFilters(desktopTrafficFilter, Array.from(trafficInfo.keys()), allLinesLookup, language)}
                        activeSub={desktopTrafficSubFilter}
                        onSelectSub={setDesktopTrafficSubFilter}
                        language={language}
                        size="sm"
                        scrollRef={trafficFiltersRef}
                      />}

                      <div className="overflow-y-auto flex-1 px-4 pb-4">
                        {!trafficPanelContentMounted ? null : isOffline ? <OfflinePanel language={language} /> : (() => {
                          const filteredEntries = Array.from(trafficInfo.entries())
                            .filter(([line]) =>
                              matchesTrafficFilter(line, desktopTrafficFilter, desktopTrafficSubFilter, allLinesLookup),
                            )
                            .sort(([a], [b]) => compareTrafficLines(a, b, allLinesLookup));

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
                                const resolved = isForeignLineId(line) ? foreignAsCatalogLine({ id: line }) : allLinesLookup.get(n);
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
                                        <span className="text-[0.625rem] text-slate-400">
                                          {sortedDetails.length}{' '}
                                          {sortedDetails.length > 1 ? text.misc.incidentPlural : text.misc.incidentSingular}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="space-y-2 p-3">
                                      {sortedDetails.map((detail, i) => (
                                        <TrafficAlertCard
                                          key={i}
                                          detail={detail}
                                          language={language}
                                          expandable={false}
                                        />
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

      {isMobile && (
        <HomeSheet
          isOpen={isNearbySheetOpen && !isCardFocused && !(isMobile && (isSidebarOpen || sharedSelection !== null)) && !isRouteSidebarOpen}
          locked={isAccountOpen || isFavoritesOpen || isRouteSidebarOpen}
          lockedScreen={isAccountOpen ? 'account' : isFavoritesOpen ? 'favorites' : isRouteSidebarOpen ? 'route' : undefined}
          layerAbove={isRouteSidebarOpen}
          searchOpen={isSearchFocused}
          onClose={() => {
            setIsNearbySheetOpen(false);
            setHasUserClosedHome(true);
          }}
          onSheetProgress={(p) => sheetProgress.set(p)}
          onHomeProgress={(p) => homeSheetProgress.set(p)}
          lowerOnMapPanSignal={mapPanSignal}
          snapToMiniSignal={snapHomeToMiniSignal}
          stops={stops}
          currentLocation={exploringMap && mapPin && !mapPickTarget ? mapPin : currentLocation}
          onStopClick={(stop, lineFilter) => {
            if (lineFilter && lineFilter.length > 0) {
              setInitialSelectedLines(new Set(lineFilter));
            }
            setSnapHomeToMiniSignal(s => s + 1);
            handleStopClick(stop);
          }}
          onOpenTraffic={() => setIsTrafficPanelOpenMobile(true)}
          onOpenSettings={() => {
            setSnapHomeToMiniSignal(s => s + 1);
            setSettingsState('open');
          }}
          onOpenItinerary={() => {
            setSnapHomeToMiniSignal(s => s + 1);
            setIsRouteSidebarOpen(true);
          }}
          onOpenAccount={() => setIsAccountOpen(true)}
          onLeaveAccount={() => setIsAccountOpen(false)}
          onOpenFavorites={() => {
            setIsAccountOpen(false);
            setIsFavoritesOpen(true);
          }}
          onLeaveFavorites={() => setIsFavoritesOpen(false)}
          onLeaveRoute={resetRoutePlanner}
          navCompact={(isAccountOpen || isFavoritesOpen) && isNavCompact}
          language={language}
          theme={effectiveTheme}
          favorites={favoritesList}
          favoriteDetails={favoritesDetails}
          searchBar={
            <SearchBarMobile
              inline
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              matchedStops={matchedStops}
              matchedLines={matchedLines}
              allLines={allLines}
              stops={stops}
              searchHistoryItems={searchHistory ? searchHistoryItems : []}
              searchPlaceholder={text.searchPlaceholder}
              onStopClick={stop => { setSnapHomeToMiniSignal(s => s + 1); setSelectedAddress(null); setSelectedLine(null); handleStopClick(stop); mapRef.current?.centerOnStop(stop); }}
              onLineClick={line => { setSnapHomeToMiniSignal(s => s + 1); handleLineSearchSelect(line); }}
              isFocused={isSearchFocused}
              onFocus={setIsSearchFocused}
              addressResults={addressResults}
              onAddressClick={handleAddressSelect}
              language={language}
              theme={effectiveTheme}
              trafficInfo={trafficInfo}
            />
          }
        />
      )}

      {isMobile && (
        <FavoritesScreen
          isOpen={isFavoritesOpen}
          side={isAccountOpen ? 'left' : 'right'}
          language={language}
          theme={effectiveTheme}
          stopDetails={favoritesDetails}
          favoriteLines={favoriteLinesList}
          journeys={favoriteJourneys}
          disruptedLines={disruptedLineCodes}
          lineLookup={allLinesLookup}
          onScrolledChange={setIsNavCompact}
          onOpenLine={fav => {
            setIsFavoritesOpen(false);
            const line = allLines.find(l => l.id === fav.lineId);
            handleLineSearchSelect(
              line || {
                id: fav.lineId,
                shortName: fav.shortName,
                longName: fav.longName,
                color: fav.color,
                textColor: fav.textColor,
                family: 'other',
              }
            );
          }}
          onOpenStop={(stopId, lineId) => {
            const favorite = favoritesList.find(entry => entry.stopId === stopId);
            const lineFilter = lineId
              ? [lineId]
              : favorite && favorite.lines !== 'all'
              ? favorite.lines
              : undefined;
            if (lineFilter && lineFilter.length > 0) {
              setInitialSelectedLines(new Set(lineFilter));
            }
            const stub: Stop = stops.find(stop => stop.id === stopId) ?? {
              id: stopId,
              name: favorite?.stopName ?? stopId,
              lat: 0,
              lon: 0,
              city: favorite?.city,
            };
            setIsFavoritesOpen(false);
            setSnapHomeToMiniSignal(s => s + 1);
            handleStopClick(stub);
          }}
          onConfigureJourneys={() => setIsJourneyConfigOpen(true)}
          onOpenJourney={(journey, itinerary) => {
            setIsFavoritesOpen(false);
            setRouteFrom(journey.from);
            setRouteTo(journey.to);
            setSelectedRouteItinerary(itinerary ?? null);
            setRouteItineraryOptions(itinerary ? [itinerary] : []);
            setMapPickTarget(null);
            setSharedRouteExpired(false);
            setSharedRouteTarget(null);
            setSelectedAddress(null);
            setSelectedStop(null);
            setSidebarState('closed');
            setIsRouteSidebarOpen(true);
          }}
        />
      )}

      {isMobile && (
        <>
          <JourneyConfigScreen
            isOpen={isJourneyConfigOpen}
            language={language}
            theme={effectiveTheme}
            history={journeyHistory}
            favorites={favoriteJourneys}
            onClose={() => setIsJourneyConfigOpen(false)}
            onPickFromHistory={entry =>
              setPendingJourney({ from: entry.from, to: entry.to, lines: entry.lines })
            }
            onNewJourney={() => {
              setPickerFrom(null);
              setPickerTo(null);
              setPickerResults([]);
              setIsJourneyPickerOpen(true);
            }}
          />

          <DeferredPanel isOpen={isJourneyPickerOpen}>
            <RouteSidebar
              variant="favoritePicker"
              isOpen={isJourneyPickerOpen}
              onClose={() => setIsJourneyPickerOpen(false)}
              stops={stops}
              language={language}
              isMobile
              theme={effectiveTheme}
              routeFrom={pickerFrom}
              routeTo={pickerTo}
              selectedItinerary={null}
              lineLookup={allLinesLookup}
              trafficInfo={trafficInfo}
              currentLocation={currentLocation}
              recentPlaces={[]}
              onLocationSelected={(location, field) => {
                if (field === 'from') setPickerFrom(location);
                else setPickerTo(location);
              }}
              onLocationCleared={field => {
                if (field === 'from') setPickerFrom(null);
                else setPickerTo(null);
                setPickerResults([]);
              }}
              onItinerariesUpdated={setPickerResults}
              onPickJourney={itinerary => {
                if (!pickerFrom || !pickerTo) return;
                const chosen = itinerary ?? pickerResults[0] ?? null;
                setPendingJourney({
                  from: pickerFrom,
                  to: pickerTo,
                  lines: chosen?.lineKeys ?? [],
                });
              }}
            />
          </DeferredPanel>

          <AddJourneyDialog
            journey={pendingJourney}
            language={language}
            isLight={effectiveTheme === 'light'}
            isFull={
              favoriteJourneys.length >= FAVORITE_JOURNEYS_MAX &&
              !favoriteJourneys.some(
                entry =>
                  pendingJourney != null &&
                  entry.id === journeyKey(pendingJourney.from, pendingJourney.to),
              )
            }
            onCancel={() => setPendingJourney(null)}
            onConfirm={() => {
              if (!pendingJourney) return;
              addFavoriteJourney(pendingJourney.from, pendingJourney.to, {
                lines: pendingJourney.lines,
              });
              setPendingJourney(null);
              setIsJourneyPickerOpen(false);
              setIsJourneyConfigOpen(false);
            }}
          />
        </>
      )}

      {isMobile && (
        <AccountScreen
          isOpen={isAccountOpen}
          language={language}
          theme={effectiveTheme}
          onCardFocusChange={setIsCardFocused}
          onScrolledChange={setIsNavCompact}
          onCardsChange={setWalletCards}
          settings={(
            <SettingsPanel
              variant="inline"
              isOpen
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
              atmoFollowMap={atmoFollowMap}
              setAtmoFollowMap={setAtmoFollowMap}
              onOpenInstallGuide={() => setIsInstallSheetOpen(true)}
              showInstallGuide={isMobile && canOfferInstallGuide}
              compactThemes={isMobile}
              appData={appData}
              text={text}
              uiTheme={effectiveTheme}
              accountPseudo={account?.pseudo ?? null}
              accountAvatar={account?.avatarEmoji ?? null}
              onOpenAccount={IS_NANCY ? undefined : () =>
              account ? setIsProfileOpen(true) : setIsAccountSetupOpen(true)
              }
              contentRef={settingsContentRef}
              panelRef={settingsPanelRef}
            />
          )}
        />
      )}

      {isMobile && !hidePageControls && (
        <LinesExplorerSheet
          isOpen={isLinesExplorerOpen}
          onClose={() => setIsLinesExplorerOpen(false)}
          lines={allLines}
          onLineClick={line => {
            setIsLinesExplorerOpen(false);
            handleLineSearchSelect(line);
          }}
          language={language}
          theme={effectiveTheme}
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
          onClose={dismissInstallGuide}
          language={language}
          theme={effectiveTheme}
        />
      )}

      <OnboardingFlow
        isOpen={isOnboardingOpen}
        language={language}
        cards={walletCards}
        canAddCard={isSupabaseConfigured}
        onEnableNotifications={async () => {
          const granted = await requestNotificationPermission();
          setNotificationsEnabled(granted);
        }}
        onCardsChange={setWalletCards}
        onDone={() => setIsOnboardingOpen(false)}
      />

      <MobileNotificationPrompt
        isOpen={isMobileNotificationPromptOpen}
        language={language}
        onEnable={enableMobileNotifications}
        onDismiss={dismissMobileNotificationPrompt}
      />

      {!isMobile && (
        <Sidebar
          stop={lab.open ? lab.stop : selectedStop}
          isOpen={lab.open || isSidebarOpen}
          frozen={lab.open}
          onClose={lab.open ? closeLab : handleSidebarClose}
          initialSelectedLines={lab.open ? undefined : initialSelectedLines}
          selectedLines={lab.open ? lab.selectedLines : selectedLines}
          onSelectedLinesChange={lab.open ? setLabSelectedLines : setSelectedLines}
          compactMode={compactMode}
          autoSync={autoSync}
          refreshIntervalMs={parseRefreshInterval(refreshInterval)}
          language={language}
          theme={effectiveTheme}
          onPlanRouteFromStop={openRouteFromStop}
          onOpenTimetable={setTimetableTarget}
          onOpenLine={line => {
            if (isForeignLineId(line.id)) {
              handleLineSearchSelect(foreignAsCatalogLine(line));
              return;
            }
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
        onOpenTimetable={options => {
          if (!selectedLine) return;
          setTimetableTarget({
            line: {
              id: selectedLine.id,
              shortName: selectedLine.shortName,
              color: selectedLine.color,
              textColor: selectedLine.textColor,
            },
            stopName: options?.stopName,
            stopId: options?.stopId,
          });
        }}
        onOpenLineMap={selectedLine && isForeignLineId(selectedLine.id) ? undefined : () => {
          if (!selectedLine) return;
          setLineMapTarget({
            routeId: toTimetableRouteId(selectedLine.shortName || selectedLine.id),
            label: `${tx(language === 'fr').app.line} ${selectedLine.shortName || selectedLine.id}`,
            color: selectedLine.color,
            lineId: selectedLine.id,
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
          closeSignal={stopSheetCloseSignal}
          stop={lab.open ? lab.stop : selectedStop}
          isOpen={lab.open || isSidebarOpen}
          frozen={lab.open}
          sidebarState={sidebarState}
          onClose={lab.open ? closeLab : handleSidebarClose}
          onOpen={handleSidebarOpen}
          initialSelectedLines={lab.open ? undefined : initialSelectedLines}
          selectedLines={lab.open ? lab.selectedLines : selectedLines}
          onSelectedLinesChange={lab.open ? setLabSelectedLines : setSelectedLines}
          compactMode={compactMode}
          autoSync={autoSync}
          refreshIntervalMs={parseRefreshInterval(refreshInterval)}
          language={language}
          theme={effectiveTheme}
          onPlanRouteFromStop={openRouteFromStop}
          onOpenTimetable={setTimetableTarget}
          onOpenLine={line => {
            if (isForeignLineId(line.id)) {
              handleLineSearchSelect(foreignAsCatalogLine(line));
              return;
            }
            const resolved = allLinesLookup.get(line.id.toUpperCase().trim())
              ?? allLinesLookup.get((line.shortName || line.id).toUpperCase().trim());
            if (resolved) handleLineSearchSelect(resolved);
          }}
        />
      )}

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
        onOpenItinerary={selectedAddress ? () => openRouteToAddress(selectedAddress) : undefined}
      />
      </DeferredPanel>

      {!hidePageControls && !isMobile && (
        <ClockSignal
          closedLabel={text.misc.networkClosed}
          overrideMessage={footerConfig.message}
          overrideColor={footerConfig.color}
          showClock={footerConfig.showClock}
          language={language}
        />
      )}

      {!isMobile && (
        <DeferredPanel isOpen={isSpotlightOpen}>
          <Spotlight
            isOpen={isSpotlightOpen}
            onClose={() => setIsSpotlightOpen(false)}
            onPlanRoute={() => setIsRouteSidebarOpen(true)}
            language={language}
            stops={stops}
            lines={spotlightLines}
            trafficInfo={trafficInfo}
            onSelectStop={stop => {
              closePanels(['stop']);
              handleStopClick(stop);
              mapRef.current?.centerOnStop(stop);
            }}
            onSelectLine={line => {
              closePanels(['line']);
              handleLineSearchSelect(line);
            }}
            onSelectAddress={address => {
              closePanels(['address']);
              handleAddressSelect(address);
            }}
            onOpenSettings={tab => {
              setActiveSettingsTab(tab ?? 'general');
              setSettingsState('open');
            }}
            onOpenTraffic={() => setIsTrafficPanelPinned(true)}
                onOpenNearby={handleLocationClick}
          />
        </DeferredPanel>
      )}

      {import.meta.env.PROD && <Analytics />}
      {import.meta.env.PROD && <SpeedInsights />}

      <DeferredPanel isOpen={timetableTarget !== null}>
        <TimetableSidebar
          isOpen={timetableTarget !== null}
          onClose={() => setTimetableTarget(null)}
          line={timetableTarget?.line ?? null}
          preferredHeadsign={timetableTarget?.headsign ?? null}
          highlightStopName={timetableTarget?.stopName ?? selectedStop?.name ?? null}
          stopId={timetableTarget?.stopId ?? selectedStop?.id ?? null}
          isMobile={isMobile}
          language={language}
          onOpenLineMap={timetableTarget && isForeignLineId(timetableTarget.line.id) ? undefined : () => {
            if (!timetableTarget) return;
            const line = timetableTarget.line;
            setLineMapTarget({
              routeId: toTimetableRouteId(line.shortName || line.id),
              label: `${tx(language === 'fr').app.line} ${line.shortName || line.id}`,
              color: line.color,
              lineId: line.id,
            });
          }}
        />
      </DeferredPanel>

      <DeferredPanel isOpen={lineMapTarget !== null}>
        <LineMapViewer
          isOpen={lineMapTarget !== null}
          onClose={() => setLineMapTarget(null)}
          routeId={lineMapTarget?.routeId ?? null}
          lineLabel={lineMapTarget?.label}
          lineColor={lineMapTarget?.color}
          lineId={lineMapTarget?.lineId ?? null}
          isMobile={isMobile}
          language={language}
        />
      </DeferredPanel>

      <DeferredPanel isOpen={sharedSelection !== null}>
        {sharedSelection && (
          <SharedMobilitySidebar
            collapseSignal={mapPanSignal}
            isOpen={sharedSelection !== null}
            onClose={() => { setSharedSelection(null); setHighlightedVehicleId(null); }}
            onVehicleFocus={setHighlightedVehicleId}
            operator={sharedSelection.operator}
            points={sharedSelection.points}
            isMobile={isMobile}
            language={language}
            isLight={effectiveTheme === 'light'}
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
              if (currentLocation) {
                setRouteFrom(currentPositionLocation(currentLocation));
                setAutoPickFirstItinerary(isMobile);
              }
              setSharedSelection(null);
              setIsRouteSidebarOpen(true);
            }}
          />
        )}
      </DeferredPanel>

      <Toast
        message={
          cardNotice
            ? {
                id: cardNotice.notification.id,
                text: tx(language === 'fr').app.newNotification,
                detail:
                  tx(language === 'fr').app.onCardlabelSCard(cardNotice.cardLabel),
                icon: <BellAlertIcon className="h-5 w-5" />,
              }
            : null
        }
        isLight={effectiveTheme === 'light'}
        onDismiss={dismissCardNotice}
        onClick={() => {
          setIsFavoritesOpen(false);
          setIsAccountOpen(true);
        }}
      />
      <Toast
        message={testToast}
        isLight={effectiveTheme === 'light'}
        onDismiss={() => setTestToast(null)}
      />

      {!isMobile && <DevOverlay />}
    </div>
    </MotionConfig>
  );
}

export default App;
