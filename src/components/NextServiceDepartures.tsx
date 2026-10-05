import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { Departure, Line } from '../types';
import { getNextServiceDayDepartures, type NextServiceDepartures as NextService } from '../services/api';
import { DepartureLineBadge } from './DepartureLineBadge';
import { ScrollingText } from './ScrollingText';
import { DepartureTags } from './TrainPill';
import { TransportModeIcon } from './TransportModeIcon';
import { resolveLineStyle, isGrenobleNetworkLine } from '../utils/lineColors';
import { normalizeMode } from '../utils/transportMode';
import { tx } from '../i18n';


const isRoundLine = (lineId: string): boolean => {
  const raw = lineId.toUpperCase().trim();
  const code = raw.includes('_') ? raw.split('_').pop()! : raw;
  if (['A', 'B', 'C', 'D', 'E'].includes(code)) return true;
  const match = /^C(\d+)$/.exec(code);
  return !!match && parseInt(match[1], 10) >= 1 && parseInt(match[1], 10) <= 14;
};

function modeLabel(departure: Departure, isFr: boolean): string {
  const mode = normalizeMode(departure.type);
  if (mode === 'METRO') return tx(isFr).nextServiceDepartures.metro;
  if (mode === 'RAIL') return tx(isFr).nextServiceDepartures.train;
  if (mode === 'TRAM') return 'Tramway';
  return 'Bus';
}

function clockOf(departure: Departure): string {
  const at = new Date(departure.at ?? Date.now() + departure.departureTime * 60000);
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
}

function dayOf(departure: Departure, isFr: boolean): string | null {
  const at = new Date(departure.at ?? Date.now() + departure.departureTime * 60000);
  const midnight = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((midnight(at) - midnight(new Date())) / 86400000);
  if (days <= 0) return null;
  if (days === 1) return tx(isFr).nextServiceDepartures.tomorrow;
  const name = at.toLocaleDateString(tx(isFr).nextServiceDepartures.locale, { weekday: 'long' });
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function NextServiceDepartures({
  stopId,
  lines,
  selectedLines,
  language,
  emptyLabel,
}: {
  stopId: string;
  lines: Line[];
  selectedLines: Set<string>;
  language: 'fr' | 'en';
  emptyLabel: string;
}) {
  const isFr = language === 'fr';
  const [loaded, setLoaded] = useState<{ stopId: string; value: NextService | null } | null>(null);

  useEffect(() => {
    let active = true;
    getNextServiceDayDepartures(stopId)
      .then(value => { if (active) setLoaded({ stopId, value }); })
      .catch(() => { if (active) setLoaded({ stopId, value: null }); });
    return () => { active = false; };
  }, [stopId]);

  const state = loaded?.stopId === stopId ? loaded.value : 'loading';

  if (state === 'loading') {
    return (
      <p className="text-sm text-slate-500 py-6 text-center">
        {tx(isFr).nextServiceDepartures.lookingUpTheFirst}
      </p>
    );
  }

  if (!state) {
    return <p className="text-sm text-slate-500 py-6 text-center">{emptyLabel}</p>;
  }

  const shown = selectedLines.size === 0
    ? state.departures
    : state.departures.filter(departure => selectedLines.has(departure.lineId));

  if (shown.length === 0) {
    return <p className="text-sm text-slate-500 py-6 text-center">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-2">

      {shown.map((departure, index) => {
        const line = lines.find(
          candidate =>
            candidate.id === departure.lineId ||
            candidate.shortName === departure.lineShortName ||
            candidate.shortName === departure.lineId,
        );
        const routeRef = line?.routeId || departure.routeId || departure.lineId;
        const day = dayOf(departure, isFr);
        const style = line
          ? resolveLineStyle(routeRef, line.color, line.textColor)
          : resolveLineStyle(routeRef);

        return (
          <motion.div
            key={`${departure.lineId}::${departure.destination}::${departure.departureTime}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index, 8) * 0.04 }}
            className="flex items-center justify-between p-3 rounded-2xl border border-slate-700 bg-slate-800"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <DepartureLineBadge
                routeRef={routeRef}
                label={departure.lineShortName || departure.lineId}
                style={style}
                round={isGrenobleNetworkLine(routeRef) && isRoundLine(departure.lineId)}
                sizeClass="w-10 h-10 text-sm"
              />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <div className="min-w-0 flex-initial">
                    <ScrollingText text={departure.destination} className="text-sm font-semibold text-white" />
                  </div>
                  <DepartureTags departure={departure} language={language} />
                </div>
                <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                  <TransportModeIcon mode={departure.type} className="w-3 h-3" />
                  {modeLabel(departure, isFr)}
                </p>
              </div>
            </div>
            <div className="ml-2 flex flex-shrink-0 flex-col items-end">
              {day && <span className="text-[0.6875rem] font-semibold leading-tight text-slate-400">{day}</span>}
              <p className="text-lg font-bold leading-tight text-white tabular">{clockOf(departure)}</p>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
