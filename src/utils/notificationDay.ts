/**
 * Le jour d'une notification, dit comme on le dirait.
 *
 * Le nom du jour tant qu'il est dans la semaine écoulée — « jeudi » se situe
 * sans effort —, la date au-delà, où le nom ne veut plus rien dire.
 */
export function formatNotificationDay(value: string, language: 'fr' | 'en'): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const locale = language === 'fr' ? 'fr-FR' : 'en-GB';
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days < 7) return date.toLocaleDateString(locale, { weekday: 'long' });
  return date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
}
