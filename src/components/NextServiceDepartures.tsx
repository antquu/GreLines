import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { Departure, Line } from '../types';
import { getNextServiceDayDepartures, type NextServiceDepartures as NextService } from '../services/api';
import { DepartureLineBadge } from './DepartureLineBadge';
import { TransportModeIcon } from './TransportModeIcon';
import { resolveLineStyle, isGrenobleNetworkLine } from '../utils/lineColors';
import { normalizeMode } from '../utils/transportMode';

/**
 * Les premiers passages du lendemain matin, quand la journée est finie.
 *
 * Le soir, passé le dernier bus, le temps réel ne rend plus rien et la fiche
 * n'affichait qu'« Aucun départ disponible » — une phrase juste, qui ne répond
 * pas à la seule question qu'on se pose à cette heure-là : à quelle heure ça
 * reprend. On va donc chercher les horaires théoriques du prochain jour de
 * service, dont les premiers départs tombent vers cinq heures.
 *
 * Les heures sont absolues, jamais un décompte : « 5:12 » se lit d'un coup
 * d'oeil là où « dans 7h04 » demande une soustraction, et un décompte affiché
 * le soir aurait de toute façon vieilli avant qu'on s'en serve.
 */

const isRoundLine = (lineId: string): boolean => {
  const raw = lineId.toUpperCase().trim();
  const code = raw.includes('_') ? raw.split('_').pop()! : raw;
  if (['A', 'B', 'C', 'D', 'E'].includes(code)) return true;
  const match = /^C(\d+)$/.exec(code);
  return !!match && parseInt(match[1], 10) >= 1 && parseInt(match[1], 10) <= 14;
};

/** Le nom du mode, accordé au pictogramme qui l'accompagne. */
function modeLabel(departure: Departure, isFr: boolean): string {
  const mode = normalizeMode(departure.type);
  if (mode === 'METRO') return isFr ? 'Métro' : 'Metro';
  if (mode === 'RAIL') return isFr ? 'Train' : 'Train';
  if (mode === 'TRAM') return 'Tramway';
  return 'Bus';
}

/** L'heure d'un passage à venir, en absolu. */
function clockOf(departure: Departure): string {
  const at = new Date(departure.at ?? Date.now() + departure.departureTime * 60000);
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
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
  /** Ce qu'on affichait avant : le repli du repli, si le réseau ne publie rien. */
  emptyLabel: string;
}) {
  const isFr = language === 'fr';
  /* La réponse porte l'arrêt qu'elle concerne : c'est ce qui distingue
     « en cours de chargement » de « rien à annoncer » quand on passe d'un
     arrêt à l'autre, sans avoir à remettre un état à zéro au montage. */
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
        {isFr ? 'Recherche des premiers passages…' : 'Looking up the first departures…'}
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

  /* Avant quatre heures du matin, la reprise est celle du jour même : la
     phrase ne peut pas parler de demain. */
  const heading = state.tomorrow
    ? (isFr ? "Plus de passage aujourd'hui. Reprise demain matin :" : 'No more departures today. Service resumes tomorrow morning:')
    : (isFr ? 'Reprise du service ce matin :' : 'Service resumes this morning:');

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 pb-1">
        <p className="text-sm text-slate-400">{heading}</p>
        <span className="shrink-0 whitespace-nowrap rounded-full bg-amber-300/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-amber-300">
          {isFr ? 'Théorique' : 'Scheduled'}
        </span>
      </div>

      {shown.map((departure, index) => {
        const line = lines.find(
          candidate =>
            candidate.id === departure.lineId ||
            candidate.shortName === departure.lineShortName ||
            candidate.shortName === departure.lineId,
        );
        const routeRef = line?.routeId || departure.routeId || departure.lineId;
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
                <p className="text-sm font-semibold text-white truncate">{departure.destination}</p>
                <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                  <TransportModeIcon mode={departure.type} className="w-3 h-3" />
                  {modeLabel(departure, isFr)}
                </p>
              </div>
            </div>
            <p className="text-lg font-bold text-white tabular flex-shrink-0 ml-2">{clockOf(departure)}</p>
          </motion.div>
        );
      })}
    </div>
  );
}
