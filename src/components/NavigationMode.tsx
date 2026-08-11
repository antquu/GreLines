import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import MapLibreMap, { Marker, Source, Layer } from 'react-map-gl/maplibre';
import type { MapRef } from 'react-map-gl/maplibre';
import {
  XMarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowPathIcon,
  FlagIcon,
} from '@heroicons/react/24/solid';
import { FaWalking } from 'react-icons/fa';
import { TransportModeIcon } from './TransportModeIcon';
import type { RouteItinerary } from '../services/api';
import type { AllLinesLine } from '../services/allLines';
import { resolveRouteLine } from '../utils/routeLineResolver';






const DARK_MAP_STYLE_URL =
  'https://api.maptiler.com/maps/019f7c76-a3f8-751b-bedb-d7fe9d83d122/style.json?key=7TQErbyvEqFlis3QMmSl';
const LIGHT_MAP_STYLE_URL =
  'https://api.maptiler.com/maps/019f7c73-0431-726f-ae5d-598a16a06771/style.json?key=7TQErbyvEqFlis3QMmSl';

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
  
  onBoardVehicle?: (info: { lineShortName: string; boardingStop: string | null }) => void;
  
  onArrived?: () => void;
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







const PANEL_BG = '#0f172a';
const WALK_COLOR = '#94a3b8';
const ARRIVAL_COLOR = '#22c55e';


const FOLLOW_ZOOM = 17.5;
const FOLLOW_PITCH = 55;

const FOLLOW_LOOK_AHEAD_METERS = 30;

/** Délai sans geste au bout duquel la carte se recentre d'elle-même. */
const FOLLOW_RESUME_MS = 8000;

const METRES_PER_DEG_LAT = 111320;
const METRES_PER_DEG_LON_AT_45 = 78710;







/**
 * Projette une position sur le tracé de l'étape.
 *
 * Le GPS d'un téléphone dérive de dix à vingt mètres en ville, et sur un tram
 * il dérive *à côté des rails*. Comme on sait par où passe le véhicule, on
 * ramène le point sur le tracé : la pastille suit la ligne au lieu de flotter
 * dans les immeubles. Au-delà de `maxSnapMeters`, on renonce — l'usager n'est
 * probablement pas encore sur l'itinéraire.
 */
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

    // Position du pied de la perpendiculaire, bornée au segment.
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

/**
 * Position lissée entre deux relevés GPS.
 *
 * Le navigateur ne rend une position que toutes les quelques secondes : la
 * pastille sautait d'un bond à chaque relevé. On interpole entre l'ancienne et
 * la nouvelle sur `SMOOTHING_MS`, ce qui donne un déplacement continu — et
 * comme la caméra suit cette valeur lissée, elle glisse au lieu de tressauter.
 * Un saut de plus de 300 m (reprise du signal, tunnel) est appliqué d'un coup :
 * l'interpoler ferait traverser la ville à la pastille.
 */
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
      // Décélération douce : la pastille arrive sans à-coup sur le relevé.
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


function stepEyebrow(step: NavStep, isFr: boolean): string {
  switch (step.kind) {
    case 'walk':    return isFr ? 'À pied' : 'Walk';
    case 'arrival': return isFr ? 'Arrivée' : 'Arrival';
    default:        return isFr ? 'Montez à bord' : 'Board';
  }
}


function isRoundLine(label: string): boolean {
  const n = label.toUpperCase().trim();
  if (n === 'A' || n === 'B' || n === 'C' || n === 'D' || n === 'E') return true;
  return /^C\d+$/.test(n);
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
  lineLookup?: Map<string, AllLinesLine> | null
): NavStep[] {
  const legs = itinerary.allLegs || [];
  




  const cleanPlace = (value: unknown): string | undefined => {
    const name = typeof value === 'string' ? value.trim() : '';
    if (!name || name === 'Origin' || name === 'Destination') return undefined;
    return name;
  };

  const steps: NavStep[] = legs.map((leg: any) => {
    const durationMin = Math.max(1, Math.round((leg.duration ?? 0) / 60));
    const path = leg?.legGeometry?.points ? decodePolyline(leg.legGeometry.points) : [];

    if (leg.mode === 'WALK') {
      return {
        kind: 'walk',
        
        
        instruction: cleanPlace(leg.to?.name)
          ? `${isFr ? 'Rejoignez' : 'Walk to'} ${cleanPlace(leg.to?.name)}`
          : (isFr ? 'À pied' : 'Walk'),
        detail: cleanPlace(leg.to?.name) ? `${isFr ? 'jusqu’à' : 'to'} ${cleanPlace(leg.to?.name)}` : '',
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
      instruction: isFr ? `Prenez ${shortName}` : `Take ${shortName}`,
      detail: leg.to?.name ? `${isFr ? 'descendez à' : 'get off at'} ${leg.to.name}` : '',
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
    instruction: isFr ? 'Vous êtes arrivé' : 'You have arrived',
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

/**
 * Mode guidage : carte en haut avec le tracé de l'étape en cours, panneau bas
 * dans le style GreLines (bandeau bleu marine, cartes de ligne colorées,
 * timeline en pointillés) — repris directement du design fourni.
 */
export function NavigationMode({
  itinerary,
  isOpen,
  onClose,
  language,
  stops,
  lineLookup,
  currentLocation,
  onBoardVehicle,
  onArrived,
  isMobile = false,
  theme = 'dark',
}: NavigationModeProps) {
  const isFr = language === 'fr';
  const mapRef = useRef<MapRef>(null);
  const steps = useMemo(
    () => buildSteps(itinerary, isFr, stops, lineLookup),
    [itinerary, isFr, stops, lineLookup]
  );
  const [index, setIndex] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  /**
   * Suivi de position. Actif par défaut : une fois le trajet lancé, la carte
   * reste centrée sur l'usager et tournée dans le sens de la marche. Dès qu'il
   * déplace la carte lui-même, le suivi s'interrompt — c'est lui qui regarde —
   * et un bouton le rétablit.
   */
  const [isFollowing, setIsFollowing] = useState(true);
  const boardedTransitKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setIndex(0);
      setHasStarted(false);
      boardedTransitKeyRef.current = null;
    }
  }, [isOpen, itinerary]);

  const step = steps[Math.min(index, steps.length - 1)];

  /**
   * Position affichée : relevé GPS ramené sur le tracé de l'étape, puis lissé.
   * C'est elle que suivent la pastille *et* la caméra, pour qu'elles ne se
   * contredisent jamais.
   */
  const snappedLocation = useMemo<[number, number] | null>(() => {
    if (!currentLocation) return null;
    const here: [number, number] = [currentLocation.lon, currentLocation.lat];
    return snapToPath(step?.path ?? [], here) ?? here;
  }, [currentLocation?.lat, currentLocation?.lon, step]);

  const smoothedLocation = useSmoothedPosition(snappedLocation);

  /**
   * Reprise automatique du suivi.
   *
   * Interrompre le recentrage dès qu'on touche la carte est nécessaire — on
   * regarde parfois la suite du trajet. Mais l'oublier ainsi condamnait
   * l'usager à retrouver le bouton « Recentrer » : passé quelques secondes sans
   * geste, la carte revient d'elle-même sur lui.
   */
  useEffect(() => {
    if (!isOpen || !hasStarted || isFollowing) return;
    const timer = window.setTimeout(() => setIsFollowing(true), FOLLOW_RESUME_MS);
    return () => window.clearTimeout(timer);
  }, [isOpen, hasStarted, isFollowing]);

  useEffect(() => {
    if (!isOpen || !step) return;
    // En suivi, c'est la position qui commande la caméra : recadrer sur l'étape
    // arracherait la vue à l'usager en pleine marche.
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

  /**
   * Recentre et oriente la carte à chaque nouvelle position.
   *
   * Le cap est pris vers le point du tracé situé une trentaine de mètres plus
   * loin : viser le point suivant immédiat ferait vibrer la boussole à chaque
   * relevé GPS. Le décalage vers le bas place l'usager au tiers inférieur de
   * l'écran, avec la suite du chemin devant lui.
   */
  useEffect(() => {
    if (!isOpen || !hasStarted || !isFollowing || !smoothedLocation) return;
    const map = mapRef.current;
    if (!map) return;

    const here = smoothedLocation;
    const lookAhead = pointAheadOnPath(step.path, here, FOLLOW_LOOK_AHEAD_METERS);

    // `easeTo` sans durée : la caméra colle à la position déjà lissée image par
    // image. Une animation de 800 ms par-dessus le lissage se serait battue
    // avec lui, et la carte accusait un retard visible sur la pastille.
    map.easeTo({
      center: here,
      bearing: lookAhead ? bearingBetween(here, lookAhead) : map.getBearing(),
      zoom: FOLLOW_ZOOM,
      pitch: FOLLOW_PITCH,
      padding: { top: 0, right: 0, bottom: Math.round(window.innerHeight * 0.35), left: 0 },
      duration: 0,
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

  if (!isOpen || steps.length === 0) return null;

  const isLast = index >= steps.length - 1;

  const fullPath: Array<[number, number]> = itinerary.routePath?.length
    ? itinerary.routePath
    : steps.flatMap((item) => item.path);
  const routeGeoJSON = {
    type: 'FeatureCollection' as const,
    features: [{ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: fullPath } }],
  };
  const stepGeoJSON = {
    type: 'FeatureCollection' as const,
    features: [{ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: step.path } }],
  };

  const handleNext = () => {
    if (!hasStarted) {
      setHasStarted(true);
      return;
    }
    if (isLast) {
      onArrived?.();
      onClose();
      return;
    }
    setIndex((i) => Math.min(i + 1, steps.length - 1));
  };

  const arriveLabel = itinerary.arr;
  // Progression : étapes franchies, plus l'étape courante entamée dès le départ.
  const progressPercent = steps.length <= 1
    ? (hasStarted ? 100 : 0)
    : Math.round(((index + (hasStarted ? 1 : 0)) / steps.length) * 100);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[10001] overflow-hidden bg-[#0a1420]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Carte */}
        <div className="absolute inset-0">
          <MapLibreMap
            ref={mapRef}
            initialViewState={{ longitude: fullPath[0]?.[0] ?? 5.74892, latitude: fullPath[0]?.[1] ?? 45.18501, zoom: 15 }}
            mapStyle={theme === 'dark' ? DARK_MAP_STYLE_URL : LIGHT_MAP_STYLE_URL}
            style={{ width: '100%', height: '100%' }}
            attributionControl={false}
            onDragStart={() => setIsFollowing(false)}
            onRotateStart={() => setIsFollowing(false)}
            onZoomStart={(event: { originalEvent?: unknown }) => {
              // Seul un zoom déclenché à la main coupe le suivi : ceux que la
              // caméra s'inflige elle-même ne comptent pas.
              if (event?.originalEvent) setIsFollowing(false);
            }}
          >
            {fullPath.length > 0 && (
              <Source id="nav-full-route" type="geojson" data={routeGeoJSON}>
                <Layer
                  id="nav-full-route-layer"
                  type="line"
                  paint={{ 'line-color': '#c7cdd8', 'line-width': 6, 'line-opacity': 0.55, 'line-dasharray': [0.08, 1.2] }}
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                />
              </Source>
            )}

            {step.path.length > 0 && (
              <Source id="nav-step-route" type="geojson" data={stepGeoJSON}>
                {/* Liseré blanc puis couleur de la ligne : exactement le tracé
                    des lignes sur la carte principale. Le halo pulsé d'avant
                    tournait à 60 images par seconde pour un effet décoratif. */}
                <Layer
                  id="nav-step-route-casing"
                  type="line"
                  paint={{ 'line-color': '#ffffff', 'line-width': step.kind === 'walk' ? 12 : 18, 'line-opacity': 0.55 }}
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                />
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
                {/* À bord, la pastille prend le visage du véhicule : on ne
                    marche plus, on est *dans* le tram — et la couleur de la
                    ligne dit lequel. */}
                {step.kind === 'transit' ? (
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-full border-[3px] border-white shadow-[0_6px_18px_rgba(0,0,0,0.4)]"
                    style={{ backgroundColor: stepColor(step) }}
                  >
                    <TransportModeIcon mode={step.mode ?? 'BUS'} className="h-5 w-5 text-white" />
                  </div>
                ) : (
                  <div className="relative flex items-center justify-center">
                    <span className="absolute h-8 w-8 animate-ping rounded-full bg-blue-500/40" />
                    <span className="relative h-4 w-4 rounded-full border-2 border-white bg-blue-500 shadow-lg" />
                  </div>
                )}
              </Marker>
            )}
          </MapLibreMap>
        </div>

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-transparent" />

        {/* Reprise du suivi, proposée seulement quand il est interrompu. */}
        {hasStarted && !isFollowing && currentLocation && (
          <button
            onClick={() => setIsFollowing(true)}
            className="pointer-events-auto absolute left-1/2 top-[max(1rem,env(safe-area-inset-top))] z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-slate-700 bg-slate-950/90 px-4 py-2.5 text-sm font-semibold text-white shadow-xl backdrop-blur"
          >
            <ArrowPathIcon className="h-4 w-4" />
            {isFr ? 'Recentrer' : 'Recenter'}
          </button>
        )}

        {/* Bouton fermer */}
        <button
          onClick={onClose}
          className="pointer-events-auto absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-10 flex h-11 w-11 items-center justify-center rounded-full bg-slate-950/85 text-white shadow-xl backdrop-blur active:scale-95"
          aria-label={isFr ? 'Quitter la navigation' : 'Exit navigation'}
        >
          <XMarkIcon className="h-6 w-6" />
        </button>

        {/* ─── Panneau de guidage ─────────────────────────────────────────
            Une seule chose compte quand on marche : la prochaine action. Elle
            occupe donc le haut du panneau, à la taille d'un panneau d'affichage,
            et c'est la couleur de la ligne empruntée qui habille le bouton. Le
            reste du trajet se lit d'un coup d'œil sur le rail au-dessus. */}
        <motion.div
          initial={{ y: 160 }}
          animate={{ y: 0 }}
          transition={{ type: 'spring', stiffness: 250, damping: 31 }}
          className="absolute inset-x-0 bottom-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
          {/* Barre de progression : une seule barre pleine, remplie à la
              couleur de l'étape en cours. Le rail segmenté d'avant changeait de
              hauteur d'un segment à l'autre, ce qui donnait une ligne qui
              montait et descendait au lieu d'une progression. */}
          <div className="mb-2 flex items-center gap-2 px-1">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
              <motion.span
                className="block h-full rounded-full"
                style={{ backgroundColor: stepColor(step) }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            </span>
            <span className="tabular text-[11px] font-semibold text-white/70">
              {index + 1}/{steps.length}
            </span>
          </div>

          <div
            className="relative overflow-hidden rounded-3xl border border-slate-800 px-5 pb-4 pt-4 shadow-[0_-16px_50px_rgba(0,0,0,0.5)]"
            style={{ background: PANEL_BG }}
          >
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <p className="signal-label" style={{ color: stepColor(step) }}>
                  {stepEyebrow(step, isFr)}
                </p>

                {/* L'instruction : ce qu'il faut faire, maintenant. */}
                <p className="mt-1.5 text-[26px] font-extrabold leading-[1.1] tracking-tight text-white">
                  {step.kind === 'transit' && step.headsign ? step.headsign : step.instruction}
                </p>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {step.kind === 'transit' && step.lineShortName && (
                    <span
                      className={`flex h-7 min-w-[1.75rem] items-center justify-center px-2 text-sm font-black text-white ${
                        isRoundLine(step.lineShortName) ? 'rounded-full' : 'rounded-lg'
                      }`}
                      style={{ backgroundColor: step.color }}
                    >
                      {step.lineShortName}
                    </span>
                  )}
                  {step.fromName && (
                    <span className="truncate text-sm text-slate-300">{step.fromName}</span>
                  )}
                  {step.durationMin > 0 && (
                    <span className="tabular text-sm text-slate-400">{step.durationMin} min</span>
                  )}
                </div>
              </div>

              {/* Heure d'arrivée : l'information de fond, discrète mais toujours
                  là, en chiffres tabulaires comme sur un afficheur de quai. */}
              <div className="flex-shrink-0 text-right">
                <p className="signal-label text-slate-500">{isFr ? 'Arrivée' : 'Arrival'}</p>
                <p className="tabular mt-1 text-[22px] font-bold leading-none text-white">{arriveLabel}</p>
                <p className="tabular mt-1 text-xs text-slate-500">{itinerary.dur}</p>
              </div>
            </div>

            {/* Action unique, à la couleur de l'étape. Le retour arrière reste
                possible mais ne rivalise pas avec elle. */}
            <div className="mt-4 flex items-center gap-2">
              {hasStarted && index > 0 && (
                <button
                  onClick={() => setIndex((i) => Math.max(i - 1, 0))}
                  className="pointer-events-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border border-slate-700 bg-slate-800 text-slate-300 transition hover:bg-slate-700"
                  aria-label={isFr ? 'Étape précédente' : 'Previous step'}
                >
                  <ChevronLeftIcon className="h-5 w-5" />
                </button>
              )}

              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={handleNext}
                className="pointer-events-auto flex flex-1 items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-bold text-white shadow-lg"
                style={{ backgroundColor: hasStarted && isLast ? ARRIVAL_COLOR : stepColor(step) }}
              >
                {!hasStarted ? (
                  <>{isFr ? 'Démarrer' : 'Start'}<ChevronRightIcon className="h-5 w-5" /></>
                ) : isLast ? (
                  <><FlagIcon className="h-5 w-5" />{isFr ? 'Terminer' : 'Finish'}</>
                ) : (
                  <>{isFr ? 'Étape suivante' : 'Next step'}<ChevronRightIcon className="h-5 w-5" /></>
                )}
              </motion.button>
            </div>

            {/* Prochaine étape annoncée en une ligne : on sait ce qui vient
                sans dérouler tout le trajet. */}
            {!isLast && steps[index + 1] && (
              <p className="mt-3 flex items-center gap-2 truncate border-t border-slate-800 pt-3 text-xs text-slate-400">
                <span className="signal-label text-slate-500">{isFr ? 'Puis' : 'Then'}</span>
                <span
                  className="h-2 w-2 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: stepColor(steps[index + 1]) }}
                />
                <span className="truncate">
                  {steps[index + 1].kind === 'transit' && steps[index + 1].lineShortName
                    ? `${steps[index + 1].lineShortName} · ${steps[index + 1].headsign || steps[index + 1].instruction}`
                    : steps[index + 1].instruction}
                </span>
              </p>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}