import { ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import { badgeImage } from '../utils/badgeImages';
import { isSncfLine, resolveLineStyle, SNCF_TER_COLOR } from '../utils/lineColors';
import { relayTramOf } from './LineBadge';
import { tclBadge } from '../utils/tclLogos';
import { TclModeCorner } from './TclLogo';
import { rerLine } from '../utils/rer';
import { BadgeLabel } from './FitText';
import { tx } from '../i18n';
import { appLanguage } from '../utils/appLanguage';

function TrafficMark() {
  return (
    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-amber-200 bg-amber-400/90 text-amber-900 shadow-sm">
      <ExclamationTriangleIcon className="w-2.5 h-2.5" />
    </span>
  );
}

export function DepartureLineBadge({
  routeRef,
  label,
  style,
  round,
  sizeClass,
  hasTraffic = false,
}: {

  routeRef: string;
  label: string;

  style: { backgroundColor?: string; color?: string };

  round: boolean;

  sizeClass: string;
  hasTraffic?: boolean;
}) {
  const tcl = tclBadge(routeRef);
  if (tcl) {
    return (
      <div
        className={`relative flex flex-shrink-0 items-center justify-center font-bold ${tcl.round ? 'rounded-full' : 'rounded-2xl'} ${sizeClass}`}
        style={tcl.style}
      >
        <span className={(tcl.label ?? label).length >= 4 ? 'text-[0.8em] tracking-tight' : ''}>{tcl.label ?? label}</span>
        <TclModeCorner id={routeRef} height={15} />
        {hasTraffic && <TrafficMark />}
      </div>
    );
  }

  const isGrenoble = /^SEM[:_]/i.test(routeRef) || !routeRef.includes(':');
  const relayTram = isGrenoble ? (relayTramOf(label) ?? relayTramOf(routeRef)) : null;
  if (relayTram) {
    return (
      <div className={`relative flex flex-shrink-0 items-center justify-center ${sizeClass}`}>
        <img src={badgeImage('/assets/bus_relais.svg')} alt={tx(appLanguage() === 'fr').common.replacementBus} className="absolute inset-0 h-full w-full object-contain" />
        <div
          className="absolute bottom-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-white/75 shadow-lg"
          style={resolveLineStyle(`SEM:${relayTram}`)}
        >
          <span className="text-[0.5625rem] font-extrabold leading-none">{relayTram}</span>
        </div>
        {hasTraffic && <TrafficMark />}
      </div>
    );
  }

  const rer = rerLine(routeRef);
  if (rer) {
    return (
      <div
        className={`relative flex flex-shrink-0 items-center justify-center rounded-2xl font-bold ${sizeClass}`}
        style={rer.style}
      >
        {rer.letter}
        <img
          src={badgeImage(rer.logo)}
          alt={rer.logoAlt}
          width={15}
          height={15}
          className="pointer-events-none absolute -left-1.5 -top-1.5 drop-shadow-[0_0_1.5px_rgba(0,0,0,0.7)]"
        />
        {hasTraffic && <TrafficMark />}
      </div>
    );
  }

  if (isSncfLine(routeRef) && /OUIGO/i.test(label)) {
    return (
      <div className={`relative flex flex-shrink-0 items-center justify-center rounded-full ${sizeClass}`}>
        <img src={badgeImage('/assets/ouigo.svg')} alt="OUIGO" className="h-full w-full object-contain" />
        {hasTraffic && <TrafficMark />}
      </div>
    );
  }

  if (isSncfLine(routeRef) && /TGV/i.test(label)) {
    return (
      <div className={`relative flex flex-shrink-0 items-center justify-center rounded-2xl bg-white px-1 ${sizeClass}`}>
        <img src={badgeImage('/assets/tgv-inoui.svg')} alt="TGV INOUI" className="h-auto w-full object-contain" />
        {hasTraffic && <TrafficMark />}
      </div>
    );
  }

  if (isSncfLine(routeRef)) {
    return (
      <div

        className={`relative flex flex-shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl ${sizeClass}`}
        style={{ backgroundColor: SNCF_TER_COLOR, color: '#ffffff' }}
      >
        <img src={badgeImage('/assets/ter.png')} alt="TER" className="h-2.5 w-auto object-contain" />
        <span className="text-[0.625rem] font-extrabold leading-none">{label}</span>
        {hasTraffic && <TrafficMark />}
      </div>
    );
  }

  return (
    <div
      className={`relative flex flex-shrink-0 items-center justify-center font-bold ${round ? 'rounded-full' : 'rounded-2xl'} ${sizeClass}`}
      style={style}
    >
      <BadgeLabel text={label} />
      {hasTraffic && <TrafficMark />}
    </div>
  );
}
