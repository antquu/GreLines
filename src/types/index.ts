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
  departureTime: number;
  realtime: boolean;
  type: 'BUS' | 'TRAM' | 'OTHER';
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