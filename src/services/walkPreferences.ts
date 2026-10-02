const STORAGE_KEY = 'greLines_walkPreferences';

export const WALK_SPEEDS = [
  { kmh: 3.0, label: (fr: boolean) => (fr ? 'Lente' : 'Slow'), emoji: '🐢' },
  { kmh: 3.6, label: (fr: boolean) => (fr ? 'Tranquille' : 'Relaxed'), emoji: '🚶' },
  { kmh: 4.0, label: (fr: boolean) => (fr ? 'Normale' : 'Normal'), emoji: '🥾' },
  { kmh: 4.3, label: (fr: boolean) => (fr ? 'Dynamique' : 'Brisk'), emoji: '👞' },
  { kmh: 5.0, label: (fr: boolean) => (fr ? 'Rapide' : 'Fast'), emoji: '🏃' },
];

export const WALK_PRIORITIES = [
  {
    reluctance: 9,
    label: (fr: boolean) => (fr ? 'Le moins possible' : 'As little as possible'),
    hint: (fr: boolean) =>
      fr ? 'Préférer attendre plutôt que marcher' : 'Prefer waiting over walking',
    emoji: '🚌',
  },
  {
    reluctance: 5,
    label: (fr: boolean) => (fr ? 'Équilibrée' : 'Balanced'),
    hint: (fr: boolean) =>
      fr ? 'Laisser le calculateur trancher' : 'Let the planner decide',
    emoji: '⚖️',
  },
  {
    reluctance: 3,
    label: (fr: boolean) => (fr ? "Si c'est plus rapide" : 'If it is faster'),
    hint: (fr: boolean) =>
      fr
        ? "Suggérer la marche en premier si c'est plus rapide qu'en transport"
        : 'Suggest walking first when it beats transit',
    emoji: '🚶',
  },
  {
    reluctance: 1.5,
    label: (fr: boolean) => (fr ? 'Marcher volontiers' : 'Happy to walk'),
    hint: (fr: boolean) =>
      fr ? 'Accepter de longs trajets à pied' : 'Accept long walks',
    emoji: '🥾',
  },
];

export interface WalkPreferences {
  speedIndex: number;
  priorityIndex: number;
}

const DEFAULTS: WalkPreferences = { speedIndex: 2, priorityIndex: 1 };

function clamp(value: unknown, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > max) return fallback;
  return n;
}

export function loadWalkPreferences(): WalkPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return {
      speedIndex: clamp(parsed?.speedIndex, WALK_SPEEDS.length - 1, DEFAULTS.speedIndex),
      priorityIndex: clamp(
        parsed?.priorityIndex,
        WALK_PRIORITIES.length - 1,
        DEFAULTS.priorityIndex
      ),
    };
  } catch {
    return DEFAULTS;
  }
}

export function saveWalkPreferences(preferences: WalkPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
  }
}

export function walkSpeedMs(preferences: WalkPreferences): number {
  return (WALK_SPEEDS[preferences.speedIndex]?.kmh ?? 4) / 3.6;
}

export function walkReluctance(preferences: WalkPreferences): number {
  return WALK_PRIORITIES[preferences.priorityIndex]?.reluctance ?? 5;
}
