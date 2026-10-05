import { ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import { BadgeLabel } from './FitText';
import { badgeImage } from '../utils/badgeImages';
import { resolveLineStyle, isGrenobleNetworkLine, isSncfLine, SNCF_TER_COLOR } from '../utils/lineColors';
import type { Line } from '../types';
import { tclBadge, tclWholeLogo } from '../utils/tclLogos';
import { TclModeCorner } from './TclLogo';
import { rerLine } from '../utils/rer';
import { tx } from '../i18n';
import { appLanguage } from '../utils/appLanguage';

type MinimalLine = Pick<Line, 'id' | 'shortName' | 'color' | 'textColor'> & {
  hasTraffic?: boolean;

  routeId?: string;
};

const RELAY_LINES = new Set(['NAVA', 'NAVB', 'NAVC', 'NAVD', 'NAVE']);
export const RELAY_OVERLAY: Record<string, string> = {
  NAVA: 'A',
  NAVB: 'B',
  NAVC: 'C',
  NAVD: 'D',
  NAVE: 'E',
};

export function relayTramOf(labelOrId: string): string | null {
  const key = labelOrId.toUpperCase().replace(/^SEM[:_]/, '');
  return RELAY_LINES.has(key) ? RELAY_OVERLAY[key] : null;
}

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

const OPERATORS: Array<{ match: RegExp; src: string; background: string; crop: [number, number, number, number]; aspect: number }> = [
  { match: /blablacar|blablabus/i, src: '/assets/blablabus.png', background: '#054752', crop: [0.05, 0.304, 0.858, 0.408], aspect: 5.28 },
  { match: /flixbus/i, src: '/assets/flixbus.png', background: '#73D700', crop: [0.108, 0.357, 0.783, 0.27], aspect: 5.53 },
];

function OperatorBadge({ operator, height, className }: {
  operator: (typeof OPERATORS)[number];
  height: number;
  className: string;
}) {
  const [x, y, w, h] = operator.crop;
  const logoHeight = Math.round(height * 0.4);
  const logoWidth = Math.round(logoHeight * operator.aspect);
  const imageWidth = logoWidth / w;
  const imageHeight = logoHeight / h;
  return (
    <div
      className={`relative flex flex-shrink-0 items-center justify-center rounded-lg ${className}`}
      style={{ height, width: logoWidth + Math.round(height * 0.5), backgroundColor: operator.background }}
    >
      <div className="relative overflow-hidden" style={{ width: logoWidth, height: logoHeight }}>
        <img
          src={badgeImage(operator.src)}
          alt=""
          aria-hidden="true"
          className="absolute max-w-none"
          style={{ width: imageWidth, height: imageHeight, left: -x * imageWidth, top: -y * imageHeight }}
        />
      </div>
    </div>
  );
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
  const isCarpool = String(line.routeId ?? line.id ?? '').toUpperCase().startsWith('MCO');
  const dim =
    size === 'xs'
      ? (isCarpool ? 'h-6 min-w-6 px-1.5 text-[0.625rem]' : 'w-6 h-6 text-[0.625rem]')
      : size === 'sm'
      ? (isCarpool ? 'h-9 min-w-9 px-2 text-sm' : 'w-9 h-9 text-sm')
      : size === 'lg'
      ? (isCarpool ? 'h-12 min-w-12 px-2.5 text-base' : 'w-12 h-12 text-base')
      : (isCarpool ? 'h-11 min-w-11 px-2.5 text-sm' : 'w-11 h-11 text-sm');
  const fullId = String(line.routeId || line.id);
  const round = !isCarpool && isRoundLine(label) && isGrenobleNetworkLine(fullId);
  const activeClass = active ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-900' : '';
  const opacityClass = selected ? 'opacity-100' : 'opacity-25';

  if (String(line.id).startsWith('EXT:')) {
    const operator = OPERATORS.find(candidate => candidate.match.test(line.id));
    if (operator) {
      const px = size === 'xs' ? 24 : size === 'sm' ? 36 : size === 'lg' ? 48 : 44;
      return <OperatorBadge operator={operator} height={px} className={`${activeClass} ${opacityClass}`} />;
    }
  }

  if (isRelay) {
    const overlayLine = RELAY_OVERLAY[normalizedLabel] || 'A';
    const overlayDim = size === 'lg' ? 'w-5 h-5 text-[0.625rem]' : size === 'xs' ? 'w-3.5 h-3.5 text-[0.5rem]' : 'w-4 h-4 text-[0.5625rem]';
    const overlayStyle = resolveLineStyle(`SEM:${overlayLine}`);

    return (
      <div className={`${dim} relative flex items-center justify-center flex-shrink-0 rounded-full ${activeClass} ${opacityClass}`}>
        <img
          src={badgeImage('/assets/bus_relais.svg')}
          alt={tx(appLanguage() === 'fr').common.replacementBus}
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

  if (String(line.id).startsWith('TCL:')) {
    const code = String(line.id).slice(4);
    const tcl = tclBadge(line.id);
    if (tcl) {
      const tclLabel = tcl.label ?? label;
      return (
        <div
          className={`${dim} relative flex items-center justify-center font-extrabold flex-shrink-0 ${tcl.round ? 'rounded-full' : 'rounded-lg'} ${tclLabel.length >= 4 ? 'tracking-tight' : ''} ${activeClass} ${opacityClass}`}
          style={tcl.style}
        >
          <span className={tclLabel.length >= 4 ? 'text-[0.8em]' : ''}>{tclLabel}</span>
          <TclModeCorner id={line.id} height={size === 'xs' ? 10 : size === 'sm' ? 14 : size === 'lg' ? 18 : 16} />
          {line.hasTraffic && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-amber-200 bg-amber-400/90 text-amber-900 shadow-sm">
              <ExclamationTriangleIcon className="w-2.5 h-2.5" />
            </span>
          )}
        </div>
      );
    }
    if (tclWholeLogo(line.id)) {
      const tallDim = size === 'xs' ? 'h-6' : size === 'sm' ? 'h-9' : size === 'lg' ? 'h-12' : 'h-11';
      return (
        <div className={`${tallDim} relative flex flex-shrink-0 items-center justify-center ${activeClass} ${opacityClass}`}>
          <img
            src={badgeImage(`/assets/lignes/${encodeURIComponent(code)}.svg`)}
            alt={code}
            className="h-full w-auto max-w-none object-contain"
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
  }

  const rer = rerLine(line.routeId || line.id);
  if (rer) {
    const corner = size === 'xs' ? 10 : size === 'sm' ? 14 : size === 'lg' ? 18 : 16;
    return (
      <div
        className={`${dim} relative flex flex-shrink-0 items-center justify-center rounded-lg font-extrabold ${activeClass} ${opacityClass}`}
        style={rer.style}
      >
        <span>{rer.letter}</span>
        <img
          src={badgeImage(rer.logo)}
          alt={rer.logoAlt}
          width={corner}
          height={corner}
          className="pointer-events-none absolute -left-1.5 -top-1.5 drop-shadow-[0_0_1.5px_rgba(0,0,0,0.7)]"
        />
        {line.hasTraffic && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400/90 text-amber-900 border border-amber-200 shadow-sm">
            <ExclamationTriangleIcon className="w-2.5 h-2.5" />
          </span>
        )}
      </div>
    );
  }

  if (isSncfLine(line.routeId || line.id)) {
    const rawCode = (line.shortName || line.id).toUpperCase().replace(/^[A-Z0-9]{3}[:_]/, '');
    const sncfCode = rawCode && rawCode.length <= 5 ? rawCode : 'TER';
    const logoDim =
      size === 'xs' ? 'h-2 w-auto' : size === 'sm' ? 'h-2.5 w-auto' : size === 'lg' ? 'h-4 w-auto' : 'h-3 w-auto';
    const codeDim =
      size === 'xs' ? 'text-[0.5rem]' : size === 'sm' ? 'text-[0.625rem]' : size === 'lg' ? 'text-sm' : 'text-[0.6875rem]';
    const bareLogoDim =
      size === 'xs' ? 'h-3 w-auto' : size === 'sm' ? 'h-4 w-auto' : size === 'lg' ? 'h-6 w-auto' : 'h-5 w-auto';
    if (sncfCode === 'OUIGO') {
      return (
        <div className={`${dim} relative flex flex-shrink-0 items-center justify-center rounded-full ${activeClass} ${opacityClass}`}>
          <img src={badgeImage('/assets/ouigo.svg')} alt="OUIGO" className="h-full w-full object-contain" />
          {line.hasTraffic && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400/90 text-amber-900 border border-amber-200 shadow-sm">
              <ExclamationTriangleIcon className="w-2.5 h-2.5" />
            </span>
          )}
        </div>
      );
    }
    if (sncfCode === 'TGV') {
      return (
        <div
          className={`${dim} relative flex flex-shrink-0 items-center justify-center rounded-lg bg-white px-1 ${activeClass} ${opacityClass}`}
        >
          <img src={badgeImage('/assets/tgv-inoui.svg')} alt="TGV INOUI" className="h-auto w-full object-contain" />
        </div>
      );
    }
    return (
      <div
        className={`${dim} relative flex flex-shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg ${activeClass} ${opacityClass}`}
        style={{ backgroundColor: SNCF_TER_COLOR, color: '#ffffff' }}
      >
        {sncfCode === 'TER' ? (
          <img src={badgeImage('/assets/ter.png')} alt="TER" className={`${bareLogoDim} object-contain`} />
        ) : (
          <>
            <img src={badgeImage('/assets/ter.png')} alt="TER" className={`${logoDim} object-contain`} />
            <span className={`font-extrabold leading-none ${codeDim}`}>{sncfCode}</span>
          </>
        )}
        {line.hasTraffic && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400/90 text-amber-900 border border-amber-200 shadow-sm">
            <ExclamationTriangleIcon className="w-2.5 h-2.5" />
          </span>
        )}
      </div>
    );
  }

  const style = resolveLineStyle(fullId, line.color, line.textColor);
  return (
    <div
      className={`${dim} relative flex items-center justify-center font-extrabold flex-shrink-0 ${round ? 'rounded-full' : 'rounded-lg'} ${activeClass} ${opacityClass}`}
      style={style}
    >
      <BadgeLabel text={label} />
      {line.hasTraffic && (
        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400/90 text-amber-900 border border-amber-200 shadow-sm">
          <ExclamationTriangleIcon className="w-2.5 h-2.5" />
        </span>
      )}
    </div>
  );
}
