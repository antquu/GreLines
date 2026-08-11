import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ArrowsRightLeftIcon, PaperClipIcon } from '@heroicons/react/24/solid';
import { LineBadge } from './LineBadge';
import { resolveLineStyle } from '../utils/lineColors';
import { LastRunRibbon } from './LastRunRibbon';
import { getTimetable, formatTimetableTime, toTimetableRouteId, type Timetable, type TimetableStop } from '../services/timetable';
import type { Line } from '../types';

interface TimetableSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  
  line: Pick<Line, 'id' | 'shortName' | 'color' | 'textColor'> | null;
  
  preferredHeadsign?: string | null;
  
  highlightStopName?: string | null;
  isMobile: boolean;
  language: 'fr' | 'en';
  
  onOpenLineMap?: () => void;
}

const getText = (language: 'fr' | 'en') => {
  const fr = language === 'fr';
  return {
    title: fr ? 'Fiche horaire' : 'Timetable',
    direction: fr ? 'Direction' : 'Direction',
    loading: fr ? 'Chargement…' : 'Loading…',
    empty: fr
      ? 'Aucun horaire publié pour cette ligne en ce moment. Le réseau ne circule peut-être pas à cette heure-ci.'
      : 'No timetable published for this line right now. The network may not be running at this hour.',
    close: fr ? 'Fermer' : 'Close',
    stops: fr ? 'Arrêts' : 'Stops',
    noTimes: fr ? 'Pas de passage' : 'No departure',
    previousTimes: fr ? 'Horaires précédents' : 'Earlier times',
    nextTimes: fr ? 'Horaires suivants' : 'Later times',
    lineMap: fr ? 'Plan de la ligne' : 'Line map',
    trips: (n: number) => (fr ? `${n} course${n > 1 ? 's' : ''}` : `${n} trip${n > 1 ? 's' : ''}`),
  };
};


/** Nombre d'horaires par page une fois un arrêt déplié. */
const TIMES_PER_PAGE = 5;

/**
 * Un arrêt de la fiche horaire.
 *
 * Replié, il n'annonce que le prochain passage : c'est la question qu'on se
 * pose devant un abribus. Déplié, il donne la journée entière, par pages de
 * cinq — une fiche horaire compte des dizaines de courses, les dérouler d'un
 * bloc rendrait la liste illisible.
 */
function TimetableStopRow({
  stop,
  lineColor,
  isFirst,
  isLast,
  isExpanded,
  onToggle,
  text,
  language,
  isLastOfDay,
}: {
  stop: TimetableStop;
  lineColor: string;
  isFirst: boolean;
  isLast: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  text: ReturnType<typeof getText>;
  language: 'fr' | 'en';
  /** Vrai quand le prochain passage affiché est la dernière course du jour. */
  isLastOfDay: boolean;
}) {
  const [page, setPage] = useState(0);
  const [direction, setDirection] = useState(1);
  const pageCount = Math.max(1, Math.ceil(stop.times.length / TIMES_PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const pageTimes = stop.times.slice(safePage * TIMES_PER_PAGE, safePage * TIMES_PER_PAGE + TIMES_PER_PAGE);

  const goTo = (next: number) => {
    setDirection(next > safePage ? 1 : -1);
    setPage(Math.max(0, Math.min(pageCount - 1, next)));
  };

  return (
    <div className="flex items-stretch gap-3.5">
      {/* Tronc de la ligne : trait continu à sa couleur officielle, anneau à
          chaque arrêt, cabochon plein aux terminus — la même grammaire que la
          fiche de ligne, puisqu'on lit le même parcours. */}
      <div className="relative w-4 flex-shrink-0" aria-hidden="true">
        {/* Un seul trait sur toute la hauteur de la rangée, plutôt que deux
            segments calés sur une hauteur supposée : quand un arrêt se déplie,
            la rangée grandit et les segments cessaient de se rejoindre. */}
        <div
          className="absolute left-1/2 w-[3px] -translate-x-1/2"
          style={{
            backgroundColor: lineColor,
            top: isFirst ? 20 : 0,
            bottom: isLast ? 'calc(100% - 20px)' : 0,
          }}
        />
        <div
          className="absolute left-1/2 top-5 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] bg-slate-900"
          style={{
            borderColor: lineColor,
            // Le coeur du jalon prend la couleur de la feuille : blanc en
            // theme clair, ardoise en sombre.
            backgroundColor: isFirst || isLast ? lineColor : 'var(--gl-sheet-bg)',
            width: isFirst || isLast ? 14 : 11,
            height: isFirst || isLast ? 14 : 11,
          }}
        />
      </div>

      <div className="min-w-0 flex-1 border-b border-slate-800/80 pb-1 last:border-b-0">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isExpanded}
          className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-slate-800/70"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold text-white">{stop.name}</span>
            <span className="mt-0.5 flex items-center gap-2 truncate text-xs text-slate-400">
              {stop.city}
            </span>
          </span>
          {/* Replié : le prochain passage, et lui seul. */}
          <span className="flex flex-shrink-0 items-center gap-2">
            {isLastOfDay && <LastRunRibbon language={language} />}
            <span className="tabular text-sm font-semibold text-white">
              {stop.times.length > 0 ? formatTimetableTime(stop.times[0]) : '—'}
            </span>
          </span>
          <ChevronDownIcon
            className={`h-4 w-4 flex-shrink-0 text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          />
        </button>

        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              <div className="mb-2 ml-2 rounded-xl bg-slate-800/50 px-3.5 py-3">
                {stop.times.length === 0 ? (
                  <p className="text-sm text-slate-400">{text.noTimes}</p>
                ) : (
                  <>
                    {/* Les pages défilent latéralement : le sens du glissement
                        dit qu'on avance ou qu'on recule dans la journée. */}
                    <div className="relative overflow-hidden" style={{ minHeight: 28 }}>
                      <AnimatePresence initial={false} mode="wait" custom={direction}>
                        <motion.div
                          key={safePage}
                          custom={direction}
                          initial={{ x: direction * 28, opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          exit={{ x: direction * -28, opacity: 0 }}
                          transition={{ duration: 0.18, ease: 'easeOut' }}
                          className="flex flex-wrap gap-1.5"
                        >
                          {/* Chaque horaire dans sa case : sur une ligne de
                              chiffres tous semblables, la bordure donne le point
                              d'appui qui manque à l'œil. */}
                          {pageTimes.map((time, timeIndex) => (
                            <span
                              key={`${time}-${timeIndex}`}
                              className={`tabular rounded-lg border px-2 py-1 text-sm ${
                                
                                
                                safePage * TIMES_PER_PAGE + timeIndex === stop.times.length - 1 && isLastOfDay
                                  ? 'border-amber-400/60 bg-amber-400/10 text-amber-200'
                                  : 'border-slate-700 bg-slate-900/70 text-slate-200'
                              }`}
                            >
                              {formatTimetableTime(time)}
                            </span>
                          ))}
                        </motion.div>
                      </AnimatePresence>
                    </div>

                    {pageCount > 1 && (
                      <div className="mt-2.5 flex items-center justify-between border-t border-slate-700/60 pt-2">
                        <button
                          type="button"
                          onClick={() => goTo(safePage - 1)}
                          disabled={safePage === 0}
                          aria-label={text.previousTimes}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 transition hover:bg-slate-700 disabled:opacity-25"
                        >
                          <ChevronLeftIcon className="h-4 w-4" />
                        </button>
                        <span className="tabular text-[11px] text-slate-500">
                          {safePage + 1}/{pageCount}
                        </span>
                        <button
                          type="button"
                          onClick={() => goTo(safePage + 1)}
                          disabled={safePage >= pageCount - 1}
                          aria-label={text.nextTimes}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 transition hover:bg-slate-700 disabled:opacity-25"
                        >
                          <ChevronRightIcon className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * Fiche horaire d'une ligne.
 *
 * Une fiche horaire est un tableau arrêts × courses. Le déroulé vertical de la
 * ligne — déjà utilisé dans la fiche de ligne — sert de colonne vertébrale : on
 * déplie un arrêt pour voir ses passages, plutôt que d'imposer un tableau qui
 * ne tiendrait pas dans un panneau latéral.
 */
export function TimetableSidebar({
  isOpen,
  onClose,
  line,
  preferredHeadsign,
  isMobile,
  language,
  onOpenLineMap,
}: TimetableSidebarProps) {
  const text = getText(language);
  const [timetable, setTimetable] = useState<Timetable | null>(null);
  const [loading, setLoading] = useState(false);
  const [directionKey, setDirectionKey] = useState<string | null>(null);
  const [expandedStop, setExpandedStop] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !line) return;
    let active = true;
    const controller = new AbortController();

    // Le chargement démarre dans une micro-tâche : mettre l'état à jour dans le
    // corps de l'effet enchaînerait un rendu en cascade juste avant la requête.
    queueMicrotask(() => {
      if (!active) return;
      setLoading(true);
      setTimetable(null);
    });
    getTimetable(toTimetableRouteId(line.shortName || line.id), { signal: controller.signal })
      .then(result => {
        if (!active) return;
        setTimetable(result);
        // Le sens présélectionné est celui du passage qu'on consultait.
        const match = preferredHeadsign
          ? result?.directions.find(direction =>
              preferredHeadsign.toLowerCase().includes(direction.headsign.toLowerCase()) ||
              direction.headsign.toLowerCase().includes(preferredHeadsign.toLowerCase()))
          : null;
        setDirectionKey(match?.key ?? result?.directions[0]?.key ?? null);
      })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; controller.abort(); };
  }, [isOpen, line?.id, line?.shortName, preferredHeadsign]);

  const direction = timetable?.directions.find(item => item.key === directionKey) ?? timetable?.directions[0];
  // Même résolution que la fiche de ligne : une ligne sans couleur déclarée
  // reçoit celle que l'application lui attribue d'après son identifiant. Se
  // rabattre sur un gris ardoise donnait un tronc invisible sur fond sombre —
  // la timeline était bien là, on ne la voyait simplement pas.
  const lineStyle = line ? resolveLineStyle(line.id, line.color, line.textColor) : {};
  const lineColor = (lineStyle as { backgroundColor?: string }).backgroundColor || '#475569';

  const body = (
    <>
      {/* Le badge de ligne suffit à dire où l'on est : le titre « Fiche
          horaire » répétait ce que le contenu montre déjà, et le filet
          horizontal doublait le tronc coloré de la timeline juste en dessous.
          Les deux retirés, le badge porte seul l'identité de l'écran. */}
      <div className="flex items-center justify-between gap-3">
        {line && <LineBadge line={line} size="md" />}
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            onClick={onOpenLineMap}
            aria-label={text.lineMap}
            title={text.lineMap}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-slate-300 transition hover:bg-slate-700 hover:text-white"
          >
            <PaperClipIcon className="h-4 w-4" />
          </button>
          <button
            onClick={onClose}
            aria-label={text.close}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-slate-300 transition hover:bg-slate-700 hover:text-white"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Sélecteur de sens : deux terminus, comme une girouette. */}
      {timetable && timetable.directions.length > 1 && (
        <div className="mt-5 grid grid-cols-2 gap-1 rounded-2xl border border-slate-800 bg-slate-900/60 p-1">
          {timetable.directions.map(item => {
            const active = item.key === direction?.key;
            return (
              <button
                key={item.key}
                onClick={() => { setDirectionKey(item.key); setExpandedStop(null); }}
                className={`truncate rounded-xl px-3 py-2 text-[13px] font-semibold transition ${
                  active ? 'bg-blue-600 text-white hover:bg-blue-500' : 'text-slate-400 hover:bg-slate-800'
                }`}
              >
                {item.headsign}
              </button>
            );
          })}
        </div>
      )}

      {direction && (
        <p className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-400">
          <ArrowsRightLeftIcon className="h-4 w-4 flex-shrink-0 text-slate-500" />
          <span className="truncate">{text.direction} {direction.headsign}</span>
        </p>
      )}

      <div className="mt-4 flex items-baseline justify-between border-b border-slate-800 pb-2">
        <p className="signal-label text-slate-400">{text.stops}</p>
        {direction && (
          <p className="tabular text-xs text-slate-500">{text.trips(direction.tripCount)}</p>
        )}
      </div>

      {loading ? (
        <p className="py-8 text-sm text-slate-400">{text.loading}</p>
      ) : !direction ? (
        <p className="py-8 text-sm leading-relaxed text-slate-500">{text.empty}</p>
      ) : (
        <div className="mt-1">
          {direction.stops.map((stop, index) => (
            <TimetableStopRow
              key={stop.id}
              stop={stop}
              lineColor={lineColor}
              isFirst={index === 0}
              isLast={index === direction.stops.length - 1}
              isExpanded={expandedStop === stop.id}
              onToggle={() => setExpandedStop(current => (current === stop.id ? null : stop.id))}
              text={text}
              language={language}
              isLastOfDay={stop.times.length === 1}
            />
          ))}
        </div>
      )}
    </>
  );

  if (!isMobile) {
    return (
      <AnimatePresence>
        {isOpen && line && (
          <>
            {/* Deux panneaux côte à côte ne laissent qu'un bandeau de carte :
                on la floute plutôt que de la laisser distraire, et le voile
                sert de zone de fermeture. */}
            <motion.div
              key="timetable-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={onClose}
              className="fixed inset-0 z-[52] bg-slate-950/40 backdrop-blur-sm"
            />
            <motion.div
              key="timetable-panel"
              initial={{ x: -420, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -420, opacity: 0 }}
              transition={{ duration: 0.28, ease: 'easeOut' }}
              // Décalée d'une largeur de panneau : elle se pose à droite de la
              // fiche d'arrêt, sans la masquer.
              className="fixed left-96 top-0 z-[55] h-screen w-96 overflow-y-auto border-r border-slate-800 bg-slate-900 shadow-2xl"
            >
              <div className="p-6 pb-12">{body}</div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    );
  }

  // Sur mobile, la fiche horaire prend tout l'écran, comme la visionneuse de
  // plan : c'est un tableau qu'on lit de haut en bas, une feuille l'aurait
  // toujours amputé d'un tiers pour montrer une carte qu'on ne regarde pas.
  return (
    <AnimatePresence>
      {isOpen && line && (
        <motion.div
          key="timetable-fullscreen"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="fixed inset-0 z-[110] flex flex-col"
          style={{ backgroundColor: 'var(--gl-sheet-bg)' }}
        >
          <div
            className="min-h-0 flex-1 overflow-y-auto px-5 pb-12"
            style={{
              paddingTop: 'max(1rem, env(safe-area-inset-top))',
            }}
          >
            {body}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
