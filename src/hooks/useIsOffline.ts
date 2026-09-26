import { useSyncExternalStore } from 'react';
import { isOffline } from '../services/offlineSchedule';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/** Vrai tant que l'app se sait sans réseau, coupure simulée comprise. */
export function useIsOffline(): boolean {
  return useSyncExternalStore(subscribe, isOffline, () => false);
}

/**
 * Compte les retours du réseau.
 *
 * À mettre dans les dépendances d'un effet qui charge des données en direct :
 * quand la connexion revient, que ce soit la fin du mode avion ou la fin
 * d'une coupure simulée, l'effet se rejoue et tout se recharge, sans attendre
 * le prochain rafraîchissement.
 */
let reconnects = 0;
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (!isOffline()) reconnects += 1;
  });
}

export function useReconnectCount(): number {
  return useSyncExternalStore(subscribe, () => reconnects, () => 0);
}
