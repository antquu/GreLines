import { tx } from '../i18n';

export function formatTrafficEnd(raw: string, language: 'fr' | 'en'): string | null {
  const text = raw.trim();
  if (!text) return null;
  const frenchDate = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  const date = frenchDate
    ? new Date(Number(frenchDate[3]), Number(frenchDate[2]) - 1, Number(frenchDate[1]), Number(frenchDate[4] ?? 0), Number(frenchDate[5] ?? 0))
    : new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  if (date.getFullYear() - new Date().getFullYear() > 3) return null;
  const locale = tx(language === 'fr').popupOverlay.locale;
  const day = date.toLocaleDateString(locale, { day: 'numeric', month: 'long' });
  const time = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  return tx(language === 'fr').popupOverlay.dayAtTime(day, time);
}
