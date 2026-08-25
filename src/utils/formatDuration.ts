/**
 * Une durée, écrite comme on la dit.
 *
 * « 90 min » ne se prononce pas : au-delà de l'heure on compte en heures, et
 * l'on écrit « 1h30 ». En deçà, la minute suffit.
 */
export function formatMinutesCompact(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}h${String(rest).padStart(2, '0')}`;
}

/** La même chose à partir d'un libellé du calculateur (« 34 min »). */
export function formatDurationLabel(value: string): string {
  const minutes = Number(String(value).match(/\d+/)?.[0] || 0);
  return minutes > 0 ? formatMinutesCompact(minutes) : value;
}
