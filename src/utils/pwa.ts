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

/**
 * Android, par deux chemins plutôt qu'un.
 *
 * La chaîne d'agent utilisateur seule ne suffit pas : quand on coche « Site
 * pour ordinateur » dans Chrome, elle perd la mention « Android » et se fait
 * passer pour un Linux de bureau. Le tutoriel d'installation bascule alors sur
 * celui d'iPhone, sur un téléphone qui n'en est pas un.
 *
 * `userAgentData.platform`, lui, continue d'annoncer « Android » dans ce
 * mode — c'est une propriété de l'appareil, pas de la façon dont il se
 * présente aux sites. On interroge donc les deux, et il suffit qu'un seul
 * réponde.
 */
export const isAndroidDevice = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } })
    .userAgentData?.platform;
  if (platform && /android/i.test(platform)) return true;
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
 * La version du tutoriel d'installation.
 *
 * À incrémenter chaque fois que le tutoriel change assez pour mériter d'être
 * remontré : nouvelles captures, nouvelle marche à suivre, plateforme ajoutée.
 * Ceux qui avaient déjà écarté la version précédente le reverront une fois, et
 * une seule.
 *
 *   1 — tutoriel Safari seul, quatre captures, pas de guide Android.
 *   2 — captures refaites, tutoriel Android ajouté, détection automatique.
 */
export const INSTALL_GUIDE_VERSION = 2;

const INSTALL_GUIDE_SEEN_KEY = 'greLines_installGuideSeenVersion';
/** L'ancien drapeau, un simple « oui ». Il valait pour la version 1. */
const INSTALL_GUIDE_LEGACY_KEY = 'greLines_installGuideDismissed';

/** La dernière version écartée sur cet appareil, ou 0 si le tutoriel n'a jamais été vu. */
function seenInstallGuideVersion(): number {
  try {
    const raw = localStorage.getItem(INSTALL_GUIDE_SEEN_KEY);
    if (raw !== null) {
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    // Personne n'a de numéro de version avant cette mise à jour : l'ancien
    // drapeau dit seulement qu'on a vu le tutoriel d'alors, c'est-à-dire le 1.
    return localStorage.getItem(INSTALL_GUIDE_LEGACY_KEY) === 'true' ? 1 : 0;
  } catch {
    // Stockage refusé : on considère le tutoriel comme jamais vu plutôt que de
    // le masquer à quelqu'un qui ne l'a peut-être jamais eu.
    return 0;
  }
}

/** Vrai quand la version actuelle du tutoriel a déjà été écartée. */
export const hasSeenInstallGuide = (): boolean =>
  seenInstallGuideVersion() >= INSTALL_GUIDE_VERSION;

/**
 * Vrai quand le tutoriel revient parce qu'il a changé, et non parce qu'on ne
 * l'a jamais vu. La nuance décide de l'insistance : une nouveauté s'annonce une
 * fois, alors qu'un tutoriel jamais vu se represente tant qu'on ne l'a pas
 * écarté.
 */
export const isInstallGuideUpdate = (): boolean => {
  const seen = seenInstallGuideVersion();
  return seen > 0 && seen < INSTALL_GUIDE_VERSION;
};

/** Note la version actuelle comme vue. L'ancien drapeau ne sert plus à rien. */
export const markInstallGuideSeen = (): void => {
  try {
    localStorage.setItem(INSTALL_GUIDE_SEEN_KEY, String(INSTALL_GUIDE_VERSION));
    localStorage.removeItem(INSTALL_GUIDE_LEGACY_KEY);
  } catch {
    // Stockage refusé : le tutoriel se representera au prochain lancement.
  }
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
