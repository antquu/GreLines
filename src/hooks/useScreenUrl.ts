/**
 * Les écrans du téléphone dans la barre d'adresse.
 *
 * L'application vit sur une seule page : rien de ce qu'on y ouvre n'avait
 * d'adresse. On ne pouvait donc ni partager « mon compte », ni revenir en
 * arrière, ni indexer quoi que ce soit. Chaque écran reçoit ici son chemin,
 * écrit au fur et à mesure de la navigation et relu au chargement :
 *
 *   /app                          l'accueil, la carte et les arrêts autour
 *   /app/mob/route                le planificateur d'itinéraire
 *   /app/mob/favorites            les arrêts et les trajets favoris
 *   /app/mob/settings             le compte et ses réglages
 *   /app/mob/settings/card        une carte de transport, au premier plan
 *
 * Les adresses des arrêts et des lignes, elles, restent en paramètres de
 * requête : elles désignent un contenu, pas un écran.
 *
 * Ces chemins disent où l'on est, ils ne disent pas où reprendre : rouvrir
 * l'application la ramène toujours à la carte, quelle que soit l'adresse
 * ouverte. C'est un repère de navigation, pas un état à restaurer.
 */

import { useEffect, useRef } from 'react';

export type MobileScreen = 'home' | 'route' | 'favorites' | 'account' | 'card';

const PATHS: Record<MobileScreen, string> = {
  home: '/app',
  route: '/app/mob/route',
  favorites: '/app/mob/favorites',
  account: '/app/mob/settings',
  card: '/app/mob/settings/card',
};

/** L'écran désigné par un chemin, ou `null` s'il n'en désigne aucun. */
export function screenFromPath(pathname: string): MobileScreen | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  const entry = (Object.entries(PATHS) as Array<[MobileScreen, string]>)
    .sort((a, b) => b[1].length - a[1].length)
    .find(([, value]) => path === value);
  return entry ? entry[0] : null;
}

/**
 * Écrit l'écran courant dans la barre d'adresse.
 *
 * `replaceState` et non `pushState` : la barre d'onglets n'est pas un
 * historique, et empiler une entrée par aller-retour entre deux onglets
 * rendrait le bouton « précédent » du navigateur inutilisable.
 *
 * Les paramètres de requête sont conservés : un arrêt ouvert reste ouvert quand
 * on passe d'un écran à l'autre.
 */
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
