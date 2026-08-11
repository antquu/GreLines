import { useEffect, useRef, useState } from 'react';
import { ExclamationTriangleIcon, ArrowPathIcon } from '@heroicons/react/24/solid';
import type { Departure, StopDetail } from '../types';
import { getStopDetail, refreshStopDepartures } from '../services/api';
import { getTclStopDetail, isTclId } from '../services/tclNetwork';
import { TransportModeIcon } from '../components/TransportModeIcon';
import { resolveLineBackgroundColor } from '../utils/lineColors';
import { ScreenTopBar } from './ScreenTopBar';
import { ScreenTicker } from './ScreenTicker';
import { ScreenLineBadge } from './ScreenLineBadge';
import { useAutoScroll } from './useAutoScroll';
import {
  departureDisplay,
  groupDeparturesForScreen,
  TIMES_PER_DIRECTION,
  type ScreenLayout,
  type ScreenLineGroup,
} from './screenUtils';


const REFRESH_MS = 30_000;


const tint = (color: string) => `color-mix(in srgb, ${color} 13%, #ffffff)`;

/**
 * Un pavé de passage.
 *
 * Les trois pavés d'une direction sont identiques : l'ordre de lecture, de
 * gauche à droite, dit déjà lequel est le prochain. Ils reprennent la teinte
 * du bandeau de direction, donc celle de la ligne, très diluée — la couleur
 * franche reste sur la pastille, et un chiffre lisible de loin veut de l'encre
 * noire sur fond pâle.
 *
 * Les chiffres sont alignés à gauche, pas centrés : sur une grille de cartes,
 * un bord gauche commun se balaie du regard bien plus vite que trois axes de
 * symétrie qui se décalent selon le nombre de chiffres.
 */
function TimeCell({ departure, color }: { departure?: Departure; color: string }) {
  const background = { backgroundColor: tint(color) };

  if (!departure) {
    return (
      <div className="flex items-center rounded-xl px-3 py-2" style={background}>
        <span className="tabular text-2xl font-extrabold leading-none text-slate-400 2xl:text-4xl">–</span>
      </div>
    );
  }

  const { value, isArrival, isClockTime } = departureDisplay(departure);

  return (
    <div className="flex items-center gap-1.5 rounded-xl px-3 py-2" style={background}>
      <span
        className={`tabular whitespace-nowrap font-extrabold leading-none ${
          isClockTime ? 'text-xl 2xl:text-3xl' : 'text-3xl 2xl:text-5xl'
        } ${isArrival ? 'screen-arrival' : 'text-slate-900'}`}
      >
        {value}
      </span>
      {/* L'unité n'accompagne que les minutes : ni l'heure de passage, ni le
          zéro clignotant de l'arrivée n'en ont besoin. */}
      {!isArrival && !isClockTime && (
        <span className="text-[11px] font-semibold text-slate-400 2xl:text-sm">min</span>
      )}
    </div>
  );
}

/** Une case de passage, version tableau : même règle de lecture, en petit. */
function RowTime({ departure }: { departure?: Departure }) {
  if (!departure) {
    return <span className="tabular text-right text-base font-bold text-slate-300 2xl:text-xl">–</span>;
  }

  const { value, isArrival, isClockTime } = departureDisplay(departure);

  return (
    <span className="flex items-baseline justify-end gap-1">
      <span
        className={`tabular whitespace-nowrap font-bold ${
          isClockTime ? 'text-sm 2xl:text-lg' : 'text-lg 2xl:text-2xl'
        } ${isArrival ? 'screen-arrival' : 'text-slate-900'}`}
      >
        {value}
      </span>
      {!isArrival && !isClockTime && (
        <span className="text-[10px] font-semibold text-slate-400 2xl:text-xs">min</span>
      )}
    </span>
  );
}

/**
 * Disposition tableau : une ligne par direction, comme une feuille d'horaires.
 *
 * Elle sacrifie la taille des chiffres pour tout faire tenir sans défilement —
 * c'est le bon compromis quand l'écran est près des voyageurs, ou quand l'arrêt
 * est desservi par quinze lignes.
 */
function DirectionRows({ groups }: { groups: ScreenLineGroup[] }) {
  const rows = groups.flatMap(group =>
    group.directions.map(direction => ({ group, direction })),
  );

  return (
    <div className="border-y border-slate-200 bg-white">
      {/* Figé en haut du défilement : sans repère de colonnes, trois nombres
          alignés à droite ne disent plus lequel est le prochain passage.
          Pas d'`overflow-hidden` sur le conteneur — il couperait l'adhérence. */}
      <div className="sticky top-0 z-10 grid grid-cols-[auto_1fr_repeat(3,minmax(0,4.5rem))] items-center gap-3 border-b border-slate-200 bg-slate-100 px-3 py-2 2xl:grid-cols-[auto_1fr_repeat(3,minmax(0,6rem))] 2xl:px-4">
        <span className="signal-label w-12 text-slate-400 2xl:w-14">Ligne</span>
        <span className="signal-label text-slate-400">Direction</span>
        <span className="signal-label col-span-3 text-right text-slate-400">Prochains passages</span>
      </div>

      <div className="divide-y divide-slate-100">
        {rows.map(({ group, direction }) => (
          <div
            key={`${group.lineId}-${direction.destination}`}
            className="grid grid-cols-[auto_1fr_repeat(3,minmax(0,4.5rem))] items-center gap-3 px-3 py-1.5 2xl:grid-cols-[auto_1fr_repeat(3,minmax(0,6rem))] 2xl:px-4 2xl:py-2"
          >
            <span className="flex w-12 justify-start 2xl:w-14">
              <ScreenLineBadge
                size="sm"
                lineId={group.lineId}
                label={group.label}
                color={group.color}
                textColor={group.textColor}
              />
            </span>
            <span className="flex min-w-0 items-center gap-1.5">
              <TransportModeIcon mode={group.mode} className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
              <span className="truncate text-sm font-semibold text-slate-900 2xl:text-lg">
                {direction.destination}
              </span>
              {group.hasTraffic && (
                <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0 text-amber-500" aria-label="Info trafic" />
              )}
            </span>
            {Array.from({ length: TIMES_PER_DIRECTION }).map((_, rank) => (
              <RowTime key={rank} departure={direction.departures[rank]} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function LineCard({ group }: { group: ScreenLineGroup }) {
  const color = resolveLineBackgroundColor(group.color, group.lineId);

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm 2xl:gap-4 2xl:p-5">
      <div className="flex items-center gap-3">
        <ScreenLineBadge
          lineId={group.lineId}
          label={group.label}
          color={group.color}
          textColor={group.textColor}
        />
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-slate-500">
          <TransportModeIcon mode={group.mode} className="h-4 w-4 flex-shrink-0 2xl:h-5 2xl:w-5" />
          <p className="truncate text-sm font-semibold 2xl:text-lg">{group.longName}</p>
        </div>
        {group.hasTraffic && (
          <ExclamationTriangleIcon
            className="h-6 w-6 flex-shrink-0 text-amber-500 2xl:h-7 2xl:w-7"
            aria-label="Info trafic"
          />
        )}
      </div>

      {group.directions.map(direction => (
        <div key={direction.destination}>
          <p
            className="truncate rounded-lg px-3 py-1.5 text-base font-bold text-slate-900 2xl:text-xl"
            style={{ backgroundColor: tint(color), borderLeft: `4px solid ${color}` }}
          >
            {direction.destination}
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2 px-1 2xl:mt-3">
            {Array.from({ length: TIMES_PER_DIRECTION }).map((_, rank) => (
              <TimeCell key={rank} departure={direction.departures[rank]} color={color} />
            ))}
          </div>
        </div>
      ))}
    </article>
  );
}

export function ScreenBoard({ stopId, layout }: { stopId: string; layout: ScreenLayout }) {
  const [detail, setDetail] = useState<StopDetail | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'notfound'>('loading');
  const detailRef = useRef<StopDetail | null>(null);
  const scrollRef = useAutoScroll<HTMLElement>();

  // Le rafraîchissement périodique lit le dernier arrêt connu sans se relancer
  // à chaque changement de données : la référence sert de miroir de l'état.
  useEffect(() => {
    detailRef.current = detail;
  }, [detail]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const fetched = isTclId(stopId) ? await getTclStopDetail(stopId) : await getStopDetail(stopId);
      if (!active) return;
      if (fetched) {
        setDetail(fetched);
        setStatus('ready');
      } else {
        setStatus('notfound');
      }
    })();
    return () => {
      active = false;
    };
  }, [stopId]);

  // Rafraîchissement périodique : seuls les passages sont rechargés, la liste
  // des lignes desservies ne bouge pas d'un quart d'heure à l'autre.
  useEffect(() => {
    const id = window.setInterval(() => {
      const current = detailRef.current;
      // Tant que l'arrêt n'a pas été résolu une première fois, on retente la
      // requête complète : un écran allumé avant le réseau doit finir par
      // s'afficher tout seul.
      const next = current
        ? refreshStopDepartures(current)
        : isTclId(stopId)
        ? getTclStopDetail(stopId)
        : getStopDetail(stopId);
      void next.then(result => {
        if (!result) return;
        setDetail(result);
        setStatus('ready');
      });
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [stopId]);

  const groups = detail ? groupDeparturesForScreen(detail) : [];

  return (
    <div className="gl-screen flex h-dvh w-full flex-col bg-[#eef2f7] text-slate-900">
      <ScreenTopBar stopName={detail?.name} />

      {/* `overflow-hidden` et non `auto` : le défilement est piloté à la main,
          aucune barre ne doit apparaître sur un téléviseur. */}
      <main
        ref={scrollRef}
        className={`min-h-0 flex-1 overflow-hidden ${layout === 'rows' ? '' : 'p-4 2xl:p-6'}`}
      >
        {status === 'loading' && (
          <div className="flex h-full items-center justify-center gap-3 text-slate-500">
            <ArrowPathIcon className="h-6 w-6 animate-spin" />
            <span className="text-lg font-semibold">Chargement des prochains passages…</span>
          </div>
        )}

        {status === 'notfound' && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="text-2xl font-bold text-slate-800">Arrêt introuvable</p>
            <p className="text-slate-500">
              L'identifiant <code className="rounded bg-slate-200 px-1.5 py-0.5">{stopId}</code> ne
              correspond à aucun arrêt.
            </p>
            <a
              href="/app/screen"
              className="rounded-full bg-blue-600 px-5 py-2 font-semibold text-white no-underline"
            >
              Choisir un arrêt
            </a>
          </div>
        )}

        {status === 'ready' && groups.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-2xl font-bold text-slate-800">Aucun passage prévu</p>
            <p className="text-slate-500">Le service est terminé ou n'a pas encore commencé.</p>
          </div>
        )}

        {status === 'ready' && groups.length > 0 && (
          <>
            {layout === 'rows' ? (
              <DirectionRows groups={groups} />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {groups.map(group => (
                  <LineCard key={group.lineId} group={group} />
                ))}
              </div>
            )}

            {/* Fin de liste : la marque du réseau, sur une plaque sombre parce
                que le logo est écrit en blanc. Elle dit d'où viennent ces
                horaires — un écran anonyme dans un hall n'inspire rien. */}
            <div className="mt-6 flex justify-center pb-6">
              <span className="inline-flex items-center rounded-xl bg-[#0f172a] px-5 py-3">
                <img src="/assets/M-Reso.png" alt="M Réso" className="h-7 w-auto 2xl:h-9" />
              </span>
            </div>
          </>
        )}
      </main>

      <ScreenTicker lines={detail?.lines ?? []} />
    </div>
  );
}
