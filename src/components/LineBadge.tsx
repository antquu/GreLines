import { ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import { resolveLineStyle, isSncfLine, SNCF_TER_COLOR } from '../utils/lineColors';
import type { Line } from '../types';

type MinimalLine = Pick<Line, 'id' | 'shortName' | 'color' | 'textColor'> & {
  hasTraffic?: boolean;
  
  routeId?: string;
};

const RELAY_LINES = new Set(['NAVA', 'NAVB', 'NAVC', 'NAVD', 'NAVE']);
const RELAY_OVERLAY: Record<string, string> = {
  NAVA: 'A',
  NAVB: 'B',
  NAVC: 'C',
  NAVD: 'D',
  NAVE: 'E',
};






export function isRoundLine(label: string): boolean {
  const n = label.toUpperCase().trim();
  if (n === 'A' || n === 'B' || n === 'C' || n === 'D' || n === 'E') return true;
  return /^C\d+$/.test(n);
}






export function readableTextColor(hex: string): string {
  const m = hex.replace('#', '');
  if (m.length !== 6) return '#ffffff';
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 186 ? '#000000' : '#ffffff';
}










export function LineBadge({
  line,
  size = 'md',
  active = false,
  selected = true,
}: {
  line: MinimalLine;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  active?: boolean;
  selected?: boolean;
}) {
  const label = line.shortName || line.id;
  const normalizedLabel = label.toUpperCase().replace(/^SEM[:_]/, '');
  const isRelay = RELAY_LINES.has(normalizedLabel);
  const dim =
    size === 'xs'
      ? 'w-6 h-6 text-[10px]'
      : size === 'sm'
      ? 'w-9 h-9 text-sm'
      : size === 'lg'
      ? 'w-12 h-12 text-base'
      : 'w-11 h-11 text-sm';
  const round = isRoundLine(label);
  const activeClass = active ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-900' : '';
  const opacityClass = selected ? 'opacity-100' : 'opacity-25';

  if (isRelay) {
    const overlayLine = RELAY_OVERLAY[normalizedLabel] || 'A';
    const overlayDim = size === 'lg' ? 'w-5 h-5 text-[10px]' : size === 'xs' ? 'w-3.5 h-3.5 text-[8px]' : 'w-4 h-4 text-[9px]';
    const overlayStyle = resolveLineStyle(`SEM:${overlayLine}`);

    return (
      <div className={`${dim} relative flex items-center justify-center flex-shrink-0 ${round ? 'rounded-full' : 'rounded-lg'} overflow-hidden ${activeClass} ${opacityClass}`}>
        <img
          src="/assets/bus_relais.svg"
          alt="Bus relais"
          className="absolute inset-0 h-full w-full object-contain"
        />
        <div
          className={`absolute bottom-0.5 right-0.5 flex items-center justify-center rounded-full border border-white/75 shadow-lg ${overlayDim}`}
          style={overlayStyle}
        >
          <span className="font-extrabold leading-none">{overlayLine}</span>
        </div>
        {line.hasTraffic && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400/90 text-amber-900 border border-amber-200 shadow-sm">
            <ExclamationTriangleIcon className="w-2.5 h-2.5" />
          </span>
        )}
      </div>
    );
  }

  // TCL publie ses propres pictogrammes de ligne, avec le logogramme du mode
  // (M pour le métro, T pour le tram) et la couleur officielle de la charte.
  // Les redessiner en badge coloré donnerait un à-peu-près là où l'exact est
  // disponible. Ils sont servis depuis nos assets et non depuis tcl.fr : un
  // domaine tiers dépend d'une politique de sécurité de contenu et d'une URL
  // dont rien ne garantit la pérennité.
  if (String(line.id).startsWith('TCL:')) {
    const code = String(line.id).slice(4);
    return (
      <div className={`${dim} relative flex flex-shrink-0 items-center justify-center ${activeClass} ${opacityClass}`}>
        <img
          src={`/assets/lignes/${encodeURIComponent(code)}.svg`}
          alt={code}
          className="h-full w-auto max-w-none object-contain"
          // Un pictogramme absent ne doit pas laisser une image cassée : on
          // rend la main au badge coloré, qui sait toujours s'afficher.
          onError={event => { (event.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
        {line.hasTraffic && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-amber-200 bg-amber-400/90 text-amber-900 shadow-sm">
            <ExclamationTriangleIcon className="w-2.5 h-2.5" />
          </span>
        )}
      </div>
    );
  }

  // Lignes SNCF : le logo TER au-dessus du code, sur le bleu de la charte. Le
  // code seul ne suffit pas — la « C1 » du TER n'a rien à voir avec la Chrono 1
  // de Grenoble, et les deux se croisent en gare.
  if (isSncfLine(line.routeId || line.id)) {
    const sncfCode = (line.shortName || line.id).toUpperCase().replace(/^[A-Z0-9]{3}[:_]/, '');
    const logoDim =
      size === 'xs' ? 'h-2 w-auto' : size === 'sm' ? 'h-2.5 w-auto' : size === 'lg' ? 'h-4 w-auto' : 'h-3 w-auto';
    const codeDim =
      size === 'xs' ? 'text-[8px]' : size === 'sm' ? 'text-[10px]' : size === 'lg' ? 'text-sm' : 'text-[11px]';
    return (
      <div
        className={`${dim} relative flex flex-shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg ${activeClass} ${opacityClass}`}
        style={{ backgroundColor: SNCF_TER_COLOR, color: '#ffffff' }}
      >
        <img src="/assets/ter.png" alt="TER" className={`${logoDim} object-contain`} />
        <span className={`font-extrabold leading-none ${codeDim}`}>{sncfCode}</span>
        {line.hasTraffic && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400/90 text-amber-900 border border-amber-200 shadow-sm">
            <ExclamationTriangleIcon className="w-2.5 h-2.5" />
          </span>
        )}
      </div>
    );
  }

  const style = resolveLineStyle(line.id, line.color, line.textColor);
  return (
    <div
      className={`${dim} relative flex items-center justify-center font-extrabold flex-shrink-0 ${round ? 'rounded-full' : 'rounded-lg'} ${activeClass} ${opacityClass}`}
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
