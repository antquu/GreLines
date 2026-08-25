/**
 * Ce qu'on dit d'une carte qui ne vaut plus.
 *
 * Le porteur a besoin de savoir qui l'a coupée : chez nous, elle se rouvre d'un
 * clic ; chez le réseau, il faut aller le voir. Une carte périmée, elle, n'a été
 * coupée par personne — elle a simplement fait son temps.
 */

import { cardBlockedBy, type OuraCard } from '../services/ouraCard';

/** La mention portée par la carte elle-même : courte, elle tient dans un coin. */
export function cardStatusLabel(card: OuraCard, language: 'fr' | 'en'): string | null {
  const isFr = language === 'fr';
  switch (cardBlockedBy(card)) {
    case 'grelines':
    case 'network':
      return isFr ? 'Désactivée' : 'Disabled';
    case 'expired':
      return isFr ? 'Expirée' : 'Expired';
    default:
      return null;
  }
}

/**
 * La phrase qu'on lit quand on ouvre la carte : qui l'a coupée, et ce qu'on ne
 * peut plus faire avec. Coupée par le réseau, elle ne fait plus voyager ;
 * coupée par nous, elle ne peut plus entrer dans un portefeuille.
 */
/**
 * Le code de l'incident, à donner tel quel au guichet ou au support.
 *
 * Il dit deux choses : qui a agi — nous ou le réseau — et s'il s'agit d'une
 * suppression ou d'une simple désactivation. Quatre cas, quatre codes.
 */
export function cardStatusCode(card: OuraCard): string | null {
  if (card.isMissing) return 'DEL_GRELINES';
  if (card.isDisabled) return 'DES_GRELINES';
  if (card.isNetworkMissing) return 'DEL_MRESO';
  if (card.isBlacklisted || card.isLocked || card.isInvalid) return 'DES_MRESO';
  return null;
}

export function cardStatusSentence(card: OuraCard, language: 'fr' | 'en'): string | null {
  const isFr = language === 'fr';
  switch (cardBlockedBy(card)) {
    case 'grelines':
      return isFr
        ? "Cette carte a été désactivée par GreLines. Elle ne permet plus de l'intégrer à GreLines."
        : 'This card was disabled by GreLines. It can no longer be added to GreLines.';
    case 'network':
      return isFr
        ? 'Cette carte a été désactivée par M réso. Elle ne permet plus de voyager.'
        : 'This card was disabled by M réso. It no longer allows travel.';
    case 'expired':
      return isFr
        ? "L'abonnement de cette carte est expiré. Elle ne permet plus de voyager."
        : 'The pass on this card has expired. It no longer allows travel.';
    default:
      return null;
  }
}
