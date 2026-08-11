/**
 * Détection « application installée sur l'écran d'accueil ».
 *
 * Deux signaux complémentaires :
 *  - `display-mode: standalone` (norme PWA, Android + iOS récents) ;
 *  - `navigator.standalone` (héritage Safari iOS, toujours le seul fiable
 *    quand la page est lancée depuis une icône ajoutée à l'écran d'accueil).
 */
export const isStandaloneApp = (): boolean => {
  if (typeof window === 'undefined') return false;
  // Uniquement `standalone` : `minimal-ui` et `fullscreen` peuvent matcher dans
  // un navigateur ordinaire et feraient disparaître le tutoriel à tort.
  const matchesDisplayMode = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return matchesDisplayMode || iosStandalone;
};

export const isIOSDevice = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ se présente comme un Mac : on le distingue par le tactile.
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod/.test(ua) || iPadOS;
};

export const isAndroidDevice = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
};

/** Téléphone ou tablette : c'est la seule cible du tutoriel d'installation. */
export const isMobileDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (isIOSDevice() || isAndroidDevice()) return true;
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  return coarsePointer && window.innerWidth < 1024;
};

/**
 * Entrée « installer l'app » des réglages : visible partout sauf quand
 * l'application tourne déjà depuis l'écran d'accueil. Volontairement sans
 * condition de mobile — si la détection d'appareil se trompe, l'utilisateur
 * garde un accès au tutoriel.
 */
export const canShowInstallGuide = (): boolean => !isStandaloneApp();

/**
 * Ouverture automatique au lancement : réservée aux mobiles hors application
 * installée, pour ne pas interrompre une session sur ordinateur.
 */
export const shouldAutoOpenInstallGuide = (): boolean =>
  isMobileDevice() && !isStandaloneApp();
