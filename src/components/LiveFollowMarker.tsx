import { useEffect, useRef, useState } from 'react';
import { Marker } from 'react-map-gl/maplibre';

const MIN_GLIDE_MS = 600;
const MAX_GLIDE_MS = 6000;
const TELEPORT_DEG = 0.01;

export function LiveFollowMarker({
  lat,
  lon,
  avatar,
  color,
  opacity = 1,
}: {
  lat: number;
  lon: number;
  avatar: string;
  color: string;
  opacity?: number;
}) {
  const [shown, setShown] = useState<[number, number]>([lon, lat]);
  const shownRef = useRef<[number, number]>([lon, lat]);
  const lastAtRef = useRef(0);
  const frameRef = useRef(0);

  useEffect(() => {
    const at = performance.now();
    const gap = lastAtRef.current ? at - lastAtRef.current : MIN_GLIDE_MS;
    lastAtRef.current = at;
    const duration = Math.max(MIN_GLIDE_MS, Math.min(MAX_GLIDE_MS, gap));
    const from = shownRef.current;
    const to: [number, number] = [lon, lat];
    if (Math.abs(from[0] - to[0]) > TELEPORT_DEG || Math.abs(from[1] - to[1]) > TELEPORT_DEG) {
      shownRef.current = to;
      frameRef.current = requestAnimationFrame(() => setShown(to));
      return () => cancelAnimationFrame(frameRef.current);
    }
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const next: [number, number] = [from[0] + (to[0] - from[0]) * progress, from[1] + (to[1] - from[1]) * progress];
      shownRef.current = next;
      setShown(next);
      if (progress < 1) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [lat, lon]);

  return (
    <Marker longitude={shown[0]} latitude={shown[1]} anchor="center">
      <span
        className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[1.375rem]"
        style={{ boxShadow: `0 0 0 4px ${color}, 0 8px 20px rgba(0,0,0,0.3)`, pointerEvents: 'none', opacity, transition: 'opacity 0.4s ease' }}
      >
        {avatar}
      </span>
    </Marker>
  );
}
