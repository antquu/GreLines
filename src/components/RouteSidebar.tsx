import { OfflinePanel } from './OfflinePanel';
import { useIsOffline, useReconnectCount } from '../hooks/useIsOffline';
import { isOffline } from '../services/offlineSchedule';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { XMarkIcon, MapPinIcon, ArrowLeftIcon, ArrowPathIcon, ChevronDownIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, ArrowsUpDownIcon, ViewfinderCircleIcon, HomeIcon, BriefcaseIcon, PlayIcon, MagnifyingGlassIcon, ClockIcon, ArrowDownIcon, AdjustmentsHorizontalIcon } from '@heroicons/react/24/solid';
import { PlaceIcon } from './PlaceIcon';
import { TbBusStop } from 'react-icons/tb';
import { ArrowUpOnSquareIcon } from '@heroicons/react/24/outline';
import { JourneyDetail } from './JourneyDetail';
import { MapSheet, NAVBAR_LIFT_PX, NAVBAR_SNAP_PX, SHEET_PADDING } from './MapSheet';
import { StepSlider } from './StepSlider';
import { JourneyResults } from './JourneyResults';
import { PlacesCarousel } from './PlacesCarousel';
import { SearchResultsList } from './SearchResultsList';
import { journeyLabelFor } from '../utils/journeyLabels';
import { searchAddresses } from '../services/geocoding';
import { planItineraries, type RouteItinerary, type RouteLocation } from '../services/api';
import { loadWalkPreferences, saveWalkPreferences, walkSpeedMs, WALK_SPEEDS, WALK_PRIORITIES } from '../services/walkPreferences';
import { usePerfSettings } from '../hooks/usePerfSettings';
import { FaWheelchair } from 'react-icons/fa';
import {
  ROUTE_NETWORKS,
  loadRouteNetworks,
  saveRouteNetworks,
} from '../services/routeNetworks';
import { planSharedJourneys } from '../services/sharedJourneys';
import { planUberJourney } from '../services/uberJourney';
import { planTaxiJourney } from '../services/taxiJourney';
import { CURRENT_POSITION_ID, currentPositionLocation } from '../utils/geo';
import { getSavedPlaces, setSavedPlace, subscribeSavedPlaces, type SavedPlaceKind, type SavedPlaces } from '../services/savedPlaces';
import { SavedPlaceSheet } from './SavedPlaceSheet';
import { Toast } from './Toast';
import { hapticTap } from '../utils/haptics';
import type { AllLinesLine } from '../services/allLines';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import type { Stop, TrafficDetail } from '../types';

interface RouteSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  stops: Stop[];
  language: 'fr' | 'en';
  routeFrom?: RouteLocation | null;
  routeTo?: RouteLocation | null;
  onLocationSelected?: (location: RouteLocation, field: 'from' | 'to') => void;
  onLocationCleared?: (field: 'from' | 'to') => void;
  selectedItinerary?: RouteItinerary | null;
  onItinerarySelected?: (itinerary: RouteItinerary | null) => void;
  onItinerariesUpdated?: (itineraries: RouteItinerary[]) => void;

  onStartNavigation?: () => void;
  onOpenLine?: (line: AllLinesLine) => void;
  onRouteReset?: () => void;
  lineLookup?: Map<string, AllLinesLine> | null;
  trafficInfo?: Map<string, TrafficDetail[]>;
  pickMode?: 'from' | 'to' | SavedPlaceKind | null;
  onRequestPickLocation?: (field: 'from' | 'to' | SavedPlaceKind) => void;
  onCancelPickLocation?: () => void;
  recentPlaces?: RouteLocation[];
  isMobile: boolean;
  sharedRouteExpired?: boolean;
  sharedRouteTarget?: {
    dep?: string;
    arr?: string;
    dur?: string;
  } | null;
  onPlanNewSharedRoute?: () => void;
  theme?: 'light' | 'dark';
  currentLocation?: { lat: number; lon: number } | null;
  variant?: 'planner' | 'favoritePicker';
  onPickJourney?: (itinerary: RouteItinerary | null) => void;
}

const getText = (language: 'fr' | 'en') => {
  const isFr = language === 'fr';
  return {
    title: isFr ? 'Itinéraire' : 'Route planner',
    from: isFr ? 'Départ' : 'From',
    to: isFr ? 'Arrivée' : 'To',
    choosePoint: isFr ? 'Choisissez un arrêt ou une adresse' : 'Pick a stop or address',
    search: isFr ? 'Rechercher' : 'Search',
    reset: isFr ? 'Réinitialiser' : 'Reset',
    noSuggestion: isFr ? 'Aucun résultat' : 'No results',
    unknownCity: isFr ? 'Ville inconnue' : 'Unknown city',
    stops: isFr ? 'Arrêts' : 'Stops',
    addresses: isFr ? 'Adresses' : 'Addresses',
    selectRoute: isFr ? 'Sélectionnez un itinéraire' : 'Select an itinerary',
    duration: isFr ? 'Durée' : 'Duration',
    depart: isFr ? 'Départ' : 'Depart',
    arrive: isFr ? 'Arrivée' : 'Arrive',
    lines: isFr ? 'Lignes' : 'Lines',
    walking: isFr ? 'À pied' : 'Walk',
    routeError: isFr ? 'Veuillez choisir un départ ET une arrivée valides.' : 'Please choose a valid origin AND destination.',
    noRoutes: isFr ? 'Aucun itinéraire trouvé' : 'No route found',
    close: isFr ? 'Fermer' : 'Close',
    selectedStop: isFr ? 'Arrêt sélectionné' : 'Selected stop',
    selectedAddress: isFr ? 'Adresse sélectionnée' : 'Selected address',
    stopKind: isFr ? 'Arrêt' : 'Stop',
    addressKind: isFr ? 'Adresse' : 'Address',
    swapEndpoints: isFr ? "Inverser le départ et l'arrivée" : 'Swap origin and destination',
    pickerTitle: isFr ? 'Nouveau trajet' : 'New journey',
    pickerHint: isFr
      ? 'Choisis un itinéraire pour en faire un favori.'
      : 'Pick a route to turn it into a favorite.',
    pickerAdd: isFr ? 'Ajouter ce trajet' : 'Add this journey',
    dragToClose: isFr ? 'Glissez vers le bas pour fermer' : 'Swipe down to close',
    pickPointOnMap: isFr ? 'Cliquez sur la carte pour choisir un point' : 'Click on the map to pick a point',
    tapPointOnMap: isFr ? 'Touchez la carte pour choisir un point' : 'Tap the map to pick a point',
    cancel: isFr ? 'Annuler' : 'Cancel',
    leaveNow: isFr ? 'Partir maintenant' : 'Leave now',
    refreshRoutes: isFr ? 'Rafraîchir les itinéraires' : 'Refresh routes',
    refresh: isFr ? 'Actualiser' : 'Refresh',
    expectedDeparture: isFr ? 'Départ prévu à' : 'Expected departure',
    estimatedArrival: isFr ? "Heure d'arrivée estimée :" : 'Estimated arrival:',
    extraSteps: (count: number) => isFr ? `+${count} étapes supplémentaires` : `+${count} more steps`,
    walkPriority: isFr ? 'Priorité à la marche' : 'Walking priority',
    greLinesTrip: 'GreLines Trip',
    otherOptions: isFr ? 'Autres options' : 'Other options',
    departAt: isFr ? 'Départ' : 'Depart',
    arriveAt: isFr ? 'Arrivée' : 'Arrive',
    now: isFr ? 'Maintenant' : 'Now',
    schedule: isFr ? 'Date et heure' : 'Date and time',
    prefer: isFr ? 'Préférer' : 'Prefer',
    walkBalanced: isFr ? 'Équilibré' : 'Balanced',
    pmr: isFr ? 'Accès PMR' : 'Step-free access',
    pmrHint: isFr
      ? 'Uniquement des trajets praticables en fauteuil : ni escalier en correspondance, ni arrêt non repris.'
      : 'Only step-free journeys: no stairs-only transfers, no stops that are not fitted.',
    preferWalk: isFr ? 'Plus de marche' : 'More walking',
    preferTransit: isFr ? 'Moins de marche' : 'Less walking',
    walkSpeed: isFr ? 'Vitesse de marche' : 'Walking speed',
    copiedUrl: isFr ? 'URL copié' : 'URL copied',
    shareJourney: isFr ? 'Partager le trajet' : 'Share journey',
    expiredJourney: isFr ? 'Malheureusement, ce trajet est dépassé.' : 'Unfortunately, this journey has expired.',
    planNewRoute: isFr ? 'Planifier un nouveau trajet' : 'Plan a new journey',
    useCurrentLocation: isFr ? 'Utiliser ma position' : 'Use my location',
    chooseOnMap: isFr ? 'Choisir sur la carte' : 'Choose on map',
    homeLabel: isFr ? 'Domicile' : 'Home',
    workLabel: isFr ? 'Travail' : 'Work',
    whereTo: isFr ? 'Où allez-vous ?' : 'Where to?',
    recents: isFr ? 'Recherches récentes' : 'Recent searches',
    visitTitle: isFr ? 'À visiter' : 'Worth a visit',
  };
};

const formatDateInput = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatTimeInput = (date: Date) => {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const pad2 = (value: number) => String(value).padStart(2, '0');

const parseTimeParts = (value: string): [number, number] => {
  const [hours, minutes] = value.split(':').map(Number);
  return [
    Number.isFinite(hours) ? Math.min(23, Math.max(0, hours)) : 0,
    Number.isFinite(minutes) ? Math.min(59, Math.max(0, minutes)) : 0,
  ];
};

const getWheelValues = (values: number[], selected: number) => {
  const selectedIndex = Math.max(0, values.indexOf(selected));
  return [-2, -1, 0, 1, 2].map(offset => {
    const index = (selectedIndex + offset + values.length) % values.length;
    return { value: values[index], offset };
  });
};

const shiftWheelValue = (values: number[], selected: number, direction: number) => {
  const selectedIndex = Math.max(0, values.indexOf(selected));
  const nextIndex = (selectedIndex + direction + values.length) % values.length;
  return values[nextIndex];
};

const parseDateInput = (value: string): Date => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
};

const formatPillDate = (date: string, time: string) => {
  const [, month, day] = date.split('-');
  return `${day}/${month}, ${time.replace(':', 'h')}`;
};

const monthLabel = (date: Date, language: 'fr' | 'en') => {
  return new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-US', {
    month: 'long',
    year: 'numeric',
  }).format(date);
};

const buildCalendarCells = (monthDate: Date) => {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const leading = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  return Array.from({ length: 42 }, (_, index) => {
    const dayNumber = index - leading + 1;
    if (dayNumber < 1) {
      return { day: daysInPrev + dayNumber, date: new Date(year, month - 1, daysInPrev + dayNumber), inMonth: false };
    }
    if (dayNumber > daysInMonth) {
      return { day: dayNumber - daysInMonth, date: new Date(year, month + 1, dayNumber - daysInMonth), inMonth: false };
    }
    return { day: dayNumber, date: new Date(year, month, dayNumber), inMonth: true };
  });
};

function SectionRule({ label, isLight }: { label: string; isLight: boolean }) {
  return (
    <div className="px-1 pb-2 pt-6">
      <p className={`text-sm font-semibold ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
        {label}
      </p>
      <div className={`mt-2 h-px w-full ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`} />
    </div>
  );
}

export const RouteSidebar = ({ isOpen, onClose, stops, language, isMobile, routeFrom, routeTo, onLocationSelected, onLocationCleared, selectedItinerary, onItinerarySelected, onItinerariesUpdated, onStartNavigation, onOpenLine, lineLookup, trafficInfo, pickMode, onRequestPickLocation, onCancelPickLocation, recentPlaces = [], sharedRouteExpired, sharedRouteTarget, onPlanNewSharedRoute, theme, currentLocation, variant = 'planner', onPickJourney }: RouteSidebarProps) => {
  const text = getText(language);
  const isLight = theme === 'light';
  const offline = useIsOffline();
  const reconnects = useReconnectCount();
  const isPicker = variant === 'favoritePicker';
  const initialDate = useMemo(() => new Date(), []);
  const openSeqRef = useRef(0);
  const wasOpenRef = useRef(false);
  if (isOpen && !wasOpenRef.current) openSeqRef.current += 1;
  wasOpenRef.current = isOpen;
  const openSeq = openSeqRef.current;
  const headerSurfaceClass = isMobile
    ? isLight
      ? 'border-b border-slate-200/80 bg-white/95 backdrop-blur'
      : 'border-b border-slate-800/80 bg-slate-950/95 backdrop-blur'
    : isLight
      ? 'border-b border-slate-200 bg-white'
      : 'border-b border-slate-800 bg-slate-950';
  const safeTop = 'max(calc(var(--gl-safe-top) + 4px), 0.5rem)';
  const safeBottom = 'max(env(safe-area-inset-bottom), 0.75rem)';
  const [fromQuery, setFromQuery] = useState('');
  const [toQuery, setToQuery] = useState('');
  const [fromSuggestions, setFromSuggestions] = useState<RouteLocation[]>([]);
  const [toSuggestions, setToSuggestions] = useState<RouteLocation[]>([]);
  const [fromSelection, setFromSelection] = useState<RouteLocation | null>(null);
  const [toSelection, setToSelection] = useState<RouteLocation | null>(null);
  const [routeResults, setRouteResults] = useState<RouteItinerary[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [bikeResults, setBikeResults] = useState<RouteItinerary[]>([]);
  const [sharedResults, setSharedResults] = useState<RouteItinerary[]>([]);
  const [uberResult, setUberResult] = useState<RouteItinerary | null>(null);
  const [taxiResult, setTaxiResult] = useState<RouteItinerary | null>(null);
  const [savedPlaces, setSavedPlaces] = useState<SavedPlaces>(() => getSavedPlaces());
  const [placeSheet, setPlaceSheet] = useState<{ kind: SavedPlaceKind; open: boolean }>(
    { kind: 'home', open: false },
  );
  const openPlaceSheet = (kind: SavedPlaceKind) => setPlaceSheet({ kind, open: true });
  const closePlaceSheet = () => setPlaceSheet(sheet => ({ ...sheet, open: false }));

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<number | null>(null);
  const dragYRef = useRef(0);
  const [dragY, setDragY] = useState(0);

  const DRAG_HINT_PX = 15;
  const DRAG_CLOSE_PX = 120;
  const isDragHintVisible = dragY > DRAG_HINT_PX;

  const hasBuzzedRef = useRef(false);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node || !isMobile) return;

    const onStart = (event: TouchEvent) => {
      if (node.scrollTop > 0) return;
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [data-no-drag]')) return;
      dragStartRef.current = event.touches[0].clientY;
    };

    const onMove = (event: TouchEvent) => {
      if (dragStartRef.current == null) return;
      const offset = event.touches[0].clientY - dragStartRef.current;
      if (offset <= 0 || node.scrollTop > 0) {
        dragStartRef.current = null;
        hasBuzzedRef.current = false;
        if (dragYRef.current !== 0) {
          dragYRef.current = 0;
          setDragY(0);
        }
        return;
      }
      if (event.cancelable) event.preventDefault();
      if (offset > DRAG_HINT_PX && !hasBuzzedRef.current) {
        hasBuzzedRef.current = true;
        hapticTap();
      }
      dragYRef.current = offset;
      setDragY(offset);
    };

    const onEnd = () => {
      if (dragStartRef.current == null) return;
      dragStartRef.current = null;
      hasBuzzedRef.current = false;
      if (dragYRef.current > DRAG_CLOSE_PX) onClose();
      dragYRef.current = 0;
      setDragY(0);
    };

    node.addEventListener('touchstart', onStart, { passive: true });
    node.addEventListener('touchmove', onMove, { passive: false });
    node.addEventListener('touchend', onEnd);
    node.addEventListener('touchcancel', onEnd);
    return () => {
      node.removeEventListener('touchstart', onStart);
      node.removeEventListener('touchmove', onMove);
      node.removeEventListener('touchend', onEnd);
      node.removeEventListener('touchcancel', onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, isOpen, openSeq]);

  const handleDragStart = (event: React.PointerEvent) => {
    if (event.pointerType === 'touch') return;
    if ((scrollerRef.current?.scrollTop ?? 0) > 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, [data-no-drag]')) return;
    dragStartRef.current = event.clientY;
  };
  const handleDragMove = (event: React.PointerEvent) => {
    if (event.pointerType === 'touch' || dragStartRef.current == null) return;
    const offset = Math.max(0, event.clientY - dragStartRef.current);
    dragYRef.current = offset;
    setDragY(offset);
  };
  const handleDragEnd = () => {
    if (dragStartRef.current == null) return;
    dragStartRef.current = null;
    if (dragYRef.current > 120) onClose();
    dragYRef.current = 0;
    setDragY(0);
  };

  const holdTimerRef = useRef<number | null>(null);
  const holdFiredRef = useRef(false);
  const cancelHold = () => {
    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
  };
  const startHold = (action?: () => void) => {
    if (!action) return;
    cancelHold();
    holdTimerRef.current = window.setTimeout(() => {
      holdFiredRef.current = true;
      action();
    }, 500);
  };
  useEffect(() => cancelHold, []);

  useEffect(() => subscribeSavedPlaces(setSavedPlaces), []);
  const _selectedItinerary: RouteItinerary | null | undefined = selectedItinerary;
  const _onItinerarySelected = onItinerarySelected;
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [scheduleMode, setScheduleMode] = useState<'depart' | 'arrive'>('depart');
  const [scheduleDate, setScheduleDate] = useState(() => formatDateInput(initialDate));
  const [scheduleTime, setScheduleTime] = useState(() => formatTimeInput(initialDate));
  const [scheduleIsNow, setScheduleIsNow] = useState(true);
  const [draftScheduleMode, setDraftScheduleMode] = useState<'depart' | 'arrive'>('depart');
  const [draftScheduleDate, setDraftScheduleDate] = useState(() => formatDateInput(initialDate));
  const [draftScheduleTime, setDraftScheduleTime] = useState(() => formatTimeInput(initialDate));
  const [draftScheduleIsNow, setDraftScheduleIsNow] = useState(true);
  const [activeScheduleMenu, setActiveScheduleMenu] = useState<'time' | 'mode' | null>(null);
  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => parseDateInput(formatDateInput(initialDate)));
  const storedWalk = loadWalkPreferences();
  const [walkPreference, setWalkPreference] = useState<'balanced' | 'walk' | 'transit'>(
    storedWalk.priorityIndex <= 0 ? 'transit' : storedWalk.priorityIndex >= 2 ? 'walk' : 'balanced'
  );
  const [walkSpeed, setWalkSpeed] = useState(walkSpeedMs(storedWalk));

  const { settings: perf, setSetting } = usePerfSettings();
  const wheelchairRouting = perf.pmrRouting;
  const [routeNetworks, setRouteNetworks] = useState<string[]>(loadRouteNetworks);
  const toggleRouteNetwork = (code: string) => {
    setRouteNetworks(current => {
      const next = current.includes(code)
        ? current.filter(entry => entry !== code)
        : [...current, code];
      const kept = next.length > 0 ? next : current;
      saveRouteNetworks(kept);
      return kept;
    });
  };
    useEffect(() => {
      const priorityIndex = walkPreference === 'transit' ? 0 : walkPreference === 'walk' ? 2 : 1;
      const speedIndex = WALK_SPEEDS.reduce((best, option, index) => {
        const bestDistance = Math.abs(WALK_SPEEDS[best].kmh / 3.6 - walkSpeed);
        const distance = Math.abs(option.kmh / 3.6 - walkSpeed);
        return distance < bestDistance ? index : best;
      }, 0);
      saveWalkPreferences({ speedIndex, priorityIndex });
    }, [walkPreference, walkSpeed]);
  const [shareToastVisible, setShareToastVisible] = useState(false);
  const [dragState, setDragState] = useState<{
    field: 'from' | 'to';
    location: RouteLocation;
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
  } | null>(null);
  const [pendingDrag, setPendingDrag] = useState<{
    field: 'from' | 'to';
    location: RouteLocation;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
  } | null>(null);
  const [dragOverEndpoint, setDragOverEndpoint] = useState<'from' | 'to' | null>(null);
  const lastAutoSearchKeyRef = useRef('');
  const hourWheelDeltaRef = useRef(0);
  const minuteWheelDeltaRef = useRef(0);
  const suppressCardClickRef = useRef(false);
  const endpointRefs = useRef<{ from: HTMLButtonElement | null; to: HTMLButtonElement | null }>({ from: null, to: null });
  const shareToastTimerRef = useRef<number | null>(null);
  const sharedRouteTargetHandledRef = useRef('');
  const sharedRequestRef = useRef(0);
  const bikeRequestRef = useRef(0);

  const calendarCells = useMemo(() => buildCalendarCells(calendarMonth), [calendarMonth]);
  const isFr = language === 'fr';
  const PRIORITY_KEYS = ['transit', 'balanced', 'walk'] as const;
  const priorityIndex = PRIORITY_KEYS.indexOf(walkPreference);
  const speedIndex = (() => {
    const kmh = walkSpeed * 3.6;
    let best = 0;
    WALK_SPEEDS.forEach((entry, index) => {
      if (Math.abs(entry.kmh - kmh) < Math.abs(WALK_SPEEDS[best].kmh - kmh)) best = index;
    });
    return best;
  })();

  const schedulePillLabel = scheduleIsNow
    ? text.now
    : `${scheduleMode === 'depart' ? text.departAt : text.arriveAt} : ${formatPillDate(scheduleDate, scheduleTime)}`;
  const walkReluctance = walkPreference === 'walk' ? 2.5 : walkPreference === 'transit' ? 8 : 5;
  const preferenceLabel =
    walkPreference === 'walk' ? text.preferWalk :
    walkPreference === 'transit' ? text.preferTransit :
    text.walkBalanced;
  const [selectedHour, selectedMinuteRaw] = parseTimeParts(draftScheduleTime);
  const selectedMinute = Math.min(55, Math.round(selectedMinuteRaw / 5) * 5);
  const hourValues = useMemo(() => Array.from({ length: 24 }, (_, index) => index), []);
  const minuteValues = useMemo(() => Array.from({ length: 12 }, (_, index) => index * 5), []);
  const hourWheelValues = getWheelValues(hourValues, selectedHour);
  const minuteWheelValues = getWheelValues(minuteValues, selectedMinute);

  const scheduleBody = (
    <>
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        closeScheduleMenu();
                      }}
                      className={`flex items-center justify-center rounded-full border border-slate-700 bg-slate-950 text-slate-300 transition hover:bg-slate-800 hover:text-white ${isMobile ? 'h-11 w-11' : 'h-9 w-9'}`}
                      aria-label={text.close}
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                    <div className="text-base font-bold text-white">{text.schedule}</div>
                    <button
                      type="button"
                      onClick={() => {
                        applyScheduleDraft();
                      }}
                      className={`flex items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500 ${isMobile ? 'h-11 w-11' : 'h-9 w-9'}`}
                      aria-label="Valider"
                    >
                      <CheckIcon className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-2 rounded-xl border border-slate-700 bg-slate-950 p-1">
                    <button
                      type="button"
                      onClick={() => {
                        setDraftScheduleMode('depart');
                        setDraftScheduleIsNow(false);
                      }}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${draftScheduleMode === 'depart' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
                    >
                      {text.departAt}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDraftScheduleMode('arrive');
                        setDraftScheduleIsNow(false);
                      }}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${draftScheduleMode === 'arrive' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
                    >
                      {text.arriveAt}
                    </button>
                  </div>

                  <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-bold capitalize text-white">{monthLabel(calendarMonth, language)}</div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
                          className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-700 hover:text-white"
                        >
                          <ChevronLeftIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
                          className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-700 hover:text-white"
                        >
                          <ChevronRightIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-7 gap-y-1 text-center text-[0.625rem] font-bold uppercase text-slate-400">
                      {(language === 'fr' ? ['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.', 'Dim.'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']).map(day => (
                        <div key={day}>{day}</div>
                      ))}
                    </div>

                    <div className="mt-2 grid grid-cols-7 gap-y-1 text-center">
                      {calendarCells.map(cell => {
                        const value = formatDateInput(cell.date);
                        const selected = value === draftScheduleDate;
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => {
                              setDraftScheduleDate(value);
                              setDraftScheduleIsNow(false);
                            }}
                            className={`mx-auto flex items-center justify-center rounded-full text-sm transition ${isMobile ? 'h-10 w-10' : 'h-8 w-8'} ${
                              selected
                                ? 'bg-blue-600 font-bold text-white'
                                : cell.inMonth
                                ? 'text-white hover:bg-slate-700'
                                : 'text-slate-600'
                            }`}
                          >
                            {cell.day}
                          </button>
                        );
                      })}
                    </div>

                    <div className="relative mt-4 flex items-center justify-between">
                      <div className="text-sm font-bold text-white">Heure</div>
                      {isMobile ? (
                        <input
                          type="time"
                          value={draftScheduleTime}
                          onChange={event => {
                            setDraftScheduleTime(event.target.value);
                            setDraftScheduleIsNow(false);
                          }}
                          className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-base font-semibold text-white outline-none focus:border-blue-500"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setIsTimePickerOpen(open => !open)}
                          className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:border-blue-500"
                        >
                          {draftScheduleTime}
                        </button>
                      )}

                      {isTimePickerOpen && !isMobile && (
                        <div
                          className="absolute bottom-full right-0 z-30 mb-2 w-48 rounded-2xl border border-slate-700 bg-slate-900/95 p-3 shadow-2xl"
                          onWheel={e => e.stopPropagation()}
                        >
                          <div className="relative grid grid-cols-2 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 py-2 overscroll-contain">
                            <div className="pointer-events-none absolute left-3 right-3 top-1/2 h-9 -translate-y-1/2 rounded-xl bg-slate-800/90" />
                            <div
                              className="relative z-10 flex flex-col items-center"
                              onWheel={e => handleWheelStep(e, hourWheelDeltaRef, shiftHour)}
                            >
                              {hourWheelValues.map(({ value, offset }) => (
                                <button
                                  key={`hour-${value}`}
                                  type="button"
                                  onClick={() => updateDraftScheduleTime(value, selectedMinute)}
                                  className={`h-9 w-full text-center transition ${
                                    offset === 0
                                      ? 'text-2xl font-semibold text-white'
                                      : Math.abs(offset) === 1
                                      ? 'text-lg text-slate-500'
                                      : 'text-sm text-slate-700'
                                  }`}
                                >
                                  {pad2(value)}
                                </button>
                              ))}
                            </div>
                            <div
                              className="relative z-10 flex flex-col items-center"
                              onWheel={e => handleWheelStep(e, minuteWheelDeltaRef, shiftMinute)}
                            >
                              {minuteWheelValues.map(({ value, offset }) => (
                                <button
                                  key={`minute-${value}`}
                                  type="button"
                                  onClick={() => updateDraftScheduleTime(selectedHour, value)}
                                  className={`h-9 w-full text-center transition ${
                                    offset === 0
                                      ? 'text-2xl font-semibold text-white'
                                      : Math.abs(offset) === 1
                                      ? 'text-lg text-slate-500'
                                      : 'text-sm text-slate-700'
                                  }`}
                                >
                                  {pad2(value)}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      setDraftScheduleMode('depart');
                      setDraftScheduleIsNow(true);
                      setDraftScheduleDate(formatDateInput(now));
                      setDraftScheduleTime(formatTimeInput(now));
                      setCalendarMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                      setIsTimePickerOpen(false);
                    }}
                    className="mt-4 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-left text-sm font-semibold text-slate-500 transition hover:border-slate-700 hover:text-slate-200"
                  >
                    {text.leaveNow}
                  </button>
    </>
  );

  const updateDraftScheduleTime = (hour: number, minute: number) => {
    setDraftScheduleTime(`${pad2(hour)}:${pad2(minute)}`);
    setDraftScheduleIsNow(false);
  };

  const shiftHour = (direction: number) => {
    updateDraftScheduleTime(shiftWheelValue(hourValues, selectedHour, direction), selectedMinute);
  };

  const shiftMinute = (direction: number) => {
    updateDraftScheduleTime(selectedHour, shiftWheelValue(minuteValues, selectedMinute, direction));
  };

  const handleWheelStep = (
    event: React.WheelEvent<HTMLDivElement>,
    deltaRef: React.MutableRefObject<number>,
    onStep: (direction: number) => void,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    deltaRef.current += event.deltaY;
    if (Math.abs(deltaRef.current) < 80) return;
    onStep(deltaRef.current > 0 ? 1 : -1);
    deltaRef.current = 0;
  };

  const openScheduleMenu = () => {
    setDraftScheduleMode(scheduleMode);
    setDraftScheduleDate(scheduleDate);
    setDraftScheduleTime(scheduleTime);
    setDraftScheduleIsNow(scheduleIsNow);
    setCalendarMonth(parseDateInput(scheduleDate));
    setIsTimePickerOpen(false);
    setActiveScheduleMenu(activeScheduleMenu === 'time' ? null : 'time');
  };

  const closeScheduleMenu = () => {
    setIsTimePickerOpen(false);
    setActiveScheduleMenu(null);
  };

  const applyScheduleDraft = () => {
    setScheduleMode(draftScheduleMode);
    setScheduleDate(draftScheduleDate);
    setScheduleTime(draftScheduleTime);
    setScheduleIsNow(draftScheduleIsNow);
    closeScheduleMenu();
  };

  useEffect(() => {
    if (isOpen) return;
    clearAllResults();
    setRouteError(null);
    setRouteLoading(false);
    setRefreshing(false);
    setDragY(0);
    dragYRef.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!routeFrom) {
      setFromSelection(null);
      setFromQuery('');
      return;
    }
    setFromSelection(routeFrom);
    setFromQuery(routeFrom.label);
  }, [routeFrom]);

  useEffect(() => {
    if (!routeTo) {
      setToSelection(null);
      setToQuery('');
      return;
    }
    setToSelection(routeTo);
    setToQuery(routeTo.label);
  }, [routeTo]);

  const debouncedFromQuery = useDebouncedValue(fromQuery, 250);
  const debouncedToQuery = useDebouncedValue(toQuery, 250);

  const buildStopSuggestions = (query: string) => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return [];
    return stops
      .filter(stop =>
        stop.name.toLowerCase().includes(trimmed) ||
        (stop.city?.toLowerCase().includes(trimmed) ?? false) ||
        stop.id.toLowerCase().includes(trimmed)
      )
      .slice(0, 6)
      .map(stop => ({
        id: stop.id,
        label: stop.name,
        lat: stop.lat,
        lon: stop.lon,
        kind: 'stop' as const,
        raw: stop,
      }));
  };

  useEffect(() => {
    if (!debouncedFromQuery.trim()) {
      setFromSuggestions([]);
      return;
    }

    const stopsList = buildStopSuggestions(debouncedFromQuery);
    if (stopsList.length >= 4) {
      setFromSuggestions(stopsList);
      return;
    }

    let active = true;
    searchAddresses(debouncedFromQuery, { limit: 4 })
      .then(results => {
        if (!active) return;
        const addressLocations = results.map(addr => ({
          id: addr.id,
          label: addr.label,
          lat: addr.lat,
          lon: addr.lon,
          kind: 'address' as const,
          raw: addr,
        }));
        setFromSuggestions([...stopsList, ...addressLocations].slice(0, 8));
      })
      .catch(() => {
        if (!active) return;
        setFromSuggestions(stopsList);
      });
    return () => {
      active = false;
    };
  }, [debouncedFromQuery, stops]);

  useEffect(() => {
    if (!debouncedToQuery.trim()) {
      setToSuggestions([]);
      return;
    }

    const stopsList = buildStopSuggestions(debouncedToQuery);
    if (stopsList.length >= 4) {
      setToSuggestions(stopsList);
      return;
    }

    let active = true;
    searchAddresses(debouncedToQuery, { limit: 4 })
      .then(results => {
        if (!active) return;
        const addressLocations = results.map(addr => ({
          id: addr.id,
          label: addr.label,
          lat: addr.lat,
          lon: addr.lon,
          kind: 'address' as const,
          raw: addr,
        }));
        setToSuggestions([...stopsList, ...addressLocations].slice(0, 8));
      })
      .catch(() => {
        if (!active) return;
        setToSuggestions(stopsList);
      });
    return () => {
      active = false;
    };
  }, [debouncedToQuery, stops]);

  const handleFromQueryChange = (value: string) => {
    setFromQuery(value);
    if (fromSelection && fromSelection.label !== value) setFromSelection(null);
  };

  const handleToQueryChange = (value: string) => {
    setToQuery(value);
    if (toSelection && toSelection.label !== value) setToSelection(null);
  };

  const handleSelectFrom = (location: RouteLocation) => {
    setFromSelection(location);
    setFromQuery(location.label);
    setFromSuggestions([]);
    onLocationSelected?.(location, 'from');
  };

  const handleSelectTo = (location: RouteLocation) => {
    setToSelection(location);
    setToQuery(location.label);
    setToSuggestions([]);
    onLocationSelected?.(location, 'to');
  };

  useEffect(() => {
    if (!isOpen || !isMobile || !currentLocation) return;
    if (fromSelection || routeFrom || fromQuery) return;
    handleSelectFrom(currentPositionLocation(currentLocation));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isMobile, currentLocation?.lat, currentLocation?.lon]);

  const canSearch = !!fromSelection && !!toSelection;

  const handleSearch = useCallback(async (options: { silent?: boolean } = {}) => {
    if (isOffline()) return;
    if (!canSearch || !fromSelection || !toSelection) {
      setRouteError(text.routeError);
      return;
    }
    setRouteError(null);
    setRefreshing(true);
    if (!options.silent) {
      setRouteLoading(true);
    }
    const queryDate = scheduleIsNow ? formatDateInput(new Date()) : scheduleDate;
    const queryTime = scheduleIsNow ? formatTimeInput(new Date()) : scheduleTime;
    if (!options.silent) {
      setRouteResults([]);
      setBikeResults([]);
      setSharedResults([]);
      setUberResult(null);
      setTaxiResult(null);
      onItinerariesUpdated?.([]);
      _onItinerarySelected?.(null);
    }

    const sharedToken = ++sharedRequestRef.current;
    if (scheduleMode !== 'arrive') {
      const [hours, minutes] = parseTimeParts(queryTime);
      const departAt = parseDateInput(queryDate);
      departAt.setHours(hours, minutes, 0, 0);
      const endpoints = {
        fromLatitude: fromSelection.lat,
        fromLongitude: fromSelection.lon,
        toLatitude: toSelection.lat,
        toLongitude: toSelection.lon,
        fromName: fromSelection.label,
        toName: toSelection.label,
        departAt,
      };
      void planSharedJourneys({ ...endpoints, walkSpeed }).then(found => {
        if (sharedRequestRef.current === sharedToken) setSharedResults(found);
      });
      void planUberJourney(endpoints).then(found => {
        if (sharedRequestRef.current === sharedToken) setUberResult(found);
      });
      void planTaxiJourney(endpoints).then(found => {
        if (sharedRequestRef.current === sharedToken) setTaxiResult(found);
      });
    }

    try {
      const itineraries = await planItineraries({
        fromLatitude: fromSelection.lat,
        fromLongitude: fromSelection.lon,
        toLatitude: toSelection.lat,
        toLongitude: toSelection.lon,
        fromName: fromSelection.label,
        toName: toSelection.label,
        arriveBy: scheduleMode === 'arrive',
        date: queryDate,
        time: queryTime,
        departNow: scheduleIsNow && scheduleMode !== 'arrive',
        walkReluctance,
        walkSpeed,
        wheelchair: wheelchairRouting,
      });
      setRouteResults(itineraries);
      onItinerariesUpdated?.(itineraries);

      const bikeToken = ++bikeRequestRef.current;
      void planItineraries({
        fromLatitude: fromSelection.lat,
        fromLongitude: fromSelection.lon,
        toLatitude: toSelection.lat,
        toLongitude: toSelection.lon,
        fromName: fromSelection.label,
        toName: toSelection.label,
        arriveBy: scheduleMode === 'arrive',
        date: queryDate,
        time: queryTime,
        departNow: scheduleIsNow && scheduleMode !== 'arrive',
        mode: 'BICYCLE,TRANSIT',
        wheelchair: wheelchairRouting,
      })
        .then(found => {
          if (bikeRequestRef.current === bikeToken) setBikeResults(found);
        })
        .catch(() => {
          if (bikeRequestRef.current === bikeToken) setBikeResults([]);
        });
      if (!options.silent && sharedRouteTarget && !sharedRouteExpired) {
        const targetKey = [sharedRouteTarget.dep || '', sharedRouteTarget.arr || '', sharedRouteTarget.dur || ''].join('|');
        if (sharedRouteTargetHandledRef.current !== targetKey) {
          const matchingItinerary = itineraries.find(itinerary =>
            (!sharedRouteTarget.dep || itinerary.dep === sharedRouteTarget.dep) &&
            (!sharedRouteTarget.arr || itinerary.arr === sharedRouteTarget.arr) &&
            (!sharedRouteTarget.dur || itinerary.dur === sharedRouteTarget.dur)
          ) || itineraries[0];
          if (matchingItinerary) {
            sharedRouteTargetHandledRef.current = targetKey;
            _onItinerarySelected?.(matchingItinerary);
          }
        }
      }
      if (itineraries.length === 0) {
        setRouteError(text.noRoutes);
      }
    } catch (err) {
      setRouteError((err as Error)?.message || String(err));
    } finally {
      setRefreshing(false);
      if (!options.silent) {
        setRouteLoading(false);
      }
    }
  }, [
    canSearch,
    fromSelection,
    toSelection,
    scheduleIsNow,
    scheduleDate,
    scheduleTime,
    scheduleMode,
    walkReluctance,
    walkSpeed,
    wheelchairRouting,
    text.routeError,
    text.noRoutes,
    _onItinerarySelected,
    sharedRouteTarget,
    sharedRouteExpired,
  ]);

  const handleResultTap = (itinerary: RouteItinerary) => {
    if (isPicker) {
      onPickJourney?.(itinerary);
      return;
    }
    _onItinerarySelected?.(itinerary);
  };

  const swapRouteEndpoints = () => {
    const nextFromSelection = toSelection;
    const nextToSelection = fromSelection;
    const nextFromQuery = toSelection?.label ?? toQuery;
    const nextToQuery = fromSelection?.label ?? fromQuery;

    setFromSelection(nextFromSelection);
    setToSelection(nextToSelection);
    setFromQuery(nextFromQuery);
    setToQuery(nextToQuery);
    setFromSuggestions([]);
    setToSuggestions([]);
    clearAllResults();
    _onItinerarySelected?.(null);

    if (nextFromSelection) {
      onLocationSelected?.(nextFromSelection, 'from');
    } else {
      onLocationCleared?.('from');
    }

    if (nextToSelection) {
      onLocationSelected?.(nextToSelection, 'to');
    } else {
      onLocationCleared?.('to');
    }
  };

  const clearRouteLocation = (field: 'from' | 'to', location: RouteLocation) => {
    if (suppressCardClickRef.current) return;

    if (field === 'from') {
      setFromQuery(location.label);
      setFromSelection(null);
      setFromSuggestions([]);
    } else {
      setToQuery(location.label);
      setToSelection(null);
      setToSuggestions([]);
    }

    onLocationCleared?.(field);
    _onItinerarySelected?.(null);
    clearAllResults();
  };

  function clearAllResults() {
    setRouteResults([]);
    setBikeResults([]);
    setSharedResults([]);
    setUberResult(null);
    setTaxiResult(null);
    sharedRequestRef.current += 1;
    bikeRequestRef.current += 1;
    onItinerariesUpdated?.([]);
  }

  const handleEndpointPointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    field: 'from' | 'to',
    location: RouteLocation,
  ) => {
    if (isMobile || !fromSelection || !toSelection || event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setPendingDrag({
      field,
      location,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    });
    setDragOverEndpoint(null);
  };

  const renderEndpointSelection = (field: 'from' | 'to', location: RouteLocation) => {
    const isCurrentPosition = location.id === CURRENT_POSITION_ID;
    const isDragging = dragState?.field === field;
    const isDropTarget = dragState != null && dragState.field !== field && dragOverEndpoint === field;
    const canDrag = Boolean(!isMobile && fromSelection && toSelection);

    if (isDragging) {
      return (
        <div className="h-[70px] w-full rounded-2xl border-2 border-dashed border-blue-500/80 bg-blue-500/10" />
      );
    }

    return (
      <button
        ref={node => {
          endpointRefs.current[field] = node;
        }}
        type="button"
        onPointerDown={event => handleEndpointPointerDown(event, field, location)}
        onClick={() => clearRouteLocation(field, location)}
        style={{ touchAction: canDrag ? 'none' : undefined }}
        className={`group w-full rounded-2xl border bg-slate-900 px-4 py-3 text-left text-sm text-white transition hover:border-blue-500 ${canDrag ? 'cursor-grab active:cursor-grabbing' : ''} ${isDropTarget ? 'border-blue-500 shadow-[0_0_0_1px_rgba(59,130,246,0.65)]' : 'border-slate-700'}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate font-semibold">{location.label}</div>
            {!isCurrentPosition && (
              <div className="mt-0.5 text-xs text-slate-500">
                {location.kind === 'stop' ? text.selectedStop : text.selectedAddress}
              </div>
            )}
          </div>
          <span className="relative flex h-5 flex-shrink-0 items-center justify-end">
            <span className="text-xs uppercase tracking-[0.18em] text-slate-400 transition-opacity duration-200 group-hover:opacity-0">
              {isCurrentPosition ? '' : location.kind === 'stop' ? text.stopKind : text.addressKind}
            </span>
            <span
              aria-hidden
              className="absolute inset-y-0 right-0 flex items-center text-sm text-slate-300 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            >
              ✕
            </span>
          </span>
        </div>
      </button>
    );
  };

  const renderLocationSuggestions = (
    suggestions: RouteLocation[],
    onSelect: (location: RouteLocation) => void,
  ) => {
    if (suggestions.length === 0) return null;

    const stopSuggestions = suggestions.filter(suggestion => suggestion.kind === 'stop');
    const addressSuggestions = suggestions.filter(suggestion => suggestion.kind === 'address');

    const rowClass = isMobile
      ? 'flex w-full items-center gap-3 px-4 py-3.5 text-left transition active:bg-slate-800/70'
      : 'flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-slate-800';

    return (
      <div className={`absolute left-0 right-0 top-full z-50 mt-2 overflow-auto rounded-2xl border border-gray-700 bg-slate-900/95 text-sm text-slate-100 shadow-xl ${isMobile ? 'max-h-[50vh]' : 'max-h-72'}`}>
        {stopSuggestions.length > 0 && (
          <>
            <div className="border-b border-slate-800 px-3 py-1.5 text-[0.625rem] font-semibold uppercase tracking-wider text-slate-500">
              {text.stops}
            </div>
            {stopSuggestions.map(suggestion => (
              <button
                key={`${suggestion.kind}-${suggestion.id}`}
                type="button"
                onMouseDown={event => {
                  event.preventDefault();
                  onSelect(suggestion);
                }}
                className={rowClass}
              >
                <TbBusStop className="h-4 w-4 flex-shrink-0 text-blue-400" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-gray-100">{suggestion.label}</div>
                  <div className="truncate text-xs text-gray-400">{suggestion.raw?.city || text.unknownCity}</div>
                </div>
              </button>
            ))}
          </>
        )}

        {addressSuggestions.length > 0 && (
          <>
            <div className="border-y border-slate-800 px-3 py-1.5 text-[0.625rem] font-semibold uppercase tracking-wider text-slate-500 first:border-t-0">
              {text.addresses}
            </div>
            {addressSuggestions.map(suggestion => (
              <button
                key={`${suggestion.kind}-${suggestion.id}`}
                type="button"
                onMouseDown={event => {
                  event.preventDefault();
                  onSelect(suggestion);
                }}
                className={rowClass}
              >
                <PlaceIcon
                  category={(suggestion.raw as { category?: string } | undefined)?.category}
                  className="h-4 w-4 flex-shrink-0"
                  fallback={<MapPinIcon className="h-4 w-4 flex-shrink-0 text-amber-400" />}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-gray-100">{suggestion.raw?.name || suggestion.label}</div>
                  <div className="truncate text-xs text-gray-400">{suggestion.raw?.context || suggestion.label}</div>
                </div>
              </button>
            ))}
          </>
        )}
      </div>
    );
  };

  useEffect(() => {
    if (!pendingDrag && !dragState) return;

    const getDropTarget = (clientX: number, clientY: number) => {
      if (!dragState) return null;
      const target = dragState.field === 'from' ? 'to' : 'from';
      const rect = endpointRefs.current[target]?.getBoundingClientRect();
      if (!rect) return null;
      const isInside =
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom;
      return isInside ? target : null;
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (pendingDrag) {
        const distance = Math.hypot(event.clientX - pendingDrag.startX, event.clientY - pendingDrag.startY);
        if (distance < 6) return;
        suppressCardClickRef.current = true;
        setDragState({
          field: pendingDrag.field,
          location: pendingDrag.location,
          x: event.clientX - pendingDrag.offsetX,
          y: event.clientY - pendingDrag.offsetY,
          offsetX: pendingDrag.offsetX,
          offsetY: pendingDrag.offsetY,
          width: pendingDrag.width,
          height: pendingDrag.height,
        });
        setPendingDrag(null);
        return;
      }

      if (!dragState) return;
      setDragState(current => current ? {
        ...current,
        x: event.clientX - current.offsetX,
        y: event.clientY - current.offsetY,
      } : current);
      setDragOverEndpoint(getDropTarget(event.clientX, event.clientY));
    };

    const handlePointerUp = (event: PointerEvent) => {
      setPendingDrag(null);
      const target = getDropTarget(event.clientX, event.clientY);
      if (dragState && target) {
        swapRouteEndpoints();
      }
      setDragState(null);
      setDragOverEndpoint(null);
      window.setTimeout(() => {
        suppressCardClickRef.current = false;
      }, 0);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [pendingDrag, dragState, swapRouteEndpoints]);

  useEffect(() => {
    if (!isOpen || !fromSelection || !toSelection) return;
    if (_selectedItinerary) return;
    const searchKey = [
      fromSelection.id,
      toSelection.id,
      scheduleMode,
      scheduleDate,
      scheduleTime,
      scheduleIsNow ? 'now' : 'custom',
      walkReluctance,
      walkSpeed,
      wheelchairRouting ? 'pmr' : 'any',
    ].join('|');
    if (lastAutoSearchKeyRef.current === searchKey) return;
    lastAutoSearchKeyRef.current = searchKey;
    handleSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isOpen,
    _selectedItinerary,
    fromSelection?.id,
    toSelection?.id,
    scheduleMode,
    scheduleDate,
    scheduleTime,
    scheduleIsNow,
    walkReluctance,
    walkSpeed,
    wheelchairRouting,
  ]);

  useEffect(() => {
    if (reconnects === 0 || !isOpen || !fromSelection || !toSelection) return;
    handleSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reconnects]);

  useEffect(() => {
    if (!isOpen || !fromSelection || !toSelection || routeResults.length === 0) return;
    const refresh = window.setInterval(() => {
      handleSearch({ silent: true });
    }, 60_000);
    return () => window.clearInterval(refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, fromSelection?.id, toSelection?.id, routeResults.length]);

  const operatorResults = useMemo(
    (): RouteItinerary[] => [
      ...sharedResults,
      ...(uberResult ? [uberResult] : []),
      ...(taxiResult ? [taxiResult] : []),
    ],
    [sharedResults, uberResult, taxiResult],
  );

  const currentResults = useMemo(
    (): RouteItinerary[] => [...routeResults, ...bikeResults, ...operatorResults],
    [routeResults, bikeResults, operatorResults],
  );

  const selectedLabel = useMemo(
    () => (_selectedItinerary ? journeyLabelFor(currentResults, _selectedItinerary, language) : null),
    [currentResults, _selectedItinerary, language],
  );

  const buildShareUrl = () => {
    const url = new URL('/app', window.location.origin);
    url.searchParams.set('route', '1');
    url.searchParams.set('sharedJourney', '1');

    const writeLocation = (prefix: 'from' | 'to', location: RouteLocation | null) => {
      if (!location) return;
      url.searchParams.set(`${prefix}Id`, location.id);
      url.searchParams.set(`${prefix}Label`, location.label);
      url.searchParams.set(`${prefix}Lat`, String(location.lat));
      url.searchParams.set(`${prefix}Lon`, String(location.lon));
      url.searchParams.set(`${prefix}Kind`, location.kind);
    };

    writeLocation('from', fromSelection);
    writeLocation('to', toSelection);
    url.searchParams.set('mode', scheduleMode);
    url.searchParams.set('date', scheduleDate);
    url.searchParams.set('time', scheduleTime);
    url.searchParams.set('now', scheduleIsNow ? '1' : '0');
    url.searchParams.set('walkPreference', walkPreference);
    url.searchParams.set('walkSpeed', String(walkSpeed));
    if (_selectedItinerary) {
      url.searchParams.set('journeyDep', _selectedItinerary.dep);
      url.searchParams.set('journeyArr', _selectedItinerary.arr);
      url.searchParams.set('journeyDur', _selectedItinerary.dur);
    }
    const lastLegWithEndTime = [...(_selectedItinerary?.allLegs || [])].reverse().find((leg: any) => leg?.endTime);
    const expiresAt = lastLegWithEndTime?.endTime || _selectedItinerary?.rawArr;
    if (expiresAt) {
      url.searchParams.set('expiresAt', String(new Date(expiresAt).getTime()));
    }
    return url.toString();
  };

  const copyShareUrl = async () => {
    const shareUrl = buildShareUrl();
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = shareUrl;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }

    setShareToastVisible(true);
    if (shareToastTimerRef.current) {
      window.clearTimeout(shareToastTimerRef.current);
    }
    shareToastTimerRef.current = window.setTimeout(() => {
      setShareToastVisible(false);
    }, 2200);
  };

  useEffect(() => {
    return () => {
      if (shareToastTimerRef.current) {
        window.clearTimeout(shareToastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
  }, [isOpen, _selectedItinerary]);

  useEffect(() => {
    if (isOpen) return;
    setFromQuery('');
    setToQuery('');
    setFromSuggestions([]);
    setToSuggestions([]);
    setFromSelection(null);
    setToSelection(null);
    clearAllResults();
    setRouteError(null);
    setRouteLoading(false);
    setPendingDrag(null);
    setDragState(null);
    setDragOverEndpoint(null);
    lastAutoSearchKeyRef.current = '';
  }, [isOpen]);

  const overlayNodes = (
    <>
      <Toast
        message={shareToastVisible ? { id: 'share-copied', text: text.copiedUrl } : null}
        isLight={isLight}
        durationMs={2000}
        onDismiss={() => setShareToastVisible(false)}
      />
      {dragState && (
        <div
          className={`pointer-events-none fixed z-[80] rounded-2xl px-4 py-3 text-left text-sm shadow-2xl ${
            isLight ? 'border border-slate-200 bg-white text-slate-900 shadow-slate-300/50' : 'border border-blue-500 bg-slate-900 text-white shadow-blue-950/40'
          }`}
          style={{
            left: dragState.x,
            top: dragState.y,
            width: dragState.width,
            height: dragState.height,
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate font-semibold">{dragState.location.label}</div>
              <div className="mt-0.5 text-xs text-slate-500">
                {dragState.location.kind === 'stop' ? text.selectedStop : text.selectedAddress}
              </div>
            </div>
            <span className="text-xs uppercase tracking-[0.18em] text-slate-400">
              {dragState.location.kind === 'stop' ? text.stopKind : text.addressKind}
            </span>
          </div>
        </div>
      )}
    </>
  );

  const [pageDirection, setPageDirection] = useState<'forward' | 'back'>('forward');
  const hadItineraryRef = useRef(false);

  useEffect(() => {
    const has = Boolean(_selectedItinerary);
    if (has !== hadItineraryRef.current) setPageDirection(has ? 'forward' : 'back');
    hadItineraryRef.current = has;
  }, [_selectedItinerary]);

  const pageKey = `${_selectedItinerary ? 'detail' : 'list'}-${pageDirection}`;

  const panelTheme: 'light' | 'dark' = isMobile ? (theme === 'light' ? 'light' : 'dark') : 'dark';
  const pageAnimationClass = pageDirection === 'forward' ? 'gl-page-forward' : 'gl-page-back';

  const [headerHidden, setHeaderHidden] = useState(false);
  const lastScrollRef = useRef(0);

  const handleBodyScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const top = event.currentTarget.scrollTop;
    const previous = lastScrollRef.current;
    lastScrollRef.current = top;
    if (top < 24) setHeaderHidden(false);
    else if (top > previous + 4) setHeaderHidden(true);
    else if (top < previous - 8) setHeaderHidden(false);
  }, []);

  useEffect(() => {
    setHeaderHidden(false);
    lastScrollRef.current = 0;
  }, [_selectedItinerary]);

  const mobileHeaderNode = (
    <header
      className="flex-shrink-0 overflow-hidden transition-[max-height,opacity] duration-200 ease-out"
      style={{
        paddingTop: safeTop,
        maxHeight: headerHidden ? 0 : 200,
        opacity: headerHidden ? 0 : 1,
      }}
    >
      {_selectedItinerary && !sharedRouteExpired ? (
        <div className="flex items-center gap-2 px-3 pb-2">
          <button
            type="button"
            onClick={() => _onItinerarySelected?.(null)}
            className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full transition active:scale-95 ${
              isLight ? 'bg-slate-100 text-slate-700' : 'bg-white/10 text-white'
            }`}
            aria-label={text.selectRoute}
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </button>

          <div className="flex-1" />

          {onStartNavigation && !_selectedItinerary.shared && !_selectedItinerary.uber && (
            <button
              type="button"
              onClick={onStartNavigation}
              className="flex h-11 flex-shrink-0 items-center gap-1.5 rounded-full bg-blue-600 px-4 text-[0.9375rem] font-bold text-white transition active:scale-95 active:bg-blue-700"
            >
              <PlayIcon className="h-4 w-4" />
              Go
            </button>
          )}

          <button
            type="button"
            onClick={copyShareUrl}
            className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full transition active:scale-95 ${
              isLight ? 'bg-slate-100 text-slate-700' : 'bg-white/10 text-white'
            }`}
            aria-label={text.shareJourney}
          >
            <ArrowUpOnSquareIcon className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label={text.close}
            className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full transition active:scale-95 ${
              isLight ? 'bg-slate-100 text-slate-700' : 'bg-white/10 text-white'
            }`}
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
      ) : (
        <div className="h-2" />
      )}
    </header>
  );

  const desktopHeaderNode = (
      <div className={`flex items-center justify-between px-4 py-3 ${headerSurfaceClass}`}>
        {sharedRouteExpired ? (
          <>
            <div>
              <div className={`text-sm font-semibold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>{text.title}</div>
              <div className="text-xs text-slate-500">{text.shareJourney}</div>
            </div>
            <button onClick={onClose} className={`flex h-10 w-10 items-center justify-center transition ${isLight ? 'text-slate-600 hover:text-blue-600' : 'text-slate-300 hover:text-blue-300'}`} aria-label={text.close}>
              <XMarkIcon className="h-5 w-5" />
            </button>
          </>
        ) : _selectedItinerary ? (
          <>
            <button
              onClick={() => _onItinerarySelected?.(null)}
              className={`rounded-full ${isMobile ? 'p-2.5' : 'p-2'} transition ${
                isLight ? 'bg-white text-slate-700 hover:bg-slate-100' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <ArrowLeftIcon className="w-5 h-5" />
            </button>
            <div className={`text-sm font-semibold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
              {language === 'fr' ? 'Trajet' : 'Journey'}
            </div>
            <button
              type="button"
              onClick={copyShareUrl}
              className={`flex ${isMobile ? 'h-11 w-11' : 'h-10 w-10'} items-center justify-center transition ${isLight ? 'text-slate-600 hover:text-blue-600' : 'text-slate-300 hover:text-blue-300'}`}
              aria-label={text.shareJourney}
              title={text.shareJourney}
            >
              <ArrowUpOnSquareIcon className="h-5 w-5" />
            </button>
          </>
        ) : (
          <>
            <div>
              <div className={`text-sm font-semibold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>{text.title}</div>
              <div className="text-xs text-slate-500">{text.choosePoint}</div>
            </div>
            <button onClick={onClose} className={`rounded-full ${isMobile ? 'p-2.5' : 'p-2'} transition ${isLight ? 'bg-white text-slate-700 hover:bg-slate-100' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}`}>
              <XMarkIcon className="w-5 h-5" />
            </button>
          </>
        )}
      </div>
  );

  const renderMobileEndpoint = (field: 'from' | 'to') => {
    const isFrom = field === 'from';
    const selection = isFrom ? fromSelection : toSelection;
    const query = isFrom ? fromQuery : toQuery;
    const suggestions = isFrom ? fromSuggestions : toSuggestions;
    const onQueryChange = isFrom ? handleFromQueryChange : handleToQueryChange;
    const onSelect = isFrom ? handleSelectFrom : handleSelectTo;
    const caption = isFrom ? text.from : text.to;
    const surface = isLight
      ? 'border-slate-200 bg-white text-slate-900 placeholder:text-slate-400'
      : 'border-slate-800 bg-slate-900 text-white placeholder:text-slate-500';

    return (
      <div className="relative">
        {selection ? (
          <button
            type="button"
            onClick={() => clearRouteLocation(field, selection)}
            className={`flex h-14 w-full items-center rounded-2xl border pl-4 pr-12 text-left transition active:scale-[0.99] ${surface}`}
          >
            {selection.id === CURRENT_POSITION_ID ? (
              <span className="inline-flex w-fit min-w-0 max-w-full items-center rounded-2xl bg-blue-500/15 px-3 py-1.5 text-[0.95rem] font-semibold text-blue-500">
                <span className="min-w-0 truncate">{selection.label}</span>
              </span>
            ) : (
              <span className="min-w-0 truncate text-[0.95rem] font-semibold">{selection.label}</span>
            )}
          </button>
        ) : (
          <input
            value={query}
            onChange={event => onQueryChange(event.target.value)}
            placeholder={caption}
            enterKeyHint="search"
            className={`h-14 w-full rounded-2xl border pl-4 text-base outline-none transition focus:border-blue-500 ${surface} ${
              currentLocation ? 'pr-[5.5rem]' : 'pr-14'
            }`}
          />
        )}

        {selection ? (
          <span
            aria-hidden
            className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
          >
            <XMarkIcon className="h-5 w-5" />
          </span>
        ) : (
          <div className="absolute inset-y-0 right-1.5 flex items-center">
            {currentLocation && (
              <button
                type="button"
                onClick={() => onSelect(currentPositionLocation(currentLocation))}
                className="flex h-11 w-11 items-center justify-center rounded-full text-slate-400 transition active:scale-90"
                aria-label={text.useCurrentLocation}
              >
                <ViewfinderCircleIcon className="h-5 w-5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onRequestPickLocation?.(field)}
              className={`flex h-11 w-11 items-center justify-center rounded-full transition active:scale-90 ${
                pickMode === field ? 'text-blue-500' : 'text-slate-400'
              }`}
              aria-label={text.chooseOnMap}
            >
              <MapPinIcon className="h-5 w-5" />
            </button>
          </div>
        )}

        {!selection && !isMobile && renderLocationSuggestions(suggestions, onSelect)}
      </div>
    );
  };

  const activeQuery = !toSelection && toQuery.trim()
    ? toQuery.trim()
    : !fromSelection && fromQuery.trim()
      ? fromQuery.trim()
      : '';
  const isSearching = isMobile && activeQuery.length > 0;
  const showOfflineResults = offline && !!fromSelection && !!toSelection;
  const activeSuggestions = !toSelection && toQuery.trim() ? toSuggestions : fromSuggestions;
  const selectActive = !toSelection && toQuery.trim() ? handleSelectTo : handleSelectFrom;

  const matchingLines = useMemo(() => {
    const query = activeQuery.toLowerCase();
    if (!query || !lineLookup) return [];
    const seen = new Set<string>();
    const found: AllLinesLine[] = [];
    for (const line of lineLookup.values()) {
      if (seen.has(line.id)) continue;
      const short = String(line.shortName ?? '').toLowerCase();
      const long = String(line.longName ?? '').toLowerCase();
      if (short === query || (query.length >= 2 && short.startsWith(query)) || (query.length >= 4 && long.startsWith(query))) {
        seen.add(line.id);
        found.push(line);
      }
      if (found.length >= 4) break;
    }
    return found;
  }, [activeQuery, lineLookup]);

  const quickRowClass = isLight
    ? 'border-slate-200 bg-white'
    : 'border-slate-800 bg-slate-900';

  const hasDestination = Boolean(toSelection);

  const showDeparture = hasDestination;

  const mobileSearchNode = (
    <div>
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          showDeparture ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
        aria-hidden={!showDeparture}
      >
        <div className={`relative z-30 min-h-0 ${showDeparture ? '' : 'overflow-hidden'}`}>
          <div className="flex items-stretch gap-2 pb-3">
            <div className="relative min-w-0 flex-1">
              {renderMobileEndpoint('from')}
              <span
                aria-hidden
                className={`pointer-events-none absolute -bottom-3 left-6 h-3 w-0.5 ${
                  isLight ? 'bg-slate-300' : 'bg-slate-700'
                }`}
              />
            </div>
            <button
              type="button"
              onClick={swapRouteEndpoints}
              className={`flex w-11 flex-shrink-0 items-center justify-center self-center rounded-full border py-3 transition active:scale-90 ${
                isLight
                  ? 'border-slate-200 bg-white text-slate-600'
                  : 'border-slate-800 bg-slate-900 text-slate-300'
              }`}
              aria-label={text.swapEndpoints}
            >
              <ArrowsUpDownIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="relative">
        <MagnifyingGlassIcon className="pointer-events-none absolute left-5 top-1/2 z-10 h-6 w-6 -translate-y-1/2 text-blue-500" />
        {toSelection ? (
          <button
            type="button"
            onClick={() => clearRouteLocation('to', toSelection)}
            className={`flex h-16 w-full items-center rounded-3xl border-2 pl-14 pr-12 text-left transition active:scale-[0.99] ${
              isLight
                ? 'border-blue-500/40 bg-blue-500/5 text-slate-900'
                : 'border-blue-500/40 bg-blue-500/10 text-white'
            }`}
          >
            <span className="min-w-0 truncate text-lg font-semibold">{toSelection.label}</span>
          </button>
        ) : (
          <input
            value={toQuery}
            onChange={event => handleToQueryChange(event.target.value)}
            placeholder={text.whereTo}
            enterKeyHint="search"
            className={`h-16 w-full rounded-3xl border-2 pl-14 pr-4 text-lg font-semibold outline-none transition ${
              isLight
                ? 'border-blue-500/40 bg-blue-500/5 text-slate-900 placeholder:font-medium placeholder:text-slate-400 focus:border-blue-500'
                : 'border-blue-500/40 bg-blue-500/10 text-white placeholder:font-medium placeholder:text-slate-400 focus:border-blue-500'
            }`}
          />
        )}
        {toSelection && (
          <span aria-hidden className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
            <XMarkIcon className="h-5 w-5" />
          </span>
        )}
      </div>
    </div>
  );

  const renderMobileActionRow = (
    key: string,
    Icon: React.ComponentType<{ className?: string }>,
    label: string,
    detail: string | undefined,
    onPress: () => void,
    onHold?: () => void,
  ) => (
    <button
      key={key}
      type="button"
      onClick={() => {
        if (holdFiredRef.current) {
          holdFiredRef.current = false;
          return;
        }
        onPress();
      }}
      onPointerDown={() => startHold(onHold)}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      onPointerCancel={cancelHold}
      onContextMenu={event => { if (onHold) event.preventDefault(); }}
      className={`flex min-h-[3.5rem] w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition active:scale-[0.99] ${quickRowClass}`}
    >
      <Icon className="h-5 w-5 flex-shrink-0 text-slate-400" />
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[0.95rem] font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>
          {label}
        </span>
        {detail && <span className="block truncate text-xs text-slate-500">{detail}</span>}
      </span>
      <ChevronRightIcon className="h-4 w-4 flex-shrink-0 text-slate-500" />
    </button>
  );

  const bodyNode = (
    <>
      {sharedRouteExpired ? (
        <div className="flex min-h-[420px] flex-col items-center justify-center px-6 text-center">
          <div className="max-w-xs">
            <div className="text-lg font-semibold text-white">{text.expiredJourney}</div>
            <button
              type="button"
              onClick={onPlanNewSharedRoute}
              className="mt-5 w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500"
            >
              {text.planNewRoute}
            </button>
          </div>
        </div>
      ) : !_selectedItinerary ? (
        <div
          key={pageKey}
          className={`space-y-4 p-4 ${isMobile ? pageAnimationClass : ''} ${isLight ? 'text-slate-900' : ''}`}
        >
        {isMobile ? (
          <div className="gl-stagger relative z-40">
            {mobileSearchNode}
          </div>
        ) : (
        <>
        <div className="relative">
          <label className={`block text-xs uppercase tracking-[0.18em] text-slate-500 mb-2 ${isMobile ? 'sr-only' : ''}`}>{text.from}</label>
          {fromSelection ? (
            renderEndpointSelection('from', fromSelection)
          ) : (
            <div className="relative">
              <input
                value={fromQuery}
                onChange={e => handleFromQueryChange(e.target.value)}
                placeholder={text.choosePoint}
                className={`w-full rounded-2xl border py-3 pl-4 text-sm outline-none focus:border-blue-500 ${
                  currentLocation ? 'pr-20' : 'pr-12'
                } ${isLight ? 'border-slate-200 bg-white text-slate-900' : 'border-slate-700 bg-slate-900 text-white'}`}
              />
              <div className="absolute inset-y-0 right-3 flex items-center gap-2">
                {currentLocation && (
                  <button
                    type="button"
                    onClick={() => handleSelectFrom(currentPositionLocation(currentLocation))}
                    className="flex cursor-pointer items-center text-slate-500 transition hover:text-blue-400"
                    aria-label={text.useCurrentLocation}
                    title={text.useCurrentLocation}
                  >
                    <ViewfinderCircleIcon className="h-5 w-5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onRequestPickLocation?.('from')}
                  className={`flex cursor-pointer items-center ${pickMode === 'from' ? 'text-blue-400' : 'text-slate-500'}`}
                  aria-label="Pick origin on map"
                >
                  <MapPinIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
          {!fromSelection && renderLocationSuggestions(fromSuggestions, handleSelectFrom)}
        </div>

        <div className="relative">
          <div className="mb-2 flex items-center justify-between gap-3">
            <label className={`block text-xs uppercase tracking-[0.18em] text-slate-500 ${isMobile ? 'sr-only' : ''}`}>{text.to}</label>
            <button
              type="button"
              onClick={swapRouteEndpoints}
              className="flex h-8 w-8 items-center justify-center text-slate-400 transition hover:text-blue-300"
              aria-label={text.swapEndpoints}
              title={text.swapEndpoints}
            >
              <ArrowsUpDownIcon className="h-4 w-4" />
            </button>
          </div>
          {toSelection ? (
            renderEndpointSelection('to', toSelection)
          ) : (
            <div className="relative">
              <input
                value={toQuery}
                onChange={e => handleToQueryChange(e.target.value)}
                placeholder={text.choosePoint}
                className={`w-full rounded-2xl border border-slate-700 bg-slate-900 py-3 pl-4 text-sm text-white outline-none focus:border-blue-500 ${
                  currentLocation ? 'pr-20' : 'pr-12'
                }`}
              />
              <div className="absolute inset-y-0 right-3 flex items-center gap-2">
                {currentLocation && (
                  <button
                    type="button"
                    onClick={() => handleSelectTo(currentPositionLocation(currentLocation))}
                    className="flex cursor-pointer items-center text-slate-500 transition hover:text-blue-400"
                    aria-label={text.useCurrentLocation}
                    title={text.useCurrentLocation}
                  >
                    <ViewfinderCircleIcon className="h-5 w-5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onRequestPickLocation?.('to')}
                  className={`flex cursor-pointer items-center ${pickMode === 'to' ? 'text-blue-400' : 'text-slate-500'}`}
                  aria-label="Pick destination on map"
                >
                  <MapPinIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
          {!toSelection && renderLocationSuggestions(toSuggestions, handleSelectTo)}
        </div>
        </>
        )}

        {isSearching && (
          <div className="-mx-4">
            <SearchResultsList
              lines={matchingLines}
              stops={activeSuggestions.filter(suggestion => suggestion.kind === 'stop')}
              addresses={activeSuggestions.filter(suggestion => suggestion.kind === 'address')}
              language={language}
              isLight={isLight}
              trafficInfo={trafficInfo}
              onSelectLocation={selectActive}
              onSelectLine={onOpenLine}
            />
          </div>
        )}

        {isMobile && !isSearching && currentResults.length === 0 && !showOfflineResults && (
          <>
            <div className="gl-stagger relative z-0 space-y-2" style={{ animationDelay: '40ms' }}>
              {renderMobileActionRow('map', MapPinIcon, text.chooseOnMap, undefined, () => onRequestPickLocation?.('to'))}
              {(['home', 'work'] as const).map(kind => {
                const place = savedPlaces[kind];
                return renderMobileActionRow(
                  kind,
                  kind === 'home' ? HomeIcon : BriefcaseIcon,
                  kind === 'home' ? text.homeLabel : text.workLabel,
                  place?.label,
                  () => (place ? handleSelectTo(place) : openPlaceSheet(kind)),
                  place ? () => openPlaceSheet(kind) : undefined,
                );
              })}
            </div>

            <div className="gl-stagger" style={{ animationDelay: '70ms' }}>
              <h3
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  letterSpacing: 'normal',
                  textTransform: 'none',
                  color: isLight ? '#0f172a' : '#ffffff',
                  margin: '0 0 12px',
                  paddingLeft: 4,
                }}
              >
                {text.visitTitle}
              </h3>
              <PlacesCarousel
                language={language}
                isLight={isLight}
                onNavigate={place =>
                  handleSelectTo({
                    id: `place:${place.id}`,
                    label: place.title,
                    lat: place.lat,
                    lon: place.lon,
                    kind: 'address',
                  })
                }
              />
            </div>

            {recentPlaces.length > 0 && (
              <div className="gl-stagger space-y-2" style={{ animationDelay: '80ms' }}>
                <h3
                  style={{
                    fontSize: '15px',
                    fontWeight: 700,
                    letterSpacing: 'normal',
                    textTransform: 'none',
                    color: isLight ? '#0f172a' : '#ffffff',
                    margin: '0 0 4px',
                    paddingLeft: 4,
                  }}
                >
                  {text.recents}
                </h3>
                {recentPlaces.slice(0, 5).map(place => renderMobileActionRow(
                  `recent-${place.kind}-${place.id}`,
                  place.kind === 'stop' ? TbBusStop : ClockIcon,
                  place.label,
                  place.raw?.context || place.raw?.city || undefined,
                  () => handleSelectTo(place),
                ))}
              </div>
            )}
          </>
        )}

        {pickMode && (
          <div className={`rounded-2xl border px-4 py-3 text-sm text-center ${
            isLight ? 'bg-sky-50 border-sky-200 text-sky-700' : 'bg-sky-950 border-sky-700 text-sky-200'
          }`}>
            {text.pickPointOnMap}
          </div>
        )}

        {showOfflineResults && (
          <OfflinePanel
            language={language}
            isLight={isLight}
            detail={language === 'fr'
              ? 'Le calcul d’un itinéraire a besoin du réseau. Il sera de nouveau possible dès le retour de la connexion.'
              : 'Planning a route needs the network. It will be available again as soon as you are back online.'}
          />
        )}

        {!offline && routeError && !(routeError === text.noRoutes && operatorResults.length > 0) && (
          <div className={`rounded-2xl border px-4 py-3 text-sm ${
            isLight ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-rose-950 border-rose-700 text-rose-200'
          }`}>
            {routeError}
          </div>
        )}

        <div className={`flex-col gap-2 ${offline || (isMobile && currentResults.length === 0) ? 'hidden' : 'flex'}`}>
          <div className={`relative flex ${isMobile ? 'scrollbar-hide -mx-4 gap-2 overflow-x-auto px-4' : 'items-center gap-2'}`}>
            <button
              type="button"
              onClick={openScheduleMenu}
              className={`inline-flex items-center gap-2 rounded-full font-semibold transition ${
                isMobile ? 'h-11 flex-shrink-0 px-4 text-sm active:scale-95' : 'h-10 px-4 text-sm'
              } ${
                isLight ? 'bg-white text-slate-900 hover:bg-slate-100' : 'bg-slate-900 text-slate-100 hover:bg-slate-800'
              }`}
            >
              <span>{schedulePillLabel}</span>
              <ChevronDownIcon className={`h-4 w-4 ${isLight ? 'text-slate-500' : 'text-slate-400'}`} />
            </button>
            <button
              type="button"
              onClick={() => setActiveScheduleMenu(activeScheduleMenu === 'mode' ? null : 'mode')}
              className={`inline-flex flex-shrink-0 items-center justify-center rounded-full transition ${
                isMobile ? 'h-11 w-11 active:scale-95' : 'h-10 w-10'
              } ${
                isLight ? 'bg-white text-slate-900 hover:bg-slate-100' : 'bg-slate-900 text-slate-100 hover:bg-slate-800'
              }`}
              aria-label={`${text.prefer} : ${preferenceLabel}`}
              title={`${text.prefer} : ${preferenceLabel}`}
            >
              <AdjustmentsHorizontalIcon className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={() => handleSearch({ silent: true })}
              disabled={refreshing}
              className={`inline-flex flex-shrink-0 items-center justify-center rounded-full transition disabled:opacity-50 ${
                isMobile ? 'h-11 w-11 active:scale-95' : 'h-10 w-10'
              } ${
                isLight ? 'bg-white text-slate-900 hover:bg-slate-100' : 'bg-slate-900 text-slate-100 hover:bg-slate-800'
              }`}
              aria-label={text.refreshRoutes}
              title={text.refreshRoutes}
            >
              <ArrowPathIcon className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>

            {activeScheduleMenu === 'time' && !isMobile && (
              <div
                className="absolute left-0 top-full z-20 mt-2 rounded-2xl border border-slate-700 bg-slate-900/95 p-4 shadow-2xl"
                style={{ width: 'min(330px, calc(100vw - 2rem))' }}
              >
                {scheduleBody}
              </div>
            )}

            {activeScheduleMenu === 'mode' && !isMobile && (
              <div
                className={`absolute left-28 top-full z-20 mt-2 w-64 rounded-2xl border p-3 shadow-2xl ${isLight ? 'border-slate-200 bg-white' : 'border-slate-700 bg-slate-900/95'}`}
              >
                {([
                  ['balanced', text.walkBalanced],
                  ['walk', text.preferWalk],
                  ['transit', text.preferTransit],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setWalkPreference(key)}
                    className={`w-full rounded-xl px-3 text-left font-semibold transition ${isMobile ? 'py-3.5 text-base' : 'py-2 text-sm'} ${walkPreference === key ? 'bg-blue-600 text-white' : isLight ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-300 hover:bg-slate-800'}`}
                  >
                    {label}
                  </button>
                ))}
                <div className={`mt-3 rounded-xl p-3 ${isLight ? 'bg-slate-100' : 'bg-slate-950'}`}>
                  <div className={`flex items-center justify-between text-xs font-semibold ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                    <span>{text.walkSpeed}</span>
                    <span>{walkSpeed.toFixed(1)} m/s</span>
                  </div>
                  <input
                    type="range"
                    min="0.9"
                    max="1.8"
                    step="0.1"
                    value={walkSpeed}
                    onChange={e => setWalkSpeed(Number(e.target.value))}
                    className="mt-3 w-full accent-blue-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setSetting('pmrRouting', !wheelchairRouting)}
                  aria-pressed={wheelchairRouting}
                  className={`mt-3 flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold transition ${
                    wheelchairRouting
                      ? 'bg-blue-600 text-white'
                      : isLight
                        ? 'text-slate-700 hover:bg-slate-100'
                        : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <FaWheelchair className="h-4 w-4 flex-shrink-0" />
                  {text.pmr}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveScheduleMenu(null)}
                  className={`mt-3 w-full rounded-xl px-3 font-semibold transition ${isMobile ? 'py-3.5 text-base' : 'py-2 text-sm'} ${isLight ? 'bg-slate-100 text-slate-800 hover:bg-slate-200' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}
                >
                  OK
                </button>
              </div>
            )}
          </div>
        </div>

        {!offline && isMobile && currentResults.length > 0 && (
          <div className="gl-stagger" style={{ animationDelay: '60ms' }}>
            <JourneyResults
              journeys={currentResults}
              language={language}
              stops={stops}
              lineLookup={lineLookup}
              theme={panelTheme}
              selected={selectedItinerary}
              onSelect={itinerary => _onItinerarySelected?.(itinerary)}
            />
          </div>
        )}

        {!offline && !isMobile && currentResults.length > 0 && (
          <div className="pt-2">
            <JourneyResults
              journeys={currentResults}
              language={language}
              stops={stops}
              lineLookup={lineLookup}
              theme={panelTheme}
              selected={selectedItinerary}
              onSelect={handleResultTap}
            />
          </div>
        )}

        {!offline && !routeLoading && !routeError && currentResults.length === 0 && fromSelection && toSelection && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-4 text-sm text-slate-400">
            {text.noRoutes}
          </div>
        )}
        </div>
      ) : (
        _selectedItinerary && (
          <div
            key={pageKey}
            className={`${pageAnimationClass} px-5 pb-10 pt-2`}
          >
            <JourneyDetail
              journey={_selectedItinerary as RouteItinerary}
              label={selectedLabel}
              language={language}
              stops={stops}
              lineLookup={lineLookup}
              theme={panelTheme}
              trafficInfo={trafficInfo}
            />
          </div>
        )
      )}
    </>
  );

  const creditNode = null;

  if (isMobile) {
    const isPicking = Boolean(pickMode) && !isPicker;
    const isPanelVisible = isOpen && (isPicker || !isPicking);
    const showPickerBar = isPicker && currentResults.length > 0;

    return (
      <>
        {overlayNodes}

        <MapSheet
          isOpen={activeScheduleMenu === 'mode'}
          onClose={closeScheduleMenu}
          isLight={isLight}
          zIndex={1100}
        >
          <div className="px-4 pb-6">
            <SectionRule label={text.walkPriority} isLight={isLight} />
            <StepSlider
              count={WALK_PRIORITIES.length}
              value={priorityIndex}
              emoji={WALK_PRIORITIES[priorityIndex].emoji}
              color="#3b82f6"
              ariaLabel={text.walkPriority}
              onChange={index => setWalkPreference(PRIORITY_KEYS[index])}
            />
            <p className={`mt-2 text-center text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
              {WALK_PRIORITIES[priorityIndex].label(isFr)}
            </p>
            <p className="mb-6 mt-0.5 text-center text-xs text-slate-400">
              {WALK_PRIORITIES[priorityIndex].hint(isFr)}
            </p>

            <SectionRule label={text.walkSpeed} isLight={isLight} />
            <StepSlider
              count={WALK_SPEEDS.length}
              value={speedIndex}
              emoji={WALK_SPEEDS[speedIndex].emoji}
              color="#22c55e"
              ariaLabel={text.walkSpeed}
              onChange={index => setWalkSpeed(WALK_SPEEDS[index].kmh / 3.6)}
            />
            <p className={`mt-2 text-center text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
              {WALK_SPEEDS[speedIndex].label(isFr)}
            </p>
            <p className="tabular mt-0.5 text-center text-xs text-slate-400">
              {WALK_SPEEDS[speedIndex].kmh.toLocaleString('fr-FR', { minimumFractionDigits: 1 })} km/h
            </p>

            <SectionRule label={text.pmr} isLight={isLight} />
            <button
              type="button"
              onClick={() => setSetting('pmrRouting', !wheelchairRouting)}
              aria-pressed={wheelchairRouting}
              className="flex w-full items-center gap-3 py-2.5 text-left"
            >
              <span
                className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border transition ${
                  wheelchairRouting
                    ? 'border-blue-600 bg-blue-600'
                    : isLight
                      ? 'border-slate-300'
                      : 'border-slate-600'
                }`}
              >
                {wheelchairRouting && <CheckIcon className="h-3.5 w-3.5 text-white" />}
              </span>
              <FaWheelchair
                className={`h-4 w-4 flex-shrink-0 ${wheelchairRouting ? 'text-blue-500' : 'text-slate-400'}`}
              />
              <span
                className={`text-sm ${
                  wheelchairRouting ? (isLight ? 'text-slate-900' : 'text-white') : 'text-slate-400'
                }`}
              >
                {text.pmr}
              </span>
            </button>
            <p className="pb-2 text-xs leading-snug text-slate-500">{text.pmrHint}</p>

            <SectionRule label={isFr ? 'Réseaux' : 'Networks'} isLight={isLight} />
            <div className="pt-1">
              {ROUTE_NETWORKS.map(network => {
                const active = routeNetworks.includes(network.code);
                return (
                  <button
                    key={network.code}
                    type="button"
                    onClick={() => toggleRouteNetwork(network.code)}
                    aria-pressed={active}
                    className="flex w-full items-center gap-3 py-2.5 text-left"
                  >
                    <span
                      className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border transition ${
                        active
                          ? 'border-blue-600 bg-blue-600'
                          : isLight
                            ? 'border-slate-300'
                            : 'border-slate-600'
                      }`}
                    >
                      {active && <CheckIcon className="h-3.5 w-3.5 text-white" />}
                    </span>
                    <span
                      className={`text-sm ${
                        active
                          ? isLight
                            ? 'text-slate-900'
                            : 'text-white'
                          : 'text-slate-400'
                      }`}
                    >
                      {network.label}
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="pb-2 pt-6 text-center text-[0.6875rem] leading-snug text-slate-500">
              {isFr
                ? 'Ces réglages sont conservés sur cet appareil et servent au calcul de vos prochains itinéraires.'
                : 'These settings stay on this device and shape your next journeys.'}
            </p>
          </div>
        </MapSheet>

        <MapSheet
          isOpen={activeScheduleMenu === 'time'}
          onClose={closeScheduleMenu}
          isLight={isLight}
          zIndex={1100}
        >
          <div className="px-4 pb-6">{scheduleBody}</div>
        </MapSheet>

        {isOpen && isPicking && (
            <div
              className="gl-drop fixed inset-x-0 top-0 z-[1000] px-3"
              style={{ paddingTop: safeTop }}
            >
              <div
                className={`flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-2xl ${
                  isLight
                    ? 'border-slate-200 bg-white/95 text-slate-900 shadow-slate-400/30'
                    : 'border-slate-800 bg-slate-950/95 text-white shadow-black/50'
                } backdrop-blur`}
              >
                <MapPinIcon className="h-5 w-5 flex-shrink-0 text-blue-500" />
                <span className="min-w-0 flex-1 text-sm font-semibold">{text.tapPointOnMap}</span>
                <button
                  type="button"
                  onClick={onCancelPickLocation}
                  className="flex-shrink-0 rounded-full px-3 py-2 text-sm font-bold text-blue-500 transition active:scale-95"
                >
                  {text.cancel}
                </button>
              </div>
            </div>
          )}

        <div
          className={`fixed inset-0 z-[1000] flex flex-col origin-bottom transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            isPicker
              ? isPanelVisible
                ? 'translate-x-0'
                : 'translate-x-full'
              : isPanelVisible
              ? 'translate-y-0 scale-100 opacity-100'
              : 'translate-y-full scale-100'
          } ${isLight ? 'bg-slate-50 text-slate-900' : 'bg-slate-950 text-white'}`}
          style={{
            pointerEvents: isPanelVisible ? 'auto' : 'none',
            transform: dragY > 0 && !isPicker ? `translateY(${dragY}px)` : undefined,
            transition: dragY > 0 && !isPicker
              ? 'none'
              : 'transform 320ms cubic-bezier(0.32,0.72,0,1), opacity 160ms linear 160ms',
          }}
          aria-hidden={!isPanelVisible}
        >
          {isPicker ? (
            <header
              className="flex flex-shrink-0 items-center gap-1 px-2 pb-1"
              style={{ paddingTop: safeTop }}
            >
              <button
                type="button"
                onClick={onClose}
                aria-label={text.close}
                className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full transition active:scale-95 ${
                  isLight ? 'text-slate-700 active:bg-slate-200' : 'text-slate-200 active:bg-slate-800'
                }`}
              >
                <ArrowLeftIcon className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1">
                <div className={`truncate text-base font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  {text.pickerTitle}
                </div>
                <div className="truncate text-xs text-slate-500">{text.pickerHint}</div>
              </div>
            </header>
          ) : (
            mobileHeaderNode
          )}

          <div
            className="pointer-events-none absolute inset-0 z-[60] flex items-start justify-center transition-opacity duration-150"
            style={{
              opacity: isDragHintVisible ? 1 : 0,
              backgroundColor: isLight ? 'rgba(148,163,184,0.55)' : 'rgba(var(--gl-ink-rgb), 0.62)',
              backdropFilter: 'grayscale(1)',
              paddingTop: '28vh',
            }}
            aria-hidden
          >
            <div className="flex flex-col items-center gap-2">
              <ArrowDownIcon
                className={`h-8 w-8 ${isLight ? 'text-slate-700' : 'text-white'}`}
                style={{
                  transform: `translateY(${Math.min(dragY / 6, 14)}px)`,
                  transition: 'transform 80ms linear',
                }}
              />
              <span className={`text-sm font-bold ${isLight ? 'text-slate-800' : 'text-white'}`}>
                {text.dragToClose}
              </span>
            </div>
          </div>

          <div
            ref={scrollerRef}
            key={openSeq}
            className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
            onScroll={handleBodyScroll}
            onPointerDown={isPicker ? undefined : handleDragStart}
            onPointerMove={isPicker ? undefined : handleDragMove}
            onPointerUp={isPicker ? undefined : handleDragEnd}
            onPointerCancel={isPicker ? undefined : handleDragEnd}
          >
            {bodyNode}
            {creditNode}
            {isMobile && !showPickerBar && (
              <div
                aria-hidden
                style={{ height: `calc(${NAVBAR_SNAP_PX + NAVBAR_LIFT_PX + SHEET_PADDING}px + env(safe-area-inset-bottom))` }}
              />
            )}
          </div>

          {showPickerBar && (
            <div
              className={`flex-shrink-0 border-t px-4 pt-3 ${
                isLight ? 'border-slate-200 bg-white/95' : 'border-slate-800 bg-slate-950/95'
              } backdrop-blur`}
              style={{ paddingBottom: safeBottom }}
            >
              <button
                type="button"
                onClick={() => onPickJourney?.(null)}
                className="w-full rounded-2xl bg-blue-600 py-4 text-sm font-bold text-white transition active:scale-[0.98]"
              >
                {text.pickerAdd}
              </button>
            </div>
          )}

        </div>

        <SavedPlaceSheet
          kind={placeSheet.kind}
          isOpen={placeSheet.open}
          stops={stops}
          language={language}
          theme={theme}
          onClose={closePlaceSheet}
          onSelect={(kind, location) => {
            setSavedPlaces(setSavedPlace(kind, location));
            closePlaceSheet();
          }}
          onPickOnMap={kind => {
            closePlaceSheet();
            onRequestPickLocation?.(kind);
          }}
        />
      </>
    );
  }

return (
      <motion.div
        initial={false}
        animate={{ x: isOpen ? 0 : 400, opacity: isOpen ? 1 : 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-md"
        style={{ height: '100vh' }}
      >
        <div className="h-screen w-full max-w-md overflow-y-auto border-l border-slate-800 bg-slate-950 pb-24 shadow-2xl" style={{ height: '100vh' }}>
          {overlayNodes}
          {desktopHeaderNode}
          {bodyNode}
          {creditNode}
        </div>
      </motion.div>
    );
};
