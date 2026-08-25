import { memo, useState } from 'react';
import { FaWalking } from 'react-icons/fa';
import { ChevronDownIcon } from '@heroicons/react/24/solid';
import { LineBadge } from './LineBadge';
import { resolveLineBackgroundColor } from '../utils/lineColors';
import type { RouteItinerary } from '../services/api';
import type { AllLinesLine } from '../services/allLines';
import { resolveRouteLine } from '../utils/routeLineResolver';
import type { JourneyIntermediateStop } from '../types';

interface JourneyTimelineProps {
  journey: RouteItinerary;
  lineColors?: Map<string, string>;
  lineLookup?: Map<string, AllLinesLine> | null;
  getLineDisruptions?: (lineName: string) => any[];
}

const formatDuration = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}min`;
};

export const JourneyTimeline = memo(({ journey, lineColors = new Map(), lineLookup, getLineDisruptions }: JourneyTimelineProps) => {
  const [expandedLegs, setExpandedLegs] = useState<Set<number>>(new Set());

  const toggleLeg = (index: number) => {
    setExpandedLegs(current => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const formatClock = (value: number | undefined) =>
    value ? new Date(value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';

  if (!journey) return null;

  const allLegs = journey.allLegs || [];
  const depIsAddress = (journey.rawDep ?? journey.depName ?? '').includes('::');
  const arrIsAddress = (journey.rawArr ?? journey.arrName ?? '').includes('::');

  const filteredLegs = allLegs.filter((leg, i, arr) => {
    if (leg.mode !== 'WALK') return true;
    const isFirst = arr.slice(0, i).every((l) => l.mode === 'WALK');
    if (isFirst && !depIsAddress) return false;
    const isLast = arr.slice(i + 1).every((l) => l.mode === 'WALK');
    if (isLast && !arrIsAddress) return false;
    return true;
  });

  const items: React.ReactNode[] = [];

  filteredLegs.forEach((leg, i) => {
    const isWalk = leg.mode === 'WALK';
    const lineName = String(leg.routeShortName || leg.route || leg.routeId || '')
      .replace(/^SEM:/, '')
      .replace(/^SEM_/, '')
      .toUpperCase();
    const line = resolveRouteLine({
      routeShortName: leg.routeShortName,
      route: leg.route,
      routeId: leg.routeId,
      lineLookup,
    });
    const color = line?.color || resolveLineBackgroundColor(lineColors.get(lineName), lineName);
    const durationMin = Math.round((leg.duration || 0) / 60);

    if (!isWalk) {
      const disruptions = getLineDisruptions?.(lineName) || [];
      if (disruptions.length > 0) {
        items.push(
          <div key={`disruption-${i}`} className="flex flex-col gap-2 mb-3">
            {disruptions.map((evt: any, di: number) => (
              <div key={di} className="text-xs text-orange-600 bg-orange-50 p-2 rounded">
                {evt.titre}
              </div>
            ))}
          </div>,
        );
      }

      items.push(
        <div key={`transit-start-${i}`} className="flex gap-3 items-start mb-0">
          <div className="flex flex-col items-center w-8 flex-shrink-0">
            <LineBadge
              line={{
                id: line?.id || lineName,
                shortName: line?.shortName || lineName,
                color,
                textColor: line?.textColor,
              }}
              size="sm"
            />
            <div
              className="w-1 flex-1 min-h-[2rem]"
              style={{ backgroundColor: color }}
            />
          </div>
          <div className="flex items-start gap-2 flex-1">
            <div className="flex-1">
              <p className="font-semibold text-sm text-white leading-tight">
                {leg.from?.name?.replace(/^[^,]+,\s*/, '')}
              </p>
              <p className="text-[12.5px] text-slate-400">
                {leg.startTime ? new Date(leg.startTime).toLocaleTimeString('fr-FR', {
                  hour: '2-digit',
                  minute: '2-digit',
                }) : ''}
              </p>
            </div>
          </div>
        </div>,
      );

      const intermediateStops: JourneyIntermediateStop[] = Array.isArray(leg.intermediateStops)
        ? leg.intermediateStops
        : [];
      const stopCount = intermediateStops.length + 1;
      const isExpanded = expandedLegs.has(i);
      const summary = `${formatDuration(durationMin)} · ${stopCount} arrêt${stopCount > 1 ? 's' : ''}`;
      items.push(
        <div
          key={`transit-bar-${i}`}
          className="flex gap-3 mb-0"
          style={{ minHeight: '3rem' }}
        >
          <div className="flex flex-col items-center w-8 flex-shrink-0">
            <div className="w-1 flex-1" style={{ backgroundColor: color }} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-center pb-7">
            {intermediateStops.length > 0 ? (
              <button
                type="button"
                onClick={() => toggleLeg(i)}
                aria-expanded={isExpanded}
                className="flex items-center gap-1.5 text-[12.5px] text-slate-400 transition hover:text-slate-200"
              >
                <span>{summary}</span>
                <ChevronDownIcon
                  className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                />
              </button>
            ) : (
              <p className="text-[12.5px] text-slate-400">{summary}</p>
            )}

            {/* Dépliement animé par la grille (`height: auto` ne s'anime pas) ;
                le trait de la ligne porte déjà les arrêts, inutile d'ajouter un
                filet à côté. */}
            <div
              className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-300 ease-out ${
                isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
              }`}
              aria-hidden={!isExpanded}
            >
              <ul className="flex min-h-0 flex-col gap-1.5">
                {intermediateStops.map((stop, stopIndex) => (
                  <li
                    key={`${stop?.stopId ?? stop?.name ?? stopIndex}-${stopIndex}`}
                    className={`flex items-baseline justify-between gap-3 ${stopIndex === 0 ? 'pt-2' : ''}`}
                  >
                    <span className="truncate text-[12.5px] text-slate-400">
                      {String(stop?.name ?? '').replace(/^[^,]+,\s*/, '')}
                    </span>
                    <span className="flex-shrink-0 text-[11px] text-slate-500">
                      {formatClock(stop?.arrival ?? stop?.departure)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>,
      );

      const nextLeg = filteredLegs[i + 1];
      const nextIsTransit = nextLeg && nextLeg.mode !== 'WALK';

      items.push(
        <div key={`transit-end-${i}`} className="flex gap-3 items-start mb-0">
          <div className="flex flex-col items-center w-8 flex-shrink-0">
            <div
              className="w-4 h-4 rounded-full flex-shrink-0"
              style={{ backgroundColor: color }}
            />
            {nextIsTransit && (
              <div
                className="w-0 border-l-2 border-dashed border-slate-600"
                style={{ height: '24px' }}
              />
            )}
          </div>
          <div className={`flex-1 ${nextIsTransit ? 'mb-0' : ''}`}>
            <p className="font-semibold text-sm text-white leading-tight">
              {leg.to?.name?.replace(/^[^,]+,\s*/, '')}
            </p>
            <p className="text-[12.5px] text-slate-400">
              {leg.endTime ? new Date(leg.endTime).toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit',
              }) : ''}
            </p>
          </div>
        </div>,
      );

      if (nextIsTransit) {
        items.push(
          /*
           * La correspondance, dessinée comme une ligne.
           *
           * Deux lignes qui se suivent laissaient un simple vide : rien ne
           * disait qu'on descend d'un véhicule pour en prendre un autre. Le
           * pavé gris occupe désormais la colonne des badges, au même gabarit
           * qu'eux mais plus bas — c'est une étape du trajet, pas une ligne de
           * plus. Et il touche les deux badges qu'il sépare : collé, il les
           * relie ; espacé, il les couperait.
           */
          <div key={`transfer-gap-${i}`} className="flex gap-3 items-stretch">
            <div className="flex w-8 flex-shrink-0 justify-center">
              <div
                className="w-8 rounded-md bg-slate-600"
                style={{ height: '14px' }}
                aria-hidden
              />
            </div>
            <div className="flex-1" />
          </div>,
        );
      }
    }

    if (isWalk && durationMin >= 1) {
      items.push(
        <div key={`walk-${i}`} className="flex gap-3 items-center">
          <div className="flex flex-col items-center w-8 flex-shrink-0">
            {i !== 0 && (
              <div
                className="border-l-2 border-dashed border-slate-600"
                style={{ height: '28px', marginTop: '-10px' }}
              />
            )}
            <FaWalking className="w-5 h-5 text-slate-400 flex-shrink-0" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-300">À pied</p>
            <p className="text-[12.5px] text-slate-400">
              {leg.from?.name?.replace(/^[^,]+,\s*/, '')} → {leg.to?.name?.replace(/^[^,]+,\s*/, '')}
            </p>
            <p className="text-[12.5px] text-slate-500 mt-1">
              {formatDuration(durationMin)}
            </p>
          </div>
        </div>,
      );
    }
  });

  return (
    <div className="space-y-2 relative">
      {items}
    </div>
  );
});

JourneyTimeline.displayName = 'JourneyTimeline';
