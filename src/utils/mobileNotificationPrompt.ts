import { isMobileDevice, isStandaloneApp } from './pwa';
import { notificationPermission } from '../services/tripNotifications';

const STORAGE_KEY = 'greLines_mobileNotificationPromptDismissed_v1';

export function shouldAutoOpenMobileNotificationPrompt(): boolean {
  if (typeof window === 'undefined') return false;
  if (!isMobileDevice() || !isStandaloneApp()) return false;
  if (notificationPermission() !== 'default') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'true';
  } catch {
    return true;
  }
}

export function markMobileNotificationPromptDismissed(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'true');
  } catch {
    // Si le stockage est indisponible, on laissera le navigateur décider.
  }
}
