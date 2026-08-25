/**
 * La fiche d'un arrêt M'Covoit.
 *
 * Un point de covoiturage n'est pas un arrêt de bus, et lui appliquer la même
 * fiche mentait sur ce qu'il est : aucun véhicule n'y passe à heure fixe, donc
 * pas de prochains départs à annoncer, et pas de lignes à cocher pour filtrer
 * des passages qui n'existent pas. La fiche disait « aucun passage prévu », ce
 * qui se lisait comme une panne alors que c'est le principe même du service.
 *
 * Elle dit donc autre chose : voici un point de covoiturage, et voici les
 * liaisons qui le desservent. On attend là, on lève le pouce, quelqu'un
 * s'arrête.
 */

import { FaMapSigns } from 'react-icons/fa';
import { ArrowsRightLeftIcon } from '@heroicons/react/24/solid';
import type { McoLine } from '../services/mcoLines';

/** Le préfixe réseau des points de covoiturage. */
export const CARPOOL_PREFIX = 'MCO:';

/** Vrai pour un arrêt du réseau M'Covoit. */
export function isCarpoolStop(stopId: string | undefined | null): boolean {
  return String(stopId ?? '').toUpperCase().startsWith(CARPOOL_PREFIX);
}

/**
 * Une ligne relève du covoiturage.
 *
 * L'identifiant nu ne suffit pas — « GRES » ne dit pas de quel réseau il vient
 * —, alors on lit d'abord l'identifiant complet de la course, « MCO:GRES »,
 * que l'API des lignes rend à côté.
 */
export function isCarpoolLine(line: { id: string; routeId?: string }): boolean {
  const full = String(line.routeId ?? '').toUpperCase();
  if (full) return full.startsWith(CARPOOL_PREFIX);
  return false;
}

/**
 * Les deux extrémités d'une liaison, si son nom les nomme.
 *
 * Le réseau écrit « Grésivaudan - Grenoble », parfois avec un tiret cadratin.
 * Un nom qui n'a pas cette forme est rendu tel quel, sans être coupé au
 * hasard sur le premier tiret venu : « Saint-Martin-d'Uriage » en compte deux.
 */
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
  /** Les liaisons qui desservent ce point. */
  lines: McoLine[];
  language: 'fr' | 'en';
  isLight?: boolean;
}) {
  const isFr = language === 'fr';

  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {/* Le panneau de direction : c'est le mobilier qu'on trouve au bord de la
          route, et il dit le service mieux qu'un pictogramme de voiture, qui
          aurait désigné le véhicule plutôt que le point d'attente. */}
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
          {/* Plus grandes que le reste, sans l'être plus que le titre : ce sont
              elles qu'on vient chercher. Aucun filtre, rien à cocher — il n'y a
              pas de liste de passages à trier. */}
          <div className="mt-4 flex flex-col items-center gap-2.5">
            {lines.map(line => (
              <div key={line.code} className="flex flex-col items-center">
                <span
                  className="rounded-xl px-4 py-1.5 text-base font-extrabold"
                  style={{ backgroundColor: line.color, color: line.textColor }}
                >
                  {line.shortName}
                </span>
                {/* Les deux bouts de la liaison, séparés par la double flèche
                    plutôt que par un tiret : « Grésivaudan - Grenoble » se lit
                    comme un nom composé, « Grésivaudan ⇄ Grenoble » dit qu'on
                    va de l'un à l'autre, et dans les deux sens. */}
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
