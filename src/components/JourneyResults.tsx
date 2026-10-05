import { LineBadge } from './LineBadge';
import { FaWalking, FaWheelchair } from 'react-icons/fa';
import { MdDirectionsBike } from 'react-icons/md';
import { journeyFareChip } from '../utils/journeyFare';
import { resolveRouteLine } from '../utils/routeLineResolver';
import { isJourneyStepFree } from '../services/stopAccessibility';
import { useAccessibleStops } from '../hooks/useAccessibleStops';
import { journeyLabels, sameJourney } from '../utils/journeyLabels';
import { formatDurationLabel } from '../utils/formatDuration';
import { journeyOperatorBrand } from '../utils/journeyOperator';
import type { RouteItinerary } from '../services/api';
import type { AllLinesLine } from '../services/allLines';
import { t, tx } from '../i18n';

const BIKE_MODES = new Set(['BICYCLE', 'BICYCLE_RENT']);

interface JourneyResultsProps {
  journeys: RouteItinerary[];
  language: 'fr' | 'en';
  stops?: unknown[];
  lineLookup?: Map<string, AllLinesLine> | null;
  theme?: 'light' | 'dark';
  selected?: RouteItinerary | null;
  onSelect?: (journey: RouteItinerary) => void;
}

export function JourneyResults({
  journeys,
  language,
  stops,
  lineLookup,
  theme,
  selected,
  onSelect,
}: JourneyResultsProps) {
  const fr = language === 'fr';
  const isLight = theme === 'light';
  const accessibleStops = useAccessibleStops();
  const labels = journeyLabels(journeys, language);

  if (journeys.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {journeys.map((journey, index) => {
        const fare = journeyFareChip(journey, language);
        const stepFree = isJourneyStepFree(accessibleStops, journey.allLegs);
        const isSelected = sameJourney(selected, journey);
        const brand = journeyOperatorBrand(journey, isLight ? 'light' : 'dark');

        return (
          <button
            key={`${journey.dep}-${journey.arr}-${journey.dur}-${index}`}
            type="button"
            onClick={() => onSelect?.(journey)}
            className={`w-full rounded-[22px] px-5 py-5 text-left transition active:scale-[0.99] ${
              isLight
                ? `bg-white ${isSelected ? 'ring-2 ring-blue-500' : 'ring-1 ring-slate-200'}`
                : `bg-black ${isSelected ? 'ring-2 ring-blue-500' : 'ring-1 ring-white/10'}`
            }`}
          >
            <div className="flex items-start gap-3">
              {brand ? (
                <img
                  src={brand.logo}
                  alt={brand.name}
                  draggable={false}
                  className="h-7 w-auto flex-1 self-center object-contain object-left"
                />
              ) : (
              <h3
                style={{
                  fontSize: '26px',
                  lineHeight: 1.15,
                  fontWeight: 600,
                  letterSpacing: '-0.01em',
                  color: isLight ? '#0f172a' : '#ffffff',
                  margin: 0,
                  flex: '1 1 auto',
                  minWidth: 0,
                }}
              >
                {labels[index]}
              </h3>
              )}
              {stepFree && (
                <span
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-600"
                  title={tx(fr).journeyResults.stepFreeJourney}
                >
                  <FaWheelchair size={16} style={{ color: '#ffffff' }} />
                </span>
              )}
            </div>

            <div className="mt-2">
              <p className={`text-[0.9375rem] leading-snug ${isLight ? 'text-slate-600' : 'text-white/70'}`}>
                {t(language).journey.leaveAt(journey.dep)}
              </p>
              <JourneyUrgency journey={journey} language={language} />
            </div>
            {fare && (
              <div className="mt-0.5">
                <p className={`text-[0.9375rem] leading-snug ${isLight ? 'text-slate-600' : 'text-white/70'}`}>
                  {fare}
                </p>
              </div>
            )}

            <div className="mt-4 flex items-end gap-3">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                <JourneyChips
                  journey={journey}
                  stops={stops}
                  lineLookup={lineLookup}
                  isLight={isLight}
                />
              </div>
              <span
                className={`tabular flex-shrink-0 text-[1.25rem] font-bold leading-none ${
                  isLight ? 'text-slate-900' : 'text-white'
                }`}
              >
                {formatDurationLabel(journey.dur)}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function JourneyChips({
  journey,
  stops,
  lineLookup,
  isLight,
}: {
  journey: RouteItinerary;
  stops?: unknown[];
  lineLookup?: Map<string, AllLinesLine> | null;
  isLight: boolean;
}) {
  const legs = (journey.allLegs || []) as Array<Record<string, unknown>>;
  const muted = isLight ? 'text-slate-600' : 'text-white/70';

  return (
    <>
      {legs.map((leg, index) => {
        const mode = String(leg.mode ?? '').toUpperCase();
        const minutes = Math.round(Number(leg.duration ?? 0) / 60);

        if (mode === 'WALK') {
          if (minutes < 2) return null;
          return (
            <span key={`walk-${index}`} className={`flex items-center gap-1 text-[0.9375rem] font-semibold ${muted}`}>
              <FaWalking size={15} />
              {minutes}
            </span>
          );
        }

        if (BIKE_MODES.has(mode)) {
          return (
            <span key={`bike-${index}`} className={`flex items-center gap-1 text-[0.9375rem] font-semibold ${muted}`}>
              <MdDirectionsBike size={17} />
              {minutes}
            </span>
          );
        }

        const line = resolveRouteLine({
          routeShortName: leg.routeShortName as string | undefined,
          route: leg.route as string | undefined,
          routeId: leg.routeId as string | undefined,
          lineLookup,
          stops,
        });
        if (!line) return null;

        return (
          <LineBadge
            key={`line-${index}`}
            line={{
              id: line.id,
              shortName: line.shortName,
              color: line.color,
              textColor: line.textColor,
            }}
            size="xs"
          />
        );
      })}
    </>
  );
}

function JourneyUrgency({ journey, language }: { journey: RouteItinerary; language: 'fr' | 'en' }) {
  const text = t(language).journey;
  const boarding = (journey.allLegs ?? []).find(leg => leg?.mode && leg.mode !== 'WALK');
  const line = String(boarding?.routeShortName ?? journey.lineKeys[0] ?? '').replace(/^SEM:/, '');
  const at = Number(boarding?.startTime);
  const time = Number.isFinite(at) ? new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
  return (
    <>
      {journey.rush ? (
        <p className="mt-0.5 text-[0.9375rem] font-semibold leading-snug text-red-400">
          {text.rush(line, time)}
        </p>
      ) : journey.tight ? (
        <p className="mt-0.5 text-[0.9375rem] font-semibold leading-snug text-amber-500">
          {text.tight}
        </p>
      ) : null}
      {journey.busDelayMinutes ? (
        <p className="mt-0.5 text-[0.9375rem] leading-snug text-amber-500">
          {journey.busDelayMinutes > 0 ? text.busLate(line, journey.busDelayMinutes) : text.busEarly(line, -journey.busDelayMinutes)}
        </p>
      ) : null}
    </>
  );
}
