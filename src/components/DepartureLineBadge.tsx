import { ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import { isSncfLine, SNCF_TER_COLOR } from '../utils/lineColors';

/**
 * La pastille d'une ligne, dans la liste des passages.
 *
 * Elle porte la même pastille d'alerte que les pastilles de ligne du haut de la
 * fiche : un triangle ambre piqué dans le coin. Sans elle, on lisait « ligne A
 * perturbée » en haut de l'écran, puis quatre départs plus bas sans savoir
 * lesquels étaient concernés — il fallait déplier chaque ligne pour le
 * découvrir. La marque est identique des deux côtés, parce qu'elle dit la même
 * chose.
 */
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
  /** Une perturbation touche cette ligne. */
  hasTraffic?: boolean;
}) {
  if (isSncfLine(routeRef)) {
    return (
      <div



        className={`relative flex flex-shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl ${sizeClass}`}
        style={{ backgroundColor: SNCF_TER_COLOR, color: '#ffffff' }}
      >
        <img src="/assets/ter.png" alt="TER" className="h-2.5 w-auto object-contain" />
        <span className="text-[10px] font-extrabold leading-none">{label}</span>
        {hasTraffic && <TrafficMark />}
      </div>
    );
  }

  return (
    <div
      className={`relative flex flex-shrink-0 items-center justify-center font-bold ${round ? 'rounded-full' : 'rounded-2xl'} ${sizeClass}`}
      style={style}
    >
      {label}
      {hasTraffic && <TrafficMark />}
    </div>
  );
}
