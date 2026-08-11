export interface Stop {
  id: string;
  name: string;
  lat: number;
  lon: number;
  city?: string;
  clusterGtfsId?: string;
}

export interface TrafficDetail {
  titre: string;
  description: string;
  dateFin: string;
  listeLigne: string;
}

export interface Line {
  id: string;
  routeId?: string;
  name: string;
  type: 'BUS' | 'TRAM' | 'RAIL' | 'METRO' | 'OTHER';
  shortName?: string;
  color?: string;
  textColor?: string;
  hasTraffic?: boolean;
  trafficDetails?: TrafficDetail[];
}

export interface Departure {
  lineId: string;
  




  routeId?: string;
  lineName: string;
  lineShortName?: string;
  destination: string;
  departureTime: number;
  realtime: boolean;
  type: 'BUS' | 'TRAM' | 'RAIL' | 'METRO' | 'OTHER';
  occupancy?: 'EMPTY' | 'LIGHT' | 'MODERATE' | 'CROWDED';
}

export interface StopDetail extends Stop {
  lines: Line[];
  departures: Departure[];
  lastUpdate?: Date;
}

export interface NearbyStop extends Stop {
  distanceMeters: number;
}

export interface AddressResult {
  label: string;
  lat: number;
  lon: number;
}

export type SearchHistoryItem =
  | {
      kind: 'stop';
      id: string;
      name: string;
      city?: string;
    }
  | {
      kind: 'line';
      id: string;
      shortName: string;
      longName: string;
    }
  | {
      kind: 'address';
      id: string;
      name: string;
      context?: string;
      lat: number;
      lon: number;
    };
