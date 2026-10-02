import { FaMapSigns } from 'react-icons/fa';
import { ArrowsRightLeftIcon } from '@heroicons/react/24/solid';
import type { McoLine } from '../services/mcoLines';

export const CARPOOL_PREFIX = 'MCO:';

export function isCarpoolStop(stopId: string | undefined | null): boolean {
  return String(stopId ?? '').toUpperCase().startsWith(CARPOOL_PREFIX);
}

export function isCarpoolLine(line: { id: string; routeId?: string }): boolean {
  const full = String(line.routeId ?? '').toUpperCase();
  if (full) return full.startsWith(CARPOOL_PREFIX);
  return false;
}

function endpointsOf(longName: string): [string, string] | null {
  const parts = String(longName ?? '').split(/\s+[-–—]\s+/);
  if (parts.length !== 2) return null;
  const [from, to] = parts.map(part => part.trim());
  return from && to ? [from, to] : null;
}

export function CarpoolStopPanel({
  lines,
  language,
  isLight = false,
}: {
  lines: McoLine[];
  language: 'fr' | 'en';
  isLight?: boolean;
}) {
  const isFr = language === 'fr';

  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <FaMapSigns
        className={isLight ? 'text-slate-300' : 'text-slate-700'}
        size={96}
        aria-hidden="true"
      />

      <div className="mt-6">
        <p className={`text-xl font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
          {isFr ? 'Arrêt de covoiturage' : 'Carpooling stop'}
        </p>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
          {isFr
            ? "Pas d'horaires ici : les départs dépendent des conducteurs qui passent."
            : 'No timetable here: departures depend on the drivers passing by.'}
        </p>
      </div>

      {lines.length > 0 && (
        <div className="mt-10 w-full">
          <p className="section-caps text-slate-400">
            {isFr ? 'Lignes de covoiturage desservies' : 'Carpooling lines served'}
          </p>
          <div className="mt-4 flex flex-col items-center gap-2.5">
            {lines.map(line => (
              <div key={line.code} className="flex flex-col items-center">
                <span
                  className="rounded-xl px-4 py-1.5 text-base font-extrabold"
                  style={{ backgroundColor: line.color, color: line.textColor }}
                >
                  {line.shortName}
                </span>
                {endpointsOf(line.longName) && (
                  <span className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                    <span>{endpointsOf(line.longName)![0]}</span>
                    <ArrowsRightLeftIcon className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
                    <span>{endpointsOf(line.longName)![1]}</span>
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
