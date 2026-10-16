import { CITY_SITE, SITE_CENTER } from '../site';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, MotionConfig, animate, useMotionTemplate, useMotionValue, type PanInfo } from 'framer-motion';
import MapLibreMap, { Marker, Source, Layer } from 'react-map-gl/maplibre';
import type { MapRef } from 'react-map-gl/maplibre';
import type { SheetRef } from 'react-modal-sheet';
import {
  ArrowUpOnSquareIcon,
  MapPinIcon,
  XMarkIcon,
  Cog6ToothIcon,
  CheckIcon,
} from '@heroicons/react/24/solid';
import { formatMinutesCompact } from '../utils/formatDuration';
import { FaWalking } from 'react-icons/fa';
import { AVATARS, randomPseudo } from '../services/account';
import { openExternal } from '../utils/openExternal';
import { PASS_SHOP_URL } from '../services/config';
import { getDepartures, getStopPointDepartures, type RouteItinerary } from '../services/api';
import type { Departure } from '../types';
import type { AllLinesLine } from '../services/allLines';
import { resolveRouteLine } from '../utils/routeLineResolver';
import { publishObservation, getLineDelay, type LineDelay } from '../services/liveTiming';
import { getCrowdConfidence, type CrowdConfidence } from '../services/crowdSignals';
import { useWakeLock } from '../hooks/useWakeLock';
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
import { ScrollingText } from './ScrollingText';
import type { TripSurveyLeg } from '../services/cms';
import {
  WALK_SPEEDS,
  WALK_PRIORITIES,
  loadWalkPreferences,
  saveWalkPreferences,
  type WalkPreferences,
} from '../services/walkPreferences';
import { EMPTY_LIVE, joinLiveLine, normalizeLiveStop, type LiveLine, type LiveSnapshot } from '../services/livePresence';
import {
  isShareAvailable,
  loadShareName,
  loadStoredShare,
  openShareSender,
  saveShareName,
  shareUrl,
  type ShareEvent,
  type SharePayload,
  type ShareSender,
} from '../services/tripShare';
import { DARK_NAV_MAP_STYLE_URL, LIGHT_NAV_MAP_STYLE_URL } from '../utils/navMapStyles';
import type { ShareTimelineStep } from '../services/tripShare';
import {
  Avatars,
  EndpointDot,
  GuidancePopup,
  MiniTimeline,
  type MiniSegment,
  Card,
  GuidanceSheet,
  LinePlate,
  LiveIcon,
  OptionRow,
  StopTimeline,
  Toggle,
  VehicleTracker,
  type NavLine,
  type RunChip,
} from './navigation/GuidanceParts';
import { COLLAPSED_SHEET_PX, GUIDANCE_SNAP, navPalette } from './navigation/palette';
import { readableTextColor } from './LineBadge';
import { tx } from '../i18n';
import { onDevCommand } from '../utils/devCommands';

const HELPED_STORAGE_PREFIX = 'greLines_navigationHelped:';

const LIVE_AVATAR = (() => {
  const key = 'greLines_liveAvatar';
  try {
    const saved = localStorage.getItem(key);
    if (saved && AVATARS.includes(saved)) return saved;
    const picked = AVATARS[Math.floor(Math.random() * AVATARS.length)] ?? AVATARS[0];
    localStorage.setItem(key, picked);
    return picked;
  } catch {
    return AVATARS[0];
  }
})();

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

type Phase = 'walk' | 'wait' | 'ride' | 'arrived';

interface NavStep {
  kind: StepKind;
  instruction: string;
  detail: string;
  headsign?: string;
  durationMin: number;
  color: string;
  textColor: string;
  lineId?: string;
  lineShortName?: string;
  mode?: string;
  fromName?: string;
  toName?: string;
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

const WAIT_RADIUS_M = 30;

const WALK_COLOR = '#94a3b8';
const ARRIVAL_COLOR = '#22c55e';

const FOLLOW_ZOOM = 17.5;
const FOLLOW_PITCH = 55;

const FOLLOW_LOOK_AHEAD_METERS = 30;

const FOLLOW_RESUME_MS = 8000;

const SHEET_TOUCH_GRACE_MS = 20000;

const SHARE_PUSH_MS = 1000;

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

function alongPath(path: Array<[number, number]>, point: [number, number], maxOffMeters = 120): number | null {
  if (path.length < 2) return null;
  let bestDistance = Infinity;
  let bestAlong = 0;
  let travelled = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const ax = (path[i][0] - point[0]) * METRES_PER_DEG_LON_AT_45;
    const ay = (path[i][1] - point[1]) * METRES_PER_DEG_LAT;
    const bx = (path[i + 1][0] - point[0]) * METRES_PER_DEG_LON_AT_45;
    const by = (path[i + 1][1] - point[1]) * METRES_PER_DEG_LAT;
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSq));
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    const distance = Math.sqrt(cx * cx + cy * cy);
    const segment = Math.sqrt(lengthSq);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestAlong = travelled + t * segment;
    }
    travelled += segment;
  }
  return bestDistance <= maxOffMeters ? bestAlong : null;
}

function pathLength(path: Array<[number, number]>): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += coordinateDistance(path[i - 1], path[i]);
  return total;
}

const SMOOTHING_MIN_MS = 400;
const SMOOTHING_MAX_MS = 3000;
const SMOOTHING_TELEPORT_METERS = 300;

const NOTCH_DEBUG_KEY = 'greLines_debugNotch';
const ISLAND_SIDE = 10;
const NOTCH_MIN_SAFE_TOP = 40;
const ISLAND_GAP = 12;
const ISLAND_SHEET_GAP = 76;
const STATUS_FADE_PX = 28;
const ISLAND_SIDE_COMPACT = 30;
const ISLAND_SWIPE_PX = 24;
const ISLAND_SWIPE_SPEED = 300;
const ISLAND_MORPH_MS = 700;
const ISLAND_CLOSE_MS = 420;
const ISLAND_SPRING = { type: 'spring', stiffness: 380, damping: 36 } as const;
const ISLAND_TITLE_PX = { compact: 17, full: 22 };
const ISLAND_VALUE_PX = { compact: 17, full: 24 };

interface Cutout {
  top: number;
  width: number;
  height: number;
  radius: number;
}

// estimate the camera cutout of this phone
function cutoutFor(safeTop: number): Cutout {
  let forced = false;
  try {
    forced = Boolean(localStorage.getItem(NOTCH_DEBUG_KEY));
  } catch {
  }
  const apple =
    forced ||
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (apple && safeTop >= 51) return { top: 11, width: 126, height: 37, radius: 44 };
  if (apple) return { top: 0, width: 164, height: Math.max(24, Math.min(32, safeTop - 14)), radius: 34 };
  const top = Math.max(4, Math.round(safeTop * 0.2));
  return { top, width: 40, height: Math.max(20, safeTop - top * 2), radius: 30 };
}

function useSafeAreaTop(): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none';
    document.body.appendChild(probe);
    const measure = () => {
      let forced = 0;
      try {
        forced = Number(localStorage.getItem(NOTCH_DEBUG_KEY)) || 0;
      } catch {
      }
      setValue(forced > 0 ? forced : probe.offsetHeight);
    };
    measure();
    window.addEventListener('resize', measure);
    const offDev = onDevCommand('nav.notch', measure);
    return () => {
      window.removeEventListener('resize', measure);
      offDev();
      probe.remove();
    };
  }, []);
  return value;
}

function glideDuration(lastAtRef: { current: number }): number {
  const at = performance.now();
  const gap = lastAtRef.current ? at - lastAtRef.current : SMOOTHING_MIN_MS;
  lastAtRef.current = at;
  return Math.max(SMOOTHING_MIN_MS, Math.min(SMOOTHING_MAX_MS, gap));
}

function useGlideTiming(target: [number, number] | null, glideRef: { current: number }) {
  const lastAtRef = useRef(0);
  useEffect(() => {
    glideRef.current = glideDuration(lastAtRef);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.[0], target?.[1]]);
}

// glide the position marker between location fixes
function GlidingMarker({ target, children }: { target: [number, number]; children: ReactNode }) {
  const [shown, setShown] = useState<[number, number]>(target);
  const currentRef = useRef<[number, number]>(target);
  const lastAtRef = useRef(0);
  const frameRef = useRef(0);

  useEffect(() => {
    const duration = glideDuration(lastAtRef);
    const from = currentRef.current;
    if (coordinateDistance(from, target) > SMOOTHING_TELEPORT_METERS) {
      currentRef.current = target;
      setShown(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const next: [number, number] = [
        from[0] + (target[0] - from[0]) * progress,
        from[1] + (target[1] - from[1]) * progress,
      ];
      currentRef.current = next;
      setShown(next);
      if (progress < 1) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target[0], target[1]]);

  return (
    <Marker longitude={shown[0]} latitude={shown[1]}>
      {children}
    </Marker>
  );
}

function angleGap(a: number, b: number): number {
  const diff = Math.abs(((a - b) % 360) + 360) % 360;
  return diff > 180 ? 360 - diff : diff;
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

const SPIKE_MIN_METERS = 40;
const SPIKE_RATIO = 0.3;
const SPIKE_MAX_ANGLE = 45;
const SPIKE_MIN_ARM_METERS = 15;

function turnAngle(a: [number, number], b: [number, number], c: [number, number]): number {
  const ax = (a[0] - b[0]) * METRES_PER_DEG_LON_AT_45;
  const ay = (a[1] - b[1]) * METRES_PER_DEG_LAT;
  const cx = (c[0] - b[0]) * METRES_PER_DEG_LON_AT_45;
  const cy = (c[1] - b[1]) * METRES_PER_DEG_LAT;
  const lengths = Math.hypot(ax, ay) * Math.hypot(cx, cy);
  if (lengths === 0) return 180;
  const cos = Math.max(-1, Math.min(1, (ax * cx + ay * cy) / lengths));
  return (Math.acos(cos) * 180) / Math.PI;
}

function despike(path: Array<[number, number]>): Array<[number, number]> {
  if (path.length < 3) return path;
  let current = path;
  for (let pass = 0; pass < 3; pass++) {
    const kept: Array<[number, number]> = [current[0]];
    for (let i = 1; i < current.length - 1; i++) {
      const a = kept[kept.length - 1];
      const b = current[i];
      const c = current[i + 1];
      const ab = coordinateDistance(a, b);
      const bc = coordinateDistance(b, c);
      const out = ab + bc;
      if (out > SPIKE_MIN_METERS && coordinateDistance(a, c) < out * SPIKE_RATIO) continue;
      if (Math.min(ab, bc) > SPIKE_MIN_ARM_METERS && turnAngle(a, b, c) < SPIKE_MAX_ANGLE) continue;
      kept.push(b);
    }
    kept.push(current[current.length - 1]);
    if (kept.length === current.length) return kept;
    current = kept;
  }
  return current;
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

function downsamplePath(path: Array<[number, number]>, max = 180): Array<[number, number]> {
  if (path.length <= max) return path.map(([lon, lat]) => [Number(lon.toFixed(5)), Number(lat.toFixed(5))]);
  const stride = path.length / max;
  const picked: Array<[number, number]> = [];
  for (let i = 0; i < max; i++) picked.push(path[Math.floor(i * stride)]);
  picked.push(path[path.length - 1]);
  return picked.map(([lon, lat]) => [Number(lon.toFixed(5)), Number(lat.toFixed(5))]);
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
    const routed = leg?.legGeometry?.points ? decodePolyline(leg.legGeometry.points) : [];
    const drawn = legPaths?.get(legIndex) ?? [];
    const path = despike(leg.mode !== 'WALK' && drawn.length > 1 ? drawn : routed.length > 1 ? routed : drawn);

    if (leg.mode === 'WALK') {
      return {
        kind: 'walk',
        instruction: cleanPlace(leg.to?.name)
          ? `${tx(isFr).navigationMode.walkTo} ${cleanPlace(leg.to?.name)}`
          : (tx(isFr).navigationMode.walk),
        detail: cleanPlace(leg.to?.name) ? `${tx(isFr).navigationMode.to} ${cleanPlace(leg.to?.name)}` : '',
        durationMin,
        color: '#64748b',
        textColor: '#ffffff',
        fromName: cleanPlace(leg.from?.name),
        toName: cleanPlace(leg.to?.name) ?? cleanPlace(itinerary.arrName),
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
    const color = line?.color || '#3b82f6';

    return {
      kind: 'transit',
      instruction: tx(isFr).navigationMode.takeShortname(shortName),
      detail: leg.to?.name ? `${tx(isFr).navigationMode.getOffAt} ${leg.to.name}` : '',
      headsign: leg.headsign,
      durationMin,
      color,
      textColor: line?.textColor || readableTextColor(color),
      lineId: line?.id || String(leg.routeId || shortName),
      lineShortName: shortName,
      mode: leg.mode,
      fromName: leg.from?.name,
      toName: leg.to?.name,
      path,
    };
  });

  steps.push({
    kind: 'arrival',
    instruction: tx(isFr).navigationMode.youHaveArrived,
    detail: itinerary.arrName || '',
    durationMin: 0,
    color: '#16a34a',
    textColor: '#ffffff',
    path: [],
  });

  return steps;
}

function stopLabel(name: unknown): string {
  const text = String(name ?? '').trim();
  const comma = text.indexOf(', ');
  return comma > 0 && comma < text.length - 2 ? text.slice(comma + 2) : text;
}

function navLineOf(step: NavStep | undefined): NavLine | null {
  if (!step || step.kind !== 'transit' || !step.lineShortName) return null;
  return {
    id: step.lineId || step.lineShortName,
    shortName: step.lineShortName,
    color: step.color,
    textColor: step.textColor,
  };
}

interface BannerContent {
  leading: ReactNode;
  label?: string;
  title: string;
  subtitle?: string;
  value?: string;
  live?: boolean;
  footer?: string;
  accent?: string;
  big?: boolean;
}

const HEADLINE = { fontSize: '1.875rem', lineHeight: 1.15, fontWeight: 500, margin: 0 } as const;

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
  const t = tx(isFr).navigationMode;
  const isLight = theme !== 'dark';
  const palette = navPalette(isLight);
  const mapRef = useRef<MapRef>(null);
  const sheetRef = useRef<SheetRef>(null);
  const sheetTouchedRef = useRef(0);
  const safeTop = useSafeAreaTop();
  const cutout = useMemo(() => cutoutFor(safeTop), [safeTop]);
  const [islandCompact, setIslandCompact] = useState(false);
  const [questionsHiddenFor, setQuestionsHiddenFor] = useState<string | null>(null);
  const [islandMorph, setIslandMorph] = useState(false);
  const [islandClosing, setIslandClosing] = useState(false);

  useEffect(() => {
    if (!isOpen || safeTop < NOTCH_MIN_SAFE_TOP) return;
    const metas = Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'));
    const previous = metas.map(meta => meta.content);
    for (const meta of metas) meta.content = '#000000';
    return () => metas.forEach((meta, i) => { meta.content = previous[i]; });
  }, [isOpen, safeTop]);
  const islandMorphTimerRef = useRef(0);
  const islandPull = useMotionValue(0);
  const islandTail = useMotionTemplate`max(4px, calc(var(--island-pad) + ${islandPull}px))`;
  const helpedStorageKey = useMemo(() => navigationHelpedStorageKey(itinerary), [itinerary]);
  const steps = useMemo(
    () => buildSteps(itinerary, isFr, stops, lineLookup, legPaths),
    [itinerary, isFr, stops, lineLookup, legPaths]
  );
  const [index, setIndex] = useState(() => loadNavigationStep(itinerary));
  const [hasStarted, setHasStarted] = useState(false);
  const [pickedRuns, setPickedRuns] = useState<Map<number, number>>(new Map());
  const [runs, setRuns] = useState<Departure[]>([]);
  const [scheduleRuns, setScheduleRuns] = useState<Map<number, number[]>>(new Map());
  const [upstreamStops, setUpstreamStops] = useState<Map<number, string[]>>(new Map());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [sheetSnap, setSheetSnap] = useState<number>(GUIDANCE_SNAP.middle);
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareStepDirection, setShareStepDirection] = useState(1);
  const copiedTimerRef = useRef(0);
  const [answerCount, setAnswerCount] = useState(0);
  const [travellersHelpedNow, setTravellersHelpedNow] = useState(() => loadNavigationHelped(helpedStorageKey));
  const [notifyOn, setNotifyOn] = useState(() => notificationsEnabled() && notificationPermission() === 'granted');
  const [voiceOn, setVoiceOn] = useState(() => voiceEnabled());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isOpen) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 10000);
    return () => window.clearInterval(timer);
  }, [isOpen]);

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

  const [isFollowing, setIsFollowing] = useState(true);
  const boardedTransitKeyRef = useRef<string | null>(null);
  const lastCameraLocationRef = useRef<[number, number] | null>(null);
  const animateRecenterRef = useRef(false);

  useWakeLock(isOpen && hasStarted);

  useEffect(() => {
    if (isOpen) {
      setIndex(Math.min(loadNavigationStep(itinerary), Math.max(0, steps.length - 1)));
      setHasStarted(true);
      setPickedRuns(new Map());
      setAnswerCount(0);
      setIslandClosing(false);
      setIslandCompact(false);
      arrivedRef.current = false;
      notifiedRef.current.clear();
      boardedTransitKeyRef.current = null;
      atStopRef.current = null;
    }
    setIsShareOpen(false);
    setShareNotice(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const glideRef = useRef(1000);
  const cameraBearingRef = useRef<number | null>(null);
  useGlideTiming(snappedLocation, glideRef);

  const lastFixRef = useRef<{ lat: number; lon: number; at: number } | null>(null);
  const [speedMps, setSpeedMps] = useState(0);

  useEffect(() => {
    if (!currentLocation) return;
    const fixAt = Date.now();
    const previous = lastFixRef.current;
    lastFixRef.current = { lat: currentLocation.lat, lon: currentLocation.lon, at: fixAt };
    if (!previous) return;
    const elapsed = (fixAt - previous.at) / 1000;
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

    const current = steps[index];
    if (current && current.path.length > 1 && current.kind !== 'arrival') {
      const end = current.path[current.path.length - 1];
      const nextKind = steps[index + 1]?.kind;
      if (nextKind === 'arrival' && coordinateDistance(here, end) < 25 && best === index) best = index + 1;
      if (current.kind === 'transit' && nextKind === 'walk' && coordinateDistance(here, end) < 20 && speedMps < 2 && best === index) {
        best = index + 1;
      }
    }

    if (best !== index && (currentDistance - bestDistance > 30 || steps[best]?.kind !== 'walk' || best === index + 1)) setIndex(best);
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
        top: isMobile ? 160 : 180,
        bottom: Math.round(window.innerHeight * (isMobile ? 0.5 : 0.4)),
        left: isMobile ? 24 : 48,
        right: isMobile ? 24 : 48,
      },
      bearing: heading,
      duration: 900,
      maxZoom: step.kind === 'walk' ? 17 : 15.8,
    });
  }, [isOpen, index, step, isMobile]);

  useEffect(() => {
    if (!isOpen || !hasStarted || !isFollowing || !snappedLocation) return;
    const map = mapRef.current;
    if (!map) return;

    const here = snappedLocation;
    const shouldAnimate = animateRecenterRef.current;
    animateRecenterRef.current = false;
    const previousCameraLocation = lastCameraLocationRef.current;
    if (!shouldAnimate && previousCameraLocation && coordinateDistance(previousCameraLocation, here) < 1.5) return;
    lastCameraLocationRef.current = here;

    const lookAhead = pointAheadOnPath(step.path, here, FOLLOW_LOOK_AHEAD_METERS);
    const wanted = lookAhead && coordinateDistance(here, lookAhead) > 5 ? bearingBetween(here, lookAhead) : null;
    const previousBearing = cameraBearingRef.current ?? map.getBearing();
    const bearing = wanted !== null && angleGap(wanted, previousBearing) > 12 ? wanted : previousBearing;
    cameraBearingRef.current = bearing;

    map.easeTo({
      center: here,
      bearing,
      zoom: FOLLOW_ZOOM,
      pitch: FOLLOW_PITCH,
      padding: { top: 140, right: 0, bottom: Math.round(window.innerHeight * 0.42), left: 0 },
      duration: shouldAnimate ? 800 : glideRef.current,
      easing: shouldAnimate ? (t: number) => 1 - Math.pow(1 - t, 3) : (t: number) => t,
      essential: true,
    });
  }, [isOpen, hasStarted, isFollowing, snappedLocation, step]);

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
    const observedAt = new Date();

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
        observedAt: observedAt.toISOString(),
        delaySeconds: (observedAt.getTime() - reference.getTime()) / 1000,
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
      setUpstreamStops(new Map());
      return;
    }
    const legs = (itinerary.allLegs as any[]) ?? [];
    const controller = new AbortController();

    void (async () => {
      const collected = new Map<number, number[]>();
      const upstream = new Map<number, string[]>();

      for (let i = 0; i < legs.length; i++) {
        const leg = legs[i];
        if (!leg?.mode || leg.mode === 'WALK') continue;
        const routeId = leg.routeId;
        const stopId = leg.from?.stopId;
        if (!routeId || !stopId) continue;

        const timetable = await getTimetable(String(routeId), { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (!timetable) continue;

        const startOfDay = new Date();
        const midnight = new Date(startOfDay).setHours(0, 0, 0, 0);
        const wantedName = normalizeStopName(leg.from?.name);
        const toName = normalizeStopName(leg.to?.name);

        const matches = timetable.directions.flatMap((direction) => {
          const at = direction.stops.findIndex(
            (entry) => entry.id === stopId || (wantedName !== '' && normalizeStopName(entry.name) === wantedName)
          );
          if (at < 0) return [];
          const forward = direction.stops.slice(at + 1).some((entry) => normalizeStopName(entry.name) === toName);
          return [{ direction, at, forward }];
        });
        const chosen = matches.some((match) => match.forward) ? matches.filter((match) => match.forward) : matches;

        const minutes: number[] = [];
        for (const { direction, at } of chosen) {
          for (const seconds of direction.stops[at].times) {
            if (seconds === null) continue;
            minutes.push(Math.round((midnight + seconds * 1000 - startOfDay.getTime()) / 60000));
          }
          if (!upstream.has(i)) {
            upstream.set(i, direction.stops.slice(Math.max(0, at - 4), at).map((entry) => entry.name));
          }
        }

        if (minutes.length > 0) collected.set(i, minutes.sort((a, b) => a - b));
      }

      if (!controller.signal.aborted) {
        setScheduleRuns(collected);
        setUpstreamStops(upstream);
      }
    })();

    return () => controller.abort();
  }, [isOpen, itinerary.allLegs]);

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

  const arrivalInfoRef = useRef({ answerCount, travellersHelpedNow, helpedStorageKey, onArrived });
  arrivalInfoRef.current = { answerCount, travellersHelpedNow, helpedStorageKey, onArrived };

  const reachedArrival = isOpen && hasStarted && steps.length > 0 && index >= steps.length - 1;

  useEffect(() => {
    if (!reachedArrival || arrivedRef.current) return;
    const timer = window.setTimeout(() => {
      if (arrivedRef.current) return;
      arrivedRef.current = true;
      const info = arrivalInfoRef.current;
      try {
        localStorage.removeItem(info.helpedStorageKey);
      } catch {
      }
      info.onArrived?.({
        observations: observedRef.current.size,
        answers: info.answerCount,
        travellersHelped: info.travellersHelpedNow,
      });
    }, 2400);
    return () => window.clearTimeout(timer);
  }, [reachedArrival]);

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

  const legs = useMemo(() => (itinerary.allLegs as any[]) ?? [], [itinerary.allLegs]);
  const nextStep = steps[index + 1];
  const transitStep = activeTransitIndex >= 0 ? steps[activeTransitIndex] : undefined;
  const transitLine = navLineOf(transitStep);
  const boardingName = String(legs[activeTransitIndex]?.from?.name ?? transitStep?.fromName ?? '');
  const boardingLabel = stopLabel(boardingName);

  const waitingStop = (() => {
    if (step?.kind !== 'walk') return null;
    if (nextStep?.kind !== 'transit') return null;
    const leg: any = legs[index + 1];
    const id = leg?.from?.stopId;
    if (!id) return null;
    const stop = {
      id: String(id),
      name: String(leg?.from?.name ?? ''),
      lineId: nextStep.lineShortName ?? null,
    };

    if (atStopRef.current === stop.id) return stop;

    const lat = Number(leg?.from?.lat);
    const lon = Number(leg?.from?.lon);
    if (!currentLocation || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    const metres = coordinateDistance([currentLocation.lon, currentLocation.lat], [lon, lat]);
    if (metres > STOP_ARRIVAL_M || speedMps > STOP_STILL_MPS) return null;

    atStopRef.current = stop.id;
    return stop;
  })();

  const walkRemaining = (() => {
    if (step?.kind !== 'walk' || !snappedLocation || step.path.length < 2) return null;
    const along = alongPath(step.path, snappedLocation);
    if (along === null) return coordinateDistance(snappedLocation, step.path[step.path.length - 1]);
    return Math.max(0, pathLength(step.path) - along);
  })();

  const ride = useMemo(() => {
    if (step?.kind !== 'transit') return null;
    const leg: any = legs[index];
    const onLeg = [...(leg?.intermediateStops ?? []), leg?.to]
      .filter(Boolean)
      .map((stop: any) => ({
        name: String(stop?.name ?? ''),
        lat: Number(stop?.lat),
        lon: Number(stop?.lon),
      }));
    let remaining = onLeg;
    let lastPassed = String(leg?.from?.name ?? '');
    let passedAny = false;
    let toFinal: number | null = null;
    let travelled: number | null = null;
    if (snappedLocation && step.path.length > 1) {
      const userAlong = alongPath(step.path, snappedLocation);
      if (userAlong !== null) {
        travelled = userAlong;
        const ahead: typeof onLeg = [];
        for (const stop of onLeg) {
          const stopAlong = Number.isFinite(stop.lat) && Number.isFinite(stop.lon)
            ? alongPath(step.path, [stop.lon, stop.lat])
            : null;
          if (stopAlong === null || stopAlong > userAlong + 25) ahead.push(stop);
          else {
            lastPassed = stop.name;
            passedAny = true;
          }
        }
        remaining = ahead.length > 0 ? ahead : onLeg.slice(-1);
      }
      const final = onLeg[onLeg.length - 1];
      if (final && Number.isFinite(final.lat) && Number.isFinite(final.lon)) {
        toFinal = coordinateDistance(snappedLocation, [final.lon, final.lat]);
      }
    }
    const upcoming = new Set(remaining);
    const all = [
      { name: String(leg?.from?.name ?? ''), passed: true },
      ...onLeg.map((stop) => ({ name: stop.name, passed: !upcoming.has(stop) })),
    ];
    return { stops: remaining, all, lastPassed, passedAny, toFinal, travelled };
  }, [step, index, legs, snappedLocation]);

  const waitLatchRef = useRef<number | null>(null);
  useEffect(() => {
    waitLatchRef.current = null;
  }, [itinerary]);
  const departedFromStart = ride?.passedAny || (ride?.travelled ?? 0) > 60 || speedMps > 2.5;

  const phase: Phase =
    step?.kind === 'arrival'
      ? 'arrived'
      : step?.kind === 'transit'
      ? index === 0 && !departedFromStart && Boolean(currentLocation)
        ? 'wait'
        : 'ride'
      : nextStep?.kind === 'transit' && (waitLatchRef.current === index || waitingStop || (walkRemaining !== null && walkRemaining < WAIT_RADIUS_M))
      ? 'wait'
      : 'walk';
  if (phase === 'wait' && step?.kind === 'walk') waitLatchRef.current = index;

  const stopsLeft = ride?.stops.length ?? 0;
  const preparing = phase === 'ride' && stopsLeft <= 1;
  const alightNow = preparing && ride?.toFinal != null && ride.toFinal < 80;

  const [live, setLive] = useState<LiveSnapshot>(EMPTY_LIVE);
  const liveRef = useRef<LiveLine | null>(null);
  const liveKey = isOpen && transitStep?.lineShortName ? `${transitStep.lineShortName}|${transitStep.headsign ?? ''}` : '';

  useEffect(() => {
    if (!liveKey || !transitStep?.lineShortName) {
      setLive(EMPTY_LIVE);
      return;
    }
    const handle = joinLiveLine(transitStep.lineShortName, transitStep.headsign, setLive);
    liveRef.current = handle;
    return () => {
      handle.leave();
      if (liveRef.current === handle) liveRef.current = null;
      setLive(EMPTY_LIVE);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKey]);

  const liveStateKey =
    phase === 'wait' ? `waiting|${boardingName}` : phase === 'ride' && ride ? `onboard|${ride.lastPassed}` : '';

  useEffect(() => {
    const handle = liveRef.current;
    if (!handle) return;
    if (phase === 'wait' && boardingName) handle.track({ role: 'waiting', stop: boardingName, avatar: LIVE_AVATAR });
    else if (phase === 'ride' && ride) handle.track({ role: 'onboard', stop: ride.lastPassed, avatar: LIVE_AVATAR });
    else handle.track(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveStateKey, liveKey]);

  const lastPhaseRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isOpen) {
      lastPhaseRef.current = null;
      return;
    }
    const signature = `${phase}:${preparing ? 'p' : ''}`;
    const previous = lastPhaseRef.current;
    lastPhaseRef.current = signature;
    if (previous === null || previous === signature) return;

    if (preparing && !previous.endsWith('p')) {
      try {
        navigator.vibrate?.([90, 70, 90]);
      } catch {
      }
      if (ride?.stops[0]?.name) speak(`${t.nextStop}, ${ride.stops[0].name}. ${t.prepareToGetOff}.`, language);
    }

    if (Date.now() - sheetTouchedRef.current < SHEET_TOUCH_GRACE_MS) return;
    const target =
      phase === 'walk' || preparing ? GUIDANCE_SNAP.collapsed : GUIDANCE_SNAP.middle;
    sheetRef.current?.snapTo(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, phase, preparing]);

  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareName, setShareName] = useState(loadShareName);
  const [fallbackName] = useState(() => randomPseudo());
  const senderRef = useRef<ShareSender | null>(null);
  const shareEventsRef = useRef<ShareEvent[]>([]);
  const sharePayloadRef = useRef<(() => SharePayload) | null>(null);
  const rideLegRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const stored = loadStoredShare(helpedStorageKey);
    if (stored) {
      const sender = openShareSender(helpedStorageKey, stored);
      if (sender) {
        senderRef.current = sender;
        setShareToken(sender.token);
      }
    }
    return () => {
      senderRef.current?.close();
      senderRef.current = null;
      setShareToken(null);
    };
  }, [isOpen, helpedStorageKey]);

  useEffect(() => {
    if (!isOpen) {
      shareEventsRef.current = [];
      rideLegRef.current = null;
      return;
    }
    const events = shareEventsRef.current;
    const at = Date.now();
    if (events.length === 0) events.push({ at, text: t.shareEventLeft });
    if (phase === 'ride' && rideLegRef.current !== index) {
      rideLegRef.current = index;
      events.push({ at, text: t.shareEventBoarded(step?.lineShortName ?? '', String(legs[index]?.from?.name ?? '')) });
    }
    if (phase !== 'ride' && rideLegRef.current !== null) {
      events.push({ at, text: t.shareEventAlighted(String(legs[rideLegRef.current]?.to?.name ?? '')) });
      rideLegRef.current = null;
    }
    if (events.length > 8) events.splice(0, events.length - 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, phase, index]);

  useEffect(() => {
    if (!shareToken) return;
    const push = () => {
      const sender = senderRef.current;
      const build = sharePayloadRef.current;
      if (sender && build) sender.send(build());
    };
    push();
    const timer = window.setInterval(push, SHARE_PUSH_MS);
    return () => window.clearInterval(timer);
  }, [shareToken, phase, index]);

  useEffect(() => {
    if (phase !== 'arrived' || !senderRef.current) return;
    const sender = senderRef.current;
    const build = sharePayloadRef.current;
    if (build) sender.send(build());
    sender.end();
    senderRef.current = null;
    setShareToken(null);
  }, [phase]);

  if (!isOpen || steps.length === 0) return null;

  const stopSharing = () => {
    setShareStepDirection(-1);
    senderRef.current?.end();
    senderRef.current = null;
    setShareToken(null);
    setShareNotice(null);
  };

  const handleClose = () => {
    stopSharing();
    if (safeTop < NOTCH_MIN_SAFE_TOP) {
      onClose();
      return;
    }
    setIslandClosing(true);
    window.setTimeout(onClose, ISLAND_CLOSE_MS);
  };

  const copyLink = async (token: string) => {
    const url = shareUrl(token);
    try {
      await navigator.clipboard.writeText(url);
      setShareNotice(null);
      setCopied(true);
      window.clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setShareNotice(url);
    }
  };

  const startShare = () => {
    saveShareName(shareName);
    if (senderRef.current) return;
    const sender = openShareSender(helpedStorageKey);
    if (!sender) {
      setShareNotice(t.shareUnavailable);
      return;
    }
    senderRef.current = sender;
    setShareStepDirection(1);
    setShareToken(sender.token);
  };

  const copyButton = (onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="mt-8 flex h-[3.5rem] w-full items-center justify-center rounded-2xl text-[1.0625rem] font-semibold transition active:scale-[0.98]"
      style={primaryButton}
    >
      <AnimatePresence mode="wait" initial={false}>
        {copied ? (
          <motion.span
            key="copied"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.25 }}
          >
            <CheckIcon className="h-6 w-6" aria-label={t.linkCopied} />
          </motion.span>
        ) : (
          <motion.span
            key="label"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            {t.copyLink}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );

  type RunCard = RunChip;

  const levelForRun = (legIndex: number, minutesFromNow: number | null): 0 | 1 | 2 | 3 => {
    if (minutesFromNow === null) return 0;
    void occupancyReady;
    const leg: any = legs[legIndex];
    const at = new Date(Date.now() + minutesFromNow * 60000);
    return occupancyLevel(
      getOccupancyAt(leg?.from?.stopId, leg?.routeId ?? leg?.route, at, leg?.trip?.directionId)
    );
  };

  const boardingInMinutes = (legIndex: number): number => {
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

  const cardsFor = (legIndex: number): RunCard[] => {
    const plannedMinutes = boardingInMinutes(legIndex);
    const isActive = legIndex === activeTransitIndex;

    const cards: RunCard[] = [];
    if (isActive) {
      for (const run of runs) {
        const minutes = Math.max(0, Math.round(Number(run.departureTime) || 0));
        if (cards.some((card) => card.minutes === minutes)) continue;
        cards.push({ minutes, scheduled: false, level: levelForRun(legIndex, minutes) });
      }
    }

    const schedule = scheduleRuns.get(legIndex) ?? [];
    const from = isActive ? 0 : Math.max(0, plannedMinutes - 30);
    const until = isActive ? 180 : plannedMinutes + 50;
    for (const minutes of schedule) {
      if (minutes < from || minutes > until) continue;
      if (cards.some((card) => card.minutes !== null && Math.abs(card.minutes - minutes) <= 1)) continue;
      cards.push({ minutes, scheduled: true, level: levelForRun(legIndex, minutes) });
    }

    if (cards.length === 0) {
      const minutes = Math.max(0, plannedMinutes);
      cards.push({ minutes, scheduled: true, level: levelForRun(legIndex, minutes) });
    }

    return cards.sort((a, b) => (a.minutes ?? 0) - (b.minutes ?? 0)).slice(0, 8);
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

  const activeCards = activeTransitIndex >= 0 ? cardsFor(activeTransitIndex) : [];
  const defaultRunIndex = closestTo(activeCards, activeTransitIndex >= 0 ? boardingInMinutes(activeTransitIndex) : 0);
  const selectedRun = Math.min(pickedRuns.get(activeTransitIndex) ?? defaultRunIndex, Math.max(0, activeCards.length - 1));
  const shiftMs = (() => {
    const chosen = activeCards[selectedRun]?.minutes;
    const reference = activeCards[defaultRunIndex]?.minutes;
    if (chosen == null || reference == null) return 0;
    return (chosen - reference) * 60000;
  })();
  const nextRunMinutes = activeCards[selectedRun]?.minutes ?? null;

  const shiftedClock = (value: unknown, legIndex: number): string => {
    const base = new Date(value as any).getTime();
    if (!Number.isFinite(base)) return '';
    const shift = legIndex >= index && legIndex >= activeTransitIndex && activeTransitIndex >= 0 ? shiftMs : 0;
    return formatClock(new Date(base + shift).toISOString());
  };

  const lastLeg = legs[legs.length - 1];
  const plannedEnd = lastLeg?.endTime ? new Date(lastLeg.endTime).getTime() : NaN;
  const etaMs = Number.isFinite(plannedEnd) ? plannedEnd + shiftMs : null;
  const etaClock = etaMs ? formatClock(new Date(etaMs).toISOString()) : itinerary.arr;
  const remainingMinutes = phase === 'arrived' ? 0 : etaMs ? Math.max(0, Math.round((etaMs - now) / 60000)) : null;
  const remainingMetres = (() => {
    const currentPath = step?.path ?? [];
    let current = pathLength(currentPath);
    if (step?.kind === 'walk' && walkRemaining !== null) current = walkRemaining;
    if (step?.kind === 'transit' && ride?.travelled != null) current = Math.max(0, current - ride.travelled);
    return Math.round(current + steps.slice(index + 1).reduce((sum, item) => sum + pathLength(item.path), 0));
  })();

  const liveWaitingHere = live.waiting.get(normalizeLiveStop(boardingName)) ?? [];
  const upstream = upstreamStops.get(activeTransitIndex) ?? [];
  const vehicleSighting = (() => {
    const names = [...upstream, boardingName].map(normalizeLiveStop);
    let at: number | null = null;
    let freshest = 0;
    let count = 0;
    for (const peer of live.onboard) {
      const position = names.lastIndexOf(peer.stop);
      if (position < 0) continue;
      count += 1;
      freshest = Math.max(freshest, peer.at);
      if (at === null || position > at) at = position;
    }
    return { at, count, seconds: freshest ? Math.max(0, Math.round((now - freshest) / 1000)) : 0 };
  })();

  const fullPath: Array<[number, number]> = itinerary.routePath?.length
    ? itinerary.routePath
    : steps.flatMap((item) => item.path);

  sharePayloadRef.current = () => {
    const status: SharePayload['status'] =
      phase === 'arrived' ? 'arrived' : phase === 'ride' ? 'onboard' : phase === 'wait' ? 'waiting' : 'walking';
    const headline =
      phase === 'arrived'
        ? t.shareHeadlineArrived(itinerary.arrName || '')
        : phase === 'ride'
        ? t.shareHeadlineOnboard(step?.lineShortName ?? '', step?.headsign ?? '')
        : phase === 'wait'
        ? t.shareHeadlineWaiting(transitStep?.lineShortName ?? '', boardingName)
        : t.shareHeadlineWalking(step?.toName || itinerary.arrName || '');
    const shownLine = phase === 'ride' || phase === 'wait' ? transitLine : null;
    return {
      name: shareName.trim() || fallbackName,
      avatar: LIVE_AVATAR,
      lat: snappedLocation ? Number(snappedLocation[1].toFixed(6)) : null,
      lon: snappedLocation ? Number(snappedLocation[0].toFixed(6)) : null,
      arrivalAt: etaMs,
      destination: itinerary.arrName || '',
      status,
      headline,
      line: shownLine?.shortName ?? null,
      lineColor: shownLine?.color ?? null,
      lineText: shownLine?.textColor ?? null,
      events: shareEventsRef.current.slice(),
      path: downsamplePath(fullPath),
      legs: steps
        .filter((item) => item.kind !== 'arrival')
        .map((item, i) => {
          const leg: any = legs[i];
          const line = navLineOf(item);
          const stopsOnLeg = item.kind === 'transit'
            ? [leg?.from, ...(leg?.intermediateStops ?? []), leg?.to].flatMap((stop: any) => {
                const lat = Number(stop?.lat);
                const lon = Number(stop?.lon);
                return Number.isFinite(lat) && Number.isFinite(lon)
                  ? [[Number(lon.toFixed(5)), Number(lat.toFixed(5))] as [number, number]]
                  : [];
              })
            : [];
          return {
            walk: item.kind !== 'transit',
            color: line?.color ?? '#94a3b8',
            line,
            path: downsamplePath(item.path, 400),
            stops: stopsOnLeg,
          };
        }),
      segments: miniSegments.map((segment) => ({ kind: segment.kind, share: Number(segment.share.toFixed(3)), line: segment.line })),
      progress: Number(miniProgress.toFixed(3)),
      timeline: tripSteps,
      at: Date.now(),
    };
  };

  const stepGeoJSON = {
    type: 'FeatureCollection' as const,
    features: [{ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: step.path } }],
  };
  const futureRouteGeoJSON = {
    type: 'FeatureCollection' as const,
    features: steps
      .map((candidate, i) => ({ candidate, i }))
      .filter(({ candidate, i }) => i !== index && candidate.path.length > 1)
      .map(({ candidate, i }) => ({
        type: 'Feature' as const,
        properties: { color: stepColor(candidate), past: i < index },
        geometry: { type: 'LineString' as const, coordinates: candidate.path },
      })),
  };
  const futureStopsGeoJSON = {
    type: 'FeatureCollection' as const,
    features: legs.flatMap((leg: any, offset: number) => {
      if (!leg?.mode || leg.mode === 'WALK') return [];
      const stepForLeg = steps[offset];
      const color = stepForLeg ? stepColor(stepForLeg) : '#64748b';
      const list = [leg.from, ...(leg.intermediateStops ?? []), leg.to];
      return list.flatMap((stop: any, position: number) => {
        const lat = Number(stop?.lat ?? stop?.latitude);
        const lon = Number(stop?.lon ?? stop?.lng ?? stop?.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
        return [{
          type: 'Feature' as const,
          properties: { color, edge: position === 0 || position === list.length - 1 },
          geometry: { type: 'Point' as const, coordinates: [lon, lat] as [number, number] },
        }];
      });
    }),
  };

  const endpointsGeoJSON = (() => {
    const first: any = legs[0]?.from;
    const last: any = legs[legs.length - 1]?.to;
    const points = [first, last].flatMap((stop: any) => {
      const lat = Number(stop?.lat);
      const lon = Number(stop?.lon);
      return Number.isFinite(lat) && Number.isFinite(lon) ? [[lon, lat] as [number, number]] : [];
    });
    return {
      type: 'FeatureCollection' as const,
      features: points.map((coordinates) => ({
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'Point' as const, coordinates },
      })),
    };
  })();

  const afterTransitText = (() => {
    const after = steps[index + 1];
    if (!after || after.kind === 'arrival') return t.thenArrive;
    if (after.kind === 'walk') return t.thenWalk(after.durationMin);
    return t.thenTake(after.lineShortName ?? '');
  })();

  const roundMetres = (value: number) => (value >= 1000 ? Math.round(value / 100) * 100 : Math.max(10, Math.round(value / 10) * 10));

  const minutesText = (minutes: number) =>
    minutes <= 0 ? t.dueNow : minutes > 59 ? formatClock(new Date(Date.now() + minutes * 60000).toISOString()) : t.minutes(minutes);

  const notch = safeTop >= NOTCH_MIN_SAFE_TOP;
  const questionsKey = `${phase}-${index}`;
  const bp = notch ? navPalette(false) : palette;

  const roundIcon = (child: ReactNode, background = bp.box, color = bp.ink) => (
    <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: background, color }}>
      {child}
    </span>
  );

  const banner: BannerContent = (() => {
    if (phase === 'arrived') {
      return {
        leading: <EndpointDot palette={palette} size={28} />,
        title: t.youHaveArrived,
        subtitle: stopLabel(itinerary.arrName) || undefined,
      };
    }
    if (phase === 'ride' && transitLine) {
      const alight = stopLabel(legs[index]?.to?.name ?? step.toName);
      if (preparing) {
        return {
          leading: <LinePlate line={transitLine} size="sm" />,
          label: t.nextStop,
          title: alight,
          subtitle: alightNow ? t.getOffHere : t.prepareToGetOff,
          footer: afterTransitText,
          accent: transitLine.color,
          big: true,
        };
      }
      return {
        leading: <LinePlate line={transitLine} size="md" />,
        title: alight,
        subtitle: t.getOffIn(stopsLeft),
        value: shiftedClock(legs[index]?.endTime, index) || undefined,
      };
    }
    if (phase === 'wait' && transitLine) {
      return {
        leading: <LinePlate line={transitLine} size="md" />,
        title: transitStep?.headsign ? t.toward(stopLabel(transitStep.headsign)) : transitLine.shortName,
        subtitle: boardingLabel,
        value: nextRunMinutes === null ? '–' : minutesText(nextRunMinutes),
        live: activeCards[selectedRun] ? !activeCards[selectedRun].scheduled : false,
      };
    }
    return {
      leading: roundIcon(<FaWalking className="h-5 w-5" />),
      title: stopLabel(step?.toName || itinerary.arrName),
      subtitle:
        transitLine && nextStep?.kind === 'transit'
          ? `${t.thenTake(transitLine.shortName)}${nextRunMinutes !== null ? ` · ${minutesText(nextRunMinutes)}` : ''}`
          : undefined,
      value: walkRemaining !== null ? t.metres(roundMetres(walkRemaining)) : t.minutes(step?.durationMin ?? 0),
    };
  })();

  const tripSteps: ShareTimelineStep[] = steps.map((item, i) => {
    const leg: any = legs[i];
    if (item.kind === 'walk') {
      return {
        kind: 'walk',
        label: tx(isFr).journeyDetail.walkFormatminutescompact(formatMinutesCompact(item.durationMin)),
        time: shiftedClock(leg?.startTime, i),
        stops: [],
        done: i < index,
        current: i === index,
      };
    }
    if (item.kind === 'arrival') {
      return {
        kind: 'arrival',
        label: stopLabel(itinerary.arrName) || t.youHaveArrived,
        time: etaClock,
        stops: [],
        done: false,
        current: i === index,
      };
    }
    const names = [leg?.from, ...(leg?.intermediateStops ?? []), leg?.to].filter(Boolean).map((stop: any) => stopLabel(stop?.name));
    const passedFlags =
      i < index
        ? names.map(() => true)
        : i === index && ride && ride.all.length === names.length
        ? ride.all.map((stop) => stop.passed)
        : names.map(() => false);
    return {
      kind: 'transit',
      label: item.headsign ? t.toward(stopLabel(item.headsign)) : '',
      time: shiftedClock(leg?.startTime, i),
      line: navLineOf(item) ?? undefined,
      stops: names.map((name: string, position: number) => ({
        name,
        time: position === 0 ? shiftedClock(leg?.startTime, i) : position === names.length - 1 ? shiftedClock(leg?.endTime, i) : '',
        passed: passedFlags[position] ?? false,
      })),
      done: i < index,
      current: i === index,
    };
  });

  const markSheetTouched = () => {
    sheetTouchedRef.current = Date.now();
  };

  const delayMinutes = lineDelay ? Math.round(lineDelay.seconds / 60) : 0;
  const delayText =
    lineDelay && delayMinutes !== 0
      ? delayMinutes > 0
        ? t.delayminutesMinObserved(delayMinutes)
        : t.absMinEarly(Math.abs(delayMinutes))
      : null;

  const crowdWarning =
    delayText || (confidence && confidence.level === 'poor') ? (
      <p className="mt-3 flex items-center gap-2 text-sm" style={{ color: palette.muted }}>
        {confidence && (
          <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: CONFIDENCE_COLOR[confidence.level] }} />
        )}
        <span className="truncate">
          {[confidence?.level === 'poor' ? confidenceLabel(confidence, isFr) : '', delayText ?? ''].filter(Boolean).join(' · ')}
        </span>
      </p>
    ) : null;

  const timelineView = <StopTimeline steps={tripSteps} palette={palette} moreLabel={t.moreStops} />;

  const timelineCard = (
    <Card palette={palette} className="pt-1">
      {timelineView}
      {crowdWarning}
      {phase === 'wait' && transitLine && (
        <div className="mt-5 border-t pt-4" style={{ borderColor: palette.rule }}>
          {vehicleSighting.at !== null && upstream.length > 0 && (
            <>
              <p className="flex items-center gap-2 text-sm" style={{ color: palette.ink }}>
                <LiveIcon label={t.live} />
                {t.seenOnboard(vehicleSighting.count, vehicleSighting.seconds)} · {t.stopsAway(upstream.length - vehicleSighting.at)}
              </p>
              <VehicleTracker
                stops={upstream.map(stopLabel)}
                here={boardingLabel}
                vehicleAt={vehicleSighting.at}
                line={transitLine}
                palette={palette}
                hereLabel={boardingLabel}
              />
            </>
          )}
          <div className={`flex items-center gap-3 ${vehicleSighting.at !== null && upstream.length > 0 ? 'mt-4' : ''}`}>
            <Avatars faces={[LIVE_AVATAR, ...liveWaitingHere]} />
            <p className="min-w-0 flex-1 text-sm leading-snug" style={{ color: palette.muted }}>
              {t.waitingHere(liveWaitingHere.length)}
            </p>
          </div>
        </div>
      )}
    </Card>
  );

  const sheetFull = sheetSnap === GUIDANCE_SNAP.full;
  const compactIsland = notch && ((islandCompact && !banner.big) || sheetFull);
  const islandShut = `inset(0px calc(50% - ${cutout.width / 2}px) calc(100% - ${cutout.height}px) calc(50% - ${cutout.width / 2}px) round ${cutout.height / 2}px)`;
  const showQuestions = !banner.big && !compactIsland && questionsHiddenFor !== questionsKey && (phase === 'ride' || phase === 'wait');

  const pullIsland = (_: PointerEvent, info: PanInfo) => {
    const pull = info.offset.y;
    islandPull.set(pull < 0 ? Math.max(-14, pull * 0.18) : Math.min(14, pull * 0.18));
  };

  const releaseIsland = (_: PointerEvent, info: PanInfo) => {
    void animate(islandPull, 0, { type: 'spring', stiffness: 500, damping: 32 });
    const up = info.offset.y < -ISLAND_SWIPE_PX || info.velocity.y < -ISLAND_SWIPE_SPEED;
    const down = info.offset.y > ISLAND_SWIPE_PX || info.velocity.y > ISLAND_SWIPE_SPEED;
    const next = up ? true : down ? false : islandCompact;
    if (next === islandCompact) return;
    morphIsland();
    setIslandCompact(next);
    if (next && showQuestions) setQuestionsHiddenFor(questionsKey);
  };

  function morphIsland() {
    setIslandMorph(true);
    window.clearTimeout(islandMorphTimerRef.current);
    islandMorphTimerRef.current = window.setTimeout(() => setIslandMorph(false), ISLAND_MORPH_MS);
  }

  const islandFade = (delay = 0) =>
    islandMorph
      ? {
          layout: 'position' as const,
          initial: { opacity: 0, y: -6 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.28, delay: 0.12 + delay, ease: [0.32, 0.72, 0, 1] as const },
        }
      : { layout: 'position' as const };

  const islandText = (sizes: { compact: number; full: number }, compact: boolean) => ({
    layout: 'position' as const,
    initial: islandMorph ? { fontSize: compact ? sizes.full : sizes.compact } : false,
    animate: { fontSize: compact ? sizes.compact : sizes.full },
    transition: ISLAND_SPRING,
  });

  const questionsCard = (subject: 'vehicle' | 'stop') => {
    const onAnswered = () => {
      setAnswerCount((n) => n + 1);
      setTravellersHelpedNow((current) => current + 1);
    };
    if (subject === 'vehicle' && step?.kind === 'transit' && step.lineShortName) {
      return (
        <TripQuestions
          key={`vehicle-${step.lineShortName}-${index}`}
          subject="vehicle"
          targetId={step.lineShortName}
          boardingStop={step.fromName ?? null}
          boardingTime={legs[index]?.startTime ? new Date(legs[index].startTime).toISOString() : null}
          journey={surveyJourney}
          language={language}
          onAnswered={onAnswered}
          tone={notch || !isLight ? 'night' : 'light'}
          bare
        />
      );
    }
    if (subject === 'stop' && waitingStop) {
      return (
        <TripQuestions
          key={`stop-${waitingStop.id}`}
          subject="stop"
          targetId={waitingStop.id}
          targetName={waitingStop.name}
          lineId={waitingStop.lineId}
          language={language}
          onAnswered={onAnswered}
          tone={notch || !isLight ? 'night' : 'light'}
          bare
        />
      );
    }
    return null;
  };

  const phaseContent = (() => {
    if (phase === 'ride' && transitLine && ride) {
      return (
        <>
          <Card palette={palette}>
            <div>
              <StopTimeline steps={tripSteps.slice(index)} palette={palette} moreLabel={t.moreStops} />
            </div>
          </Card>
        </>
      );
    }
    if (phase === 'wait' || phase === 'walk') return timelineCard;
    return null;
  })();

  const miniSegments: MiniSegment[] = (() => {
    const moving = steps.filter((item) => item.kind !== 'arrival');
    const total = moving.reduce((sum, item) => sum + Math.max(1, item.durationMin), 0) || 1;
    const raw = moving.map((item) => Math.max(0.08, Math.max(1, item.durationMin) / total));
    const sum = raw.reduce((a, b) => a + b, 0);
    return moving.map((item, i) => ({
      kind: item.kind === 'transit' ? 'transit' : 'walk',
      share: raw[i] / sum,
      line: navLineOf(item) ?? undefined,
      done: i < index,
    }));
  })();

  const miniProgress = (() => {
    let before = 0;
    for (let i = 0; i < Math.min(index, miniSegments.length); i++) before += miniSegments[i].share;
    const current = miniSegments[index];
    if (!current) return 1;
    const length = pathLength(step?.path ?? []);
    let fraction = 0;
    if (phase === 'wait') fraction = step?.kind === 'walk' ? 1 : 0;
    else if (step?.kind === 'walk' && walkRemaining !== null && length > 0) fraction = 1 - walkRemaining / length;
    else if (step?.kind === 'transit' && ride?.travelled != null && length > 0) fraction = ride.travelled / length;
    return before + current.share * Math.max(0, Math.min(1, fraction));
  })();

  const remainingText = [
    remainingMinutes !== null ? formatMinutesCompact(remainingMinutes) : itinerary.dur,
    remainingMetres > 0 ? t.metres(roundMetres(remainingMetres)) : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const sheetHeader = (
    <div className="px-6 pb-4 pt-2" onPointerDown={markSheetTouched}>
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p role="heading" aria-level={2} className="truncate text-[1.625rem] font-medium leading-[1.15]" style={{ color: palette.ink }}>
          {t.arrivingAt} {etaClock}
        </p>
        <p className="mt-1 truncate text-[1.0625rem] tabular-nums" style={{ color: palette.soft }}>
          {remainingText}
        </p>
      </div>
      <button
        type="button"
        onClick={() => openOverlay('share')}
        className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full transition active:scale-95"
        style={{ backgroundColor: palette.box, color: palette.ink }}
        aria-label={t.shareTrip}
      >
        <ArrowUpOnSquareIcon className="h-5 w-5" />
        {shareToken && <span className="absolute right-0 top-0 h-3 w-3 rounded-full border-2 border-white bg-green-400" />}
      </button>
      <button
        type="button"
        onClick={handleClose}
        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-red-500 text-white transition active:scale-95"
        style={{ color: '#ffffff' }}
        aria-label={t.exitNavigation}
      >
        <XMarkIcon className="h-6 w-6" />
      </button>
    </div>
    <AnimatePresence initial={false}>
      {sheetSnap === GUIDANCE_SNAP.collapsed && (
        <motion.div
          key="mini-timeline"
          className="overflow-hidden"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
        >
          <div className="pt-4">
            <MiniTimeline segments={miniSegments} progress={miniProgress} palette={palette} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    </div>
  );

  function openOverlay(kind: 'share' | 'settings') {
    sheetRef.current?.snapTo(GUIDANCE_SNAP.collapsed);
    if (kind === 'share') setIsShareOpen(true);
    else setIsSettingsOpen(true);
  }

  const primaryButton = isLight
    ? { backgroundColor: '#000000', color: '#ffffff' }
    : { backgroundColor: '#ffffff', color: '#000000' };

  const bannerNode = (
        <div
          className={`pointer-events-none inset-x-0 top-0 ${notch ? 'fixed z-[10020]' : 'absolute z-20 px-2 pt-[max(0.5rem,var(--gl-safe-top))]'}`}
          style={notch ? { paddingTop: cutout.top } : undefined}
        >
          {notch && (
            <motion.div
              aria-hidden="true"
              className="absolute inset-x-0 top-0"
              style={{
                height: safeTop + STATUS_FADE_PX,
                background: `linear-gradient(to bottom, #000 0, #000 ${safeTop}px, rgba(0,0,0,0) ${safeTop + STATUS_FADE_PX}px)`,
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: islandClosing ? 0 : 1 }}
              transition={{ duration: 0.35 }}
            />
          )}
          <motion.div
            className={notch ? 'relative touch-none' : undefined}
            style={
              notch
                ? {
                    paddingLeft: compactIsland ? ISLAND_SIDE_COMPACT : ISLAND_SIDE,
                    paddingRight: compactIsland ? ISLAND_SIDE_COMPACT : ISLAND_SIDE,
                    transition: 'padding 0.4s cubic-bezier(0.32, 0.72, 0, 1)',
                  }
                : undefined
            }
            onPan={notch ? pullIsland : undefined}
            onPanEnd={notch ? releaseIsland : undefined}
          >
          <motion.div
            layout
            className={`pointer-events-auto overflow-hidden ${notch ? 'gl-always-dark' : 'rounded-[28px] border'}`}
            style={
              notch
                ? {
                    backgroundColor: '#000000',
                    borderRadius: cutout.radius,
                    boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
                  }
                : {
                    backgroundColor: bp.surface,
                    borderColor: banner.accent ?? bp.cardBorder,
                    borderWidth: banner.accent ? 3 : 1,
                    boxShadow: isLight ? '0 20px 50px rgba(148,163,184,0.28)' : '0 12px 32px rgba(0,0,0,0.5)',
                  }
            }
            initial={notch ? { clipPath: islandShut } : false}
            animate={notch ? { clipPath: islandClosing ? islandShut : `inset(0px 0px 0px 0px round ${cutout.radius}px)` } : undefined}
            transition={notch ? ISLAND_SPRING : { type: 'spring', stiffness: 320, damping: 32 }}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${phase}-${index}-${preparing ? 'p' : ''}`}
                layout={notch}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className={notch ? (compactIsland ? 'px-4' : 'px-5') : 'px-6 py-5'}
                style={notch ? { paddingTop: Math.max(12, safeTop - cutout.top + ISLAND_GAP) } : undefined}
              >
                {compactIsland ? (
                  <div className="flex items-center gap-3">
                    <motion.span layoutId="island-leading" transition={ISLAND_SPRING} className="flex flex-shrink-0">
                      {banner.leading}
                    </motion.span>
                    <motion.p
                      layoutId="island-title"
                      {...islandText(ISLAND_TITLE_PX, true)}
                      className="min-w-0 flex-1 font-semibold leading-[1.15] text-white"
                    >
                      <ScrollingText text={banner.title} />
                    </motion.p>
                    {banner.value && (
                      <motion.span
                        layoutId="island-value"
                        {...islandText(ISLAND_VALUE_PX, true)}
                        className="flex flex-shrink-0 items-center gap-1.5 font-semibold tabular-nums text-white"
                      >
                        {banner.live && <LiveIcon label={t.live} size={14} />}
                        {banner.value}
                      </motion.span>
                    )}
                  </div>
                ) : notch ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <motion.span layoutId="island-leading" transition={ISLAND_SPRING} className="flex flex-shrink-0">
                          {banner.leading}
                        </motion.span>
                        {banner.label && (
                          <motion.span {...islandFade()} className="min-w-0 flex-1 text-[0.9375rem] font-medium" style={{ color: bp.soft }}>
                            <ScrollingText text={banner.label} />
                          </motion.span>
                        )}
                      </div>
                      {banner.value && (
                        <motion.span
                          layoutId="island-value"
                          {...islandText(ISLAND_VALUE_PX, false)}
                          className="flex flex-shrink-0 items-center gap-1.5 font-semibold tabular-nums text-white"
                        >
                          {banner.live && <LiveIcon label={t.live} size={16} />}
                          {banner.value}
                        </motion.span>
                      )}
                    </div>
                    {banner.big ? (
                      <motion.p
                        layoutId="island-title"
                        layout="position"
                        transition={ISLAND_SPRING}
                        className="mt-3 line-clamp-2 text-[1.875rem] font-semibold leading-[1.15] text-white"
                      >
                        {banner.title}
                      </motion.p>
                    ) : (
                      <motion.p
                        layoutId="island-title"
                        {...islandText(ISLAND_TITLE_PX, false)}
                        className="mt-3 font-semibold leading-[1.15] text-white"
                      >
                        <ScrollingText text={banner.title} />
                      </motion.p>
                    )}
                    {banner.subtitle && (
                      <motion.p {...islandFade(0.04)} className="pt-1 text-[1.0625rem] font-medium" style={{ color: bp.soft }}>
                        <ScrollingText text={banner.subtitle} />
                      </motion.p>
                    )}
                    {banner.footer && (
                      <motion.p {...islandFade(0.08)} className="mt-4 rounded-[22px] bg-white/[0.1] px-4 py-3 text-[1.0625rem] font-medium text-white">
                        {banner.footer}
                      </motion.p>
                    )}
                  </>
                ) : banner.big ? (
                  <>
                    <div className="flex items-center gap-3">
                      {banner.leading}
                      <span className="text-[1.0625rem]" style={{ color: bp.soft }}>
                        {banner.label}
                      </span>
                    </div>
                    <h2 className="mt-4 line-clamp-2" style={{ ...HEADLINE, color: bp.ink }}>
                      {banner.title}
                    </h2>
                    {banner.subtitle && (
                      <p className="pt-2 text-[1.0625rem] leading-snug" style={{ color: bp.soft }}>
                        {banner.subtitle}
                      </p>
                    )}
                    {banner.footer && (
                      <p className="mt-4 border-t pt-4 text-[1.0625rem]" style={{ borderColor: bp.rule, color: bp.ink }}>
                        {banner.footer}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-3">
                    {banner.leading}
                    <div className="min-w-0 flex-1">
                      {banner.label && (
                        <p className="text-[0.9375rem]" style={{ color: bp.soft }}>
                          <ScrollingText text={banner.label} />
                        </p>
                      )}
                      <p className="text-[1.375rem] font-medium leading-[1.15]" style={{ color: bp.ink }}>
                        <ScrollingText text={banner.title} />
                      </p>
                      {banner.subtitle && (
                        <p className="pt-0.5 text-[1.0625rem]" style={{ color: bp.soft }}>
                          <ScrollingText text={banner.subtitle} />
                        </p>
                      )}
                    </div>
                    {banner.value && (
                      <span className="flex flex-shrink-0 items-center gap-1.5 text-[1.375rem] font-medium tabular-nums" style={{ color: bp.ink }}>
                        {banner.live && <LiveIcon label={t.live} size={15} />}
                        {banner.value}
                      </span>
                    )}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
            {notch && (
              <motion.div
                aria-hidden="true"
                style={{ ['--island-pad' as string]: `${compactIsland ? 12 : 20}px`, height: islandTail }}
              />
            )}
            {notch ? (
              <AnimatePresence initial={false}>
                {showQuestions && (
                  <motion.div
                    key="island-questions"
                    layout="position"
                    className="overflow-hidden"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0, transition: { duration: 0.25, ease: [0.32, 0.72, 0, 1] } }}
                    transition={ISLAND_SPRING}
                  >
                    {questionsCard(phase === 'ride' ? 'vehicle' : 'stop')}
                  </motion.div>
                )}
              </AnimatePresence>
            ) : (
              !banner.big &&
              (phase === 'ride' || phase === 'wait') && <div>{questionsCard(phase === 'ride' ? 'vehicle' : 'stop')}</div>
            )}
          </motion.div>
          </motion.div>

        </div>
  );

  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        className="fixed inset-0 z-[10001] overflow-hidden"
        style={{ backgroundColor: isLight ? '#e5e7eb' : '#0a1420' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
      >
        <div className="absolute inset-0">
          <MapLibreMap
            ref={mapRef}
            initialViewState={{ longitude: fullPath[0]?.[0] ?? (CITY_SITE ? SITE_CENTER.lon : 5.74892), latitude: fullPath[0]?.[1] ?? (CITY_SITE ? SITE_CENTER.lat : 45.18501), zoom: 15 }}
            mapStyle={theme === 'dark' ? DARK_NAV_MAP_STYLE_URL : LIGHT_NAV_MAP_STYLE_URL}
            style={{ width: '100%', height: '100%' }}
            attributionControl={false}
            onDragStart={() => {
              setIsFollowing(false);
              if (sheetSnap !== GUIDANCE_SNAP.collapsed) sheetRef.current?.snapTo(GUIDANCE_SNAP.collapsed);
            }}
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
                  paint={{ 'line-color': ['get', 'color'], 'line-width': 13, 'line-opacity': ['case', ['get', 'past'], 0.08, 0.18] as any }}
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                />
                <Layer
                  id="nav-future-routes-layer"
                  type="line"
                  paint={{ 'line-color': ['get', 'color'], 'line-width': 6, 'line-opacity': ['case', ['get', 'past'], 0.3, 0.6] as any }}
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
                    'circle-radius': ['case', ['get', 'edge'], 6.5, 4] as any,
                    'circle-color': isLight ? '#ffffff' : '#0a0a0a',
                    'circle-stroke-color': ['get', 'color'],
                    'circle-stroke-width': ['case', ['get', 'edge'], 3.5, 2.5] as any,
                  }}
                />
              </Source>
            )}

            {endpointsGeoJSON.features.length > 0 && (
              <Source id="nav-endpoints" type="geojson" data={endpointsGeoJSON}>
                <Layer
                  id="nav-endpoints-layer"
                  type="circle"
                  paint={{
                    'circle-radius': 8,
                    'circle-color': isLight ? '#ffffff' : '#e2e8f0',
                    'circle-stroke-color': isLight ? '#0f172a' : '#0a0a0a',
                    'circle-stroke-width': 4,
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
                    'line-color': step.kind === 'walk' ? (isLight ? '#0f172a' : '#ffffff') : stepColor(step),
                    'line-width': step.kind === 'walk' ? 5 : 8,
                    'line-opacity': 0.95,
                    'line-dasharray': step.kind === 'walk' ? [0.1, 1.8] : [1, 0],
                  }}
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                />
              </Source>
            )}

            {step.path.length > 1 && step.kind === 'walk' && phase !== 'wait' && navLineOf(nextStep) && (
              <Marker longitude={step.path[step.path.length - 1][0]} latitude={step.path[step.path.length - 1][1]}>
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                  className="block"
                  style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.45))' }}
                >
                  <LinePlate line={navLineOf(nextStep)!} size="sm" />
                </motion.span>
              </Marker>
            )}

            {snappedLocation && (
              <GlidingMarker target={snappedLocation}>
                <AnimatePresence initial={false} mode="wait">
                  {phase === 'ride' && transitLine ? (
                    <motion.span
                      key="vehicle-sprite"
                      initial={{ opacity: 0, scale: 0.72 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.72 }}
                      transition={{ duration: 0.24, ease: 'easeOut' }}
                      className="block"
                      style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.45))' }}
                    >
                      <LinePlate line={transitLine} size="sm" />
                    </motion.span>
                  ) : (
                    <motion.div
                      key="walking-sprite"
                      initial={{ opacity: 0, scale: 0.72 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.72 }}
                      transition={{ duration: 0.24, ease: 'easeOut' }}
                      className="relative flex items-center justify-center"
                    >
                      <span className="absolute h-8 w-8 animate-ping rounded-full bg-blue-500/30" />
                      <span className="relative h-4 w-4 rounded-full border-2 border-white bg-blue-500 shadow-lg" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </GlidingMarker>
            )}
          </MapLibreMap>
        </div>

        {notch ? createPortal(bannerNode, document.body) : bannerNode}
      </motion.div>

      <AnimatePresence initial={false}>
        {hasStarted && !isFollowing && currentLocation && sheetSnap !== GUIDANCE_SNAP.full && (
          <motion.button
            key="recenter-control"
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={() => {
              lastCameraLocationRef.current = null;
              animateRecenterRef.current = true;
              setIsFollowing(true);
            }}
            className="fixed right-4 z-[10005] flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border-2 border-gray-700 bg-slate-900/85 shadow-lg transition-colors hover:bg-slate-900"
            style={{
              bottom: sheetSnap === GUIDANCE_SNAP.collapsed ? COLLAPSED_SHEET_PX + 4 : Math.round(window.innerHeight * 0.52) + 4,
            }}
            aria-label={t.recenter}
          >
            <MapPinIcon className="h-5 w-5 text-white" />
          </motion.button>
        )}
      </AnimatePresence>

      <GuidanceSheet
        ref={sheetRef}
        isLight={isLight}
        zIndex={10010}
        header={sheetHeader}
        onOpenEnd={() => sheetRef.current?.snapTo(phase === 'walk' ? GUIDANCE_SNAP.collapsed : GUIDANCE_SNAP.middle)}
        onSnap={index => {
          if (notch && (index === GUIDANCE_SNAP.full) !== (sheetSnap === GUIDANCE_SNAP.full)) morphIsland();
          setSheetSnap(index);
        }}
        fullHeight={notch ? Math.max(320, Math.round(window.innerHeight - safeTop - ISLAND_SHEET_GAP)) : undefined}
      >
        <div className="px-6 pb-14" onPointerDown={markSheetTouched}>
          {phaseContent && <div className="border-t pb-1" style={{ borderColor: palette.rule }}>{phaseContent}</div>}

          <div className="border-t" style={{ borderColor: palette.rule }}>
            <OptionRow palette={palette} last title={t.navigationSettings} onClick={() => openOverlay('settings')} />
          </div>
        </div>
      </GuidanceSheet>

      <GuidancePopup
        open={isShareOpen}
        onClose={() => {
          setIsShareOpen(false);
          setShareNotice(null);
        }}
        palette={palette}
        icon={<ArrowUpOnSquareIcon className="h-12 w-12" />}
        title={t.shareTrip}
        stepKey={shareToken ? 'link' : 'name'}
        stepDirection={shareStepDirection}
      >
        <p className="pt-3 text-[1.0625rem] leading-snug" style={{ color: palette.soft }}>
          {t.shareExplain}
        </p>

        {!isShareAvailable ? (
          <p className="pt-3 text-[1.0625rem] leading-snug" style={{ color: palette.soft }}>
            {t.shareUnavailable}
          </p>
        ) : shareToken ? (
          <div className="flex h-[15rem] flex-col justify-end">
            {copyButton(() => void copyLink(shareToken))}
            <button
              type="button"
              onClick={stopSharing}
              className="mt-2 block w-full rounded-2xl py-4 text-center text-[1.0625rem] font-semibold text-red-500"
            >
              {t.stopSharing}
            </button>
          </div>
        ) : (
          <div className="flex h-[15rem] flex-col">
            <input
              id="gl-share-name"
              value={shareName}
              maxLength={24}
              onChange={(event) => setShareName(event.target.value)}
              placeholder={t.yourFirstName}
              aria-label={t.yourFirstName}
              className="mt-6 w-full rounded-2xl px-4 py-4 text-[1.0625rem] outline-none"
              style={{ backgroundColor: palette.box, color: palette.ink }}
            />
            <p className="pt-2 text-[0.9375rem] leading-snug" style={{ color: palette.soft }}>
              {t.nameFallbackHint(fallbackName)}
            </p>
            <button
              type="button"
              onClick={startShare}
              className="mt-auto block w-full rounded-2xl py-4 text-center text-[1.0625rem] font-semibold transition active:scale-[0.98]"
              style={primaryButton}
            >
              {t.continueLabel}
            </button>
          </div>
        )}

        {shareNotice && (
          <p className="mt-3 break-all text-center text-[0.9375rem]" style={{ color: palette.soft }}>
            {shareNotice}
          </p>
        )}
      </GuidancePopup>

      <GuidancePopup
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        palette={palette}
        icon={<Cog6ToothIcon className="h-12 w-12" />}
        title={t.navigationSettings}
      >
        <div className="mt-5 border-t" style={{ borderColor: palette.rule }}>
          <OptionRow
            palette={palette}
            title={t.tripAlerts}
            trailing={<Toggle on={notifyOn} />}
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
          />
          {voiceSupported() && (
            <OptionRow
              palette={palette}
              title={t.spokenDirections}
              trailing={<Toggle on={voiceOn} />}
              onClick={() => {
                const next = !voiceOn;
                setVoiceEnabled(next);
                setVoiceOn(next);
                if (next) speak(t.directionsWillBeSpoken, language);
              }}
            />
          )}
          {legs.some((leg) => leg?.mode && leg.mode !== 'WALK') && (
            <OptionRow palette={palette} title={t.buyTicket} onClick={() => openExternal(PASS_SHOP_URL)} />
          )}
          <OptionRow
            palette={palette}
            last
            title={t.skipToNextStep}
            onClick={() => {
              setIndex((i) => Math.min(i + 1, steps.length - 1));
              setIsSettingsOpen(false);
            }}
          />
        </div>

        <p className="pt-6 text-[1.0625rem]" style={{ color: palette.ink }}>
          {t.walkingPriority}
        </p>
        <StepSlider
          count={WALK_PRIORITIES.length}
          value={walkPrefs.priorityIndex}
          emoji={WALK_PRIORITIES[walkPrefs.priorityIndex].emoji}
          color="#3b82f6"
          ariaLabel={t.walkingPriority}
          onChange={(priorityIndex) => updateWalkPrefs({ ...walkPrefs, priorityIndex })}
        />
        <p className="pt-1 text-[0.9375rem]" style={{ color: palette.soft }}>
          {WALK_PRIORITIES[walkPrefs.priorityIndex].label(isFr)}
        </p>

        <p className="pt-6 text-[1.0625rem]" style={{ color: palette.ink }}>
          {t.walkingSpeed}
        </p>
        <StepSlider
          count={WALK_SPEEDS.length}
          value={walkPrefs.speedIndex}
          emoji={WALK_SPEEDS[walkPrefs.speedIndex].emoji}
          color="#22c55e"
          ariaLabel={t.walkingSpeed}
          onChange={(speedIndex) => updateWalkPrefs({ ...walkPrefs, speedIndex })}
        />
        <p className="pt-1 text-[0.9375rem] tabular-nums" style={{ color: palette.soft }}>
          {WALK_SPEEDS[walkPrefs.speedIndex].label(isFr)} ·{' '}
          {WALK_SPEEDS[walkPrefs.speedIndex].kmh.toLocaleString(isFr ? 'fr-FR' : 'en-GB', { minimumFractionDigits: 1 })} km/h
        </p>

      </GuidancePopup>
    </MotionConfig>
  );
}
