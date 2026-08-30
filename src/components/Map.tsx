import { useRef, forwardRef, useImperativeHandle, useCallback, useState, useMemo, useEffect, memo } from 'react';
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
import { resolveLineBackgroundColor } from '../utils/lineColors';
import type { JourneyBadge } from '../utils/journeyGeometry';
import { LineBadge } from './LineBadge';
import { midpointOf, type McoLine } from '../services/mcoLines';
import { usePerfSettings } from '../hooks/usePerfSettings';
import { motion } from 'framer-motion';
import { VehicleGlyph } from './VehicleGlyph';
import {
  EMPTY_SHARED_MOBILITY,
  FULL_BATTERY_PERCENT,
  dominantFormFactor,
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
  
  routeLine?: GeoJSON.FeatureCollection | null;
  
  routeStops?: GeoJSON.FeatureCollection | null;
  
  routeLineBadges?: JourneyBadge[] | null;
  /**
   * Les liaisons de covoiturage à tracer.
   *
   * Elles n'apparaissent que pour un point M'Covoit ouvert : ce sont de longs
   * axes qui traversent toute la cuvette, et les laisser en permanence
   * barrerait la carte sans rien apprendre à qui cherche un tram.
   */
  carpoolLines?: McoLine[];
  
  lineGeometries?: LineGeometry[];
  
  visibleStopPoints?: ServedStopPoint[] | null;
  
  /** Un point est en attente d'être désigné : extrémité du trajet, domicile ou travail. */
  /**
   * Le centre de la carte, à chaque déplacement (limité à trois fois par
   * seconde comme le reste du suivi de viewport).
   */
  onCenterChange?: (lat: number, lon: number) => void;
  pickMode?: 'from' | 'to' | 'home' | 'work' | null;
  onMapClick?: (lat: number, lon: number) => void;
  /**
   * Appui long sur un point de la carte. MapLibre le rapporte comme un
   * `contextmenu` : clic droit sur ordinateur, doigt maintenu sur mobile.
   */
  onLongPress?: (lat: number, lon: number) => void;
  isDarkMode?: boolean;
  
  sharedMobility?: SharedMobilityData;
  
  onSharedSelect?: (selection: { operator: SharedOperator; points: SharedVehiclePoint[] }) => void;
  
  focusedShared?: { operator: SharedOperator; points: SharedVehiclePoint[] } | null;
  
  highlightedVehicleId?: string | null;
}

const MAX_LABEL_LINE_BADGES = 3;

const STOPS_LAYER_ID = 'stops-circles';
const ROAD_LABELS_LAYER_ID = 'Road labels';

/** Durée du contact au-delà de laquelle on désigne un point plutôt qu'on ne fait glisser la carte. */
const LONG_PRESS_MS = 500;

const CITIZ_LAYER_ID = 'citiz-circles';
const VOI_LAYER_ID = 'voi-circles';
const CITIZ_COLOR = '#2563eb';
const VOI_COLOR = '#ec4899';

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

/** Rayon de tolérance, en pixels, pour attraper un véhicule au clic. */
const SHARED_TAP_RADIUS_PX = 18;

/** Nombre maximal de véhicules rapportés par un amas cliqué. */
const MAX_CLUSTER_LEAVES = 200;

/**
 * Peinture commune aux deux opérateurs : pastille plus petite que celle d'un
 * arrêt, qui grossit un peu quand elle représente un amas — la taille dit
 * « il y en a plusieurs » sans avoir besoin d'un chiffre lisible au 1:20 000.
 */
const sharedCirclePaint = (color: string) => ({
  'circle-radius': 2.5,
  'circle-color': color,
  'circle-stroke-color': '#ffffff',
  'circle-stroke-width': 1,
  'circle-opacity': ['step', ['zoom'], 1, SHARED_LABEL_MIN_ZOOM, 0] as any,
  'circle-stroke-opacity': ['step', ['zoom'], 1, SHARED_LABEL_MIN_ZOOM, 0] as any,
});

/**
 * Plafond d'étiquettes DOM. Au zoom où elles apparaissent il y en a rarement
 * plus d'une trentaine ; cette limite protège les cas extrêmes (grand écran,
 * secteur très dense) où elles se chevaucheraient de toute façon.
 */
const MAX_DOM_LABELS = 40;

/** Deux fonds de carte MapTiler : un pour chaque thème de l'app. */
const DARK_MODE_MAP_STYLE_URL = 'https://api.maptiler.com/maps/019f7c73-0431-726f-ae5d-598a16a06771/style.json?key=7TQErbyvEqFlis3QMmSl';
const LIGHT_MODE_MAP_STYLE_URL = 'https://api.maptiler.com/maps/019f7c76-a3f8-751b-bedb-d7fe9d83d122/style.json?key=7TQErbyvEqFlis3QMmSl';

export interface MapRef {
  centerOnStop: (stop: Stop) => void;
  centerOnLocation: (lat: number, lon: number) => void;
  fitBounds: (
    bounds: [[number, number], [number, number]],
    options?: { padding?: number; duration?: number }
  ) => void;
  clearStopLabel: () => void;
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

const GRENOBLE_CENTER: [number, number] = [45.18501, 5.74892];

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

/**
 * Pastille transparente d'un pixel, servie à la place d'une image manquante.
 *
 * Un `ImageData` plutôt qu'un `<canvas>` : MapLibre lisait sur le canvas une
 * taille nulle et rejetait l'image, ce qui produisait un « mismatched image
 * size » à chaque appel sans jamais combler le manque. `ImageData` porte ses
 * dimensions et ses octets dans le format que MapLibre attend.
 */
const createPlaceholderSprite = (): ImageData => new ImageData(1, 1);

/** Identifiants déjà tentés, pour ne pas réessayer à chaque tuile. */
const attemptedMissingImages = new Set<string>();

/**
 * Comble les images que le style réclame et que le sprite ne contient pas.
 *
 * Le style MapTiler référence des écussons routiers (`IT-highway_6`,
 * `road_…`) absents de son propre sprite. Chaque tuile qui en contient un
 * relance la demande, et MapLibre journalise une erreur à chaque fois : la
 * console en recevait des centaines par seconde, et les écrire coûte du temps
 * de rendu. On répond par une image vide, quel que soit l'identifiant — un
 * écusson manquant ne se dessine pas, mais il ne bloque plus rien.
 */
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

/**
 * Merge all line geometries into one FeatureCollection. We pre-compute the
 * `color` property on each feature so the GL layer can just read
 * `['get','color']` and tint each polyline with its real MTAG colour.
 *
 * We use the raw GTFS coordinates as-is — no spline smoothing — since the
 * smoothing produced visible artefacts on tight corners and around loops.
 * MapLibre's `line-join: round` already softens the corners enough.
 */

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
  { stops, selectedStop, currentLocation, onStopClick, selectedAddress, alwaysLabelledStopIds = null, routeStart, routeEnd, routeLine, routeStops = null, routeLineBadges = null, carpoolLines = [], lineGeometries = [], visibleStopPoints, onCenterChange, pickMode, onMapClick, onLongPress, isDarkMode = false, sharedMobility = EMPTY_SHARED_MOBILITY, onSharedSelect, focusedShared = null, highlightedVehicleId = null }: MapProps,
  ref: ForwardedRef<MapRef>
) => {
  const { settings: perf } = usePerfSettings();
  const mapRef = useRef<MapLibreRef>(null);
  const [mapState, setMapState] = useState<MapState>({ bounds: null, zoom: 12.1 });
  const wrapperRef = useRef<HTMLDivElement>(null);
  /** Garde-fou : l'écouteur d'images manquantes ne se pose qu'une fois. */
  const styleImageHookRef = useRef(false);
  const [routeDrawProgress, setRouteDrawProgress] = useState(1);
  const [hoveredStopId, setHoveredStopId] = useState<string | null>(null);
  /**
   * La couche des arrêts sert de repère à toutes les autres via `beforeId`.
   * MapLibre refuse une référence vers une couche absente et fait échouer le
   * montage : les couches montées tôt — véhicules partagés servis depuis le
   * cache — attendent donc de savoir qu'elle existe.
   */
  const [stopsLayerReady, setStopsLayerReady] = useState(false);
  const [hoverLabelVisible, setHoverLabelVisible] = useState(false);
  const hoverTimerRef = useRef<number | null>(null);
  const [stopLinesById, setStopLinesById] = useState<Record<string, Line[]>>({});
  const stopLinesQueueRef = useRef<Set<string>>(new Set());

  const mapStyleUrl = isDarkMode ? DARK_MODE_MAP_STYLE_URL : LIGHT_MODE_MAP_STYLE_URL;

  /**
   * Arrêts confiés à la couche GPU : filtre de ligne et aimantage appliqués,
   * mais **sans découpage au viewport**.
   *
   * Le découpage n'avait de sens qu'avec des marqueurs DOM, où chaque arrêt
   * hors écran coûtait un nœud. Une couche GPU, elle, écarte déjà l'invisible
   * à l'échelle de la tuile. Garder le filtre viewport ici obligeait à
   * reconstruire et à refaire analyser tout le GeoJSON à chaque déplacement de
   * carte — du travail à répétition sur le fil principal pendant les gestes.
   */
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

  /**
   * Arrêts réellement dessinés. Pendant la consultation d'une station de
   * mobilité partagée, la carte se vide : on est venu voir ces véhicules, tout
   * le reste est du bruit.
   */
  const mapStopsVisible = useMemo(() => (focusedShared ? [] : mapStops), [focusedShared, mapStops]);

  /**
   * Sous-ensemble réellement à l'écran. Ne sert plus qu'à ce qui coûte cher par
   * arrêt : les étiquettes DOM et le préchargement des lignes desservies.
   */
  const visibleStops = useMemo(() => {
    if (!mapState.bounds) return mapStops;
    const paddedBounds = getPaddedViewportBounds(mapState.bounds, mapState.zoom);
    return mapStops.filter(stop => isStopInViewport(stop, paddedBounds));
  }, [mapStops, mapState]);

  /**
   * Combined GeoJSON for all currently-displayed line shapes. Memoized so
   * MapLibre only re-uploads the source when the set of lines actually changes.
   */
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

  /** Show stop name labels when zoomed in enough to read them comfortably, or
   * after a short hover delay when the user is still zoomed out. */
  const showStopLabels = perf.stopLabels && mapState.zoom >= 15;
  /* Les arrêts accessibles en fauteuil : le pictogramme ne paraît qu'avec
     l'étiquette, donc au zoom rapproché, là où l'on choisit son quai. */
  const accessibleStops = useAccessibleStops();
  /* Le mode accessibilité change la forme du renseignement, pas son contenu :
     une pastille au-dessus du point plutôt qu'un pictogramme collé au nom. */
  const accessibilityMode = perf.accessibility;

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

  useEffect(() => {
    if (!perf.stopLineBadges) return;

    const idsToInspect = visibleStops.slice(0, 35).map(stop => stop.id);
    if (idsToInspect.length === 0) return;

    let hasCacheUpdates = false;
    const cacheUpdates: Record<string, Line[]> = {};
    for (const stopId of idsToInspect) {
      if (stopLinesById[stopId]) continue;
      const cached = getCachedStopLines(stopId);
      if (!cached) continue;
      cacheUpdates[stopId] = cached;
      hasCacheUpdates = true;
    }
    if (hasCacheUpdates) {
      setStopLinesById(prev => ({ ...prev, ...cacheUpdates }));
    }

    const idsToLoad = idsToInspect.filter(stopId => {
      if (stopLinesById[stopId]) return false;
      if (cacheUpdates[stopId]) return false;
      if (stopLinesQueueRef.current.has(stopId)) return false;
      return true;
    });

    if (idsToLoad.length === 0) return;

    let cancelled = false;
    const runQueue = async () => {
      const queue = [...idsToLoad];
      const concurrency = 4;
      const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
        while (queue.length > 0 && !cancelled) {
          const stopId = queue.shift();
          if (!stopId) return;
          stopLinesQueueRef.current.add(stopId);
          try {
            const lines = await getStopLines(stopId);
            if (cancelled) return;
            setStopLinesById(prev => (prev[stopId] ? prev : { ...prev, [stopId]: lines }));
          } finally {
            stopLinesQueueRef.current.delete(stopId);
          }
        }
      });
      await Promise.all(workers);
    };

    const timer = window.setTimeout(() => {
      void runQueue().catch(() => {});
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [visibleStops, stopLinesById, perf.stopLineBadges]);

  const renderStopLineBadges = useCallback((stopId: string) => {
    if (!perf.stopLineBadges) return null;
    const lines = stopLinesById[stopId] || [];
    if (lines.length === 0) return null;
    const visible = lines.slice(0, MAX_LABEL_LINE_BADGES);
    const hiddenCount = lines.length - visible.length;
    return (
      <span className="inline-flex items-center gap-1">
        {visible.map(line => (
          <LineBadge key={line.id} line={line} size="xs" />
        ))}
        {hiddenCount > 0 && (
          <span
            className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900/90 px-1 text-[9px] font-extrabold text-white shadow-sm"
            title={`+${hiddenCount}`}
          >
            +{hiddenCount}
          </span>
        )}
      </span>
    );
  }, [stopLinesById, perf.stopLineBadges]);

  useEffect(() => {
    return () => {
      clearStopHoverTimer();
    };
  }, [clearStopHoverTimer]);

  /*
   * Le rappel du parent vit dans une référence : sans elle, il entrerait dans
   * les dépendances de `updateViewport`, qui changerait d'identité à chaque
   * rendu du parent — et avec lui les écouteurs de la carte.
   */
  const onCenterChangeRef = useRef(onCenterChange);
  useEffect(() => { onCenterChangeRef.current = onCenterChange; }, [onCenterChange]);

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

  /**
   * Vrai pendant qu'on déplace ou qu'on zoome.
   *
   * Sert aux pastilles d'accessibilité, qui sont larges : posées en pleine
   * opacité, elles se recouvrent l'une l'autre dès qu'on fait glisser la carte
   * et cachent les arrêts qu'on est en train de chercher. Elles s'effacent donc
   * le temps du geste et reviennent quand il s'arrête.
   *
   * Le repos se déduit du silence, et non d'un `moveend` : ces événements
   * s'apparient mal — une inertie, un `easeTo` déclenché pendant qu'on fait
   * glisser, et l'on reçoit deux débuts pour une fin. Les pastilles restaient
   * alors effacées indéfiniment. Ici, chaque frame de mouvement repousse
   * l'échéance ; quand elle échoit, c'est que plus rien ne bouge, et la
   * question de savoir quel geste s'est terminé ne se pose plus.
   */
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

  /**
   * Recale le canvas sur la taille réelle de son conteneur.
   *
   * La carte est montée tout de suite, sous l'écran de chargement, pour que le
   * style et les tuiles partent au plus tôt. Mais à cet instant son conteneur
   * n'a pas encore sa taille : MapLibre retombe alors sur son canvas par défaut
   * de 400 × 300 et n'en bouge plus. Son suivi intégré n'écoute que le
   * redimensionnement de la *fenêtre* — un conteneur qui grandit tout seul lui
   * échappe.
   *
   * Conséquence : le moteur ne calculait les tuiles que pour une fenêtre de
   * 400 × 300. Tout le reste restait noir, et il fallait zoomer beaucoup pour
   * ramener une rue dans cette zone minuscule — d'où l'impression que les rues
   * s'affichaient en retard.
   */
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
        selected: selectedStop?.id === stop.id,
        endpoint: selectedRouteStopIds.has(stop.id),
        lineColor: (stop as Stop & { lineColor?: string }).lineColor || '',
      },
      geometry: { type: 'Point' as const, coordinates: [stop.lon, stop.lat] },
    })),
  }), [mapStopsVisible, selectedStop?.id, selectedRouteStopIds]);

  /** Retrouve un arrêt visible à partir de l'identifiant porté par la couche. */
  const findVisibleStop = useCallback(
    (stopId: string) => mapStops.find(stop => stop.id === stopId) ?? null,
    [mapStops],
  );

  /**
   * Points effectivement dessinés. En consultation d'une station, tout le reste
   * disparaît : on est venu voir ces véhicules-là, les autres pastilles ne
   * feraient que brouiller la lecture.
   */
  const visibleShared = useMemo<SharedMobilityData>(() => {
    if (!focusedShared) return sharedMobility;

    const points = explodeIntoVehiclePoints(focusedShared.points);

    return {
      citiz: focusedShared.operator === 'citiz' ? points : [],
      voi: focusedShared.operator === 'voi' ? points : [],
    };
  }, [sharedMobility, focusedShared]);

  /** Un point de mobilité partagée → une entité GeoJSON. */
  const toSharedCollection = useCallback((points: SharedVehiclePoint[]): GeoJSON.FeatureCollection => ({
    type: 'FeatureCollection',
    features: points.map(point => ({
      type: 'Feature' as const,
      properties: { pointId: point.id, count: point.vehicles.length },
      geometry: { type: 'Point' as const, coordinates: [point.lon, point.lat] },
    })),
  }), []);

  /**
   * Index par identifiant, pour retrouver les véhicules au clic.
   *
   * Un objet et non une `Map` : dans ce fichier, `Map` est le nom du composant
   * exporté, qui masque la classe native.
   */
  const sharedIndex = useMemo(() => {
    const index: Record<string, SharedVehiclePoint> = {};
    for (const point of visibleShared.citiz) index[`citiz:${point.id}`] = point;
    for (const point of visibleShared.voi) index[`voi:${point.id}`] = point;
    return index;
  }, [visibleShared]);

  const handleMapMouseMove = useCallback((event: any) => {
    const feature = event.features?.[0];
    const stopId = feature?.properties?.stopId as string | undefined;

    if (!stopId) {
      if (hoveredStopId !== null) resetStopHover();
      return;
    }
    if (stopId === hoveredStopId) return;
    startStopHoverTimer(stopId);
  }, [hoveredStopId, resetStopHover, startStopHoverTimer]);

  /**
   * Véhicules d'un opérateur situés à portée d'un point, en pixels écran.
   *
   * Sert de filet de sécurité partout où l'indexation par amas peut faire
   * défaut : c'est une lecture directe des données, sans intermédiaire.
   */
  const gatherAround = useCallback((
    operator: SharedOperator,
    center: [number, number],
    radiusPx: number = SHARED_CLUSTER_RADIUS,
  ): SharedVehiclePoint[] => {
    const map = mapRef.current?.getMap?.();
    if (!map) return [];
    const origin = map.project(center);
    const points = operator === 'citiz' ? visibleShared.citiz : visibleShared.voi;

    return points.filter(point => {
      const projected = map.project([point.lon, point.lat]);
      return Math.hypot(projected.x - origin.x, projected.y - origin.y) <= radiusPx;
    });
  }, [visibleShared]);

  /**
   * Rassemble les véhicules d'un point cliqué.
   *
   * MapLibre regroupe les points proches en amas ; `getClusterLeaves` rend les
   * points d'origine, qu'on retraduit en véhicules. Un point isolé est traité
   * comme un amas d'un seul élément, pour n'avoir qu'un chemin d'ouverture.
   */
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

  /**
   * Véhicule partagé le plus proche d'un point cliqué, dans un rayon de
   * `SHARED_TAP_RADIUS_PX` pixels. Le rayon est converti en degrés au zoom
   * courant : un même écart à l'écran ne représente pas la même distance selon
   * qu'on est au 1:100 000 ou au 1:2 000.
   */
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
    return best as Candidate | null;
  }, [visibleShared]);

  const zoomToSharedSelection = useCallback((points: SharedVehiclePoint[]) => {
    const map = mapRef.current?.getMap?.();
    if (!map || points.length === 0) return;

    const centerLon = points.reduce((sum, point) => sum + point.lon, 0) / points.length;
    const centerLat = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
    map.flyTo({
      center: [centerLon, centerLat],
      zoom: map.getMaxZoom(),
      duration: 700,
    });
  }, []);

  /**
   * Ouvre un point de mobilité partagée — ou refuse de l'ouvrir.
   *
   * Une station Citiz est un lieu : ses voitures sont réellement au même
   * endroit, une liste a du sens. Un amas Voi n'est qu'un artefact d'échelle :
   * les trottinettes sont éparpillées dans la rue, et en lister douze sous un
   * seul titre laisserait croire qu'on va toutes les trouver au même endroit.
   * On zoome donc jusqu'à ce que l'amas se défasse, et l'utilisateur choisit
   * sur la carte celle qui est vraiment devant lui.
   */
  const skipFocusedSharedZoomRef = useRef(false);

  const openSharedSelection = useCallback((
    operator: SharedOperator,
    points: SharedVehiclePoint[],
    focusPoint?: SharedVehiclePoint,
  ) => {
    if (points.length === 0) return;

    if (focusPoint) {
      skipFocusedSharedZoomRef.current = true;

      const map = mapRef.current?.getMap?.();
      if (map) {
        map.flyTo({
          center: [focusPoint.lon, focusPoint.lat],
          zoom: map.getMaxZoom(),
          duration: 700,
        });
      }
    } else {
      zoomToSharedSelection(points);
    }

    onSharedSelect?.({ operator, points });
  }, [onSharedSelect, zoomToSharedSelection]);

  const handleMapClick = useCallback((event: any) => {
    const features: any[] = event.features ?? [];
    const feature = features.find(f => /^(citiz|voi)/.test(f?.layer?.id ?? '')) ?? features[0];
    const layerId = feature?.layer?.id as string | undefined;

    if (layerId && (layerId.startsWith('citiz') || layerId.startsWith('voi'))) {
      const operator: SharedOperator = layerId.startsWith('citiz') ? 'citiz' : 'voi';
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

  /**
   * Cadre sur la station consultée : au plus près, toujours.
   *
   * Sauf quand le clic a déjà emmené la caméra sur un véhicule précis — dans ce
   * cas le drapeau est levé et on ne touche à rien, sinon la caméra repartait
   * du véhicule choisi vers le centre de la station.
   */
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

    map.flyTo({ center: [lon, lat], zoom: map.getMaxZoom(), duration: 900 });
  }, [focusedShared]);

  /**
   * Remonte la couche des arrêts au-dessus de tout le reste.
   *
   * Les tracés de lignes et d'itinéraires sont montés à la demande, donc *après*
   * la couche des arrêts : MapLibre les empile alors par-dessus, et le liseré
   * blanc de 12 px du tracé masque les pastilles — d'autant plus que les arrêts
   * filtrés sont justement aimantés sur la polyligne. Les marqueurs HTML
   * d'avant étaient au-dessus du canvas par nature ; il faut désormais le
   * rétablir explicitement à chaque changement de couches.
   */
  /*
   * Le tracé des liaisons de covoiturage, et où poser leur étiquette.
   *
   * Une étiquette par liaison, au milieu de son parcours — pas au centre de son
   * rectangle englobant, qui tombe souvent en pleine montagne pour une liaison
   * qui contourne un massif. Elle ne demande pas de zoomer : on ouvre un point
   * de covoiturage précisément pour savoir où mènent ses liaisons.
   */
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

  /**
   * Appui long : MapLibre en fait un `contextmenu`, qu'il émet aussi bien sur un
   * clic droit que sur un doigt maintenu. Le menu natif du navigateur est
   * écarté, il s'ouvrirait par-dessus la fiche.
   */
  const handleMapContextMenu = useCallback((event: MapLayerMouseEvent) => {
    if (!onLongPress) return;
    event.preventDefault?.();
    event.originalEvent?.preventDefault?.();
    const { lat, lng } = event.lngLat ?? {};
    if (Number.isFinite(lat) && Number.isFinite(lng)) onLongPress(lat, lng);
  }, [onLongPress]);

  /**
   * Doigt maintenu sur la carte.
   *
   * `contextmenu` suffirait sur Android, mais Safari ne l'émet pas sur un
   * canevas : on chronomètre donc le contact nous-mêmes. Tout mouvement annule
   * — c'est alors un déplacement de carte, pas une désignation de point.
   */
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
      onLongPress(lat, lng);
    }, LONG_PRESS_MS);
  }, [cancelLongPress, onLongPress]);

  useEffect(() => cancelLongPress, [cancelLongPress]);

  useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (!map) return;
    map.on('style.load', raiseStopsLayer);
    raiseStopsLayer();
    return () => {
      map.off('style.load', raiseStopsLayer);
    };
  }, [raiseStopsLayer, mapStyleUrl]);

  const citizCollection = useMemo(
    () => toSharedCollection(visibleShared.citiz),
    [visibleShared.citiz, toSharedCollection],
  );
  const voiCollection = useMemo(
    () => toSharedCollection(visibleShared.voi),
    [visibleShared.voi, toSharedCollection],
  );

  /**
   * Épingles des véhicules partagés.
   *
   * Elles reflètent le regroupement réel de MapLibre, et non les points bruts :
   * `querySourceFeatures` rend les amas tels qu'ils existent au zoom courant,
   * ce qui évite d'empiler trente épingles au même endroit. La liste est
   * recalculée à chaque déplacement, en même temps que le viewport.
   */
  const [sharedLabels, setSharedLabels] = useState<SharedPinData[]>([]);

  const refreshSharedLabels = useCallback(() => {
    const map = mapRef.current?.getMap?.();
    if (!map || (mapState.zoom < SHARED_LABEL_MIN_ZOOM && !focusedShared)) {
      setSharedLabels(current => (current.length === 0 ? current : []));
      return;
    }

    const pins: SharedPinData[] = [];
    const cap = focusedShared ? MAX_FOCUS_LABELS : MAX_SHARED_LABELS;
    for (const operator of ['citiz', 'voi'] as SharedOperator[]) {
      let taken = 0;
      if (!map.getSource(operator)) continue;
      const seen = new Set<string>();
      let features: Array<{ properties?: Record<string, unknown>; geometry?: { coordinates?: number[] } }> = [];
      try {
        const layerId = operator === 'citiz' ? CITIZ_LAYER_ID : VOI_LAYER_ID;
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

  /**
   * Arrêts qui méritent une étiquette DOM : ceux visibles au zoom rapproché,
   * plus celui survolé. C'est la seule liste qui produit encore des marqueurs
   * HTML, et elle reste courte par construction.
   */
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
        /*
         * La finesse du rendu suit la machine.
         *
         * MapLibre peint par défaut à la densité de l'écran, ce qui laisse une
         * carte crénelée sur un écran d'ordinateur ordinaire — un pixel par
         * point — alors que la machine derrière en peindrait quatre fois plus
         * sans y penser. On lui donne donc une consigne, calculée une fois au
         * chargement : voir `utils/deviceTier`.
         *
         * Posée ici plutôt que sur le composant : `pixelRatio` n'est pas dans
         * les propriétés que react-map-gl déclare, et une propriété inconnue
         * n'arriverait pas jusqu'au constructeur.
         */
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
        onMoveEnd={updateViewport}
        onZoomEnd={updateViewport}
        interactiveLayerIds={[STOPS_LAYER_ID]}
        cursor={hoveredStopId ? 'pointer' : undefined}
        onMouseMove={handleMapMouseMove}
        onMouseLeave={resetStopHover}
        onClick={handleMapClick}
        onContextMenu={handleMapContextMenu}
        onTouchStart={handleTouchStart}
        onTouchMove={cancelLongPress}
        onTouchEnd={cancelLongPress}
        onTouchCancel={cancelLongPress}
      >
        {/* ─── Arrêts (couche GPU) ───────────────────────────────────────
            Déclarée en premier : c'est la seule source jamais démontée, donc
            la seule sur laquelle les couches suivantes peuvent s'appuyer via
            `beforeId` pour se placer dessous. Les arrêts restent ainsi
            toujours au-dessus des tracés, comme du temps des marqueurs HTML. */}
        <Source id="stops" type="geojson" data={stopsFeatureCollection}>
          <Layer
            id={STOPS_LAYER_ID}
            type="circle"
            beforeId={ROAD_LABELS_LAYER_ID}
            paint={{
              'circle-radius': [
                'interpolate', ['linear'], ['zoom'],
                10, ['case', ['get', 'selected'], 9, 6],
                13, ['case', ['get', 'selected'], 11, 7],
                16, ['case', ['get', 'selected'], 12, 8],
              ] as any,
              /* Un arrêt posé sur un tracé se dessine comme les pastilles d'un
                 itinéraire : le disque reste clair, c'est l'anneau qui porte la
                 couleur de la ligne. Un disque plein l'aurait fait disparaître
                 dans le trait qu'il chevauche ; l'anneau, lui, se détache.
                 Le jaune commun ne vaut plus que pour les arrêts qui ne sont
                 sur aucun tracé affiché. */
              'circle-color': [
                'case',
                ['get', 'endpoint'], '#ffffff',
                ['get', 'selected'], '#6B7280',
                ['!=', ['get', 'lineColor'], ''], isDarkMode ? '#0f172a' : '#ffffff',
                '#facc15',
              ] as any,
              'circle-stroke-color': [
                'case',
                ['get', 'endpoint'], '#111827',
                ['!=', ['get', 'lineColor'], ''], ['get', 'lineColor'],
                '#ffffff',
              ] as any,
              'circle-stroke-width': [
                'case',
                ['get', 'selected'], 3,
                ['!=', ['get', 'lineColor'], ''], 3,
                2,
              ] as any,
            }}
          />
        </Source>

        {/* ─── Liaisons de covoiturage ─────────────────────────────────── */}
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

        {/* L'étiquette de chaque liaison, au milieu de son tracé. */}
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
              Ligne {line.shortName}
            </div>
          </Marker>
        ))}

        {/* ─── Line shapes ─────────────────────────────────────────────────
            Two layers per line: a white "casing" underneath for legibility,
            and the coloured line on top. The id 'line-shapes' is unique so
            re-renders replace the source cleanly. */}
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
            {/* Walking segments - dashed gray */}
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
            {/* Transit lines - solid with line color */}
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

        {/* ─── Pastilles de l'itinéraire ───────────────────────────────────
            Posées *au-dessus* des arrêts : elles tombent exactement sur les
            mêmes clusters, elles doivent donc les recouvrir. Seuls les points
            où l'on agit (monter, descendre, changer, terminus) sont marqués —
            les arrêts simplement desservis ne le sont plus, ils noyaient le
            tracé sur les longs tronçons. */}
        {routeStops && routeStops.features.length > 0 && (
          <Source id="route-stops" type="geojson" data={routeStops}>
            <Layer
              id="route-stops-transfer"
              type="circle"
              filter={['==', ['get', 'kind'], 'transfer']}
              paint={{
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 4, 14, 6, 17, 8] as any,
                'circle-color': isDarkMode ? '#0f172a' : '#ffffff',
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

        {/* Badge de la ligne empruntée, au milieu de chaque tronçon. */}
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
              title={`Départ: ${routeStart.label}`}
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
              title={`Arrivée: ${routeEnd.label}`}
            />
          </Marker>
        )}

        {/* ─── Mobilités partagées (couches GPU) ─────────────────────────
            Placées sous les arrêts via `beforeId` : le réseau structurant
            reste prioritaire à la lecture. */}
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

        {/* Épingles d'opérateur : elles remplacent les pastilles une fois la
            carte suffisamment zoomée, sur le même principe que les noms
            d'arrêts. L'icône dit le type de véhicule, la pastille verte qu'au
            moins un véhicule est chargé à bloc. */}
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

        {/* ─── Étiquettes de nom (DOM) ───────────────────────────────────
            Seules les étiquettes réellement affichées existent dans le DOM :
            au zoom rapproché, ou celle de l'arrêt survolé. */}
        {labelledStops.map(stop => {
          const accessible = isStopAccessible(accessibleStops, stop);
          return (
          <Marker key={`label-${stop.id}`} longitude={stop.lon} latitude={stop.lat} anchor="bottom">
            {/* En mode accessibilité, le fauteuil quitte le nom pour devenir une
                pastille posée au-dessus : on la repère sans lire. Elle s'efface
                pendant le geste — large comme elle est, elle masquerait les
                arrêts voisins qu'on fait défiler. */}
            {accessibilityMode && accessible && (
              <div
                className="mx-auto mb-1 flex items-center justify-center rounded-xl border-2"
                style={{
                  width: 34,
                  height: 34,
                  borderColor: '#22c55e',
                  backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.94)' : 'rgba(255, 255, 255, 0.96)',
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
                marginBottom: '10px',
                whiteSpace: 'nowrap',
                fontSize: '11px',
                fontWeight: 600,
                color: isDarkMode ? '#f8fafc' : '#0f172a',
                backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.92)',
                padding: '2px 6px',
                borderRadius: '6px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.15)',
                pointerEvents: 'none',
                letterSpacing: '0.01em',
              }}
            >
              {/* Le nom n'est jamais tronqué : c'est la seule information
                  qui identifie l'arrêt. Ce sont les badges de lignes qui
                  cèdent la place (3 maximum, puis un +N). */}
              <span className="inline-flex items-center gap-1.5">
                <span>
                  {stop.name}
                  {/* Le fauteuil finit le nom, comme dans le panneau de
                      l'arrêt : c'est la même information, elle se lit au même
                      endroit. */}
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

        {/* ─── Address marker (from geocoder) ───────────────────────────── */}
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

        {/* ─── User's current location ────────────────────────────────── */}
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

/**
 * Épingle d'un point de mobilité partagée.
 *
 * Goutte à la couleur de l'opérateur, icône du type de véhicule dominant, et
 * compteur quand le point en regroupe plusieurs. La pastille verte signale
 * qu'au moins un véhicule est chargé à bloc : c'est l'information qui décide
 * d'aller le chercher ou non.
 */
/**
 * Épingle d'un véhicule ou d'un amas.
 *
 * Mémoïsée : MapLibre repositionne chaque marqueur à chaque image, et sans
 * cette barrière React reconstruisait aussi son contenu — icône, ombre,
 * pastille de batterie — pour un résultat identique.
 */
const SharedPin = memo(function SharedPin({ pin, highlighted = false }: { pin: SharedPinData; highlighted?: boolean }) {
  const color = pin.operator === 'citiz' ? CITIZ_COLOR : VOI_COLOR;
  const formFactor = pin.point
    ? dominantFormFactor(pin.point)
    : (pin.operator === 'citiz' ? 'car' : 'scooter');
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
      {/* Goutte : un carré aux angles arrondis sauf un, pivoté de 45°. */}
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
        {/* Contre-rotation pour que l'icône reste droite. */}
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
