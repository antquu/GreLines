const STORAGE_KEY = 'greLines_mobileNotificationPromptDismissed_v1';

export function markMobileNotificationPromptDismissed(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'true');
  } catch {
  }
}
