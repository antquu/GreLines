import { useState, type ReactNode } from 'react';
import { FaWalking } from 'react-icons/fa';
import { LineBadge } from './LineBadge';
import { TrafficAlertCard } from './TrafficAlertCard';
import { VehicleGlyph } from './VehicleGlyph';
import { MdDirectionsBike } from 'react-icons/md';

/** Les modes qu'on pédale, et le vert qui les désigne partout. */
const BIKE_MODES = new Set(['BICYCLE', 'BICYCLE_RENT']);
const BIKE_COLOR = '#22c55e';
import { JourneyFareBlock } from './JourneyFare';
import type { RouteItinerary } from '../services/api';
import type { AllLinesLine } from '../services/allLines';
import type { JourneyIntermediateStop, TrafficDetail } from '../types';
import { resolveRouteLine } from '../utils/routeLineResolver';
import { formatDistance } from '../utils/geo';
import { journeyOperatorBrand } from '../utils/journeyOperator';
import {
  formFactorLabel,
  SHARED_OPERATOR_COLORS,
  SHARED_OPERATOR_LABELS,
  type SharedOperator,
} from '../services/sharedMobility';
import { ChevronDownIcon, PlayIcon } from '@heroicons/react/24/solid';

interface JourneyDetailsProps {
  journey: RouteItinerary;
  language: 'fr' | 'en';
  stops: any[];
  lineLookup?: Map<string, AllLinesLine> | null;
  trafficInfo?: Map<string, TrafficDetail[]>;
  /** Décide de la variante des logos d'opérateurs. */
  theme?: 'light' | 'dark';

  onStartNavigation?: () => void;
}

export function JourneyDetailsPreview({ journey, language, stops, lineLookup, trafficInfo, theme, onStartNavigation }: JourneyDetailsProps) {
  const isFr = language === 'fr';
  const brand = journeyOperatorBrand(journey, theme === 'light' ? 'light' : 'dark');
  const [hoveredTrafficLine, setHoveredTrafficLine] = useState<string | null>(null);
  const [tooltipCoords, setTooltipCoords] = useState({ x: 0, y: 0 });
  // Les arrêts intermédiaires restent repliés : sur un trajet de vingt arrêts,
  // les déplier d'office repousserait la fin du trajet hors de l'écran.
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

    // Course en véhicule partagé : pas de ligne, pas d'arrêt — le véhicule, sa
    // couleur d'opérateur, et ce qu'il reste à parcourir.
    const sharedOperator = leg.sharedOperator as SharedOperator | undefined;
    if (sharedOperator) {
      const operatorColor = SHARED_OPERATOR_COLORS[sharedOperator];
      const formFactor = String(leg.sharedFormFactor || (sharedOperator === 'citiz' ? 'car' : 'scooter'));
      // Le véhicule et le point d'arrivée tiennent dans un seul bloc : séparés,
      // l'espacement de la liste coupait le trait juste avant la pastille
      // finale.
      timelineItems.push(
        <div key={`shared-${i}`} className="flex gap-3">
          <div className="flex w-8 flex-shrink-0 flex-col items-center">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full"
              style={{ backgroundColor: operatorColor }}
            >
              <VehicleGlyph formFactor={formFactor} size={18} />
            </div>
            <div className="w-1 flex-1 min-h-[2.5rem]" style={{ backgroundColor: operatorColor }} />
            <div className="h-4 w-4 flex-shrink-0 rounded-full" style={{ backgroundColor: operatorColor }} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-between gap-6">
            <div className="min-w-0">
              {/* « Voiture Citiz » n'existe pas : pour une voiture, le type ne
                  dit rien de plus que la marque, et `formFactorLabel` le laisse
                  vide. */}
              <p className="text-sm font-semibold leading-tight text-white">
                {[formFactorLabel(formFactor, language), SHARED_OPERATOR_LABELS[sharedOperator]]
                  .filter(Boolean)
                  .join(' ')}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {durationMin} min · {formatDistance(Number(leg.distance || 0), language)}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {formatClock(leg.startTime)} → {formatClock(leg.endTime)}
              </p>
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight text-white">
                {leg.to?.name?.replace(/^[^,]+,\s*/, '')}
              </p>
              <p className="text-xs text-slate-500">{formatClock(leg.endTime)}</p>
            </div>
          </div>
        </div>
      );
      return;
    }

    /*
     * À vélo.
     *
     * Sans ce cas, le vélo retombait dans le tronçon de ligne ordinaire : un
     * trait gris, sans pastille, annoncé en « minutes et arrêts » alors qu'il
     * ne dessert rien. Il prend donc la même forme que les autres modes qui ne
     * sont pas des lignes — un carré à sa couleur, son pictogramme en blanc,
     * son trait de la même teinte — et se dit en distance, qui est ce qu'on
     * veut savoir avant d'enfourcher.
     */
    if (BIKE_MODES.has(String(leg.mode ?? '').toUpperCase())) {
      timelineItems.push(
        <div key={`bike-${i}`} className="flex gap-3">
          <div className="flex w-8 flex-shrink-0 flex-col items-center">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ backgroundColor: BIKE_COLOR }}
            >
              <MdDirectionsBike size={18} color="#ffffff" />
            </div>
            <div className="w-1 flex-1 min-h-[2.5rem]" style={{ backgroundColor: BIKE_COLOR }} />
            <div className="h-4 w-4 flex-shrink-0 rounded-full" style={{ backgroundColor: BIKE_COLOR }} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-between gap-6">
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight text-white">
                {isFr ? 'À vélo' : 'By bike'}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {durationMin} min
                {leg.distance ? ` · ${formatDistance(Number(leg.distance), language)}` : ''}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {formatClock(leg.startTime)} → {formatClock(leg.endTime)}
              </p>
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight text-white">
                {leg.to?.name?.replace(/^[^,]+,\s*/, '')}
              </p>
              <p className="text-xs text-slate-500">{formatClock(leg.endTime)}</p>
            </div>
          </div>
        </div>
      );
      return;
    }

    // Course VTC ou taxi : même forme, mais aucune marche d'approche — le
    // véhicule vient au point de départ.
    if (leg.uberProduct || leg.taxiCompany) {
      const uberColor = leg.taxiCompany ? '#f59e0b' : '#64748b';
      timelineItems.push(
        <div key={`uber-${i}`} className="flex gap-3">
          <div className="flex w-8 flex-shrink-0 flex-col items-center">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full"
              style={{ backgroundColor: uberColor }}
            >
              <VehicleGlyph formFactor="car" size={18} />
            </div>
            <div className="w-1 flex-1 min-h-[2.5rem]" style={{ backgroundColor: uberColor }} />
            <div className="h-4 w-4 flex-shrink-0 rounded-full" style={{ backgroundColor: uberColor }} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-between gap-6">
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight text-white">
                {String(leg.uberProduct ?? leg.taxiCompany)}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {durationMin} min · {formatDistance(Number(leg.distance || 0), language)}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {formatClock(leg.startTime)} → {formatClock(leg.endTime)}
              </p>
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight text-white">
                {leg.to?.name?.replace(/^[^,]+,\s*/, '')}
              </p>
              <p className="text-xs text-slate-500">{formatClock(leg.endTime)}</p>
            </div>
          </div>
        </div>
      );
      return;
    }

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

      // Transit bar — dépliable sur les arrêts desservis entre la montée et la
      // descente, pour repérer où l'on passe sans quitter la fiche.
      const intermediateStops: JourneyIntermediateStop[] = Array.isArray(leg.intermediateStops)
        ? leg.intermediateStops
        : [];
      const stopCount = intermediateStops.length + 1;
      const isExpanded = expandedLegs.has(i);
      timelineItems.push(
        <div key={`transit-bar-${i}`} className="flex gap-3 mb-0" style={{ minHeight: '3rem' }}>
          <div className="flex flex-col items-center w-8 flex-shrink-0">
            <div className="w-1 flex-1" style={{ backgroundColor: color }} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-center pb-7">
            {intermediateStops.length > 0 ? (
              <button
                type="button"
                onClick={() => toggleLeg(i)}
                aria-expanded={isExpanded}
                className="flex items-center gap-1.5 rounded-lg text-xs text-slate-500 transition hover:text-slate-300"
              >
                <span>
                  {durationMin} min · {stopCount} arrêt{stopCount > 1 ? 's' : ''}
                </span>
                <ChevronDownIcon
                  className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                />
              </button>
            ) : (
              <p className="text-xs text-slate-500">
                {durationMin} min · {stopCount} arrêt{stopCount > 1 ? 's' : ''}
              </p>
            )}

            {/* Dépliement animé en hauteur : la liste pousse la suite du trajet
                vers le bas, et l'œil suit le mouvement au lieu de chercher ce
                qui a changé. La transition porte sur la grille — `height: auto`
                ne s'anime pas — et l'état d'arrivée reste du CSS, donc juste
                même si l'animation ne joue pas. Le trait de la ligne suffit à
                porter les arrêts : un second filet à côté ferait doublon. */}
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
                    <span className="truncate text-xs text-slate-400">
                      {String(stop?.name ?? '').replace(/^[^,]+,\s*/, '')}
                    </span>
                    <span className="flex-shrink-0 text-[11px] text-slate-600">
                      {formatClock(stop?.arrival ?? stop?.departure)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
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
          <div className="mb-5 min-w-0">
            <p className="text-xs text-slate-500">
              {isFr ? 'À pied' : 'Walk'} · {durationMin} min
              {leg.distance ? ` · ${formatDistance(Number(leg.distance), language)}` : ''}
            </p>
            {/* Marche d'approche vers un véhicule partagé : sans le point
                d'arrivée, on ne sait pas vers quoi on marche. */}
            {allLegs[i + 1]?.sharedOperator && (
              <p className="mt-0.5 truncate text-xs text-slate-500">
                → {String(leg.to?.name ?? '').replace(/^[^,]+,\s*/, '')}
              </p>
            )}
          </div>
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
        {/* Deux noms d'arrêts longs ne tiennent pas sur une ligne de téléphone :
            ils passent à la ligne plutôt que de déborder de l'écran. */}
        <h2 className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-lg font-semibold text-white">
          <span className="break-words">{journey.depName}</span>
          <span aria-hidden>→</span>
          <span className="break-words">{journey.arrName}</span>
        </h2>
        <p className="text-sm text-slate-500">
          {journey.dep} {isFr ? 'à' : 'at'} {journey.arr}
        </p>
      </div>

      {/* Marque de l'option, puis l'état du véhicule : la batterie décide autant
          que le prix. */}
      {brand && (
        <img
          src={brand.logo}
          alt={brand.name}
          className="mb-3 h-8 w-auto max-w-[128px] object-contain object-left"
        />
      )}

      {journey.shared && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          {journey.shared.model && (
            <span className="rounded-full bg-slate-800 px-2.5 py-1 text-slate-300">
              {journey.shared.model}
            </span>
          )}
          {typeof journey.shared.batteryPercent === 'number' && (
            <span className="rounded-full bg-slate-800 px-2.5 py-1 text-slate-300">
              {journey.shared.batteryPercent} %
            </span>
          )}
          <span className="rounded-full bg-slate-800 px-2.5 py-1 text-slate-300">
            {isFr ? 'à' : ''} {formatDistance(journey.shared.accessMeters, language)}{' '}
            {isFr ? 'à pied' : 'walk away'}
          </span>
        </div>
      )}

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
          {/* Une carte par perturbation, et non un bloc unique qui les
              regroupait derrière un seul cadre : chacune se déplie pour elle
              seule, comme dans la fiche d'un arrêt. */}
          <div className="space-y-2.5">
            {trafficLines.flatMap(({ lineKey, details }) =>
              details.map((detail, index) => (
                <TrafficAlertCard
                  key={`${lineKey}-${detail.titre}-${index}`}
                  detail={detail}
                  language={language}
                  heading={`${isFr ? 'Perturbation' : 'Disruption'} ${lineKey}`}
                />
              )),
            )}
          </div>
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

      <JourneyFareBlock journey={journey} language={language} />

      {/* Ouvrir l'application de l'opérateur est le seul geste qui déverrouille
          le véhicule — ou commande la course : le lien vaut mieux qu'une
          consigne. */}
      {brand && (journey.shared?.rentalUrl || journey.uber) && (
        <a
          href={journey.uber ? journey.uber.deeplink : journey.shared!.rentalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-6 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-bold transition hover:brightness-110"
          style={{
            backgroundColor: journey.shared ? brand.color : '#0f172a',
            color: '#ffffff',
          }}
        >
          <VehicleGlyph formFactor={journey.shared?.formFactor ?? 'car'} size={18} />
          {isFr ? "Ouvrir l'application" : 'Open the app'} {brand.name}
        </a>
      )}

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
