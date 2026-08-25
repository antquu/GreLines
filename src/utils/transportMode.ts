export type TransportMode = 'BUS' | 'TRAM' | 'RAIL' | 'METRO' | 'OTHER';

export function normalizeMode(value: string | undefined | null): TransportMode {
  const raw = String(value ?? '').toUpperCase();
  
  if (raw.includes('METRO') || raw.includes('SUBWAY')) return 'METRO';
  if (raw.includes('RAIL') || raw.includes('TRAIN')) return 'RAIL';
  if (raw.includes('TRAM') || raw.includes('FUNICULAR') || raw.includes('CABLE') || raw.includes('GONDOLA')) {
    return 'TRAM';
  }
  if (raw.includes('BUS') || raw.includes('COACH')) return 'BUS';
  return 'OTHER';
}
