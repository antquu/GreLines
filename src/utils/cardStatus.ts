import { cardBlockedBy, type OuraCard } from '../services/ouraCard';
import { tx } from '../i18n';

export function cardStatusLabel(card: OuraCard, language: 'fr' | 'en'): string | null {
  const isFr = language === 'fr';
  switch (cardBlockedBy(card)) {
    case 'grelines':
    case 'network':
      return tx(isFr).cardStatus.disabled;
    case 'expired':
      return tx(isFr).cardStatus.expired;
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
      return tx(isFr).cardStatus.thisCardWasDisabled;
    case 'network':
      return tx(isFr).cardStatus.thisCardWasDisabled2;
    case 'expired':
      return tx(isFr).cardStatus.thePassOnThis;
    default:
      return null;
  }
}
