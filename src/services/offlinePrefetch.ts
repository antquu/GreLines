import { prefetchOfflineSchedules } from './api';
import { getFavorites } from './favorites';
import { loadRecentStops } from '../utils/recentStops';
import { isOffline } from './offlineSchedule';
import { startNetworkScheduleDownload } from './networkSchedules';
import { precacheOfflineMap } from './offlineMap';


const LAST_RUN_KEY = 'greLines_offlinePrefetchDay';
const MAX_STOPS = 12;
const START_DELAY_MS = 8_000;

function today(): string {
  return new Date().toDateString();
}

async function prefetchFavoriteStops(): Promise<void> {
  try {
    if (localStorage.getItem(LAST_RUN_KEY) === today()) return;
  } catch {
    return;
  }

  const stopIds = [
    ...getFavorites().map(favorite => favorite.stopId),
    ...loadRecentStops().map(stop => stop.id),
  ];
  const unique = Array.from(new Set(stopIds)).slice(0, MAX_STOPS);
  if (unique.length === 0) return;

  const stored = await prefetchOfflineSchedules(unique);
  if (stored === 0) return;
  try {
    localStorage.setItem(LAST_RUN_KEY, today());
  } catch {
  }
}

let scheduled = false;

export function scheduleOfflinePrefetch(): void {
  if (scheduled) return;
  scheduled = true;

  const run = () => {
    if (isOffline()) return;
    void prefetchFavoriteStops()
      .catch(() => {})
      .then(() => {
        startNetworkScheduleDownload();
        void precacheOfflineMap().catch(() => {});
      });
  };

  window.setTimeout(run, START_DELAY_MS);
  window.addEventListener('online', () => window.setTimeout(run, 2_000));
}
