import { useRef, forwardRef, useImperativeHandle, useCallback, useState, useMemo, useEffect } from 'react';
import type { ForwardedRef } from 'react';
import MapLibreMap, { Marker } from 'react-map-gl/maplibre';
import type { Stop } from '../types';
import type { MapRef as MapLibreRef } from 'react-map-gl/maplibre';

interface MapProps {
  stops: Stop[];
  selectedStop: Stop | null;
  currentLocation: {lat: number, lon: number} | null;
  onStopClick: (stop: Stop) => void;
}

const MAPTILER_STYLE_URL = 'https://api.maptiler.com/maps/019d0d02-359b-7f4b-a797-bdeabca9dce3/style.json?key=7TQErbyvEqFlis3QMmSl';

export interface MapRef {
  centerOnStop: (stop: Stop) => void;
  centerOnLocation: (lat: number, lon: number) => void;
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

// Grenoble center coordinates
const GRENOBLE_CENTER: [number, number] = [45.18501, 5.74892];

// Throttle helper
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

// Helper function to check if a stop is in viewport
const isStopInViewport = (stop: Stop, bounds: ViewportBounds | null): boolean => {
  if (!bounds) return true;
  return (
    stop.lat >= bounds.south &&
    stop.lat <= bounds.north &&
    stop.lon >= bounds.west &&
    stop.lon <= bounds.east
  );
};

// Dynamic padding based on zoom level
// Higher zoom = less padding needed (user is zoomed in, fewer stops visible)
// Lower zoom = more padding needed (user sees more, preload more)
const getPaddingPercent = (zoom: number): number => {
  if (zoom > 15) return 0.05;  // Very zoomed in: minimal padding
  if (zoom > 13) return 0.1;   // Zoomed in: 10% padding
  if (zoom > 11) return 0.15;  // Normal: 15% padding
  return 0.2;                   // Zoomed out: 20% padding
};

// Add padding to viewport to preload stops slightly outside visible area
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


const MapComponentBase = ({ stops, selectedStop, currentLocation, onStopClick }: MapProps, ref: ForwardedRef<MapRef>) => {
  const mapRef = useRef<MapLibreRef>(null);
  const [mapState, setMapState] = useState<MapState>({ bounds: null, zoom: 12.1 });

  const mapStyleUrl = MAPTILER_STYLE_URL;

  // Filter stops to only show those in viewport (with dynamic padding based on zoom)
  const visibleStops = useMemo(() => {
    if (!mapState.bounds) return stops;
    
    const paddedBounds = getPaddedViewportBounds(mapState.bounds, mapState.zoom);
    return stops.filter(stop => isStopInViewport(stop, paddedBounds));
  }, [stops, mapState]);


  // Throttled viewport update (max 2-3 times per second)
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

  // Create throttled version: updates max every 300ms
  const handleMapMove = useCallback(throttle(updateViewport, 300), [updateViewport]);

  // Set initial bounds
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

  // Expose map methods to parent component
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
    }
  }));

  const handleMarkerClick = useCallback((stop: Stop) => {
    onStopClick(stop);
  }, [onStopClick]);

  return (
    <div className="w-full h-full">
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
      >
        {/* Only render stops that are visible in the current viewport */}
        {visibleStops.map((stop) => {
          const isSelected = selectedStop?.id === stop.id;
          return (
            <Marker
              key={stop.id}
              longitude={stop.lon}
              latitude={stop.lat}
              onClick={() => handleMarkerClick(stop)}
            >
              <div
                style={{
                  width: isSelected ? '24px' : '16px',
                  height: isSelected ? '24px' : '16px',
                  borderRadius: '50%',
                  backgroundColor: isSelected ? '#6B7280' : '#facc15',
                  border: `${isSelected ? '3px' : '2px'} solid white`,
                  opacity: isSelected ? 1 : 0.8,
                  cursor: 'pointer',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                  transition: 'all 0.2s ease',
                }}
              />
            </Marker>
          );
        })}

        {currentLocation && (
          <Marker
            longitude={currentLocation.lon}
            latitude={currentLocation.lat}
          >
            <div
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor: '#3B82F6', // blue-500
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

