import { useEffect, useRef } from 'react';

/**
 * Empêche l'écran de s'éteindre pendant le guidage.
 *
 * Le web n'a pas d'arrière-plan : dès que l'écran se verrouille, iOS suspend le
 * JavaScript et Android gèle l'onglet. Le suivi de position s'arrête, la carte
 * se fige, et l'usager qui ressort son téléphone deux arrêts plus loin retrouve
 * une position périmée. Le Wake Lock est la seule parade côté web — c'est
 * d'ailleurs ce que font Transit et Citymapper.
 *
 * Le verrou n'est pas éternel : le système le relâche de lui-même dès que la
 * page passe en arrière-plan, et ne le rend pas au retour. Il faut donc le
 * redemander à chaque fois que la page redevient visible, sans quoi il ne tient
 * que jusqu'au premier passage par l'écran d'accueil.
 *
 * Absent de Firefox et des Safari antérieurs à 16.4 : dans ce cas la fonction
 * ne fait rien, et le guidage se comporte comme avant.
 */
export function useWakeLock(active: boolean) {
  const sentinelRef = useRef<any>(null);

  useEffect(() => {
    const lock: any = (navigator as any).wakeLock;
    if (!active || !lock?.request) return;

    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      if (sentinelRef.current) return;
      try {
        const sentinel = await lock.request('screen');
        if (cancelled) {
          sentinel.release?.();
          return;
        }
        sentinelRef.current = sentinel;
        sentinel.addEventListener?.('release', () => {
          if (sentinelRef.current === sentinel) sentinelRef.current = null;
        });
      } catch {
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') acquire();
    };

    acquire();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      sentinel?.release?.().catch?.(() => {});
    };
  }, [active]);
}
