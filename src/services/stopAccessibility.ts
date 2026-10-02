const URL = '/accessible-stops.json';

let cache: Set<string> | null = null;
let inflight: Promise<Set<string>> | null = null;

export function loadAccessibleStops(): Promise<Set<string>> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;

  inflight = fetch(URL)
    .then(response => (response.ok ? response.json() : null))
    .then((data: { stops?: string[] } | null) => {
      cache = new Set(Array.isArray(data?.stops) ? data.stops : []);
      return cache;
    })
    .catch(() => {
      cache = new Set<string>();
      return cache;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

let tclPlatforms: Promise<{ yes: Set<string>; no: Set<string> } | null> | null = null;
const listeners = new Set<(stops: Set<string>) => void>();

function loadTclPlatforms() {
  tclPlatforms ??= fetch('/data/tcl-accessibility.json')
    .then(response => (response.ok && (response.headers.get('content-type') ?? '').includes('json') ? response.json() : null))
    .then((data: { yes?: string[]; no?: string[] } | null) =>
      data ? { yes: new Set(data.yes ?? []), no: new Set(data.no ?? []) } : null)
    .catch(() => null);
  return tclPlatforms;
}

let notifyScheduled = false;
function notifyListeners(stops: Set<string>) {
  if (notifyScheduled) return;
  notifyScheduled = true;
  window.setTimeout(() => {
    notifyScheduled = false;
    const snapshot = new Set(stops);
    for (const listener of listeners) listener(snapshot);
  }, 50);
}

export function onAccessibleStopsChange(listener: (stops: Set<string>) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function registerTclStopGroups(groups: string[][]): Promise<void> {
  const [stops, platforms] = await Promise.all([loadAccessibleStops(), loadTclPlatforms()]);
  if (!platforms) return;
  const local = (id: string) => id.replace(/^TCL:/, '');
  let added = 0;
  for (const group of groups) {
    const ids = group.map(local);
    const yes = ids.some(id => platforms.yes.has(id));
    const no = ids.some(id => platforms.no.has(id));
    for (const id of group) if (platforms.yes.has(local(id)) && !stops.has(id)) { stops.add(id); added += 1; }
    if (yes && !no && !stops.has(group[0])) { stops.add(group[0]); added += 1; }
  }
  if (added > 0) notifyListeners(stops);
}

export async function registerAccessibleIds(ids: string[]): Promise<void> {
  const stops = await loadAccessibleStops();
  let added = 0;
  for (const id of ids) if (!stops.has(id)) { stops.add(id); added += 1; }
  if (added > 0) notifyListeners(stops);
}

export interface AccessibleStopRef {
  id?: string | null;
  clusterGtfsId?: string | null;
}

export function isStopAccessible(
  stops: Set<string> | null | undefined,
  stop: AccessibleStopRef | null | undefined,
): boolean {
  if (!stops || stops.size === 0 || !stop) return false;
  if (stop.id && stops.has(stop.id)) return true;
  if (stop.clusterGtfsId && stops.has(stop.clusterGtfsId)) return true;
  return false;
}

export function isJourneyStepFree(
  stops: Set<string> | null | undefined,
  legs: Array<{ mode?: string; from?: { stopId?: string }; to?: { stopId?: string } }> | null | undefined,
): boolean {
  if (!stops || stops.size === 0 || !Array.isArray(legs)) return false;
  const transit = legs.filter(leg => String(leg?.mode ?? '').toUpperCase() !== 'WALK');
  if (transit.length === 0) return false;
  return transit.every(leg => {
    const from = leg.from?.stopId;
    const to = leg.to?.stopId;
    return Boolean(from && stops.has(from) && to && stops.has(to));
  });
}
