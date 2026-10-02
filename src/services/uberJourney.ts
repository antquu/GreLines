import { planDirectItinerary, type RouteItinerary, type UberJourneyInfo } from './api';

const PREFERRED_PRODUCTS = ['uberx', 'uber x'];

interface UberProduct {
  productId: string | null;
  displayName: string | null;
  estimate: string | null;
  lowEstimate: number | null;
  highEstimate: number | null;
  currency: string | null;
  durationSeconds: number | null;
  distanceMiles: number | null;
}

const formatClock = (value: number): string =>
  new Date(value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

function pickProduct(products: UberProduct[]): UberProduct | null {
  const usable = products.filter(product => product.lowEstimate !== null || product.estimate);
  if (usable.length === 0) return null;

  const preferred = usable.find(product =>
    PREFERRED_PRODUCTS.includes(String(product.displayName ?? '').toLowerCase()),
  );
  if (preferred) return preferred;

  return usable
    .slice()
    .sort((a, b) => (a.lowEstimate ?? Infinity) - (b.lowEstimate ?? Infinity))[0];
}

function deeplink(options: {
  fromLatitude: number;
  fromLongitude: number;
  toLatitude: number;
  toLongitude: number;
  fromName: string;
  toName: string;
}): string {
  const params = new URLSearchParams({
    action: 'setPickup',
    'pickup[latitude]': String(options.fromLatitude),
    'pickup[longitude]': String(options.fromLongitude),
    'pickup[nickname]': options.fromName,
    'dropoff[latitude]': String(options.toLatitude),
    'dropoff[longitude]': String(options.toLongitude),
    'dropoff[nickname]': options.toName,
  });
  return `https://m.uber.com/ul/?${params.toString()}`;
}

export async function planUberJourney(options: {
  fromLatitude: number;
  fromLongitude: number;
  toLatitude: number;
  toLongitude: number;
  fromName: string;
  toName: string;
  departAt?: Date;
  signal?: AbortSignal;
}): Promise<RouteItinerary | null> {
  const query = new URLSearchParams({
    startLatitude: String(options.fromLatitude),
    startLongitude: String(options.fromLongitude),
    endLatitude: String(options.toLatitude),
    endLongitude: String(options.toLongitude),
  });

  let product: UberProduct | null = null;
  try {
    const response = await fetch(`/api/uber?${query.toString()}`, { signal: options.signal });
    if (!response.ok) return null;
    const payload = await response.json();
    product = pickProduct(Array.isArray(payload?.products) ? payload.products : []);
  } catch {
    return null;
  }
  if (!product) return null;

  const ride = await planDirectItinerary({
    fromLatitude: options.fromLatitude,
    fromLongitude: options.fromLongitude,
    toLatitude: options.toLatitude,
    toLongitude: options.toLongitude,
    mode: 'CAR',
  });

  const rideSeconds = product.durationSeconds ?? ride?.durationSeconds ?? 0;
  if (rideSeconds <= 0) return null;

  const departAt = (options.departAt ?? new Date()).getTime();
  const arrival = departAt + rideSeconds * 1000;
  const rideMinutes = Math.max(1, Math.round(rideSeconds / 60));
  const rideMeters = ride?.distanceMeters ?? (product.distanceMiles ?? 0) * 1609.34;

  const uber: UberJourneyInfo = {
    productName: product.displayName,
    priceLabel: product.estimate,
    lowEstimate: product.lowEstimate,
    highEstimate: product.highEstimate,
    currency: product.currency,
    rideMinutes,
    rideMeters: Math.round(rideMeters),
    deeplink: deeplink(options),
  };

  const rideLeg = {
    mode: 'CAR',
    uberProduct: product.displayName ?? 'Uber',
    startTime: departAt,
    endTime: arrival,
    duration: rideSeconds,
    distance: rideMeters,
    from: { name: options.fromName, lat: options.fromLatitude, lon: options.fromLongitude },
    to: { name: options.toName, lat: options.toLatitude, lon: options.toLongitude },
    legGeometry: { points: ride?.points ?? '' },
  };

  return {
    dep: formatClock(departAt),
    arr: formatClock(arrival),
    depName: options.fromName,
    arrName: options.toName,
    dur: `${rideMinutes} min`,
    direction: options.toName,
    lineKeys: [],
    legs: [],
    allLegs: [rideLeg],
    routePath: ride?.coordinates ?? [],
    uber,
  };
}
