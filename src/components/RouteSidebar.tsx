import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { XMarkIcon, MapPinIcon, ArrowLeftIcon, ArrowPathIcon, ChevronDownIcon, ChevronUpIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, ArrowsUpDownIcon, StopCircleIcon, ViewfinderCircleIcon, HomeIcon, BriefcaseIcon, MapIcon, PlayIcon, MagnifyingGlassIcon, ClockIcon, ArrowDownIcon, AdjustmentsHorizontalIcon } from '@heroicons/react/24/solid';
import { ArrowUpOnSquareIcon } from '@heroicons/react/24/outline';
import { FaWalking } from 'react-icons/fa';
import { TransportModeIcon } from './TransportModeIcon';
import { LineBadge } from './LineBadge';
import { JourneyDetailsPreview } from './JourneyDetailsPreview';
import { MapSheet } from './MapSheet';
import { StepSlider } from './StepSlider';
import { journeyFareChip } from '../utils/journeyFare';
import { JourneyTimelineList } from './JourneyTimelineList';
import { journeyOperatorBrand } from '../utils/journeyOperator';
import { searchAddresses } from '../services/geocoding';
import { planItineraries, type RouteItinerary, type RouteLocation } from '../services/api';
import { loadWalkPreferences, saveWalkPreferences, walkSpeedMs, WALK_SPEEDS, WALK_PRIORITIES } from '../services/walkPreferences';
import {
  ROUTE_NETWORKS,
  itineraryUsesOnly,
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
  onItinerariesUpdated?: (itineraries: RouteItinerary[]) => void;
  
  onStartNavigation?: () => void;
  onRouteReset?: () => void;
  lineLookup?: Map<string, AllLinesLine> | null;
  trafficInfo?: Map<string, TrafficDetail[]>;
  pickMode?: 'from' | 'to' | SavedPlaceKind | null;
  onRequestPickLocation?: (field: 'from' | 'to' | SavedPlaceKind) => void;
  /** Abandonne le choix d'un point sur la carte, sans rien sélectionner. */
  onCancelPickLocation?: () => void;
  /** Derniers points cherchés, proposés en un geste sur l'écran d'accueil. */
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
  /** Position de l'utilisateur, quand elle est connue. */
  currentLocation?: { lat: number; lon: number } | null;
  /**
   * Le rôle du planificateur.
   *
   * `planner` : le planificateur ordinaire, celui de l'onglet Itinéraire.
   *
   * `favoritePicker` : le même écran, mais au service du choix d'un trajet
   * favori. Il entre par la droite au lieu de monter du bas — il est un cran
   * plus loin dans les favoris, pas un onglet de plus ; il ne propose pas
   * l'historique des lieux, ne se replie pas sur la carte, ne lance pas de
   * guidage ; et toucher un résultat ne l'ouvre pas mais le désigne.
   */
  variant?: 'planner' | 'favoritePicker';
  /** Un itinéraire a été désigné comme favori — `null` depuis le bouton du bas. */
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

/**
 * Le trait qui sépare deux familles de résultats.
 *
 * Un intitulé, puis un filet qui court jusqu'au bord : c'est ce qui distingue
 * une nouvelle section d'un simple titre, et cela suffit — il n'y a rien à
 * expliquer, seulement à dire qu'on change de nature de trajet.
 */
function SectionRule({ label, isLight }: { label: string; isLight: boolean }) {
  return (
    <div className="px-1 pb-2 pt-6">
      {/* Casse normale et pas d'interlettrage : les petites capitales très
          espacées sonnent comme un gabarit, là où un simple intertitre se lit
          comme une phrase du produit. Le filet passe dessous plutôt qu'à côté —
          il souligne le titre au lieu de le pousser dans un coin. */}
      <p className={`text-sm font-semibold ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
        {label}
      </p>
      <div className={`mt-2 h-px w-full ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`} />
    </div>
  );
}

export const RouteSidebar = ({ isOpen, onClose, stops, language, isMobile, routeFrom, routeTo, onLocationSelected, onLocationCleared, selectedItinerary, onItinerarySelected, onItinerariesUpdated, onStartNavigation, lineLookup, trafficInfo, pickMode, onRequestPickLocation, onCancelPickLocation, recentPlaces = [], sharedRouteExpired, sharedRouteTarget, onPlanNewSharedRoute, theme, currentLocation, variant = 'planner', onPickJourney }: RouteSidebarProps) => {
  const text = getText(language);
  const isLight = theme === 'light';
  const isPicker = variant === 'favoritePicker';
  const initialDate = useMemo(() => new Date(), []);
  /**
   * Sur téléphone, le planificateur n'est plus une feuille qu'on tire : c'est
   * une page pleine, du haut de l'écran au bas. Reste qu'un trajet se lit aussi
   * sur la carte — d'où ce repli explicite, qui fait glisser la page hors du
   * champ et laisse un bandeau pour la rappeler. C'est un bouton, pas un
   * glissement : on sait ce qu'on obtient avant de le faire.
   */
  const [mapPeek, setMapPeek] = useState(false);
  /**
   * Compteur d'ouvertures : il sert de clé pour rejouer l'arrivée en cascade.
   * Il s'incrémente pendant le rendu et non dans un effet — un effet
   * demanderait un second rendu juste pour changer une clé d'animation.
   */
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
  /** Retrait sûr sous la barre système / le geste d'accueil. */
  const safeTop = 'max(env(safe-area-inset-top), 0.5rem)';
  const safeBottom = 'max(env(safe-area-inset-bottom), 0.75rem)';
  const [fromQuery, setFromQuery] = useState('');
  const [toQuery, setToQuery] = useState('');
  const [fromSuggestions, setFromSuggestions] = useState<RouteLocation[]>([]);
  const [toSuggestions, setToSuggestions] = useState<RouteLocation[]>([]);
  const [fromSelection, setFromSelection] = useState<RouteLocation | null>(null);
  const [toSelection, setToSelection] = useState<RouteLocation | null>(null);
  const [routeResults, setRouteResults] = useState<RouteItinerary[]>([]);
  /** Une recherche est en cours, silencieuse ou non : l'icône tourne. */
  const [refreshing, setRefreshing] = useState(false);
  /**
   * Les trajets vélo + transport, demandés à part.
   *
   * Une seconde requête au planificateur, avec `BICYCLE,TRANSIT` : elle part en
   * même temps que la première et n'a donc rien de plus lent à l'écran. Le
   * planificateur y mêle aussi des trajets tout à vélo, qu'on écarte plus bas —
   * le GreLines Trip est un trajet mixte, pas une promenade.
   */
  const [bikeResults, setBikeResults] = useState<RouteItinerary[]>([]);
  // Les options en véhicule partagé arrivent après les itinéraires : elles
  // demandent la flotte des opérateurs en plus du routeur, et ne doivent pas
  // retarder l'affichage des transports en commun.
  const [sharedResults, setSharedResults] = useState<RouteItinerary[]>([]);
  const [uberResult, setUberResult] = useState<RouteItinerary | null>(null);
  const [taxiResult, setTaxiResult] = useState<RouteItinerary | null>(null);
  const [savedPlaces, setSavedPlaces] = useState<SavedPlaces>(() => getSavedPlaces());
  /**
   * Lieu en cours de définition. Le lieu reste renseigné une fois la feuille
   * refermée : elle met trois dixièmes de seconde à redescendre, et se viderait
   * de son titre avant d'être partie.
   */
  const [placeSheet, setPlaceSheet] = useState<{ kind: SavedPlaceKind; open: boolean }>(
    { kind: 'home', open: false },
  );
  const openPlaceSheet = (kind: SavedPlaceKind) => setPlaceSheet({ kind, open: true });
  const closePlaceSheet = () => setPlaceSheet(sheet => ({ ...sheet, open: false }));

  /**
   * Tirer la zone de recherche vers le bas referme la page.
   *
   * C'est le geste qui a remplacé la croix : la page suit le doigt, et passé un
   * tiers de sa hauteur elle s'en va rejoindre la barre de navigation. Le
   * défilement garde la priorité — on ne tire que depuis le haut de la liste,
   * sans quoi on ne pourrait plus remonter dans les résultats.
   */
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<number | null>(null);
  const dragYRef = useRef(0);
  const [dragY, setDragY] = useState(0);

  /*
   * L'invite à tirer.
   *
   * Le geste ne s'annonce pas : rien, sur cette page, ne dit qu'on peut la
   * refermer en la tirant vers le bas. Aux premiers pixels, la surface se
   * grise donc et le dit en toutes lettres — le contenu reste visible dessous,
   * on voit ce qu'on est en train de pousser, pas un rectangle opaque.
   *
   * Quinze pixels : plus tôt, un simple appui maladroit déclencherait le voile ;
   * plus tard, on aurait déjà tiré sans comprendre pourquoi.
   */
  const DRAG_HINT_PX = 15;
  /** Au-delà, lâcher referme la page. C'est ce que le voile promet. */
  const DRAG_CLOSE_PX = 120;
  const isDragHintVisible = dragY > DRAG_HINT_PX;

  /*
   * Une secousse au moment où le voile paraît, et une seule.
   *
   * Déclenchée dans le gestionnaire de toucher lui-même, et non depuis un effet
   * qui suivrait le rendu : sur iOS le retour haptique n'est accordé que dans
   * la foulée d'un geste de l'utilisateur, et un effet React s'exécute après
   * la validation du rendu — trop tard pour que le système le rattache encore
   * au doigt qui l'a provoqué.
   */
  const hasBuzzedRef = useRef(false);

  /**
   * Le geste est écouté en tactile, pas en pointeur.
   *
   * Un doigt posé sur une zone qui défile appartient au navigateur : il fait
   * défiler, et annule les événements de pointeur dès qu'il s'y met — la page
   * ne se refermait donc jamais sur un vrai téléphone. On écoute ici les
   * touchers eux-mêmes, en refusant le défilement (`preventDefault`) tant que
   * la liste est en haut et que le doigt descend : c'est alors la page qu'on
   * tire, pas la liste.
   */
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
        // Le doigt remonte, ou la liste n'est plus en haut : elle reprend la main.
        dragStartRef.current = null;
        hasBuzzedRef.current = false;
        if (dragYRef.current !== 0) {
          dragYRef.current = 0;
          setDragY(0);
        }
        return;
      }
      if (event.cancelable) event.preventDefault();
      // Le seuil vient d'être franchi : une secousse, ici, tant que le geste
      // est encore en cours.
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

  /** À la souris, le même geste, sans conflit de défilement. */
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

  /** Appui maintenu : un demi-seconde, la durée qu'on tient sans y penser. */
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
  /*
   * L'allure et le gout pour la marche viennent des reglages conserves sur
   * l'appareil. Ils etaient repartis de zero a chaque ouverture du panneau :
   * quelqu'un qui marche vite devait le redire a chaque trajet.
   */
  const storedWalk = loadWalkPreferences();
  const [walkPreference, setWalkPreference] = useState<'balanced' | 'walk' | 'transit'>(
    storedWalk.priorityIndex <= 0 ? 'transit' : storedWalk.priorityIndex >= 2 ? 'walk' : 'balanced'
  );
  const [walkSpeed, setWalkSpeed] = useState(walkSpeedMs(storedWalk));
  /*
   * Les réseaux acceptés dans la recherche.
   *
   * Le filtre s'applique aux résultats déjà obtenus, et non à la requête :
   * décocher un réseau retire ses itinéraires sur-le-champ, sans relancer le
   * calcul ni faire patienter devant un écran vide pour un réglage qu'on est
   * peut-être en train d'essayer.
   */
  const [routeNetworks, setRouteNetworks] = useState<string[]>(loadRouteNetworks);
  const toggleRouteNetwork = (code: string) => {
    setRouteNetworks(current => {
      const next = current.includes(code)
        ? current.filter(entry => entry !== code)
        : [...current, code];
      // Tout décocher ne renverrait plus rien : le dernier réseau reste.
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
  /** Jeton de la dernière recherche de véhicules partagés, contre les réponses tardives. */
  const sharedRequestRef = useRef(0);

  const calendarCells = useMemo(() => buildCalendarCells(calendarMonth), [calendarMonth]);
  /*
   * Les rangs attendus par les curseurs.
   *
   * L'écran d'itinéraire raisonne en mots — « équilibré », « plus de marche » —
   * là où les curseurs raisonnent en positions. On traduit ici, dans les deux
   * sens, plutôt que de tenir un second état qui pourrait diverger du premier.
   */
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

  /**
   * Le contenu du choix de date et d'heure.
   *
   * Le même des deux côtés : une boîte accrochée au bouton sur ordinateur, une
   * feuille sur téléphone. Le calendrier est celui d'origine — il n'y avait
   * rien à lui reprocher — et seule l'heure change de main sur téléphone, où
   * elle passe au sélecteur du système.
   */
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
                      {/*
                        Sur téléphone, le sélecteur du système.
                        Il parle la langue de l'appareil, respecte son format
                        horaire et se manie sans rien apprendre — la roue
                        dessinée à la main reste pour l'ordinateur, où il n'y a
                        pas de sélecteur natif à ouvrir.
                      */}
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

  /**
   * Saisie au clavier : taper invalide la sélection en cours, puisque le texte
   * ne correspond plus au point choisi.
   *
   * C'était auparavant un effet sur `fromQuery` / `toQuery`. Il se déclenchait
   * aussi au montage, juste après que les points reçus du parent (clic sur la
   * carte, arrêt consulté, lien partagé) aient rempli le champ : la sélection
   * était effacée dans la foulée, et la recherche n'était relancée qu'en
   * retournant cliquer dans le champ.
   */
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

  /**
   * Sur téléphone, le départ est presque toujours l'endroit où l'on se trouve :
   * on le pose d'emblée pour n'avoir plus qu'à dire où l'on va. L'utilisateur
   * garde la main — la carte du départ s'efface d'une tape.
   */
  useEffect(() => {
    if (!isOpen || !isMobile || !currentLocation) return;
    if (fromSelection || routeFrom || fromQuery) return;
    handleSelectFrom(currentPositionLocation(currentLocation));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isMobile, currentLocation?.lat, currentLocation?.lon]);

  const canSearch = !!fromSelection && !!toSelection;

  const handleSearch = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!canSearch || !fromSelection || !toSelection) {
      setRouteError(text.routeError);
      return;
    }
    setRouteError(null);
    /*
     * Une recherche silencieuse ne vide pas la liste et n'affiche pas l'écran
     * d'attente — mais elle travaille, et le bouton doit le dire. `refreshing`
     * ne sert qu'à faire tourner son icône : sans lui, appuyer sur « actualiser »
     * ne provoquait rien de visible, et l'on appuyait trois fois.
     */
    setRefreshing(true);
    if (!options.silent) {
      setRouteLoading(true);
    }
    const queryDate = scheduleIsNow ? formatDateInput(new Date()) : scheduleDate;
    const queryTime = scheduleIsNow ? formatTimeInput(new Date()) : scheduleTime;
    if (!options.silent) {
      setRouteResults([]);
      setSharedResults([]);
      setUberResult(null);
      setTaxiResult(null);
      onItinerariesUpdated?.([]);
      _onItinerarySelected?.(null);
    }

    // Véhicules partagés et VTC : calculés en parallèle, jamais attendus. Ils
    // n'ont pas de sens en mode « arriver à » — on ne réserve pas une
    // trottinette pour dans trois heures — et sont donc simplement omis.
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
        walkReluctance,
        walkSpeed,
      });
      setRouteResults(itineraries);
      onItinerariesUpdated?.(itineraries);

      /*
       * Le vélo part de son côté.
       *
       * Requête séparée, sans `await` devant la première : les deux voyagent
       * ensemble, et le GreLines Trip se pose dans la liste dès qu'il arrive,
       * sans retarder les trajets ordinaires d'une seule milliseconde. Un échec
       * n'a aucune conséquence — la section disparaît, c'est tout.
       */
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
        mode: 'BICYCLE,TRANSIT',
      })
        .then(setBikeResults)
        .catch(() => setBikeResults([]));
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
    text.routeError,
    text.noRoutes,
    _onItinerarySelected,
    sharedRouteTarget,
    sharedRouteExpired,
  ]);

  /**
   * Toucher un résultat.
   *
   * Dans le planificateur, c'est ouvrir sa fiche. Dans le choix d'un trajet
   * favori, c'est désigner celui qu'on veut garder : la fiche n'a aucun intérêt
   * là — on ne cherche pas le chemin de ce matin, mais les deux bouts et les
   * lignes qui habilleront l'onglet.
   */
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

  /**
   * Vider les résultats, tous les résultats.
   *
   * Les options en véhicule partagé et en VTC arrivent après les transports en
   * commun, par une autre requête : oubliées ici, elles survivaient à
   * l'effacement de la destination, et l'écran d'accueil affichait une
   * trottinette et un taxi à la place de l'historique.
   */
  function clearAllResults() {
    setRouteResults([]);
    setSharedResults([]);
    setUberResult(null);
    setTaxiResult(null);
    // La requête en vol ne doit pas repeupler la liste qu'on vient de vider.
    sharedRequestRef.current += 1;
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
    // Le glisser-déposer entre les deux points reste une affaire de souris : au
    // doigt, il confisquerait le défilement de la page pour un geste que le
    // bouton d'inversion rend déjà.
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
            {/* La position courante s'annonce par ses coordonnées, sans
                étiquette : ce n'est ni un arrêt ni une adresse. */}
            {!isCurrentPosition && (
              <div className="mt-0.5 text-xs text-slate-500">
                {location.kind === 'stop' ? text.selectedStop : text.selectedAddress}
              </div>
            )}
          </div>
          {/* Le type du point cède la place à une croix au survol : cliquer la
              carte efface la sélection, encore fallait-il le dire. Les deux se
              croisent en fondu, pour que le geste se lise comme un même objet
              qui change d'état. */}
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

    // Au doigt, une suggestion se vise : les rangées sont plus hautes et le
    // libellé garde sa taille de lecture.
    const rowClass = isMobile
      ? 'flex w-full items-center gap-3 px-4 py-3.5 text-left transition active:bg-slate-800/70'
      : 'flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-slate-800';

    return (
      <div className={`absolute left-0 right-0 top-full z-50 mt-2 overflow-auto rounded-2xl border border-gray-700 bg-slate-900/95 text-sm text-slate-100 shadow-xl ${isMobile ? 'max-h-[50vh]' : 'max-h-72'}`}>
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
                className={rowClass}
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
                className={rowClass}
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
    /*
     * Un itinéraire déjà désigné ne se recalcule pas.
     *
     * Ouvrir le panneau avec un départ et une arrivée déclenchait la recherche,
     * et la recherche commence par effacer la sélection : venir d'un trajet
     * favori en ayant touché un itinéraire précis retombait donc sur la liste de
     * résultats, alors qu'on avait justement choisi.
     *
     * On ne mémorise pas la clé au passage : revenir en arrière efface la
     * sélection, et c'est à ce moment-là que la recherche doit partir.
     */
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
    ].join('|');
    if (lastAutoSearchKeyRef.current === searchKey) return;
    lastAutoSearchKeyRef.current = searchKey;
    handleSearch();
    // handleSearch depends on parent callbacks that can change after the search
    // result is stored. The key above is the actual trigger for new searches.
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
  ]);

  useEffect(() => {
    if (!isOpen || !fromSelection || !toSelection || routeResults.length === 0) return;
    const refresh = window.setInterval(() => {
      handleSearch({ silent: true });
    }, 60_000);
    return () => window.clearInterval(refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, fromSelection?.id, toSelection?.id, routeResults.length]);

  /**
   * Options sans ligne ni arrêt : véhicules partagés puis VTC. Elles ferment la
   * liste — on les regarde quand aucun transport en commun ne convient.
   */
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

  /**
   * Les résultats, rangés en trois temps.
   *
   * `transit` — la liste ordinaire, celle qu'on vient chercher.
   * `greLinesTrip` — le meilleur trajet mêlant vélo et transport, et lui seul :
   *   en proposer trois variantes noierait l'idée. On garde le plus court.
   * `others` — tout ce qui ne roule pas sur le réseau : trottinette, voiture
   *   partagée, VTC, taxi. Rangé à part parce que cela se paie.
   */
  const sections = useMemo(() => {
    const toMinutes = (itinerary: RouteItinerary): number => {
      const match = /(\d+)/.exec(itinerary.dur ?? '');
      return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
    };

    const accepted = new Set(routeNetworks);
    const kept = (itinerary: RouteItinerary) => itineraryUsesOnly(itinerary.allLegs ?? [], accepted);

    const transit = routeResults.filter(itinerary => !itinerary.bikeTransit && kept(itinerary));
    const mixed = [...routeResults, ...bikeResults].filter(
      itinerary => itinerary.bikeTransit && kept(itinerary),
    );
    const best = mixed.length
      ? mixed.reduce((shortest, candidate) =>
          toMinutes(candidate) < toMinutes(shortest) ? candidate : shortest,
        )
      : null;

    return { transit, greLinesTrip: best, others: operatorResults };
  }, [routeResults, bikeResults, operatorResults, routeNetworks]);

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

  /** La carte ne reste découverte que tant qu'il y a un trajet à y regarder. */
  useEffect(() => {
    if (!isOpen || !_selectedItinerary) setMapPeek(false);
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
      {/* La pastille commune de l'application : même dessin, même course, que
          ce soit une adresse copiée ou un message reçu. */}
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

  /**
   * En-tête du téléphone.
   *
   * En recherche, il n'y en a pas : une croix et un titre ne disaient rien que
   * l'écran ne dise déjà, et l'on referme en tirant la page vers le bas — d'où
   * la poignée, seul reste de la barre.
   *
   * Sur un trajet, il se réduit à trois choses : revenir à la liste, replier la
   * page vers la barre de navigation, partager. Sans filet en dessous : le
   * trait séparait un titre du contenu, il n'y a plus de titre.
   */
  const mobileHeaderNode = (
    <header className="flex-shrink-0" style={{ paddingTop: safeTop }}>
      {_selectedItinerary && !sharedRouteExpired ? (
        <div className="flex items-center gap-1 px-2 pb-1">
          <button
            type="button"
            onClick={() => _onItinerarySelected?.(null)}
            className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full transition active:scale-95 ${
              isLight ? 'text-slate-700 active:bg-slate-200' : 'text-slate-200 active:bg-slate-800'
            }`}
            aria-label={text.selectRoute}
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </button>

          {/* « Trajet » n'est pas un titre mais un bouton : le chevron dit où
              il mène — vers le bas, dans le bandeau posé sur la carte. Il replie
              la page comme « Voir la carte », il ne la ferme pas : on ne perd
              pas son trajet en voulant y jeter un œil. */}
          <button
            type="button"
            onClick={() => setMapPeek(true)}
            className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full py-2 transition active:scale-95 ${
              isLight ? 'text-slate-900 active:bg-slate-200' : 'text-white active:bg-slate-800'
            }`}
          >
            <ChevronDownIcon className="h-4 w-4 flex-shrink-0 text-slate-400" />
            <span className="truncate text-base font-bold">
              {language === 'fr' ? 'Trajet' : 'Journey'}
            </span>
          </button>

          <button
            type="button"
            onClick={copyShareUrl}
            className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full transition active:scale-95 ${
              isLight ? 'text-slate-700 active:bg-slate-200' : 'text-slate-200 active:bg-slate-800'
            }`}
            aria-label={text.shareJourney}
          >
            <ArrowUpOnSquareIcon className="h-5 w-5" />
          </button>
        </div>
      ) : (
        /* Pas de poignée : la page se referme en la tirant vers le bas, et une
           barre grise au-dessus de la recherche ne l'apprenait à personne. */
        <div className="h-2" />
      )}
    </header>
  );

  /* Header - with back arrow when showing details */
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

  /**
   * Un point du trajet, au téléphone, sur l'écran des résultats : un champ de
   * la hauteur d'un doigt, surmonté du mot qui dit lequel des deux il est. Pas
   * de pastille de couleur à côté — le libellé suffit, et deux points colorés
   * en tête de champ chargeaient la rangée pour ne rien dire de plus.
   * Les deux champs ont exactement la même hauteur : c'est ce qui permet au
   * bouton d'inversion de se poser pile entre eux.
   */
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
            {/* La position courante se porte comme une étiquette — elle n'a pas
                été tapée — et une tape la retire pour rendre le champ à la
                saisie. Ses angles sont ceux des champs : une pastille ronde au
                milieu de coins arrondis jurait. */}
            {selection.id === CURRENT_POSITION_ID ? (
              <span className="inline-flex w-fit min-w-0 max-w-full items-center rounded-2xl bg-blue-500/15 px-3 py-1.5 text-[0.95rem] font-semibold text-blue-500">
                <span className="min-w-0 truncate">{selection.label}</span>
              </span>
            ) : (
              /* `min-w-0` : sans lui, un élément de flex ne descend jamais sous la
                 largeur de son texte, `truncate` reste sans effet, et l'adresse
                 pousse le champ hors de l'écran — qui devient alors déplaçable
                 latéralement, comme si l'on avait zoomé. */
              <span className="min-w-0 truncate text-[0.95rem] font-semibold">{selection.label}</span>
            )}
          </button>
        ) : (
          <input
            value={query}
            onChange={event => onQueryChange(event.target.value)}
            placeholder={caption}
            enterKeyHint="search"
            /* 16 px pleins : en deçà, iOS zoome sur le champ à la première frappe. */
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
            {/* Partir d'où l'on est : le geste le plus fréquent méritait autre
                chose qu'un détour par la carte ou par la saisie. */}
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

        {!selection && renderLocationSuggestions(suggestions, onSelect)}
      </div>
    );
  };

  /** Rangée d'action du téléphone : pleine largeur, hauteur d'un doigt. */
  const quickRowClass = isLight
    ? 'border-slate-200 bg-white'
    : 'border-slate-800 bg-slate-900';

  /**
   * Une destination est posée : le bloc du départ se déplie au-dessus de la
   * barre d'arrivée, et les raccourcis cèdent la place aux itinéraires.
   */
  const hasDestination = Boolean(toSelection);

  /** Carte d'itinéraire dans la liste des résultats — ordinateur seulement. */
  const resultCardClass = (isSelected: boolean) => {
    const base = 'w-full rounded-2xl border p-3 text-left transition';
    if (isSelected) return `${base} border-blue-500 ${isLight ? 'bg-white' : 'bg-slate-900'} shadow-[0_0_0_1px_rgba(59,130,246,0.7)]`;
    return `${base} ${
      isLight
        ? 'border-slate-200 bg-white hover:border-slate-300'
        : 'border-slate-800 bg-slate-900/80 hover:border-slate-600 hover:bg-slate-900'
    }`;
  };

  /**
   * L'écran du planificateur, au téléphone. Il n'y en a qu'un.
   *
   * Une seule question s'y pose d'abord — où va-t-on ? — et un seul champ y
   * répond, assez grand et assez coloré pour qu'on ne cherche pas où taper. Le
   * départ ne s'y montre pas : c'est la position de l'utilisateur, posée
   * d'office.
   *
   * Une fois l'arrivée choisie, un bloc « départ » se déplie au-dessus d'elle
   * et pousse le reste vers le bas. C'est le même écran qui s'allonge, et non
   * un second qui remplacerait le premier : la barre d'arrivée ne bouge pas de
   * forme, elle descend simplement d'un cran.
   */
  const showDeparture = hasDestination;

  const mobileSearchNode = (
    <div>
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          showDeparture ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
        aria-hidden={!showDeparture}
      >
        {/* La marge du bas vit à l'intérieur du bloc qui se replie : posée
            dessous, elle laisserait un vide de douze pixels quand il est fermé.
            Le rognage ne vaut que pendant le repli : maintenu, il coupait la
            liste des suggestions du départ, qui doit déborder par-dessus la
            barre d'arrivée. */}
        <div className={`relative z-30 min-h-0 ${showDeparture ? '' : 'overflow-hidden'}`}>
          <div className="flex items-stretch gap-2 pb-3">
            <div className="relative min-w-0 flex-1">
              {renderMobileEndpoint('from')}
              {/* Un trait relie le départ à l'arrivée : deux champs empilés
                  restent deux champs, ce trait en fait un trajet. */}
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
        {!toSelection && renderLocationSuggestions(toSuggestions, handleSelectTo)}
      </div>
    </div>
  );

  /**
   * Une rangée d'action pleine largeur : carte, lieux enregistrés, historique.
   *
   * `onHold` répond à l'appui maintenu — c'est ainsi qu'on modifie un domicile
   * déjà enregistré. Rien ne l'annonce : un crayon à côté de chaque rangée
   * salissait la liste pour un geste qu'on ne fait qu'une fois l'an, et
   * maintenir le doigt pour modifier est un réflexe acquis ailleurs.
   */
  const renderMobileActionRow = (
    key: string,
    Icon: typeof MapPinIcon,
    label: string,
    detail: string | undefined,
    onPress: () => void,
    onHold?: () => void,
  ) => (
    <button
      key={key}
      type="button"
      onClick={() => {
        // L'appui maintenu a déjà agi : la tape qui le suit ne doit pas
        // enchaîner sur le trajet.
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
        <div className={`space-y-4 p-4 ${isLight ? 'text-slate-900' : ''}`}>
        {isMobile ? (
          /* `relative z-40` : les blocs suivants s'animent, et une animation
             crée un contexte d'empilement — sans quoi les suggestions, pourtant
             posées en z-50 dans ce bloc-ci, passaient sous les rangées
             « domicile » et « travail » qui les suivent. */
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
                {/* Partir d'où l'on est : le geste le plus fréquent méritait
                    autre chose qu'un détour par la carte ou par la saisie. */}
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

        {/* Écran d'accueil du planificateur : sans destination, on ne montre pas
            une liste vide mais les points qu'on choisit le plus souvent — la
            carte, les deux lieux enregistrés, puis les dernières recherches. */}
        {/* Les macarons restent tant qu'il n'y a pas d'itinéraire à lire :
            une arrivée sans départ n'est pas un écran de résultats, et c'est
            justement là qu'on a besoin d'un domicile ou d'un travail. */}
        {isMobile && currentResults.length === 0 && (
          <>
            <div className="gl-stagger relative z-0 space-y-2" style={{ animationDelay: '40ms' }}>
              {renderMobileActionRow('map', MapPinIcon, text.chooseOnMap, undefined, () => onRequestPickLocation?.('to'))}
              {(['home', 'work'] as const).map(kind => {
                const place = savedPlaces[kind];
                // Un lieu enregistré devient la destination ; un lieu vide
                // ouvre la feuille qui le définit. Tant qu'il est vide, la
                // rangée ne porte que son nom : « définir mon domicile » disait
                // ce que le geste fait déjà.
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

            {recentPlaces.length > 0 && (
              <div className="gl-stagger space-y-2" style={{ animationDelay: '80ms' }}>
                <h3 className="px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {text.recents}
                </h3>
                {recentPlaces.slice(0, 5).map(place => renderMobileActionRow(
                  `recent-${place.kind}-${place.id}`,
                  place.kind === 'stop' ? StopCircleIcon : ClockIcon,
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

        {/* « Aucun itinéraire » ne se dit pas quand la liste propose une
            trottinette, une voiture partagée ou un VTC : il y a bien un moyen
            d'y aller. */}
        {routeError && !(routeError === text.noRoutes && operatorResults.length > 0) && (
          <div className={`rounded-2xl border px-4 py-3 text-sm ${
            isLight ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-rose-950 border-rose-700 text-rose-200'
          }`}>
            {routeError}
          </div>
        )}

        {/* Heure de départ et préférence de marche : sur téléphone ils
            n'apparaissent qu'avec les résultats. L'écran d'accueil n'a qu'une
            question à poser — où va-t-on ? — et ces réglages ne se touchent
            qu'une fois qu'on regarde des horaires. */}
        <div className={`flex-col gap-2 ${isMobile && currentResults.length === 0 ? 'hidden' : 'flex'}`}>
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
              {/* L'icône des réglages, sans un mot : la préférence en cours se
                  lit dans les résultats, pas dans le libellé d'un bouton. */}
              <AdjustmentsHorizontalIcon className="h-5 w-5" />
            </button>

            {/* Le rafraîchissement prend la forme des autres : un macaron dans
                la même rangée, plutôt qu'une icône nue posée au-dessus de la
                liste. Trois pastilles côte à côte se lisent comme une barre de
                réglages ; une icône isolée ne se lisait comme rien. */}
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


            {/* Sur ordinateur, le choix de la date reste une boîte accrochée au
                bouton. Sur téléphone, le même contenu prend place dans une
                feuille — voir plus bas. */}
            {activeScheduleMenu === 'time' && !isMobile && (
              <div
                className="absolute left-0 top-full z-20 mt-2 rounded-2xl border border-slate-700 bg-slate-900/95 p-4 shadow-2xl"
                style={{ width: 'min(330px, calc(100vw - 2rem))' }}
              >
                {scheduleBody}
              </div>
            )}

            {/* Sur ordinateur, le menu reste une boîte accrochée au bouton.
                Sur téléphone, il devient une feuille — voir plus bas. */}
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
                  onClick={() => setActiveScheduleMenu(null)}
                  className={`mt-3 w-full rounded-xl px-3 font-semibold transition ${isMobile ? 'py-3.5 text-base' : 'py-2 text-sm'} ${isLight ? 'bg-slate-100 text-slate-800 hover:bg-slate-200' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}
                >
                  OK
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Les résultats du téléphone ne sont plus des cartes posées les unes
            sur les autres : des rangées pleine largeur, séparées par un trait
            fin. Chacune porte sa frise — qui défile du doigt quand le trajet
            est long — et, sous elle, l'heure d'arrivée et le prix. */}
        {/*
          Trois blocs, dans cet ordre : les trajets du réseau, le GreLines Trip,
          puis ce qui se paie. Plus de titre au-dessus du premier — « Sélectionnez
          un itinéraire » disait ce que la liste montre déjà. Les deux autres
          portent le leur, parce qu'ils changent de nature.
        */}
        {isMobile && currentResults.length > 0 && (
          <div className="gl-stagger -mx-4" style={{ animationDelay: '60ms' }}>
            {/*
              Une seule frise, trois catégories posées dessus.

              Une frise par bloc, c'était trois pistes de défilement et trois
              échelles : on poussait les trajets du réseau vers la droite, les
              autres restaient en place, et les mêmes heures ne tombaient plus
              à la même verticale d'un bloc à l'autre. Ici l'axe est commun,
              donc comparable, et le doigt emmène tout le tableau.
            */}
            <JourneyTimelineList
              sections={[
                { label: null, journeys: sections.transit },
                { label: text.greLinesTrip, journeys: sections.greLinesTrip ? [sections.greLinesTrip] : [] },
                { label: text.otherOptions, journeys: sections.others },
              ]}
              language={language}
              stops={stops}
              lineLookup={lineLookup}
              theme={theme}
              selected={selectedItinerary}
              onSelect={itinerary => _onItinerarySelected?.(itinerary)}
            />
          </div>
        )}

        {!isMobile && currentResults.length > 0 && (
          <div className="space-y-3 pt-2">
            {currentResults.map((itinerary: RouteItinerary, idx) => {
              const isSelected = selectedItinerary != null && selectedItinerary.dep === itinerary.dep && selectedItinerary.arr === itinerary.arr && selectedItinerary.dur === itinerary.dur;
              const fareChip = journeyFareChip(itinerary, language);
              const brand = journeyOperatorBrand(itinerary, theme === 'light' ? 'light' : 'dark');

              // Véhicule partagé ou VTC : la marque tient lieu de ligne, et la
              // carte s'en tient à ce qui décide — la marque, la durée, le prix.
              if (brand) {
                return (
                  <button
                    key={`${brand.name}-${idx}`}
                    type="button"
                    onClick={() => handleResultTap(itinerary)}
                    className={resultCardClass(isSelected)}
                  >
                    {/* Largeur bornée : un logo introuvable ou aux proportions
                        inattendues ne doit pas déformer la carte. */}
                    <img
                      src={brand.logo}
                      alt={brand.name}
                      className="mb-2 h-7 w-auto max-w-[112px] object-contain object-left"
                    />
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="text-2xl font-bold leading-none text-white">
                        {formatDurationLabel(itinerary.dur)}
                      </div>
                      {fareChip && (
                        <span className="flex-shrink-0 rounded-full bg-slate-800 px-2.5 py-1 text-xs font-bold text-slate-200">
                          {fareChip}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 space-y-0.5 text-sm leading-tight text-slate-400">
                      <div>{text.expectedDeparture} {itinerary.dep}</div>
                      <div>{text.estimatedArrival} {itinerary.arr}</div>
                    </div>
                  </button>
                );
              }

              const firstTransitLeg = (itinerary.allLegs || []).find((leg: any) => leg.mode !== 'WALK');
              const displayLegs = (itinerary.allLegs || [])
                .filter((leg: any) => leg.mode !== 'WALK' || Math.round((leg.duration || 0) / 60) > 0)
                .slice(0, 4);
              return (
                <button
                  key={`${itinerary.dep}-${idx}`}
                  type="button"
                  onClick={() => handleResultTap(itinerary)}
                  className={resultCardClass(isSelected)}
                >
                  <div className="min-w-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="text-2xl font-bold leading-none text-white">{formatDurationLabel(itinerary.dur)}</div>
                        {/* Le prix se lit à côté de la durée : c'est l'autre
                            critère de choix entre deux itinéraires. */}
                        {fareChip && (
                          <span className="flex-shrink-0 rounded-full bg-slate-800 px-2.5 py-1 text-xs font-bold text-slate-200">
                            {fareChip}
                          </span>
                        )}
                      </div>
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
                                  {/* Le mode décide seul du pictogramme : un
                                      tramway portait ici l'icône du train, et
                                      un TER celle du bus. */}
                                  <TransportModeIcon mode={leg.mode} className="h-5 w-5 text-slate-400" />
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
                  {itinerary.legs.length > 0 && !isMobile && (
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
          <div className={isMobile ? 'gl-stagger' : undefined}>
            {/* Le guidage pas-à-pas n'a de sens qu'en mobilité, et sur
                téléphone son bouton vit désormais dans la barre d'action du
                bas : il y reste sous le pouce quel que soit le défilement. La
                fiche, elle, ne porte plus que le trajet. */}
            <JourneyDetailsPreview
              journey={_selectedItinerary as RouteItinerary}
              language={language}
              stops={stops}
              lineLookup={lineLookup}
              trafficInfo={trafficInfo}
              theme={theme}
            />
          </div>
        )
      )}
    </>
  );

  /* Le bandeau « Réalisé par GreGo » a été retiré : la page d'itinéraire est
     celle de GreLines, et une signature en pied de résultats n'apprenait rien à
     qui cherche son tram. */
  const creditNode = null;

  if (isMobile) {
    const canNavigate = Boolean(
      onStartNavigation && _selectedItinerary && !_selectedItinerary.shared && !_selectedItinerary.uber,
    );
    const showActionBar = Boolean(_selectedItinerary) && !sharedRouteExpired && !isPicker;
    /**
     * Choisir un point sur la carte : la page pleine la couvrirait entièrement.
     * Elle s'efface donc le temps du geste, et un bandeau dit ce qu'on attend.
     *
     * Le choix d'un favori, lui, ne passe jamais par la carte : il n'y a rien
     * en dessous à montrer — la page des favoris n'est pas une carte.
     */
    const isPicking = Boolean(pickMode) && !isPicker;
    const isPanelVisible = isOpen && (isPicker || (!mapPeek && !isPicking));
    /** Une barre d'ajout se pose sous les résultats, tant qu'il y en a. */
    const showPickerBar = isPicker && currentResults.length > 0;

    return (
      <>
        {overlayNodes}

        {/*
          Les deux réglages du trajet prennent la forme d'une feuille.
          C'est celle de toute l'application — même poignée, mêmes paliers,
          même façon de s'en aller —, et non un panneau collé au bas de
          l'écran qui ne ressemblait qu'à lui-même.
        */}
        <MapSheet
          isOpen={activeScheduleMenu === 'mode'}
          onClose={closeScheduleMenu}
          isLight={isLight}
          /* Pas de palier imposé : on prend celui par défaut, à mi-hauteur, le
             même que la feuille de réglages du guidage. Ces réglages se
             prennent d'un pouce, sans quitter des yeux les itinéraires qui
             restent visibles derrière. */
          zIndex={1100}
        >
          <div className="px-4 pb-6">
            {/* Les mêmes curseurs que le mode guidage : une pastille qui porte
                un émoji et se traîne d'un cran à l'autre. Deux réglages de
                marche présentés de deux façons différentes dans la même
                application, c'étaient deux choses à apprendre au lieu d'une. */}
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

            {/*
              Les réseaux à retenir dans le calcul.

              Une liste, et non les plaques des réglages : celles-ci décident de
              ce que la carte affiche, ce qui n'est pas la même question. On peut
              vouloir continuer de voir les gares sans se faire proposer le
              train. Une coche à gauche du nom, comme partout ailleurs dans le
              système, suffit à dire lesquels comptent.
            */}
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

            <p className="pb-2 pt-6 text-center text-[11px] leading-snug text-slate-500">
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

        {/* Trajet choisi, page repliée : il ne reste qu'un bandeau posé sur la
            carte, qui redit l'essentiel et ramène à la fiche d'un doigt. */}
        {mapPeek && _selectedItinerary && !isPicker && (
            <div
              className="gl-rise fixed inset-x-0 bottom-0 z-[1000] px-3"
              style={{ paddingBottom: safeBottom }}
            >
              <div
                className={`flex items-center gap-2 rounded-3xl border p-2 shadow-2xl ${
                  isLight
                    ? 'border-slate-200 bg-white/95 shadow-slate-400/30'
                    : 'border-slate-800 bg-slate-950/95 shadow-black/50'
                } backdrop-blur`}
              >
                <button
                  type="button"
                  onClick={() => setMapPeek(false)}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-2 text-left transition active:scale-[0.99]"
                >
                  <span className="min-w-0 flex-1">
                    <span className={`block text-lg font-extrabold leading-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                      {formatDurationLabel(_selectedItinerary.dur)}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {_selectedItinerary.dep} → {_selectedItinerary.arr}
                    </span>
                  </span>
                  <ChevronUpIcon className="h-5 w-5 flex-shrink-0 text-slate-400" />
                </button>
                {canNavigate && (
                  <button
                    type="button"
                    onClick={onStartNavigation}
                    className="flex h-12 flex-shrink-0 items-center gap-2 rounded-2xl bg-blue-600 px-4 text-sm font-bold text-white transition active:scale-95 active:bg-blue-700"
                  >
                    <PlayIcon className="h-4 w-4" />
                    {language === 'fr' ? 'Démarrer' : 'Start'}
                  </button>
                )}
              </div>
            </div>
          )}

        {/* La page du planificateur : plein écran, du haut au bas, en trois
            bandes — en-tête figé, contenu qui défile, actions sous le pouce. */}
        {/* Le glissement est en CSS et non piloté en JavaScript : si l'animation
            ne joue pas, la page atteint quand même son état — ouverte ou hors
            du champ — au lieu de rester figée sur sa position de départ. */}
        <div
          className={`fixed inset-0 z-[1000] flex flex-col origin-bottom transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            /* Le choix d'un favori vient de la droite : il prolonge la page de
               configuration au lieu de monter de la carte. */
            isPicker
              ? isPanelVisible
                ? 'translate-x-0'
                : 'translate-x-full'
              : isPanelVisible
              ? 'translate-y-0 scale-100 opacity-100'
              /* Replier sur la carte n'est pas quitter : la page ne tombe pas
                 hors de l'écran, elle s'écrase sur son bord inférieur — le
                 point d'origine des transformations — jusqu'à la hauteur du
                 bandeau, comme aspirée par lui. Refermée, en revanche, elle
                 s'en va simplement par le bas. */
              : mapPeek
              ? 'scale-x-[0.86] scale-y-[0.06] opacity-0'
              : 'translate-y-full scale-100'
          } ${isLight ? 'bg-slate-50 text-slate-900' : 'bg-slate-950 text-white'}`}
          style={{
            pointerEvents: isPanelVisible ? 'auto' : 'none',
            // Le doigt qui tire la page prend la main sur la transition — sauf
            // pour le choix d'un favori, qui glisse latéralement et n'a rien à
            // faire d'un geste vertical.
            transform: dragY > 0 && !isPicker ? `translateY(${dragY}px)` : undefined,
            transition: dragY > 0 && !isPicker
              ? 'none'
              // L'effacement attend que le rétrécissement soit engagé : mené de
              // front, il emportait la page avant qu'on ait vu où elle allait,
              // et l'aspiration ne se lisait pas.
              : 'transform 320ms cubic-bezier(0.32,0.72,0,1), opacity 160ms linear 160ms',
          }}
          aria-hidden={!isPanelVisible}
        >
          {/* Le choix d'un favori a son propre en-tête : une flèche de retour
              et le nom de ce qu'on est en train de faire. Pas de repli sur la
              carte, pas de partage — rien de ce que porte le planificateur, qui
              n'a pas cours ici. */}
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

          {/* Le voile de fermeture. Posé par-dessus la page mais translucide :
              la barre de recherche et les résultats restent lisibles dessous,
              simplement grisés. Il ne prend aucun geste — c'est le doigt qui
              tire la page qui doit continuer à la tirer. */}
          <div
            className="pointer-events-none absolute inset-0 z-[60] flex items-start justify-center transition-opacity duration-150"
            style={{
              opacity: isDragHintVisible ? 1 : 0,
              backgroundColor: isLight ? 'rgba(148,163,184,0.55)' : 'rgba(15,23,42,0.62)',
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

          {/* La clé rejoue la cascade d'arrivée à chaque ouverture : sans elle,
              les blocs ne monteraient qu'une fois, à la première. */}
          <div
            ref={scrollerRef}
            key={openSeq}
            /* Le panneau ne défile que verticalement. Sans cette borne, un
               contenu qui dépasse de quelques pixels — la frise débordée de sa
               marge négative, une adresse un peu longue — rendait tout le cadre
               déplaçable : un mouvement circulaire du pouce décalait la page
               entière, alors qu'on croyait ne toucher que la frise. */
            className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
            onPointerDown={isPicker ? undefined : handleDragStart}
            onPointerMove={isPicker ? undefined : handleDragMove}
            onPointerUp={isPicker ? undefined : handleDragEnd}
            onPointerCancel={isPicker ? undefined : handleDragEnd}
          >
            {bodyNode}
            {creditNode}
          </div>

          {/* Le bouton d'ajout ne défile pas avec les résultats : c'est l'action
              de la page, et elle vaut pour le trajet entier — pas pour l'un des
              itinéraires de la liste. On peut donc l'atteindre sans avoir
              choisi lequel. */}
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

          {showActionBar && (
            <div
              className={`flex-shrink-0 border-t px-3 pt-3 ${
                isLight ? 'border-slate-200 bg-white/95' : 'border-slate-800 bg-slate-950/95'
              } backdrop-blur`}
              style={{ paddingBottom: safeBottom }}
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMapPeek(true)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-2xl border py-3.5 text-sm font-bold transition active:scale-[0.98] ${
                    isLight
                      ? 'border-slate-200 bg-white text-slate-800'
                      : 'border-slate-800 bg-slate-900 text-slate-100'
                  }`}
                >
                  <MapIcon className="h-5 w-5" />
                  {language === 'fr' ? 'Voir la carte' : 'View map'}
                </button>
                {canNavigate && (
                  <button
                    type="button"
                    onClick={onStartNavigation}
                    className="flex flex-[1.3] items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3.5 text-sm font-bold text-white transition active:scale-[0.98] active:bg-blue-700"
                  >
                    <PlayIcon className="h-5 w-5" />
                    {language === 'fr' ? 'Démarrer' : 'Start'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Définir un lieu enregistré : une feuille par-dessus la page, ouverte
            en grand, avec sa propre recherche et son renvoi vers la carte. */}
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
