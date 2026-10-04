import type { Departure, Line, StopDetail } from '../types';

const NIGHT_WORKS_A =
  "à partir du 05/10/2026 22:00|jusqu'au 23/10/2026 02:00\r\nEn soirée, à partir de 22h,\nla ligne A ne circule pas entre les stations Gares et La Poya en raison de travaux de nuit.\nDes bus relais effectuent la liaison entre les stations non desservies. \nÀ noter que la station Saint-Bruno n'est pas desservie par les bus relais.\nL'arrêt Les Fontainades Le Vog est déplacé rue de la Liberté.\nRetrouvez le plan détaillé du Bus relais et les arrêts de report en téléchargement sur reso-m.fr/trafic.\nÀ noter qu'aucun achat de titre de transport n'est possible dans les bus relais, pensez à privilégier le ticket par carte bancaire ou l'achat sur un distributeur en station.";

const NIGHT_WORKS_E =
  "à partir du 05/10/2026 21:00|jusqu'au 09/10/2026 02:00\r\nEn soirée, à partir de 21h,\nla ligne E ne circule pas entre les stations Louise Michel et Palluel en raison de travaux de nuit.\nDes bus relais effectuent la liaison entre les stations non desservies. \nRetrouvez le plan détaillé du Bus relais et les arrêts de report en téléchargement sur reso-m.fr/trafic.\nÀ noter qu'aucun achat de titre de transport n'est possible dans les bus relais, pensez à privilégier le ticket par carte bancaire ou l'achat sur un distributeur en station.";

const LINES: Line[] = [
  { id: 'C1', routeId: 'SEM:C1', name: "Grenoble Cité Jean Macé / Montbonnot-Saint-Martin Pré de l'Eau", shortName: 'C1', type: 'CHRONO', color: 'F5D24D', hasTraffic: false, trafficDetails: [] },
  { id: 'C4', routeId: 'SEM:C4', name: 'Grenoble Victor Hugo / Eybens Le Verderet', shortName: 'C4', type: 'CHRONO', color: 'F5D24D', hasTraffic: false, trafficDetails: [] },
  { id: '18', routeId: 'SEM:18', name: 'Meylan Lycée du Grésivaudan / Poisat Cimetière Intercommunal', shortName: '18', type: 'PROXIMO', color: '33A457', hasTraffic: false, trafficDetails: [] },
  {
    id: 'A', routeId: 'SEM:A', name: "Fontaine La Poya / Le Pont-de-Claix L'Étoile", shortName: 'A', type: 'TRAM', color: '3376B8', hasTraffic: true,
    trafficDetails: [{ titre: 'travaux de nuit', description: NIGHT_WORKS_A, dateFin: '23/10/2026 02:00', listeLigne: 'SEM_A' }],
  },
  { id: 'C', routeId: 'SEM:C', name: "Seyssins Le Prisme / Saint-Martin-d'Hères Université – Condillac", shortName: 'C', type: 'TRAM', color: 'C20078', hasTraffic: false, trafficDetails: [] },
  {
    id: 'E', routeId: 'SEM:E', name: 'Fontanil-Cornillon Palluel / Grenoble Louise Michel', shortName: 'E', type: 'TRAM', color: '533786', hasTraffic: true,
    trafficDetails: [{ titre: 'travaux de nuit', description: NIGHT_WORKS_E, dateFin: '09/10/2026 02:00', listeLigne: 'SEM_E' }],
  },
  { id: 'NAVA', routeId: 'SEM:NAVA', name: "Fontaine La Poya / Le Pont-de-Claix L'Étoile", shortName: 'NAVA', type: 'NAVETTE', color: '3376B8', hasTraffic: false, trafficDetails: [] },
  { id: 'NAVC', routeId: 'SEM:NAVC', name: "Seyssins Le Prisme / Saint-Martin-d'Hères Université – Condillac", shortName: 'NAVC', type: 'NAVETTE', color: 'C20078', hasTraffic: false, trafficDetails: [] },
  { id: 'C11', routeId: 'SE2:C11', name: 'Voiron - Grenoble - Lumbin', shortName: 'C11', type: 'CHRONO_PERI', color: 'EF7C00', hasTraffic: false, trafficDetails: [] },
  { id: 'C12', routeId: 'SE2:C12', name: 'Voiron Champfeuillet / Goncelin Gare', shortName: 'C12', type: 'CHRONO_PERI', color: 'EF7C00', hasTraffic: false, trafficDetails: [] },
  {
    id: '84', routeId: 'SE2:84', name: 'Le Touvet - Crolles - Grenoble', shortName: '84', type: 'PROXIMO', color: '1E71B8', hasTraffic: true,
    trafficDetails: [
      { titre: 'brocante Le Touvet', description: "à partir du 04/10/2026 04:00|jusqu'au 05/10/2026 02:00\r\nLa ligne 84 est déviée en direction de Gare Routière  entre les arrêts Grandes Terres et La Frette  en raison d'une brocante secteur Le Touvet.", dateFin: '05/10/2026 02:00', listeLigne: 'SE2_84' },
      { titre: 'marché La Terrasse', description: "à partir du 04/10/2026 04:00|jusqu'au 05/10/2026 02:00\r\nLa ligne 84 est déviée  entre les arrêts Institut et Le Carré  en raison d'un marché secteur La Terrasse.", dateFin: '05/10/2026 02:00', listeLigne: 'SE2_84' },
    ],
  },
  { id: 'T83', routeId: 'C38:T83', name: 'CHAMBERY-CHAPAREILLAN-GRENOBLE', shortName: 'T83', type: 'C38_AUTRE', color: '009bdc', hasTraffic: false, trafficDetails: [] },
  { id: 'E01', routeId: 'SNC:E01', name: 'RE Chamonix / Grenoble', shortName: 'E01', type: 'RAIL', color: '004da3', hasTraffic: false, trafficDetails: [] },
  { id: 'E02', routeId: 'SNC:E02', name: 'RE Evian / Grenoble', shortName: 'E02', type: 'RAIL', color: '004da3', hasTraffic: false, trafficDetails: [] },
  { id: 'E08', routeId: 'SNC:E08', name: 'RE Modane / Grenoble', shortName: 'E08', type: 'RAIL', color: '004da3', hasTraffic: false, trafficDetails: [] },
  { id: 'E09', routeId: 'SNC:E09', name: 'RE Bourg-St-Maurice / Grenoble', shortName: 'E09', type: 'RAIL', color: '004da3', hasTraffic: false, trafficDetails: [] },
] as Line[];

type Row = [string, string, number, boolean, Departure['type'], Departure['occupancy']?, boolean?];

const ROWS: Row[] = [
  ['A', "Le Pont-de-Claix, L'Étoile", 5, true, 'TRAM', 'LIGHT'],
  ['A', 'Fontaine, La Poya', 7, true, 'TRAM', 'LIGHT'],
  ['A', "Grenoble, Grand'place", 562, false, 'TRAM', undefined, true],
  ['A', "Le Pont-de-Claix, L'Étoile", 13, true, 'TRAM', 'EMPTY'],
  ['A', 'Fontaine, La Poya', 11, true, 'TRAM', 'LIGHT'],
  ['A', "Le Pont-de-Claix, L'Étoile", 20, true, 'TRAM', 'EMPTY'],
  ['A', 'Fontaine, La Poya', 20, true, 'TRAM', 'LIGHT'],
  ['C', 'Seyssins, Le Prisme', 1, true, 'TRAM', 'LIGHT'],
  ['C', "Saint-Martin-d'Hères, Université – Condillac", 4, true, 'TRAM', 'CROWDED'],
  ['C', 'Gières, Plaine des Sports', 28, false, 'TRAM', undefined, true],
  ['C', 'Seyssins, Le Prisme', 12, true, 'TRAM', 'LIGHT'],
  ['C', "Saint-Martin-d'Hères, Université – Condillac", 13, true, 'TRAM', 'CROWDED'],
  ['C', 'Seyssins, Le Prisme', 22, true, 'TRAM', 'LIGHT'],
  ['C', "Saint-Martin-d'Hères, Université – Condillac", 25, true, 'TRAM', 'CROWDED'],
  ['E', 'Fontanil-Cornillon, Palluel', 32, false, 'TRAM', undefined, true],
  ['E', 'Grenoble, Louise Michel', 9, true, 'TRAM', 'MODERATE'],
  ['E', 'Grenoble, Louise Michel', 19, true, 'TRAM', 'MODERATE'],
  ['C1', "Montbonnot-Saint-Martin, Pré de l'Eau", 11, true, 'BUS', 'MODERATE'],
  ['C1', 'Grenoble, Cité Jean Macé', 12, true, 'BUS', 'MODERATE'],
  ['C1', "Montbonnot-Saint-Martin, Pré de l'Eau", 23, true, 'BUS', 'MODERATE'],
  ['C1', 'Grenoble, Cité Jean Macé', 24, true, 'BUS', 'MODERATE'],
  ['C4', 'Eybens, Le Verderet', 3, true, 'BUS', 'LIGHT'],
  ['C4', 'Grenoble, Victor Hugo', 6, true, 'BUS', 'CROWDED'],
  ['C4', 'Grenoble, Victor Hugo', 17, true, 'BUS', 'CROWDED'],
  ['C4', 'Eybens, Le Verderet', 18, true, 'BUS', 'LIGHT'],
  ['C4', 'Eybens, Le Verderet', 28, true, 'BUS', 'LIGHT'],
  ['C11', 'Lumbin, Longs Prés', 3, true, 'BUS', 'LIGHT'],
  ['C11', 'Voiron, Voiron Gare Routière Sud', 53, false, 'BUS', 'LIGHT'],
  ['C12', 'Voiron, Champfeuillet', 27, true, 'BUS', 'EMPTY'],
  ['C12', 'Goncelin, Goncelin Gare', 58, false, 'BUS', 'LIGHT'],
  ['18', 'Poisat, Cimetière Intercommunal', 9, true, 'BUS', 'EMPTY'],
  ['18', 'Meylan, Lycée du Grésivaudan', 11, true, 'BUS', 'LIGHT'],
  ['18', 'Poisat, Cimetière Intercommunal', 29, true, 'BUS', 'EMPTY'],
  ['18', 'Meylan, Lycée du Grésivaudan', 30, true, 'BUS', 'LIGHT'],
  ['84', 'Le Touvet, Grandes Terres', 120, false, 'BUS', 'LIGHT'],
  ['84', 'Grenoble, Gare Routière', 258, false, 'BUS', 'MODERATE'],
  ['84', 'Le Touvet, Grandes Terres', 180, false, 'BUS', 'LIGHT'],
  ['T83', 'Chambéry, Gare Routiere', 154, false, 'BUS', 'EMPTY'],
  ['T83', 'Grenoble, Gare Routiere', 247, false, 'BUS', 'CROWDED'],
];

export function chavantDepartures(): Departure[] {
  return ROWS.map(([lineId, destination, departureTime, realtime, type, occupancy, theoretical]) => ({
    lineId,
    lineName: '',
    lineShortName: lineId,
    destination,
    departureTime,
    realtime,
    type,
    ...(occupancy ? { occupancy } : {}),
    ...(theoretical ? { theoretical: true } : {}),
  }));
}

export function chavantStop(): StopDetail {
  return {
    id: 'SEM:CHV',
    name: 'Chavant',
    lat: 45.18455,
    lon: 5.73198,
    city: 'Grenoble',
    clusterGtfsId: 'SEM:GENCHV',
    lines: LINES.map(line => ({ ...line, trafficDetails: [...(line.trafficDetails ?? [])] })),
    departures: chavantDepartures(),
    lastUpdate: new Date(),
  } as StopDetail;
}
