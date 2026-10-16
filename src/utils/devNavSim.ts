import type { RouteItinerary } from '../services/api';
import { decodePolyline } from './journeyGeometry';
import { resetFakeLocation, setFakeLocation } from './devLocation';

const TICK_MS = 2000;
const WALK_MPS = 3.2;
const RIDE_MPS = 11;
const BOARDING_PAUSE_S = 14;

interface SimLeg {
  path: Array<[number, number]>;
  lengths: number[];
  total: number;
  mps: number;
  pauseBefore: number;
}

let timer = 0;
let active = false;

function metres(a: [number, number], b: [number, number]): number {
  const latMean = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const dx = (b[0] - a[0]) * 111_320 * Math.cos(latMean);
  const dy = (b[1] - a[1]) * 110_540;
  return Math.sqrt(dx * dx + dy * dy);
}

function pointAt(leg: SimLeg, distance: number): [number, number] {
  let left = Math.max(0, distance);
  for (let i = 0; i < leg.lengths.length; i++) {
    const length = leg.lengths[i];
    if (left <= length || i === leg.lengths.length - 1) {
      const t = length === 0 ? 0 : Math.min(1, left / length);
      const a = leg.path[i];
      const b = leg.path[i + 1];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    left -= length;
  }
  return leg.path[leg.path.length - 1];
}

function buildLegs(itinerary: RouteItinerary): SimLeg[] {
  const legs: SimLeg[] = [];
  for (const leg of (itinerary.allLegs ?? []) as Array<{ mode?: string; legGeometry?: { points?: string } }>) {
    const encoded = leg?.legGeometry?.points;
    const path = typeof encoded === 'string' && encoded ? (decodePolyline(encoded) as Array<[number, number]>) : [];
    if (path.length < 2) continue;
    const lengths = path.slice(1).map((point, i) => metres(path[i], point));
    const walking = !leg.mode || leg.mode === 'WALK';
    legs.push({
      path,
      lengths,
      total: lengths.reduce((sum, value) => sum + value, 0),
      mps: walking ? WALK_MPS : RIDE_MPS,
      pauseBefore: walking ? 0 : BOARDING_PAUSE_S,
    });
  }
  return legs;
}

export function startNavSimulation(itinerary: RouteItinerary, speed = 1): boolean {
  stopNavSimulation(false);
  const legs = buildLegs(itinerary);
  if (legs.length === 0) return false;
  active = true;

  let legIndex = 0;
  let distance = 0;
  let pause = legs[0].pauseBefore;
  const factor = Number.isFinite(speed) && speed > 0 ? speed : 1;

  const emit = () => {
    const [lon, lat] = pointAt(legs[legIndex], distance);
    setFakeLocation(lat, lon);
  };

  emit();
  timer = window.setInterval(() => {
    const seconds = TICK_MS / 1000;
    if (pause > 0) {
      pause -= seconds * factor;
      emit();
      return;
    }
    distance += legs[legIndex].mps * seconds * factor;
    if (distance >= legs[legIndex].total) {
      if (legIndex === legs.length - 1) {
        distance = legs[legIndex].total;
        emit();
        window.clearInterval(timer);
        timer = 0;
        return;
      }
      legIndex += 1;
      distance = 0;
      pause = legs[legIndex].pauseBefore;
    }
    emit();
  }, TICK_MS);
  return true;
}

export function stopNavSimulation(reset = true): void {
  if (timer) window.clearInterval(timer);
  timer = 0;
  if (reset && active) resetFakeLocation();
  active = false;
}
