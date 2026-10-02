import { useEffect, useRef } from 'react';

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
