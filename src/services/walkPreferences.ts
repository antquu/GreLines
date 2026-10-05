import { tx } from '../i18n';
const STORAGE_KEY = 'greLines_walkPreferences';

export const WALK_SPEEDS = [
  { kmh: 3.0, label: (fr: boolean) => (tx(fr).walkPreferences.slow), emoji: '🐢' },
  { kmh: 3.6, label: (fr: boolean) => (tx(fr).walkPreferences.relaxed), emoji: '🚶' },
  { kmh: 4.0, label: (fr: boolean) => (tx(fr).walkPreferences.normal), emoji: '🥾' },
  { kmh: 4.3, label: (fr: boolean) => (tx(fr).walkPreferences.brisk), emoji: '👞' },
  { kmh: 5.0, label: (fr: boolean) => (tx(fr).walkPreferences.fast), emoji: '🏃' },
];

export const WALK_PRIORITIES = [
  {
    reluctance: 9,
    label: (fr: boolean) => (tx(fr).walkPreferences.asLittleAsPossible),
    hint: (fr: boolean) =>
      tx(fr).walkPreferences.preferWaitingOverWalking,
    emoji: '🚌',
  },
  {
    reluctance: 5,
    label: (fr: boolean) => (tx(fr).walkPreferences.balanced),
    hint: (fr: boolean) =>
      tx(fr).walkPreferences.letThePlannerDecide,
    emoji: '⚖️',
  },
  {
    reluctance: 3,
    label: (fr: boolean) => (tx(fr).walkPreferences.ifItIsFaster),
    hint: (fr: boolean) =>
      tx(fr).walkPreferences.suggestWalkingFirstWhen,
    emoji: '🚶',
  },
  {
    reluctance: 1.5,
    label: (fr: boolean) => (tx(fr).walkPreferences.happyToWalk),
    hint: (fr: boolean) =>
      tx(fr).walkPreferences.acceptLongWalks,
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
