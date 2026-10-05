import { describe, expect, it } from 'vitest';
import { keepCatchable } from '../src/services/catchable';
import type { RouteItinerary } from '../src/services/api';

const MINUTE = 60_000;
const NOW = Date.UTC(2026, 9, 5, 10, 0);

function journey(walkMinutes: number, boardInMinutes: number): RouteItinerary {
  const board = NOW + boardInMinutes * MINUTE;
  const walkStart = board - walkMinutes * MINUTE;
  return {
    dep: '',
    arr: '',
    depName: 'A',
    arrName: 'B',
    dur: '',
    direction: '',
    lineKeys: ['20'],
    legs: [{ mode: 'BUS', routeShortName: '20' }],
    allLegs: [
      { mode: 'WALK', startTime: walkStart, endTime: board },
      { mode: 'BUS', routeShortName: '20', startTime: board, endTime: board + 20 * MINUTE },
    ],
    routePath: [],
  };
}

describe('keepCatchable', () => {
  it('keeps a journey that starts later unchanged', () => {
    const later = journey(5, 10);
    expect(keepCatchable([later], NOW)).toEqual([later]);
  });

  it('marks a journey as tight when a brisk walk is enough', () => {
    const [result] = keepCatchable([journey(8, 7)], NOW);
    expect(result.tight).toBe(true);
    expect(result.rush).toBeUndefined();
    expect(result.allLegs[0].startTime).toBe(NOW);
  });

  it('marks a journey as rush when only running catches the bus', () => {
    const [result] = keepCatchable([journey(8, 5)], NOW);
    expect(result.tight).toBe(true);
    expect(result.rush).toBe(true);
  });

  it('drops a bus that cannot be caught even running', () => {
    expect(keepCatchable([journey(8, 3)], NOW)).toEqual([]);
  });

  it('drops a journey boarding at the stop that already left', () => {
    const missed = journey(0, -2);
    missed.allLegs = missed.allLegs.slice(1);
    expect(keepCatchable([missed], NOW)).toEqual([]);
  });
});
