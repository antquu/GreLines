import { useRef, forwardRef, useImperativeHandle, useCallback } from 'react';
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

export interface MapRef {
  centerOnStop: (stop: Stop) => void;
  centerOnLocation: (lat: number, lon: number) => void;
}

// Grenoble center coordinates
const GRENOBLE_CENTER: [number, number] = [45.18501, 5.74892];

// MapTiler vector style URL
const MAPTILER_STYLE_URL = 'https://api.maptiler.com/maps/019d0d02-359b-7f4b-a797-bdeabca9dce3/style.json?key=7TQErbyvEqFlis3QMmSl';

const MapComponentBase = ({ stops, selectedStop, currentLocation, onStopClick }: MapProps, ref: ForwardedRef<MapRef>) => {
  const mapRef = useRef<MapLibreRef>(null);

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
        mapStyle={MAPTILER_STYLE_URL}
        initialViewState={{
          longitude: GRENOBLE_CENTER[1],
          latitude: GRENOBLE_CENTER[0],
          zoom: 12.1,
        }}
        style={{ width: '100%', height: '100%' }}
      >
        {stops.map((stop) => {
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

