export const isStandaloneApp = (): boolean => {
  if (typeof window === 'undefined') return false;
  const matchesDisplayMode = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return matchesDisplayMode || iosStandalone;
};

export const isIOSDevice = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod/.test(ua) || iPadOS;
};

export const isAndroidDevice = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } })
    .userAgentData?.platform;
  if (platform && /android/i.test(platform)) return true;
  return /Android/i.test(navigator.userAgent);
};

export const isMobileDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (isIOSDevice() || isAndroidDevice()) return true;
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  return coarsePointer && window.innerWidth < 1024;
};

export const INSTALL_GUIDE_VERSION = 2;

const INSTALL_GUIDE_SEEN_KEY = 'greLines_installGuideSeenVersion';
const INSTALL_GUIDE_LEGACY_KEY = 'greLines_installGuideDismissed';

function seenInstallGuideVersion(): number {
  try {
    const raw = localStorage.getItem(INSTALL_GUIDE_SEEN_KEY);
    if (raw !== null) {
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return localStorage.getItem(INSTALL_GUIDE_LEGACY_KEY) === 'true' ? 1 : 0;
  } catch {
    return 0;
  }
}

export const hasSeenInstallGuide = (): boolean =>
  seenInstallGuideVersion() >= INSTALL_GUIDE_VERSION;

export const isInstallGuideUpdate = (): boolean => {
  const seen = seenInstallGuideVersion();
  return seen > 0 && seen < INSTALL_GUIDE_VERSION;
};

export const markInstallGuideSeen = (): void => {
  try {
    localStorage.setItem(INSTALL_GUIDE_SEEN_KEY, String(INSTALL_GUIDE_VERSION));
    localStorage.removeItem(INSTALL_GUIDE_LEGACY_KEY);
  } catch {
  }
};

export const canShowInstallGuide = (): boolean => !isStandaloneApp();

export const shouldAutoOpenInstallGuide = (): boolean =>
  isMobileDevice() && !isStandaloneApp();
