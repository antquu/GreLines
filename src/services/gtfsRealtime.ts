export interface RealtimeStopTime {
  stopId: string;
  stopSequence: number | null;
  time: number | null;
  delay: number | null;
  skipped: boolean;
}

export interface RealtimeTrip {
  tripId: string;
  routeId: string;
  canceled: boolean;
  stops: RealtimeStopTime[];
}

class Reader {
  pos: number;
  private readonly buf: Uint8Array;
  private readonly end: number;

  constructor(buf: Uint8Array, start = 0, end = buf.length) {
    this.buf = buf;
    this.pos = start;
    this.end = end;
  }

  get done() { return this.pos >= this.end; }

  varint(): number {
    let result = 0;
    let factor = 1;
    let byte: number;
    do {
      byte = this.buf[this.pos++];
      result += (byte & 0x7f) * factor;
      factor *= 128;
    } while (byte & 0x80);
    return result;
  }

  signed(): number {
    const value = this.varint();
    return value >= 2 ** 63 ? value - 2 ** 64 : value;
  }

  message(): Reader {
    const length = this.varint();
    const sub = new Reader(this.buf, this.pos, this.pos + length);
    this.pos += length;
    return sub;
  }

  string(): string {
    const length = this.varint();
    const text = new TextDecoder().decode(this.buf.subarray(this.pos, this.pos + length));
    this.pos += length;
    return text;
  }

  skip(wireType: number) {
    if (wireType === 0) this.varint();
    else if (wireType === 1) this.pos += 8;
    else if (wireType === 2) {
      const length = this.varint();
      this.pos += length;
    }
    else if (wireType === 5) this.pos += 4;
    else throw new Error(`GTFS-RT : type de champ ${wireType} inconnu`);
  }

  fields(onField: (field: number, wireType: number) => boolean) {
    while (!this.done) {
      const tag = this.varint();
      const field = Math.floor(tag / 8);
      const wireType = tag & 7;
      if (!onField(field, wireType)) this.skip(wireType);
    }
  }
}

type StopEvent = { time: number | null; delay: number | null };

function readEvent(r: Reader): StopEvent {
  const event: StopEvent = { time: null, delay: null };
  r.fields((field, wire) => {
    if (field === 1 && wire === 0) { event.delay = r.signed(); return true; }
    if (field === 2 && wire === 0) { event.time = r.signed() * 1000; return true; }
    return false;
  });
  return event;
}

function readStopTimeUpdate(r: Reader): RealtimeStopTime {
  const stop: RealtimeStopTime = { stopId: '', stopSequence: null, time: null, delay: null, skipped: false };
  const events: { arrival: StopEvent | null; departure: StopEvent | null } = { arrival: null, departure: null };
  r.fields((field, wire) => {
    if (field === 1 && wire === 0) { stop.stopSequence = r.varint(); return true; }
    if (field === 4 && wire === 2) { stop.stopId = r.string(); return true; }
    if (field === 2 && wire === 2) { events.arrival = readEvent(r.message()); return true; }
    if (field === 3 && wire === 2) { events.departure = readEvent(r.message()); return true; }
    if (field === 5 && wire === 0) { stop.skipped = r.varint() === 1; return true; }
    return false;
  });
  const event = events.departure ?? events.arrival;
  stop.time = event?.time ?? null;
  stop.delay = event?.delay ?? null;
  return stop;
}

function readTripUpdate(r: Reader): RealtimeTrip {
  const trip: RealtimeTrip = { tripId: '', routeId: '', canceled: false, stops: [] };
  r.fields((field, wire) => {
    if (field === 1 && wire === 2) {
      const descriptor = r.message();
      descriptor.fields((f, w) => {
        if (f === 1 && w === 2) { trip.tripId = descriptor.string(); return true; }
        if (f === 5 && w === 2) { trip.routeId = descriptor.string(); return true; }
        if (f === 4 && w === 0) { trip.canceled = descriptor.varint() === 3; return true; }
        return false;
      });
      return true;
    }
    if (field === 2 && wire === 2) { trip.stops.push(readStopTimeUpdate(r.message())); return true; }
    return false;
  });
  return trip;
}

export function decodeTripUpdates(buffer: ArrayBuffer | Uint8Array): RealtimeTrip[] {
  const r = new Reader(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer));
  const trips: RealtimeTrip[] = [];
  r.fields((field, wire) => {
    if (field !== 2 || wire !== 2) return false;
    const entity = r.message();
    entity.fields((f, w) => {
      if (f === 3 && w === 2) { trips.push(readTripUpdate(entity.message())); return true; }
      return false;
    });
    return true;
  });
  return trips;
}

export interface RealtimeAlert {
  routeIds: string[];
  stopIds: string[];
  title: string;
  description: string;
  end: number | null;
}

function readTranslated(r: Reader): string {
  const texts: Array<{ text: string; language: string }> = [];
  r.fields((field, wire) => {
    if (field !== 1 || wire !== 2) return false;
    const translation = r.message();
    const item = { text: '', language: '' };
    translation.fields((f, w) => {
      if (f === 1 && w === 2) { item.text = translation.string(); return true; }
      if (f === 2 && w === 2) { item.language = translation.string(); return true; }
      return false;
    });
    texts.push(item);
    return true;
  });
  return (texts.find(item => /^fr/i.test(item.language)) ?? texts[0])?.text ?? '';
}

function readAlert(r: Reader): RealtimeAlert {
  const alert: RealtimeAlert = { routeIds: [], stopIds: [], title: '', description: '', end: null };
  r.fields((field, wire) => {
    if (field === 1 && wire === 2) {
      const period = r.message();
      period.fields((f, w) => {
        if (f === 2 && w === 0) {
          const end = period.varint() * 1000;
          alert.end = Math.max(alert.end ?? 0, end);
          return true;
        }
        return false;
      });
      return true;
    }
    if (field === 5 && wire === 2) {
      const entity = r.message();
      entity.fields((f, w) => {
        if (f === 2 && w === 2) { alert.routeIds.push(entity.string()); return true; }
        if (f === 5 && w === 2) { alert.stopIds.push(entity.string()); return true; }
        return false;
      });
      return true;
    }
    if (field === 10 && wire === 2) { alert.title = readTranslated(r.message()); return true; }
    if (field === 11 && wire === 2) { alert.description = readTranslated(r.message()); return true; }
    return false;
  });
  return alert;
}

export function decodeAlerts(buffer: ArrayBuffer | Uint8Array): RealtimeAlert[] {
  const r = new Reader(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer));
  const alerts: RealtimeAlert[] = [];
  r.fields((field, wire) => {
    if (field !== 2 || wire !== 2) return false;
    const entity = r.message();
    entity.fields((f, w) => {
      if (f === 5 && w === 2) { alerts.push(readAlert(entity.message())); return true; }
      return false;
    });
    return true;
  });
  return alerts;
}
