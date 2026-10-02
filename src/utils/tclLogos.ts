import type { AllLinesLine } from '../services/allLines';
import manifest from '../data/tclLogos.json';

type LogoEntry = { mode: string; x: number; w: number; bg: string; fg: string; border?: string; label?: string };

const LINES = manifest.lines as Record<string, LogoEntry>;
const TABS = manifest.tabs as Record<string, string>;
const TAB_WIDTHS = manifest.tabWidths as Record<string, number>;

export const TCL_UNIT = 28;
export const tclTabWidth = (mode: string) => TAB_WIDTHS[mode] ?? 35;

export const tclCode = (id: string) => (String(id).startsWith('TCL:') ? String(id).slice(4) : null);

export const tclLogo = (id: string): LogoEntry | null => {
  const code = tclCode(id);
  return code ? LINES[code] ?? null : null;
};

export function tclBadge(id: string) {
  const entry = tclLogo(id);
  if (!entry) return null;
  return {
    style: {
      backgroundColor: entry.bg,
      color: entry.fg,
      ...(entry.border ? { boxShadow: `inset 0 0 0 2px ${entry.border}` } : {}),
    },
    round: entry.mode === 'M' || entry.mode === 'T',
    label: entry.label ?? null,
  };
}

const WHOLE = new Set(manifest.whole as string[]);

export const tclWholeLogo = (id: string) => {
  const code = tclCode(id);
  return code !== null && WHOLE.has(code);
};

const toHex = (colour: string) => {
  const rgb = colour.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (!rgb) return colour.startsWith('#') ? colour.toUpperCase() : colour;
  return `#${rgb.slice(1, 4).map(n => Number(n).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
};

export function tclSolidStyle(id: string): { backgroundColor: string; color: string } | null {
  const entry = tclLogo(id);
  if (!entry) return null;
  if (entry.border) return { backgroundColor: toHex(entry.border), color: '#FFFFFF' };
  return { backgroundColor: toHex(entry.bg), color: toHex(entry.fg) };
}

export const tclLogoEntry = (code: string): LogoEntry | null => LINES[code] ?? null;

export const tclTabCode = (mode: string): string | null => TABS[mode] ?? null;

export function tclAsCatalogLine(line: {
  id: string;
  shortName?: string;
  name?: string;
  longName?: string;
  color?: string;
  textColor?: string;
}): AllLinesLine {
  const solid = tclSolidStyle(line.id);
  const mode = tclLogo(line.id)?.mode;
  return {
    id: line.id,
    shortName: line.shortName || tclCode(line.id) || line.id,
    longName: line.longName || line.name || '',
    color: solid?.backgroundColor ?? line.color ?? '#6B7280',
    textColor: solid?.color ?? line.textColor ?? '#FFFFFF',
    family: mode === 'M' || mode === 'T' || mode === 'F' ? 'tram' : mode === 'C' ? 'chrono' : 'other',
  };
}
