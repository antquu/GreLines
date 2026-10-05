import { en } from './en';
import { fr, type Messages } from './fr';

export type { Messages };

export const messages: Record<'fr' | 'en', Messages> = { fr, en };

export function t(language: 'fr' | 'en'): Messages {
  return messages[language] ?? fr;
}

export function tx(isFrench: boolean): Messages {
  return isFrench ? fr : messages.en;
}
