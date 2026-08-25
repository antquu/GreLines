/**
 * La configuration du premier lancement.
 *
 * L'application installée sur l'écran d'accueil ouvrait, au bout d'une seconde,
 * une demande de notifications en plein écran — une seule question, sortie de
 * nulle part, avant même qu'on ait vu à quoi ressemblait l'application. On y
 * répondait « plus tard » par réflexe, et le reste de la mise en route — la
 * carte OURA, le compte — n'était jamais proposé : il fallait aller le chercher
 * dans les réglages, ce que personne ne fait.
 *
 * C'est maintenant un parcours : les notifications, la carte, le compte, dans
 * cet ordre, chacun sur son écran et chacun passable. Il ne se montre qu'une
 * fois, et seulement dans l'application installée — dans un navigateur, on est
 * peut-être venu consulter un horaire en passant, et l'on n'a rien à
 * configurer pour ça.
 */

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

/**
 * Le parcours est fait, ou refusé.
 *
 * Marqué à l'ouverture et non à la fin : quelqu'un qui referme l'application au
 * deuxième écran ne doit pas retrouver le parcours au lancement suivant. Ce
 * qu'il n'a pas configuré reste accessible dans les réglages, et l'on ne
 * repose pas deux fois une question à laquelle on a déjà tourné le dos.
 */
export function markOnboardingDone(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'true');
  } catch {
  }
}
