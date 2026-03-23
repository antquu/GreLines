export interface Stop {
  id: string;
  name: string;
  lat: number;
  lon: number;
  city?: string;
  clusterGtfsId?: string; // e.g., "ENGENIER" for API calls
}

export interface TrafficDetail {
  titre: string;
  description: string;
  dateFin: string;
  listeLigne: string;
}

export interface Line {
  id: string;
  name: string;
  type: 'BUS' | 'TRAM' | 'OTHER';
  shortName?: string;
  color?: string;
  textColor?: string;
  hasTraffic?: boolean;
  trafficDetails?: TrafficDetail[];
}

export interface Departure {
  lineId: string;
  lineName: string;
  lineShortName?: string;
  destination: string;
  departureTime: number; // Minutes until departure
  realtime: boolean;
  type: 'BUS' | 'TRAM' | 'OTHER';
  occupancy?: 'EMPTY' | 'LIGHT' | 'MODERATE' | 'CROWDED'; // Occupancy level (LIGHT=1 icon, MODERATE=2, CROWDED=3)
}

export interface StopDetail extends Stop {
  lines: Line[];
  departures: Departure[];
  lastUpdate?: Date;
}
