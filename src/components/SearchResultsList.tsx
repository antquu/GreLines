/**
 * Ce qu'une recherche rend, en pleine largeur.
 *
 * La liste tenait dans un menu flottant sous le champ, à peine plus large
 * qu'un doigt et haut de la moitié de l'écran. On y lisait un nom d'arrêt sans
 * savoir ce qui s'y arrête, et les lignes n'y paraissaient pas du tout.
 *
 * Ici chaque réponse occupe toute la largeur, séparée de la suivante par un
 * filet, et dit ce qu'elle est :
 *
 *   — une ligne porte un trait vertical à sa couleur, son nom, et l'état de
 *     son service ;
 *   — un arrêt porte son nom, et sous lui les couleurs de ce qui s'y arrête,
 *     qui est ce qu'on vérifie avant de choisir ;
 *   — une adresse porte son nom et sa commune.
 *
 * Le fond reste celui du thème : c'est une liste, pas une fenêtre.
 */

import { useEffect, useState } from 'react';
import { MapPinIcon } from '@heroicons/react/24/solid';
import { getCachedStopLines, getStopLines } from '../services/api';
import { resolveLineStyle } from '../utils/lineColors';
import type { RouteLocation } from '../services/api';
import type { AllLinesLine } from '../services/allLines';
import type { Line, TrafficDetail } from '../types';

interface SearchResultsListProps {
  lines?: AllLinesLine[];
  stops: RouteLocation[];
  addresses: RouteLocation[];
  language: 'fr' | 'en';
  isLight: boolean;
  trafficInfo?: Map<string, TrafficDetail[]>;
  onSelectLocation: (location: RouteLocation) => void;
  onSelectLine?: (line: AllLinesLine) => void;
}

/** Le code d'une ligne tel que l'info-trafic le publie. */
function trafficKey(value?: string | null): string | null {
  if (!value) return null;
  return String(value).toUpperCase().replace(/^(?:SEM:|SEM_)/, '').trim() || null;
}

/**
 * Les lignes qui desservent les arrêts affichés.
 *
 * Le cache répond tout de suite pour un arrêt déjà consulté ; les autres sont
 * demandés au réseau, et la liste se complète sous les yeux. Aucune attente
 * n'est imposée : un arrêt sans couleurs reste un arrêt qu'on peut choisir.
 */
function useStopLines(stops: RouteLocation[]): Map<string, Line[]> {
  const [lines, setLines] = useState<Map<string, Line[]>>(new Map());
  const ids = stops.map(stop => stop.id).join('|');

  useEffect(() => {
    let alive = true;
    const next = new Map<string, Line[]>();
    const missing: string[] = [];

    for (const stop of stops) {
      const cached = getCachedStopLines(stop.id);
      if (cached) next.set(stop.id, cached);
      else missing.push(stop.id);
    }
    setLines(next);

    if (missing.length === 0) return;
    /* Les demandes partent ensemble : elles sont indépendantes, et les
       enchaîner aurait fait apparaître les couleurs arrêt après arrêt. */
    void Promise.all(
      missing.map(id =>
        getStopLines(id)
          .then(result => [id, result] as const)
          .catch(() => [id, [] as Line[]] as const),
      ),
    ).then(results => {
      if (!alive) return;
      setLines(current => {
        const merged = new Map(current);
        for (const [id, result] of results) merged.set(id, result);
        return merged;
      });
    });

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  return lines;
}

export function SearchResultsList({
  lines = [],
  stops,
  addresses,
  language,
  isLight,
  trafficInfo,
  onSelectLocation,
  onSelectLine,
}: SearchResultsListProps) {
  const fr = language === 'fr';
  const stopLines = useStopLines(stops);

  const ink = isLight ? 'text-slate-900' : 'text-white';
  const muted = isLight ? 'text-slate-500' : 'text-white/60';
  const divider = isLight ? 'border-slate-200' : 'border-white/10';
  const rowClass = `flex w-full items-start gap-4 border-b px-5 py-4 text-left transition ${divider} ${
    isLight ? 'active:bg-slate-100' : 'active:bg-white/5'
  }`;

  if (lines.length === 0 && stops.length === 0 && addresses.length === 0) return null;

  return (
    /* Les arrêts passent devant les lignes : le champ demande où l'on va, et
       une ligne n'est pas une destination. Elle reste proposée, en dessous,
       pour qui tapait son numéro. */
    <div className="flex flex-col">
      {stops.map(stop => {
        const served = stopLines.get(stop.id) ?? [];
        return (
          <button
            key={`stop-${stop.id}`}
            type="button"
            onMouseDown={event => event.preventDefault()}
            onClick={() => onSelectLocation(stop)}
            className={rowClass}
          >
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-[22px] font-bold leading-tight ${ink}`}>
                {stop.label}
              </span>
              {served.length > 0 ? (
                /* Les couleurs de ce qui s'y arrête, sans les numéros : à cette
                   taille un numéro ne se lit pas, tandis qu'une file de
                   couleurs se reconnaît d'un coup d'œil. */
                <span className="mt-2 flex flex-wrap items-center gap-1.5">
                  {served.slice(0, 8).map(line => (
                    <span
                      key={line.id}
                      className="h-2 w-6 rounded-full"
                      style={{
                        backgroundColor: resolveLineStyle(line.id, line.color, line.textColor)
                          .backgroundColor,
                      }}
                      aria-hidden
                    />
                  ))}
                </span>
              ) : (
                <span className={`mt-0.5 block truncate text-[17px] leading-tight ${muted}`}>
                  {stop.raw?.city || ''}
                </span>
              )}
            </span>
          </button>
        );
      })}

      {lines.map(line => {
        const alerts = trafficInfo?.get(trafficKey(line.shortName) ?? '') ?? null;
        const style = resolveLineStyle(line.id, line.color, line.textColor);
        return (
          <button
            key={`line-${line.id}`}
            type="button"
            onMouseDown={event => event.preventDefault()}
            onClick={() => onSelectLine?.(line)}
            disabled={!onSelectLine}
            className={rowClass}
          >
            {/* Le trait de la ligne, à sa couleur : c'est à lui qu'on la
                reconnaît sur un plan, avant d'avoir lu son numéro. */}
            <span
              className="mt-1 h-10 w-1.5 flex-shrink-0 rounded-full"
              style={{ backgroundColor: style.backgroundColor }}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-[22px] font-bold leading-tight ${ink}`}>
                {fr ? `Ligne ${line.shortName}` : `Line ${line.shortName}`}
              </span>
              <span
                className={`mt-0.5 block truncate text-[17px] leading-tight ${
                  alerts && alerts.length > 0 ? 'text-amber-500' : muted
                }`}
              >
                {alerts && alerts.length > 0
                  ? alerts[0].titre
                  : fr
                    ? 'Service normal'
                    : 'Good service'}
              </span>
            </span>
          </button>
        );
      })}

      {addresses.map(address => (
        <button
          key={`address-${address.id}`}
          type="button"
          onMouseDown={event => event.preventDefault()}
          onClick={() => onSelectLocation(address)}
          className={rowClass}
        >
          <MapPinIcon className={`mt-1 h-6 w-6 flex-shrink-0 ${muted}`} />
          <span className="min-w-0 flex-1">
            <span className={`block truncate text-[22px] font-bold leading-tight ${ink}`}>
              {address.raw?.name || address.label}
            </span>
            <span className={`mt-0.5 block truncate text-[17px] leading-tight ${muted}`}>
              {address.raw?.context || address.label}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
