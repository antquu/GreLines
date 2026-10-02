import { cardBlockedBy, type OuraCard } from '../services/ouraCard';

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
