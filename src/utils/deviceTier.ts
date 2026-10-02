export type DeviceTier = 'low' | 'medium' | 'high';

function readSpecs(): { cores: number; memory: number | null; dpr: number } {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 0 : 0;
  const memory =
    typeof navigator !== 'undefined'
      ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null
      : null;
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return { cores, memory, dpr };
}

export function detectDeviceTier(): DeviceTier {
  const { cores, memory } = readSpecs();
  if (!cores) return 'medium';

  if (cores >= 8 && (memory === null || memory >= 8)) return 'high';
  if (cores >= 4 && (memory === null || memory >= 4)) return 'medium';
  return 'low';
}

export function mapPixelRatio(tier: DeviceTier = detectDeviceTier()): number {
  const { dpr } = readSpecs();
  if (tier === 'high') return Math.min(Math.max(dpr, 2), 3);
  if (tier === 'medium') return Math.min(dpr, 2);
  return Math.min(dpr, 1.5);
}
