import { tx } from '../i18n';
export function formatNotificationDay(value: string, language: 'fr' | 'en'): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const locale = tx(language === 'fr').notificationDay.locale;
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days < 7) return date.toLocaleDateString(locale, { weekday: 'long' });
  return date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
}
