import { sortStopPreviewLines } from '../utils/lineOrder';
import { IS_NANCY } from '../site';
import { appLanguage } from '../utils/appLanguage';
import { useReconnectCount } from '../hooks/useIsOffline';
﻿import { useRef, forwardRef, useImperativeHandle, useCallback, useState, useMemo, useEffect, memo } from 'react';
import type { ForwardedRef } from 'react';
import MapLibreMap, { Marker, Source, Layer } from 'react-map-gl/maplibre';
import { FaWheelchair } from 'react-icons/fa';
import { useAccessibleStops } from '../hooks/useAccessibleStops';
import { detectDeviceTier, mapPixelRatio } from '../utils/deviceTier';
import { isStopAccessible } from '../services/stopAccessibility';
import type { Line, Stop } from '../types';
import type { MapRef as MapLibreRef, MapLayerMouseEvent, MapLayerTouchEvent } from 'react-map-gl/maplibre';
import type { AddressResult } from '../services/geocoding';
import type { LineGeometry, ServedStopPoint } from '../services/lineShapes';
import { stopIsNearAny, snapStopToLines } from '../services/lineShapes';
import { getCachedStopLines, getStopLines } from '../services/api';
import { getGtfsLinesForStopSync } from '../services/gtfsNetwork';
import { isSncfStopId } from '../services/sncfNetwork';
import { badgeImage } from '../utils/badgeImages';
import { consumeLocationPick } from '../utils/devLocation';
import { resolveLineBackgroundColor } from '../utils/lineColors';
import type { JourneyBadge } from '../utils/journeyGeometry';
import { LineBadge } from './LineBadge';
import { midpointOf, type McoLine } from '../services/mcoLines';
import { usePerfSettings } from '../hooks/usePerfSettings';
import { motion } from 'framer-motion';
import { VehicleGlyph } from './VehicleGlyph';
import { DARK_MODE_MAP_STYLE_URL, LIGHT_MODE_MAP_STYLE_URL } from '../utils/mapStyles';
import {
  EMPTY_SHARED_MOBILITY,
  FULL_BATTERY_PERCENT,
  dominantFormFactor,
  getVoiZones,
  hasFullBattery,
  type SharedMobilityData,
  type SharedOperator,
  type SharedVehiclePoint,
} from '../services/sharedMobility';

type RouteMapPoint = {
  id?: string;
  lat: number;
  lon: number;
  label: string;
  kind?: 'stop' | 'address';
};

interface MapProps {
  stops: Stop[];
  selectedStop: Stop | null;
  currentLocation: { lat: number; lon: number } | null;
  onStopClick: (stop: Stop) => void;

  selectedAddress?: AddressResult | null;

  routeStart?: RouteMapPoint | null;

  routeEnd?: RouteMapPoint | null;

  alwaysLabelledStopIds?: string[] | null;
  disruptedLineIds?: Set<string>;

  routeLine?: GeoJSON.FeatureCollection | null;

  routeStops?: GeoJSON.FeatureCollection | null;

  routeLineBadges?: JourneyBadge[] | null;
  carpoolLines?: McoLine[];

  lineGeometries?: LineGeometry[];

  visibleStopPoints?: ServedStopPoint[] | null;

  onCenterChange?: (lat: number, lon: number) => void;
  onUserPan?: () => void;
  onMoveSettled?: (lat: number, lon: number) => void;
  pickMode?: 'from' | 'to' | 'home' | 'work' | null;
  onMapClick?: (lat: number, lon: number) => void;
  onLongPress?: (lat: number, lon: number) => void;
  isDarkMode?: boolean;

  sharedMobility?: SharedMobilityData;

  onSharedSelect?: (selection: { operator: SharedOperator; points: SharedVehiclePoint[] }) => void;

  focusedShared?: { operator: SharedOperator; points: SharedVehiclePoint[] } | null;

  highlightedVehicleId?: string | null;
}

const MAX_LABEL_LINE_BADGES = 3;

const STOPS_LAYER_ID = 'stops-circles';
const SHARED_KEEP_ZOOM_FROM = 15;
const MAX_BADGE_STOPS = 60;
const BADGE_CONCURRENCY = 4;
const SELECTED_STATE = ['boolean', ['feature-state', 'selected'], false];
const ENDPOINT_STATE = ['boolean', ['feature-state', 'endpoint'], false];
const STOPS_HIT_LAYER_ID = 'stops-hit-area';
const IS_COARSE_POINTER = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
const STOP_HIT_RADIUS_PX = IS_COARSE_POINTER ? 22 : 12;

function nearestStopFeature(features: any[], point: { x: number; y: number } | undefined, map: any): any {
  const stops = features.filter(f => f?.properties?.stopId);
  if (stops.length <= 1 || !point || !map) return stops[0];
  let best = stops[0];
  let bestDistance = Infinity;
  for (const feature of stops) {
    const coordinates = feature.geometry?.coordinates;
    if (!coordinates) continue;
    const projected = map.project(coordinates);
    const distance = Math.hypot(projected.x - point.x, projected.y - point.y);
    if (distance < bestDistance) { bestDistance = distance; best = feature; }
  }
  return best;
}
const ROAD_LABELS_LAYER_ID = 'Road labels';

const LONG_PRESS_MS = 500;

const CITIZ_LAYER_ID = 'citiz-circles';
const VOI_LAYER_ID = 'voi-circles';
const VELOSTAN_LAYER_ID = 'velostan-circles';
const CITIZ_COLOR = '#2563eb';
const VOI_COLOR = '#f46c63';
const VELOSTAN_COLOR = '#ee3424';
const SHARED_LAYER_IDS: Record<SharedOperator, string> = {
  citiz: CITIZ_LAYER_ID,
  voi: VOI_LAYER_ID,
  velostan: VELOSTAN_LAYER_ID,
};
const SHARED_COLORS: Record<SharedOperator, string> = {
  citiz: CITIZ_COLOR,
  voi: VOI_COLOR,
  velostan: VELOSTAN_COLOR,
};

const SHARED_LABEL_MIN_ZOOM = 16.5;

const MAX_SHARED_LABELS = 30;

const MAX_FOCUS_LABELS = 200;

const SHARED_CLUSTER_RADIUS = 28;

const SHARED_CLUSTER_MAX_ZOOM = 16;

interface SharedPinData {
  key: string;
  operator: SharedOperator;
  lon: number;
  lat: number;
  count: number;

  clusterId: string | null;

  point: SharedVehiclePoint | null;
}

const FANOUT_RADIUS_DEG = 0.000055;

function explodeIntoVehiclePoints(points: SharedVehiclePoint[]): SharedVehiclePoint[] {
  const byPosition: Record<string, SharedVehiclePoint[]> = {};

  for (const point of points) {
    for (const vehicle of point.vehicles) {
      const single: SharedVehiclePoint = { ...point, id: vehicle.id, vehicles: [vehicle] };
      const key = `${point.lat.toFixed(6)}|${point.lon.toFixed(6)}`;
      if (byPosition[key]) byPosition[key].push(single);
      else byPosition[key] = [single];
    }
  }

  const exploded: SharedVehiclePoint[] = [];
  for (const bucket of Object.values(byPosition)) {
    if (bucket.length === 1) {
      exploded.push(bucket[0]);
      continue;
    }
    const lonScale = 1 / Math.max(0.2, Math.cos((bucket[0].lat * Math.PI) / 180));
    bucket.forEach((single, index) => {
      const angle = (2 * Math.PI * index) / bucket.length;
      exploded.push({
        ...single,
        lat: single.lat + FANOUT_RADIUS_DEG * Math.sin(angle),
        lon: single.lon + FANOUT_RADIUS_DEG * lonScale * Math.cos(angle),
      });
    });
  }

  return exploded;
}

const SHARED_TAP_RADIUS_PX = 18;

const MAX_CLUSTER_LEAVES = 200;

const sharedCirclePaint = (color: string) => ({
  'circle-radius': 2.5,
  'circle-color': color,
  'circle-stroke-color': '#ffffff',
  'circle-stroke-width': 1,
  'circle-opacity': ['step', ['zoom'], 1, SHARED_LABEL_MIN_ZOOM, 0] as any,
  'circle-stroke-opacity': ['step', ['zoom'], 1, SHARED_LABEL_MIN_ZOOM, 0] as any,
});

const MAX_DOM_LABELS = 40;


export interface MapRef {
  centerOnStop: (stop: Stop) => void;
  centerOnLocation: (lat: number, lon: number) => void;
  fitBounds: (
    bounds: [[number, number], [number, number]],
    options?: { padding?: number; duration?: number }
  ) => void;
  clearStopLabel: () => void;
  setBottomPadding: (px: number) => void;
  distancePx: (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => number | null;
  snapCenterTo: (lat: number, lon: number) => void;
}

interface ViewportBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface MapState {
  bounds: ViewportBounds | null;
  zoom: number;
}

const GRENOBLE_CENTER: [number, number] = IS_NANCY ? [48.6921, 6.1844] : [45.18501, 5.74892];

const throttle = <T extends (...args: any[]) => void>(fn: T, delay: number): T => {
  let lastCall = 0;
  return ((...args: any[]) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      fn(...args);
    }
  }) as T;
};

const isStopInViewport = (stop: Stop, bounds: ViewportBounds | null): boolean => {
  if (!bounds) return true;
  return (
    stop.lat >= bounds.south &&
    stop.lat <= bounds.north &&
    stop.lon >= bounds.west &&
    stop.lon <= bounds.east
  );
};

const getPaddingPercent = (zoom: number): number => {
  if (zoom > 15) return 0.05;
  if (zoom > 13) return 0.1;
  if (zoom > 11) return 0.15;
  return 0.2;
};

const getPaddedViewportBounds = (bounds: ViewportBounds, zoom: number): ViewportBounds => {
  const paddingPercent = getPaddingPercent(zoom);
  const latDiff = bounds.north - bounds.south;
  const lonDiff = bounds.east - bounds.west;
  return {
    north: bounds.north + latDiff * paddingPercent,
    south: bounds.south - latDiff * paddingPercent,
    east: bounds.east + lonDiff * paddingPercent,
    west: bounds.west - lonDiff * paddingPercent,
  };
};

const createPlaceholderSprite = (): ImageData => new ImageData(1, 1);

const attemptedMissingImages = new Set<string>();

const handleStyleImageMissing = (map: any, event: any) => {
  const id = String(event.id ?? '');
  if (!id || map.hasImage(id)) return;
  if (attemptedMissingImages.has(id)) return;
  attemptedMissingImages.add(id);
  try {
    map.addImage(id, createPlaceholderSprite(), { pixelRatio: 1 });
  } catch {
  }
};


const buildLinesFeatureCollection = (
  geometries: LineGeometry[]
): GeoJSON.FeatureCollection => {
  const features: GeoJSON.Feature[] = [];
  for (const g of geometries) {
    for (const feat of g.geojson.features) {
      const props = (feat.properties || {}) as Record<string, unknown>;
      const rawColor =
        (typeof props.color === 'string' && props.color) ||
        (typeof props.couleur === 'string' && props.couleur) ||
        (typeof (props as any).colour === 'string' && (props as any).colour) ||
        undefined;
      const idCandidate =
        (typeof props.ref === 'string' && props.ref) ||
        (typeof props.route === 'string' && props.route) ||
        (typeof (props as any).code === 'string' && (props as any).code) ||
        (typeof (props as any).shortName === 'string' && (props as any).shortName) ||
        (typeof (props as any).route_short_name === 'string' && (props as any).route_short_name) ||
        (typeof props.id === 'string' && props.id) ||
        undefined;
      const color = resolveLineBackgroundColor(rawColor as string | null, idCandidate as string | null);

      features.push({
        ...feat,
        properties: { ...props, color },
      });
    }
  }
  return { type: 'FeatureCollection', features };
};

const coordinateDistance = (a: GeoJSON.Position, b: GeoJSON.Position): number => {
  const dx = Number(b[0]) - Number(a[0]);
  const dy = Number(b[1]) - Number(a[1]);
  return Math.sqrt(dx * dx + dy * dy);
};

const interpolateCoordinate = (a: GeoJSON.Position, b: GeoJSON.Position, ratio: number): GeoJSON.Position => {
  return [
    Number(a[0]) + (Number(b[0]) - Number(a[0])) * ratio,
    Number(a[1]) + (Number(b[1]) - Number(a[1])) * ratio,
  ];
};

const trimLineString = (coordinates: GeoJSON.Position[], targetLength: number): GeoJSON.Position[] => {
  if (coordinates.length < 2 || targetLength <= 0) {
    const first = coordinates[0];
    return first ? [first, first] : [];
  }

  const trimmed: GeoJSON.Position[] = [coordinates[0]];
  let consumed = 0;

  for (let i = 1; i < coordinates.length; i += 1) {
    const previous = coordinates[i - 1];
    const current = coordinates[i];
    const segmentLength = coordinateDistance(previous, current);
    if (consumed + segmentLength <= targetLength) {
      trimmed.push(current);
      consumed += segmentLength;
      continue;
    }

    const ratio = segmentLength > 0 ? (targetLength - consumed) / segmentLength : 0;
    trimmed.push(interpolateCoordinate(previous, current, Math.max(0, Math.min(1, ratio))));
    break;
  }

  if (trimmed.length === 1) trimmed.push(trimmed[0]);
  return trimmed;
};

const animateFeatureCollectionProgress = (
  collection: GeoJSON.FeatureCollection | null,
  progress: number,
): GeoJSON.FeatureCollection | null => {
  if (!collection) return null;
  if (progress >= 1) return collection;

  const lineFeatures = collection.features.filter(
    feature => feature.geometry.type === 'LineString'
  );
  const lengths = lineFeatures.map(feature => {
    const coordinates = (feature.geometry as GeoJSON.LineString).coordinates;
    return coordinates.reduce((sum, coordinate, index) => (
      index === 0 ? sum : sum + coordinateDistance(coordinates[index - 1], coordinate)
    ), 0);
  });
  const totalLength = lengths.reduce((sum, length) => sum + length, 0);
  let remainingLength = totalLength * Math.max(0, Math.min(1, progress));
  let lineIndex = 0;

  const features = collection.features.flatMap((feature): GeoJSON.Feature[] => {
    if (feature.geometry.type !== 'LineString') return [feature];
    const coordinates = (feature.geometry as GeoJSON.LineString).coordinates;
    const featureLength = lengths[lineIndex] || 0;
    lineIndex += 1;

    if (remainingLength <= 0) return [];
    if (remainingLength >= featureLength) {
      remainingLength -= featureLength;
      return [feature];
    }

    const trimmedCoordinates = trimLineString(coordinates, remainingLength);
    remainingLength = 0;
    if (trimmedCoordinates.length < 2) return [];

    return [{
      ...feature,
      geometry: {
        type: 'LineString',
        coordinates: trimmedCoordinates,
      },
    }];
  });

  return { type: 'FeatureCollection', features };
};

const MapComponentBase = (
  { stops, selectedStop, currentLocation, onStopClick, selectedAddress, alwaysLabelledStopIds = null, disruptedLineIds, routeStart, routeEnd, routeLine, routeStops = null, routeLineBadges = null, carpoolLines = [], lineGeometries = [], visibleStopPoints, onCenterChange, onUserPan, onMoveSettled, pickMode, onMapClick, onLongPress, isDarkMode = false, sharedMobility = EMPTY_SHARED_MOBILITY, onSharedSelect, focusedShared = null, highlightedVehicleId = null }: MapProps,
  ref: ForwardedRef<MapRef>
) => {
  const { settings: perf } = usePerfSettings();
  const mapRef = useRef<MapLibreRef>(null);
  const [mapState, setMapState] = useState<MapState>({ bounds: null, zoom: 12.1 });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const styleImageHookRef = useRef(false);
  const [routeDrawProgress, setRouteDrawProgress] = useState(1);
  const [hoveredStopId, setHoveredStopId] = useState<string | null>(null);
  const [stopsLayerReady, setStopsLayerReady] = useState(false);
  const [hoverLabelVisible, setHoverLabelVisible] = useState(false);
  const hoverTimerRef = useRef<number | null>(null);
  const [stopLinesById, setStopLinesById] = useState<Record<string, Line[]>>({});
  const stopLinesQueueRef = useRef<Set<string>>(new Set());

  const mapStyleUrl = isDarkMode ? DARK_MODE_MAP_STYLE_URL : LIGHT_MODE_MAP_STYLE_URL;

  const mapStops = useMemo(() => {
    let filtered = visibleStopPoints
      ? stops.filter(stop => stopIsNearAny(stop, visibleStopPoints))
      : stops;

    if (visibleStopPoints && lineGeometries.length > 0) {
      filtered = filtered.map(stop => {
        const snapped = snapStopToLines(stop, lineGeometries, 80);
        if (!snapped) return stop;
        if (stop.id === selectedStop?.id) return { ...stop, lineColor: snapped.color };
        return { ...stop, lat: snapped.lat, lon: snapped.lon, lineColor: snapped.color };
      });
    }

    if (perf.markerCap > 0 && filtered.length > perf.markerCap) {
      const capped = filtered.slice(0, perf.markerCap);
      if (selectedStop && !capped.some(stop => stop.id === selectedStop.id)) {
        const selected = filtered.find(stop => stop.id === selectedStop.id);
        if (selected) capped[capped.length - 1] = selected;
      }
      return capped;
    }

    return filtered;
  }, [stops, visibleStopPoints, lineGeometries, selectedStop, perf.markerCap]);

  const mapStopsVisible = useMemo(() => (focusedShared ? [] : mapStops), [focusedShared, mapStops]);

  const [voiZones, setVoiZones] = useState<GeoJSON.FeatureCollection | null>(null);
  const showVoiZones = focusedShared?.operator === 'voi';
  useEffect(() => {
    if (!showVoiZones || voiZones) return;
    let active = true;
    void getVoiZones().then(zones => { if (active && zones) setVoiZones(zones); });
    return () => { active = false; };
  }, [showVoiZones, voiZones]);

  const visibleStops = useMemo(() => {
    if (!mapState.bounds) return mapStops;
    const paddedBounds = getPaddedViewportBounds(mapState.bounds, mapState.zoom);
    return mapStops.filter(stop => isStopInViewport(stop, paddedBounds));
  }, [mapStops, mapState]);

  const linesFeatureCollection = useMemo(
    () => buildLinesFeatureCollection(lineGeometries),
    [lineGeometries]
  );

  const selectedRouteStopIds = useMemo(() => {
    return new Set(
      [routeStart, routeEnd]
        .filter((point): point is RouteMapPoint => Boolean(point && point.kind === 'stop' && point.id))
        .map(point => String(point.id))
    );
  }, [routeStart, routeEnd]);

  const routeLineFeatureCollection = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!routeLine) return null;

    return {
      type: 'FeatureCollection',
      features: routeLine.features.map((feature) => {
        const props = (feature.properties || {}) as Record<string, unknown>;
        const rawColor = typeof props.color === 'string' ? props.color : undefined;
        const routeId = typeof props.routeId === 'string' ? props.routeId : undefined;
        const routeShortName = typeof props.routeShortName === 'string' ? props.routeShortName : undefined;
        const color = resolveLineBackgroundColor(rawColor, routeId || routeShortName);

        return {
          ...feature,
          properties: {
            ...props,
            color,
          },
        } as GeoJSON.Feature;
      }),
    };
  }, [routeLine]);

  useEffect(() => {
    if (!routeLineFeatureCollection || routeLineFeatureCollection.features.length === 0) {
      setRouteDrawProgress(1);
      return;
    }

    let frame = 0;
    const duration = 1400;
    const start = performance.now();
    setRouteDrawProgress(0);

    const tick = (now: number) => {
      const elapsed = now - start;
      const linear = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - linear, 3);
      setRouteDrawProgress(eased);
      if (linear < 1) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [routeLineFeatureCollection]);

  const animatedRouteLineFeatureCollection = useMemo(
    () => animateFeatureCollectionProgress(routeLineFeatureCollection, routeDrawProgress),
    [routeLineFeatureCollection, routeDrawProgress]
  );

  const hasLines = perf.lineShapes && !focusedShared && linesFeatureCollection.features.length > 0;

  const showStopLabels = perf.stopLabels && mapState.zoom >= 15;
  const accessibleStops = useAccessibleStops();
  const accessibilityMode = perf.accessibility;
  const stopScale = accessibilityMode ? 1.5 : 1;
  const darkInk = typeof document !== 'undefined' && document.documentElement.classList.contains('theme-blue') ? '#0f172a' : '#0a0a0a';

  const clearStopHoverTimer = useCallback(() => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  const startStopHoverTimer = useCallback((stopId: string) => {
    clearStopHoverTimer();
    setHoveredStopId(stopId);
    setHoverLabelVisible(false);
    hoverTimerRef.current = window.setTimeout(() => {
      setHoverLabelVisible(true);
    }, 900);
  }, [clearStopHoverTimer]);

  const resetStopHover = useCallback(() => {
    clearStopHoverTimer();
    setHoveredStopId(null);
    setHoverLabelVisible(false);
  }, [clearStopHoverTimer]);

  const stopLinesRef = useRef(stopLinesById);
  stopLinesRef.current = stopLinesById;
  const badgeQueueRef = useRef<string[]>([]);
  const badgeWorkersRef = useRef(0);
  const badgePendingRef = useRef<Record<string, Line[]>>({});
  const badgeFlushRef = useRef<number | null>(null);

  const badgeCandidateIds = useMemo(() => {
    if (!perf.stopLineBadges || visibleStops.length === 0) return '';
    const bounds = mapState.bounds;
    const centerLat = bounds ? (bounds.north + bounds.south) / 2 : 0;
    const centerLon = bounds ? (bounds.east + bounds.west) / 2 : 0;
    const ranked = bounds
      ? [...visibleStops].sort((a, b) =>
        (a.lat - centerLat) ** 2 + (a.lon - centerLon) ** 2 - ((b.lat - centerLat) ** 2 + (b.lon - centerLon) ** 2))
      : visibleStops;
    const ids = ranked.slice(0, MAX_BADGE_STOPS).map(stop => stop.id);
    if (hoveredStopId && !ids.includes(hoveredStopId)) ids.unshift(hoveredStopId);
    return ids.join('|');
  }, [visibleStops, mapState.bounds, perf.stopLineBadges, hoveredStopId]);

  useEffect(() => () => {
    if (badgeFlushRef.current !== null) window.clearTimeout(badgeFlushRef.current);
    badgeQueueRef.current = [];
  }, []);

  useEffect(() => {
    if (!badgeCandidateIds) return;
    const ids = badgeCandidateIds.split('|');
    const known = stopLinesRef.current;

    const instant: Record<string, Line[]> = {};
    const missing: string[] = [];
    for (const stopId of ids) {
      if (known[stopId]) continue;
      const cached = getCachedStopLines(stopId) ?? getGtfsLinesForStopSync(stopId);
      if (cached) instant[stopId] = cached;
      else if (!stopLinesQueueRef.current.has(stopId)) missing.push(stopId);
    }
    if (Object.keys(instant).length > 0) setStopLinesById(prev => ({ ...prev, ...instant }));

    badgeQueueRef.current = missing;
    if (missing.length === 0) return;

    const flush = () => {
      badgeFlushRef.current = null;
      const batch = badgePendingRef.current;
      badgePendingRef.current = {};
      if (Object.keys(batch).length > 0) setStopLinesById(prev => ({ ...prev, ...batch }));
    };
    const worker = async () => {
      badgeWorkersRef.current += 1;
      try {
        for (let stopId = badgeQueueRef.current.shift(); stopId; stopId = badgeQueueRef.current.shift()) {
          if (stopLinesRef.current[stopId] || stopLinesQueueRef.current.has(stopId)) continue;
          stopLinesQueueRef.current.add(stopId);
          try {
            badgePendingRef.current[stopId] = await getStopLines(stopId);
            badgeFlushRef.current ??= window.setTimeout(flush, 120);
          } catch {
          } finally {
            stopLinesQueueRef.current.delete(stopId);
          }
        }
      } finally {
        badgeWorkersRef.current -= 1;
      }
    };
    const toStart = Math.min(BADGE_CONCURRENCY - badgeWorkersRef.current, missing.length);
    for (let i = 0; i < toStart; i += 1) void worker();
  }, [badgeCandidateIds]);

  const renderStopLineBadges = useCallback((stopId: string) => {
    if (!perf.stopLineBadges) return null;
    const lines = sortStopPreviewLines(stopLinesById[stopId] || []);
    if (lines.length === 0) return null;
    const visible = lines.slice(0, MAX_LABEL_LINE_BADGES);
    const hiddenCount = lines.length - visible.length;
    return (
      <span className="inline-flex items-center gap-1">
        {visible.map(line => (
          <LineBadge
            key={line.id}
            line={!line.hasTraffic && disruptedLineIds?.has(line.id) ? { ...line, hasTraffic: true } : line}
            size={perf.accessibility ? 'sm' : 'xs'}
          />
        ))}
        {hiddenCount > 0 && (
          <span
            className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900/90 px-1 text-[0.5625rem] font-extrabold text-white shadow-sm"
            title={`+${hiddenCount}`}
          >
            +{hiddenCount}
          </span>
        )}
      </span>
    );
  }, [stopLinesById, perf.stopLineBadges, perf.accessibility, disruptedLineIds]);

  useEffect(() => {
    return () => {
      clearStopHoverTimer();
    };
  }, [clearStopHoverTimer]);

  const onCenterChangeRef = useRef(onCenterChange);
  useEffect(() => { onCenterChangeRef.current = onCenterChange; }, [onCenterChange]);
  const onUserPanRef = useRef(onUserPan);
  useEffect(() => { onUserPanRef.current = onUserPan; }, [onUserPan]);
  const onMoveSettledRef = useRef(onMoveSettled);
  useEffect(() => { onMoveSettledRef.current = onMoveSettled; }, [onMoveSettled]);

  const updateViewport = useCallback(() => {
    if (!mapRef.current) return;
    const bounds = mapRef.current.getBounds();
    const zoom = mapRef.current.getZoom();
    setMapState({
      bounds: {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      },
      zoom,
    });
    const center = mapRef.current.getCenter();
    onCenterChangeRef.current?.(center.lat, center.lng);
  }, []);

  const handleMapMove = useCallback(throttle(updateViewport, 300), [updateViewport]);

  const [isMapMoving, setIsMapMoving] = useState(false);
  const movingIdleRef = useRef<number | null>(null);

  const markMapMoving = useCallback(() => {
    setIsMapMoving(true);
    if (movingIdleRef.current !== null) window.clearTimeout(movingIdleRef.current);
    movingIdleRef.current = window.setTimeout(() => setIsMapMoving(false), 220);
  }, []);

  useEffect(() => () => {
    if (movingIdleRef.current !== null) window.clearTimeout(movingIdleRef.current);
  }, []);

  useEffect(() => {
    if (mapRef.current) {
      const bounds = mapRef.current.getBounds();
      const zoom = mapRef.current.getZoom();
      setMapState({
        bounds: {
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest(),
        },
        zoom,
      });
    }
  }, []);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    let frame = 0;
    let lastWidth = 0;
    let lastHeight = 0;

    const observer = new ResizeObserver(() => {
      const width = wrapper.clientWidth;
      const height = wrapper.clientHeight;
      if (width === 0 || height === 0) return;
      if (width === lastWidth && height === lastHeight) return;
      lastWidth = width;
      lastHeight = height;

      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => mapRef.current?.getMap?.()?.resize());
    });
    observer.observe(wrapper);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const pendingPaddingRef = useRef<number | null>(null);

  useImperativeHandle(ref, () => ({
    centerOnStop: (stop: Stop) => {
      if (mapRef.current) {
        mapRef.current.flyTo({
          center: [stop.lon, stop.lat],
          zoom: 16,
          duration: 1000,
        });
      }
    },
    setBottomPadding: (px: number) => {
      const map = mapRef.current?.getMap?.();
      if (!map) return;
      if (map.isMoving()) {
        const waiting = pendingPaddingRef.current !== null;
        pendingPaddingRef.current = px;
        if (!waiting) {
          map.once('moveend', () => {
            const pending = pendingPaddingRef.current;
            pendingPaddingRef.current = null;
            if (pending === null || Math.abs((map.getPadding().bottom ?? 0) - pending) < 1) return;
            map.easeTo({ padding: { top: 0, left: 0, right: 0, bottom: pending }, duration: 250 });
          });
        }
        return;
      }
      pendingPaddingRef.current = null;
      const current = map.getPadding();
      if (Math.abs((current.bottom ?? 0) - px) < 1) return;
      map.setPadding({ top: 0, left: 0, right: 0, bottom: px });
    },
    distancePx: (a, b) => {
      const map = mapRef.current?.getMap?.();
      if (!map) return null;
      const pa = map.project([a.lon, a.lat]);
      const pb = map.project([b.lon, b.lat]);
      return Math.hypot(pa.x - pb.x, pa.y - pb.y);
    },
    snapCenterTo: (lat: number, lon: number) => {
      mapRef.current?.easeTo({ center: [lon, lat], duration: 260 });
    },
    centerOnLocation: (lat: number, lon: number) => {
      if (mapRef.current) {
        mapRef.current.flyTo({
          center: [lon, lat],
          zoom: 16,
          duration: 1000,
        });
      }
    },
    fitBounds: (bounds, options) => {
      if (mapRef.current) {
        mapRef.current.fitBounds(bounds, {
          padding: options?.padding ?? 64,
          duration: options?.duration ?? 1000,
        });
      }
    },
    clearStopLabel: () => {
      resetStopHover();
    },
  }));

  const handleMarkerClick = useCallback((stop: Stop) => {
    onStopClick(stop);
  }, [onStopClick]);

  const stopsFeatureCollection = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: mapStopsVisible.map(stop => ({
      type: 'Feature' as const,
      id: undefined,
      properties: {
        stopId: stop.id,
        lineColor: (stop as Stop & { lineColor?: string }).lineColor || '',
      },
      geometry: { type: 'Point' as const, coordinates: [stop.lon, stop.lat] },
    })),
  }), [mapStopsVisible]);

  const stopStatesRef = useRef<{ selected: string | null; endpoints: string[] }>({ selected: null, endpoints: [] });
  useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (!map) return;
    const set = (id: string, state: Record<string, boolean>) => {
      try { map.setFeatureState({ source: 'stops', id }, state); } catch { }
    };
    const apply = () => {
      if (!map.getSource('stops')) return;
      const previous = stopStatesRef.current;
      const selectedId = selectedStop?.id ?? null;
      if (previous.selected && previous.selected !== selectedId) set(previous.selected, { selected: false });
      for (const id of previous.endpoints) if (!selectedRouteStopIds.has(id)) set(id, { endpoint: false });
      if (selectedId) set(selectedId, { selected: true });
      for (const id of selectedRouteStopIds) set(id, { endpoint: true });
      stopStatesRef.current = { selected: selectedId, endpoints: [...selectedRouteStopIds] };
    };
    apply();
    const whenSourceBack = (event: { sourceId?: string }) => {
      if (event.sourceId !== 'stops' || !map.getSource('stops')) return;
      map.off('sourcedata', whenSourceBack);
      apply();
    };
    const reapply = () => {
      stopStatesRef.current = { selected: null, endpoints: [] };
      if (map.getSource('stops')) apply();
      else map.on('sourcedata', whenSourceBack);
    };
    map.on('style.load', reapply);
    return () => {
      map.off('style.load', reapply);
      map.off('sourcedata', whenSourceBack);
    };
  }, [selectedStop?.id, selectedRouteStopIds, stopsLayerReady]);

  const findVisibleStop = useCallback(
    (stopId: string) => mapStops.find(stop => stop.id === stopId) ?? null,
    [mapStops],
  );

  const visibleShared = useMemo<SharedMobilityData>(() => {
    if (!focusedShared) return sharedMobility;

    const points = explodeIntoVehiclePoints(focusedShared.points);

    return {
      citiz: focusedShared.operator === 'citiz' ? points : [],
      voi: focusedShared.operator === 'voi' ? points : [],
      velostan: focusedShared.operator === 'velostan' ? points : [],
    };
  }, [sharedMobility, focusedShared]);

  const toSharedCollection = useCallback((points: SharedVehiclePoint[]): GeoJSON.FeatureCollection => ({
    type: 'FeatureCollection',
    features: points.map(point => ({
      type: 'Feature' as const,
      properties: { pointId: point.id, count: point.vehicles.length },
      geometry: { type: 'Point' as const, coordinates: [point.lon, point.lat] },
    })),
  }), []);

  const sharedIndex = useMemo(() => {
    const index: Record<string, SharedVehiclePoint> = {};
    for (const point of visibleShared.citiz) index[`citiz:${point.id}`] = point;
    for (const point of visibleShared.voi) index[`voi:${point.id}`] = point;
    for (const point of visibleShared.velostan) index[`velostan:${point.id}`] = point;
    return index;
  }, [visibleShared]);

  const handleMapMouseMove = useCallback((event: any) => {
    const feature = nearestStopFeature(event.features ?? [], event.point, mapRef.current?.getMap?.());
    const stopId = feature?.properties?.stopId as string | undefined;

    if (!stopId) {
      if (hoveredStopId !== null) resetStopHover();
      return;
    }
    if (stopId === hoveredStopId) return;
    startStopHoverTimer(stopId);
  }, [hoveredStopId, resetStopHover, startStopHoverTimer]);

  const gatherAround = useCallback((
    operator: SharedOperator,
    center: [number, number],
    radiusPx: number = SHARED_CLUSTER_RADIUS,
  ): SharedVehiclePoint[] => {
    const map = mapRef.current?.getMap?.();
    if (!map) return [];
    const origin = map.project(center);
    const points = visibleShared[operator];

    return points.filter(point => {
      const projected = map.project([point.lon, point.lat]);
      return Math.hypot(projected.x - origin.x, projected.y - origin.y) <= radiusPx;
    });
  }, [visibleShared]);

  const collectSharedSelection = useCallback(async (
    operator: SharedOperator,
    feature: any,
  ): Promise<SharedVehiclePoint[]> => {
    const map = mapRef.current?.getMap?.();
    const source: any = map?.getSource(operator);

    if (feature.properties?.cluster && source?.getClusterLeaves) {
      const leaves: any[] = await new Promise(resolve => {
        source.getClusterLeaves(
          feature.properties.cluster_id,
          MAX_CLUSTER_LEAVES,
          0,
          (error: unknown, features: any[]) => resolve(error ? [] : features ?? []),
        );
      });
      const resolved = leaves
        .map(leaf => sharedIndex[`${operator}:${leaf.properties?.pointId}`])
        .filter((point): point is SharedVehiclePoint => Boolean(point));

      if (resolved.length > 0) return resolved;

      const [lon, lat] = feature.geometry?.coordinates ?? [];
      if (typeof lon === 'number' && typeof lat === 'number') {
        return gatherAround(operator, [lon, lat]);
      }
      return [];
    }

    const single = sharedIndex[`${operator}:${feature.properties?.pointId}`];
    if (single) return [single];

    const [lon, lat] = feature.geometry?.coordinates ?? [];
    if (typeof lon === 'number' && typeof lat === 'number') {
      return gatherAround(operator, [lon, lat]);
    }
    return [];
  }, [sharedIndex, gatherAround]);

  const findNearestSharedPoint = useCallback((lngLat: [number, number]) => {
    const map = mapRef.current?.getMap?.();
    if (!map) return null;

    type Candidate = { operator: SharedOperator; point: SharedVehiclePoint; distance: number };
    const origin = map.project(lngLat);
    let best: Candidate | null = null;

    const inspect = (operator: SharedOperator, points: SharedVehiclePoint[]) => {
      for (const point of points) {
        const projected = map.project([point.lon, point.lat]);
        const distance = Math.hypot(projected.x - origin.x, projected.y - origin.y);
        if (distance <= SHARED_TAP_RADIUS_PX && (!best || distance < best.distance)) {
          best = { operator, point, distance };
        }
      }
    };

    inspect('citiz', visibleShared.citiz);
    inspect('voi', visibleShared.voi);
    inspect('velostan', visibleShared.velostan);
    return best as Candidate | null;
  }, [visibleShared]);

  const focusOnSharedPoint = useCallback((lon: number, lat: number, duration: number) => {
    const map = mapRef.current?.getMap?.();
    if (!map) return;
    if (map.getZoom() >= SHARED_KEEP_ZOOM_FROM) {
      map.easeTo({ center: [lon, lat], duration: Math.min(duration, 500) });
    } else {
      map.flyTo({ center: [lon, lat], zoom: map.getMaxZoom(), duration });
    }
  }, []);

  const zoomToSharedSelection = useCallback((points: SharedVehiclePoint[]) => {
    if (points.length === 0) return;
    const centerLon = points.reduce((sum, point) => sum + point.lon, 0) / points.length;
    const centerLat = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
    focusOnSharedPoint(centerLon, centerLat, 700);
  }, [focusOnSharedPoint]);

  const skipFocusedSharedZoomRef = useRef(false);

  const openSharedSelection = useCallback((
    operator: SharedOperator,
    points: SharedVehiclePoint[],
    focusPoint?: SharedVehiclePoint,
  ) => {
    if (points.length === 0) return;

    if (focusPoint) {
      skipFocusedSharedZoomRef.current = true;
      focusOnSharedPoint(focusPoint.lon, focusPoint.lat, 700);
    } else {
      zoomToSharedSelection(points);
    }

    onSharedSelect?.({ operator, points });
  }, [onSharedSelect, zoomToSharedSelection, focusOnSharedPoint]);

  const mouseLongPressFiredRef = useRef(false);

  const handleMapClick = useCallback((event: any) => {
    if (mouseLongPressFiredRef.current) {
      mouseLongPressFiredRef.current = false;
      return;
    }
    const clicked = event.lngLat;
    if (clicked && consumeLocationPick(clicked.lat, clicked.lng)) return;
    const features: any[] = event.features ?? [];
    const feature = features.find(f => /^(citiz|voi|velostan)-/.test(f?.layer?.id ?? ''))
      ?? nearestStopFeature(features, event.point, mapRef.current?.getMap?.())
      ?? features[0];
    const layerId = feature?.layer?.id as string | undefined;

    const sharedOperator = layerId?.match(/^(citiz|voi|velostan)-/)?.[1] as SharedOperator | undefined;
    if (layerId && sharedOperator) {
      const operator = sharedOperator;
      void collectSharedSelection(operator, feature).then(points => {
        openSharedSelection(operator, points);
      });
      return;
    }

    const stopId = feature?.properties?.stopId as string | undefined;
    if (stopId) {
      const stop = findVisibleStop(stopId);
      if (stop) {
        handleMarkerClick(stop);
        return;
      }
    }

    let lngLat: [number, number] | null = null;
    try {
      const raw = event.lngLat;
      const parsed = Array.isArray(raw) ? raw : raw?.toArray?.() ?? null;
      if (parsed) lngLat = [parsed[0], parsed[1]];
    } catch {
    }
    if (!lngLat) return;

    const nearby = findNearestSharedPoint(lngLat);
    if (nearby) {
      const around = gatherAround(nearby.operator, [nearby.point.lon, nearby.point.lat]);
      openSharedSelection(nearby.operator, around.length > 0 ? around : [nearby.point]);
      return;
    }

    if (!onMapClick) return;
    onMapClick(lngLat[1], lngLat[0]);
  }, [findVisibleStop, handleMarkerClick, onMapClick, collectSharedSelection, openSharedSelection, findNearestSharedPoint, gatherAround]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusedShared || focusedShared.points.length === 0) return;

    if (skipFocusedSharedZoomRef.current) {
      skipFocusedSharedZoomRef.current = false;
      return;
    }

    const spread = explodeIntoVehiclePoints(focusedShared.points);
    const lon = spread.reduce((sum, point) => sum + point.lon, 0) / spread.length;
    const lat = spread.reduce((sum, point) => sum + point.lat, 0) / spread.length;

    focusOnSharedPoint(lon, lat, 900);
  }, [focusedShared, focusOnSharedPoint]);

  const carpoolFeatureCollection = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: carpoolLines
      .filter(line => line.geometry)
      .map(line => ({
        type: 'Feature' as const,
        geometry: line.geometry as GeoJSON.Geometry,
        properties: { color: line.color, code: line.code },
      })),
  }), [carpoolLines]);

  const carpoolLabels = useMemo(
    () =>
      carpoolLines
        .map(line => ({ line, at: midpointOf(line.geometry) }))
        .filter((entry): entry is { line: McoLine; at: [number, number] } => entry.at !== null),
    [carpoolLines],
  );

  const raiseStopsLayer = useCallback(() => {
    const map = mapRef.current?.getMap?.();
    if (!map || typeof map.getLayer !== 'function') return;
    if (!map.getLayer(STOPS_LAYER_ID)) return;

    const layers = map.getStyle()?.layers;
    if (!layers?.length) return;
    if (layers[layers.length - 1].id === STOPS_LAYER_ID) return;

    map.moveLayer(STOPS_LAYER_ID);
  }, []);

  const handleMapContextMenu = useCallback((event: MapLayerMouseEvent) => {
    const picked = event.lngLat;
    if (picked && consumeLocationPick(picked.lat, picked.lng)) {
      event.preventDefault?.();
      event.originalEvent?.preventDefault?.();
      return;
    }
    if (!onLongPress) return;
    event.preventDefault?.();
    event.originalEvent?.preventDefault?.();
    const { lat, lng } = event.lngLat ?? {};
    if (Number.isFinite(lat) && Number.isFinite(lng)) onLongPress(lat, lng);
  }, [onLongPress]);

  const longPressTimerRef = useRef<number | null>(null);

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current === null) return;
    window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  }, []);

  const handleTouchStart = useCallback((event: MapLayerTouchEvent) => {
    cancelLongPress();
    if (!onLongPress || (event.points?.length ?? 1) > 1) return;

    const { lat, lng } = event.lngLat ?? {};
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      navigator.vibrate?.(15);
      if (consumeLocationPick(lat, lng)) return;
      onLongPress(lat, lng);
    }, LONG_PRESS_MS);
  }, [cancelLongPress, onLongPress]);

  const MOUSE_TOLERANCE_PX = 6;
  const stopWatchingMouseRef = useRef<(() => void) | null>(null);

  const handleMouseUp = useCallback(() => {
    stopWatchingMouseRef.current?.();
    stopWatchingMouseRef.current = null;
    cancelLongPress();
  }, [cancelLongPress]);

  const handleMouseDown = useCallback((event: MapLayerMouseEvent) => {
    handleMouseUp();
    mouseLongPressFiredRef.current = false;
    const original = event.originalEvent;
    if (!onLongPress || !original || original.button !== 0) return;

    const { lat, lng } = event.lngLat ?? {};
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const startX = original.clientX;
    const startY = original.clientY;
    const onWindowMove = (move: MouseEvent) => {
      if (Math.hypot(move.clientX - startX, move.clientY - startY) > MOUSE_TOLERANCE_PX) handleMouseUp();
    };
    window.addEventListener('mousemove', onWindowMove);
    window.addEventListener('mouseup', handleMouseUp);
    stopWatchingMouseRef.current = () => {
      window.removeEventListener('mousemove', onWindowMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      stopWatchingMouseRef.current?.();
      stopWatchingMouseRef.current = null;
      mouseLongPressFiredRef.current = true;
      if (consumeLocationPick(lat, lng)) return;
      onLongPress(lat, lng);
    }, LONG_PRESS_MS);
  }, [handleMouseUp, onLongPress]);

  useEffect(() => handleMouseUp, [handleMouseUp]);

  useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (!map) return;
    map.on('style.load', raiseStopsLayer);
    raiseStopsLayer();
    return () => {
      map.off('style.load', raiseStopsLayer);
    };
  }, [raiseStopsLayer, mapStyleUrl]);

  const reconnects = useReconnectCount();
  useEffect(() => {
    if (reconnects === 0) return;
    const map = mapRef.current?.getMap?.();
    if (!map) return;
    let style: ReturnType<typeof map.getStyle> | undefined;
    try {
      style = map.getStyle();
    } catch {
      style = undefined;
    }
    if (!style?.layers?.length) {
      map.setStyle(mapStyleUrl);
      return;
    }
    for (const sourceId of Object.keys(style.sources ?? {})) {
      try {
        map.refreshTiles(sourceId);
      } catch {
      }
    }
  }, [reconnects, mapStyleUrl]);

  const citizCollection = useMemo(
    () => toSharedCollection(visibleShared.citiz),
    [visibleShared.citiz, toSharedCollection],
  );
  const voiCollection = useMemo(
    () => toSharedCollection(visibleShared.voi),
    [visibleShared.voi, toSharedCollection],
  );
  const velostanCollection = useMemo(
    () => toSharedCollection(visibleShared.velostan),
    [visibleShared.velostan, toSharedCollection],
  );

  const [sharedLabels, setSharedLabels] = useState<SharedPinData[]>([]);

  const refreshSharedLabels = useCallback(() => {
    const map = mapRef.current?.getMap?.();
    if (!map || (mapState.zoom < SHARED_LABEL_MIN_ZOOM && !focusedShared)) {
      setSharedLabels(current => (current.length === 0 ? current : []));
      return;
    }

    const pins: SharedPinData[] = [];
    const cap = focusedShared ? MAX_FOCUS_LABELS : MAX_SHARED_LABELS;
    for (const operator of ['citiz', 'voi', 'velostan'] as SharedOperator[]) {
      let taken = 0;
      if (!map.getSource(operator)) continue;
      const seen = new Set<string>();
      let features: Array<{ properties?: Record<string, unknown>; geometry?: { coordinates?: number[] } }> = [];
      try {
        const layerId = SHARED_LAYER_IDS[operator];
        if (!map.getLayer(layerId)) continue;
        features = map.queryRenderedFeatures({ layers: [layerId] }) as unknown as typeof features;
      } catch {
        continue;
      }

      for (const feature of features) {
        const properties = feature.properties ?? {};
        const coordinates = feature.geometry?.coordinates;
        if (!coordinates || coordinates.length < 2) continue;

        const clusterId = properties.cluster ? String(properties.cluster_id) : null;
        const pointId = properties.pointId ? String(properties.pointId) : null;
        const key = clusterId ? `c${clusterId}` : `p${pointId}`;
        if (!key || seen.has(key)) continue;
        seen.add(key);

        if (taken >= cap) break;
        taken += 1;

        const point = pointId ? sharedIndex[`${operator}:${pointId}`] : undefined;
        pins.push({
          key: `${operator}-${key}`,
          operator,
          lon: coordinates[0],
          lat: coordinates[1],
          count: clusterId ? Number(properties.point_count ?? 0) : (point?.vehicles.length ?? 1),
          clusterId,
          point: point ?? null,
        });
      }
    }

    setSharedLabels(pins);
  }, [mapState.zoom, sharedIndex, focusedShared]);

  useEffect(() => {
    const timer = setTimeout(refreshSharedLabels, 180);
    return () => clearTimeout(timer);
  }, [refreshSharedLabels, mapState.bounds, visibleShared]);

  const labelledStops = useMemo(() => {
    if (focusedShared) return [];

    const pinned = alwaysLabelledStopIds?.length
      ? mapStops.filter(stop => alwaysLabelledStopIds.includes(stop.id))
      : [];

    if (showStopLabels) {
      const rest = visibleStops.filter(stop => !pinned.some(entry => entry.id === stop.id));
      return [...pinned, ...rest].slice(0, MAX_DOM_LABELS);
    }
    if (hoverLabelVisible && hoveredStopId) {
      const hovered = visibleStops.find(stop => stop.id === hoveredStopId);
      if (hovered && !pinned.some(entry => entry.id === hovered.id)) return [...pinned, hovered];
    }
    return pinned;
  }, [focusedShared, showStopLabels, visibleStops, mapStops, alwaysLabelledStopIds, hoveredStopId, hoverLabelVisible]);

  return (
    <div ref={wrapperRef} className={`w-full h-full ${pickMode ? 'cursor-crosshair' : ''}`}>
      <MapLibreMap
        ref={mapRef}
        mapStyle={mapStyleUrl}
        onLoad={(event: any) => {
          try {
            event.target?.setPixelRatio?.(mapPixelRatio(detectDeviceTier()));
          } catch {
          }
        }}
        initialViewState={{
          longitude: GRENOBLE_CENTER[1],
          latitude: GRENOBLE_CENTER[0],
          zoom: 12.1,
        }}
        style={{ width: '100%', height: '100%' }}
        fadeDuration={0}
        refreshExpiredTiles={false}
        maxTileCacheSize={400}
        onStyleData={(evt: any) => {
          const map = evt.target;
          if (!map) return;
          setStopsLayerReady(Boolean(map.getLayer?.(STOPS_LAYER_ID)));
          if (styleImageHookRef.current) return;
          styleImageHookRef.current = true;
          map.on('styleimagemissing', (event: any) => handleStyleImageMissing(map, event));
        }}
        onMove={() => {
          markMapMoving();
          handleMapMove();
        }}
        onMoveEnd={() => {
          updateViewport();
          const center = mapRef.current?.getCenter();
          if (center) onMoveSettledRef.current?.(center.lat, center.lng);
        }}
        onDragStart={() => onUserPanRef.current?.()}
        onZoomEnd={updateViewport}
        interactiveLayerIds={[STOPS_LAYER_ID, STOPS_HIT_LAYER_ID]}
        cursor={hoveredStopId ? 'pointer' : undefined}
        onMouseMove={handleMapMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMoveStart={handleMouseUp}
        onMouseLeave={() => { handleMouseUp(); resetStopHover(); }}
        onClick={handleMapClick}
        onContextMenu={handleMapContextMenu}
        onTouchStart={handleTouchStart}
        onTouchMove={cancelLongPress}
        onTouchEnd={cancelLongPress}
        onTouchCancel={cancelLongPress}
      >
        <Source id="stops" type="geojson" data={stopsFeatureCollection} promoteId="stopId">
          <Layer
            id={STOPS_HIT_LAYER_ID}
            type="circle"
            beforeId={ROAD_LABELS_LAYER_ID}
            paint={{
              'circle-radius': STOP_HIT_RADIUS_PX * (accessibilityMode ? 1.3 : 1),
              'circle-color': '#000000',
              'circle-opacity': 0,
            }}
          />
          <Layer
            id={STOPS_LAYER_ID}
            type="circle"
            beforeId={ROAD_LABELS_LAYER_ID}
            paint={{
              'circle-radius': [
                'interpolate', ['linear'], ['zoom'],
                10, ['case', SELECTED_STATE, 9 * stopScale, 6 * stopScale],
                13, ['case', SELECTED_STATE, 11 * stopScale, 7 * stopScale],
                16, ['case', SELECTED_STATE, 12 * stopScale, 8 * stopScale],
              ] as any,
              'circle-color': [
                'case',
                ENDPOINT_STATE, '#ffffff',
                SELECTED_STATE, '#6B7280',
                ['!=', ['get', 'lineColor'], ''], isDarkMode ? darkInk : '#ffffff',
                '#facc15',
              ] as any,
              'circle-stroke-color': [
                'case',
                ENDPOINT_STATE, '#111827',
                ['!=', ['get', 'lineColor'], ''], ['get', 'lineColor'],
                '#ffffff',
              ] as any,
              'circle-stroke-width': [
                'case',
                SELECTED_STATE, 3,
                ['!=', ['get', 'lineColor'], ''], 3,
                2,
              ] as any,
            }}
          />
        </Source>

        {showVoiZones && voiZones && (
          <Source id="voi-zones" type="geojson" data={voiZones}>
            <Layer
              id="voi-zones-fill"
              beforeId={STOPS_LAYER_ID}
              type="fill"
              filter={['!=', ['get', 'kind'], 'limit']}
              paint={{
                'fill-color': ['match', ['get', 'kind'], 'no-ride', '#ef4444', 'no-parking', '#f59e0b', '#3b82f6'] as any,
                'fill-opacity': ['match', ['get', 'kind'], 'no-ride', 0.22, 'no-parking', 0.2, 0.3] as any,
              }}
            />
            <Layer
              id="voi-zones-line"
              beforeId={STOPS_LAYER_ID}
              type="line"
              filter={['!=', ['get', 'kind'], 'limit']}
              paint={{
                'line-color': ['match', ['get', 'kind'], 'no-ride', '#ef4444', 'no-parking', '#f59e0b', '#3b82f6'] as any,
                'line-width': ['match', ['get', 'kind'], 'parking', 1, 2] as any,
                'line-opacity': 0.8,
              }}
            />
            <Layer
              id="voi-zones-limit"
              beforeId={STOPS_LAYER_ID}
              type="line"
              filter={['==', ['get', 'kind'], 'limit']}
              paint={{
                'line-color': '#ef4444',
                'line-width': 2.5,
                'line-opacity': 0.85,
                'line-dasharray': [3, 2],
              }}
            />
          </Source>
        )}

        {carpoolFeatureCollection.features.length > 0 && (
          <Source id="carpool-lines" type="geojson" data={carpoolFeatureCollection}>
            <Layer
              id="carpool-lines-casing"
              beforeId={STOPS_LAYER_ID}
              type="line"
              layout={{ 'line-join': 'round', 'line-cap': 'round' }}
              paint={{ 'line-color': '#ffffff', 'line-width': 10, 'line-opacity': 0.55 }}
            />
            <Layer
              id="carpool-lines-line"
              beforeId={STOPS_LAYER_ID}
              type="line"
              layout={{ 'line-join': 'round', 'line-cap': 'round' }}
              paint={{
                'line-color': ['get', 'color'] as any,
                'line-width': 5,
                'line-opacity': 0.95,
              }}
            />
          </Source>
        )}

        {carpoolLabels.map(({ line, at }) => (
          <Marker key={`carpool-${line.code}`} longitude={at[0]} latitude={at[1]} anchor="center">
            <div
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold text-white"
              style={{
                backgroundColor: line.color,
                boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              {appLanguage() === 'en' ? 'Line' : 'Ligne'} {line.shortName}
            </div>
          </Marker>
        ))}

        {hasLines && (
          <Source id="line-shapes" type="geojson" data={linesFeatureCollection}>
            <Layer
              id="line-shapes-casing"
              beforeId={STOPS_LAYER_ID}
              type="line"
              layout={{ 'line-join': 'round', 'line-cap': 'round' }}
              paint={{
                'line-color': '#ffffff',
                'line-width': 12,
                'line-opacity': 0.6,
              }}
            />
            <Layer
              id="line-shapes-line"
              beforeId={STOPS_LAYER_ID}
              type="line"
              layout={{ 'line-join': 'round', 'line-cap': 'round' }}
              paint={{
                'line-color': ['get', 'color'] as any,
                'line-width': 7,
                'line-opacity': 0.95,
              }}
            />
          </Source>
        )}

        {animatedRouteLineFeatureCollection && animatedRouteLineFeatureCollection.features.length > 0 && (
          <Source id="route-line" type="geojson" data={animatedRouteLineFeatureCollection}>
            <Layer
              id="route-line-walk"
              beforeId={STOPS_LAYER_ID}
              type="line"
              filter={['==', ['get', 'isWalk'], true]}
              layout={{ 'line-join': 'round', 'line-cap': 'butt' }}
              paint={{
                'line-color': '#94a3b8',
                'line-width': 4,
                'line-dasharray': [3, 3],
                'line-opacity': 0.6,
              }}
            />
            <Layer
              id="route-line-transit-casing"
              beforeId={STOPS_LAYER_ID}
              type="line"
              filter={['==', ['get', 'isWalk'], false]}
              layout={{ 'line-join': 'round', 'line-cap': 'round' }}
              paint={{
                'line-color': ['get', 'color'],
                'line-width': 10,
                'line-opacity': 0.3,
              }}
            />
            <Layer
              id="route-line-transit"
              beforeId={STOPS_LAYER_ID}
              type="line"
              filter={['==', ['get', 'isWalk'], false]}
              layout={{ 'line-join': 'round', 'line-cap': 'round' }}
              paint={{
                'line-color': ['get', 'color'],
                'line-width': 5,
                'line-opacity': 0.95,
              }}
            />
          </Source>
        )}

        {routeStops && routeStops.features.length > 0 && (
          <Source id="route-stops" type="geojson" data={routeStops}>
            <Layer
              id="route-stops-transfer"
              type="circle"
              filter={['==', ['get', 'kind'], 'transfer']}
              paint={{
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 4, 14, 6, 17, 8] as any,
                'circle-color': isDarkMode ? darkInk : '#ffffff',
                'circle-stroke-color': ['get', 'color'] as any,
                'circle-stroke-width': 3,
                'circle-opacity': routeDrawProgress,
                'circle-stroke-opacity': routeDrawProgress,
              }}
            />
            <Layer
              id="route-stops-endpoint"
              type="circle"
              filter={['==', ['get', 'kind'], 'endpoint']}
              paint={{
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 5, 14, 7.5, 17, 9.5] as any,
                'circle-color': isDarkMode ? '#e2e8f0' : '#ffffff',
                'circle-stroke-color': isDarkMode ? '#e2e8f0' : '#0f172a',
                'circle-stroke-width': 3.5,
                'circle-opacity': routeDrawProgress,
                'circle-stroke-opacity': routeDrawProgress,
              }}
            />
          </Source>
        )}

        {routeLineBadges && mapState.zoom >= 11.5 && routeLineBadges.map(badge => (
          <Marker
            key={`route-badge-${badge.legIndex}`}
            longitude={badge.lon}
            latitude={badge.lat}
            anchor="center"
          >
            <div
              style={{
                filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.45))',
                opacity: routeDrawProgress,
                pointerEvents: 'none',
              }}
            >
              <LineBadge
                line={{ id: badge.lineKey, shortName: badge.lineKey, color: badge.color }}
                size="xs"
              />
            </div>
          </Marker>
        ))}

        {routeStart && routeStart.kind !== 'stop' && (
          <Marker longitude={routeStart.lon} latitude={routeStart.lat} anchor="center">
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                backgroundColor: '#ffffff',
                border: '3px solid #111827',
                boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
              }}
              title={`${appLanguage() === 'en' ? 'Start' : 'Départ'} : ${routeStart.label}`}
            />
          </Marker>
        )}

        {routeEnd && routeEnd.kind !== 'stop' && (
          <Marker longitude={routeEnd.lon} latitude={routeEnd.lat} anchor="center">
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                backgroundColor: '#ffffff',
                border: '3px solid #111827',
                boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
              }}
              title={`${appLanguage() === 'en' ? 'Destination' : 'Arrivée'} : ${routeEnd.label}`}
            />
          </Marker>
        )}

        {stopsLayerReady && sharedMobility.citiz.length > 0 && (
          <Source
            id="citiz"
            type="geojson"
            data={citizCollection}
            cluster={!focusedShared}
            clusterRadius={SHARED_CLUSTER_RADIUS}
            clusterMaxZoom={SHARED_CLUSTER_MAX_ZOOM}
          >
            <Layer
              id={CITIZ_LAYER_ID}
              type="circle"
              beforeId={STOPS_LAYER_ID}
              paint={{ ...sharedCirclePaint(CITIZ_COLOR) }}
            />
          </Source>
        )}

        {stopsLayerReady && sharedMobility.voi.length > 0 && (
          <Source
            id="voi"
            type="geojson"
            data={voiCollection}
            cluster={!focusedShared}
            clusterRadius={SHARED_CLUSTER_RADIUS}
            clusterMaxZoom={SHARED_CLUSTER_MAX_ZOOM}
          >
            <Layer
              id={VOI_LAYER_ID}
              type="circle"
              beforeId={STOPS_LAYER_ID}
              paint={{ ...sharedCirclePaint(VOI_COLOR) }}
            />
          </Source>
        )}

        {stopsLayerReady && sharedMobility.velostan.length > 0 && (
          <Source
            id="velostan"
            type="geojson"
            data={velostanCollection}
            cluster={!focusedShared}
            clusterRadius={SHARED_CLUSTER_RADIUS}
            clusterMaxZoom={SHARED_CLUSTER_MAX_ZOOM}
          >
            <Layer
              id={VELOSTAN_LAYER_ID}
              type="circle"
              beforeId={STOPS_LAYER_ID}
              paint={{ ...sharedCirclePaint(VELOSTAN_COLOR) }}
            />
          </Source>
        )}

        {sharedLabels.map(pin => (
          <Marker
            key={pin.key}
            longitude={pin.lon}
            latitude={pin.lat}
            anchor="bottom"
            onClick={() => {
              if (pin.clusterId) {
                void collectSharedSelection(pin.operator, {
                  properties: { cluster: true, cluster_id: Number(pin.clusterId) },
                  geometry: { coordinates: [pin.lon, pin.lat] },
                }).then(points => {
                  const resolved = points.length > 0
                    ? points
                    : gatherAround(pin.operator, [pin.lon, pin.lat]);
                  openSharedSelection(pin.operator, resolved);
                });
                return;
              }
              if (pin.point) openSharedSelection(pin.operator, [pin.point]);
            }}
          >
            <SharedPin
              pin={pin}
              highlighted={Boolean(
                highlightedVehicleId &&
                pin.point?.vehicles.some(vehicle => vehicle.id === highlightedVehicleId),
              )}
            />
          </Marker>
        ))}

        {labelledStops.map(stop => {
          const accessible = isStopAccessible(accessibleStops, stop);
          return (
          <Marker key={`label-${stop.id}`} longitude={stop.lon} latitude={stop.lat} anchor="bottom">
            {accessibilityMode && accessible && (
              <div
                className="mx-auto mb-1 flex items-center justify-center rounded-xl border-2"
                style={{
                  width: 34,
                  height: 34,
                  borderColor: '#22c55e',
                  backgroundColor: isDarkMode ? 'rgba(var(--gl-ink-rgb), 0.94)' : 'rgba(255, 255, 255, 0.96)',
                  boxShadow: '0 2px 6px rgba(0, 0, 0, 0.2)',
                  opacity: isMapMoving ? 0.25 : 1,
                  transition: 'opacity 180ms ease-out',
                  pointerEvents: 'none',
                }}
              >
                <FaWheelchair style={{ width: 20, height: 20, color: '#22c55e' }} />
              </div>
            )}
            <div
              style={{
                marginBottom: accessibilityMode ? '16px' : '10px',
                whiteSpace: 'nowrap',
                fontSize: accessibilityMode ? '15px' : '11px',
                fontWeight: 600,
                color: isDarkMode ? '#f8fafc' : '#0f172a',
                backgroundColor: isDarkMode ? 'rgba(var(--gl-ink-rgb), 0.92)' : 'rgba(255, 255, 255, 0.92)',
                padding: accessibilityMode ? '4px 9px' : '2px 6px',
                borderRadius: accessibilityMode ? '9px' : '6px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.15)',
                pointerEvents: 'none',
                letterSpacing: '0.01em',
              }}
            >
              <span className="inline-flex items-center gap-1.5">
                {isSncfStopId(stop.id) && (
                  <img src={badgeImage('/assets/sncf-reseau.svg')} alt="SNCF" className="h-[1.25em] w-auto flex-shrink-0" />
                )}
                <span>
                  {stop.name}
                  {accessible && !accessibilityMode && (
                    <FaWheelchair
                      className="ml-1 inline-block h-[0.85em] w-[0.85em] align-baseline text-blue-500"
                      aria-hidden
                    />
                  )}
                </span>
                {renderStopLineBadges(stop.id)}
              </span>
            </div>
          </Marker>
          );
        })}

        {selectedAddress && (
          <Marker
            longitude={selectedAddress.lon}
            latitude={selectedAddress.lat}
            anchor="center"
          >
            <div
              style={{
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                backgroundColor: '#ffffff',
                border: '3px solid #111827',
                boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
                cursor: 'default',
              }}
              title={selectedAddress.label}
            />
          </Marker>
        )}

        {currentLocation && (
          <Marker longitude={currentLocation.lon} latitude={currentLocation.lat}>
            <div
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor: '#3B82F6',
                border: '2px solid white',
                boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
              }}
            />
          </Marker>
        )}
      </MapLibreMap>
    </div>
  );
};

const SharedPin = memo(function SharedPin({ pin, highlighted = false }: { pin: SharedPinData; highlighted?: boolean }) {
  const color = SHARED_COLORS[pin.operator];
  const formFactor = pin.point
    ? dominantFormFactor(pin.point)
    : (pin.operator === 'citiz' ? 'car' : pin.operator === 'velostan' ? 'bicycle' : 'scooter');
  const full = pin.point ? hasFullBattery(pin.point) : false;

  return (
    <motion.div
      style={{
        position: 'relative',
        width: 30,
        height: 38,
        cursor: 'pointer',
        transformOrigin: 'bottom center',
        zIndex: highlighted ? 10 : 1,
      }}
      initial={{ scale: 0.35, y: 10, opacity: 0 }}
      animate={{ scale: highlighted ? 1.55 : 1, y: 0, opacity: 1 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
    >
      <div
        style={{
          width: 30,
          height: 30,
          backgroundColor: color,
          borderRadius: '50% 50% 50% 0',
          transform: 'rotate(-45deg)',
          boxShadow: highlighted ? '0 0 0 3px rgba(255,255,255,0.9), 0 4px 12px rgba(0,0,0,0.45)' : '0 2px 6px rgba(0,0,0,0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <VehicleGlyph formFactor={formFactor} size={17} color="#ffffff" rotated />
      </div>

      {full && (
        <span
          title={`Batterie pleine (${FULL_BATTERY_PERCENT} % ou plus)`}
          style={{
            position: 'absolute',
            top: -2,
            right: -2,
            width: 10,
            height: 10,
            borderRadius: '50%',
            backgroundColor: '#22c55e',
            border: '2px solid #ffffff',
          }}
        />
      )}

      {pin.count > 1 && (
        <span
          style={{
            position: 'absolute',
            bottom: 2,
            left: '50%',
            transform: 'translateX(-50%)',
            minWidth: 16,
            padding: '0 3px',
            borderRadius: 8,
            backgroundColor: '#0f172a',
            color: '#ffffff',
            fontSize: 10,
            fontWeight: 700,
            textAlign: 'center',
            lineHeight: '14px',
            border: '1.5px solid #ffffff',
          }}
        >
          {pin.count}
        </span>
      )}
    </motion.div>
  );
});

export const Map = forwardRef<MapRef, MapProps>(MapComponentBase);
