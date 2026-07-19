import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Sheet } from 'react-modal-sheet';
import { XMarkIcon, MapPinIcon, ArrowLeftIcon, ArrowPathIcon, ChevronDownIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, ArrowsUpDownIcon, StopCircleIcon } from '@heroicons/react/24/solid';
import { ArrowUpOnSquareIcon } from '@heroicons/react/24/outline';
import { FaBus, FaTrain, FaWalking } from 'react-icons/fa';
import { LineBadge } from './LineBadge';
import { JourneyDetailsPreview } from './JourneyDetailsPreview';
import { searchAddresses } from '../services/geocoding';
import { planItineraries, type RouteItinerary, type RouteLocation } from '../services/api';
import type { AllLinesLine } from '../services/allLines';
import { resolveRouteLine } from '../utils/routeLineResolver';
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
  onRouteReset?: () => void;
  lineLookup?: Map<string, AllLinesLine> | null;
  trafficInfo?: Map<string, TrafficDetail[]>;
  pickMode?: 'from' | 'to' | null;
  onRequestPickLocation?: (field: 'from' | 'to') => void;
  isMobile: boolean;
  sharedRouteExpired?: boolean;
  sharedRouteTarget?: {
    dep?: string;
    arr?: string;
    dur?: string;
  } | null;
  onPlanNewSharedRoute?: () => void;
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
    pickPointOnMap: isFr ? 'Cliquez sur la carte pour choisir un point' : 'Click on the map to pick a point',
    leaveNow: isFr ? 'Partir maintenant' : 'Leave now',
    refreshRoutes: isFr ? 'Rafraîchir les itinéraires' : 'Refresh routes',
    expectedDeparture: isFr ? 'Départ prévu à' : 'Expected departure',
    estimatedArrival: isFr ? "Heure d'arrivée estimée :" : 'Estimated arrival:',
    extraSteps: (count: number) => isFr ? `+${count} étapes supplémentaires` : `+${count} more steps`,
    madeBy: isFr ? 'Réalisé par' : 'Made by',
    departAt: isFr ? 'Départ' : 'Depart',
    arriveAt: isFr ? 'Arrivée' : 'Arrive',
    now: isFr ? 'Maintenant' : 'Now',
    schedule: isFr ? 'Date et heure' : 'Date and time',
    prefer: isFr ? 'Préférer' : 'Prefer',
    walkBalanced: isFr ? 'Équilibré' : 'Balanced',
    preferWalk: isFr ? 'Plus de marche' : 'More walking',
    preferTransit: isFr ? 'Moins de marche' : 'Less walking',
    walkSpeed: isFr ? 'Vitesse de marche' : 'Walking speed',
    copiedUrl: isFr ? 'URL copié' : 'URL copied',
    shareJourney: isFr ? 'Partager le trajet' : 'Share journey',
    expiredJourney: isFr ? 'Malheureusement, ce trajet est dépassé.' : 'Unfortunately, this journey has expired.',
    planNewRoute: isFr ? 'Planifier un nouveau trajet' : 'Plan a new journey',
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

const formatMinutesCompact = (minutes: number) => {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h${String(mins).padStart(2, '0')}`;
};

const formatDurationLabel = (value: string) => {
  const minutes = Number(String(value).match(/\d+/)?.[0] || 0);
  return minutes > 0 ? formatMinutesCompact(minutes) : value;
};

export const RouteSidebar = ({ isOpen, onClose, stops, language, isMobile, routeFrom, routeTo, onLocationSelected, onLocationCleared, selectedItinerary, onItinerarySelected, lineLookup, trafficInfo, pickMode, onRequestPickLocation, sharedRouteExpired, sharedRouteTarget, onPlanNewSharedRoute }: RouteSidebarProps) => {
  const text = getText(language);
  const initialDate = useMemo(() => new Date(), []);
  const [fromQuery, setFromQuery] = useState('');
  const [toQuery, setToQuery] = useState('');
  const [fromSuggestions, setFromSuggestions] = useState<RouteLocation[]>([]);
  const [toSuggestions, setToSuggestions] = useState<RouteLocation[]>([]);
  const [fromSelection, setFromSelection] = useState<RouteLocation | null>(null);
  const [toSelection, setToSelection] = useState<RouteLocation | null>(null);
  const [routeResults, setRouteResults] = useState<RouteItinerary[]>([]);
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
  const [walkPreference, setWalkPreference] = useState<'balanced' | 'walk' | 'transit'>('balanced');
  const [walkSpeed, setWalkSpeed] = useState(1.4);
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

  const calendarCells = useMemo(() => buildCalendarCells(calendarMonth), [calendarMonth]);
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

  useEffect(() => {
    if (!fromQuery || fromSelection?.label !== fromQuery) {
      setFromSelection(null);
    }
  }, [fromQuery]);

  useEffect(() => {
    if (!toQuery || toSelection?.label !== toQuery) {
      setToSelection(null);
    }
  }, [toQuery]);

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

  const canSearch = !!fromSelection && !!toSelection;

  const handleSearch = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!canSearch || !fromSelection || !toSelection) {
      setRouteError(text.routeError);
      return;
    }
    setRouteError(null);
    if (!options.silent) {
      setRouteLoading(true);
    }
    const queryDate = scheduleIsNow ? formatDateInput(new Date()) : scheduleDate;
    const queryTime = scheduleIsNow ? formatTimeInput(new Date()) : scheduleTime;
    if (!options.silent) {
      setRouteResults([]);
      _onItinerarySelected?.(null);
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
        walkReluctance,
        walkSpeed,
      });
      setRouteResults(itineraries);
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
    text.routeError,
    text.noRoutes,
    _onItinerarySelected,
    sharedRouteTarget,
    sharedRouteExpired,
  ]);

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
    setRouteResults([]);
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
    setRouteResults([]);
  };

  const handleEndpointPointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    field: 'from' | 'to',
    location: RouteLocation,
  ) => {
    if (!fromSelection || !toSelection || event.button !== 0) return;
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
    const isDragging = dragState?.field === field;
    const isDropTarget = dragState != null && dragState.field !== field && dragOverEndpoint === field;
    const canDrag = Boolean(fromSelection && toSelection);

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
        className={`w-full rounded-2xl border bg-slate-900 px-4 py-3 text-left text-sm text-white transition hover:border-blue-500 ${canDrag ? 'cursor-grab active:cursor-grabbing' : ''} ${isDropTarget ? 'border-blue-500 shadow-[0_0_0_1px_rgba(59,130,246,0.65)]' : 'border-slate-700'}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate font-semibold">{location.label}</div>
            <div className="mt-0.5 text-xs text-slate-500">
              {location.kind === 'stop' ? text.selectedStop : text.selectedAddress}
            </div>
          </div>
          <span className="text-xs uppercase tracking-[0.18em] text-slate-400">
            {location.kind === 'stop' ? text.stopKind : text.addressKind}
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

    return (
      <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-72 overflow-auto rounded-2xl border border-gray-700 bg-slate-900/95 text-sm text-slate-100 shadow-xl">
        {stopSuggestions.length > 0 && (
          <>
            <div className="border-b border-slate-800 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
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
                className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-slate-800"
              >
                <StopCircleIcon className="h-4 w-4 flex-shrink-0 text-blue-400" />
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
            <div className="border-y border-slate-800 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 first:border-t-0">
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
                className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-slate-800"
              >
                <MapPinIcon className="h-4 w-4 flex-shrink-0 text-amber-400" />
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
    const searchKey = [
      fromSelection.id,
      toSelection.id,
      scheduleMode,
      scheduleDate,
      scheduleTime,
      scheduleIsNow ? 'now' : 'custom',
      walkReluctance,
      walkSpeed,
    ].join('|');
    if (lastAutoSearchKeyRef.current === searchKey) return;
    lastAutoSearchKeyRef.current = searchKey;
    handleSearch();
    // handleSearch depends on parent callbacks that can change after the search
    // result is stored. The key above is the actual trigger for new searches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isOpen,
    fromSelection?.id,
    toSelection?.id,
    scheduleMode,
    scheduleDate,
    scheduleTime,
    scheduleIsNow,
    walkReluctance,
    walkSpeed,
  ]);

  useEffect(() => {
    if (!isOpen || !fromSelection || !toSelection || routeResults.length === 0) return;
    const refresh = window.setInterval(() => {
      handleSearch({ silent: true });
    }, 60_000);
    return () => window.clearInterval(refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, fromSelection?.id, toSelection?.id, routeResults.length]);

  const currentResults = useMemo((): RouteItinerary[] => routeResults, [routeResults]);

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
    if (isOpen) return;
    setFromQuery('');
    setToQuery('');
    setFromSuggestions([]);
    setToSuggestions([]);
    setFromSelection(null);
    setToSelection(null);
    setRouteResults([]);
    setRouteError(null);
    setRouteLoading(false);
    setPendingDrag(null);
    setDragState(null);
    setDragOverEndpoint(null);
    lastAutoSearchKeyRef.current = '';
  }, [isOpen]);

  const routeSidebarContent = (
      <div className={`w-full max-w-md bg-slate-950 ${isMobile ? 'border border-slate-800' : 'border-l border-slate-800'} shadow-2xl overflow-y-auto pb-24`} style={{ minHeight: '100vh' }}>

      {shareToastVisible && (
        <div className="pointer-events-none fixed left-1/2 top-4 z-[90] -translate-x-1/2 rounded-full border border-blue-500/40 bg-slate-900/95 px-4 py-2 text-sm font-semibold text-white shadow-2xl shadow-blue-950/40">
          {text.copiedUrl}
        </div>
      )}
      {dragState && (
        <div
          className="pointer-events-none fixed z-[80] rounded-2xl border border-blue-500 bg-slate-900 px-4 py-3 text-left text-sm text-white shadow-2xl shadow-blue-950/40"
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
      {/* Header - with back arrow when showing details */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-slate-800">
        {sharedRouteExpired ? (
          <>
            <div>
              <div className="text-sm font-semibold text-slate-200">{text.title}</div>
              <div className="text-xs text-slate-500">{text.shareJourney}</div>
            </div>
            <button onClick={onClose} className="flex h-10 w-10 items-center justify-center text-slate-300 transition hover:text-blue-300" aria-label={text.close}>
              <XMarkIcon className="h-5 w-5" />
            </button>
          </>
        ) : _selectedItinerary ? (
          <>
            <button
              onClick={() => _onItinerarySelected?.(null)}
              className="rounded-full p-2 bg-slate-900 text-slate-300 hover:bg-slate-800 transition"
            >
              <ArrowLeftIcon className="w-5 h-5" />
            </button>
            <div className="text-sm font-semibold text-slate-200">
              {language === 'fr' ? 'Trajet' : 'Journey'}
            </div>
            <button
              type="button"
              onClick={copyShareUrl}
              className="flex h-10 w-10 items-center justify-center text-slate-300 transition hover:text-blue-300"
              aria-label={text.shareJourney}
              title={text.shareJourney}
            >
              <ArrowUpOnSquareIcon className="h-5 w-5" />
            </button>
          </>
        ) : (
          <>
            <div>
              <div className="text-sm font-semibold text-slate-200">{text.title}</div>
              <div className="text-xs text-slate-500">{text.choosePoint}</div>
            </div>
            <button onClick={onClose} className="rounded-full p-2 bg-slate-900 text-slate-300 hover:bg-slate-800">
              <XMarkIcon className="w-5 h-5" />
            </button>
          </>
        )}
      </div>

      {/* Content - depends on state */}
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
        /* SEARCH MODE */
        <div className="space-y-4 p-4">
        <div className="relative">
          <label className="block text-xs uppercase tracking-[0.18em] text-slate-500 mb-2">{text.from}</label>
          {fromSelection ? (
            renderEndpointSelection('from', fromSelection)
          ) : (
            <div className="relative">
              <input
                value={fromQuery}
                onChange={e => setFromQuery(e.target.value)}
                placeholder={text.choosePoint}
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => onRequestPickLocation?.('from')}
                className={`absolute inset-y-0 right-3 flex items-center cursor-pointer ${pickMode === 'from' ? 'text-blue-400' : 'text-slate-500'}`}
                aria-label="Pick origin on map"
              >
                <MapPinIcon className="w-5 h-5" />
              </button>
            </div>
          )}
          {!fromSelection && renderLocationSuggestions(fromSuggestions, handleSelectFrom)}
        </div>

        <div className="relative">
          <div className="mb-2 flex items-center justify-between gap-3">
            <label className="block text-xs uppercase tracking-[0.18em] text-slate-500">{text.to}</label>
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
                onChange={e => setToQuery(e.target.value)}
                placeholder={text.choosePoint}
                className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => onRequestPickLocation?.('to')}
                className={`absolute inset-y-0 right-3 flex items-center cursor-pointer ${pickMode === 'to' ? 'text-blue-400' : 'text-slate-500'}`}
                aria-label="Pick destination on map"
              >
                <MapPinIcon className="w-5 h-5" />
              </button>
            </div>
          )}
          {!toSelection && renderLocationSuggestions(toSuggestions, handleSelectTo)}
        </div>

        {pickMode && (
          <div className="rounded-2xl bg-sky-950 border border-sky-700 px-4 py-3 text-sm text-sky-200 text-center">
            {text.pickPointOnMap}
          </div>
        )}

        {routeError && (
          <div className="rounded-2xl bg-rose-950 border border-rose-700 px-4 py-3 text-sm text-rose-200">
            {routeError}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <div className="relative flex items-center gap-2">
            <button
              type="button"
              onClick={openScheduleMenu}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-slate-900 px-4 text-sm font-semibold text-slate-100 transition hover:bg-slate-800"
            >
              <span>{schedulePillLabel}</span>
              <ChevronDownIcon className="h-4 w-4 text-slate-400" />
            </button>
            <button
              type="button"
              onClick={() => setActiveScheduleMenu(activeScheduleMenu === 'mode' ? null : 'mode')}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-slate-900 px-4 text-sm font-semibold text-slate-100 transition hover:bg-slate-800"
              aria-label={`${text.prefer}: ${preferenceLabel}`}
            >
              <span>{text.prefer}</span>
              <ChevronDownIcon className="h-4 w-4 text-slate-400" />
            </button>

            {activeScheduleMenu === 'time' && (
              <div className="absolute left-0 top-full z-20 mt-2 rounded-2xl border border-slate-700 bg-slate-900/95 p-4 shadow-2xl"
            style={{ width: 'min(330px, calc(100vw - 2rem))' }}>
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        closeScheduleMenu();
                      }}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-950 text-slate-300 transition hover:bg-slate-800 hover:text-white"
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
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500"
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

                    <div className="mt-4 grid grid-cols-7 gap-y-1 text-center text-[10px] font-bold uppercase text-slate-400">
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
                            className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-sm transition ${
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
                      <button
                        type="button"
                        onClick={() => setIsTimePickerOpen(open => !open)}
                        className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:border-blue-500"
                      >
                        {draftScheduleTime}
                      </button>

                      {isTimePickerOpen && (
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
              </div>
            )}

            {activeScheduleMenu === 'mode' && (
              <div className="absolute left-28 top-full z-20 mt-2 w-64 rounded-2xl border border-slate-700 bg-slate-900/95 p-3 shadow-2xl">
                {([
                  ['balanced', text.walkBalanced],
                  ['walk', text.preferWalk],
                  ['transit', text.preferTransit],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setWalkPreference(key)}
                    className={`w-full rounded-xl px-3 py-2 text-left text-sm font-semibold transition ${walkPreference === key ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
                  >
                    {label}
                  </button>
                ))}
                <div className="mt-3 rounded-xl bg-slate-950 p-3">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
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
                  onClick={() => setActiveScheduleMenu(null)}
                  className="mt-3 w-full rounded-xl bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-700"
                >
                  OK
                </button>
              </div>
            )}
          </div>
        </div>

        {currentResults.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
                {text.selectRoute}
              </div>
              <button
                type="button"
                onClick={() => handleSearch({ silent: true })}
                disabled={routeLoading}
                className="flex h-9 w-9 items-center justify-center text-slate-300 transition hover:text-blue-300 disabled:opacity-50"
                aria-label={text.refreshRoutes}
              >
                <ArrowPathIcon className={`h-4 w-4 ${routeLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            {currentResults.map((itinerary: RouteItinerary, idx) => {
              const isSelected = selectedItinerary != null && selectedItinerary.dep === itinerary.dep && selectedItinerary.arr === itinerary.arr && selectedItinerary.dur === itinerary.dur;
              const firstTransitLeg = (itinerary.allLegs || []).find((leg: any) => leg.mode !== 'WALK');
              const displayLegs = (itinerary.allLegs || [])
                .filter((leg: any) => leg.mode !== 'WALK' || Math.round((leg.duration || 0) / 60) > 0)
                .slice(0, 4);
              return (
                <button
                  key={`${itinerary.dep}-${idx}`}
                  type="button"
                  onClick={() => _onItinerarySelected?.(itinerary)}
                  className={`w-full rounded-2xl border p-3 text-left transition ${isSelected ? 'border-blue-500 bg-slate-900 shadow-[0_0_0_1px_rgba(59,130,246,0.7)]' : 'border-slate-800 bg-slate-900/80 hover:border-slate-600 hover:bg-slate-900'}`}
                >
                  <div className="min-w-0">
                      <div className="text-2xl font-bold leading-none text-white">{formatDurationLabel(itinerary.dur)}</div>
                      <div className="mt-2 space-y-0.5 text-sm leading-tight text-slate-400">
                        <div>{text.expectedDeparture} {firstTransitLeg?.startTime ? new Date(firstTransitLeg.startTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : itinerary.dep}</div>
                        <div>{text.estimatedArrival} {itinerary.arr}</div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        {displayLegs.map((leg: any, legIndex: number) => {
                          const isWalk = leg.mode === 'WALK';
                          const durationMin = Math.round((leg.duration || 0) / 60);
                          const line = resolveRouteLine({
                            routeShortName: leg.routeShortName,
                            route: leg.route,
                            routeId: leg.routeId,
                            lineLookup,
                            stops,
                          });
                          const normalized = line?.normalized || '';
                          const hasTraffic = normalized ? Boolean(trafficInfo?.has(normalized)) : false;
                          return (
                            <div key={`${leg.mode}-${legIndex}`} className="flex items-center gap-1.5">
                              {legIndex > 0 && <span className="text-[10px] text-white">▶</span>}
                              {isWalk ? (
                                <span className="inline-flex h-7 items-center gap-1 rounded-full bg-slate-800 px-2 text-xs font-semibold text-slate-400">
                                  <FaWalking className="h-3 w-3" />
                                  {formatMinutesCompact(durationMin)}
                                </span>
                              ) : line ? (
                                <>
                                  <LineBadge
                                    line={{ id: line.id, shortName: line.shortName, color: line.color, textColor: line.textColor, hasTraffic }}
                                    size="sm"
                                  />
                                  {String(leg.mode || '').toUpperCase().includes('TRAM') ? (
                                    <FaTrain className="h-5 w-5 text-slate-400" />
                                  ) : (
                                    <FaBus className="h-5 w-5 text-slate-400" />
                                  )}
                                </>
                              ) : null}
                            </div>
                          );
                        })}
                        {(itinerary.allLegs || []).length > displayLegs.length && (
                          <span className="rounded-full bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-400">+{(itinerary.allLegs || []).length - displayLegs.length}</span>
                        )}
                      </div>
                  </div>
                  {itinerary.legs.length > 0 && (
                    <div className="mt-2 text-[11px] text-slate-500">
                      {itinerary.legs.length > 3 && (
                        <span>{text.extraSteps(itinerary.legs.length - 3)}</span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {!routeLoading && !routeError && currentResults.length === 0 && fromSelection && toSelection && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-4 text-sm text-slate-400">
            {text.noRoutes}
          </div>
        )}
        </div>
      ) : (
        /* DETAILS MODE - Show selected itinerary details */
        _selectedItinerary && (
          <JourneyDetailsPreview 
            journey={_selectedItinerary as RouteItinerary} 
            language={language} 
            stops={stops}
            lineLookup={lineLookup}
            trafficInfo={trafficInfo}
          />
        )
      )}

      <div className="border-t border-slate-800 px-4 py-4 text-center text-xs text-slate-400">
        <a
          href="https://gre-go.vercel.app/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 cursor-pointer text-xs text-slate-400 transition hover:text-slate-200"
        >
          <span>{text.madeBy}</span>
          <img src="/assets/GreGoLOGO.png" alt="GreGo" className="h-4 w-auto" />
        </a>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet
        isOpen={isOpen}
        onClose={onClose}
        snapPoints={[0.95, 0.6, 0.3]}
        initialSnap={0}
        style={{ zIndex: 1000 }}
      >
        <Sheet.Container style={{ borderRadius: '24px 24px 0 0', backgroundColor: '#0f172a', zIndex: 1000 }}>
          <Sheet.Header />
          <Sheet.Content disableDrag={state => state.scrollPosition !== 'top'}>
            <div className="h-full overflow-y-auto pb-24">{routeSidebarContent}</div>
          </Sheet.Content>
        </Sheet.Container>
        <Sheet.Backdrop onTap={onClose} style={{ zIndex: 999 }} />
      </Sheet>
    );
  }

return (
      <motion.div
        initial={false}
        animate={{ x: isOpen ? 0 : 400, opacity: isOpen ? 1 : 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-md"
        style={{ minHeight: '100vh' }}
      >
        {routeSidebarContent}
      </motion.div>
    );
};
