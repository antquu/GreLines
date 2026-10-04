import type { Departure, StopDetail } from '../types';
import { chavantStop } from './chavantFixture';

export interface LabState {
  open: boolean;
  stop: StopDetail | null;
  selectedLines: Set<string>;
}

let state: LabState = { open: false, stop: null, selectedLines: new Set() };
const listeners = new Set<() => void>();
const timers = new Set<number>();

function set(next: Partial<LabState>) {
  state = { ...state, ...next };
  listeners.forEach(listener => listener());
}

function setDepartures(update: (departures: Departure[]) => Departure[]) {
  if (!state.stop) return;
  set({ stop: { ...state.stop, departures: update(state.stop.departures), lastUpdate: new Date() } });
}

function later(fn: () => void, ms: number) {
  const id = window.setTimeout(() => {
    timers.delete(id);
    fn();
  }, ms);
  timers.add(id);
}

export function subscribeLab(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getLabState = (): LabState => state;

export function openLab() {
  set({ open: true, stop: chavantStop(), selectedLines: new Set() });
}

export function closeLab() {
  timers.forEach(id => window.clearTimeout(id));
  timers.clear();
  set({ open: false, stop: null, selectedLines: new Set() });
}

export function resetLab() {
  timers.forEach(id => window.clearTimeout(id));
  timers.clear();
  set({ stop: chavantStop(), selectedLines: new Set() });
}

export function setLabSelectedLines(next: Set<string>) {
  set({ selectedLines: new Set(next) });
}

export function labLines(): Array<{ id: string; label: string }> {
  const ids = new Set(state.stop?.departures.map(dep => dep.lineId) ?? []);
  return [...ids].map(id => ({ id, label: id }));
}

function earliestIndex(departures: Departure[], lineId?: string): number {
  let best = -1;
  departures.forEach((dep, index) => {
    if (lineId && dep.lineId !== lineId) return;
    if (best === -1 || dep.departureTime < departures[best].departureTime) best = index;
  });
  return best;
}

export function passBus(lineId?: string) {
  if (!state.stop) return;
  const index = earliestIndex(state.stop.departures, lineId);
  if (index === -1) return;
  const target = state.stop.departures[index];
  setDepartures(list => list.map(dep => (dep === target ? { ...dep, departureTime: 0 } : dep)));
  later(() => {
    setDepartures(list => list.filter(dep => !(dep.lineId === target.lineId && dep.destination === target.destination && dep.departureTime === 0)));
  }, 1400);
}

export function addDeparture(lineId?: string) {
  if (!state.stop) return;
  const pool = state.stop.departures.filter(dep => !lineId || dep.lineId === lineId);
  const source = pool[Math.floor(Math.random() * pool.length)] ?? state.stop.departures[0];
  if (!source) return;
  const minutes = 1 + Math.floor(Math.random() * 25);
  setDepartures(list => [...list, { ...source, departureTime: minutes, realtime: true, theoretical: undefined }]);
}

export function addNewGroup() {
  if (!state.stop) return;
  setDepartures(list => [
    ...list,
    {
      lineId: 'C1',
      lineName: '',
      lineShortName: 'C1',
      destination: 'Grenoble, Gares',
      departureTime: 2 + Math.floor(Math.random() * 8),
      realtime: true,
      type: 'BUS',
      occupancy: 'LIGHT',
    },
  ]);
}

export function tickMinute() {
  setDepartures(list => list.map(dep => ({ ...dep, departureTime: dep.departureTime - 1 })).filter(dep => dep.departureTime >= 0));
}

export function shiftFirst(minutes: number, lineId?: string) {
  if (!state.stop) return;
  const pool = state.stop.departures.filter(dep => dep.departureTime >= 2 && (!lineId || dep.lineId === lineId));
  const target = pool.reduce<Departure | null>((best, dep) => (!best || dep.departureTime < best.departureTime ? dep : best), null);
  if (!target) return;
  setDepartures(list => list.map(dep => (dep === target ? { ...dep, departureTime: Math.max(0, dep.departureTime + minutes) } : dep)));
}
