/**
 * Tout remettre à zéro.
 *
 * L'application garde ce qu'elle a lu à quatre endroits, et l'on ne s'en rend
 * compte que le jour où l'un d'eux garde quelque chose de trop :
 *
 *  — `localStorage` : les réglages, les favoris, les derniers arrêts consultés ;
 *  — IndexedDB : le catalogue des arrêts, les tracés de lignes, ce qui coûte
 *    cent requêtes à reconstruire ;
 *  — le Cache Storage du service worker : les tuiles de la carte, gardées une
 *    semaine, et les fichiers de l'application ;
 *  — le service worker lui-même, qui sert ces fichiers et qui, tant qu'il
 *    tourne, continue de servir la version qu'il connaît.
 *
 * Le bouton des réglages ne vidait que les deux premiers. C'était le plus
 * souvent suffisant — les données du réseau vivent là —, et trompeur le reste
 * du temps : on vidait « le cache », la carte gardait ses vieilles tuiles et
 * l'application ses anciens fichiers, et rien dans l'écran ne disait pourquoi.
 *
 * Chaque étape est isolée : un navigateur qui refuse l'une d'elles — navigation
 * privée, stockage plein, service worker indisponible — ne doit pas empêcher
 * les autres de se faire.
 */

import { idbClear } from '../services/persistentCache';

async function clearCacheStorage(): Promise<void> {
  if (typeof caches === 'undefined') return;
  const names = await caches.keys();
  await Promise.all(names.filter(name => name.startsWith('grelines-')).map(name => caches.delete(name)));
}

/**
 * Congédie le service worker.
 *
 * Le désinscrire plutôt que lui demander de se mettre à jour : la mise à jour
 * installe la nouvelle version mais laisse l'ancienne servir jusqu'à la
 * fermeture de tous les onglets, ce qui ne se voit pas et n'arrive jamais dans
 * une application posée sur l'écran d'accueil. La désinscription, elle, prend
 * effet au rechargement — et `main.tsx` le réinscrit dans la foulée.
 */
async function unregisterServiceWorkers(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map(registration => registration.unregister()));
}

/**
 * Vide tout, puis recharge.
 *
 * Le rechargement fait partie du geste : après ce ménage, l'application tourne
 * sur des données qu'elle n'a plus, et rien de ce qu'elle affiche n'est encore
 * vrai.
 */
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
