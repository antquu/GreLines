/*
 * L'ancienne demande de notifications ne s'ouvre plus d'elle-même : la mise en
 * route du premier lancement l'a reprise, avec la carte et le compte — voir
 * `utils/onboarding`. L'écran, lui, existe toujours : les réglages le rouvrent
 * pour qui veut y revenir. Il ne reste ici que la marque qui l'empêche de
 * réapparaître.
 */

const STORAGE_KEY = 'greLines_mobileNotificationPromptDismissed_v1';

export function markMobileNotificationPromptDismissed(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'true');
  } catch {
  }
}
