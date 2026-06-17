import { ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import { resolveLineStyle } from '../utils/lineColors';
import type { Line } from '../types';

type MinimalLine = Pick<Line, 'id' | 'shortName' | 'color' | 'textColor'> & {
  hasTraffic?: boolean;
};

/**
 * Returns whether the line should be drawn as a circular badge (tram + chrono)
 * or a rounded rectangle (everything else). Matches the visual logic used
 * elsewhere in the app (sidebar, favorite picker).
 */
export function isRoundLine(label: string): boolean {
  const n = label.toUpperCase().trim();
  if (n === 'A' || n === 'B' || n === 'C' || n === 'D' || n === 'E') return true;
  return /^C\d+$/.test(n);
}

/**
 * Compute a readable foreground color for the given hex bg. Uses the standard
 * relative-luminance threshold so light line colors get black text and dark
 * ones get white.
 */
export function readableTextColor(hex: string): string {
  const m = hex.replace('#', '');
  if (m.length !== 6) return '#ffffff';
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 186 ? '#000000' : '#ffffff';
}

/**
 * A line badge that mirrors the look of badges elsewhere in the app: round for
 * tram and chrono lines, rectangle for the rest, in the line's official color.
 * The `size` prop controls the dimensions.
 *
 *   sm → small (compact lists, infotrafic panel)
 *   md → medium (favorites picker)
 *   lg → large (line header in stop view)
 */
export function LineBadge({
  line,
  size = 'md',
}: {
  line: MinimalLine;
  size?: 'sm' | 'md' | 'lg';
}) {
  const label = line.shortName || line.id;
  const round = isRoundLine(label);
  const style = resolveLineStyle(line.id, line.color, line.textColor);
  const dim =
    size === 'sm'
      ? 'w-8 h-8 text-xs'
      : size === 'lg'
      ? 'w-12 h-12 text-base'
      : 'w-11 h-11 text-sm';
  return (
    <div
      className={`${dim} relative flex items-center justify-center font-extrabold flex-shrink-0 ${
        round ? 'rounded-full' : 'rounded-lg'
      }`}
      style={style}
    >
      {label}
      {line.hasTraffic && (
        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400/90 text-amber-900 border border-amber-200 shadow-sm">
          <ExclamationTriangleIcon className="w-2.5 h-2.5" />
        </span>
      )}
    </div>
  );
}