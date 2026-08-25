import { resolveLineStyle, isGrenobleNetworkLine, isSncfLine, SNCF_TER_COLOR } from '../utils/lineColors';
import { isRoundLine } from '../components/LineBadge';

const RELAY_OVERLAY: Record<string, string> = {
  NAVA: 'A',
  NAVB: 'B',
  NAVC: 'C',
  NAVD: 'D',
  NAVE: 'E',
};

export function ScreenLineBadge({
  lineId,
  label,
  color,
  textColor,
  size = 'md',
}: {
  lineId: string;
  label: string;
  color?: string;
  textColor?: string;
  size?: 'sm' | 'md';
}) {
  const normalized = label.toUpperCase().replace(/^SEM[:_]/, '').trim();
  const relayLine = RELAY_OVERLAY[normalized];
  const isSmall = size === 'sm';

  if (relayLine) {
    const overlayStyle = resolveLineStyle(`SEM:${relayLine}`);
    return (
      <span
        className={`relative inline-flex flex-shrink-0 items-center justify-center ${
          isSmall ? 'h-9 w-9' : 'h-12 w-12 2xl:h-14 2xl:w-14'
        }`}
      >
        <img src="/assets/bus_relais.svg" alt="Bus relais" className="h-full w-full object-contain" />
        <span
          className={`absolute bottom-0 right-0 flex items-center justify-center rounded-full border border-white/75 font-extrabold leading-none ${
            isSmall ? 'h-4 w-4 text-[9px]' : 'h-5 w-5 text-[11px] 2xl:h-6 2xl:w-6 2xl:text-sm'
          }`}
          style={overlayStyle}
        >
          {relayLine}
        </span>
      </span>
    );
  }

  if (isSncfLine(lineId)) {
    return (
      <span
        className={`inline-flex flex-shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl ${
          isSmall ? 'h-9 min-w-9 px-1.5' : 'h-12 min-w-12 px-2 2xl:h-14 2xl:min-w-14'
        }`}
        style={{ backgroundColor: SNCF_TER_COLOR, color: '#ffffff' }}
      >
        <img
          src="/assets/ter.png"
          alt="TER"
          className={isSmall ? 'h-2.5 w-auto object-contain' : 'h-3.5 w-auto object-contain 2xl:h-4'}
        />
        <span className={`font-extrabold leading-none ${isSmall ? 'text-xs' : 'text-base 2xl:text-lg'}`}>
          {normalized}
        </span>
      </span>
    );
  }

  const style = resolveLineStyle(lineId, color, textColor);
  const dim = isSmall
    ? 'h-9 min-w-9 px-2 text-lg'
    : 'h-12 min-w-12 px-3 text-2xl 2xl:h-14 2xl:min-w-14 2xl:text-3xl';

  return (
    <span
      className={`inline-flex items-center justify-center font-extrabold leading-none flex-shrink-0 ${dim} ${
        isGrenobleNetworkLine(lineId) && isRoundLine(label) ? 'rounded-full' : 'rounded-xl'
      }`}
      style={style}
    >
      {label}
    </span>
  );
}
