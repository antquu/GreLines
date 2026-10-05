import { describe, expect, it } from 'vitest';
import { buildStopSearchIndex, matchStops } from '../src/utils/stopCatalog';
import type { Stop } from '../src/types';

const stop = (id: string, name: string, lat: number, lon: number, city = ''): Stop => ({ id, name, lat, lon, city });
const fromGrenoble = (lat: number, lon: number) => Math.hypot((lat - 45.1885) * 111, (lon - 5.7245) * 78);

const stops = [
  stop('A', 'Pharmacie', 46.34, 2.6, 'Montluçon'),
  stop('B', 'Faculté de Pharmacie', 45.2, 5.77, 'Meylan'),
  stop('C', 'Gares', 45.1913, 5.7146, 'Grenoble'),
  stop('D', 'Pharmacie', 45.19, 5.73, 'Grenoble'),
];
const index = buildStopSearchIndex(stops);

describe('matchStops', () => {
  it('puts nearby stops first, exact names first among them', () => {
    expect(matchStops(index, 'pharmacie', fromGrenoble, 10).map(item => item.id)).toEqual(['D', 'B', 'A']);
  });

  it('matches by city too', () => {
    expect(matchStops(index, 'meylan', fromGrenoble, 10).map(item => item.id)).toEqual(['B']);
  });

  it('respects the limit and ignores blank queries', () => {
    expect(matchStops(index, 'pharmacie', fromGrenoble, 1)).toHaveLength(1);
    expect(matchStops(index, '   ', fromGrenoble, 10)).toEqual([]);
  });
});
