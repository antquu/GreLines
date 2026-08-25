/**
 * Un itinéraire, déplié.
 *
 * Une colonne, un trait à la couleur de la ligne, et les noms qu'on lira sur
 * les quais. Ce qu'on cherche ici tient en trois questions : où je monte, dans
 * quoi, où je descends. Tout le reste attend qu'on le demande, à commencer par
 * les arrêts intermédiaires, repliés sous leur compte.
 *
 * La fiche précédente disait la même chose, mais tout en même temps : prix,
 * trafic, distances, opérateurs, horaires de chaque arrêt. C'était complet et
 * illisible.
 */

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { FaWalking } from 'react-icons/fa';
import { MdDirectionsBike } from 'react-icons/md';
import { MinusCircleIcon, PlusCircleIcon } from '@heroicons/react/24/outline';
import { ExclamationTriangleIcon, XMarkIcon } from '@heroicons/react/24/solid';
import { TrafficAlertCard } from './TrafficAlertCard';
import { resolveRouteLine } from '../utils/routeLineResolver';
import type { RouteItinerary } from '../services/api';
import type { AllLinesLine } from '../services/allLines';
import type { JourneyIntermediateStop, TrafficDetail } from '../types';

const BIKE_MODES = new Set(['BICYCLE', 'BICYCLE_RENT']);
/** La couleur d'un tronçon dont on ne connaît pas la ligne. */
const NEUTRAL_COLOR = '#94a3b8';

interface JourneyDetailProps {
  journey: RouteItinerary;
  /** Ce à quoi sert ce trajet : le titre que portait sa carte. */
  label?: string | null;
  language: 'fr' | 'en';
  stops?: unknown[];
  lineLookup?: Map<string, AllLinesLine> | null;
  theme?: 'light' | 'dark';
  /** Les avis en cours, par code de ligne. */
  trafficInfo?: Map<string, TrafficDetail[]>;
}

/** Le code d'une ligne tel que l'info-trafic le publie. */
function trafficKey(value?: string | null): string | null {
  if (!value) return null;
  return String(value).toUpperCase().replace(/^(?:SEM:|SEM_)/, '').trim() || null;
}

/** Le nom d'un arrêt, sans la commune qui le précède. */
function stopName(value: unknown): string {
  return String(value ?? '').replace(/^[^,]+,\s*/, '');
}

function clock(value: unknown): string {
  const ms = Number(value);
  if (!ms) return '';
  return new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function JourneyDetail({
  journey,
  label,
  language,
  stops,
  lineLookup,
  theme,
  trafficInfo,
}: JourneyDetailProps) {
  const fr = language === 'fr';
  const isLight = theme === 'light';
  /* Les arrêts desservis restent repliés : sur une ligne de vingt arrêts, les
     déplier d'office repousserait la descente hors de l'écran. */
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  /* L'avis de trafic ouvert, s'il y en a un : titre de la ligne et sa liste. */
  const [openAlert, setOpenAlert] = useState<{ line: string; details: TrafficDetail[] } | null>(null);

  const toggle = (index: number) =>
    setExpanded(current => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  const legs = (journey.allLegs || []) as Array<Record<string, unknown>>;
  const ink = isLight ? 'text-slate-900' : 'text-white';
  const muted = isLight ? 'text-slate-500' : 'text-white/60';
  const boxClass = isLight ? 'bg-slate-100' : 'bg-white/[0.07]';

  return (
    <div>
      {/* Ce que dure le trajet, et quand il faut partir. */}
      <h2
        /* Écrit en clair : `h1, h2 { … }` est déclaré hors layer dans index.css
           et ramènerait le titre à vingt pixels dans la couleur du thème. */
        style={{
          fontSize: '32px',
          lineHeight: 1.12,
          fontWeight: 600,
          letterSpacing: '-0.01em',
          color: isLight ? '#0f172a' : '#ffffff',
          margin: 0,
        }}
      >
        {label || (fr ? 'Votre trajet' : 'Your journey')}
        <br />
        {fr
          ? `${journey.dur}, arrivée à ${journey.arr}`
          : `${journey.dur}, arrive ${journey.arr}`}
      </h2>

      <div className="mt-5">
        <span
          className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-[15px] font-semibold ${
            isLight ? 'border-slate-300 text-slate-900' : 'border-white/40 text-white'
          }`}
        >
          {fr ? `Partir à ${journey.dep}` : `Leave at ${journey.dep}`}
        </span>
      </div>

      <div className="mt-9">
        {legs.map((leg, index) => {
          const mode = String(leg.mode ?? '').toUpperCase();
          const minutes = Math.round(Number(leg.duration ?? 0) / 60);

          /* La marche ne se pose pas sur le trait : elle est ce qui sépare deux
             lignes, et se lit comme une parenthèse entre elles. */
          if (mode === 'WALK') {
            if (minutes < 1) return null;
            return (
              <div key={`walk-${index}`} className={`my-5 flex items-center gap-3 rounded-2xl px-4 py-4 ${boxClass}`}>
                <FaWalking size={20} className={ink} />
                <span className={`text-[17px] font-semibold ${ink}`}>
                  {fr ? `Marcher ${minutes} min` : `Walk ${minutes} min`}
                </span>
              </div>
            );
          }

          if (BIKE_MODES.has(mode)) {
            return (
              <div key={`bike-${index}`} className={`my-5 flex items-center gap-3 rounded-2xl px-4 py-4 ${boxClass}`}>
                <MdDirectionsBike size={22} className={ink} />
                <span className={`text-[17px] font-semibold ${ink}`}>
                  {fr ? `À vélo, ${minutes} min` : `By bike, ${minutes} min`}
                </span>
              </div>
            );
          }

          const line = resolveRouteLine({
            routeShortName: leg.routeShortName as string | undefined,
            route: leg.route as string | undefined,
            routeId: leg.routeId as string | undefined,
            lineLookup,
            stops,
          });
          const color = line?.color || NEUTRAL_COLOR;
          const lineName = line?.normalized
            || String(leg.routeShortName || leg.route || leg.routeId || '')
              .replace(/^SEM[:_]/, '')
              .toUpperCase();
          const headsign = stopName(leg.headsign || (leg.to as Record<string, unknown> | undefined)?.name);
          const intermediate: JourneyIntermediateStop[] = Array.isArray(leg.intermediateStops)
            ? (leg.intermediateStops as JourneyIntermediateStop[])
            : [];
          const isOpen = expanded.has(index);
          const alertKey = trafficKey(lineName);
          const alerts = alertKey ? trafficInfo?.get(alertKey) ?? null : null;

          return (
            <div key={`transit-${index}`} className="flex gap-5">
              {/* La colonne du trait, à la couleur de la ligne : c'est elle qui
                  dit qu'on ne descend pas entre les deux pastilles. */}
              <div className="flex w-6 flex-shrink-0 flex-col items-center">
                <span
                  className="h-6 w-6 flex-shrink-0 rounded-full border-[3px]"
                  style={{ borderColor: color }}
                />
                <span className="w-[6px] flex-1" style={{ backgroundColor: color, minHeight: 72 }} />
                <span
                  className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-[3px]"
                  style={{ borderColor: color }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                </span>
              </div>

              <div className="min-w-0 flex-1 pb-1">
                <p className={`text-[21px] font-bold leading-tight ${ink}`}>
                  {stopName((leg.from as Record<string, unknown> | undefined)?.name)}
                </p>

                {/* Dans quoi l'on monte, et à quelle heure elle part. */}
                <div className={`mt-4 flex items-center gap-3 rounded-2xl px-4 py-3.5 ${boxClass}`}>
                  <div className="min-w-0 flex-1">
                    <p className={`text-[17px] font-bold leading-tight ${ink}`}>{lineName}</p>
                    <div className="mt-0.5">
                      <p className={`text-[16px] leading-tight ${isLight ? 'text-slate-600' : 'text-white/75'}`}>
                        {clock(leg.startTime)} {headsign}
                      </p>
                    </div>
                  </div>

                  {/* La ligne est perturbée : le triangle se pose dans son
                      cadre, à droite, et non en tête de fiche. C'est en lisant
                      « je monte dans le C » qu'il faut l'apprendre, pas avant
                      d'avoir su de quelle ligne il s'agissait. */}
                  {alerts && alerts.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setOpenAlert({ line: lineName, details: alerts })}
                      aria-label={fr ? `Info trafic ligne ${lineName}` : `Service info line ${lineName}`}
                      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-400 text-amber-950 transition active:scale-90"
                    >
                      <ExclamationTriangleIcon className="h-5 w-5" />
                    </button>
                  )}
                </div>

                {/* Combien d'arrêts, et lesquels si on le demande. */}
                <button
                  type="button"
                  onClick={() => toggle(index)}
                  disabled={intermediate.length === 0}
                  className={`mt-5 flex items-center gap-3 text-left ${ink} disabled:opacity-60`}
                >
                  {intermediate.length > 0 &&
                    (isOpen ? (
                      <MinusCircleIcon className="h-7 w-7 flex-shrink-0" />
                    ) : (
                      <PlusCircleIcon className="h-7 w-7 flex-shrink-0" />
                    ))}
                  <span className="text-[17px] font-bold">
                    {fr
                      ? `${intermediate.length + 1} arrêt${intermediate.length + 1 > 1 ? 's' : ''}`
                      : `${intermediate.length + 1} stop${intermediate.length + 1 > 1 ? 's' : ''}`}
                  </span>
                  <span className={`text-[17px] ${muted}`}>{minutes} min</span>
                </button>

                {/* Le dépliage passe par une grille : une hauteur automatique ne
                    s'anime pas, et une hauteur fixe couperait les longues
                    listes. */}
                <div
                  /*
                   * `-ml-8 pl-8` : le cadre déborde de trente-deux pixels sur sa
                   * gauche, exactement de quoi couvrir la gouttière et le
                   * demi-rail, puis rend cette place en marge intérieure.
                   *
                   * C'est ce qui permet aux traits de se poser sur le rail. Le
                   * dépliage se fait par une grille dont la hauteur s'anime, ce
                   * qui exige `overflow-hidden` : un trait dessiné hors du cadre
                   * était purement et simplement coupé, et l'on ne voyait rien.
                   */
                  className={`-ml-8 grid overflow-hidden pl-8 transition-[grid-template-rows,opacity] duration-300 ease-out ${
                    isOpen ? 'mt-5 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                  }`}
                  aria-hidden={!isOpen}
                >
                  <ul className="flex min-h-0 flex-col gap-3">
                    {intermediate.map((stop, stopIndex) => (
                      <li
                        key={`${stop?.stopId ?? stop?.name ?? stopIndex}`}
                        className={`relative text-[17px] ${ink}`}
                      >
                        {/* Le petit trait sur le rail, en face du nom.
                            Il est posé depuis la colonne de texte et vient
                            mordre le trait à sa gauche : les deux colonnes sont
                            sœurs et non emboîtées, et rien d'autre ne peut les
                            faire coïncider ligne à ligne. Le décalage vaut la
                            gouttière (20) plus le demi-rail (12). */}
                        <span
                          className="pointer-events-none absolute"
                          style={{
                            /* Trente-deux pixels à gauche du nom, soit la
                               gouttière plus le demi-rail : le trait tombe donc
                               sur le rail. Le cadre au-dessus lui ménage cette
                               place, sans quoi il serait coupé. */
                            left: -32,
                            top: '0.55em',
                            width: 12,
                            height: 6,
                            backgroundColor: color,
                          }}
                          aria-hidden
                        />
                        {stopName(stop?.name)}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-5">
                  <p className={`text-[21px] font-bold leading-tight ${ink}`}>
                    {stopName((leg.to as Record<string, unknown> | undefined)?.name)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* L'avis, en feuille.
          Portalisée sur le corps du document : la fiche vit dans une page qui
          se déplace par `transform`, et un ancêtre transformé devient le
          repère des positions fixes qu'il contient. */}
      {openAlert && createPortal(
        <div className="fixed inset-0 z-[10030] flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpenAlert(null)}
            aria-hidden
          />
          <div
            className={`relative max-h-[85dvh] overflow-y-auto rounded-t-[28px] px-5 pt-5 ${
              isLight ? 'bg-white' : 'bg-[#161616]'
            }`}
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}
            role="dialog"
            aria-label={fr ? `Info trafic ligne ${openAlert.line}` : `Service info line ${openAlert.line}`}
          >
            <div className="flex items-start gap-3">
              <p className={`min-w-0 flex-1 text-[21px] font-bold leading-tight ${ink}`}>
                {fr ? `Info trafic ligne ${openAlert.line}` : `Service info line ${openAlert.line}`}
              </p>
              <button
                type="button"
                onClick={() => setOpenAlert(null)}
                aria-label={fr ? 'Fermer' : 'Close'}
                className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full transition active:scale-90 ${
                  isLight ? 'bg-slate-100 text-slate-700' : 'bg-white/10 text-white'
                }`}
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 flex flex-col gap-3">
              {openAlert.details.map((detail, detailIndex) => (
                <TrafficAlertCard
                  key={`${detail.titre}-${detailIndex}`}
                  detail={detail}
                  language={language}
                  isLight={isLight}
                  defaultExpanded
                  expandable={false}
                />
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
