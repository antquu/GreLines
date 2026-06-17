import { useRef, forwardRef, useImperativeHandle, useCallback, useState, useMemo, useEffect } from 'react';
import type { ForwardedRef } from 'react';
import MapLibreMap, { Marker, Source, Layer } from 'react-map-gl/maplibre';
import type { Stop } from '../types';
import type { MapRef as MapLibreRef } from 'react-map-gl/maplibre';
import type { AddressResult } from '../services/geocoding';
import type { LineGeometry, ServedStopPoint } from '../services/lineShapes';
import { stopIsNearAny, snapStopToLines } from '../services/lineShapes';
import { resolveLineBackgroundColor } from '../utils/lineColors';

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
  /** Address marker to display on the map (from geocoding). */
  selectedAddress?: AddressResult | null;
  /** Route planner origin marker. */
  routeStart?: RouteMapPoint | null;
  /** Route planner destination marker. */
  routeEnd?: RouteMapPoint | null;
  /** Optional route geometry to display when an itinerary is selected. */
  routeLine?: GeoJSON.FeatureCollection | null;
  /** Line geometries to overlay (one polyline per filtered line). */
  lineGeometries?: LineGeometry[];
  /**
   * If non-null, only stops near one of these points are shown on the map.
   * Used when a line filter is active to hide stops not served by those lines.
   * Null (default) means "show all stops".
   */
  visibleStopPoints?: ServedStopPoint[] | null;
  /** When set, the map shows a crosshair cursor and will forward click events. */
  pickMode?: 'from' | 'to' | null;
  onMapClick?: (lat: number, lon: number) => void;
}

const MAPTILER_STYLE_URL = 'https://api.maptiler.com/maps/019d0d02-359b-7f4b-a797-bdeabca9dce3/style.json?key=7TQErbyvEqFlis3QMmSl';

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
  { stops, selectedStop, currentLocation, onStopClick, selectedAddress, routeStart, routeEnd, routeLine, lineGeometries = [], visibleStopPoints, pickMode, onMapClick }: MapProps,
  ref: ForwardedRef<MapRef>
) => {
  const mapRef = useRef<MapLibreRef>(null);
  const [mapState, setMapState] = useState<MapState>({ bounds: null, zoom: 12.1 });
  const [routeDrawProgress, setRouteDrawProgress] = useState(1);

  const mapStyleUrl = MAPTILER_STYLE_URL;

  const visibleStops = useMemo(() => {
    // First pass: filter to only stops near a stop served by the active line
    // filter (if any). We match by proximity (~35m) because MTAG's `/routes/X/stops`
    // endpoint returns numeric ids that don't match our textual stop ids.
    let filtered = visibleStopPoints
      ? stops.filter(stop => stopIsNearAny(stop, visibleStopPoints))
      : stops;

    // Snap-to-line: when a line filter is active and we have polylines, drag
    // each filtered stop to its closest point on the polyline. The user-clicked
    // stop is kept at its real position so it stays visually "yours". Stops
    // that don't have a close polyline (>80m) are left alone.
    if (visibleStopPoints && lineGeometries.length > 0) {
      filtered = filtered.map(stop => {
        if (stop.id === selectedStop?.id) return stop;
        const snapped = snapStopToLines(stop, lineGeometries, 80);
        return snapped ? { ...stop, lat: snapped.lat, lon: snapped.lon } : stop;
      });
    }

    // Second pass: viewport culling for performance.
    if (!mapState.bounds) return filtered;
    const paddedBounds = getPaddedViewportBounds(mapState.bounds, mapState.zoom);
    return filtered.filter(stop => isStopInViewport(stop, paddedBounds));
  }, [stops, mapState, visibleStopPoints, lineGeometries, selectedStop?.id]);

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

  const hasLines = linesFeatureCollection.features.length > 0;

  /** Show stop name labels when zoomed in enough to read them comfortably. */
  const showStopLabels = mapState.zoom >= 15;

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

  return (
    <div className={`w-full h-full ${pickMode ? 'cursor-crosshair' : ''}`}>
      <MapLibreMap
        ref={mapRef}
        mapStyle={mapStyleUrl}
        initialViewState={{
          longitude: GRENOBLE_CENTER[1],
          latitude: GRENOBLE_CENTER[0],
          zoom: 12.1,
        }}
        style={{ width: '100%', height: '100%' }}
        onMove={handleMapMove}
        onClick={(evt: any) => {
          try {
            if (!onMapClick) return;
            // react-map-gl/maplibre exposes lngLat as an array or an object
            const raw = (evt as any).lngLat || (evt && (evt as any).lngLat?.toArray && (evt as any).lngLat.toArray());
            const lngLat = Array.isArray(raw) ? raw : (raw && raw.toArray ? raw.toArray() : null);
            if (!lngLat) return;
            const lon = lngLat[0];
            const lat = lngLat[1];
            onMapClick(lat, lon);
          } catch (err) {
            // swallow
          }
        }}
      >
        {/* ─── Line shapes ─────────────────────────────────────────────────
            Two layers per line: a white "casing" underneath for legibility,
            and the coloured line on top. The id 'line-shapes' is unique so
            re-renders replace the source cleanly. */}
        {hasLines && (
          <Source id="line-shapes" type="geojson" data={linesFeatureCollection}>
            <Layer
              id="line-shapes-casing"
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

        {/* ─── Stop markers ──────────────────────────────────────────────── */}
        {visibleStops.map((stop) => {
          const isRouteEndpoint = selectedRouteStopIds.has(stop.id);
          const isSelected = selectedStop?.id === stop.id || isRouteEndpoint;
          return (
            <Marker
              key={stop.id}
              longitude={stop.lon}
              latitude={stop.lat}
              onClick={() => handleMarkerClick(stop)}
            >
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {/* Name label, only visible at higher zoom levels. We position
                    it absolutely above the dot so the dot stays the click target
                    and the label doesn't shift the marker on (de)appearance. */}
                {showStopLabels && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '100%',
                      marginBottom: '4px',
                      whiteSpace: 'nowrap',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: '#0f172a',
                      backgroundColor: 'rgba(255, 255, 255, 0.92)',
                      padding: '2px 6px',
                      borderRadius: '6px',
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.15)',
                      pointerEvents: 'none',
                      letterSpacing: '0.01em',
                    }}
                  >
                    {stop.name}
                  </div>
                )}
                <div
                  style={{
                    width: isSelected ? '24px' : '16px',
                    height: isSelected ? '24px' : '16px',
                    borderRadius: '50%',
                    backgroundColor: isRouteEndpoint ? '#ffffff' : isSelected ? '#6B7280' : '#facc15',
                    border: isRouteEndpoint ? '3px solid #111827' : `${isSelected ? '3px' : '2px'} solid white`,
                    opacity: 1,
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    transition: 'all 0.2s ease',
                  }}
                />
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

export const Map = forwardRef<MapRef, MapProps>(MapComponentBase);
