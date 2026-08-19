import { useRef, forwardRef, useImperativeHandle, useCallback, useState, useMemo, useEffect, memo } from 'react';
import type { ForwardedRef } from 'react';
import MapLibreMap, { Marker, Source, Layer } from 'react-map-gl/maplibre';
import type { Line, Stop } from '../types';
import type { MapRef as MapLibreRef, MapLayerMouseEvent, MapLayerTouchEvent } from 'react-map-gl/maplibre';
import type { AddressResult } from '../services/geocoding';
import type { LineGeometry, ServedStopPoint } from '../services/lineShapes';
import { stopIsNearAny, snapStopToLines } from '../services/lineShapes';
import { getCachedStopLines, getStopLines } from '../services/api';
import { resolveLineBackgroundColor } from '../utils/lineColors';
import type { JourneyBadge } from '../utils/journeyGeometry';
import { LineBadge } from './LineBadge';
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
    // La longitude se resserre avec la latitude : sans ce facteur, la couronne
    // serait un ovale écrasé.
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
  // Toutes de la même taille, et volontairement minuscules : ce sont des
  // véhicules de complément, ils ne doivent pas concurrencer les arrêts.
  'circle-radius': 2.5,
  'circle-color': color,
  'circle-stroke-color': '#ffffff',
  'circle-stroke-width': 1,
  // Les pastilles s'effacent là où les épingles prennent le relais. On les
  // rend transparentes plutôt que de borner la couche : sans couche visible,
  // MapLibre cesserait de charger les tuiles de la source, et les épingles —
  // qui lisent les amas depuis cette source — n'auraient plus rien à afficher.
  // Bascule franche : la pastille s'éteint exactement au zoom où l'épingle
  // prend le relais. Un fondu laissait un intervalle sans rien à l'écran.
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
  // Une seule tentative par identifiant. Sans ce registre, chaque tuile
  // contenant l'écusson relançait l'ajout, et MapLibre journalisait un refus à
  // chaque fois — des centaines par seconde pendant un déplacement.
  if (attemptedMissingImages.has(id)) return;
  attemptedMissingImages.add(id);
  try {
    map.addImage(id, createPlaceholderSprite(), { pixelRatio: 1 });
  } catch {
    // Le style déclare cette icône avec une taille nulle : on ne peut pas la
    // combler. L'écusson ne se dessinera pas, et on n'en reparle plus.
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
      // Try to read a color from the feature's existing properties. MTAG
      // sometimes exposes `couleur` (with #) or `color`. If the source colour
      // is missing or is the generic grey fallback, resolve special rules
      // (chrono / specific bus lines) via `resolveLineBackgroundColor`.
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

      // Use the raw GTFS geometry directly — no spline smoothing.
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
  { stops, selectedStop, currentLocation, onStopClick, selectedAddress, alwaysLabelledStopIds = null, routeStart, routeEnd, routeLine, routeStops = null, routeLineBadges = null, lineGeometries = [], visibleStopPoints, onCenterChange, pickMode, onMapClick, onLongPress, isDarkMode = false, sharedMobility = EMPTY_SHARED_MOBILITY, onSharedSelect, focusedShared = null, highlightedVehicleId = null }: MapProps,
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
        // L'arrêt consulté garde sa position — on ne déplace pas ce qu'on est
        // en train de regarder — mais il prend quand même la couleur de sa
        // ligne : il est sur le tracé comme les autres.
        if (stop.id === selectedStop?.id) return { ...stop, lineColor: snapped.color };
        return { ...stop, lat: snapped.lat, lon: snapped.lon, lineColor: snapped.color };
      });
    }

    // Plafond de marqueurs (option d'optimisation). L'arrêt sélectionné n'est
    // jamais coupé, sinon il disparaîtrait au moment où on le consulte.
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

  // Les tracés de lignes peuvent être coupés depuis la section Développeur :
  // c'est la couche la plus lourde à redessiner pendant un déplacement.
  const hasLines = perf.lineShapes && !focusedShared && linesFeatureCollection.features.length > 0;

  /** Show stop name labels when zoomed in enough to read them comfortably, or
   * after a short hover delay when the user is still zoomed out. */
  const showStopLabels = perf.stopLabels && mapState.zoom >= 15;

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
    // Badges désactivés : on ne précharge pas les lignes des arrêts visibles,
    // ce qui supprime jusqu'à 35 requêtes à chaque déplacement de la carte.
    if (!perf.stopLineBadges) return;

    const idsToInspect = visibleStops.slice(0, 35).map(stop => stop.id);
    if (idsToInspect.length === 0) return;

    // Fill immediately from the persistent cache to avoid a blank state while
    // the network queue warms up.
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
    // Trois badges au maximum : au-delà, l'étiquette devient plus large que
    // l'arrêt qu'elle désigne et cache ses voisins.
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
    // Le centre part au parent : c'est lui qui sait quoi en faire — pour
    // l'instant, y chercher la commune dont on affichera la qualité de l'air.
    const center = mapRef.current.getCenter();
    onCenterChangeRef.current?.(center.lat, center.lng);
  }, []);

  const handleMapMove = useCallback(throttle(updateViewport, 300), [updateViewport]);

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

    // On observe notre propre conteneur, présent dès le premier rendu, et non
    // celui de MapLibre : au moment où cet effet s'exécute, react-map-gl n'a
    // pas encore créé la carte. La carte, elle, est cherchée à chaque
    // notification — elle finira par exister.
    let frame = 0;
    let lastWidth = 0;
    let lastHeight = 0;

    const observer = new ResizeObserver(() => {
      const width = wrapper.clientWidth;
      const height = wrapper.clientHeight;
      // Un conteneur de taille nulle (écran de chargement, onglet masqué) ne
      // décrit aucune fenêtre de carte : redimensionner dessus ferait jeter à
      // MapLibre les tuiles qu'il est en train de charger.
      if (width === 0 || height === 0) return;
      if (width === lastWidth && height === lastHeight) return;
      lastWidth = width;
      lastHeight = height;

      // Une seule mise à jour par image : un observateur peut se déclencher
      // plusieurs fois pendant une même transition de mise en page.
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
  }));

  const handleMarkerClick = useCallback((stop: Stop) => {
    onStopClick(stop);
  }, [onStopClick]);

  // ─── Arrêts : une couche GPU au lieu de centaines de marqueurs DOM ────────
  //
  // MapLibre repositionne chaque marqueur HTML à *chaque image* pendant un zoom
  // ou un déplacement. Avec ~750 arrêts dans le viewport, cela fait 750 calculs
  // de projection + 750 écritures de `transform` par image : c'est ce qui
  // faisait tomber la carte à 1 image/seconde au zoom.
  //
  // Une couche `circle` dessine les mêmes 750 arrêts en un seul appel GPU, avec
  // un coût constant quel que soit leur nombre. Le DOM ne sert plus que pour les
  // étiquettes (peu nombreuses, et seulement quand elles sont visibles).
  const stopsFeatureCollection = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: mapStopsVisible.map(stop => ({
      type: 'Feature' as const,
      id: undefined,
      properties: {
        stopId: stop.id,
        selected: selectedStop?.id === stop.id,
        endpoint: selectedRouteStopIds.has(stop.id),
        // Couleur du tracé sur lequel l'arrêt a été calé — la même que celle du
        // trait, puisqu'elle en vient. Vide si l'arrêt n'est sur aucun tracé
        // affiché ; la couche `circle` ne lit que des propriétés.
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

    // Consulter une station, c'est demander à voir où chaque véhicule est
    // garé : le point se démultiplie dès l'ouverture, une pastille par
    // véhicule. Sélectionner une ligne dans la fiche ne fait plus que désigner
    // sa pastille parmi les autres.
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

      // `getClusterLeaves` dépend de l'état interne de supercluster ; s'il ne
      // rend rien (tuile pas encore indexée, amas recomposé entre-temps), on
      // rassemble nous-mêmes les véhicules autour du point cliqué. Mieux vaut
      // une fiche approchée qu'un clic sans effet.
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
    // Annotation explicite : l'affectation a lieu dans une fonction imbriquée,
    // que l'inférence de flux ne suit pas.
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
    // Les couches de mobilité passent devant : leur cible est plus petite, si
    // l'utilisateur l'a touchée c'est qu'il la visait.
    const features: any[] = event.features ?? [];
    const feature = features.find(f => /^(citiz|voi)/.test(f?.layer?.id ?? '')) ?? features[0];
    const layerId = feature?.layer?.id as string | undefined;

    // Mobilités partagées : amas ou véhicule isolé, on ouvre la fiche.
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

    // react-map-gl/maplibre expose lngLat comme tableau ou comme objet.
    let lngLat: [number, number] | null = null;
    try {
      const raw = event.lngLat;
      const parsed = Array.isArray(raw) ? raw : raw?.toArray?.() ?? null;
      if (parsed) lngLat = [parsed[0], parsed[1]];
    } catch {
      // Coordonnées illisibles : on ignore le clic plutôt que de planter.
    }
    if (!lngLat) return;

    // Repêchage par proximité.
    //
    // Les pastilles de mobilité partagée ne font que quelques pixels, et
    // l'interrogation des couches dépend de subtilités de rendu. Plutôt que
    // d'en dépendre, on cherche nous-mêmes le véhicule le plus proche du point
    // touché, dans un rayon exprimé à l'écran.
    const nearby = findNearestSharedPoint(lngLat);
    if (nearby) {
      // On ouvre tout le tas, pas seulement le véhicule le plus proche : un
      // doigt posé sur un groupe désigne le groupe.
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

    // On vient chercher *ce* véhicule : la caméra descend au zoom maximal que
    // le style accepte, sur le barycentre des pastilles. Le cadrage précédent
    // calculait le zoom qui fait tenir la couronne d'éclatement (une douzaine
    // de mètres) avec du rembourrage : il retombait toujours un cran sous le
    // maximum, et l'on voyait la carte reculer juste après s'être approchée.
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
  const raiseStopsLayer = useCallback(() => {
    const map = mapRef.current?.getMap?.();
    if (!map || typeof map.getLayer !== 'function') return;
    if (!map.getLayer(STOPS_LAYER_ID)) return;

    // Garde d'idempotence : `moveLayer` invalide le style et force un repaint.
    // On ne l'appelle que si l'ordre est réellement à corriger — sans cela, un
    // appel à chaque événement de style déclenchait un repaint en boucle, ce
    // qui coûtait une bonne partie des images par seconde et retardait
    // l'affichage des tuiles.
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
    // Deux doigts : c'est un zoom qui commence.
    if (!onLongPress || (event.points?.length ?? 1) > 1) return;

    const { lat, lng } = event.lngLat ?? {};
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      // Une vibration brève confirme que le point est pris, sans avoir à
      // regarder l'écran remonter la fiche.
      navigator.vibrate?.(15);
      onLongPress(lat, lng);
    }, LONG_PRESS_MS);
  }, [cancelLongPress, onLongPress]);

  useEffect(() => cancelLongPress, [cancelLongPress]);

  useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (!map) return;
    // `beforeId` place déjà les tracés sous les arrêts à l'insertion. Il ne
    // reste qu'un cas à rattraper : le rechargement complet du style lors de la
    // bascule clair/sombre, qui n'arrive qu'à la demande de l'utilisateur.
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
    // En consultation d'une station, les épingles s'affichent quel que soit le
    // zoom : c'est tout l'objet de la vue.
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
        // `queryRenderedFeatures` se limite à ce qui est effectivement à
        // l'écran. `querySourceFeatures` parcourait toutes les tuiles chargées,
        // y compris celles qu'on vient de quitter : à mille huit cents
        // trottinettes, ce balayage tombait au milieu du geste de zoom et
        // retardait l'affichage des rues.
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
        // Une même entité apparaît dans plusieurs tuiles chargées.
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
    // Recalcul différé plutôt qu'à chaque image : pendant un zoom, la liste
    // des épingles change à chaque palier et personne ne la lit avant l'arrêt
    // du geste. Ce délai rend la main au moteur pour dessiner les rues.
    const timer = setTimeout(refreshSharedLabels, 180);
    return () => clearTimeout(timer);
  }, [refreshSharedLabels, mapState.bounds, visibleShared]);

  /**
   * Arrêts qui méritent une étiquette DOM : ceux visibles au zoom rapproché,
   * plus celui survolé. C'est la seule liste qui produit encore des marqueurs
   * HTML, et elle reste courte par construction.
   */
  const labelledStops = useMemo(() => {
    // Consulter une station met tout le reste en retrait : les pastilles des
    // arrêts sont déjà retirées, leurs étiquettes doivent suivre — sinon il
    // reste des noms flottants au-dessus de rien.
    if (focusedShared) return [];

    // Les arrêts proposés par la fiche adresse sont nommés en toutes lettres,
    // même de loin : c'est la liste qu'on est en train de lire à côté.
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
        initialViewState={{
          longitude: GRENOBLE_CENTER[1],
          latitude: GRENOBLE_CENTER[0],
          zoom: 12.1,
        }}
        style={{ width: '100%', height: '100%' }}
        // Les tuiles apparaissent net, sans fondu de 300 ms. Sur un réseau
        // lent, ce fondu s'ajoutait à l'attente et donnait l'impression que la
        // carte se chargeait deux fois.
        fadeDuration={0}
        // Une tuile vectorielle décrit un état du monde, pas un horaire : la
        // redemander parce qu'un en-tête a expiré ne change rien à l'image.
        refreshExpiredTiles={false}
        // Plus de tuiles gardées en mémoire : revenir sur ses pas redessine
        // sans repasser par le réseau.
        maxTileCacheSize={400}
        // `styledata` se déclenche à chaque modification du style — chargement,
        // ajout de source, ajout de couche. On s'y abonnait à chaque fois, si
        // bien qu'une même image manquante finissait traitée par des dizaines
        // d'écouteurs empilés. Un seul abonnement, posé au premier passage.
        onStyleData={(evt: any) => {
          const map = evt.target;
          if (!map) return;
          // `styledata` se déclenche aussi à l'ajout de la couche des arrêts :
          // c'est le signal que les couches secondaires peuvent s'y référer.
          setStopsLayerReady(Boolean(map.getLayer?.(STOPS_LAYER_ID)));
          if (styleImageHookRef.current) return;
          styleImageHookRef.current = true;
          map.on('styleimagemissing', (event: any) => handleStyleImageMissing(map, event));
        }}
        onMove={handleMapMove}
        // Le suivi throttlé sert pendant le geste ; à son terme on prend la
        // valeur exacte, pour que les épingles apparaissent sans retard.
        onMoveEnd={updateViewport}
        onZoomEnd={updateViewport}
        // La couche des arrêts est interactive : clic et survol sont résolus
        // par MapLibre, plus par des gestionnaires attachés à chaque marqueur.
        // Seuls les arrêts sont interrogés au survol et au clic.
        //
        // Cette liste sert aussi à `onMouseMove` : y laisser les couches de
        // mobilité faisait tester, à chaque déplacement du curseur, près de
        // deux mille pastilles réparties sur cinq couches. C'est le test le
        // plus cher de la carte, et il tournait soixante fois par seconde.
        //
        // Les véhicules partagés restent cliquables : `handleMapClick` retombe
        // sur une recherche de proximité dans les données, qui parcourt une
        // liste déjà en mémoire au lieu d'interroger le moteur de rendu.
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
            paint={{
              // Mêmes tailles qu'avec les anciennes pastilles HTML (16 px de
              // diamètre, 24 px pour l'arrêt sélectionné), avec une légère
              // progression au zoom.
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
            // En consultation, on vient précisément de démultiplier les
            // pastilles : les regrouper à nouveau annulerait le geste.
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
              // Un amas rend ses membres, un point isolé se suffit à lui-même.
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
        {labelledStops.map(stop => (
          <Marker key={`label-${stop.id}`} longitude={stop.lon} latitude={stop.lat} anchor="bottom">
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
                <span>{stop.name}</span>
                {renderStopLineBadges(stop.id)}
              </span>
            </div>
          </Marker>
        ))}

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
  // Un amas n'expose pas le détail de ses membres : on retient l'icône de
  // l'opérateur, la voiture pour Citiz et la trottinette pour Voi.
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
        // Grossie, l'épingle déborde sur ses voisines : elle doit passer devant.
        zIndex: highlighted ? 10 : 1,
      }}
      // L'épingle naît de la pastille : elle part ronde et plate, puis s'étire
      // en goutte. C'est la même forme qui grandit, pas une seconde forme qui
      // apparaît par-dessus.
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
