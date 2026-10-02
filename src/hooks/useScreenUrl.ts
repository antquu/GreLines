import { useEffect, useRef } from 'react';

export type MobileScreen = 'home' | 'route' | 'favorites' | 'account' | 'card';

const PATHS: Record<MobileScreen, string> = {
  home: '/app',
  route: '/app/mob/route',
  favorites: '/app/mob/favorites',
  account: '/app/mob/settings',
  card: '/app/mob/settings/card',
};

export function screenFromPath(pathname: string): MobileScreen | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  const entry = (Object.entries(PATHS) as Array<[MobileScreen, string]>)
    .sort((a, b) => b[1].length - a[1].length)
    .find(([, value]) => path === value);
  return entry ? entry[0] : null;
}

export function useScreenUrl(screen: MobileScreen, enabled: boolean) {
  const lastRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const target = PATHS[screen];
    if (window.location.pathname === target || lastRef.current === target) return;
    lastRef.current = target;
    window.history.replaceState(
      window.history.state,
      '',
      `${target}${window.location.search}${window.location.hash}`,
    );
  }, [screen, enabled]);
}
