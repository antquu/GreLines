import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import MapLibreMap, { Marker, Source, Layer } from 'react-map-gl/maplibre';
import type { MapRef } from 'react-map-gl/maplibre';
import {
  XMarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MapPinIcon,
  FlagIcon,
} from '@heroicons/react/24/solid';
import { FaWalking } from 'react-icons/fa';
import { MdTram, MdDirectionsBus } from 'react-icons/md';
import type { RouteItinerary } from '../services/api';
import type { AllLinesLine } from '../services/allLines';
import { resolveRouteLine } from '../utils/routeLineResolver';

const MAPTILER_STYLE_URL =
  'https://api.maptiler.com/maps/019d0d02-359b-7f4b-a797-bdeabca9dce3/style.json?key=7TQErbyvEqFlis3QMmSl';

interface NavigationModeProps {
  itinerary: RouteItinerary;
  isOpen: boolean;
  onClose: () => void;
  language: 'fr' | 'en';
  stops: any[];
  lineLookup?: Map<string, AllLinesLine> | null;
  currentLocation?: { lat: number; lon: number } | null;
  /** Appelé quand l'utilisateur entre dans un véhicule (pour l'enquête qualité). */
  onBoardVehicle?: (info: { lineShortName: string; boardingStop: string | null }) => void;
  /** Appelé à l'arrivée. */
  onArrived?: () => void;
}

type StepKind = 'walk' | 'transit' | 'arrival';

interface NavStep {
  kind: StepKind;
  instruction: string;
  detail: string;
  durationMin: number;
  color: string;
  lineShortName?: string;
  mode?: string;
  fromName?: string;
  /** Tracé de l'étape, pour la surbrillance sur la carte. */
  path: Array<[number, number]>;
}

/**
 * Cap (0–360°, 0 = nord) entre deux points géographiques.
 */
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

function buildSteps(
  itinerary: RouteItinerary,
  isFr: boolean,
  stops: any[],
  lineLookup?: Map<string, AllLinesLine> | null
): NavStep[] {
  const legs = itinerary.allLegs || [];
  const steps: NavStep[] = legs.map((leg: any) => {
    const durationMin = Math.max(1, Math.round((leg.duration ?? 0) / 60));
    const path = leg?.legGeometry?.points ? decodePolyline(leg.legGeometry.points) : [];

    if (leg.mode === 'WALK') {
      return {
        kind: 'walk',
        instruction: isFr ? 'Marchez' : 'Walk',
        detail: leg.to?.name ? `${isFr ? 'jusqu’à' : 'to'} ${leg.to.name}` : '',
        durationMin,
        color: '#64748b',
        fromName: leg.from?.name,
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
  if (step.mode === 'TRAM') return <MdTram className={className} />;
  return <MdDirectionsBus className={className} />;
}

/**
 * Guidage plein écran : la carte reste visible en haut (avec le tracé de
 * l'étape en cours et la position de l'utilisateur), l'instruction occupe une
 * carte basse compacte — plus proche de l'univers GreLines qu'un écran
 * entièrement coloré.
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
}: NavigationModeProps) {
  const isFr = language === 'fr';
  const mapRef = useRef<MapRef>(null);
  const steps = useMemo(
    () => buildSteps(itinerary, isFr, stops, lineLookup),
    [itinerary, isFr, stops, lineLookup]
  );
  const [index, setIndex] = useState(0);
  /** Opacité pulsée du halo sous le tracé de l'étape. */
  const [glowOpacity, setGlowOpacity] = useState(0.35);

  useEffect(() => {
    if (!isOpen) return;
    let frame = 0;
    let raf = 0;
    const tick = () => {
      frame += 1;
      // Oscillation lente entre 0.15 et 0.45.
      setGlowOpacity(0.3 + Math.sin(frame / 30) * 0.15);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) setIndex(0);
  }, [isOpen, itinerary]);

  const step = steps[Math.min(index, steps.length - 1)];

  /**
   * Recadre ET oriente la carte sur l'étape en cours : on fait pivoter la vue
   * pour que le trajet à parcourir soit à l'horizontale, dans le sens de la
   * marche (gauche → droite). L'espace disponible sous la carte étant plus
   * large que haut, on exploite ainsi toute la largeur de l'écran.
   */
  useEffect(() => {
    if (!isOpen || !step) return;
    const map = mapRef.current;
    if (!map) return;

    if (step.path.length < 2) {
      // Étape sans tracé (arrivée) : on se contente de recentrer, sans rotation.
      const point = step.path[0];
      if (point) map.easeTo({ center: point, zoom: 15, bearing: 0, duration: 900 });
      return;
    }

    const start = step.path[0];
    const end = step.path[step.path.length - 1];
    // `bearing` place le cap donné vers le haut de l'écran : en retranchant 90°,
    // la direction du trajet pointe vers la droite (donc à l'horizontale).
    const heading = bearingBetween(start, end);

    const lons = step.path.map((p) => p[0]);
    const lats = step.path.map((p) => p[1]);
    map.fitBounds(
      [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ],
      { padding: { top: 90, bottom: 60, left: 60, right: 60 }, bearing: heading - 90, duration: 1000 }
    );
  }, [isOpen, index, step]);

  // Signale la montée à bord dès qu'une étape en véhicule commence : c'est le
  // moment où l'usager est assis et disponible pour répondre à l'enquête.
  useEffect(() => {
    if (!isOpen || !step || step.kind !== 'transit' || !step.lineShortName) return;
    onBoardVehicle?.({ lineShortName: step.lineShortName, boardingStop: step.fromName ?? null });
  }, [isOpen, index]);

  if (!isOpen || steps.length === 0) return null;

  const isLast = index >= steps.length - 1;

  const fullPath: Array<[number, number]> = itinerary.routePath || [];
  const routeGeoJSON = {
    type: 'FeatureCollection' as const,
    features: [
      { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: fullPath } },
    ],
  };
  const stepGeoJSON = {
    type: 'FeatureCollection' as const,
    features: [
      { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: step.path } },
    ],
  };

  const handleNext = () => {
    if (isLast) {
      onArrived?.();
      onClose();
      return;
    }
    setIndex((i) => Math.min(i + 1, steps.length - 1));
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[10001] flex flex-col bg-gray-950"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Carte */}
        <div className="relative flex-1">
          <MapLibreMap
            ref={mapRef}
            initialViewState={{ longitude: 5.74892, latitude: 45.18501, zoom: 13 }}
            mapStyle={MAPTILER_STYLE_URL}
            style={{ width: '100%', height: '100%' }}
            attributionControl={false}
          >
            {fullPath.length > 0 && (
              <Source id="nav-full-route" type="geojson" data={routeGeoJSON}>
                <Layer
                  id="nav-full-route-layer"
                  type="line"
                  paint={{ 'line-color': '#94a3b8', 'line-width': 4, 'line-opacity': 0.5 }}
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                />
              </Source>
            )}

            {step.path.length > 0 && (
              <Source id="nav-step-route" type="geojson" data={stepGeoJSON}>
                {/* Halo animé sous le tracé, pour le faire « respirer ». */}
                <Layer
                  id="nav-step-route-glow"
                  type="line"
                  paint={{ 'line-color': step.color, 'line-width': 16, 'line-opacity': glowOpacity, 'line-blur': 8 }}
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                />
                <Layer
                  id="nav-step-route-layer"
                  type="line"
                  paint={{ 'line-color': step.color, 'line-width': 7, 'line-opacity': 0.95 }}
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                />
              </Source>
            )}

            {/* Repères de début et de fin d'étape */}
            {step.path.length > 1 && (
              <>
                <Marker longitude={step.path[0][0]} latitude={step.path[0][1]}>
                  <div className="h-3 w-3 rounded-full border-2 border-white bg-slate-700 shadow" />
                </Marker>
                <Marker
                  longitude={step.path[step.path.length - 1][0]}
                  latitude={step.path[step.path.length - 1][1]}
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                    className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white shadow-lg"
                    style={{ backgroundColor: step.color }}
                  >
                    <StepIcon step={step} className="h-3 w-3 text-white" />
                  </motion.div>
                </Marker>
              </>
            )}

            {currentLocation && (
              <Marker longitude={currentLocation.lon} latitude={currentLocation.lat}>
                <div className="relative flex items-center justify-center">
                  <span className="absolute h-8 w-8 animate-ping rounded-full bg-blue-500/40" />
                  <span className="relative h-4 w-4 rounded-full border-2 border-white bg-blue-500 shadow-lg" />
                </div>
              </Marker>
            )}
          </MapLibreMap>

          {/* Barre supérieure translucide */}
          <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 to-transparent px-4 pb-6 pt-5">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="flex gap-1">
                  {steps.map((_, i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full ${i <= index ? 'bg-white' : 'bg-white/25'}`}
                    />
                  ))}
                </div>
                <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-white/70">
                  {isFr ? 'Arrivée' : 'Arrival'} {itinerary.arr} · {itinerary.dur}
                </p>
              </div>
              <button
                onClick={onClose}
                className="rounded-full bg-black/40 p-2 text-white backdrop-blur active:bg-black/60"
                aria-label={isFr ? 'Quitter la navigation' : 'Exit navigation'}
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Carte d'instruction */}
        <motion.div
          initial={{ y: 120 }}
          animate={{ y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 30 }}
          className="shrink-0 rounded-t-3xl border-t border-slate-800 bg-slate-900 px-5 pb-7 pt-5 shadow-2xl"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={index}
              initial={{ opacity: 0, x: 32 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -32 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="flex items-center gap-4"
            >
              <motion.div
                initial={{ scale: 0.7, rotate: -8 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 16 }}
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl"
                style={{ backgroundColor: step.color }}
              >
                {step.kind === 'transit' && step.lineShortName ? (
                  <span className="text-2xl font-black text-white">{step.lineShortName}</span>
                ) : (
                  <StepIcon step={step} className="h-8 w-8 text-white" />
                )}
              </motion.div>

              <div className="min-w-0 flex-1">
                <h1 className="truncate text-2xl font-extrabold leading-tight text-white">{step.instruction}</h1>
                {step.detail && <p className="mt-0.5 truncate text-base text-slate-300">{step.detail}</p>}
                {step.durationMin > 0 && (
                  <p className="mt-1 text-sm font-medium text-slate-500">{step.durationMin} min</p>
                )}
              </div>
            </motion.div>
          </AnimatePresence>

          <div className="mt-5 flex items-center gap-2.5">
            <button
              onClick={() => setIndex((i) => Math.max(i - 1, 0))}
              disabled={index === 0}
              className="rounded-xl bg-slate-800 p-3.5 text-slate-300 disabled:opacity-30 active:bg-slate-700"
              aria-label={isFr ? 'Étape précédente' : 'Previous step'}
            >
              <ChevronLeftIcon className="h-6 w-6" />
            </button>

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleNext}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-base font-bold text-white active:bg-blue-700"
            >
              {isLast ? (
                <>
                  <MapPinIcon className="h-5 w-5" />
                  {isFr ? 'Terminer' : 'Finish'}
                </>
              ) : (
                <>
                  {isFr ? 'Étape suivante' : 'Next step'}
                  <ChevronRightIcon className="h-5 w-5" />
                </>
              )}
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
