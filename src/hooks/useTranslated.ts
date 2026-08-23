/**
 * Un texte du réseau, dans la langue de celui qui lit.
 *
 * Rend le texte français tant que la traduction n'est pas revenue, puis la
 * traduction dès qu'elle arrive. Jamais rien de vide, jamais d'attente : une
 * perturbation qu'on ne comprend qu'à moitié vaut mieux qu'un cadre gris.
 *
 * La demande part du composant qui affiche le texte, et de lui seul. C'est ce
 * qui garde la consommation raisonnable : le réseau publie des centaines de
 * perturbations, on en lit trois.
 */

import { useEffect, useState } from 'react';
import { cachedTranslation, requestTranslation, subscribeTranslations } from '../services/translation';

export function useTranslated(
  text: string | null | undefined,
  language: 'fr' | 'en',
  /**
   * La demande ne part que si le texte est réellement lu.
   *
   * L'écran Infotrafic monte trois cent soixante-neuf cartes d'un coup :
   * traduire les trois cent soixante-neuf titres au chargement consommerait le
   * quota d'une journée pour trois lignes lues. L'appelant dit donc quand il
   * est à l'écran, et le texte français reste affiché en attendant.
   */
  enabled: boolean = true,
): string {
  const source = String(text ?? '');
  const [, bump] = useState(0);

  useEffect(() => {
    if (!enabled || language === 'fr' || !source.trim()) return;
    requestTranslation(source, language);
    // Le composant se redessine quand une traduction arrive, quelle qu'elle
    // soit : elles arrivent par paquets, et un abonnement par texte coûterait
    // plus cher que le redessin.
    return subscribeTranslations(() => bump(n => n + 1));
  }, [source, language, enabled]);

  if (language === 'fr') return source;
  return cachedTranslation(source, language) ?? source;
}
