import { tclLogo } from './tclLogos';
import { gtfsLineMode, gtfsShortName } from '../services/gtfsNetwork';
import { isGtfsNetworkId } from '../services/gtfsNetworkIds';

export function getLineSortKey(lineShortName?: string | null, lineId?: string): [number, string] {
  const code = (lineShortName || lineId || '').toUpperCase().trim();
  if (code === 'A') return [0, ''];
  if (code === 'B') return [1, ''];
  if (code === 'C') return [2, ''];
  if (code === 'D') return [3, ''];
  if (code === 'E') return [4, ''];
  const cMatch = /^C(\d+)$/.exec(code);
  if (cMatch) {
    const n = parseInt(cMatch[1], 10);
    return n >= 1 && n <= 14 ? [5, n.toString().padStart(3, '0')] : [8, code];
  }
  const nMatch = /^(\d+)$/.exec(code);
  if (nMatch) {
    const n = parseInt(nMatch[1], 10);
    return n >= 15 && n <= 92
      ? [6, n.toString().padStart(3, '0')]
      : [7, n.toString().padStart(3, '0')];
  }
  return [9, code];
}

export function sortLinesByPriority(
  a: { shortName?: string | null; id: string },
  b: { shortName?: string | null; id: string },
): number {
  const [wa, ka] = getLineSortKey(a.shortName, a.id);
  const [wb, kb] = getLineSortKey(b.shortName, b.id);
  if (wa !== wb) return wa - wb;
  return ka.localeCompare(kb, undefined, { numeric: true, sensitivity: 'base' });
}

const TCL_MODE_PRIORITY: Record<string, number> = {
  M: 1000,
  F: 950,
  T: 900,
  C: 800,
  TB: 700,
  BUS: 600,
  RELAIS: 500,
};

export function tclDeparturePriority(lineId: string): number | null {
  if (isGtfsNetworkId(lineId)) {
    const mode = gtfsLineMode(lineId);
    if (mode === 'METRO') return 1000;
    if (mode === 'TRAM') return 950;
    const short = gtfsShortName(lineId);
    if (/^T\d$/.test(short)) return 900;
    if (short === 'Corol') return 850;
    if (/^C\d+$/.test(short)) return 800;
    return 600;
  }
  if (!String(lineId).startsWith('TCL:')) return null;
  const mode = tclLogo(lineId)?.mode;
  return mode ? TCL_MODE_PRIORITY[mode] ?? 10 : 10;
}

export function sortStopPreviewLines<T extends { shortName?: string | null; id: string }>(lines: T[]): T[] {
  return [...lines].sort((a, b) => {
    const pa = tclDeparturePriority(a.id) ?? 0;
    const pb = tclDeparturePriority(b.id) ?? 0;
    return pb - pa || sortLinesByPriority(a, b);
  });
}
