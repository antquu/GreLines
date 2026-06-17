import { memo } from 'react';
import { FaWalking } from 'react-icons/fa';
import { LineBadge } from './LineBadge';
import type { RouteItinerary } from '../services/api';
import type { AllLinesLine } from '../services/allLines';
import { resolveRouteLine } from '../utils/routeLineResolver';

interface ItineraryStepsProps {
  itinerary: RouteItinerary;
  language: 'fr' | 'en';
  stops: any[];
  lineLookup?: Map<string, AllLinesLine> | null;
}

const formatTime = (leg: any): string => {
  if (leg.startTime && leg.endTime) {
    const start = new Date(leg.startTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const end = new Date(leg.endTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `${start} → ${end}`;
  }
  return '';
};

const getLegDuration = (leg: any): string => {
  if (leg.duration) {
    const mins = Math.round(leg.duration / 60);
    return `${mins} min`;
  }
  return '';
};

export const ItinerarySteps = memo(({ itinerary, language, stops, lineLookup }: ItineraryStepsProps) => {
  const isFr = language === 'fr';
  const allLegs = itinerary.allLegs || [];
  
  if (allLegs.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 space-y-2 border-t border-slate-800 pt-4">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {isFr ? 'Étapes' : 'Steps'}
      </div>
      
      <div className="relative space-y-3 pl-6">
        
        {allLegs.map((leg, idx) => {
          const isWalk = leg.mode === 'WALK';
          const line = resolveRouteLine({
            routeShortName: leg.routeShortName,
            route: leg.route,
            routeId: leg.routeId,
            lineLookup,
            stops,
          });
          const lineColor = line?.color || '#94a3b8';
          
          return (
            <div key={idx} className="relative">
              {/* Colored connector for this leg (from this step downwards) */}
              <div
                className={`absolute -left-[22px] top-7 bottom-0 w-0.5 ${isWalk ? 'bg-slate-700' : ''}`}
                style={isWalk ? undefined : { backgroundColor: lineColor }}
              />
              {/* Step dot/icon */}
              <div
                className={`absolute -left-[26px] top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                  isWalk ? 'bg-slate-900 border-slate-700' : ''
                }`}
                style={isWalk ? undefined : { backgroundColor: lineColor, borderColor: lineColor }}
              >
                {isWalk ? (
                  <FaWalking className="h-3 w-3 text-slate-400" />
                ) : (
                  <div className="h-3 w-3 rounded-full bg-white" />
                )}
              </div>
              
              {/* Step content */}
              <div className={`rounded-2xl border p-3 ${
                isWalk
                  ? 'border-slate-700 bg-slate-950'
                  : 'border-slate-700 bg-slate-900'
              }`}>
                {isWalk ? (
                  <>
                    <div className="flex items-center gap-2">
                      <FaWalking className="h-4 w-4 text-slate-500" />
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                        {isFr ? 'À pied' : 'Walk'}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {leg.from?.name && leg.to?.name && (
                        <>{leg.from.name} → {leg.to.name}</>
                      )}
                    </div>
                    {leg.duration && (
                      <div className="mt-1 text-xs text-slate-400">
                        {getLegDuration(leg)}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      {line && (
                        <LineBadge 
                          line={{ id: line.id, shortName: line.shortName, color: line.color, textColor: line.textColor }}
                          size="sm"
                        />
                      )}
                      <span className="text-xs font-semibold text-slate-300">
                        {leg.headsign || leg.to?.name || ''}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {leg.from?.name && leg.to?.name && (
                        <>{leg.from.name} → {leg.to.name}</>
                      )}
                    </div>
                    <div className="mt-1 flex justify-between text-xs text-slate-400">
                      <span>{formatTime(leg)}</span>
                      <span>{getLegDuration(leg)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

ItinerarySteps.displayName = 'ItinerarySteps';
