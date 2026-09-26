import { prefetchOfflineSchedules } from './api';
import { getFavorites } from './favorites';
import { loadRecentStops } from '../utils/recentStops';
import { isOffline } from './offlineSchedule';
import { startNetworkScheduleDownload } from './networkSchedules';
import { precacheOfflineMap } from './offlineMap';

/**
 * Garde d'avance les horaires théoriques, pour le hors ligne.
 *
 * D'abord les favoris et les arrêts récents, arrêt par arrêt : ce sont ceux
 * qu'on ouvrira, et leur fiche complète inclut les lignes des autres réseaux
 * (train, cars) que le téléchargement du réseau ne couvre pas. Ensuite le
 * réseau entier, ligne par ligne, du tram au Flexo, et en même temps le fond
 * de carte de l'agglomération.
 *
 * Le tout démarre quand l'application a fini de s'ouvrir, pour ne rien lui
 * retirer.
 */

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
    /* Refusé : on recommencera à la prochaine ouverture, sans dommage. */
  }
}

let scheduled = false;

/** À appeler au démarrage. Le travail se fait une fois par session. */
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
  /* Le réseau revient : on reprend là où l'on s'était arrêté. */
  window.addEventListener('online', () => window.setTimeout(run, 2_000));
}
