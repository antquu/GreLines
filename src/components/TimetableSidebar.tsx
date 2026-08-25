import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon, ChevronLeftIcon, ChevronRightIcon, ArrowsRightLeftIcon, PaperClipIcon } from '@heroicons/react/24/solid';
import { LineBadge } from './LineBadge';
import { resolveLineStyle } from '../utils/lineColors';
import { LastRunRibbon } from './LastRunRibbon';
import { MarqueeText } from './MarqueeText';
import { getTimetable, formatTimetableTime, toTimetableRouteId, type Timetable, type TimetableDirection } from '../services/timetable';
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

/** Hauteur d'une rangée. Fixe, parce que deux colonnes doivent s'aligner. */
const ROW_HEIGHT = 46;
/**
 * Nombre de courses montrées à la fois.
 *
 * Trois tiennent à l'aise sur la largeur d'un téléphone à côté du nom des
 * arrêts, et trois suffisent à répondre : celui-là, le suivant, celui d'après.
 * Au-delà, les colonnes se resserrent et l'on ne suit plus une course du doigt
 * sans glisser sur sa voisine.
 */
const PER_PAGE = 3;
/** Largeur de la colonne des arrêts, qui ne défile pas. */
const NAME_WIDTH = 148;

/** Secondes écoulées depuis minuit, pour situer l'heure qu'il est dans la grille. */
function secondsSinceMidnight(): number {
  const now = new Date();
  return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
}

/**
 * La grille arrêts × courses.
 *
 * Une fiche horaire répond à une question qu'une liste d'heures par arrêt ne
 * posait même pas : je monte ici à telle heure, j'arrive là-bas quand ? On lit
 * donc une colonne de haut en bas — c'est une course, un bus, du terminus à
 * l'autre — et une rangée de gauche à droite, ce sont les passages de la
 * journée à cet arrêt. C'est la forme qu'ont les fiches papier collées aux
 * abribus, et ce n'est pas un hasard.
 *
 * Rien ne défile : on change de plage horaire avec deux flèches. Un tableau
 * qu'on pousse du doigt cache toujours la moitié de ce qu'il contient, et l'on
 * ne sait jamais s'il reste quelque chose à droite ; trois courses à la fois,
 * annoncées par leur plage, se lisent d'un coup d'oeil et se quittent d'une
 * tape.
 *
 * La grille s'ouvre sur la prochaine course, pas sur la première du jour : à
 * dix-huit heures, personne ne cherche le premier départ de cinq heures du
 * matin.
 */
function TimetableGrid({
  direction,
  lineColor,
  text,
  language,
  highlightStopName,
}: {
  direction: TimetableDirection;
  lineColor: string;
  text: ReturnType<typeof getText>;
  language: 'fr' | 'en';
  highlightStopName?: string | null;
}) {
  const stops = direction.stops;

  /*
   * Les courses qui existent vraiment.
   *
   * Les tableaux de l'API sont plus longs que le nombre de courses du jour :
   * la queue est remplie de « | », des colonnes où aucun arrêt n'a d'heure.
   * Affichées telles quelles, elles donnaient des pages entièrement vides,
   * sans plage annoncée, et le « dernier passage » tombait sur une course qui
   * n'a jamais circulé. On ne garde donc que les colonnes qui portent au moins
   * une heure, et l'on travaille ensuite sur leur rang à elles.
   */
  const trips = useMemo(() => {
    const width = stops.reduce((most, stop) => Math.max(most, stop.times.length), 0);
    const kept: number[] = [];
    for (let index = 0; index < width; index += 1) {
      if (stops.some(stop => typeof stop.times[index] === 'number')) kept.push(index);
    }
    return kept;
  }, [stops]);
  const tripCount = trips.length;
  const pageCount = Math.max(1, Math.ceil(tripCount / PER_PAGE));

  /*
   * La course en cours de départ.
   *
   * Le repère est le premier arrêt de la course : c'est là qu'elle commence,
   * et c'est l'heure qui décide si elle est encore devant nous. Faute de
   * course à venir — la journée est finie —, on montre la dernière.
   */
  const upcomingIndex = useMemo(() => {
    const now = secondsSinceMidnight();
    const found = trips.findIndex(trip => {
      for (const stop of stops) {
        const time = stop.times[trip];
        if (typeof time === 'number') return time % 86400 >= now;
      }
      return false;
    });
    return found >= 0 ? found : Math.max(0, tripCount - 1);
  }, [stops, trips, tripCount]);

  const [page, setPage] = useState(() => Math.floor(upcomingIndex / PER_PAGE));
  /* Changer de sens rouvre sur l'heure qu'il est, et non sur la page où l'on
     s'était arrêté dans l'autre sens, qui ne veut plus rien dire. */
  useEffect(() => {
    setPage(Math.floor(upcomingIndex / PER_PAGE));
  }, [upcomingIndex, direction.key]);

  const safePage = Math.min(page, pageCount - 1);
  const firstTrip = safePage * PER_PAGE;
  /** Rangs affichés, dans l'ordre des courses retenues. */
  const visiblePositions = Array.from(
    { length: Math.max(0, Math.min(PER_PAGE, tripCount - firstTrip)) },
    (_, offset) => firstTrip + offset,
  );
  /** Les colonnes correspondantes dans les tableaux de l'API. */
  const visibleTrips = visiblePositions.map(position => trips[position]);

  /*
   * La plage annoncée : le début de chaque course montrée.
   *
   * On ne peut pas la lire sur le seul terminus d'origine — toutes les courses
   * n'en partent pas, et les dernières du soir démarrent souvent en cours de
   * ligne. La barre restait alors vide, ce qui ne disait rien à personne. On
   * prend donc, pour chaque colonne, la première heure qu'on y trouve en
   * descendant : c'est l'heure à laquelle ce bus-là commence.
   */
  const rangeLabel = useMemo(() => {
    const starts = visibleTrips
      .map(index => {
        for (const stop of stops) {
          const time = stop.times[index];
          if (typeof time === 'number') return time;
        }
        return null;
      })
      .filter((time): time is number => time !== null);
    if (starts.length === 0) return '';
    const first = formatTimetableTime(starts[0]);
    const last = formatTimetableTime(starts[starts.length - 1]);
    return first === last ? first : `${first} – ${last}`;
  }, [stops, visibleTrips.join(',')]);

  const normalizedHighlight = highlightStopName?.trim().toLowerCase() ?? '';

  if (tripCount === 0) {
    return <p className="py-8 text-sm text-slate-400">{text.noTimes}</p>;
  }

  return (
    <div className="mt-1">
      {/* La plage montrée, entre ses deux flèches. */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setPage(current => Math.max(0, current - 1))}
          disabled={safePage === 0}
          aria-label={text.previousTimes}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-800 text-slate-300 transition hover:bg-slate-700 hover:text-white disabled:opacity-25 disabled:hover:bg-slate-800"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <span className="flex min-w-0 items-center gap-2">
          <span className="tabular truncate text-sm font-semibold text-slate-200">{rangeLabel}</span>
          {visiblePositions.includes(tripCount - 1) && <LastRunRibbon language={language} />}
        </span>
        <button
          type="button"
          onClick={() => setPage(current => Math.min(pageCount - 1, current + 1))}
          disabled={safePage >= pageCount - 1}
          aria-label={text.nextTimes}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-800 text-slate-300 transition hover:bg-slate-700 hover:text-white disabled:opacity-25 disabled:hover:bg-slate-800"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="flex overflow-hidden rounded-2xl border border-slate-800">
        {/* La colonne des arrêts, avec le tronc de la ligne à sa gauche : la
            même grammaire que la fiche de ligne, puisqu'on lit le même parcours. */}
        <div className="flex-shrink-0 border-r border-slate-800" style={{ width: NAME_WIDTH }}>
          {stops.map((stop, index) => {
            const isEdge = index === 0 || index === stops.length - 1;
            const isHighlighted =
              normalizedHighlight.length > 0 && stop.name.trim().toLowerCase() === normalizedHighlight;
            return (
              <div
                key={stop.id}
                className={`relative flex items-center gap-2.5 pl-3 pr-2 ${
                  index % 2 === 1 ? 'bg-slate-900/40' : ''
                } ${isHighlighted ? 'bg-blue-500/10' : ''}`}
                style={{ height: ROW_HEIGHT }}
              >
                <span className="relative w-3 flex-shrink-0 self-stretch" aria-hidden="true">
                  <span
                    className="absolute left-1/2 w-[3px] -translate-x-1/2"
                    style={{
                      backgroundColor: lineColor,
                      top: index === 0 ? '50%' : 0,
                      bottom: index === stops.length - 1 ? '50%' : 0,
                    }}
                  />
                  <span
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px]"
                    style={{
                      borderColor: lineColor,
                      backgroundColor: isEdge ? lineColor : 'var(--gl-sheet-bg)',
                      width: isEdge ? 12 : 10,
                      height: isEdge ? 12 : 10,
                    }}
                  />
                </span>
                {/*
                  Les noms trop longs défilent plutôt que d'être coupés.

                  « Fontaine Hôtel de Ville – La Source » ne tient dans aucune
                  colonne raisonnable, et « Fontaine Hôtel de… » ne dit pas
                  lequel c'est quand deux arrêts partagent leur début. Le
                  bandeau est le même que celui des infos trafic en bas du site,
                  au repos tant que le texte tient.
                */}
                <span className="min-w-0 flex-1">
                  {stop.city && (
                    <MarqueeText
                      text={stop.city}
                      className="text-[10px] leading-tight text-slate-500"
                      gap={24}
                    />
                  )}
                  <MarqueeText
                    text={stop.name}
                    className="text-[13px] font-semibold leading-tight text-white"
                    gap={24}
                  />
                </span>
              </div>
            );
          })}
        </div>

        {/* Les trois courses de la plage. */}
        <div className="min-w-0 flex-1">
          {stops.map((stop, rowIndex) => {
            const isHighlighted =
              normalizedHighlight.length > 0 && stop.name.trim().toLowerCase() === normalizedHighlight;
            return (
              <div
                key={stop.id}
                className={`flex ${rowIndex % 2 === 1 ? 'bg-slate-900/40' : ''} ${
                  isHighlighted ? 'bg-blue-500/10' : ''
                }`}
                style={{ height: ROW_HEIGHT }}
              >
                {visiblePositions.map(position => {
                  const time = stop.times[trips[position]];
                  const isUpcoming = position === upcomingIndex;
                  return (
                    <span
                      key={position}
                      className={`tabular flex min-w-0 flex-1 items-center justify-center text-[13px] ${
                        isUpcoming ? 'font-bold text-white' : 'text-slate-400'
                      }`}
                      style={{
                        /* La colonne de la prochaine course se détache sur toute
                           sa hauteur : c'est elle qu'on suit du doigt. */
                        backgroundColor: isUpcoming ? 'rgba(37,99,235,0.16)' : undefined,
                      }}
                    >
                      {typeof time === 'number' ? formatTimetableTime(time) : '·'}
                    </span>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Le sélecteur de sens.
 *
 * Deux terminus, comme une girouette, et une pastille qui glisse de l'un à
 * l'autre plutôt que de s'éteindre ici pour se rallumer là. Le mouvement dit ce
 * qui vient de se passer — on a basculé de sens — là où deux fonds qui changent
 * de couleur au même instant laissent chercher lequel est désormais actif.
 *
 * La pastille est posée en pixels, mesurés sur l'onglet actif, et non en
 * pourcentages : les libellés n'ont pas la même longueur, et une pastille
 * calculée sur une fraction de la barre débordait du terminus court pour
 * amputer le long. La mesure se refait quand la barre change de taille.
 */
function DirectionSwitch({
  directions,
  activeKey,
  onSelect,
}: {
  directions: TimetableDirection[];
  activeKey: string | null | undefined;
  onSelect: (key: string) => void;
}) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const measure = () => {
      const active = bar.querySelector<HTMLButtonElement>('[data-active="true"]');
      if (!active) return;
      setPill({ left: active.offsetLeft, width: active.offsetWidth });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => observer.disconnect();
  }, [activeKey, directions]);

  return (
    <div
      ref={barRef}
      className="relative mt-5 flex rounded-2xl border border-slate-800 bg-slate-900/60 p-1"
    >
      {/* Tant que la mesure n'a pas eu lieu, pas de pastille : mieux vaut une
          barre nue une image de plus qu'une pastille posée au mauvais endroit
          qui glisse ensuite jusqu'à la bonne place. */}
      {pill && (
        <span
          aria-hidden="true"
          className="absolute bottom-1 top-1 rounded-xl bg-blue-600 transition-[left,width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
          style={{ left: pill.left, width: pill.width }}
        />
      )}
      {directions.map(item => {
        const active = item.key === activeKey;
        return (
          <button
            key={item.key}
            type="button"
            data-active={active}
            onClick={() => onSelect(item.key)}
            aria-pressed={active}
            className={`relative z-10 min-w-0 flex-1 truncate rounded-xl px-3 py-2 text-[13px] font-semibold transition-colors duration-200 ${
              active ? 'text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {item.headsign}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Fiche horaire d'une ligne.
 *
 * Une fiche horaire est un tableau arrêts × courses, et c'est ainsi qu'elle se
 * présente : une rangée par arrêt, une colonne par course. On suit une colonne
 * pour savoir où mène le bus de 18:03, une rangée pour connaître les passages
 * de la journée à un arrêt. Auparavant, chaque arrêt donnait ses heures sous
 * lui, dépliable : on voyait bien qu'il partait un bus à 18:03, mais rien ne
 * disait à quelle heure il arrivait ailleurs, ce qui est pourtant la seule
 * chose qu'une fiche horaire sache dire.
 */
export function TimetableSidebar({
  isOpen,
  onClose,
  line,
  preferredHeadsign,
  highlightStopName,
  isMobile,
  language,
  onOpenLineMap,
}: TimetableSidebarProps) {
  const text = getText(language);
  const [timetable, setTimetable] = useState<Timetable | null>(null);
  const [loading, setLoading] = useState(false);
  const [directionKey, setDirectionKey] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !line) return;
    let active = true;
    const controller = new AbortController();

    queueMicrotask(() => {
      if (!active) return;
      setLoading(true);
      setTimetable(null);
    });
    getTimetable(toTimetableRouteId(line.shortName || line.id), { signal: controller.signal })
      .then(result => {
        if (!active) return;
        setTimetable(result);
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

      {timetable && timetable.directions.length > 1 && (
        <DirectionSwitch
          directions={timetable.directions}
          activeKey={direction?.key}
          onSelect={setDirectionKey}
        />
      )}

      {direction && (
        <p className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-400">
          <ArrowsRightLeftIcon className="h-4 w-4 flex-shrink-0 text-slate-500" />
          <span className="truncate">{text.direction} {direction.headsign}</span>
        </p>
      )}

      <div className="mt-4 flex items-baseline justify-between border-b border-slate-800 pb-2">
        <p className="section-caps text-slate-400">{text.stops}</p>
        {direction && (
          <p className="tabular text-xs text-slate-500">{text.trips(direction.tripCount)}</p>
        )}
      </div>

      {loading ? (
        <p className="py-8 text-sm text-slate-400">{text.loading}</p>
      ) : !direction ? (
        <p className="py-8 text-sm leading-relaxed text-slate-500">{text.empty}</p>
      ) : (
        <TimetableGrid
          direction={direction}
          lineColor={lineColor}
          text={text}
          language={language}
          highlightStopName={highlightStopName}
        />
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
              className="fixed left-96 top-0 z-[55] h-screen w-96 overflow-y-auto overflow-x-hidden border-r border-slate-800 bg-slate-900 shadow-2xl"
            >
              <div className="p-6 pb-12">{body}</div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    );
  }

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
            className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 pb-12"
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
