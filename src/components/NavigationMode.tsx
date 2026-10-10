import { formatDurationLabel } from '../utils/formatDuration';
import { CITY_SITE, SITE_CENTER } from '../site';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useMotionValue, animate } from 'framer-motion';
import MapLibreMap, { Marker, Source, Layer } from 'react-map-gl/maplibre';
import type { MapRef } from 'react-map-gl/maplibre';
import {
  XMarkIcon,
  ChevronDownIcon,
  FlagIcon,
  TicketIcon,
  StarIcon,
  ClockIcon,
  CreditCardIcon,
  UserIcon,
  Cog6ToothIcon,
  PaperAirplaneIcon,
  ArrowRightCircleIcon,
} from '@heroicons/react/24/solid';
import { FaWalking } from 'react-icons/fa';
import { TransportModeIcon } from './TransportModeIcon';
import { AVATARS } from '../services/account';
import { openExternal } from '../utils/openExternal';
import { PASS_SHOP_URL } from '../services/config';
import { getDepartures, getStopPointDepartures, type RouteItinerary } from '../services/api';
import type { Departure } from '../types';
import type { AllLinesLine } from '../services/allLines';
import { resolveRouteLine } from '../utils/routeLineResolver';
import { publishObservation, getLineDelay, type LineDelay } from '../services/liveTiming';
import { getCrowdConfidence, type CrowdConfidence } from '../services/crowdSignals';
import { useWakeLock } from '../hooks/useWakeLock';
import { getLineReputation, type LineReputation } from '../services/lineReputation';
import { loadOccupancy, getOccupancyAt, occupancyLevel } from '../services/stopOccupancy';
import { loadNavigationStep, saveNavigationStep } from '../services/navigationSession';
import { getTimetable } from '../services/timetable';
import {
  notificationsEnabled,
  notificationPermission,
  setNotificationsEnabled,
  requestNotificationPermission,
  notifyTripMoment,
  voiceEnabled,
  setVoiceEnabled,
  voiceSupported,
  speak,
} from '../services/tripNotifications';
import { StepSlider } from './StepSlider';
import { TripQuestions } from './TripQuestions';
import type { TripSurveyLeg } from '../services/cms';
import { MapSheet } from './MapSheet';
import {
  WALK_SPEEDS,
  WALK_PRIORITIES,
  loadWalkPreferences,
  saveWalkPreferences,
  type WalkPreferences,
} from '../services/walkPreferences';
import { tx } from '../i18n';

const DARK_MAP_STYLE_URL =
  'https://api.maptiler.com/maps/019f7c73-0431-726f-ae5d-598a16a06771/style.json?key=7TQErbyvEqFlis3QMmSl';
const LIGHT_MAP_STYLE_URL =
  'https://api.maptiler.com/maps/019f7c76-a3f8-751b-bedb-d7fe9d83d122/style.json?key=7TQErbyvEqFlis3QMmSl';

const HELPED_STORAGE_PREFIX = 'greLines_navigationHelped:';

function navigationHelpedStorageKey(itinerary: RouteItinerary): string {
  const firstLeg: any = itinerary.allLegs?.[0];
  return `${HELPED_STORAGE_PREFIX}${itinerary.depName ?? ''}:${itinerary.arrName ?? ''}:${firstLeg?.startTime ?? ''}`;
}

function loadNavigationHelped(key: string): number {
  try {
    return Math.max(0, Number(localStorage.getItem(key)) || 0);
  } catch {
    return 0;
  }
}

interface NavigationModeProps {
  itinerary: RouteItinerary;
  isOpen: boolean;
  onClose: () => void;
  language: 'fr' | 'en';
  stops: any[];
  lineLookup?: Map<string, AllLinesLine> | null;
  currentLocation?: { lat: number; lon: number } | null;

  itineraryOptions?: RouteItinerary[];
  onItinerarySelected?: (itinerary: RouteItinerary) => void;
  legPaths?: Map<number, Array<[number, number]>>;

  onBoardVehicle?: (info: { lineShortName: string; boardingStop: string | null }) => void;

  onArrived?: (contributions: { observations: number; answers: number; travellersHelped: number }) => void;
  refreshIntervalMs?: number;
  isMobile?: boolean;

  theme?: 'light' | 'dark';
}

type StepKind = 'walk' | 'transit' | 'arrival';

interface NavStep {
  kind: StepKind;
  instruction: string;
  detail: string;
  headsign?: string;
  durationMin: number;
  color: string;
  lineShortName?: string;
  mode?: string;
  fromName?: string;
  path: Array<[number, number]>;
}

const CONFIDENCE_COLOR: Record<CrowdConfidence['level'], string> = {
  good: '#22c55e',
  fair: '#f59e0b',
  poor: '#ef4444',
};

function confidenceLabel(confidence: CrowdConfidence, isFr: boolean): string {
  const count = confidence.sample;
  const voices = tx(isFr).navigationMode.countReports(count, confidence.fresh);

  let reason: string;
  if (confidence.ghostRate !== null && confidence.ghostRate >= 0.34) {
    reason = tx(isFr).navigationMode.announcedRunSometimesMissing;
  } else if (confidence.crowding !== null && confidence.crowding < 1.7) {
    reason = tx(isFr).navigationMode.packedVehicle;
  } else if (confidence.punctuality !== null && confidence.punctuality < 1.7) {
    reason = tx(isFr).navigationMode.runningLate;
  } else if (confidence.accessible === false) {
    reason = tx(isFr).navigationMode.accessReportedOutOf;
  } else if (confidence.level === 'good') {
    reason = tx(isFr).navigationMode.nothingReported;
  } else {
    reason = tx(isFr).navigationMode.mixedReports;
  }

  return `${reason} · ${voices}`;
}

const STOP_ARRIVAL_M = 4;

const STOP_STILL_MPS = 0.7;

const PANEL_BG = 'rgb(var(--gl-ink-rgb))';
const PANEL_BG_LIGHT = '#f1f5f9';

function panelSkin(isLight: boolean) {
  return {
    background: isLight ? PANEL_BG_LIGHT : PANEL_BG,
    ink: isLight ? '#0f172a' : '#ffffff',
    muted: isLight ? '#475569' : '#94a3b8',
    chip: isLight ? '#e2e8f0' : '#1e293b',
    rule: isLight ? 'rgba(15,23,42,0.12)' : 'rgba(255,255,255,0.10)',
    plate: isLight ? '#0f172a' : '#ffffff',
    plateInk: (lineColor: string) => (isLight ? onDark(lineColor) : onWhite(lineColor)),
  };
}
const WALK_COLOR = '#94a3b8';
const ARRIVAL_COLOR = '#22c55e';

const FOLLOW_ZOOM = 17.5;
const FOLLOW_PITCH = 55;

const FOLLOW_LOOK_AHEAD_METERS = 30;

const FOLLOW_RESUME_MS = 8000;

const RUN_CARD_WIDTH = 104;
const RUN_CARD_GAP = 8;
const RUN_CARD_PITCH = RUN_CARD_WIDTH + RUN_CARD_GAP;

const METRES_PER_DEG_LAT = 111320;
const METRES_PER_DEG_LON_AT_45 = 78710;

function snapToPath(
  path: Array<[number, number]>,
  point: [number, number],
  maxSnapMeters = 60,
): [number, number] | null {
  if (path.length < 2) return null;

  const toMetres = (lon: number, lat: number): [number, number] => [
    (lon - point[0]) * METRES_PER_DEG_LON_AT_45,
    (lat - point[1]) * METRES_PER_DEG_LAT,
  ];

  let bestDistSq = Infinity;
  let best: [number, number] | null = null;

  for (let i = 0; i < path.length - 1; i++) {
    const [ax, ay] = toMetres(path[i][0], path[i][1]);
    const [bx, by] = toMetres(path[i + 1][0], path[i + 1][1]);
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;

    let t = lengthSq === 0 ? 0 : -(ax * dx + ay * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));

    const cx = ax + t * dx;
    const cy = ay + t * dy;
    const distSq = cx * cx + cy * cy;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      best = [
        point[0] + cx / METRES_PER_DEG_LON_AT_45,
        point[1] + cy / METRES_PER_DEG_LAT,
      ];
    }
  }

  if (!best || Math.sqrt(bestDistSq) > maxSnapMeters) return null;
  return best;
}

const SMOOTHING_MS = 900;
const SMOOTHING_TELEPORT_METERS = 300;

function useSmoothedPosition(target: [number, number] | null): [number, number] | null {
  const [smoothed, setSmoothed] = useState<[number, number] | null>(target);
  const fromRef = useRef<[number, number] | null>(target);
  const frameRef = useRef(0);

  useEffect(() => {
    if (!target) {
      setSmoothed(null);
      fromRef.current = null;
      return;
    }

    const from = fromRef.current;
    if (!from) {
      fromRef.current = target;
      setSmoothed(target);
      return;
    }

    const jump = coordinateDistance(from, target) * METRES_PER_DEG_LAT;
    if (jump > SMOOTHING_TELEPORT_METERS) {
      fromRef.current = target;
      setSmoothed(target);
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const linear = Math.min(1, (now - start) / SMOOTHING_MS);
      const eased = 1 - Math.pow(1 - linear, 3);
      const next: [number, number] = [
        from[0] + (target[0] - from[0]) * eased,
        from[1] + (target[1] - from[1]) * eased,
      ];
      setSmoothed(next);
      if (linear < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target?.[0], target?.[1]]);

  return smoothed;
}

function pointAheadOnPath(
  path: Array<[number, number]>,
  from: [number, number],
  aheadMeters: number,
): [number, number] | null {
  if (path.length < 2) return null;

  const distance = (a: [number, number], b: [number, number]) => {
    const dLat = (a[1] - b[1]) * METRES_PER_DEG_LAT;
    const dLon = (a[0] - b[0]) * METRES_PER_DEG_LON_AT_45;
    return Math.sqrt(dLat * dLat + dLon * dLon);
  };

  let nearestIndex = 0;
  let nearest = Infinity;
  for (let i = 0; i < path.length; i++) {
    const d = distance(path[i], from);
    if (d < nearest) { nearest = d; nearestIndex = i; }
  }

  let travelled = 0;
  for (let i = nearestIndex; i < path.length - 1; i++) {
    travelled += distance(path[i], path[i + 1]);
    if (travelled >= aheadMeters) return path[i + 1];
  }
  return path[path.length - 1];
}

function stepColor(step: NavStep): string {
  if (step.kind === 'arrival') return ARRIVAL_COLOR;
  if (step.kind === 'walk') return WALK_COLOR;
  return step.color;
}

function readableOn(background: string): string {
  const hex = background.replace('#', '');
  if (hex.length !== 6) return '#ffffff';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? '#0f172a' : '#ffffff';
}

function shadeColor(hex: string, amount: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const channels = [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16));
  const light = (0.299 * channels[0] + 0.587 * channels[1] + 0.114 * channels[2]) / 255 > 0.55;
  const target = light ? 0 : 255;
  return (
    '#' +
    channels
      .map((value) =>
        Math.round(value + (target - value) * amount)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  );
}

function onWhite(hex: string): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return '#0f172a';
  let channels = [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16));
  const luminance = (rgb: number[]) =>
    (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  let guard = 0;
  while (luminance(channels) > 0.45 && guard < 6) {
    channels = channels.map((value) => Math.round(value * 0.8));
    guard += 1;
  }
  return '#' + channels.map((value) => value.toString(16).padStart(2, '0')).join('');
}

function onDark(hex: string): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return '#ffffff';
  let channels = [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16));
  const luminance = (rgb: number[]) =>
    (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  let guard = 0;
  while (luminance(channels) < 0.5 && guard < 8) {
    channels = channels.map((value) => Math.min(255, Math.round(value + (255 - value) * 0.25)));
    guard += 1;
  }
  return '#' + channels.map((value) => value.toString(16).padStart(2, '0')).join('');
}

function normalizeStopName(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function resolveStopId(
  name: unknown,
  lat: unknown,
  lon: unknown,
  stops: any[]
): string | undefined {
  if (!Array.isArray(stops) || stops.length === 0) return undefined;
  const wanted = normalizeStopName(name);
  const wantedShort = wanted.includes(' ')
    ? normalizeStopName(String(name ?? '').split(',').pop())
    : wanted;
  const here =
    Number.isFinite(Number(lat)) && Number.isFinite(Number(lon))
      ? ([Number(lon), Number(lat)] as [number, number])
      : null;

  let exact: { id: string; distance: number } | null = null;
  let partial: { id: string; distance: number } | null = null;
  let nearest: { id: string; distance: number } | null = null;

  for (const stop of stops) {
    if (!stop?.id) continue;
    const distance =
      here && Number.isFinite(stop.lat) && Number.isFinite(stop.lon)
        ? coordinateDistance(here, [stop.lon, stop.lat])
        : Infinity;
    const candidate = normalizeStopName(stop.name);
    const candidateShort = candidate.includes(',')
      ? normalizeStopName(String(stop.name).split(',').pop())
      : candidate;

    if (wanted && candidate === wanted) {
      if (!exact || distance < exact.distance) exact = { id: stop.id, distance };
    } else if (
      wantedShort &&
      (candidateShort === wantedShort ||
        candidate.endsWith(` ${wantedShort}`) ||
        wanted.endsWith(` ${candidateShort}`))
    ) {
      if (distance <= 400 && (!partial || distance < partial.distance)) {
        partial = { id: stop.id, distance };
      }
    }

    if (distance < (nearest?.distance ?? Infinity)) {
      nearest = { id: stop.id, distance };
    }
  }

  if (exact) return exact.id;
  if (partial) return partial.id;
  if (nearest && nearest.distance <= 100) return nearest.id;
  return undefined;
}

function formatClock(value: unknown): string {
  const date = new Date(value as any);
  if (!value || Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function bearingBetween(from: [number, number], to: [number, number]): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const toDeg = (v: number) => (v * 180) / Math.PI;
  const lon1 = toRad(from[0]);
  const lat1 = toRad(from[1]);
  const lon2 = toRad(to[0]);
  const lat2 = toRad(to[1]);
  const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function decodePolyline(encoded: string): Array<[number, number]> {
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
    lat += (result & 1) !== 0 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += (result & 1) !== 0 ? ~(result >> 1) : result >> 1;

    coordinates.push([lng / 1e5, lat / 1e5]);
  }

  return coordinates;
}

function coordinateDistance(a: [number, number], b: [number, number]): number {
  const latMean = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const metersPerLon = 111_320 * Math.cos(latMean);
  const dx = (b[0] - a[0]) * metersPerLon;
  const dy = (b[1] - a[1]) * 110_540;
  return Math.sqrt(dx * dx + dy * dy);
}

function slicePathForCamera(path: Array<[number, number]>, kind: StepKind): Array<[number, number]> {
  if (path.length <= 2) return path;
  const maxMeters = kind === 'walk' ? 850 : 1800;
  const sliced: Array<[number, number]> = [path[0]];
  let distance = 0;
  for (let i = 1; i < path.length; i += 1) {
    distance += coordinateDistance(path[i - 1], path[i]);
    sliced.push(path[i]);
    if (distance >= maxMeters) break;
  }
  return sliced.length >= 2 ? sliced : path.slice(0, 2);
}

function getBoundsForPath(path: Array<[number, number]>): [[number, number], [number, number]] | null {
  if (path.length === 0) return null;
  const lons = path.map((p) => p[0]);
  const lats = path.map((p) => p[1]);
  const west = Math.min(...lons);
  const east = Math.max(...lons);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  const minSpan = 0.0026;
  const lonPad = Math.max((east - west) * 0.18, minSpan);
  const latPad = Math.max((north - south) * 0.18, minSpan);
  return [
    [west - lonPad, south - latPad],
    [east + lonPad, north + latPad],
  ];
}

function buildSteps(
  itinerary: RouteItinerary,
  isFr: boolean,
  stops: any[],
  lineLookup?: Map<string, AllLinesLine> | null,
  legPaths?: Map<number, Array<[number, number]>>
): NavStep[] {
  const legs = itinerary.allLegs || [];

  const cleanPlace = (value: unknown): string | undefined => {
    const name = typeof value === 'string' ? value.trim() : '';
    if (!name || name === 'Origin' || name === 'Destination') return undefined;
    return name;
  };

  const steps: NavStep[] = legs.map((leg: any, legIndex: number) => {
    const durationMin = Math.max(1, Math.round((leg.duration ?? 0) / 60));
    const path = legPaths?.get(legIndex)
      ?? (leg?.legGeometry?.points ? decodePolyline(leg.legGeometry.points) : []);

    if (leg.mode === 'WALK') {
      return {
        kind: 'walk',

        instruction: cleanPlace(leg.to?.name)
          ? `${tx(isFr).navigationMode.walkTo} ${cleanPlace(leg.to?.name)}`
          : (tx(isFr).navigationMode.walk),
        detail: cleanPlace(leg.to?.name) ? `${tx(isFr).navigationMode.to} ${cleanPlace(leg.to?.name)}` : '',
        durationMin,
        color: '#64748b',
        fromName: cleanPlace(leg.from?.name),
        path,
      };
    }

    const line = resolveRouteLine({
      routeShortName: leg.routeShortName,
      route: leg.route,
      routeId: leg.routeId,
      lineLookup,
      stops,
    });
    const shortName = String(leg.routeShortName || leg.route || '').replace(/^SEM:/, '');

    return {
      kind: 'transit',
      instruction: tx(isFr).navigationMode.takeShortname(shortName),
      detail: leg.to?.name ? `${tx(isFr).navigationMode.getOffAt} ${leg.to.name}` : '',
      headsign: leg.headsign,
      durationMin,
      color: line?.color || '#3b82f6',
      lineShortName: shortName,
      mode: leg.mode,
      fromName: leg.from?.name,
      path,
    };
  });

  steps.push({
    kind: 'arrival',
    instruction: tx(isFr).navigationMode.youHaveArrived,
    detail: itinerary.arrName || '',
    durationMin: 0,
    color: '#16a34a',
    path: [],
  });

  return steps;
}

function StepIcon({ step, className }: { step: NavStep; className: string }) {
  if (step.kind === 'arrival') return <FlagIcon className={className} />;
  if (step.kind === 'walk') return <FaWalking className={className} />;
  return <TransportModeIcon mode={step.mode} className={className} />;
}

export function NavigationMode({
  itinerary,
  isOpen,
  onClose,
  language,
  stops,
  lineLookup,
  currentLocation,
  legPaths,
  onBoardVehicle,
  onArrived,
  refreshIntervalMs = 30000,
  isMobile = false,
  theme = 'dark',
}: NavigationModeProps) {
  const isFr = language === 'fr';
  const skin = panelSkin(theme !== 'dark');
  const mapRef = useRef<MapRef>(null);
  const helpedStorageKey = useMemo(() => navigationHelpedStorageKey(itinerary), [itinerary]);
  const steps = useMemo(
    () => buildSteps(itinerary, isFr, stops, lineLookup, legPaths),
    [itinerary, isFr, stops, lineLookup, legPaths]
  );
  const [index, setIndex] = useState(() => loadNavigationStep(itinerary));
  const [hasStarted, setHasStarted] = useState(false);
  const [openLegs, setOpenLegs] = useState<Set<number>>(new Set());
  const [pickedRuns, setPickedRuns] = useState<Map<number, number>>(new Map());
  const [runs, setRuns] = useState<Departure[]>([]);
  const [scheduleRuns, setScheduleRuns] = useState<Map<number, number[]>>(new Map());
  const scrollSettleRef = useRef<number>(0);
  const scrollingRef = useRef(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHelpedSheetOpen, setIsHelpedSheetOpen] = useState(false);
  const [isExitDialogOpen, setIsExitDialogOpen] = useState(false);
  const [answerCount, setAnswerCount] = useState(0);
  const [travellersHelpedNow, setTravellersHelpedNow] = useState(() => loadNavigationHelped(helpedStorageKey));
  const [notifyOn, setNotifyOn] = useState(() => notificationsEnabled() && notificationPermission() === 'granted');
  const [voiceOn, setVoiceOn] = useState(() => voiceEnabled());

  useEffect(() => {
    setTravellersHelpedNow(loadNavigationHelped(helpedStorageKey));
  }, [helpedStorageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(helpedStorageKey, String(travellersHelpedNow));
    } catch {
    }
  }, [helpedStorageKey, travellersHelpedNow]);

  useEffect(() => {
    if (!isOpen || !hasStarted) return;
    let timer = 0;
    const scheduleContribution = () => {
      timer = window.setTimeout(() => {
        setTravellersHelpedNow(current => current + 1);
        scheduleContribution();
      }, 15000 + Math.round(Math.random() * 25000));
    };
    scheduleContribution();
    return () => window.clearTimeout(timer);
  }, [isOpen, hasStarted, helpedStorageKey]);
  const notifiedRef = useRef<Set<string>>(new Set());
  const arrivedRef = useRef(false);
  const atStopRef = useRef<string | null>(null);
  const [walkPrefs, setWalkPrefs] = useState<WalkPreferences>(() => loadWalkPreferences());

  const updateWalkPrefs = (next: WalkPreferences) => {
    setWalkPrefs(next);
    saveWalkPreferences(next);
  };
  const [occupancyReady, setOccupancyReady] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    loadOccupancy().then((data) => {
      if (!cancelled && data) setOccupancyReady((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const sheetY = useMotionValue(0);
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === 'undefined' ? 800 : window.innerHeight
  );

  useEffect(() => {
    const onResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const [contentHeight, setContentHeight] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = contentRef.current;
    if (!element) return;
    const measure = () => setContentHeight(element.scrollHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [isOpen, index, openLegs, runs, scheduleRuns]);

  const sheetHeight = Math.max(viewportHeight * 0.85, contentHeight + 96);
  const sheetBounds = useMemo(() => {
    const sheetTop = viewportHeight * 0.15;
    return {
      top: Math.min(0, viewportHeight - sheetTop - sheetHeight),
      resting: viewportHeight * 0.45 - sheetTop,
      bottom: viewportHeight * 0.84 - sheetTop,
    };
  }, [sheetHeight, viewportHeight]);

  useEffect(() => {
    if (!isOpen) return;
    sheetY.set(sheetBounds.bottom);
    const controls = animate(sheetY, sheetBounds.resting, {
      type: 'spring',
      stiffness: 250,
      damping: 31,
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, itinerary]);
  const [isFollowing, setIsFollowing] = useState(true);
  const boardedTransitKeyRef = useRef<string | null>(null);
  const lastCameraLocationRef = useRef<[number, number] | null>(null);
  const animateRecenterRef = useRef(false);

  useWakeLock(isOpen && hasStarted);

  useEffect(() => {
    if (isOpen) {
      setIndex(Math.min(loadNavigationStep(itinerary), Math.max(0, steps.length - 1)));
      setHasStarted(true);
      setOpenLegs(new Set());
      setPickedRuns(new Map());
      setAnswerCount(0);
      arrivedRef.current = false;
      notifiedRef.current.clear();
      boardedTransitKeyRef.current = null;
    }
  }, [isOpen, itinerary]);

  useEffect(() => {
    if (isOpen) saveNavigationStep(itinerary, index);
  }, [index, isOpen, itinerary]);

  const step = steps[Math.min(index, steps.length - 1)];

  const snappedLocation = useMemo<[number, number] | null>(() => {
    if (!currentLocation) return null;
    const here: [number, number] = [currentLocation.lon, currentLocation.lat];
    return snapToPath(step?.path ?? [], here) ?? here;
  }, [currentLocation?.lat, currentLocation?.lon, step]);

  const smoothedLocation = useSmoothedPosition(snappedLocation);

  const lastFixRef = useRef<{ lat: number; lon: number; at: number } | null>(null);
  const [speedMps, setSpeedMps] = useState(0);

  useEffect(() => {
    if (!currentLocation) return;
    const now = Date.now();
    const previous = lastFixRef.current;
    lastFixRef.current = { lat: currentLocation.lat, lon: currentLocation.lon, at: now };
    if (!previous) return;
    const elapsed = (now - previous.at) / 1000;
    if (elapsed < 2 || elapsed > 60) return;
    const metres = coordinateDistance(
      [previous.lon, previous.lat],
      [currentLocation.lon, currentLocation.lat]
    );
    setSpeedMps((current) => current * 0.6 + (metres / elapsed) * 0.4);
  }, [currentLocation?.lat, currentLocation?.lon]);

  useEffect(() => {
    if (!isOpen || !hasStarted || !currentLocation) return;
    const here: [number, number] = [currentLocation.lon, currentLocation.lat];
    const inVehicle = speedMps > 4;

    const distanceTo = (item: NavStep): number => {
      if (item.path.length < 2) return Infinity;
      const snapped = snapToPath(item.path, here);
      if (!snapped) return Infinity;
      let metres = coordinateDistance(snapped, here);
      if (inVehicle && item.kind === 'walk') metres += 120;
      if (!inVehicle && item.kind === 'transit') metres += 60;
      return metres;
    };

    const currentDistance = distanceTo(steps[index]);
    let best = index;
    let bestDistance = currentDistance;
    for (let i = index + 1; i < steps.length; i++) {
      const metres = distanceTo(steps[i]);
      if (metres < bestDistance) {
        best = i;
        bestDistance = metres;
      }
    }

    if (steps[index]?.kind === 'walk' || !Number.isFinite(currentDistance)) {
      for (let i = index + 1; i < steps.length; i += 1) {
        const candidate = steps[i];
        if (candidate.kind !== 'transit' || candidate.path.length < 2) continue;
        const snapped = snapToPath(candidate.path, here, 60);
        if (!snapped || coordinateDistance(candidate.path[0], snapped) < 80) continue;
        best = i;
        break;
      }
    }

    if (best !== index && (currentDistance - bestDistance > 30 || steps[best]?.kind === 'transit')) setIndex(best);
  }, [isOpen, hasStarted, currentLocation?.lat, currentLocation?.lon, speedMps, steps, index]);

  useEffect(() => {
    if (!isOpen || !hasStarted || isFollowing) return;
    const timer = window.setTimeout(() => setIsFollowing(true), FOLLOW_RESUME_MS);
    return () => window.clearTimeout(timer);
  }, [isOpen, hasStarted, isFollowing]);

  useEffect(() => {
    if (!isOpen || !step) return;
    if (hasStarted && isFollowing && currentLocation) return;
    const map = mapRef.current;
    if (!map) return;

    if (step.path.length < 2) {
      const point = step.path[0];
      if (point) map.easeTo({ center: point, zoom: 16, bearing: 0, duration: 900 });
      return;
    }

    const cameraPath = slicePathForCamera(step.path, step.kind);
    const bounds = getBoundsForPath(
      currentLocation ? [[currentLocation.lon, currentLocation.lat], ...cameraPath] : cameraPath
    );
    if (!bounds) return;

    const start = cameraPath[0];
    const end = cameraPath[Math.min(cameraPath.length - 1, 4)];
    const heading = bearingBetween(start, end);

    map.fitBounds(bounds, {
      padding: {
        top: isMobile ? 24 : 48,
        bottom: isMobile ? 340 : 300,
        left: isMobile ? 24 : 48,
        right: isMobile ? 24 : 48,
      },
      bearing: heading,
      duration: 900,
      maxZoom: step.kind === 'walk' ? 17 : 15.8,
    });
  }, [isOpen, index, step, isMobile]);

  useEffect(() => {
    if (!isOpen || !hasStarted || !isFollowing || !smoothedLocation) return;
    const map = mapRef.current;
    if (!map) return;

    const here = smoothedLocation;
    const previousCameraLocation = lastCameraLocationRef.current;
    if (previousCameraLocation && coordinateDistance(previousCameraLocation, here) < 8) return;
    lastCameraLocationRef.current = here;
    const lookAhead = pointAheadOnPath(step.path, here, FOLLOW_LOOK_AHEAD_METERS);

    const shouldAnimate = animateRecenterRef.current;
    animateRecenterRef.current = false;
    map.easeTo({
      center: here,
      bearing: lookAhead ? bearingBetween(here, lookAhead) : map.getBearing(),
      zoom: FOLLOW_ZOOM,
      pitch: FOLLOW_PITCH,
      padding: { top: 0, right: 0, bottom: Math.round(window.innerHeight * 0.35), left: 0 },
      duration: shouldAnimate ? 650 : 0,
    });
  }, [isOpen, hasStarted, isFollowing, smoothedLocation, step]);

  useEffect(() => {
    if (!hasStarted || !onBoardVehicle) {
      boardedTransitKeyRef.current = null;
      return;
    }
    if (step.kind !== 'transit' || !step.lineShortName) return;
    const boardingStop =
      itinerary.allLegs?.[Math.min(index, Math.max(0, itinerary.allLegs.length - 1))]?.from?.name ??
      step.fromName ??
      null;
    const key = `${index}:${step.lineShortName}:${boardingStop ?? ''}`;
    if (boardedTransitKeyRef.current === key) return;
    boardedTransitKeyRef.current = key;
    onBoardVehicle({ lineShortName: step.lineShortName, boardingStop });
  }, [hasStarted, index, itinerary.allLegs, step.kind, step.lineShortName, step.fromName, onBoardVehicle]);

  const observedRef = useRef<Set<string>>(new Set());
  const lastStepRef = useRef(0);

  useEffect(() => {
    if (!isOpen) {
      observedRef.current.clear();
      lastStepRef.current = 0;
    }
  }, [isOpen, itinerary]);

  useEffect(() => {
    if (!hasStarted) {
      lastStepRef.current = index;
      return;
    }
    const legs = itinerary.allLegs || [];
    const now = new Date();

    const observe = (legIndex: number, moment: 'boarding' | 'alighting') => {
      const leg: any = legs[legIndex];
      if (!leg?.mode || leg.mode === 'WALK') return;

      const key = `${legIndex}:${moment}`;
      if (observedRef.current.has(key)) return;
      observedRef.current.add(key);
      setTravellersHelpedNow(current => current + 1);

      const fromStop = leg.from?.name;
      const toStop = leg.to?.name;
      const departure = leg.startTime ? new Date(leg.startTime) : null;
      const arrival = leg.endTime ? new Date(leg.endTime) : null;
      if (!fromStop || !departure || Number.isNaN(departure.getTime())) return;

      const reference = moment === 'boarding' ? departure : arrival;
      const observedStop = moment === 'boarding' ? fromStop : toStop;
      if (!reference || Number.isNaN(reference.getTime()) || !observedStop) return;

      publishObservation({
        lineId: String(leg.routeShortName || leg.route || leg.routeId || ''),
        fromStop,
        scheduledAt: departure.toISOString(),
        toStop: observedStop,
        observedAt: now.toISOString(),
        delaySeconds: (now.getTime() - reference.getTime()) / 1000,
      });
    };

    for (let i = lastStepRef.current; i < index; i++) observe(i, 'alighting');
    observe(index, 'boarding');
    lastStepRef.current = index;
  }, [hasStarted, index, itinerary.allLegs, isOpen]);

  const [lineDelay, setLineDelay] = useState<LineDelay | null>(null);
  const activeTransitIndex = useMemo(() => {
    for (let i = index; i < steps.length; i++) {
      if (steps[i]?.kind === 'transit') return i;
    }
    return -1;
  }, [steps, index]);

  const currentLine =
    activeTransitIndex >= 0 ? steps[activeTransitIndex]?.lineShortName : undefined;

  useEffect(() => {
    if (!isOpen || !currentLine) {
      setLineDelay(null);
      return;
    }
    let cancelled = false;
    const load = () => {
      getLineDelay(currentLine).then((value) => {
        if (!cancelled) setLineDelay(value);
      });
    };
    load();
    const timer = window.setInterval(load, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isOpen, currentLine]);

  const [reputation, setReputation] = useState<LineReputation | null>(null);

  useEffect(() => {
    if (!isOpen || !currentLine) {
      setReputation(null);
      return;
    }
    let cancelled = false;
    getLineReputation(currentLine).then((value) => {
      if (!cancelled) setReputation(value);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, currentLine]);

  const boardingStopId = useMemo(() => {
    const from = (itinerary.allLegs as any)?.[activeTransitIndex]?.from;
    if (!from) return undefined;
    return resolveStopId(from.name, from.lat, from.lon, stops);
  }, [itinerary.allLegs, activeTransitIndex, stops]);

  const rawBoardingStopId = (itinerary.allLegs as any)?.[activeTransitIndex]?.from?.stopId as
    | string
    | undefined;

  useEffect(() => {
    if (!isOpen || !currentLine) {
      setRuns([]);
      return;
    }
    let cancelled = false;
    const wanted = currentLine.toUpperCase();

    const keep = (list: Departure[]) =>
      list
        .filter(
          (d) =>
            String(d.lineShortName || d.lineId || '')
              .replace(/^SEM[:_]/, '')
              .toUpperCase() === wanted
        )
        .sort((a, b) => Number(a.departureTime) - Number(b.departureTime))
        .slice(0, 8);

    const load = async () => {
      const attempts: Array<() => Promise<Departure[]>> = [];
      if (rawBoardingStopId) {
        attempts.push(() => getStopPointDepartures(rawBoardingStopId));
      }
      if (boardingStopId) {
        attempts.push(() => getDepartures(boardingStopId));
      }

      for (const attempt of attempts) {
        try {
          const list = await attempt();
          if (cancelled) return;
          const kept = keep(list);
          if (kept.length > 0) {
            setRuns(kept);
            return;
          }
        } catch {
        }
      }
      if (!cancelled) setRuns([]);
    };

    void load();

    const period = Number.isFinite(refreshIntervalMs) ? Math.max(5000, refreshIntervalMs) : 30000;
    const timer = window.setInterval(() => void load(), period);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isOpen, currentLine, boardingStopId, rawBoardingStopId, refreshIntervalMs]);

  const [confidence, setConfidence] = useState<CrowdConfidence | null>(null);

  useEffect(() => {
    if (!isOpen || !currentLine) {
      setConfidence(null);
      return;
    }
    let cancelled = false;
    const load = () => {
      getCrowdConfidence(rawBoardingStopId ?? boardingStopId ?? null, currentLine).then((value) => {
        if (!cancelled) setConfidence(value);
      });
    };
    load();
    const period = Number.isFinite(refreshIntervalMs) ? Math.max(15000, refreshIntervalMs) : 30000;
    const timer = window.setInterval(load, period);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isOpen, currentLine, rawBoardingStopId, boardingStopId, refreshIntervalMs]);

  useEffect(() => {
    if (!isOpen) {
      setScheduleRuns(new Map());
      return;
    }
    const legs = (itinerary.allLegs as any[]) ?? [];
    const controller = new AbortController();

    void (async () => {
      const collected = new Map<number, number[]>();

      for (let i = 0; i < legs.length; i++) {
        const leg = legs[i];
        if (!leg?.mode || leg.mode === 'WALK') continue;
        const routeId = leg.routeId;
        const stopId = leg.from?.stopId;
        if (!routeId || !stopId) continue;

        const timetable = await getTimetable(String(routeId), { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (!timetable) continue;

        const now = new Date();
        const midnight = new Date(now).setHours(0, 0, 0, 0);
        const wantedName = normalizeStopName(leg.from?.name);
        const minutes: number[] = [];

        for (const direction of timetable.directions) {
          const stop =
            direction.stops.find((entry) => entry.id === stopId) ??
            (wantedName
              ? direction.stops.find((entry) => normalizeStopName(entry.name) === wantedName)
              : undefined);
          if (!stop) continue;
          for (const seconds of stop.times) {
            if (seconds === null) continue;
            minutes.push(Math.round((midnight + seconds * 1000 - now.getTime()) / 60000));
          }
        }

        if (minutes.length > 0) collected.set(i, minutes.sort((a, b) => a - b));
      }

      if (!controller.signal.aborted) setScheduleRuns(collected);
    })();

    return () => controller.abort();
  }, [isOpen, itinerary.allLegs]);

  type RunCard = { minutes: number | null; scheduled: boolean; level: 0 | 1 | 2 | 3 };

  const levelForRun = (legIndex: number, minutesFromNow: number | null): 0 | 1 | 2 | 3 => {
    if (minutesFromNow === null) return 0;
    void occupancyReady;
    const leg: any = (itinerary.allLegs as any)?.[legIndex];
    const at = new Date(Date.now() + minutesFromNow * 60000);
    return occupancyLevel(
      getOccupancyAt(leg?.from?.stopId, leg?.routeId ?? leg?.route, at, leg?.trip?.directionId)
    );
  };

  const surveyJourney = useMemo<TripSurveyLeg[]>(
    () =>
      ((itinerary.allLegs as any[]) ?? [])
        .filter((leg) => leg?.mode && leg.mode !== 'WALK')
        .map((leg) => ({
          line: String(leg.routeShortName || leg.route || leg.routeId || '').replace(/^SEM[:_]/, ''),
          from: String(leg.from?.name ?? ''),
          to: String(leg.to?.name ?? ''),
          departure: leg.startTime ? new Date(leg.startTime).toISOString() : undefined,
          arrival: leg.endTime ? new Date(leg.endTime).toISOString() : undefined,
        }))
        .filter((leg) => leg.line && leg.from && leg.to),
    [itinerary.allLegs]
  );

  useEffect(() => {
    if (!isOpen || !hasStarted || arrivedRef.current) return;
    if (steps.length === 0 || index < steps.length - 1) return;
    arrivedRef.current = true;
    const timer = window.setTimeout(() => {
      try {
        localStorage.removeItem(helpedStorageKey);
      } catch {
      }
      onArrived?.({
        observations: observedRef.current.size,
        answers: answerCount,
        travellersHelped: travellersHelpedNow,
      });
    }, 650);
    return () => window.clearTimeout(timer);
  }, [isOpen, hasStarted, index, steps.length, answerCount, travellersHelpedNow, helpedStorageKey, onArrived]);

  useEffect(() => {
    if (!isOpen || !hasStarted) return;
    const key = `${index}`;
    if (notifiedRef.current.has(key)) return;
    notifiedRef.current.add(key);

    const current = steps[index];
    if (!current) return;
    const next = steps[index + 1];

    if (current.kind === 'walk') {
      if (index === 0) void notifyTripMoment({ kind: 'leave' }, language);
      else if (next?.kind === 'transit' && next.lineShortName) {
        void notifyTripMoment(
          { kind: 'transfer', line: next.lineShortName, headsign: next.headsign ?? null },
          language
        );
      }
      return;
    }

    if (current.kind === 'transit' && current.lineShortName) {
      void notifyTripMoment(
        { kind: 'boarding', line: current.lineShortName, stop: current.fromName ?? null },
        language
      );
      return;
    }

    if (current.kind === 'arrival') {
      void notifyTripMoment({ kind: 'arrived', place: itinerary.arrName ?? null }, language);
    }
  }, [isOpen, hasStarted, index, steps, language, itinerary.arrName]);

  if (!isOpen || steps.length === 0) return null;

  const delayMinutes = lineDelay ? Math.round(lineDelay.seconds / 60) : 0;
  const showDelay = Boolean(lineDelay) && delayMinutes !== 0;

  const waitingStop = (() => {
    if (step?.kind !== 'walk') return null;
    const next = steps[index + 1];
    if (next?.kind !== 'transit') return null;
    const leg: any = (itinerary.allLegs as any)?.[index + 1];
    const id = leg?.from?.stopId;
    if (!id) return null;
    const stop = {
      id: String(id),
      name: String(leg?.from?.name ?? ''),
      lineId: next.lineShortName ?? null,
    };

    if (atStopRef.current === stop.id) return stop;

    const lat = Number(leg?.from?.lat);
    const lon = Number(leg?.from?.lon);
    if (!currentLocation || !Number.isFinite(lat) || !Number.isFinite(lon)) return stop;

    const metres = coordinateDistance([currentLocation.lon, currentLocation.lat], [lon, lat]);
    if (metres > STOP_ARRIVAL_M || speedMps > STOP_STILL_MPS) return null;

    atStopRef.current = stop.id;
    return stop;
  })();

  const handleClose = () => {
    onClose();
  };

  const compactSubtitle =
    step?.kind === 'transit'
      ? step.headsign || step.detail
      : steps[index + 1]?.instruction || steps[index + 1]?.detail || (tx(isFr).navigationMode.nextTripActions);
  const compactActionLabel =
    steps[index + 1]?.kind === 'walk'
      ? tx(isFr).navigationMode.walk2
      : steps[index + 1]?.kind === 'arrival'
      ? tx(isFr).navigationMode.arrival
      : steps[index + 1]?.lineShortName || steps[index + 1]?.instruction || '';

  const compactTitle = '';
  const onRestore = () => undefined;
  const showCompact = false;

  const boardingInMinutes = (legIndex: number): number => {
    const legs = (itinerary.allLegs as any[]) ?? [];
    const leg = legs[legIndex];

    const own = leg?.startTime ? new Date(leg.startTime).getTime() : NaN;
    if (Number.isFinite(own)) return Math.round((own - Date.now()) / 60000);

    const previousEnd = legs[legIndex - 1]?.endTime
      ? new Date(legs[legIndex - 1].endTime).getTime()
      : NaN;
    if (Number.isFinite(previousEnd)) return Math.round((previousEnd - Date.now()) / 60000);

    let cumulated = 0;
    for (let i = index; i < legIndex && i < steps.length; i++) {
      cumulated += steps[i]?.durationMin ?? 0;
    }
    return cumulated;
  };

  const cardsFor = (legIndex: number, extraMinutes: number): RunCard[] => {
    const leg: any = (itinerary.allLegs as any)?.[legIndex];
    const endAt = leg?.endTime ? new Date(leg.endTime).getTime() : NaN;
    const plannedMinutes = boardingInMinutes(legIndex);

    const liveMinutes: number[] = [];
    if (legIndex === activeTransitIndex) {
      for (const run of runs) {
        liveMinutes.push(Math.max(0, Math.round(Number(run.departureTime) || 0)));
      }
    }

    const cards: RunCard[] = liveMinutes.map((minutes) => ({
      minutes,
      scheduled: false,
      level: levelForRun(legIndex, minutes),
    }));

    const schedule = scheduleRuns.get(legIndex) ?? [];
    if (schedule.length > 0) {
      const isActive = legIndex === activeTransitIndex;
      const from = isActive ? 0 : Math.max(0, plannedMinutes - 30);
      const until = isActive
        ? Math.max(60, Math.round((endAt - Date.now()) / 60000)) + extraMinutes
        : plannedMinutes + 50;

      for (const minutes of schedule) {
        if (minutes < from || minutes > until) continue;
        if (cards.some((card) => card.minutes !== null && Math.abs(card.minutes - minutes) <= 1)) {
          continue;
        }
        cards.push({ minutes, scheduled: true, level: levelForRun(legIndex, minutes) });
      }
    }

    if (cards.length === 0) {
      const minutes = Math.max(0, plannedMinutes);
      cards.push({ minutes, scheduled: true, level: levelForRun(legIndex, minutes) });
    }

    if (cards.length === 0) return [{ minutes: null, scheduled: false, level: 0 }];
    return cards.sort((a, b) => (a.minutes ?? 0) - (b.minutes ?? 0)).slice(0, 14);
  };

  const closestTo = (cards: RunCard[], target: number): number => {
    let best = 0;
    let gap = Infinity;
    cards.forEach((card, i) => {
      if (card.minutes === null) return;
      const distance = Math.abs(card.minutes - target);
      if (distance < gap) {
        gap = distance;
        best = i;
      }
    });
    return best;
  };

  const plannedBoardingMinutes =
    activeTransitIndex >= 0 ? boardingInMinutes(activeTransitIndex) : 0;

  const baseCards = activeTransitIndex >= 0 ? cardsFor(activeTransitIndex, 0) : [];
  const defaultRunIndex = closestTo(baseCards, plannedBoardingMinutes);
  const activeRun = pickedRuns.get(activeTransitIndex) ?? defaultRunIndex;

  const pickedShiftMinutes = (() => {
    const chosen = baseCards[activeRun]?.minutes;
    const reference = baseCards[defaultRunIndex]?.minutes;
    if (chosen == null || reference == null) return 0;
    return chosen - reference;
  })();

  const activeCards =
    pickedShiftMinutes > 0 ? cardsFor(activeTransitIndex, pickedShiftMinutes) : baseCards;

  const runsForLeg = (legIndex: number): RunCard[] =>
    legIndex === activeTransitIndex ? activeCards : cardsFor(legIndex, 0);

  const selectedIndexFor = (legIndex: number, cards: RunCard[]): number => {
    const chosen = pickedRuns.get(legIndex);
    if (chosen != null) return Math.min(chosen, Math.max(0, cards.length - 1));
    return closestTo(cards, boardingInMinutes(legIndex));
  };

  const choose = (legIndex: number, run: number) => {
    setPickedRuns((previous) => {
      const next = new Map(previous);
      next.set(legIndex, run);
      return next;
    });
  };

  const shiftFor = (legIndex: number): number => {
    const cards = runsForLeg(legIndex);
    const chosen = cards[selectedIndexFor(legIndex, cards)]?.minutes;
    const reference = cards[closestTo(cards, boardingInMinutes(legIndex))]?.minutes;
    if (chosen == null || reference == null) return 0;
    return (chosen - reference) * 60000;
  };

  const shiftedClock = (value: unknown, legIndex: number): string => {
    const base = new Date(value as any).getTime();
    if (!Number.isFinite(base)) return '';
    const shift = legIndex >= index ? shiftFor(legIndex) : 0;
    return formatClock(new Date(base + shift).toISOString());
  };

  const chipClass =
    'flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-black/20 px-2.5 py-1.5 text-xs font-bold';

  const lineChips = (isCurrent: boolean) => (
    <div className="-mx-3 mb-2.5 flex items-center gap-2 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <span className={chipClass}>
        <CreditCardIcon className="h-3.5 w-3.5 opacity-80" />
        {tx(isFr).navigationMode.contactless}
      </span>
      <button
        type="button"
        onClick={() => openExternal(PASS_SHOP_URL)}
        className={`${chipClass} active:bg-black/30`}
      >
        <TicketIcon className="h-3.5 w-3.5 opacity-80" />
        {tx(isFr).navigationMode.buyATicket}
      </button>
      {isCurrent && reputation?.rating != null && (
        <span
          className={chipClass}
          title={
            tx(isFr).navigationMode.averageOfSamplesizeTraveller(reputation.sampleSize)
          }
        >
          <StarIcon className="h-3.5 w-3.5 opacity-90" />
          <span className="tabular">{reputation.rating.toFixed(1)}</span>
        </span>
      )}
      {isCurrent && reputation?.onTimeRate != null && (
        <span
          className={chipClass}
          title={
            tx(isFr).navigationMode.tripsJudgedOnTime(reputation.sampleSize)
          }
        >
          <ClockIcon className="h-3.5 w-3.5 opacity-80" />
          <span className="tabular">{Math.round(reputation.onTimeRate)} %</span>
        </span>
      )}
    </div>
  );

  const fullPath: Array<[number, number]> = itinerary.routePath?.length
    ? itinerary.routePath
    : steps.flatMap((item) => item.path);
  const stepGeoJSON = {
    type: 'FeatureCollection' as const,
    features: [{ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: step.path } }],
  };
  const futureRouteGeoJSON = {
    type: 'FeatureCollection' as const,
    features: steps.slice(index + 1)
      .filter(candidate => candidate.path.length > 1)
      .map(candidate => ({
        type: 'Feature' as const,
        properties: { color: stepColor(candidate) },
        geometry: { type: 'LineString' as const, coordinates: candidate.path },
      })),
  };
  const futureStopsGeoJSON = {
    type: 'FeatureCollection' as const,
    features: (itinerary.allLegs ?? []).slice(index + 1).flatMap((leg: any, offset: number) => {
      if (!leg?.mode || leg.mode === 'WALK') return [];
      const stepForLeg = steps[index + 1 + offset];
      const color = stepForLeg ? stepColor(stepForLeg) : '#64748b';
      return [leg.from, ...(leg.intermediateStops ?? []), leg.to]
        .flatMap((stop: any) => {
          const lat = Number(stop?.lat ?? stop?.latitude);
          const lon = Number(stop?.lon ?? stop?.lng ?? stop?.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
          return [{
            type: 'Feature' as const,
            properties: { color },
            geometry: { type: 'Point' as const, coordinates: [lon, lat] as [number, number] },
          }];
        });
    }),
  };

  const arriveLabel = itinerary.arr;
  const departureLabel = formatClock((itinerary.allLegs as any)?.[0]?.startTime);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[10001] overflow-hidden bg-[#0a1420]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
        style={{ fontFamily: "Inter, 'Helvetica Neue', sans-serif" }}
      >
        <div className="absolute inset-0">
          <MapLibreMap
            ref={mapRef}
            initialViewState={{ longitude: fullPath[0]?.[0] ?? (CITY_SITE ? SITE_CENTER.lon : 5.74892), latitude: fullPath[0]?.[1] ?? (CITY_SITE ? SITE_CENTER.lat : 45.18501), zoom: 15 }}
            mapStyle={theme === 'dark' ? DARK_MAP_STYLE_URL : LIGHT_MAP_STYLE_URL}
            style={{ width: '100%', height: '100%' }}
            attributionControl={false}
            onDragStart={() => setIsFollowing(false)}
            onRotateStart={() => setIsFollowing(false)}
            onZoomStart={(event: { originalEvent?: unknown }) => {
              if (event?.originalEvent) setIsFollowing(false);
            }}
          >
            {futureRouteGeoJSON.features.length > 0 && (
              <Source id="nav-future-routes" type="geojson" data={futureRouteGeoJSON}>
                <Layer
                  id="nav-future-routes-casing"
                  type="line"
                  paint={{ 'line-color': ['get', 'color'], 'line-width': 13, 'line-opacity': 0.18 }}
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                />
                <Layer
                  id="nav-future-routes-layer"
                  type="line"
                  paint={{ 'line-color': ['get', 'color'], 'line-width': 7, 'line-opacity': 0.45 }}
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                />
              </Source>
            )}

            {futureStopsGeoJSON.features.length > 0 && (
              <Source id="nav-future-stops" type="geojson" data={futureStopsGeoJSON}>
                <Layer
                  id="nav-future-stops-layer"
                  type="circle"
                  paint={{
                    'circle-radius': 4,
                    'circle-color': ['get', 'color'],
                    'circle-opacity': 0.7,
                    'circle-stroke-color': '#ffffff',
                    'circle-stroke-width': 1.5,
                    'circle-stroke-opacity': 0.75,
                  }}
                />
              </Source>
            )}

            {step.path.length > 0 && (
              <Source id="nav-step-route" type="geojson" data={stepGeoJSON}>
                <Layer
                  id="nav-step-route-layer"
                  type="line"
                  paint={{
                    'line-color': stepColor(step),
                    'line-width': step.kind === 'walk' ? 7 : 11,
                    'line-opacity': 0.98,
                    'line-dasharray': step.kind === 'walk' ? [0.1, 1.4] : [1, 0],
                  }}
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                />
              </Source>
            )}

            {step.path.length > 1 && (
              <>
                <Marker longitude={step.path[0][0]} latitude={step.path[0][1]}>
                  <div className="h-5 w-5 rounded-full border-[4px] border-white shadow-[0_4px_16px_rgba(0,0,0,0.35)]" style={{ backgroundColor: stepColor(step) }} />
                </Marker>
                <Marker longitude={step.path[step.path.length - 1][0]} latitude={step.path[step.path.length - 1][1]}>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                    className="flex h-11 w-11 items-center justify-center rounded-full border-[4px] border-white shadow-[0_8px_22px_rgba(0,0,0,0.38)]"
                    style={{ backgroundColor: stepColor(step) }}
                  >
                    <StepIcon step={step} className="h-5 w-5 text-white" />
                  </motion.div>
                </Marker>
              </>
            )}

            {smoothedLocation && (
              <Marker longitude={smoothedLocation[0]} latitude={smoothedLocation[1]}>
                <AnimatePresence initial={false} mode="wait">
                  {step.kind === 'transit' ? (
                    <motion.div
                      key="vehicle-sprite"
                      initial={{ opacity: 0, scale: 0.72 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.72 }}
                      transition={{ duration: 0.24, ease: 'easeOut' }}
                      className="flex h-11 w-11 items-center justify-center rounded-full border-[4px] border-white shadow-[0_6px_18px_rgba(0,0,0,0.4)]"
                      style={{ backgroundColor: stepColor(step) }}
                    >
                      <TransportModeIcon mode={step.mode ?? 'BUS'} className="h-6 w-6 text-white" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="walking-sprite"
                      initial={{ opacity: 0, scale: 0.72 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.72 }}
                      transition={{ duration: 0.24, ease: 'easeOut' }}
                      className="relative flex items-center justify-center"
                    >
                      <span className="absolute h-8 w-8 animate-ping rounded-full bg-blue-500/40" />
                      <span className="relative h-4 w-4 rounded-full border-2 border-white bg-blue-500 shadow-lg" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </Marker>
            )}
          </MapLibreMap>
        </div>

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-transparent" />

        <div
          className="pointer-events-none absolute left-1/2 top-[max(1rem,var(--gl-safe-top))] z-0 flex -translate-x-1/2 flex-col items-center"
          style={{ fontFamily: "Inter, 'Helvetica Neue', sans-serif" }}
        >
          <motion.div
            className="w-fit rounded-2xl px-4 py-2.5 text-center shadow-[0_10px_28px_rgba(0,0,0,0.22)]"
            style={{ backgroundColor: skin.background, color: skin.ink }}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
          >
            <p className="mb-1 text-[0.625rem] font-semibold uppercase tracking-[0.14em]" style={{ color: skin.muted }}>
              {tx(isFr).navigationMode.arrivalTime}
            </p>
            <p className="text-[1.75rem] font-black leading-none tabular-nums text-white">
              {arriveLabel}
            </p>
          </motion.div>

          <AnimatePresence initial={false}>
          {travellersHelpedNow > 0 && (
          <motion.button
            type="button"
            onClick={() => setIsHelpedSheetOpen(true)}
            className="pointer-events-auto -mt-1 flex items-center gap-2 rounded-b-xl px-2.5 pb-1.5 pt-2 shadow-[0_8px_20px_rgba(0,0,0,0.18)]"
            aria-label={tx(isFr).navigationMode.viewHelpedTravellers}
            style={{ backgroundColor: skin.background, color: skin.ink }}
            layout
            initial={{ opacity: 0, height: 0, y: -8 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
          >
            <div className="flex h-6 items-center pl-1">
              <AnimatePresence initial={false}>
              {AVATARS.slice(0, Math.min(3, travellersHelpedNow)).map((avatar, index) => (
                <motion.span
                  key={avatar}
                  className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-white text-[0.6875rem]"
                  style={{ marginLeft: index === 0 ? 0 : -8, zIndex: 3 - index }}
                  aria-hidden="true"
                  initial={{ opacity: 0, scale: 0.65 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.65 }}
                  transition={{ duration: 0.28, ease: 'easeOut' }}
                >
                  {avatar}
                </motion.span>
              ))}
              </AnimatePresence>
            </div>
            <span className="text-sm font-extrabold leading-none" style={{ color: skin.muted }}>
              <AnimatedCount value={travellersHelpedNow} />
            </span>
          </motion.button>
          )}
          </AnimatePresence>
        </div>


        <div className="absolute right-4 top-[max(1rem,var(--gl-safe-top))] z-30 flex flex-col gap-2.5">
          <button
            onClick={handleClose}
            className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-red-500 text-white shadow-[0_4px_16px_rgba(0,0,0,0.3)] active:scale-95"
            style={{ color: '#ffffff' }}
            aria-label={tx(isFr).navigationMode.exitNavigation}
          >
            <XMarkIcon className="h-6 w-6" />
          </button>

        </div>

        <div className="absolute right-4 top-[calc(max(1rem,var(--gl-safe-top))+3.5rem)] z-0 flex flex-col gap-2.5">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-800 shadow-[0_4px_16px_rgba(0,0,0,0.3)] active:scale-95"
            aria-label={tx(isFr).navigationMode.navigationSettings}
          >
            <Cog6ToothIcon className="h-5 w-5" />
          </button>

          {itinerary.lineKeys?.length > 0 && (
            <button
              onClick={() => openExternal(PASS_SHOP_URL)}
              className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-800 shadow-[0_4px_16px_rgba(0,0,0,0.3)] active:scale-95"
              aria-label={tx(isFr).navigationMode.myTicket}
            >
              <TicketIcon className="h-5 w-5" />
            </button>
          )}

          <AnimatePresence initial={false}>
            {hasStarted && !isFollowing && currentLocation && (
            <motion.button
              key="recenter-control"
              initial={{ opacity: 0, scale: 0.7, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.7, y: -8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              onClick={() => {
                lastCameraLocationRef.current = null;
                animateRecenterRef.current = true;
                setIsFollowing(true);
              }}
              className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-800 shadow-[0_4px_16px_rgba(0,0,0,0.3)] active:scale-95"
              aria-label={tx(isFr).navigationMode.recenter}
            >
              <PaperAirplaneIcon className="h-5 w-5 -rotate-45" />
            </motion.button>
            )}
          </AnimatePresence>
        </div>

        <motion.div
          style={{ y: sheetY, height: sheetHeight }}
          drag="y"
          dragConstraints={{ top: sheetBounds.top, bottom: sheetBounds.bottom }}
          dragElastic={0.02}
          dragTransition={{ power: 0.22, timeConstant: 260 }}
          className="absolute inset-x-0 top-[15%] flex touch-none flex-col"
        >
          <div
            className="pointer-events-none h-24 flex-shrink-0"
            style={{ background: `linear-gradient(to bottom, transparent, ${skin.background})` }}
          />

          <div className="absolute inset-x-3 top-3 z-20">
            <div
              className="rounded-2xl border px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.25)]"
              style={{ borderColor: skin.rule, backgroundColor: skin.background }}
            >
              <p
                className="text-[1.375rem] font-black leading-none tracking-tight"
                style={{ color: skin.ink }}
              >
                {departureLabel
                  ? tx(isFr).navigationMode.leaveAtDeparturelabel(departureLabel)
                  : tx(isFr).navigationMode.leaveNow}
              </p>
              <div className="mt-1.5 flex items-baseline justify-between gap-3">
                <p className="text-sm" style={{ color: skin.muted }}>
                  {tx(isFr).navigationMode.arrivingAt}{' '}
                  <span className="tabular font-semibold" style={{ color: skin.ink }}>
                    {arriveLabel}
                  </span>
                </p>
                <p className="tabular text-sm" style={{ color: skin.muted }}>
                  {formatDurationLabel(itinerary.dur)}
                </p>
              </div>

              <div className="mt-2.5 flex items-center gap-1">
              {steps.map((item, i) => {
                const done = i <= index;
                if (item.kind === 'walk') {
                  return (
                    <span key={i} className="flex flex-shrink-0 items-center gap-0.5">
                      {[0, 1].map((d) => (
                        <span
                          key={d}
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: skin.muted, opacity: 1 }}
                        />
                      ))}
                    </span>
                  );
                }
                if (item.kind === 'arrival') {
                  return (
                    <span
                      key={i}
                      className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: skin.muted, opacity: done ? 1 : 0.4 }}
                    />
                  );
                }
                return (
                  <span
                    key={i}
                    className="h-2 flex-1 rounded-full"
                    style={{ backgroundColor: stepColor(item), opacity: done ? 1 : 0.28 }}
                  />
                );
              })}
              </div>

              <AnimatePresence initial={false}>
                {step?.kind === 'transit' && step.lineShortName ? (
                  <TripQuestions
                    key={`vehicle-${step.lineShortName}`}
                    subject="vehicle"
                    targetId={step.lineShortName}
                    boardingStop={step.fromName ?? null}
                    boardingTime={
                      (itinerary.allLegs as any)?.[index]?.startTime
                        ? new Date((itinerary.allLegs as any)[index].startTime).toISOString()
                        : null
                    }
                    journey={surveyJourney}
                    language={language}
                    onAnswered={() => {
                      setAnswerCount((n) => n + 1);
                      setTravellersHelpedNow((current) => current + 1);
                    }}
                  />
                ) : (
                  waitingStop && (
                    <TripQuestions
                      key={`stop-${waitingStop.id || waitingStop.name || 'waiting-stop'}`}
                      subject="stop"
                      targetId={waitingStop.id}
                      targetName={waitingStop.name}
                      lineId={waitingStop.lineId}
                      language={language}
                      onAnswered={() => {
                        setAnswerCount((n) => n + 1);
                        setTravellersHelpedNow((current) => current + 1);
                      }}
                    />
                  )
                )}
              </AnimatePresence>

            </div>

          </div>

          <div
            ref={contentRef}
            className="flex-1 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
            style={{ background: skin.background }}
          >
            <div className="mt-4 space-y-0">
              {steps.map((item, i) => {
                const isCurrent = i === index;
                const leg: any = itinerary.allLegs?.[i];
                const ink = readableOn(stepColor(item));

                if (item.kind === 'walk') {
                  return (
                    <div key={i} className="flex items-center gap-3 py-2 pl-3">
                      <span className="flex w-7 flex-col items-center gap-1.5">
                        {[0, 1, 2, 3, 4, 5].map((d) => (
                          <span
                            key={d}
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: skin.muted }}
                          />
                        ))}
                      </span>
                      <span
                        className="flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-sm font-bold"
                        style={{ backgroundColor: skin.chip, color: skin.ink }}
                      >
                        <FaWalking className="h-4 w-4" style={{ color: skin.muted }} />
                        {item.durationMin} {item.durationMin > 1 ? 'minutes' : 'minute'}
                      </span>
                    </div>
                  );
                }
                if (item.kind === 'arrival') {
                  return (
                    <div key={i} className="flex items-center gap-3 pl-7 pr-4 pt-2">
                      <span className="flex w-7 justify-center">
                        <FlagIcon className="h-5 w-5 text-emerald-400" />
                      </span>
                      <span className="truncate text-sm font-bold" style={{ color: skin.ink }}>
                        {item.detail || item.instruction}
                      </span>
                    </div>
                  );
                }

                const stopsBefore = Array.isArray(leg?.intermediateStops)
                  ? leg.intermediateStops.length
                  : 0;
                const expanded = openLegs.has(i);

                return (
                  <div
                    key={i}
                    className="relative pt-5"
                    style={{ opacity: i < index ? 0.55 : 1 }}
                  >

                    <span
                      aria-hidden
                      className="absolute bottom-0 left-4 right-4 rounded-2xl"
                      style={{ backgroundColor: stepColor(item), top: '5.75rem' }}
                    />
                    {(
                      <div
                        onPointerDownCapture={(e) => {
                          e.stopPropagation();
                        }}
                        onScroll={(e) => {
                          const element = e.currentTarget;
                          scrollingRef.current = true;
                          window.clearTimeout(scrollSettleRef.current);
                          scrollSettleRef.current = window.setTimeout(() => {
                            scrollingRef.current = false;
                            const at = Math.max(
                              0,
                              Math.round(element.scrollLeft / RUN_CARD_PITCH)
                            );
                            if (at !== selectedIndexFor(i, runsForLeg(i))) choose(i, at);
                          }, 110);
                        }}
                        ref={(element) => {
                          if (!element) return;
                          if (scrollingRef.current) return;
                          if (pickedRuns.has(i)) return;
                          const target = selectedIndexFor(i, runsForLeg(i)) * RUN_CARD_PITCH;
                          if (Math.abs(element.scrollLeft - target) > 2) {
                            element.scrollLeft = target;
                          }
                        }}
                        className="relative z-10 flex snap-x snap-mandatory gap-2 overflow-x-auto pb-3 pl-9 [scroll-padding-left:2.25rem] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                      >
                        {(() => {
                          const cards = runsForLeg(i);
                          const selected = selectedIndexFor(i, cards);
                          return cards.map((run, r) => {
                          const mins = run.minutes;
                          const empty = mins === null;
                          const picked = !empty && r === selected;
                          const asClock = !empty && mins! > 30;
                          const clock = asClock
                            ? formatClock(new Date(Date.now() + mins! * 60000).toISOString())
                            : '';
                          return (
                            <button
                              key={r}
                              type="button"
                              disabled={empty}
                              onClick={(e) => {
                                choose(i, r);
                                e.currentTarget.scrollIntoView({
                                  behavior: 'smooth',
                                  inline: 'start',
                                  block: 'nearest',
                                });
                              }}
                              className="relative flex flex-shrink-0 snap-start flex-col items-center justify-center rounded-2xl shadow-[0_4px_14px_rgba(0,0,0,0.25)]"
                              style={{
                                width: RUN_CARD_WIDTH,
                                height: 128,
                                ...(picked
                                  ? {
                                      backgroundColor: skin.plate,
                                      color: skin.plateInk(stepColor(item)),
                                    }
                                  : {
                                      backgroundColor: shadeColor(stepColor(item), 0.22),
                                      color: ink,
                                      opacity: empty ? 0.45 : 1,
                                    }),
                              }}
                            >
                              {!empty && i === activeTransitIndex && confidence && (
                                <span
                                  className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full"
                                  style={{
                                    backgroundColor: CONFIDENCE_COLOR[confidence.level],
                                    boxShadow: '0 0 0 2px rgba(0,0,0,0.18)',
                                  }}
                                  aria-label={confidenceLabel(confidence, isFr)}
                                  title={confidenceLabel(confidence, isFr)}
                                />
                              )}
                              <span
                                className={`tabular font-black leading-none ${
                                  asClock ? 'text-[1.875rem]' : 'text-[2.75rem]'
                                }`}
                              >
                                {empty ? '–' : asClock ? clock : mins}
                              </span>
                              <span className="mt-1 text-xs opacity-80">
                                {empty
                                  ? ''
                                  : asClock
                                  ? tx(isFr).navigationMode.inMinsMin(mins)
                                  : mins! > 1
                                  ? 'minutes'
                                  : 'minute'}
                              </span>

                              {!empty && run.level > 0 ? (
                                <span
                                  className="mt-2.5 flex items-center gap-1 rounded-lg px-2 py-1"
                                  style={{
                                    backgroundColor: picked
                                      ? 'rgba(0,0,0,0.08)'
                                      : 'rgba(255,255,255,0.15)',
                                  }}
                                >
                                  {[0, 1, 2].map((p) => (
                                    <UserIcon
                                      key={p}
                                      className="h-3.5 w-3.5"
                                      style={{ opacity: p < run.level ? 1 : 0.25 }}
                                    />
                                  ))}
                                </span>
                              ) : !empty && i === activeTransitIndex && lineDelay ? (
                                <span
                                  className="mt-2.5 rounded-lg px-2 py-1 text-[0.625rem] font-black uppercase tracking-wide"
                                  style={{
                                    backgroundColor: picked
                                      ? 'rgba(0,0,0,0.08)'
                                      : 'rgba(255,255,255,0.15)',
                                  }}
                                >
                                  {tx(isFr).navigationMode.live}
                                </span>
                              ) : (
                                !empty && (
                                  <span
                                    className="mt-2.5 rounded-lg px-2 py-1 text-[0.625rem] font-black uppercase tracking-wide"
                                    style={{
                                      backgroundColor: picked
                                        ? 'rgba(0,0,0,0.12)'
                                        : 'rgba(255,255,255,0.15)',
                                    }}
                                  >
                                    {tx(isFr).navigationMode.scheduled}
                                  </span>
                                )
                              )}
                            </button>
                          );
                          });
                        })()}

                        <span
                          aria-hidden
                          className="flex-shrink-0"
                          style={{ width: `calc(100% - ${RUN_CARD_WIDTH}px - 2.25rem)` }}
                        />
                      </div>
                    )}

                    {i === activeTransitIndex && confidence && (
                      <div className="relative z-10 -mt-1 mb-1 flex items-center gap-2 pl-9 pr-4">
                        <span
                          aria-hidden
                          className="h-2 w-2 flex-shrink-0 rounded-full"
                          style={{ backgroundColor: CONFIDENCE_COLOR[confidence.level] }}
                        />
                        <span className="truncate text-[0.6875rem] font-semibold" style={{ color: ink }}>
                          {confidenceLabel(confidence, isFr)}
                        </span>
                      </div>
                    )}

                    <div className="relative mx-4 rounded-2xl px-3 pb-5" style={{ color: ink }}>

                    {lineChips(i === activeTransitIndex)}

                    <div className="flex items-center gap-3">
                      <span className="flex w-7 justify-center">
                        <TransportModeIcon mode={item.mode} className="h-6 w-6 opacity-80" />
                      </span>
                      <ArrowRightCircleIcon className="h-5 w-5 flex-shrink-0 opacity-80" />
                      <span
                        className="flex h-7 min-w-[1.75rem] flex-shrink-0 items-center justify-center rounded-lg px-2 text-sm font-black"
                        style={{ backgroundColor: ink, color: stepColor(item) }}
                      >
                        {item.lineShortName}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-base font-black leading-tight">
                        {item.headsign || item.instruction}
                      </span>
                      {isCurrent && (
                        <span className="flex-shrink-0 rounded-full bg-black/20 px-2 py-1 text-[0.625rem] font-bold uppercase tracking-wide">
                          {tx(isFr).navigationMode.onBoard}
                        </span>
                      )}
                    </div>

                    <div className="pt-2">
                      <div className="flex gap-3">
                        <motion.div
                          className="flex flex-col items-center justify-between self-stretch overflow-hidden rounded-full bg-black/20 py-1.5"
                          initial={false}
                          animate={{ width: isCurrent ? 28 : 22 }}
                          transition={{ type: 'spring', stiffness: 280, damping: 26 }}
                        >
                          <motion.span
                            className="rounded-full bg-current"
                            initial={false}
                            animate={{ width: isCurrent ? 12 : 8, height: isCurrent ? 12 : 8 }}
                            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                          />
                          <motion.span
                            className="rounded-full bg-current"
                            initial={false}
                            animate={{ width: isCurrent ? 12 : 8, height: isCurrent ? 12 : 8 }}
                            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                          />
                        </motion.div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="truncate text-sm font-semibold">{item.fromName}</span>
                            <span className="tabular flex-shrink-0 text-sm font-bold">
                              {shiftedClock(leg?.startTime, i)}
                            </span>
                          </div>

                          {stopsBefore > 0 && (
                            <>
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const opening = !openLegs.has(i);
                                  setOpenLegs((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(i)) next.delete(i);
                                    else next.add(i);
                                    return next;
                                  });
                                  void opening;
                                }}
                                className="my-4 flex items-center gap-1 text-xs opacity-80"
                              >
                                <ChevronDownIcon
                                  className={`h-3.5 w-3.5 transition-transform ${
                                    expanded ? 'rotate-180' : ''
                                  }`}
                                />
                                {tx(isFr).navigationMode.stopsbeforeMoreStopValue(stopsBefore, stopsBefore > 1 ? 's' : '')}
                              </span>
                              <AnimatePresence initial={false}>
                                {expanded && (
                                  <motion.ul
                                    className="overflow-hidden text-sm opacity-80"
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{
                                      height: { type: 'spring', stiffness: 320, damping: 34 },
                                      opacity: { duration: 0.18 },
                                    }}
                                  >
                                    {leg.intermediateStops.map((stop: any, s: number) => (
                                      <motion.li
                                        key={s}
                                        className="truncate pb-2.5"
                                        initial={{ opacity: 0, x: -8 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.06 + s * 0.03, duration: 0.2 }}
                                      >
                                        {stop?.name ?? ''}
                                      </motion.li>
                                    ))}
                                  </motion.ul>
                                )}
                              </AnimatePresence>
                            </>
                          )}
                          <div className={stopsBefore === 0 ? 'h-16' : 'h-8'} />

                          <div className="flex items-baseline justify-between gap-3">
                            <span className="truncate text-sm font-semibold">
                              {leg?.to?.name ?? ''}
                            </span>
                            <span className="tabular flex-shrink-0 text-sm font-bold">
                              {shiftedClock(leg?.endTime, i)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {i === activeTransitIndex && showDelay && (
                        <span
                          className="tabular mt-2.5 inline-block rounded-full bg-black/20 px-2 py-0.5 text-[0.6875rem] font-bold"
                          title={
                            tx(isFr).navigationMode.basedOnSamplesizeTraveller(lineDelay!.sampleSize)
                          }
                        >
                          {delayMinutes > 0
                            ? tx(isFr).navigationMode.delayminutesMinObserved(delayMinutes)
                            : tx(isFr).navigationMode.absMinEarly(Math.abs(delayMinutes))}
                        </span>
                      )}
                    </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>

        <MapSheet
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          isLight={theme !== 'dark'}
          zIndex={10050}
        >
              <div className="flex-1 overflow-y-auto px-5 pb-6">
                <h2 className="mb-4 text-lg font-black" style={{ color: skin.ink }}>
                  {tx(isFr).navigationMode.navigationSettings}
                </h2>
                {index < steps.length - 1 && (
                  <button
                    onClick={() => {
                      setIndex((i) => Math.min(i + 1, steps.length - 1));
                      setIsSettingsOpen(false);
                    }}
                    className="mb-6 flex w-full items-center justify-between rounded-2xl px-4 py-3.5 text-left"
                    style={{ backgroundColor: skin.chip, color: skin.ink }}
                  >
                    <span className="text-sm font-bold" style={{ color: skin.ink }}>
                      {tx(isFr).navigationMode.skipToNextStep}
                    </span>
                    <span className="truncate pl-3 text-xs text-slate-400">
                      {steps[index + 1]?.kind === 'transit'
                        ? steps[index + 1]?.lineShortName
                        : steps[index + 1]?.instruction}
                    </span>
                  </button>
                )}

                <button
                  onClick={async () => {
                    if (notifyOn) {
                      setNotificationsEnabled(false);
                      setNotifyOn(false);
                      return;
                    }
                    const granted = await requestNotificationPermission();
                    setNotificationsEnabled(granted);
                    setNotifyOn(granted);
                  }}
                  className="mb-6 flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-left"
                    style={{ backgroundColor: skin.chip, color: skin.ink }}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-bold" style={{ color: skin.ink }}>
                      {tx(isFr).navigationMode.tripAlerts}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-400">
                      {tx(isFr).navigationMode.leaveNowYourBus}
                    </span>
                  </span>
                  <span
                    className={`flex h-6 w-11 flex-shrink-0 items-center rounded-full px-0.5 transition-colors ${
                      notifyOn ? 'bg-emerald-500' : 'bg-slate-600'
                    }`}
                  >
                    <motion.span
                      className="h-5 w-5 rounded-full bg-white"
                      animate={{ x: notifyOn ? 20 : 0 }}
                      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                    />
                  </span>
                </button>

                {voiceSupported() && (
                  <button
                    onClick={() => {
                      const next = !voiceOn;
                      setVoiceEnabled(next);
                      setVoiceOn(next);
                      if (next) {
                        speak(
                          tx(isFr).navigationMode.directionsWillBeSpoken,
                          language
                        );
                      }
                    }}
                    className="mb-6 flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-left"
                    style={{ backgroundColor: skin.chip, color: skin.ink }}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-bold" style={{ color: skin.ink }}>
                        {tx(isFr).navigationMode.spokenDirections}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-400">
                        {tx(isFr).navigationMode.takeTheC1Toward}
                      </span>
                    </span>
                    <span
                      className={`flex h-6 w-11 flex-shrink-0 items-center rounded-full px-0.5 transition-colors ${
                        voiceOn ? 'bg-emerald-500' : 'bg-slate-600'
                      }`}
                    >
                      <motion.span
                        className="h-5 w-5 rounded-full bg-white"
                        animate={{ x: voiceOn ? 20 : 0 }}
                        transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                      />
                    </span>
                  </button>
                )}

                <p className="signal-label mb-1 text-slate-500">
                  {tx(isFr).navigationMode.walkingPriority}
                </p>
                <StepSlider
                  count={WALK_PRIORITIES.length}
                  value={walkPrefs.priorityIndex}
                  emoji={WALK_PRIORITIES[walkPrefs.priorityIndex].emoji}
                  color="#3b82f6"
                  ariaLabel={tx(isFr).navigationMode.walkingPriority}
                  onChange={(priorityIndex) => updateWalkPrefs({ ...walkPrefs, priorityIndex })}
                />
                <p className="mt-2 text-center text-sm font-bold" style={{ color: skin.ink }}>
                  {WALK_PRIORITIES[walkPrefs.priorityIndex].label(isFr)}
                </p>
                <p className="mb-6 mt-0.5 text-center text-xs text-slate-400">
                  {WALK_PRIORITIES[walkPrefs.priorityIndex].hint(isFr)}
                </p>

                <p className="signal-label mb-1 text-slate-500">
                  {tx(isFr).navigationMode.walkingSpeed}
                </p>
                <StepSlider
                  count={WALK_SPEEDS.length}
                  value={walkPrefs.speedIndex}
                  emoji={WALK_SPEEDS[walkPrefs.speedIndex].emoji}
                  color="#22c55e"
                  ariaLabel={tx(isFr).navigationMode.walkingSpeed}
                  onChange={(speedIndex) => updateWalkPrefs({ ...walkPrefs, speedIndex })}
                />
                <p className="mt-2 text-center text-sm font-bold text-white">
                  {WALK_SPEEDS[walkPrefs.speedIndex].label(isFr)}
                </p>
                <p className="tabular mb-4 mt-0.5 text-center text-xs text-slate-400">
                  {WALK_SPEEDS[walkPrefs.speedIndex].kmh.toLocaleString('fr-FR', {
                    minimumFractionDigits: 1,
                  })}{' '}
                  km/h
                </p>

                <p className="pb-2 text-center text-[0.6875rem] leading-snug text-slate-500">
                  {tx(isFr).navigationMode.theseSettingsStayOn}
                </p>
              </div>
        </MapSheet>

        <MapSheet
          isOpen={isHelpedSheetOpen}
          onClose={() => setIsHelpedSheetOpen(false)}
          isLight={theme !== 'dark'}
          zIndex={10050}
        >
          <div className="flex flex-1 flex-col items-center px-5 pb-8 pt-5 text-center" style={{ fontFamily: "Inter, 'Helvetica Neue', sans-serif" }}>
            <div className="relative mt-3 h-44 w-72" aria-hidden="true">
              {AVATARS.slice(0, Math.min(6, travellersHelpedNow)).map((avatar, index, faces) => {
                const angle = faces.length === 1 ? -90 : -155 + (130 * index) / (faces.length - 1);
                const radians = (angle * Math.PI) / 180;
                const x = Math.cos(radians) * 104;
                const y = Math.sin(radians) * 78;
                return (
                  <motion.span
                    key={`${avatar}-${index}`}
                    className="absolute left-1/2 top-[78%] flex h-12 w-12 items-center justify-center rounded-full border-4 border-white bg-white text-xl shadow-[0_5px_18px_rgba(0,0,0,0.22)]"
                    initial={{ opacity: 0, scale: 0.65, x: x * 0.7, y: y * 0.7 }}
                    animate={{ opacity: 1, scale: 1, x, y: [y, y - 5, y] }}
                    transition={{
                      opacity: { duration: 0.35, delay: index * 0.06 },
                      scale: { duration: 0.35, delay: index * 0.06 },
                      x: { duration: 0.35, delay: index * 0.06 },
                      y: { duration: 2.4 + index * 0.16, repeat: Infinity, ease: 'easeInOut', delay: index * 0.08 },
                    }}
                  >
                    {avatar}
                  </motion.span>
                );
              })}
            </div>

            <motion.p
              className="tabular-nums text-[3.5rem] font-black leading-none"
              style={{ color: skin.ink }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <AnimatedCount value={travellersHelpedNow} />
            </motion.p>
            <p className="mt-5 max-w-sm text-[0.9375rem] leading-relaxed" style={{ color: skin.muted }}>
              {tx(isFr).navigationMode.theseAreTheTravellers}
            </p>
          </div>
        </MapSheet>

        <AnimatePresence>
          {false && isExitDialogOpen && (
            <motion.div
              className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 px-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsExitDialogOpen(false)}
            >
              <motion.div
                className="w-full max-w-sm rounded-[2rem] border border-white/10 bg-slate-950 p-5 text-white shadow-[0_30px_100px_rgba(0,0,0,0.45)]"
                initial={{ y: 18, scale: 0.98 }}
                animate={{ y: 0, scale: 1 }}
                exit={{ y: 18, scale: 0.98 }}
                transition={{ duration: 0.2 }}
                onClick={e => e.stopPropagation()}
              >
                <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.22em] text-white/40">
                  {tx(isFr).navigationMode.tripInProgress}
                </p>
                <h3 className="mt-2 text-[1.375rem] font-black leading-tight">
                  {tx(isFr).navigationMode.doYouWantTo}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-white/65">
                  {tx(isFr).navigationMode.guidanceWillStopAnd}
                </p>
                <div className="mt-5">
                  <button
                    type="button"
                    onClick={() => {
                      setIsExitDialogOpen(false);
                      handleClose();
                    }}
                    className="w-full rounded-2xl bg-red-500 px-4 py-3 text-sm font-black text-white shadow-[0_10px_30px_rgba(239,68,68,0.28)]"
                  >
                    {tx(isFr).navigationMode.endTrip}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setIsExitDialogOpen(false)}
                  className="mt-3 w-full text-center text-xs font-semibold text-white/45"
                >
                  {tx(isFr).navigationMode.cancel}
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <AnimatePresence>
        {showCompact && (
          <motion.div
            className="fixed inset-x-3 z-[1105] pointer-events-none"
            style={{
              bottom: 'calc(max(env(safe-area-inset-bottom), 0.75rem) + 4.75rem)',
              fontFamily: "Inter, 'Helvetica Neue', sans-serif",
            }}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
          >
            <button
              type="button"
              onClick={onRestore}
              className="pointer-events-auto w-full rounded-3xl border border-slate-800 bg-slate-950 px-4 py-4 text-left text-white shadow-[0_18px_50px_rgba(0,0,0,0.28)]"
              aria-label={tx(isFr).navigationMode.reopenNavigation}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.22em] text-white/45">
                    {tx(isFr).navigationMode.navigationMinimized}
                  </p>
                  <h3 className="mt-1 truncate text-[1.125rem] font-black leading-tight">
                    {compactTitle}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-sm leading-snug text-white/72">
                    {compactSubtitle}
                  </p>
                </div>
                <span className="rounded-full bg-white/8 px-3 py-1 text-[0.6875rem] font-bold text-white/80">
                  {tx(isFr).navigationMode.tapToReopen}
                </span>
              </div>

              <div className="mt-4 rounded-2xl bg-slate-900 px-3 py-3">
                <div className="mb-2 flex items-center justify-between text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-white/45">
                  <span>{tx(isFr).navigationMode.nextActions}</span>
                  <span className="tabular-nums">
                    {tx(isFr).navigationMode.stepMinLength(Math.min(index + 1, steps.length), steps.length)}
                  </span>
                </div>
                <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {steps.slice(index, Math.min(steps.length, index + 5)).map((miniStep, miniIndex) => {
                    const absoluteIndex = index + miniIndex;
                    const active = absoluteIndex === index;
                    const label =
                      miniStep.kind === 'transit'
                        ? (miniStep.lineShortName ?? 'Transit')
                        : miniStep.kind === 'walk'
                        ? (tx(isFr).navigationMode.walk2)
                        : miniStep.kind === 'arrival'
                        ? (tx(isFr).navigationMode.arrival)
                        : miniStep.instruction;
                    const time =
                      miniStep.kind === 'transit'
                        ? shiftedClock((itinerary.allLegs as any[])?.[absoluteIndex]?.startTime, absoluteIndex)
                        : '';
                    return (
                      <div
                        key={`${absoluteIndex}-${label}`}
                        className={`flex flex-shrink-0 items-center gap-2 rounded-2xl px-3 py-2 ${
                          active ? 'bg-white text-slate-950' : 'bg-white/8 text-white/82'
                        }`}
                      >
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            active ? 'bg-emerald-500' : 'bg-white/35'
                          }`}
                        />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold">{label}</div>
                          <div className="text-[0.6875rem] text-white/55">
                            {time || compactActionLabel || (tx(isFr).navigationMode.upcoming)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </AnimatePresence>
  );
}

function AnimatedCount({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  const previousRef = useRef(0);

  useEffect(() => {
    const start = previousRef.current;
    const startedAt = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min((now - startedAt) / 480, 1);
      setShown(Math.round(start + (value - start) * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(tick);
      else previousRef.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <span className="tabular-nums">{shown}</span>;
}
