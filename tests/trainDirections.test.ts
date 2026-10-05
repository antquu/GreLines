import { describe, expect, it } from 'vitest';
import { trainDirections, type Fiche } from '../src/services/foreignTimetable';

const stop = (id: string, name: string) => ({ id, name });
const LPD = stop('OCE1', 'Lyon Part Dieu');
const AMB = stop('OCE2', 'Ambérieu-en-Bugey');
const AIX = stop('OCE3', 'Aix-les-Bains - Le Revard');
const RUM = stop('OCE4', 'Rumilly');
const ANN = stop('OCE5', 'Annecy');
const CHY = stop('OCE6', 'Chambéry - Challes-les-Eaux');

const fiche: Fiche = {
  firstDay: '20261005',
  days: 7,
  directions: [
    {
      headsign: 'Annecy',
      stops: [LPD, AMB, AIX, RUM, ANN],
      trips: [
        { d: 1, t: [480, 504, 556, 580, 600], i: '17970' },
        { d: 1, t: [480, 504, 556, 580, 600], i: '17970' },
        { d: 1, t: [600, 624, 676, 700, 720], i: '17974' },
      ],
    },
    {
      headsign: 'Aix-les-Bains - Le Revard',
      stops: [LPD, AMB, AIX],
      trips: [{ d: 1, t: [540, 564, 616], i: '17972' }],
    },
    {
      headsign: 'Chambéry - Challes-les-Eaux',
      stops: [LPD, CHY],
      trips: [{ d: 1, t: [700, 774], i: '17976' }],
    },
    {
      headsign: 'Lyon Part Dieu',
      stops: [ANN, RUM, AIX, AMB, LPD],
      trips: [{ d: 1, t: [420, 440, 464, 516, 540], i: '17961' }],
    },
  ],
};

describe('trainDirections', () => {
  const timetable = trainDirections('SNC:K23', fiche, 1)!;
  const toAnnecy = timetable.directions.find(direction => direction.headsign === 'Annecy')!;

  it('groups every run into two directions', () => {
    expect(timetable.directions.map(direction => direction.headsign).sort()).toEqual(['Annecy', 'Lyon Part Dieu']);
  });

  it('removes duplicated runs of the same train', () => {
    expect(toAnnecy.trips?.filter(trip => trip.label === '17970')).toHaveLength(1);
  });

  it('keeps short runs with their own terminus', () => {
    expect(toAnnecy.destinations).toEqual(
      expect.arrayContaining(['Annecy', 'Aix-les-Bains - Le Revard', 'Chambéry - Challes-les-Eaux']),
    );
  });

  it('orders stops along the journey', () => {
    const names = toAnnecy.stops.map(entry => entry.name);
    expect(names.indexOf('Lyon Part Dieu')).toBeLessThan(names.indexOf('Ambérieu-en-Bugey'));
    expect(names.indexOf('Aix-les-Bains - Le Revard')).toBeLessThan(names.indexOf('Rumilly'));
    expect(names.at(-1)).toBe('Annecy');
  });

  it('sorts trains by departure time', () => {
    expect(toAnnecy.trips?.map(trip => trip.label)).toEqual(['17970', '17972', '17974', '17976']);
  });
});
