import { idbClear } from '../services/persistentCache';

async function clearCacheStorage(): Promise<void> {
  if (typeof caches === 'undefined') return;
  const names = await caches.keys();
  await Promise.all(names.filter(name => name.startsWith('grelines-')).map(name => caches.delete(name)));
}

async function unregisterServiceWorkers(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map(registration => registration.unregister()));
}

export async function resetAllCaches(): Promise<void> {
  try {
    localStorage.clear();
  } catch {
  }

  await idbClear().catch(() => {});
  await clearCacheStorage().catch(() => {});
  await unregisterServiceWorkers().catch(() => {});

  window.location.reload();
}
