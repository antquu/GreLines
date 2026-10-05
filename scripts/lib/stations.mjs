export const SPLIT_RADIUS_M = 30;
export const PLATFORM_RADIUS_M = 35;

export const distanceM = (a, b) => {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(h));
};

export const centerOf = group => ({
  lat: group.reduce((sum, stop) => sum + stop.lat, 0) / group.length,
  lon: group.reduce((sum, stop) => sum + stop.lon, 0) / group.length,
});

export function platformGroups(served, linesOfStop, { separateStops = false } = {}) {
  if (served.length < 2) return null;
  const parentOf = new Map(served.map(stop => [stop.id, stop.id]));
  const root = id => (parentOf.get(id) === id ? id : root(parentOf.get(id)));
  for (let i = 0; i < served.length; i += 1) {
    for (let j = i + 1; j < served.length; j += 1) {
      const a = served[i];
      const b = served[j];
      const shareLine = [...(linesOfStop.get(a.id) ?? [])].some(line => linesOfStop.get(b.id)?.has(line));
      if ((shareLine && !separateStops) || distanceM(a, b) <= PLATFORM_RADIUS_M) parentOf.set(root(b.id), root(a.id));
    }
  }
  const groups = new Map();
  for (const stop of served) {
    const key = root(stop.id);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(stop);
  }
  if (groups.size < 2) return null;
  const ordered = [...groups.values()].sort((a, b) => b.length - a.length);
  const centers = ordered.map(centerOf);
  const apart = centers.every((center, i) => centers.every((other, j) => i === j || distanceM(center, other) > SPLIT_RADIUS_M));
  return apart ? { groups: ordered, centers } : null;
}
