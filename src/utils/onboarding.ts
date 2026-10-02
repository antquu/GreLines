import { isMobileDevice, isStandaloneApp } from './pwa';

const STORAGE_KEY = 'greLines_onboarding_v1';

export function shouldRunOnboarding(): boolean {
  if (typeof window === 'undefined') return false;
  if (!isMobileDevice() || !isStandaloneApp()) return false;
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'true';
  } catch {
    return true;
  }
}

export function markOnboardingDone(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'true');
  } catch {
  }
}
