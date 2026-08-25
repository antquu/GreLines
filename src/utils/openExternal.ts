/**
 * Ouverture d'un site tiers.
 *
 * Installée sur l'écran d'accueil, l'application tourne sans barre d'adresse :
 * une page ouverte au même endroit y reste prisonnière — pas de bouton retour,
 * pas d'URL visible, et la session de paiement du fournisseur se perd au
 * moindre changement d'onglet. On demande donc explicitement une navigation
 * sortante, ce que les navigateurs interprètent comme « ouvre ça dehors ».
 */

/** L'application tourne-t-elle en mode installé (PWA) ? */
export function isStandaloneApp(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    window.matchMedia?.('(display-mode: fullscreen)').matches === true ||
    window.matchMedia?.('(display-mode: minimal-ui)').matches === true ||
    iosStandalone === true
  );
}

export function openExternal(url: string): void {
  if (typeof window === 'undefined') return;

  if (isStandaloneApp()) {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer external';
    document.body.appendChild(link);
    link.click();
    link.remove();
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}
