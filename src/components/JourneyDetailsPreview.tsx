import { useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { FaWalking } from 'react-icons/fa';
import { LineBadge } from './LineBadge';
import { DisruptionItem } from './DisruptionItem';
import type { RouteItinerary } from '../services/api';
import type { AllLinesLine } from '../services/allLines';
import type { TrafficDetail } from '../types';
import { resolveRouteLine } from '../utils/routeLineResolver';
import { PlayIcon } from '@heroicons/react/24/solid';

interface JourneyDetailsProps {
  journey: RouteItinerary;
  language: 'fr' | 'en';
  stops: any[];
  lineLookup?: Map<string, AllLinesLine> | null;
  trafficInfo?: Map<string, TrafficDetail[]>;
  
  onStartNavigation?: () => void;
}

export function JourneyDetailsPreview({ journey, language, stops, lineLookup, trafficInfo, onStartNavigation }: JourneyDetailsProps) {
  const isFr = language === 'fr';
  const [hoveredTrafficLine, setHoveredTrafficLine] = useState<string | null>(null);
  const [tooltipCoords, setTooltipCoords] = useState({ x: 0, y: 0 });

  const allLegs = journey.allLegs || [];

  const normalizeTrafficLineCode = (value?: string | null): string | null => {
    if (!value) return null;
    const normalized = String(value).toUpperCase().replace(/^(?:SEM:|SEM_)/, '').trim();
    return normalized || null;
  };

  const trafficLineKeys = journey.lineKeys
    .map(lineKey => normalizeTrafficLineCode(String(lineKey)))
    .filter((lineKey): lineKey is string => !!lineKey)
    .filter(lineKey => trafficInfo?.has(lineKey));

  const trafficLines = Array.from(new Set(trafficLineKeys)).map(lineKey => ({
    lineKey,
    details: trafficInfo?.get(lineKey) || [],
  }));

  
  const timelineItems: ReactNode[] = [];

  allLegs.forEach((leg, i) => {
    const isWalk = leg.mode === 'WALK';
    const line = resolveRouteLine({
      routeShortName: leg.routeShortName,
      route: leg.route,
      routeId: leg.routeId,
      lineLookup,
      stops,
    });
    const lineName = line?.normalized || String(leg.routeShortName || leg.route || leg.routeId || '').replace(/^SEM:/, '').replace(/^SEM_/, '').toUpperCase();
    const color = line?.color || '#94a3b8';
    const durationMin = Math.round((leg.duration || 0) / 60);

    if (!isWalk) {
      const lineTrafficKey = normalizeTrafficLineCode(lineName);
      const legHasTraffic = lineTrafficKey ? Boolean(trafficInfo?.has(lineTrafficKey)) : false;

      
      timelineItems.push(
        <div key={`transit-start-${i}`} className="flex gap-3 items-start mb-0">
            <div className="flex flex-col items-center w-8 flex-shrink-0">
            {line && <LineBadge line={{ id: line.id, shortName: line.shortName, color: line.color, textColor: line.textColor, hasTraffic: legHasTraffic }} size="sm" />}
            <div className="w-1 flex-1 min-h-[2rem]" style={{ backgroundColor: color }} />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm text-white leading-tight">
              {leg.from?.name?.replace(/^[^,]+,\s*/, '')}
            </p>
            <p className="text-xs text-slate-500">
              {leg.startTime ? new Date(leg.startTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}
            </p>
          </div>
        </div>
      );

      // Transit bar
      const stopCount = (leg.intermediateStops?.length || 0) + 1;
      timelineItems.push(
        <div key={`transit-bar-${i}`} className="flex gap-3 mb-0" style={{ minHeight: '3rem' }}>
          <div className="flex flex-col items-center w-8 flex-shrink-0">
            <div className="w-1 flex-1" style={{ backgroundColor: color }} />
          </div>
          <div className="flex items-center mb-7">
            <p className="text-xs text-slate-500">
              {durationMin} min · {stopCount} arrêt{stopCount > 1 ? 's' : ''}
            </p>
          </div>
        </div>
      );

      // Transit end
      const nextLeg = allLegs[i + 1];
      const nextIsTransit = nextLeg && nextLeg.mode !== 'WALK';

      timelineItems.push(
        <div key={`transit-end-${i}`} className="flex gap-3 items-start mb-0">
          <div className="flex flex-col items-center w-8 flex-shrink-0">
            <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
            {nextIsTransit && (
              <div className="w-0 border-l-2 border-dashed border-slate-600" style={{ height: '24px' }} />
            )}
          </div>
          <div className={nextIsTransit ? '' : ''}>
            <p className="font-semibold text-sm text-white leading-tight">
              {leg.to?.name?.replace(/^[^,]+,\s*/, '')}
            </p>
            <p className="text-xs text-slate-500">
              {leg.endTime ? new Date(leg.endTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}
            </p>
          </div>
        </div>
      );

      if (nextIsTransit) {
        timelineItems.push(
          <div key={`transfer-gap-${i}`} className="flex gap-3 items-center" style={{ minHeight: '8px' }} />
        );
      }
    }

    // Walking segments
    if (isWalk && durationMin >= 1) {
      timelineItems.push(
        <div key={`walk-${i}`} className="flex gap-3 items-center">
          <div className="flex flex-col items-center w-8 flex-shrink-0">
            {i !== 0 && (
              <div className="border-l-2 border-dashed border-slate-600" style={{ height: '28px', marginTop: '-10px' }} />
            )}
            <FaWalking className="w-5 h-5 opacity-60 flex-shrink-0 my-3 text-slate-500" />
            {i !== allLegs.length - 1 && (
              <div className="border-l-2 border-dashed border-slate-600" style={{ height: '28px', marginBottom: '12px' }} />
            )}
          </div>
          <p className="text-xs text-slate-500 mb-5">
            {isFr ? 'À pied' : 'Walk'} · {durationMin} min
          </p>
        </div>
      );
    }
  });

  return (
    <div className="overflow-y-auto flex-1 px-4 pb-4">
      {/* Title */}
      <div className="mb-4">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-2">
          {isFr ? 'Détails du trajet' : 'Journey details'}
        </p>
        <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-1">
          <span>{journey.depName}</span>
          <span>→</span>
          <span>{journey.arrName}</span>
        </h2>
        <p className="text-sm text-slate-500">
          {journey.dep} {isFr ? 'à' : 'at'} {journey.arr}
        </p>
      </div>

      {/* Lines used */}
      {journey.lineKeys?.length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {journey.lineKeys.map(lineKey => {
            const key = String(lineKey).toUpperCase().trim();
            const resolvedLine = resolveRouteLine({ lineKey: key, lineLookup, stops });
            const normalized = normalizeTrafficLineCode(key);
            const hasTraffic = normalized ? Boolean(trafficInfo?.has(normalized)) : false;
            const badgeLine = resolvedLine || {
              id: key,
              shortName: key,
              color: '#3b82f6',
              textColor: '#FFFFFF',
            };
            return (
              <div key={lineKey} className="relative">
                <div
                  className={hasTraffic ? 'cursor-pointer' : 'cursor-default'}
                  onMouseEnter={e => {
                    if (hasTraffic) {
                      setHoveredTrafficLine(key);
                      setTooltipCoords({ x: e.clientX, y: e.clientY });
                    }
                  }}
                  onMouseMove={e => {
                    if (hasTraffic) setTooltipCoords({ x: e.clientX, y: e.clientY });
                  }}
                  onMouseLeave={() => setHoveredTrafficLine(null)}
                >
                  <LineBadge
                    line={{ id: badgeLine.id, shortName: badgeLine.shortName, color: badgeLine.color, textColor: badgeLine.textColor, hasTraffic }}
                    size="sm"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {trafficLines.length > 0 && (
        <div className="mb-6">
          {hoveredTrafficLine && (() => {
            const line = trafficLines.find(l => l.lineKey === hoveredTrafficLine);
            if (!line) return null;
            const baseWidth = 280;
            const left = Math.min(tooltipCoords.x + 12, window.innerWidth - baseWidth - 8);
            const top = Math.min(tooltipCoords.y + 12, window.innerHeight - 130 - 8);
            return (
              <div style={{ left, top, width: baseWidth }} className="fixed z-[55] pointer-events-none bg-slate-900/95 border border-slate-700 text-white text-xs p-3 rounded-xl shadow-xl">
                <p className="font-semibold text-amber-400 mb-1">{isFr ? 'Infotrafic' : 'Traffic info'} {line.lineKey}</p>
                {line.details[0] ? (
                  <>
                    <p className="text-slate-200">{line.details[0].titre}</p>
                    <p className="text-slate-400 mt-1">{line.details[0].description}</p>
                    <p className="text-slate-500 mt-1">{isFr ? 'Fin estimée' : 'Estimated end'} {line.details[0].dateFin || 'N/A'}</p>
                  </>
                ) : (
                  <p className="text-slate-400">{isFr ? 'Détails indisponibles' : 'Details unavailable'}</p>
                )}
              </div>
            );
          })()}
          <motion.div
        layout
        initial={false}
        className="rounded-2xl border border-amber-700 bg-amber-950 overflow-hidden"
      >
                <div className="space-y-3">
                  {trafficLines.flatMap(({ lineKey, details }) =>
                    details.map((detail, index) => (
                      <DisruptionItem key={`${lineKey}-${detail.titre}-${index}`} detail={detail} lineKey={lineKey} />
                    )),
                  )}
                </div>
      </motion.div>
    </div>
  )}

      {/* Duration summary */}
      <div className="flex items-center gap-4 mb-6 p-3 rounded-2xl bg-slate-900 border border-slate-800">
        <div>
          <p className="text-lg font-bold text-white">{journey.dep}</p>
          <p className="text-xs text-slate-500">{isFr ? 'Départ' : 'Depart'}</p>
        </div>
        <div className="flex-1 border-t border-dashed border-slate-600" />
        <p className="text-sm font-semibold text-slate-300">{journey.dur}</p>
        <div className="flex-1 border-t border-dashed border-slate-600" />
        <div className="text-right">
          <p className="text-lg font-bold text-white">{journey.arr}</p>
          <p className="text-xs text-slate-500">{isFr ? 'Arrivée' : 'Arrival'}</p>
        </div>
      </div>

      {/* Le guidage se déclenche juste sous les horaires : on décide de partir
          après avoir lu l'heure de départ, pas avant. */}
      {onStartNavigation && (
        <button
          type="button"
          onClick={onStartNavigation}
          className="mb-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-4 text-base font-bold text-white transition hover:bg-blue-500 active:bg-blue-700"
        >
          <PlayIcon className="h-5 w-5" />
          {isFr ? 'Démarrer le trajet' : 'Start journey'}
        </button>
      )}

      {/* Timeline */}
      <div className="relative space-y-2">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-3">
          {isFr ? 'Étapes' : 'Steps'}
        </p>
        {timelineItems}
      </div>
    </div>
  );
}
