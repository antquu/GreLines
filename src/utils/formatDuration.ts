export function formatMinutesCompact(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}h${String(rest).padStart(2, '0')}`;
}

export function formatDurationLabel(value: string): string {
  const minutes = Number(String(value).match(/\d+/)?.[0] || 0);
  return minutes > 0 ? formatMinutesCompact(minutes) : value;
}
