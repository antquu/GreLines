import { memo } from 'react';
import { FaWalking } from 'react-icons/fa';
import { LineBadge } from './LineBadge';
import { resolveLineBackgroundColor } from '../utils/lineColors';
import type { RouteItinerary } from '../services/api';
import type { AllLinesLine } from '../services/allLines';
import { resolveRouteLine } from '../utils/routeLineResolver';

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
  if (!journey) return null;

  const allLegs = journey.allLegs || [];
  const depIsAddress = (journey.rawDep ?? journey.depName ?? '').includes('::');
  const arrIsAddress = (journey.rawArr ?? journey.arrName ?? '').includes('::');

  // Filter out unnecessary walk segments
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

      // Transit start
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

      // Transit bar with stops info
      const stopCount = (leg.intermediateStops?.length || 0) + 1;
      items.push(
        <div
          key={`transit-bar-${i}`}
          className="flex gap-3 mb-0"
          style={{ minHeight: '3rem' }}
        >
          <div className="flex flex-col items-center w-8 flex-shrink-0">
            <div className="w-1 flex-1" style={{ backgroundColor: color }} />
          </div>
          <div className="flex items-center mb-7">
            <p className="text-[12.5px] text-slate-400">
              {formatDuration(durationMin)} · {stopCount} arrêt{stopCount > 1 ? 's' : ''}
            </p>
          </div>
        </div>,
      );

      // Transit end
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
          <div
            key={`transfer-gap-${i}`}
            className="flex gap-3 items-center"
            style={{ minHeight: '8px' }}
          />,
        );
      }
    }

    // Walk segments
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
