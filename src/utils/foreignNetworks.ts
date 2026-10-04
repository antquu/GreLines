import type { AllLinesLine } from '../services/allLines';
import { GTFS_NETWORKS, gtfsLineStyle, gtfsShortName } from '../services/gtfsNetwork';
import { isGtfsNetworkId } from '../services/gtfsNetworkIds';
import { tclAsCatalogLine, tclSolidStyle } from './tclLogos';
import { sncfLineStyle } from '../services/sncfNetwork';

export const isForeignLineId = (id: string | null | undefined) =>
  String(id ?? '').startsWith('TCL:') || String(id ?? '').startsWith('SNC:') || isGtfsNetworkId(id);

export function foreignAsCatalogLine(line: {
  id: string;
  shortName?: string;
  name?: string;
  longName?: string;
  color?: string;
  textColor?: string;
}): AllLinesLine {
  if (String(line.id).startsWith('TCL:')) return tclAsCatalogLine(line);
  if (String(line.id).startsWith('SNC:')) {
    return {
      id: line.id,
      shortName: line.shortName || String(line.id).slice(4),
      longName: line.longName || line.name || '',
      color: sncfLineStyle(line.id).backgroundColor,
      textColor: sncfLineStyle(line.id).color,
      family: 'other',
    };
  }
  const style = foreignSolidStyle(line);
  return {
    id: line.id,
    shortName: line.shortName || gtfsShortName(line.id),
    longName: line.longName || line.name || '',
    color: style?.backgroundColor ?? '#6B7280',
    textColor: style?.color ?? '#FFFFFF',
    family: 'other',
  };
}

export function foreignSolidStyle(line: { id: string; color?: string; textColor?: string }): { backgroundColor: string; color: string } | null {
  const id = String(line.id);
  if (id.startsWith('TCL:')) return tclSolidStyle(id);
  if (id.startsWith('SNC:')) return sncfLineStyle(id);
  if (isGtfsNetworkId(id)) {
    return gtfsLineStyle(id) ?? (line.color ? { backgroundColor: line.color, color: line.textColor ?? '#FFFFFF' } : null);
  }
  return null;
}

export function foreignLineCity(id: string | null | undefined): string | null {
  const raw = String(id ?? '');
  if (raw.startsWith('TCL:')) return 'Lyon';
  const code = raw.slice(0, raw.indexOf(':'));
  return isGtfsNetworkId(raw) ? GTFS_NETWORKS.find(network => network.code === code)?.city ?? null : null;
}
