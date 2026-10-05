import { describe, expect, it } from 'vitest';
// @ts-expect-error plain js module without types
import { platformGroups } from '../scripts/lib/stations.mjs';

type Platform = { id: string; lat: number; lon: number };

const velodrome: Platform[] = [
  { id: 'TRCAL0', lat: 48.6661709, lon: 6.1660761 },
  { id: 'TRCAL1', lat: 48.6660329, lon: 6.1658511 },
  { id: 'VALOD2', lat: 48.6665469, lon: 6.1667381 },
  { id: 'VALOD4', lat: 48.6659759, lon: 6.1666311 },
];
const busLines = new Set(['5', '7', '17', '30']);
const linesOfStop = new Map<string, Set<string>>([
  ['TRCAL0', new Set(['1'])],
  ['TRCAL1', new Set(['1'])],
  ['VALOD2', busLines],
  ['VALOD4', busLines],
]);
const ids = (groups: Platform[][]) => groups.map(group => group.map(stop => stop.id).sort());

describe('platformGroups', () => {
  it('splits a station whose platforms serve different lines far apart', () => {
    const split = platformGroups(velodrome, linesOfStop);
    expect(ids(split.groups)).toEqual([['TRCAL0', 'TRCAL1'], ['VALOD2', 'VALOD4']]);
  });

  it('separates every distant platform when the network asks for it', () => {
    const split = platformGroups(velodrome, linesOfStop, { separateStops: true });
    expect(split.groups).toHaveLength(3);
  });

  it('keeps both directions of the same lines together', () => {
    const buses = velodrome.filter(stop => stop.id.startsWith('VALOD'));
    expect(platformGroups(buses, linesOfStop)).toBeNull();
  });

  it('keeps close platforms together even with different lines', () => {
    const close = [
      { id: 'A', lat: 45.0, lon: 5.0 },
      { id: 'B', lat: 45.0001, lon: 5.0001 },
    ];
    const lines = new Map([['A', new Set(['1'])], ['B', new Set(['2'])]]);
    expect(platformGroups(close, lines)).toBeNull();
  });
});
