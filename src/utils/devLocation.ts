let armed = false;
let fake: { lat: number; lon: number } | null = null;
const listeners = new Set<() => void>();

const notify = () => { for (const listener of listeners) listener(); };

export function armLocationPick(): void {
  armed = true;
}

export function consumeLocationPick(lat: number, lon: number): boolean {
  if (!armed) return false;
  armed = false;
  fake = { lat, lon };
  notify();
  return true;
}

export function resetFakeLocation(): void {
  armed = false;
  if (!fake) return;
  fake = null;
  notify();
}

export function getFakeLocation(): { lat: number; lon: number } | null {
  return fake;
}

export function subscribeFakeLocation(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
