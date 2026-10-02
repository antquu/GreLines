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

export function useIsOffline(): boolean {
  return useSyncExternalStore(subscribe, isOffline, () => false);
}

let reconnects = 0;
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (!isOffline()) reconnects += 1;
  });
}

export function useReconnectCount(): number {
  return useSyncExternalStore(subscribe, () => reconnects, () => 0);
}
