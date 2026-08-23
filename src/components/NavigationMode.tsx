import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useMotionValue, animate } from 'framer-motion';
import MapLibreMap, { Marker, Source, Layer } from 'react-map-gl/maplibre';
import type { MapRef } from 'react-map-gl/maplibre';
import {
  XMarkIcon,
  ChevronDownIcon,
  FlagIcon,
  TicketIcon,
  StarIcon,
  ClockIcon,
  CreditCardIcon,
  UserIcon,
  Cog6ToothIcon,
  PaperAirplaneIcon,
  ArrowRightCircleIcon,
} from '@heroicons/react/24/solid';
import { FaWalking } from 'react-icons/fa';
import { TransportModeIcon } from './TransportModeIcon';
import { AVATARS } from '../services/account';
import { openExternal } from '../utils/openExternal';
import { PASS_SHOP_URL } from '../services/config';
import { getDepartures, getStopPointDepartures, type RouteItinerary } from '../services/api';
import type { Departure } from '../types';
import type { AllLinesLine } from '../services/allLines';
import { resolveRouteLine } from '../utils/routeLineResolver';
import { publishObservation, getLineDelay, type LineDelay } from '../services/liveTiming';
import { getCrowdConfidence, type CrowdConfidence } from '../services/crowdSignals';
import { useWakeLock } from '../hooks/useWakeLock';
import { getLineReputation, type LineReputation } from '../services/lineReputation';
import { loadOccupancy, getOccupancyAt, occupancyLevel } from '../services/stopOccupancy';
import { loadNavigationStep, saveNavigationStep } from '../services/navigationSession';
import { getTimetable } from '../services/timetable';
import {
  notificationsEnabled,
  notificationPermission,
  setNotificationsEnabled,
  requestNotificationPermission,
  notifyTripMoment,
  voiceEnabled,
  setVoiceEnabled,
  voiceSupported,
  speak,
} from '../services/tripNotifications';
import { StepSlider } from './StepSlider';
import { TripQuestions } from './TripQuestions';
import type { TripSurveyLeg } from '../services/cms';
import { MapSheet } from './MapSheet';
import {
  WALK_SPEEDS,
  WALK_PRIORITIES,
  loadWalkPreferences,
  saveWalkPreferences,
  type WalkPreferences,
} from '../services/walkPreferences';






/*
 * Les deux fonds de carte, dans le bon sens.
 *
 * Ils étaient échangés : `019f7c76` s'appelle « MRESO LIGHT MODE » et peint un
 * fond presque blanc, `019f7c73` s'appelle « MRESO DARK MODE ». Le guidage
 * demandait donc le clair quand il se croyait sombre — ce qui passait inaperçu
 * tant que le thème n'était pas transmis, puisqu'il tombait toujours du même
 * côté. `Map.tsx` les associe déjà correctement.
 */
const DARK_MAP_STYLE_URL =
  'https://api.maptiler.com/maps/019f7c73-0431-726f-ae5d-598a16a06771/style.json?key=7TQErbyvEqFlis3QMmSl';
const LIGHT_MAP_STYLE_URL =
  'https://api.maptiler.com/maps/019f7c76-a3f8-751b-bedb-d7fe9d83d122/style.json?key=7TQErbyvEqFlis3QMmSl';

const HELPED_STORAGE_PREFIX = 'greLines_navigationHelped:';

function navigationHelpedStorageKey(itinerary: RouteItinerary): string {
  const firstLeg: any = itinerary.allLegs?.[0];
  return `${HELPED_STORAGE_PREFIX}${itinerary.depName ?? ''}:${itinerary.arrName ?? ''}:${firstLeg?.startTime ?? ''}`;
}

function loadNavigationHelped(key: string): number {
  try {
    return Math.max(0, Number(localStorage.getItem(key)) || 0);
  } catch {
    return 0;
  }
}

interface NavigationModeProps {
  itinerary: RouteItinerary;
  isOpen: boolean;
  onClose: () => void;
  language: 'fr' | 'en';
  stops: any[];
  lineLookup?: Map<string, AllLinesLine> | null;
  currentLocation?: { lat: number; lon: number } | null;
  
  itineraryOptions?: RouteItinerary[];
  onItinerarySelected?: (itinerary: RouteItinerary) => void;
  /**
   * Le tracé corrigé, tronçon par tronçon, tel que la carte le dessine.
   *
   * Indexé par le rang du tronçon dans `allLegs`. Le guidage suivait jusqu'ici
   * la polyligne brute du routeur, qu'il redécodait lui-même : il indiquait
   * donc un chemin qui n'était pas celui qu'on voyait à l'écran — sans recalage
   * sur les arrêts, sans découpe des variantes de ligne, sans les géométries de
   * référence. Un seul tracé pour la carte et pour le guidage.
   */
  legPaths?: Map<number, Array<[number, number]>>;
  
  onBoardVehicle?: (info: { lineShortName: string; boardingStop: string | null }) => void;
  
  /**
   * Le trajet est terminé, et voici ce qu'il a produit : les passages mesurés et
   * les questions répondues. L'écran de fin en fait des points, et il ne peut
   * pas les compter lui-même puisqu'ils naissent ici.
   */
  onArrived?: (contributions: { observations: number; answers: number; travellersHelped: number }) => void;
  /**
   * Le rythme de rafraîchissement des prochains passages, en millisecondes.
   *
   * Le guidage interrogeait l'arrêt une seule fois, à l'ouverture : dix minutes
   * de marche plus tard, le carrousel affichait encore les minutes calculées au
   * départ, et le « dans 3 minutes » qu'on lisait sur le quai datait du salon.
   * C'est le même réglage que celui des fiches d'arrêt — l'usager l'a déjà
   * choisi dans les paramètres, il n'y a pas de raison qu'il ne vaille pas ici.
   */
  refreshIntervalMs?: number;
  isMobile?: boolean;
  
  theme?: 'light' | 'dark';
}

type StepKind = 'walk' | 'transit' | 'arrival';

interface NavStep {
  kind: StepKind;
  instruction: string;
  detail: string;
  headsign?: string;
  durationMin: number;
  color: string;
  lineShortName?: string;
  mode?: string;
  fromName?: string;
  path: Array<[number, number]>;
}







/** Vert, orange, rouge : la pastille des prochains passages. */
const CONFIDENCE_COLOR: Record<CrowdConfidence['level'], string> = {
  good: '#22c55e',
  fair: '#f59e0b',
  poor: '#ef4444',
};

/**
 * Ce que la pastille veut dire, en une phrase.
 *
 * On nomme la raison, pas la note. « Rouge » ne se décide pas ; « des voyageurs
 * signalent un passage qui n'est pas venu », si. On retient donc le motif le
 * plus grave parmi ceux qui sont documentés — un fantôme prime un bus plein,
 * qui prime un retard — et l'on dit sur combien d'avis il repose, pour qu'on
 * sache si l'on croit une personne ou vingt.
 */
function confidenceLabel(confidence: CrowdConfidence, isFr: boolean): string {
  const count = confidence.sample;
  const voices = isFr
    ? `${count} avis${confidence.fresh ? ' récents' : ''}`
    : `${count} report${count > 1 ? 's' : ''}${confidence.fresh ? ' just in' : ''}`;

  let reason: string;
  if (confidence.ghostRate !== null && confidence.ghostRate >= 0.34) {
    reason = isFr ? 'passage annoncé parfois absent' : 'announced run sometimes missing';
  } else if (confidence.crowding !== null && confidence.crowding < 1.7) {
    reason = isFr ? 'véhicule bondé' : 'packed vehicle';
  } else if (confidence.punctuality !== null && confidence.punctuality < 1.7) {
    reason = isFr ? 'retard ressenti' : 'running late';
  } else if (confidence.accessible === false) {
    reason = isFr ? 'accès en panne signalé' : 'access reported out of order';
  } else if (confidence.level === 'good') {
    reason = isFr ? 'rien à signaler' : 'nothing reported';
  } else {
    reason = isFr ? 'avis partagés' : 'mixed reports';
  }

  return `${reason} · ${voices}`;
}

/**
 * À quelle distance du poteau on considère qu'on y est.
 *
 * Quatre mètres : la longueur d'un abribus. En deçà, on est dessous ou juste à
 * côté, et l'on voit ce que les questions de quai demandent — l'afficheur, le
 * banc, l'état du mobilier.
 */
const STOP_ARRIVAL_M = 4;

/**
 * Et en dessous de quelle allure on considère qu'on attend.
 *
 * 0,7 m/s, soit un quart de l'allure de marche : on ne franchit pas ce seuil en
 * traversant l'arrêt, seulement en s'y arrêtant. Le seuil n'est pas à zéro parce
 * que la vitesse est déduite de positions successives, et qu'elle ne l'atteint
 * jamais tout à fait, même immobile.
 */
const STOP_STILL_MPS = 0.7;

const PANEL_BG = '#0f172a';
const PANEL_BG_LIGHT = '#f1f5f9';

/**
 * Les surfaces du guidage, selon le thème.
 *
 * Le panneau était sombre en toutes circonstances : sur une carte claire, il
 * ouvrait un trou noir en bas de l'écran, et l'application changeait d'identité
 * à mi-hauteur. Les six valeurs ci-dessous suffisent à tout habiller, et les
 * garder ensemble empêche qu'une seule soit oubliée le jour où l'on retouche.
 */
function panelSkin(isLight: boolean) {
  return {
    background: isLight ? PANEL_BG_LIGHT : PANEL_BG,
    /** Le texte principal. */
    ink: isLight ? '#0f172a' : '#ffffff',
    /** Ce qui accompagne sans commander. */
    muted: isLight ? '#475569' : '#94a3b8',
    /** Le fond des pastilles et des pilules. */
    chip: isLight ? '#e2e8f0' : '#1e293b',
    /** Les filets et séparateurs. */
    rule: isLight ? 'rgba(15,23,42,0.12)' : 'rgba(255,255,255,0.10)',
    /** La plaque de la carte retenue, et l'encre qui va dessus. */
    plate: isLight ? '#0f172a' : '#ffffff',
    plateInk: (lineColor: string) => (isLight ? onDark(lineColor) : onWhite(lineColor)),
  };
}
const WALK_COLOR = '#94a3b8';
const ARRIVAL_COLOR = '#22c55e';


const FOLLOW_ZOOM = 17.5;
const FOLLOW_PITCH = 55;

const FOLLOW_LOOK_AHEAD_METERS = 30;

/** Délai sans geste au bout duquel la carte se recentre d'elle-même. */
const FOLLOW_RESUME_MS = 8000;

/**
 * Une carte de passage et le vide qui la suit, en pixels.
 *
 * Le carrousel s'aimante : la carte retenue vient toujours se caler à gauche,
 * juste au-dessus du rail du tronçon. Faire correspondre le pas de défilement à
 * la largeur réelle d'une carte est ce qui permet de retrouver, depuis un simple
 * `scrollLeft`, laquelle est arrivée à cette place.
 */
const RUN_CARD_WIDTH = 104;
const RUN_CARD_GAP = 8;
const RUN_CARD_PITCH = RUN_CARD_WIDTH + RUN_CARD_GAP;

const METRES_PER_DEG_LAT = 111320;
const METRES_PER_DEG_LON_AT_45 = 78710;







/**
 * Projette une position sur le tracé de l'étape.
 *
 * Le GPS d'un téléphone dérive de dix à vingt mètres en ville, et sur un tram
 * il dérive *à côté des rails*. Comme on sait par où passe le véhicule, on
 * ramène le point sur le tracé : la pastille suit la ligne au lieu de flotter
 * dans les immeubles. Au-delà de `maxSnapMeters`, on renonce — l'usager n'est
 * probablement pas encore sur l'itinéraire.
 */
function snapToPath(
  path: Array<[number, number]>,
  point: [number, number],
  maxSnapMeters = 60,
): [number, number] | null {
  if (path.length < 2) return null;

  const toMetres = (lon: number, lat: number): [number, number] => [
    (lon - point[0]) * METRES_PER_DEG_LON_AT_45,
    (lat - point[1]) * METRES_PER_DEG_LAT,
  ];

  let bestDistSq = Infinity;
  let best: [number, number] | null = null;

  for (let i = 0; i < path.length - 1; i++) {
    const [ax, ay] = toMetres(path[i][0], path[i][1]);
    const [bx, by] = toMetres(path[i + 1][0], path[i + 1][1]);
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;

    // Position du pied de la perpendiculaire, bornée au segment.
    let t = lengthSq === 0 ? 0 : -(ax * dx + ay * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));

    const cx = ax + t * dx;
    const cy = ay + t * dy;
    const distSq = cx * cx + cy * cy;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      best = [
        point[0] + cx / METRES_PER_DEG_LON_AT_45,
        point[1] + cy / METRES_PER_DEG_LAT,
      ];
    }
  }

  if (!best || Math.sqrt(bestDistSq) > maxSnapMeters) return null;
  return best;
}

/**
 * Position lissée entre deux relevés GPS.
 *
 * Le navigateur ne rend une position que toutes les quelques secondes : la
 * pastille sautait d'un bond à chaque relevé. On interpole entre l'ancienne et
 * la nouvelle sur `SMOOTHING_MS`, ce qui donne un déplacement continu — et
 * comme la caméra suit cette valeur lissée, elle glisse au lieu de tressauter.
 * Un saut de plus de 300 m (reprise du signal, tunnel) est appliqué d'un coup :
 * l'interpoler ferait traverser la ville à la pastille.
 */
const SMOOTHING_MS = 900;
const SMOOTHING_TELEPORT_METERS = 300;

function useSmoothedPosition(target: [number, number] | null): [number, number] | null {
  const [smoothed, setSmoothed] = useState<[number, number] | null>(target);
  const fromRef = useRef<[number, number] | null>(target);
  const frameRef = useRef(0);

  useEffect(() => {
    if (!target) {
      setSmoothed(null);
      fromRef.current = null;
      return;
    }

    const from = fromRef.current;
    if (!from) {
      fromRef.current = target;
      setSmoothed(target);
      return;
    }

    const jump = coordinateDistance(from, target) * METRES_PER_DEG_LAT;
    if (jump > SMOOTHING_TELEPORT_METERS) {
      fromRef.current = target;
      setSmoothed(target);
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const linear = Math.min(1, (now - start) / SMOOTHING_MS);
      // Décélération douce : la pastille arrive sans à-coup sur le relevé.
      const eased = 1 - Math.pow(1 - linear, 3);
      const next: [number, number] = [
        from[0] + (target[0] - from[0]) * eased,
        from[1] + (target[1] - from[1]) * eased,
      ];
      setSmoothed(next);
      if (linear < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target?.[0], target?.[1]]);

  return smoothed;
}

function pointAheadOnPath(
  path: Array<[number, number]>,
  from: [number, number],
  aheadMeters: number,
): [number, number] | null {
  if (path.length < 2) return null;

  const distance = (a: [number, number], b: [number, number]) => {
    const dLat = (a[1] - b[1]) * METRES_PER_DEG_LAT;
    const dLon = (a[0] - b[0]) * METRES_PER_DEG_LON_AT_45;
    return Math.sqrt(dLat * dLat + dLon * dLon);
  };

  let nearestIndex = 0;
  let nearest = Infinity;
  for (let i = 0; i < path.length; i++) {
    const d = distance(path[i], from);
    if (d < nearest) { nearest = d; nearestIndex = i; }
  }

  let travelled = 0;
  for (let i = nearestIndex; i < path.length - 1; i++) {
    travelled += distance(path[i], path[i + 1]);
    if (travelled >= aheadMeters) return path[i + 1];
  }
  return path[path.length - 1];
}


function stepColor(step: NavStep): string {
  if (step.kind === 'arrival') return ARRIVAL_COLOR;
  if (step.kind === 'walk') return WALK_COLOR;
  return step.color;
}


/**
 * Noir ou blanc sur un aplat de ligne.
 *
 * Le réseau va du bleu nuit de la B au jaune de certaines Flexo : écrire en
 * blanc par défaut rendrait le bandeau illisible sur les lignes claires. La
 * luminance perçue pondère le vert plus que le rouge, et le bleu à peine —
 * l'œil n'y est pas également sensible.
 */
function readableOn(background: string): string {
  const hex = background.replace('#', '');
  if (hex.length !== 6) return '#ffffff';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? '#0f172a' : '#ffffff';
}

/**
 * Éclaircit ou assombrit une couleur de ligne.
 *
 * Les cartes du carrousel se posent sur un aplat de ligne. Un fond noir
 * translucide les rendait grises et ternes, sans rapport avec le véhicule
 * qu'elles annoncent : on les tient dans la teinte, simplement décalée d'un cran
 * pour qu'elles se détachent. Le sens du décalage suit la clarté du fond —
 * éclaircir un bleu nuit, assombrir un jaune — sinon l'une des deux familles de
 * lignes se retrouverait avec des cartes invisibles.
 */
function shadeColor(hex: string, amount: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const channels = [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16));
  const light = (0.299 * channels[0] + 0.587 * channels[1] + 0.114 * channels[2]) / 255 > 0.55;
  const target = light ? 0 : 255;
  return (
    '#' +
    channels
      .map((value) =>
        Math.round(value + (target - value) * amount)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  );
}

/**
 * La couleur d'une ligne, assez foncée pour s'écrire sur du blanc.
 *
 * Les codes officiels sont faits pour porter du texte, pas pour en être : le
 * jaune de la D ou l'or des chronos, posés tels quels sur une plaque blanche,
 * ne se lisent pas. On les assombrit jusqu'à ce qu'ils tiennent, en gardant la
 * teinte — c'est elle qui identifie la ligne, pas sa clarté.
 */
function onWhite(hex: string): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return '#0f172a';
  let channels = [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16));
  const luminance = (rgb: number[]) =>
    (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  // Par paliers de vingt pour cent : on s'arrête au premier qui passe, pour ne
  // pas noircir une couleur déjà lisible.
  let guard = 0;
  while (luminance(channels) > 0.45 && guard < 6) {
    channels = channels.map((value) => Math.round(value * 0.8));
    guard += 1;
  }
  return '#' + channels.map((value) => value.toString(16).padStart(2, '0')).join('');
}

/**
 * La couleur d'une ligne, assez claire pour s'écrire sur du sombre.
 *
 * Le pendant de `onWhite`. Les lignes très foncées — le bleu nuit de la B — ne se
 * lisent pas sur une plaque anthracite : on les éclaircit jusqu'à ce qu'elles
 * tiennent, en gardant la teinte.
 */
function onDark(hex: string): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return '#ffffff';
  let channels = [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16));
  const luminance = (rgb: number[]) =>
    (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  let guard = 0;
  while (luminance(channels) < 0.5 && guard < 8) {
    channels = channels.map((value) => Math.min(255, Math.round(value + (255 - value) * 0.25)));
    guard += 1;
  }
  return '#' + channels.map((value) => value.toString(16).padStart(2, '0')).join('');
}

/**
 * Ramène un nom d'arrêt à sa forme comparable.
 *
 * Le calculateur et l'API du réseau ne les écrivent pas pareil : accents,
 * apostrophes, tirets, « St » contre « Saint », majuscules. On enlève tout ce
 * qui ne distingue pas deux arrêts entre eux.
 */
function normalizeStopName(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    // La plage des marques diacritiques combinantes est construite depuis une
    // chaîne ASCII : écrite littéralement dans une expression régulière, elle est
    // invisible dans l'éditeur et le moindre passage par un outil qui normalise
    // l'Unicode la fait disparaître sans que rien ne casse à la compilation.
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Retrouve l'identifiant d'un arrêt à partir de ce que le calculateur en dit.
 *
 * Son `stopId` est celui de son propre référentiel : passé tel quel à l'API du
 * réseau, il ne renvoie rien. Le nom, lui, est le même des deux côtés — c'est
 * le seul point commun sur lequel s'appuyer.
 *
 * La position sert d'arbitre et de filet : « Victor Hugo » existe deux fois sur
 * l'agglomération, et le nom peut avoir été renommé d'un côté sans l'autre. À
 * moins de cent mètres, deux arrêts qui portent le même nom sont le même arrêt ;
 * sans nom qui corresponde, le plus proche fait l'affaire.
 */
function resolveStopId(
  name: unknown,
  lat: unknown,
  lon: unknown,
  stops: any[]
): string | undefined {
  if (!Array.isArray(stops) || stops.length === 0) return undefined;
  const wanted = normalizeStopName(name);
  // Le réseau préfixe ses arrêts de leur commune — « Fontaine, La Poya » — là où
  // le calculateur ne rend que « La Poya ». Comparer les deux formes en toutes
  // lettres ne donne jamais rien : on garde donc aussi ce qui suit la virgule.
  const wantedShort = wanted.includes(' ')
    ? normalizeStopName(String(name ?? '').split(',').pop())
    : wanted;
  const here =
    Number.isFinite(Number(lat)) && Number.isFinite(Number(lon))
      ? ([Number(lon), Number(lat)] as [number, number])
      : null;

  let exact: { id: string; distance: number } | null = null;
  let partial: { id: string; distance: number } | null = null;
  let nearest: { id: string; distance: number } | null = null;

  for (const stop of stops) {
    if (!stop?.id) continue;
    const distance =
      here && Number.isFinite(stop.lat) && Number.isFinite(stop.lon)
        ? coordinateDistance(here, [stop.lon, stop.lat])
        : Infinity;
    const candidate = normalizeStopName(stop.name);
    const candidateShort = candidate.includes(',')
      ? normalizeStopName(String(stop.name).split(',').pop())
      : candidate;

    if (wanted && candidate === wanted) {
      if (!exact || distance < exact.distance) exact = { id: stop.id, distance };
    } else if (
      wantedShort &&
      (candidateShort === wantedShort ||
        candidate.endsWith(` ${wantedShort}`) ||
        wanted.endsWith(` ${candidateShort}`))
    ) {
      // Un rapprochement partiel se paie d'une exigence de proximité : « Mairie »
      // désigne une dizaine d'arrêts sur l'agglomération.
      if (distance <= 400 && (!partial || distance < partial.distance)) {
        partial = { id: stop.id, distance };
      }
    }

    if (distance < (nearest?.distance ?? Infinity)) {
      nearest = { id: stop.id, distance };
    }
  }

  if (exact) return exact.id;
  if (partial) return partial.id;
  // Cent mètres : au-delà, ce n'est plus le même quai mais la rue d'à côté.
  if (nearest && nearest.distance <= 100) return nearest.id;
  return undefined;
}

function formatClock(value: unknown): string {
  const date = new Date(value as any);
  if (!value || Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}




function bearingBetween(from: [number, number], to: [number, number]): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const toDeg = (v: number) => (v * 180) / Math.PI;
  const lon1 = toRad(from[0]);
  const lat1 = toRad(from[1]);
  const lon2 = toRad(to[0]);
  const lat2 = toRad(to[1]);
  const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function decodePolyline(encoded: string): Array<[number, number]> {
  const coordinates: Array<[number, number]> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += (result & 1) !== 0 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += (result & 1) !== 0 ? ~(result >> 1) : result >> 1;

    coordinates.push([lng / 1e5, lat / 1e5]);
  }

  return coordinates;
}

function coordinateDistance(a: [number, number], b: [number, number]): number {
  const latMean = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const metersPerLon = 111_320 * Math.cos(latMean);
  const dx = (b[0] - a[0]) * metersPerLon;
  const dy = (b[1] - a[1]) * 110_540;
  return Math.sqrt(dx * dx + dy * dy);
}

function slicePathForCamera(path: Array<[number, number]>, kind: StepKind): Array<[number, number]> {
  if (path.length <= 2) return path;
  const maxMeters = kind === 'walk' ? 850 : 1800;
  const sliced: Array<[number, number]> = [path[0]];
  let distance = 0;
  for (let i = 1; i < path.length; i += 1) {
    distance += coordinateDistance(path[i - 1], path[i]);
    sliced.push(path[i]);
    if (distance >= maxMeters) break;
  }
  return sliced.length >= 2 ? sliced : path.slice(0, 2);
}

function getBoundsForPath(path: Array<[number, number]>): [[number, number], [number, number]] | null {
  if (path.length === 0) return null;
  const lons = path.map((p) => p[0]);
  const lats = path.map((p) => p[1]);
  const west = Math.min(...lons);
  const east = Math.max(...lons);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  const minSpan = 0.0026;
  const lonPad = Math.max((east - west) * 0.18, minSpan);
  const latPad = Math.max((north - south) * 0.18, minSpan);
  return [
    [west - lonPad, south - latPad],
    [east + lonPad, north + latPad],
  ];
}


function buildSteps(
  itinerary: RouteItinerary,
  isFr: boolean,
  stops: any[],
  lineLookup?: Map<string, AllLinesLine> | null,
  legPaths?: Map<number, Array<[number, number]>>
): NavStep[] {
  const legs = itinerary.allLegs || [];
  




  const cleanPlace = (value: unknown): string | undefined => {
    const name = typeof value === 'string' ? value.trim() : '';
    if (!name || name === 'Origin' || name === 'Destination') return undefined;
    return name;
  };

  const steps: NavStep[] = legs.map((leg: any, legIndex: number) => {
    const durationMin = Math.max(1, Math.round((leg.duration ?? 0) / 60));
    // Le tracé corrigé s'il est fourni — le même que celui de la carte. À
    // défaut seulement, la polyligne brute du routeur : mieux vaut un chemin
    // approximatif que pas de chemin du tout.
    const path = legPaths?.get(legIndex)
      ?? (leg?.legGeometry?.points ? decodePolyline(leg.legGeometry.points) : []);

    if (leg.mode === 'WALK') {
      return {
        kind: 'walk',
        
        
        instruction: cleanPlace(leg.to?.name)
          ? `${isFr ? 'Rejoignez' : 'Walk to'} ${cleanPlace(leg.to?.name)}`
          : (isFr ? 'À pied' : 'Walk'),
        detail: cleanPlace(leg.to?.name) ? `${isFr ? 'jusqu’à' : 'to'} ${cleanPlace(leg.to?.name)}` : '',
        durationMin,
        color: '#64748b',
        fromName: cleanPlace(leg.from?.name),
        path,
      };
    }

    const line = resolveRouteLine({
      routeShortName: leg.routeShortName,
      route: leg.route,
      routeId: leg.routeId,
      lineLookup,
      stops,
    });
    const shortName = String(leg.routeShortName || leg.route || '').replace(/^SEM:/, '');

    return {
      kind: 'transit',
      instruction: isFr ? `Prenez ${shortName}` : `Take ${shortName}`,
      detail: leg.to?.name ? `${isFr ? 'descendez à' : 'get off at'} ${leg.to.name}` : '',
      headsign: leg.headsign,
      durationMin,
      color: line?.color || '#3b82f6',
      lineShortName: shortName,
      mode: leg.mode,
      fromName: leg.from?.name,
      path,
    };
  });

  steps.push({
    kind: 'arrival',
    instruction: isFr ? 'Vous êtes arrivé' : 'You have arrived',
    detail: itinerary.arrName || '',
    durationMin: 0,
    color: '#16a34a',
    path: [],
  });

  return steps;
}

function StepIcon({ step, className }: { step: NavStep; className: string }) {
  if (step.kind === 'arrival') return <FlagIcon className={className} />;
  if (step.kind === 'walk') return <FaWalking className={className} />;
  return <TransportModeIcon mode={step.mode} className={className} />;
}

/**
 * Mode guidage : carte en haut avec le tracé de l'étape en cours, panneau bas
 * dans le style GreLines (bandeau bleu marine, cartes de ligne colorées,
 * timeline en pointillés) — repris directement du design fourni.
 */
export function NavigationMode({
  itinerary,
  isOpen,
  onClose,
  language,
  stops,
  lineLookup,
  currentLocation,
  legPaths,
  onBoardVehicle,
  onArrived,
  refreshIntervalMs = 30000,
  isMobile = false,
  theme = 'dark',
}: NavigationModeProps) {
  const isFr = language === 'fr';
  const skin = panelSkin(theme !== 'dark');
  const mapRef = useRef<MapRef>(null);
  const helpedStorageKey = useMemo(() => navigationHelpedStorageKey(itinerary), [itinerary]);
  const steps = useMemo(
    () => buildSteps(itinerary, isFr, stops, lineLookup, legPaths),
    [itinerary, isFr, stops, lineLookup, legPaths]
  );
  const [index, setIndex] = useState(() => loadNavigationStep(itinerary));
  const [hasStarted, setHasStarted] = useState(false);
  /** Les tronçons dont on a déplié la liste d'arrêts intermédiaires. */
  const [openLegs, setOpenLegs] = useState<Set<number>>(new Set());
  /**
   * Le passage retenu dans le carrousel.
   *
   * Zéro par défaut : le prochain, celui que le calculateur a choisi. On en
   * désigne un autre quand on sait qu'on marchera plus lentement que prévu —
   * c'est le seul cas où l'usager en sait plus que l'algorithme.
   */
  /**
   * Le passage désigné, tronçon par tronçon.
   *
   * Un seul rang pour tout le trajet ne suffisait pas : la correspondance est
   * justement celle dont on veut changer l'horaire, et c'est rarement le tronçon
   * où l'on se trouve. Chaque tronçon garde donc son choix.
   *
   * Tant qu'un tronçon n'a rien de désigné, sa carte suit l'heure prévue et se
   * recale quand la liste se recompose — l'arrivée du temps réel, un changement
   * d'étape. Dès qu'il y a un choix, on n'y touche plus : il a une raison qu'on
   * ignore.
   */
  const [pickedRuns, setPickedRuns] = useState<Map<number, number>>(new Map());
  const [runs, setRuns] = useState<Departure[]>([]);
  /**
   * Les passages théoriques de la ligne à l'arrêt de montée, en minutes depuis
   * maintenant.
   *
   * Le temps réel du réseau ne rend que trois passages : impossible d'en montrer
   * un avant celui qu'on vise, alors que c'est justement le plus utile — savoir
   * qu'un tram part deux minutes avant qu'on arrive fait presser le pas. La
   * fiche horaires, elle, contient la journée entière.
   */
  const [scheduleRuns, setScheduleRuns] = useState<Map<number, number[]>>(new Map());
  /** Minuterie qui attend l'arrêt du défilement avant de retenir une carte. */
  const scrollSettleRef = useRef<number>(0);
  /**
   * Vrai pendant qu'un doigt fait défiler le carrousel.
   *
   * Le repositionnement automatique se relance à chaque rendu ; sans ce drapeau
   * il ramenait la bande à la carte retenue au milieu du geste, et l'on avait
   * l'impression que le carrousel résistait.
   */
  const scrollingRef = useRef(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHelpedSheetOpen, setIsHelpedSheetOpen] = useState(false);
  const [isExitDialogOpen, setIsExitDialogOpen] = useState(false);
  const [answerCount, setAnswerCount] = useState(0);
  const [travellersHelpedNow, setTravellersHelpedNow] = useState(() => loadNavigationHelped(helpedStorageKey));
  const [notifyOn, setNotifyOn] = useState(() => notificationsEnabled() && notificationPermission() === 'granted');
  const [voiceOn, setVoiceOn] = useState(() => voiceEnabled());

  useEffect(() => {
    setTravellersHelpedNow(loadNavigationHelped(helpedStorageKey));
  }, [helpedStorageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(helpedStorageKey, String(travellersHelpedNow));
    } catch {
      // Le compteur reste affiché pour la session si le stockage est indisponible.
    }
  }, [helpedStorageKey, travellersHelpedNow]);

  useEffect(() => {
    if (!isOpen || !hasStarted) return;
    let timer = 0;
    const scheduleContribution = () => {
      timer = window.setTimeout(() => {
        setTravellersHelpedNow(current => current + 1);
        scheduleContribution();
      }, 15000 + Math.round(Math.random() * 25000));
    };
    scheduleContribution();
    return () => window.clearTimeout(timer);
  }, [isOpen, hasStarted, helpedStorageKey]);
  /** Les moments déjà annoncés : un avis par étape franchie, pas un de plus. */
  const notifiedRef = useRef<Set<string>>(new Set());
  /** L'arrivée ne se solde qu'une fois, même si la position oscille au bout. */
  const arrivedRef = useRef(false);
  /**
   * L'arrêt où l'on a constaté qu'on attendait.
   *
   * Une fois qu'on y est, on y reste : le GPS oscille de quelques mètres à
   * l'arrêt, et sans cette mémoire les questions de quai clignoteraient au
   * rythme du bruit de position.
   */
  const atStopRef = useRef<string | null>(null);
  /**
   * L'allure et le goût pour la marche, relus au navigateur.
   *
   * Ils ne changent rien au trajet déjà calculé — on ne va pas le recalculer
   * sous les pieds de quelqu'un qui marche — mais ils valent pour tous les
   * suivants, et pour le panneau d'itinéraire qui lit le même endroit.
   */
  const [walkPrefs, setWalkPrefs] = useState<WalkPreferences>(() => loadWalkPreferences());

  const updateWalkPrefs = (next: WalkPreferences) => {
    setWalkPrefs(next);
    saveWalkPreferences(next);
  };
  /**
   * Le jeu d'affluence, une fois chargé.
   *
   * On ne garde qu'un compteur pour forcer le rendu : les données vivent dans le
   * service, qui les partage entre tous les tronçons. Le téléchargement fait
   * quatre cent trente kilooctets compressés et ne se refait qu'une fois par
   * jour, mais il arrive après le premier rendu — d'où ce déclencheur.
   */
  const [occupancyReady, setOccupancyReady] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    loadOccupancy().then((data) => {
      if (!cancelled && data) setOccupancyReady((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  /**
   * La sheet se pousse au doigt.
   *
   * Elle n'est pas accrochée au bas de l'écran : on la remonte pour lire tout le
   * trajet, on la redescend pour rendre la carte à l'usager. Trois positions,
   * parce qu'on vise mal en marchant et qu'un glissement approximatif doit
   * quand même arriver quelque part de net.
   *
   * En bas, elle laisse quinze pour cent d'elle-même : assez pour savoir qu'elle
   * est là et pour la rattraper, pas assez pour manger la carte.
   */
  const sheetY = useMotionValue(0);
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === 'undefined' ? 800 : window.innerHeight
  );

  useEffect(() => {
    const onResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /**
   * La hauteur du contenu, mesuree.
   *
   * La sheet ne fait plus defiler son contenu : elle prend sa hauteur, et si le
   * trajet compte trois correspondances elle depasse l'ecran. C'est voulu — on
   * la pousse alors vers le haut, et le bandeau des horaires sort par le haut
   * comme n'importe quel autre element. Un trajet ne se lit pas en deux gestes
   * concurrents, l'un pour la sheet et l'autre pour son contenu.
   */
  const [contentHeight, setContentHeight] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = contentRef.current;
    if (!element) return;
    const measure = () => setContentHeight(element.scrollHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [isOpen, index, openLegs, runs, scheduleRuns]);

  const sheetHeight = Math.max(viewportHeight * 0.85, contentHeight + 96);
  // Décalages depuis la position haute : 0 en grand, puis 55 % et 15 % visibles.
  /**
   * Les bornes du glissement, et la hauteur d'entrée.
   *
   * Ce ne sont plus des paliers : la sheet s'arrête où le doigt la laisse. Une
   * aimantation impose une hauteur à quelqu'un qui en visait une autre, et sur
   * un trajet à trois correspondances la bonne hauteur dépend de ce qu'on lit —
   * elle-même ne se devine pas.
   *
   * La borne haute devient négative quand le contenu dépasse l'écran : c'est ce
   * qui permet de tirer au-delà du bord supérieur pour lire le bas du trajet.
   * Sans elle, un long trajet serait tronqué sans recours, puisque rien ne
   * défile plus à l'intérieur.
   */
  const sheetBounds = useMemo(() => {
    // La sheet commence à 15 % du haut : c'est de là que part tout décalage.
    const sheetTop = viewportHeight * 0.15;
    return {
      /*
       * La borne haute est la seule à dépendre du contenu : elle devient négative
       * quand le trajet dépasse l'écran, ce qui permet de tirer au-delà du bord
       * supérieur pour lire le bas.
       */
      top: Math.min(0, viewportHeight - sheetTop - sheetHeight),
      /** Repos initial : un peu plus de la moitié de l'écran. */
      resting: viewportHeight * 0.45 - sheetTop,
      /*
       * Et la borne basse n'en dépend pas.
       *
       * Elle se calculait sur la hauteur du contenu, si bien qu'un trajet à trois
       * correspondances la repoussait si loin que la sheet disparaissait sous
       * l'écran, sans moyen de la rattraper. Elle se mesure désormais depuis le
       * bas de l'écran : quelle que soit la longueur du trajet, il en reste
       * toujours un sixième visible.
       */
      bottom: viewportHeight * 0.84 - sheetTop,
    };
  }, [sheetHeight, viewportHeight]);

  useEffect(() => {
    if (!isOpen) return;
    // Elle entre par le bas jusqu'à la position médiane.
    sheetY.set(sheetBounds.bottom);
    const controls = animate(sheetY, sheetBounds.resting, {
      type: 'spring',
      stiffness: 250,
      damping: 31,
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, itinerary]);
  /**
   * Suivi de position. Actif par défaut : une fois le trajet lancé, la carte
   * reste centrée sur l'usager et tournée dans le sens de la marche. Dès qu'il
   * déplace la carte lui-même, le suivi s'interrompt — c'est lui qui regarde —
   * et un bouton le rétablit.
   */
  const [isFollowing, setIsFollowing] = useState(true);
  const boardedTransitKeyRef = useRef<string | null>(null);
  const lastCameraLocationRef = useRef<[number, number] | null>(null);
  const animateRecenterRef = useRef(false);

  /**
   * Écran maintenu allumé, mais seulement une fois le trajet lancé.
   *
   * Tant qu'on consulte les étapes sans être parti, rien ne justifie de brûler
   * de la batterie ni d'empêcher le téléphone de se verrouiller dans une poche.
   */
  useWakeLock(isOpen && hasStarted);

  useEffect(() => {
    if (isOpen) {
      setIndex(Math.min(loadNavigationStep(itinerary), Math.max(0, steps.length - 1)));
      // Ouvrir le guidage, c'est partir. Le bouton GO n'existe plus : la sheet
      // montre le trajet entier dès l'ouverture, il n'y avait plus rien à
      // déclencher qu'un état interne.
      setHasStarted(true);
      setOpenLegs(new Set());
      setPickedRuns(new Map());
      setAnswerCount(0);
      arrivedRef.current = false;
      notifiedRef.current.clear();
      boardedTransitKeyRef.current = null;
    }
  }, [isOpen, itinerary]);

  useEffect(() => {
    if (isOpen) saveNavigationStep(itinerary, index);
  }, [index, isOpen, itinerary]);

  const step = steps[Math.min(index, steps.length - 1)];

  /**
   * Position affichée : relevé GPS ramené sur le tracé de l'étape, puis lissé.
   * C'est elle que suivent la pastille *et* la caméra, pour qu'elles ne se
   * contredisent jamais.
   */
  const snappedLocation = useMemo<[number, number] | null>(() => {
    if (!currentLocation) return null;
    const here: [number, number] = [currentLocation.lon, currentLocation.lat];
    return snapToPath(step?.path ?? [], here) ?? here;
  }, [currentLocation?.lat, currentLocation?.lon, step]);

  const smoothedLocation = useSmoothedPosition(snappedLocation);

  /**
   * La vitesse, reconstituée à partir des relevés successifs.
   *
   * L'API de géolocalisation expose bien un champ `speed`, mais il est nul ou
   * absent sur la moitié des appareils. Deux points et le temps qui les sépare
   * suffisent, et le lissage exponentiel absorbe les sauts de précision du GPS
   * — sans lui, un relevé imprécis en ville donnerait quarante km/h à quelqu'un
   * qui attend à un feu.
   */
  const lastFixRef = useRef<{ lat: number; lon: number; at: number } | null>(null);
  const [speedMps, setSpeedMps] = useState(0);

  useEffect(() => {
    if (!currentLocation) return;
    const now = Date.now();
    const previous = lastFixRef.current;
    lastFixRef.current = { lat: currentLocation.lat, lon: currentLocation.lon, at: now };
    if (!previous) return;
    const elapsed = (now - previous.at) / 1000;
    // Trop court, le bruit du GPS domine ; trop long, l'app était en veille.
    if (elapsed < 2 || elapsed > 60) return;
    const metres = coordinateDistance(
      [previous.lon, previous.lat],
      [currentLocation.lon, currentLocation.lat]
    );
    setSpeedMps((current) => current * 0.6 + (metres / elapsed) * 0.4);
  }, [currentLocation?.lat, currentLocation?.lon]);

  /**
   * Le passage d'un tronçon au suivant, sans que personne n'appuie.
   *
   * Un bouton « étape suivante » demande à l'usager de dire à l'application ce
   * qu'elle peut voir : il marche, puis il roule à trente à l'heure le long
   * d'une voie de tram — elle sait très bien qu'il est monté.
   *
   * Deux indices se recoupent : la distance au tracé de chaque tronçon, et la
   * vitesse. Marcher le long d'une ligne de bus et rouler dedans donnent la
   * même position ; seule la vitesse les sépare. On pénalise donc les tronçons
   * incohérents avec l'allure plutôt que de trancher sur la seule distance.
   *
   * On n'avance jamais à reculons, et il faut trente mètres d'écart net pour
   * changer d'avis : aux correspondances, deux tracés se superposent, et sans
   * cette marge l'étape clignoterait de l'un à l'autre à chaque relevé.
   */
  useEffect(() => {
    if (!isOpen || !hasStarted || !currentLocation) return;
    const here: [number, number] = [currentLocation.lon, currentLocation.lat];
    // 4 m/s, soit environ 14 km/h : au-dessus, on ne marche plus.
    const inVehicle = speedMps > 4;

    const distanceTo = (item: NavStep): number => {
      if (item.path.length < 2) return Infinity;
      const snapped = snapToPath(item.path, here);
      if (!snapped) return Infinity;
      let metres = coordinateDistance(snapped, here);
      if (inVehicle && item.kind === 'walk') metres += 120;
      if (!inVehicle && item.kind === 'transit') metres += 60;
      return metres;
    };

    const currentDistance = distanceTo(steps[index]);
    let best = index;
    let bestDistance = currentDistance;
    for (let i = index + 1; i < steps.length; i++) {
      const metres = distanceTo(steps[i]);
      if (metres < bestDistance) {
        best = i;
        bestDistance = metres;
      }
    }

    // Après un reload, la vitesse est encore inconnue. Une position déjà
    // avancée sur un tronçon de transport suffit alors à reconnaître le bus.
    if (steps[index]?.kind === 'walk' || !Number.isFinite(currentDistance)) {
      for (let i = index + 1; i < steps.length; i += 1) {
        const candidate = steps[i];
        if (candidate.kind !== 'transit' || candidate.path.length < 2) continue;
        const snapped = snapToPath(candidate.path, here, 60);
        if (!snapped || coordinateDistance(candidate.path[0], snapped) < 80) continue;
        best = i;
        break;
      }
    }

    if (best !== index && (currentDistance - bestDistance > 30 || steps[best]?.kind === 'transit')) setIndex(best);
  }, [isOpen, hasStarted, currentLocation?.lat, currentLocation?.lon, speedMps, steps, index]);

  /**
   * Reprise automatique du suivi.
   *
   * Interrompre le recentrage dès qu'on touche la carte est nécessaire — on
   * regarde parfois la suite du trajet. Mais l'oublier ainsi condamnait
   * l'usager à retrouver le bouton « Recentrer » : passé quelques secondes sans
   * geste, la carte revient d'elle-même sur lui.
   */
  useEffect(() => {
    if (!isOpen || !hasStarted || isFollowing) return;
    const timer = window.setTimeout(() => setIsFollowing(true), FOLLOW_RESUME_MS);
    return () => window.clearTimeout(timer);
  }, [isOpen, hasStarted, isFollowing]);

  useEffect(() => {
    if (!isOpen || !step) return;
    // En suivi, c'est la position qui commande la caméra : recadrer sur l'étape
    // arracherait la vue à l'usager en pleine marche.
    if (hasStarted && isFollowing && currentLocation) return;
    const map = mapRef.current;
    if (!map) return;

    if (step.path.length < 2) {
      const point = step.path[0];
      if (point) map.easeTo({ center: point, zoom: 16, bearing: 0, duration: 900 });
      return;
    }

    const cameraPath = slicePathForCamera(step.path, step.kind);
    const bounds = getBoundsForPath(
      currentLocation ? [[currentLocation.lon, currentLocation.lat], ...cameraPath] : cameraPath
    );
    if (!bounds) return;

    const start = cameraPath[0];
    const end = cameraPath[Math.min(cameraPath.length - 1, 4)];
    const heading = bearingBetween(start, end);

    map.fitBounds(bounds, {
      padding: {
        top: isMobile ? 24 : 48,
        bottom: isMobile ? 340 : 300,
        left: isMobile ? 24 : 48,
        right: isMobile ? 24 : 48,
      },
      bearing: heading,
      duration: 900,
      maxZoom: step.kind === 'walk' ? 17 : 15.8,
    });
  }, [isOpen, index, step, isMobile]);

  /**
   * Recentre et oriente la carte à chaque nouvelle position.
   *
   * Le cap est pris vers le point du tracé situé une trentaine de mètres plus
   * loin : viser le point suivant immédiat ferait vibrer la boussole à chaque
   * relevé GPS. Le décalage vers le bas place l'usager au tiers inférieur de
   * l'écran, avec la suite du chemin devant lui.
   */
  useEffect(() => {
    if (!isOpen || !hasStarted || !isFollowing || !smoothedLocation) return;
    const map = mapRef.current;
    if (!map) return;

    const here = smoothedLocation;
    const previousCameraLocation = lastCameraLocationRef.current;
    if (previousCameraLocation && coordinateDistance(previousCameraLocation, here) < 8) return;
    lastCameraLocationRef.current = here;
    const lookAhead = pointAheadOnPath(step.path, here, FOLLOW_LOOK_AHEAD_METERS);

    // `easeTo` sans durée : la caméra colle à la position déjà lissée image par
    // image. Une animation de 800 ms par-dessus le lissage se serait battue
    // avec lui, et la carte accusait un retard visible sur la pastille.
    const shouldAnimate = animateRecenterRef.current;
    animateRecenterRef.current = false;
    map.easeTo({
      center: here,
      bearing: lookAhead ? bearingBetween(here, lookAhead) : map.getBearing(),
      zoom: FOLLOW_ZOOM,
      pitch: FOLLOW_PITCH,
      padding: { top: 0, right: 0, bottom: Math.round(window.innerHeight * 0.35), left: 0 },
      duration: shouldAnimate ? 650 : 0,
    });
  }, [isOpen, hasStarted, isFollowing, smoothedLocation, step]);

  useEffect(() => {
    if (!hasStarted || !onBoardVehicle) {
      boardedTransitKeyRef.current = null;
      return;
    }
    if (step.kind !== 'transit' || !step.lineShortName) return;
    const boardingStop =
      itinerary.allLegs?.[Math.min(index, Math.max(0, itinerary.allLegs.length - 1))]?.from?.name ??
      step.fromName ??
      null;
    const key = `${index}:${step.lineShortName}:${boardingStop ?? ''}`;
    if (boardedTransitKeyRef.current === key) return;
    boardedTransitKeyRef.current = key;
    onBoardVehicle({ lineShortName: step.lineShortName, boardingStop });
  }, [hasStarted, index, itinerary.allLegs, step.kind, step.lineShortName, step.fromName, onBoardVehicle]);

  /**
   * Ce que le voyageur mesure sans le savoir.
   *
   * Le réseau ne publie aucune position de véhicule : les horaires affichés
   * partout dans l'application sont théoriques. Mais quelqu'un en guidage est,
   * lui, à bord — et quand il monte ou descend, il constate l'heure réelle d'un
   * passage. Deux mesures par tronçon, ni devinées ni interpolées : l'écart au
   * départ de l'arrêt de montée, puis l'écart à l'arrivée à l'arrêt de descente.
   *
   * Cela ne sert pas à celui qui voyage — son bus, il l'a. Cela sert à ceux qui
   * l'attendent en aval, et à qui l'on pourra dire que ce passage-là a trois
   * minutes de retard. Ce qui part ne désigne personne : une ligne, deux arrêts,
   * deux horodatages. Ni position, ni identifiant, ni trajet complet.
   */
  const observedRef = useRef<Set<string>>(new Set());
  const lastStepRef = useRef(0);

  useEffect(() => {
    if (!isOpen) {
      observedRef.current.clear();
      lastStepRef.current = 0;
    }
  }, [isOpen, itinerary]);

  useEffect(() => {
    if (!hasStarted) {
      lastStepRef.current = index;
      return;
    }
    const legs = itinerary.allLegs || [];
    const now = new Date();

    const observe = (legIndex: number, moment: 'boarding' | 'alighting') => {
      const leg: any = legs[legIndex];
      if (!leg?.mode || leg.mode === 'WALK') return;

      // Une même montée ne se constate qu'une fois, même si l'étape se
      // recalcule ou que l'usager revient en arrière d'un pas.
      const key = `${legIndex}:${moment}`;
      if (observedRef.current.has(key)) return;
      observedRef.current.add(key);
      setTravellersHelpedNow(current => current + 1);

      const fromStop = leg.from?.name;
      const toStop = leg.to?.name;
      const departure = leg.startTime ? new Date(leg.startTime) : null;
      const arrival = leg.endTime ? new Date(leg.endTime) : null;
      if (!fromStop || !departure || Number.isNaN(departure.getTime())) return;

      // À la montée, l'arrêt observé est celui de montée : on mesure le départ.
      // À la descente, on mesure l'arrivée au terme du tronçon.
      const reference = moment === 'boarding' ? departure : arrival;
      const observedStop = moment === 'boarding' ? fromStop : toStop;
      if (!reference || Number.isNaN(reference.getTime()) || !observedStop) return;

      publishObservation({
        lineId: String(leg.routeShortName || leg.route || leg.routeId || ''),
        fromStop,
        scheduledAt: departure.toISOString(),
        toStop: observedStop,
        observedAt: now.toISOString(),
        delaySeconds: (now.getTime() - reference.getTime()) / 1000,
      });
    };

    // Franchir plusieurs étapes d'un coup reste possible : on solde les
    // descentes laissées derrière avant de constater la montée en cours.
    for (let i = lastStepRef.current; i < index; i++) observe(i, 'alighting');
    observe(index, 'boarding');
    lastStepRef.current = index;
  }, [hasStarted, index, itinerary.allLegs, isOpen]);

  /**
   * Et symétriquement : ce que les autres ont constaté sur cette ligne.
   *
   * Le trajet affiché reste celui du calculateur — c'est lui qui connaît les
   * fréquences et les correspondances. On y ajoute seulement l'écart médian
   * relevé par les voyageurs de la dernière demi-heure, quand il y en a assez
   * pour y croire. En l'absence d'observation, rien ne s'affiche et l'écran est
   * exactement celui d'avant : on ne remplace pas une information manquante par
   * une information inventée.
   */
  const [lineDelay, setLineDelay] = useState<LineDelay | null>(null);
  /**
   * Le véhicule qui compte : celui qu'on va prendre, pas celui où l'on est.
   *
   * Pendant qu'on marche vers l'arrêt, l'étape en cours est la marche — et tout
   * ce qui parle d'une ligne se taisait : horaires, note, retard constaté. C'est
   * précisément le moment où l'on en a besoin, puisque c'est là qu'on décide de
   * presser le pas. On vise donc le premier tronçon en transport à partir de la
   * position actuelle, et non l'étape littérale.
   */
  const activeTransitIndex = useMemo(() => {
    for (let i = index; i < steps.length; i++) {
      if (steps[i]?.kind === 'transit') return i;
    }
    return -1;
  }, [steps, index]);

  const currentLine =
    activeTransitIndex >= 0 ? steps[activeTransitIndex]?.lineShortName : undefined;

  useEffect(() => {
    if (!isOpen || !currentLine) {
      setLineDelay(null);
      return;
    }
    let cancelled = false;
    const load = () => {
      getLineDelay(currentLine).then((value) => {
        if (!cancelled) setLineDelay(value);
      });
    };
    load();
    // Une minute : le rythme auquel les observations arrivent, pas plus vite.
    const timer = window.setInterval(load, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isOpen, currentLine]);

  /**
   * La réputation de la ligne, telle que les voyageurs l'ont écrite.
   *
   * Les enquêtes ne servaient qu'à l'exploitant : on les collectait sans jamais
   * les rendre. Les afficher ici referme la boucle — celui qui a répondu la
   * semaine dernière voit à quoi sa réponse a servi, et celui qui monte sait à
   * quoi s'attendre.
   */
  const [reputation, setReputation] = useState<LineReputation | null>(null);

  useEffect(() => {
    if (!isOpen || !currentLine) {
      setReputation(null);
      return;
    }
    let cancelled = false;
    getLineReputation(currentLine).then((value) => {
      if (!cancelled) setReputation(value);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, currentLine]);

  /**
   * Les prochains passages à l'arrêt de montée, pour le carrousel.
   *
   * Le calculateur ne rend qu'un départ : celui qu'il a retenu. Or on marche
   * rarement à la vitesse qu'il a supposée, et savoir qu'un autre suit dans six
   * minutes change la façon dont on presse le pas. On interroge donc l'arrêt
   * lui-même, et l'on ne garde que la ligne concernée.
   */
  const boardingStopId = useMemo(() => {
    const from = (itinerary.allLegs as any)?.[activeTransitIndex]?.from;
    if (!from) return undefined;
    return resolveStopId(from.name, from.lat, from.lon, stops);
  }, [itinerary.allLegs, activeTransitIndex, stops]);

  /*
   * L'identifiant que rend le calculateur est celui du *poteau* — « SEM:2109 »
   * pour le quai de La Poya en direction de L'Étoile. Or les passages
   * s'interrogent par *cluster* : « SEM:GENLAPOYA », qui regroupe les deux
   * quais. Les deux ne se déduisent pas l'un de l'autre — le cluster porte un
   * mnémonique, le poteau un numéro — d'où l'impasse de l'identifiant brut.
   *
   * On le garde tout de même en second recours : sur les réseaux voisins, où
   * les clusters se dérivent du code, il tombe juste.
   */
  const rawBoardingStopId = (itinerary.allLegs as any)?.[activeTransitIndex]?.from?.stopId as
    | string
    | undefined;

  useEffect(() => {
    if (!isOpen || !currentLine) {
      setRuns([]);
      return;
    }
    let cancelled = false;
    const wanted = currentLine.toUpperCase();

    const keep = (list: Departure[]) =>
      list
        .filter(
          (d) =>
            String(d.lineShortName || d.lineId || '')
              .replace(/^SEM[:_]/, '')
              .toUpperCase() === wanted
        )
        .sort((a, b) => Number(a.departureTime) - Number(b.departureTime))
        // Le réseau en rend une vingtaine ; on garde tout ce qui tient dans une
        // heure d'attente, ce qui suffit largement à choisir un autre passage.
        .slice(0, 8);

    // On demande d'abord au poteau que le calculateur a désigné : c'est la
    // source la plus directe, elle ne dépend d'aucun rapprochement de noms. Le
    // cluster retrouvé par le nom ne sert plus que de secours, pour les réseaux
    // dont le planificateur ne rend pas d'identifiant d'arrêt.
    const load = async () => {
      const attempts: Array<() => Promise<Departure[]>> = [];
      if (rawBoardingStopId) {
        attempts.push(() => getStopPointDepartures(rawBoardingStopId));
      }
      if (boardingStopId) {
        attempts.push(() => getDepartures(boardingStopId));
      }

      for (const attempt of attempts) {
        try {
          const list = await attempt();
          if (cancelled) return;
          const kept = keep(list);
          if (kept.length > 0) {
            setRuns(kept);
            return;
          }
        } catch {
          // On passe à la source suivante.
        }
      }
      if (!cancelled) setRuns([]);
    };

    void load();

    /*
     * Puis au rythme choisi dans les paramètres.
     *
     * Les minutes du carrousel comptent à rebours depuis l'instant de la
     * requête : sans relance, elles décrivaient un passage qui, dix minutes de
     * marche plus tard, était parti depuis longtemps. On reprend donc le même
     * réglage que les fiches d'arrêt — quinze secondes à deux minutes, au
     * choix — plutôt qu'un rythme fixe imposé ici.
     *
     * La borne basse n'est pas de la prudence : un intervalle mal transmis
     * (zéro, NaN) déclencherait une requête par image.
     */
    const period = Number.isFinite(refreshIntervalMs) ? Math.max(5000, refreshIntervalMs) : 30000;
    const timer = window.setInterval(() => void load(), period);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isOpen, currentLine, boardingStopId, rawBoardingStopId, refreshIntervalMs]);

  /**
   * La confiance qu'on peut accorder aux prochains passages, ici et maintenant.
   *
   * Le réseau publie des horaires et une affluence moyenne. Il ne dit ni si le
   * véhicule qui arrive sera plein, ni si la course annoncée existe vraiment —
   * ces passages fantômes qu'on attend dix minutes pour rien. Personne ne le
   * sait à part ceux qui sont sur le quai, et ceux-là répondent déjà aux
   * questions du bandeau : leurs réponses reviennent ici en une pastille.
   *
   * Rien ne s'affiche tant que deux personnes au moins n'ont rien dit. Une
   * pastille sur un seul avis serait une rumeur affichée comme une mesure.
   */
  const [confidence, setConfidence] = useState<CrowdConfidence | null>(null);

  useEffect(() => {
    if (!isOpen || !currentLine) {
      setConfidence(null);
      return;
    }
    let cancelled = false;
    const load = () => {
      getCrowdConfidence(rawBoardingStopId ?? boardingStopId ?? null, currentLine).then((value) => {
        if (!cancelled) setConfidence(value);
      });
    };
    load();
    // Au rythme choisi pour les passages : la pastille les commente, elle ne
    // doit pas décrire un autre instant qu'eux.
    const period = Number.isFinite(refreshIntervalMs) ? Math.max(15000, refreshIntervalMs) : 30000;
    const timer = window.setInterval(load, period);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isOpen, currentLine, rawBoardingStopId, boardingStopId, refreshIntervalMs]);

  useEffect(() => {
    if (!isOpen) {
      setScheduleRuns(new Map());
      return;
    }
    const legs = (itinerary.allLegs as any[]) ?? [];
    const controller = new AbortController();

    /*
     * On charge la fiche de chaque tronçon, pas seulement celui qu'on prend.
     *
     * Les horaires n'apparaissaient qu'une fois arrivé à la ligne concernée, si
     * bien qu'on ne pouvait pas se représenter la suite du voyage — or c'est en
     * préparant qu'on veut savoir si la correspondance passe toutes les huit
     * minutes ou toutes les demi-heures. Les fiches sont mises en cache par
     * ligne, donc trois correspondances coûtent trois requêtes une fois par
     * heure, pas à chaque rendu.
     */
    void (async () => {
      const collected = new Map<number, number[]>();

      for (let i = 0; i < legs.length; i++) {
        const leg = legs[i];
        if (!leg?.mode || leg.mode === 'WALK') continue;
        const routeId = leg.routeId;
        const stopId = leg.from?.stopId;
        if (!routeId || !stopId) continue;

        const timetable = await getTimetable(String(routeId), { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (!timetable) continue;

        const now = new Date();
        const midnight = new Date(now).setHours(0, 0, 0, 0);
        const wantedName = normalizeStopName(leg.from?.name);
        const minutes: number[] = [];

        for (const direction of timetable.directions) {
          // Par l'identifiant de poteau d'abord, qui est le même des deux côtés.
          // Par le nom ensuite : sur quelques lignes la fiche publie le poteau
          // jumeau, et un carrousel approximatif vaut mieux qu'un carrousel vide.
          const stop =
            direction.stops.find((entry) => entry.id === stopId) ??
            (wantedName
              ? direction.stops.find((entry) => normalizeStopName(entry.name) === wantedName)
              : undefined);
          if (!stop) continue;
          for (const seconds of stop.times) {
            // Une course qui ne dessert pas cet arrêt n'a pas d'heure à donner.
            if (seconds === null) continue;
            minutes.push(Math.round((midnight + seconds * 1000 - now.getTime()) / 60000));
          }
        }

        if (minutes.length > 0) collected.set(i, minutes.sort((a, b) => a - b));
      }

      if (!controller.signal.aborted) setScheduleRuns(collected);
    })();

    return () => controller.abort();
  }, [isOpen, itinerary.allLegs]);

  /**
   * Ce que le carrousel affiche vraiment.
   *
   * Trois cartes, toujours. Quand le réseau répond, ce sont ses passages, temps
   * réel compris ; quand il n'a rien pour cet arrêt, il reste l'horaire retenu
   * par le calculateur, marqué « planifié » ; et quand il ne reste rien du tout,
   * la carte affiche un tiret.
   *
   * Faire disparaître le carrousel faute de données déplaçait tout le bloc d'un
   * coup, et l'on ne savait pas si l'information manquait ou si elle n'existait
   * pas. Un tiret est une réponse ; une absence n'en est pas une.
   *
   * Ce hook doit rester au-dessus du premier `return` : un `useMemo` franchi
   * conditionnellement fait planter React au rendu suivant.
   */
  type RunCard = { minutes: number | null; scheduled: boolean; level: 0 | 1 | 2 | 3 };

  /**
   * L'affluence attendue pour un passage donné.
   *
   * Elle dépend de l'heure : le même tram est vide à 10 h et plein à 8 h 15. On
   * interroge donc le profil à l'heure du passage, pas à l'heure qu'il est —
   * c'est ce qui rend le carrousel utile, puisqu'en choisissant un départ plus
   * tard on voit la charge changer.
   */
  const levelForRun = (legIndex: number, minutesFromNow: number | null): 0 | 1 | 2 | 3 => {
    if (minutesFromNow === null) return 0;
    void occupancyReady;
    const leg: any = (itinerary.allLegs as any)?.[legIndex];
    const at = new Date(Date.now() + minutesFromNow * 60000);
    return occupancyLevel(
      getOccupancyAt(leg?.from?.stopId, leg?.routeId ?? leg?.route, at, leg?.trip?.directionId)
    );
  };

  const surveyJourney = useMemo<TripSurveyLeg[]>(
    () =>
      ((itinerary.allLegs as any[]) ?? [])
        .filter((leg) => leg?.mode && leg.mode !== 'WALK')
        .map((leg) => ({
          line: String(leg.routeShortName || leg.route || leg.routeId || '').replace(/^SEM[:_]/, ''),
          from: String(leg.from?.name ?? ''),
          to: String(leg.to?.name ?? ''),
          departure: leg.startTime ? new Date(leg.startTime).toISOString() : undefined,
          arrival: leg.endTime ? new Date(leg.endTime).toISOString() : undefined,
        }))
        .filter((leg) => leg.line && leg.from && leg.to),
    [itinerary.allLegs]
  );

  /**
   * Arriver déclenche l'écran de fin, sans que personne n'appuie.
   *
   * La dernière étape teinte déjà toute la carte en vert : c'est le signal que le
   * trajet est fini, et attendre que l'usager ferme le guidage pour le lui dire
   * laissait le moment passer. L'écran monte donc par-dessus le vert, un peu
   * après lui — le lavis met une demi-seconde à basculer, et un écran qui
   * monterait pendant ce fondu masquerait ce qu'il vient couronner.
   */
  useEffect(() => {
    if (!isOpen || !hasStarted || arrivedRef.current) return;
    if (steps.length === 0 || index < steps.length - 1) return;
    arrivedRef.current = true;
    const timer = window.setTimeout(() => {
      try {
        localStorage.removeItem(helpedStorageKey);
      } catch {
        // Le bilan conserve la valeur en mémoire si le stockage est indisponible.
      }
      onArrived?.({
        observations: observedRef.current.size,
        answers: answerCount,
        travellersHelped: travellersHelpedNow,
      });
    }, 650);
    return () => window.clearTimeout(timer);
  }, [isOpen, hasStarted, index, steps.length, answerCount, travellersHelpedNow, helpedStorageKey, onArrived]);

  /**
   * Les avis de trajet, à chaque étape franchie.
   *
   * L'étape courante est déjà déduite de la position et de l'allure : il suffit
   * de dire à voix haute ce que l'écran affiche déjà, au moment où il change. On
   * ne notifie pas les arrêts intermédiaires — un téléphone qui sonne à chaque
   * quai finit en mode silencieux, et l'on perd aussi les avis qui comptaient.
   */
  useEffect(() => {
    if (!isOpen || !hasStarted) return;
    const key = `${index}`;
    if (notifiedRef.current.has(key)) return;
    notifiedRef.current.add(key);

    const current = steps[index];
    if (!current) return;
    const next = steps[index + 1];

    if (current.kind === 'walk') {
      // Marcher vers un quai, c'est partir ; marcher vers l'arrivée, ce n'est
      // plus une consigne mais la fin du trajet, que l'étape suivante annonce.
      if (index === 0) void notifyTripMoment({ kind: 'leave' }, language);
      else if (next?.kind === 'transit' && next.lineShortName) {
        void notifyTripMoment(
          { kind: 'transfer', line: next.lineShortName, headsign: next.headsign ?? null },
          language
        );
      }
      return;
    }

    if (current.kind === 'transit' && current.lineShortName) {
      void notifyTripMoment(
        { kind: 'boarding', line: current.lineShortName, stop: current.fromName ?? null },
        language
      );
      return;
    }

    if (current.kind === 'arrival') {
      void notifyTripMoment({ kind: 'arrived', place: itinerary.arrName ?? null }, language);
    }
  }, [isOpen, hasStarted, index, steps, language, itinerary.arrName]);

  if (!isOpen || steps.length === 0) return null;

  const delayMinutes = lineDelay ? Math.round(lineDelay.seconds / 60) : 0;
  const showDelay = Boolean(lineDelay) && delayMinutes !== 0;

  /**
   * L'arrêt où l'on attend — et seulement quand on y attend vraiment.
   *
   * Les questions de quai partaient dès que l'étape était une marche vers un
   * arrêt : on les recevait donc en marchant, huit cents mètres avant d'y être,
   * alors qu'elles portent sur un abri et un afficheur qu'on n'a pas encore
   * sous les yeux. On ne peut pas y répondre, et on ne peut même pas les lire.
   *
   * Il faut donc deux conditions, pas une : être arrivé — quelques mètres du
   * poteau, la distance en deçà de laquelle le GPS ne distingue plus rien — et
   * s'être arrêté de marcher. La seconde compte autant que la première : passer
   * devant un arrêt n'est pas y attendre.
   *
   * Une fois posé, on reste posé. Le GPS oscille de quelques mètres à l'arrêt,
   * et un questionnaire qui apparaît et disparaît au gré du bruit serait pire
   * que celui qui arrivait trop tôt.
   */
  const waitingStop = (() => {
    if (step?.kind !== 'walk') return null;
    const next = steps[index + 1];
    if (next?.kind !== 'transit') return null;
    const leg: any = (itinerary.allLegs as any)?.[index + 1];
    const id = leg?.from?.stopId;
    if (!id) return null;
    const stop = {
      id: String(id),
      name: String(leg?.from?.name ?? ''),
      // La ligne qu'on attend : « le passage est-il passé ? » ne se range nulle
      // part sans elle.
      lineId: next.lineShortName ?? null,
    };

    if (atStopRef.current === stop.id) return stop;

    const lat = Number(leg?.from?.lat);
    const lon = Number(leg?.from?.lon);
    // Sans position ni coordonnées, il n'y a rien à mesurer : on s'en remet au
    // comportement d'avant plutôt que de museler les questions pour tout le
    // monde à cause d'un GPS coupé.
    if (!currentLocation || !Number.isFinite(lat) || !Number.isFinite(lon)) return stop;

    const metres = coordinateDistance([currentLocation.lon, currentLocation.lat], [lon, lat]);
    if (metres > STOP_ARRIVAL_M || speedMps > STOP_STILL_MPS) return null;

    atStopRef.current = stop.id;
    return stop;
  })();

  const handleClose = () => {
    // L'arrivée se solde d'elle-même dès que la dernière étape est atteinte.
    // Fermer avant, c'est renoncer ; fermer après, c'est refermer un écran de fin
    // déjà ouvert. Dans les deux cas il n'y a rien à créditer ici.
    onClose();
  };

  const compactSubtitle =
    step?.kind === 'transit'
      ? step.headsign || step.detail
      : steps[index + 1]?.instruction || steps[index + 1]?.detail || (isFr ? 'Prochaines actions du voyage' : 'Next trip actions');
  const compactActionLabel =
    steps[index + 1]?.kind === 'walk'
      ? isFr
        ? 'Marche'
        : 'Walk'
      : steps[index + 1]?.kind === 'arrival'
      ? isFr
        ? 'Arrivée'
        : 'Arrival'
      : steps[index + 1]?.lineShortName || steps[index + 1]?.instruction || '';

  // La minimisation a été retirée : le guidage reste toujours plein écran.
  const compactTitle = '';
  const onRestore = () => undefined;
  const showCompact = false;

  /**
   * Les passages d'un tronçon, sur une fenêtre donnée.
   *
   * `extraMinutes` allonge la fin de la fenêtre : choisir un départ plus tard
   * repousse l'heure d'arrivée, et il faut alors des cartes au-delà de celles
   * qu'on avait calculées. La fonction reste pure pour qu'on puisse l'appeler
   * deux fois — une pour trouver le défaut, une pour la fenêtre définitive —
   * sans risquer une récursion.
   */
  /**
   * Dans combien de minutes on sera sur le quai de ce tronçon.
   *
   * C'est la question qui commande tout le carrousel : les passages avant cette
   * minute-là sont hors d'atteinte, celui qui la suit est celui qu'on prendra.
   *
   * Trois sources, de la plus sûre à la plus approximative. L'heure de départ du
   * tronçon d'abord. À défaut, la fin du tronçon précédent — on est sur le quai
   * dès qu'on descend. À défaut encore, on additionne les durées depuis
   * maintenant.
   *
   * Ce dernier recours n'est pas de la coquetterie : quand `startTime` manquait,
   * la fenêtre repartait de zéro et l'on proposait la correspondance « dans deux
   * minutes » à quelqu'un qui avait vingt minutes de bus devant lui.
   */
  const boardingInMinutes = (legIndex: number): number => {
    const legs = (itinerary.allLegs as any[]) ?? [];
    const leg = legs[legIndex];

    const own = leg?.startTime ? new Date(leg.startTime).getTime() : NaN;
    if (Number.isFinite(own)) return Math.round((own - Date.now()) / 60000);

    const previousEnd = legs[legIndex - 1]?.endTime
      ? new Date(legs[legIndex - 1].endTime).getTime()
      : NaN;
    if (Number.isFinite(previousEnd)) return Math.round((previousEnd - Date.now()) / 60000);

    let cumulated = 0;
    for (let i = index; i < legIndex && i < steps.length; i++) {
      cumulated += steps[i]?.durationMin ?? 0;
    }
    return cumulated;
  };

  const cardsFor = (legIndex: number, extraMinutes: number): RunCard[] => {
    const leg: any = (itinerary.allLegs as any)?.[legIndex];
    const endAt = leg?.endTime ? new Date(leg.endTime).getTime() : NaN;
    const plannedMinutes = boardingInMinutes(legIndex);

    /*
     * Le temps réel d'abord : le réseau n'en rend que trois, mais ce sont les
     * seuls qui savent qu'un tram a du retard.
     */
    const liveMinutes: number[] = [];
    if (legIndex === activeTransitIndex) {
      for (const run of runs) {
        // `departureTime` compte les minutes qui restent, pas un horodatage.
        liveMinutes.push(Math.max(0, Math.round(Number(run.departureTime) || 0)));
      }
    }

    /*
     * Puis la fiche horaires, de maintenant à la fin du tronçon. On ne remonte
     * pas avant l'instant présent — un passage déjà parti ne se rattrape pas —
     * et l'on s'arrête à l'heure où l'on descendra, ce qui donne assez de
     * cartes pour changer d'avis sans en donner à l'infini.
     */
    const cards: RunCard[] = liveMinutes.map((minutes) => ({
      minutes,
      scheduled: false,
      level: levelForRun(legIndex, minutes),
    }));

    const schedule = scheduleRuns.get(legIndex) ?? [];
    if (schedule.length > 0) {
      /*
       * Pour le tronçon qu'on prend : de maintenant à l'heure de descente, avec
       * au moins une heure de battement. S'arrêter à l'arrivée paraissait logique
       * et ne donnait rien — quinze minutes de tram sur une ligne aux huit
       * minutes, c'est deux cartes, donc aucun choix.
       *
       * Pour les correspondances à venir : autour de leur propre horaire, pas
       * autour de maintenant. Un changement prévu dans quarante minutes n'a que
       * faire des passages de cette minute-ci ; ce qu'on veut savoir, c'est la
       * fréquence qu'on trouvera en arrivant.
       */
      const isActive = legIndex === activeTransitIndex;
      /*
       * On remonte avant l'heure d'arrivée sur le quai.
       *
       * Ces passages-là sont hors d'atteinte au rythme prévu, et c'est justement
       * ce qui les rend utiles : voir qu'un tram part six minutes avant celui
       * qu'on vise, c'est savoir qu'on peut le prendre en marchant plus vite. Les
       * cacher rendait le carrousel muet sur la seule décision qui reste à
       * l'usager.
       *
       * Une demi-heure en arrière suffit : au-delà, c'est un autre trajet.
       */
      const from = isActive ? 0 : Math.max(0, plannedMinutes - 30);
      const until = isActive
        ? Math.max(60, Math.round((endAt - Date.now()) / 60000)) + extraMinutes
        : plannedMinutes + 50;

      for (const minutes of schedule) {
        if (minutes < from || minutes > until) continue;
        // Deux annonces à une minute l'une de l'autre sont le même véhicule :
        // on garde celle du temps réel, qui sait ce que la fiche ignore.
        if (cards.some((card) => card.minutes !== null && Math.abs(card.minutes - minutes) <= 1)) {
          continue;
        }
        cards.push({ minutes, scheduled: true, level: levelForRun(legIndex, minutes) });
      }
    }

    if (cards.length === 0) {
      const minutes = Math.max(0, plannedMinutes);
      cards.push({ minutes, scheduled: true, level: levelForRun(legIndex, minutes) });
    }

    if (cards.length === 0) return [{ minutes: null, scheduled: false, level: 0 }];
    return cards.sort((a, b) => (a.minutes ?? 0) - (b.minutes ?? 0)).slice(0, 14);
  };

  /**
   * Le passage retenu par défaut : celui de l'heure où l'on arrivera au quai.
   *
   * Le premier de la liste serait le plus proche de maintenant, ce qui n'a aucun
   * sens quand on a dix minutes de marche devant soi.
   */
  const closestTo = (cards: RunCard[], target: number): number => {
    let best = 0;
    let gap = Infinity;
    cards.forEach((card, i) => {
      if (card.minutes === null) return;
      const distance = Math.abs(card.minutes - target);
      if (distance < gap) {
        gap = distance;
        best = i;
      }
    });
    return best;
  };

  const plannedBoardingMinutes =
    activeTransitIndex >= 0 ? boardingInMinutes(activeTransitIndex) : 0;

  const baseCards = activeTransitIndex >= 0 ? cardsFor(activeTransitIndex, 0) : [];
  const defaultRunIndex = closestTo(baseCards, plannedBoardingMinutes);
  const activeRun = pickedRuns.get(activeTransitIndex) ?? defaultRunIndex;

  /*
   * Le décalage du passage retenu allonge la fenêtre : plus on part tard, plus
   * on descend tard, et plus il y a de départs à montrer derrière.
   */
  const pickedShiftMinutes = (() => {
    const chosen = baseCards[activeRun]?.minutes;
    const reference = baseCards[defaultRunIndex]?.minutes;
    if (chosen == null || reference == null) return 0;
    return chosen - reference;
  })();

  const activeCards =
    pickedShiftMinutes > 0 ? cardsFor(activeTransitIndex, pickedShiftMinutes) : baseCards;

  const runsForLeg = (legIndex: number): RunCard[] =>
    legIndex === activeTransitIndex ? activeCards : cardsFor(legIndex, 0);

  /**
   * La carte mise en avant, tronçon par tronçon.
   *
   * Elle se lisait de la même variable pour tous les blocs : la troisième carte
   * d'une correspondance paraissait retenue parce que c'était le rang choisi sur
   * le tronçon en cours, ce qui ne voulait rien dire. Chaque tronçon désigne
   * désormais l'horaire auquel on devrait y arriver — et voir cet horaire-là
   * surligné est ce qui montre qu'on peut prendre celui d'avant si l'on est en
   * avance.
   */
  const selectedIndexFor = (legIndex: number, cards: RunCard[]): number => {
    const chosen = pickedRuns.get(legIndex);
    if (chosen != null) return Math.min(chosen, Math.max(0, cards.length - 1));
    return closestTo(cards, boardingInMinutes(legIndex));
  };

  const choose = (legIndex: number, run: number) => {
    setPickedRuns((previous) => {
      const next = new Map(previous);
      next.set(legIndex, run);
      return next;
    });
  };

  /** L'heure d'un point du trajet, décalée du passage retenu s'il y a lieu. */
  /**
   * Le décalage propre à un tronçon, en millisecondes.
   *
   * Chaque tronçon se décale de l'écart entre le passage retenu et celui qu'on
   * devait prendre. Le décalage ne se propage pas aux tronçons suivants : recaler
   * la suite du voyage demanderait de recalculer l'itinéraire, et personne ne
   * peut affirmer qu'un tram pris huit minutes plus tôt donne la même
   * correspondance. Chaque bloc dit donc l'heure de *son* passage, ce qui est
   * exact, plutôt qu'une heure d'arrivée finale qui serait devinée.
   */
  const shiftFor = (legIndex: number): number => {
    const cards = runsForLeg(legIndex);
    const chosen = cards[selectedIndexFor(legIndex, cards)]?.minutes;
    const reference = cards[closestTo(cards, boardingInMinutes(legIndex))]?.minutes;
    if (chosen == null || reference == null) return 0;
    return (chosen - reference) * 60000;
  };

  const shiftedClock = (value: unknown, legIndex: number): string => {
    const base = new Date(value as any).getTime();
    if (!Number.isFinite(base)) return '';
    // Les tronçons déjà parcourus ont eu lieu à l'heure qu'ils ont eue.
    const shift = legIndex >= index ? shiftFor(legIndex) : 0;
    return formatClock(new Date(base + shift).toISOString());
  };

  const chipClass =
    'flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-black/20 px-2.5 py-1.5 text-xs font-bold';

  const lineChips = (isCurrent: boolean) => (
    <div className="-mx-3 mb-2.5 flex items-center gap-2 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {/* Le sans-contact vaut sur tout le réseau : on monte et l'on paie avec sa
          carte bancaire, sans titre acheté d'avance. Beaucoup l'ignorent, et
          c'est précisément à l'approche du quai que l'information sert — donc
          sur chaque véhicule du trajet, pas seulement celui qu'on prend. */}
      <span className={chipClass}>
        <CreditCardIcon className="h-3.5 w-3.5 opacity-80" />
        {isFr ? 'Sans contact' : 'Contactless'}
      </span>
      <button
        type="button"
        onClick={() => openExternal(PASS_SHOP_URL)}
        className={`${chipClass} active:bg-black/30`}
      >
        <TicketIcon className="h-3.5 w-3.5 opacity-80" />
        {isFr ? 'Acheter un ticket' : 'Buy a ticket'}
      </button>
      {/* La note ne s'affiche que sur le véhicule en cours : c'est la seule
          ligne dont on soit allé chercher les avis. L'inventer pour les autres
          coûterait une requête par correspondance, pour une information qu'on
          ne regarde pas encore. */}
      {isCurrent && reputation?.rating != null && (
        <span
          className={chipClass}
          title={
            isFr
              ? `Moyenne de ${reputation.sampleSize} avis de voyageurs`
              : `Average of ${reputation.sampleSize} traveller reviews`
          }
        >
          <StarIcon className="h-3.5 w-3.5 opacity-90" />
          <span className="tabular">{reputation.rating.toFixed(1)}</span>
        </span>
      )}
      {isCurrent && reputation?.onTimeRate != null && (
        <span
          className={chipClass}
          title={
            isFr
              ? `Trajets jugés à l'heure sur ${reputation.sampleSize} avis`
              : `Trips judged on time out of ${reputation.sampleSize} reviews`
          }
        >
          <ClockIcon className="h-3.5 w-3.5 opacity-80" />
          <span className="tabular">{Math.round(reputation.onTimeRate)} %</span>
        </span>
      )}
    </div>
  );


  const fullPath: Array<[number, number]> = itinerary.routePath?.length
    ? itinerary.routePath
    : steps.flatMap((item) => item.path);
  const stepGeoJSON = {
    type: 'FeatureCollection' as const,
    features: [{ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: step.path } }],
  };
  // Pendant l'approche à pied, on garde aussi la ligne à prendre visible : le
  // chemin piéton répond à « comment y aller », le tracé transport à « où va le bus ».
  const futureRouteGeoJSON = {
    type: 'FeatureCollection' as const,
    features: steps.slice(index + 1)
      .filter(candidate => candidate.path.length > 1)
      .map(candidate => ({
        type: 'Feature' as const,
        properties: { color: stepColor(candidate) },
        geometry: { type: 'LineString' as const, coordinates: candidate.path },
      })),
  };
  const futureStopsGeoJSON = {
    type: 'FeatureCollection' as const,
    features: (itinerary.allLegs ?? []).slice(index + 1).flatMap((leg: any, offset: number) => {
      if (!leg?.mode || leg.mode === 'WALK') return [];
      const stepForLeg = steps[index + 1 + offset];
      const color = stepForLeg ? stepColor(stepForLeg) : '#64748b';
      return [leg.from, ...(leg.intermediateStops ?? []), leg.to]
        .flatMap((stop: any) => {
          const lat = Number(stop?.lat ?? stop?.latitude);
          const lon = Number(stop?.lon ?? stop?.lng ?? stop?.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
          return [{
            type: 'Feature' as const,
            properties: { color },
            geometry: { type: 'Point' as const, coordinates: [lon, lat] as [number, number] },
          }];
        });
    }),
  };


  const arriveLabel = itinerary.arr;
  /** L'heure de départ, prise sur le premier tronçon plutôt que sur l'horloge. */
  const departureLabel = formatClock((itinerary.allLegs as any)?.[0]?.startTime);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[10001] overflow-hidden bg-[#0a1420]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
        style={{ fontFamily: "Inter, 'Helvetica Neue', sans-serif" }}
      >
        {/* Carte */}
        <div className="absolute inset-0">
          <MapLibreMap
            ref={mapRef}
            initialViewState={{ longitude: fullPath[0]?.[0] ?? 5.74892, latitude: fullPath[0]?.[1] ?? 45.18501, zoom: 15 }}
            mapStyle={theme === 'dark' ? DARK_MAP_STYLE_URL : LIGHT_MAP_STYLE_URL}
            style={{ width: '100%', height: '100%' }}
            attributionControl={false}
            onDragStart={() => setIsFollowing(false)}
            onRotateStart={() => setIsFollowing(false)}
            onZoomStart={(event: { originalEvent?: unknown }) => {
              // Seul un zoom déclenché à la main coupe le suivi : ceux que la
              // caméra s'inflige elle-même ne comptent pas.
              if (event?.originalEvent) setIsFollowing(false);
            }}
          >
            {futureRouteGeoJSON.features.length > 0 && (
              <Source id="nav-future-routes" type="geojson" data={futureRouteGeoJSON}>
                <Layer
                  id="nav-future-routes-casing"
                  type="line"
                  paint={{ 'line-color': ['get', 'color'], 'line-width': 13, 'line-opacity': 0.18 }}
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                />
                <Layer
                  id="nav-future-routes-layer"
                  type="line"
                  paint={{ 'line-color': ['get', 'color'], 'line-width': 7, 'line-opacity': 0.45 }}
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                />
              </Source>
            )}

            {futureStopsGeoJSON.features.length > 0 && (
              <Source id="nav-future-stops" type="geojson" data={futureStopsGeoJSON}>
                <Layer
                  id="nav-future-stops-layer"
                  type="circle"
                  paint={{
                    'circle-radius': 4,
                    'circle-color': ['get', 'color'],
                    'circle-opacity': 0.7,
                    'circle-stroke-color': '#ffffff',
                    'circle-stroke-width': 1.5,
                    'circle-stroke-opacity': 0.75,
                  }}
                />
              </Source>
            )}

            {step.path.length > 0 && (
              <Source id="nav-step-route" type="geojson" data={stepGeoJSON}>
                <Layer
                  id="nav-step-route-layer"
                  type="line"
                  paint={{
                    'line-color': stepColor(step),
                    'line-width': step.kind === 'walk' ? 7 : 11,
                    'line-opacity': 0.98,
                    'line-dasharray': step.kind === 'walk' ? [0.1, 1.4] : [1, 0],
                  }}
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                />
              </Source>
            )}

            {step.path.length > 1 && (
              <>
                <Marker longitude={step.path[0][0]} latitude={step.path[0][1]}>
                  <div className="h-5 w-5 rounded-full border-[4px] border-white shadow-[0_4px_16px_rgba(0,0,0,0.35)]" style={{ backgroundColor: stepColor(step) }} />
                </Marker>
                <Marker longitude={step.path[step.path.length - 1][0]} latitude={step.path[step.path.length - 1][1]}>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                    className="flex h-11 w-11 items-center justify-center rounded-full border-[4px] border-white shadow-[0_8px_22px_rgba(0,0,0,0.38)]"
                    style={{ backgroundColor: stepColor(step) }}
                  >
                    <StepIcon step={step} className="h-5 w-5 text-white" />
                  </motion.div>
                </Marker>
              </>
            )}

            {smoothedLocation && (
              <Marker longitude={smoothedLocation[0]} latitude={smoothedLocation[1]}>
                <AnimatePresence initial={false} mode="wait">
                  {step.kind === 'transit' ? (
                    <motion.div
                      key="vehicle-sprite"
                      initial={{ opacity: 0, scale: 0.72 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.72 }}
                      transition={{ duration: 0.24, ease: 'easeOut' }}
                      className="flex h-11 w-11 items-center justify-center rounded-full border-[4px] border-white shadow-[0_6px_18px_rgba(0,0,0,0.4)]"
                      style={{ backgroundColor: stepColor(step) }}
                    >
                      <TransportModeIcon mode={step.mode ?? 'BUS'} className="h-6 w-6 text-white" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="walking-sprite"
                      initial={{ opacity: 0, scale: 0.72 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.72 }}
                      transition={{ duration: 0.24, ease: 'easeOut' }}
                      className="relative flex items-center justify-center"
                    >
                      <span className="absolute h-8 w-8 animate-ping rounded-full bg-blue-500/40" />
                      <span className="relative h-4 w-4 rounded-full border-2 border-white bg-blue-500 shadow-lg" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </Marker>
            )}
          </MapLibreMap>
        </div>

        {/* Le lavis de ligne.
            C'est le geste qui manquait : teinter *toute* la carte de la couleur
            de la ligne, et pas seulement y poser un tracé coloré. On sait quel
            véhicule on suit avant même d'avoir lu quoi que ce soit — et le jour
            où l'on change de correspondance, l'écran entier bascule de teinte.
            Le fondu d'une demi-seconde rend ce basculement lisible plutôt que
            brutal. */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-transparent" />

        <div
          className="pointer-events-none absolute left-1/2 top-[max(1rem,env(safe-area-inset-top))] z-0 flex -translate-x-1/2 flex-col items-center"
          style={{ fontFamily: "Inter, 'Helvetica Neue', sans-serif" }}
        >
          <motion.div
            className="w-fit rounded-2xl px-4 py-2.5 text-center shadow-[0_10px_28px_rgba(0,0,0,0.22)]"
            style={{ backgroundColor: skin.background, color: skin.ink }}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
          >
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: skin.muted }}>
              {isFr ? "Heure d'arrivée" : 'Arrival time'}
            </p>
            <p className="text-[28px] font-black leading-none tabular-nums text-white">
              {arriveLabel}
            </p>
          </motion.div>

          <AnimatePresence initial={false}>
          {travellersHelpedNow > 0 && (
          <motion.button
            type="button"
            onClick={() => setIsHelpedSheetOpen(true)}
            className="pointer-events-auto -mt-1 flex items-center gap-2 rounded-b-xl px-2.5 pb-1.5 pt-2 shadow-[0_8px_20px_rgba(0,0,0,0.18)]"
            aria-label={isFr ? 'Voir les utilisateurs aidés' : 'View helped travellers'}
            style={{ backgroundColor: skin.background, color: skin.ink }}
            layout
            initial={{ opacity: 0, height: 0, y: -8 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
          >
            <div className="flex h-6 items-center pl-1">
              <AnimatePresence initial={false}>
              {AVATARS.slice(0, Math.min(3, travellersHelpedNow)).map((avatar, index) => (
                <motion.span
                  key={avatar}
                  className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-white text-[11px]"
                  style={{ marginLeft: index === 0 ? 0 : -8, zIndex: 3 - index }}
                  aria-hidden="true"
                  initial={{ opacity: 0, scale: 0.65 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.65 }}
                  transition={{ duration: 0.28, ease: 'easeOut' }}
                >
                  {avatar}
                </motion.span>
              ))}
              </AnimatePresence>
            </div>
            <span className="text-sm font-extrabold leading-none" style={{ color: skin.muted }}>
              <AnimatedCount value={travellersHelpedNow} />
            </span>
          </motion.button>
          )}
          </AnimatePresence>
        </div>

        {/* Le numéro de ligne en très grand, à même la carte.
            C'est la première chose qu'on cherche des yeux en levant le téléphone
            — pas une instruction, juste : quel véhicule. Il est posé sur la
            carte sans cartouche, comme une girouette, et l'emplacement en haut
            à gauche reste libre pour le rang GreLiens le jour où il existera. */}

        {/* Les commandes, empilées en colonne de pastilles rondes à droite :
            fermer, valider son titre, recentrer. Une colonne se balaye du pouce
            sans quitter la carte des yeux, là où une barre horizontale oblige à
            viser. */}
        {/* La croix reste au-dessus de tout : quitter doit rester possible
            quelle que soit la hauteur de la sheet. Les deux autres passent
            dessous et se laissent recouvrir — on ne cherche pas ses réglages
            pendant qu'on lit son trajet. */}
        <div className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-30 flex flex-col gap-2.5">
          <button
            onClick={handleClose}
            className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-red-500 text-white shadow-[0_4px_16px_rgba(0,0,0,0.3)] active:scale-95"
            style={{ color: '#ffffff' }}
            aria-label={isFr ? 'Quitter la navigation' : 'Exit navigation'}
          >
            <XMarkIcon className="h-6 w-6" />
          </button>

        </div>

        {/* Les commandes secondaires, sous le calque de la sheet : elle les
            recouvre quand on la remonte. C'est voulu — on ne cherche pas ses
            réglages pendant qu'on lit son trajet, et les laisser flotter
            au-dessus donnait trois pastilles posées sur le texte. */}
        <div className="absolute right-4 top-[calc(max(1rem,env(safe-area-inset-top))+3.5rem)] z-0 flex flex-col gap-2.5">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-800 shadow-[0_4px_16px_rgba(0,0,0,0.3)] active:scale-95"
            aria-label={isFr ? 'Réglages du guidage' : 'Navigation settings'}
          >
            <Cog6ToothIcon className="h-5 w-5" />
          </button>

          {/* Acheter son titre : le moment où l'on en a besoin est celui où l'on
              marche vers l'arrêt. Sans transport en commun, rien à valider. */}
          {itinerary.lineKeys?.length > 0 && (
            <button
              onClick={() => openExternal(PASS_SHOP_URL)}
              className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-800 shadow-[0_4px_16px_rgba(0,0,0,0.3)] active:scale-95"
              aria-label={isFr ? 'Mon titre' : 'My ticket'}
            >
              <TicketIcon className="h-5 w-5" />
            </button>
          )}

          <AnimatePresence initial={false}>
            {hasStarted && !isFollowing && currentLocation && (
            <motion.button
              key="recenter-control"
              initial={{ opacity: 0, scale: 0.7, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.7, y: -8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              onClick={() => {
                lastCameraLocationRef.current = null;
                animateRecenterRef.current = true;
                setIsFollowing(true);
              }}
              className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-800 shadow-[0_4px_16px_rgba(0,0,0,0.3)] active:scale-95"
              aria-label={isFr ? 'Recentrer' : 'Recenter'}
            >
              <PaperAirplaneIcon className="h-5 w-5 -rotate-45" />
            </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* ─── La sheet de trajet ─────────────────────────────────────────
            Plus d'étapes, plus de « suivant ». Le trajet entier tient là, du
            premier pas au dernier, et l'on y descend comme on descendrait la
            liste de ce qu'on va faire : points gris pour la marche, bloc plein
            de la couleur de la ligne pour chaque véhicule, et le motif se
            répète autant de fois qu'il y a de correspondances.

            Avancer d'un pas ne demandait rien de plus que de regarder — mais il
            fallait appuyer, et donc sortir le téléphone à chaque changement.
            Tout voir d'un coup coûte un défilement et rend l'appui inutile.

            La sheet n'a pas de bord : un dégradé la raccorde à la carte, qui
            continue de glisser derrière. */}
        <motion.div
          style={{ y: sheetY, height: sheetHeight }}
          drag="y"
          dragConstraints={{ top: sheetBounds.top, bottom: sheetBounds.bottom }}
          dragElastic={0.02}
          dragTransition={{ power: 0.22, timeConstant: 260 }}
          className="absolute inset-x-0 top-[15%] flex touch-none flex-col"
        >
          <div
            className="pointer-events-none h-24 flex-shrink-0"
            style={{ background: `linear-gradient(to bottom, transparent, ${skin.background})` }}
          />

          {/* ── Le widget d'horaires ─────────────────────────────────────
              Il est posé à cheval sur le dégradé, moitié sur la carte moitié
              sur la sheet. Le dégradé seul ne servait à rien : c'était un vide
              qu'on regardait. Lui donner à porter les deux heures du trajet le
              justifie, et l'on obtient au passage l'information la plus
              demandée — quand je pars, quand j'arrive — sans avoir à déplier
              quoi que ce soit. */}
          <div className="absolute inset-x-3 top-3 z-20">
            <div
              className="rounded-2xl border px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.25)]"
              style={{ borderColor: skin.rule, backgroundColor: skin.background }}
            >
              <p
                className="text-[22px] font-black leading-none tracking-tight"
                style={{ color: skin.ink }}
              >
                {departureLabel
                  ? isFr
                    ? `Quitter à ${departureLabel}`
                    : `Leave at ${departureLabel}`
                  : isFr
                  ? 'Partez maintenant'
                  : 'Leave now'}
              </p>
              <div className="mt-1.5 flex items-baseline justify-between gap-3">
                <p className="text-sm" style={{ color: skin.muted }}>
                  {isFr ? 'Arrivée à' : 'Arriving at'}{' '}
                  <span className="tabular font-semibold" style={{ color: skin.ink }}>
                    {arriveLabel}
                  </span>
                </p>
                <p className="tabular text-sm" style={{ color: skin.muted }}>
                  {itinerary.dur}
                </p>
              </div>

              {/* ── La jauge ──────────────────────────────────────────────
                  Le trajet vu de côté, en une bande : un segment par tronçon, à
                  sa couleur, les petits points gris pour la marche entre deux.
                  Ce qui reste à faire est en retrait — on voit où l'on en est
                  sans compter les blocs. */}
              <div className="mt-2.5 flex items-center gap-1">
              {steps.map((item, i) => {
                const done = i <= index;
                if (item.kind === 'walk') {
                  return (
                    <span key={i} className="flex flex-shrink-0 items-center gap-0.5">
                      {[0, 1].map((d) => (
                        <span
                          key={d}
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: skin.muted, opacity: 1 }}
                        />
                      ))}
                    </span>
                  );
                }
                if (item.kind === 'arrival') {
                  return (
                    <span
                      key={i}
                      className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: skin.muted, opacity: done ? 1 : 0.4 }}
                    />
                  );
                }
                return (
                  <span
                    key={i}
                    className="h-2 flex-1 rounded-full"
                    style={{ backgroundColor: stepColor(item), opacity: done ? 1 : 0.28 }}
                  />
                );
              })}
              </div>

              <AnimatePresence initial={false}>
                {step?.kind === 'transit' && step.lineShortName ? (
                  <TripQuestions
                    key={`vehicle-${step.lineShortName}`}
                    subject="vehicle"
                    targetId={step.lineShortName}
                    boardingStop={step.fromName ?? null}
                    boardingTime={
                      (itinerary.allLegs as any)?.[index]?.startTime
                        ? new Date((itinerary.allLegs as any)[index].startTime).toISOString()
                        : null
                    }
                    journey={surveyJourney}
                    language={language}
                    onAnswered={() => {
                      setAnswerCount((n) => n + 1);
                      setTravellersHelpedNow((current) => current + 1);
                    }}
                  />
                ) : (
                  waitingStop && (
                    <TripQuestions
                      key={`stop-${waitingStop.id || waitingStop.name || 'waiting-stop'}`}
                      subject="stop"
                      targetId={waitingStop.id}
                      targetName={waitingStop.name}
                      lineId={waitingStop.lineId}
                      language={language}
                      onAnswered={() => {
                        setAnswerCount((n) => n + 1);
                        setTravellersHelpedNow((current) => current + 1);
                      }}
                    />
                  )
                )}
              </AnimatePresence>

            </div>

          </div>

          {/* On ne fait défiler le contenu qu'une fois la sheet en haut. Ailleurs,
              tout glissement lui appartient — sans quoi le doigt ne saurait
              jamais s'il déplace la sheet ou son contenu.

              Pas de padding en haut : la première marche démarre sous le widget
              et en ressort, si bien que le fil du trajet paraît passer derrière
              lui plutôt que commencer en dessous. */}
          {/* Pas de marge horizontale ici : c'est ce conteneur qui rogne, et une
              marge de seize pixels coupait le carrousel avant le bord de
              l'écran. Les marges sont donc portées par chaque élément, et le
              carrousel s'en dispense pour aller jusqu'au bord. */}
          <div
            ref={contentRef}
            className="flex-1 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
            style={{ background: skin.background }}
          >
            {/* ── La timeline verticale ───────────────────────────────────
                Le trajet complet, dans l'ordre où on le vivra. La marche est un
                filet de points gris ; chaque véhicule est un bloc plein de sa
                couleur, sans marge, qui va d'un bord à l'autre. Le motif se
                répète : points, bloc, points, bloc.

                Toucher un bloc le désigne comme l'étape en cours — c'est ce qui
                remplace le bouton « suivant », et ça sert surtout quand le GPS
                se perd ou qu'on prend le véhicule d'après. */}
            <div className="mt-4 space-y-0">
              {steps.map((item, i) => {
                const isCurrent = i === index;
                const leg: any = itinerary.allLegs?.[i];
                const ink = readableOn(stepColor(item));

                if (item.kind === 'walk') {
                  return (
                    <div key={i} className="flex items-center gap-3 py-2 pl-3">
                      {/* Le filet de marche. Six points suffisent : il s'agit de
                          signifier un intervalle, pas de le mesurer.

                          La colonne fait la même largeur que le rail des lignes
                          et démarre au même endroit : le trajet se lit comme un
                          seul fil du départ à l'arrivée, pas comme des blocs
                          posés côte à côte. */}
                      <span className="flex w-7 flex-col items-center gap-1.5">
                        {[0, 1, 2, 3, 4, 5].map((d) => (
                          <span
                            key={d}
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: skin.muted }}
                          />
                        ))}
                      </span>
                      <span
                        className="flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-sm font-bold"
                        style={{ backgroundColor: skin.chip, color: skin.ink }}
                      >
                        <FaWalking className="h-4 w-4" style={{ color: skin.muted }} />
                        {item.durationMin} {item.durationMin > 1 ? 'minutes' : 'minute'}
                      </span>
                    </div>
                  );
                }
                if (item.kind === 'arrival') {
                  return (
                    <div key={i} className="flex items-center gap-3 pl-7 pr-4 pt-2">
                      <span className="flex w-7 justify-center">
                        <FlagIcon className="h-5 w-5 text-emerald-400" />
                      </span>
                      <span className="truncate text-sm font-bold" style={{ color: skin.ink }}>
                        {item.detail || item.instruction}
                      </span>
                    </div>
                  );
                }

                const stopsBefore = Array.isArray(leg?.intermediateStops)
                  ? leg.intermediateStops.length
                  : 0;
                const expanded = openLegs.has(i);

                return (
                  <div
                    key={i}
                    className="relative pt-5"
                    style={{ opacity: i < index ? 0.55 : 1 }}
                  >

                    {/* Le fond de ligne remonte derrière les cartes.
                        Sans lui, les cartes flottaient sur le fond sombre de la
                        sheet et paraissaient appartenir à celle-ci ; posées sur
                        la teinte de la ligne, elles appartiennent au véhicule.
                        Il s'arrête à mi-hauteur du carrousel, pour que les
                        cartes en dépassent encore par le haut. */}
                    <span
                      aria-hidden
                      className="absolute bottom-0 left-4 right-4 rounded-2xl"
                      style={{ backgroundColor: stepColor(item), top: '5.75rem' }}
                    />
                    {/* ── Le carrousel des passages ─────────────────────────
                        Le calculateur n'a retenu qu'un départ. Or on marche
                        rarement à la vitesse qu'il a supposée : voir le suivant
                        permet de choisir soi-même, plutôt que de courir.

                        Le premier est aligné sur le rail et sélectionné par
                        défaut — c'est celui du trajet calculé. Les cartes
                        débordent de dix pixels au-dessus du bloc : elles
                        appartiennent au véhicule, et ce débord dit qu'elles
                        arrivent de l'extérieur du trajet calculé. */}
                    {(
                      <div
                        onPointerDownCapture={(e) => {
                          // La sheet se traine au doigt, et framer-motion capte
                          // le geste des l'appui. Sans cette coupure, faire
                          // defiler le carrousel faisait aussi monter ou
                          // descendre la sheet : les deux mouvements se
                          // disputaient le doigt et le defilement s'arretait
                          // toutes les deux secondes.
                          e.stopPropagation();
                        }}
                        onScroll={(e) => {
                          // La carte arrivée à la première place devient la carte
                          // retenue : on ne demande pas de confirmer un choix
                          // qu'on vient de faire en faisant défiler jusque-là.
                          //
                          // Mais on attend l'arrêt du doigt. Mettre l'état à jour
                          // à chaque événement de défilement redessinait toute la
                          // timeline vingt fois par seconde, et le geste
                          // saccadait — c'est ce qui rendait le carrousel
                          // désagréable.
                          const element = e.currentTarget;
                          scrollingRef.current = true;
                          window.clearTimeout(scrollSettleRef.current);
                          scrollSettleRef.current = window.setTimeout(() => {
                            scrollingRef.current = false;
                            /*
                             * La carte arrivée à la place de tête devient la carte
                             * retenue, qu'on ait fait défiler vers la gauche ou
                             * vers la droite : reculer pour prendre le tram d'avant
                             * est le geste qui compte le plus, puisque c'est celui
                             * qu'on fait quand on est en avance.
                             */
                            const at = Math.max(
                              0,
                              Math.round(element.scrollLeft / RUN_CARD_PITCH)
                            );
                            if (at !== selectedIndexFor(i, runsForLeg(i))) choose(i, at);
                          }, 110);
                        }}
                        ref={(element) => {
                          /*
                           * Le carrousel s'ouvre déjà placé sur la carte retenue.
                           *
                           * Il s'ouvrait sur le passage le plus proche de
                           * maintenant, donc tout à gauche : on ne voyait pas que
                           * le choix avait été fait, et les passages antérieurs
                           * n'existaient pas à l'écran faute de pouvoir défiler
                           * vers eux. En arrivant déjà positionné, il dit deux
                           * choses d'un coup — celui-là est le tien, et il y en
                           * avait avant.
                           *
                           * On ne replace rien dès que l'usager a choisi sur le
                           * tronçon en cours : ce serait lui reprendre son geste.
                           */
                          if (!element) return;
                          if (scrollingRef.current) return;
                          if (pickedRuns.has(i)) return;
                          const target = selectedIndexFor(i, runsForLeg(i)) * RUN_CARD_PITCH;
                          if (Math.abs(element.scrollLeft - target) > 2) {
                            element.scrollLeft = target;
                          }
                        }}
                        className="relative z-10 flex snap-x snap-mandatory gap-2 overflow-x-auto pb-3 pl-9 [scroll-padding-left:2.25rem] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                      >
                        {(() => {
                          const cards = runsForLeg(i);
                          const selected = selectedIndexFor(i, cards);
                          return cards.map((run, r) => {
                          const mins = run.minutes;
                          const empty = mins === null;
                          const picked = !empty && r === selected;
                          /*
                           * Au-delà d'une demi-heure, on donne l'heure.
                           *
                           * « 47 minutes » demande une addition, et personne ne la
                           * fait sur un quai. Au-delà d'une demi-heure on ne
                           * compte plus à rebours, on lit une heure de départ —
                           * en dessous, l'attente reste une durée qu'on ressent.
                           */
                          const asClock = !empty && mins! > 30;
                          const clock = asClock
                            ? formatClock(new Date(Date.now() + mins! * 60000).toISOString())
                            : '';
                          return (
                            <button
                              key={r}
                              type="button"
                              disabled={empty}
                              onClick={(e) => {
                                choose(i, r);
                                // L'aimant, à la main : la carte touchée glisse
                                // à la première place, au-dessus du rail.
                                e.currentTarget.scrollIntoView({
                                  behavior: 'smooth',
                                  inline: 'start',
                                  block: 'nearest',
                                });
                              }}
                              className="relative flex flex-shrink-0 snap-start flex-col items-center justify-center rounded-2xl shadow-[0_4px_14px_rgba(0,0,0,0.25)]"
                              style={{
                                width: RUN_CARD_WIDTH,
                                height: 128,
                                /*
                                 * La carte retenue est blanche, pas à l'encre du
                                 * bloc.
                                 *
                                 * Elle prenait cette encre — bleu nuit sur une
                                 * ligne claire — et le carrousel débordant sur le
                                 * fond de la sheet, qui est ce même bleu nuit, la
                                 * carte s'y dissolvait : on ne voyait plus laquelle
                                 * était choisie. Le blanc, lui, se détache autant
                                 * du fond sombre que de n'importe quel aplat de
                                 * ligne, et la lettre garde la teinte du véhicule,
                                 * assombrie juste assez pour tenir dessus.
                                 */
                                ...(picked
                                  ? {
                                      backgroundColor: skin.plate,
                                      color: skin.plateInk(stepColor(item)),
                                    }
                                  : {
                                      // Un cran de la couleur de ligne, pas du
                                      // noir translucide : la carte annonce ce
                                      // véhicule-là, elle en garde la teinte.
                                      backgroundColor: shadeColor(stepColor(item), 0.22),
                                      color: ink,
                                      opacity: empty ? 0.45 : 1,
                                    }),
                              }}
                            >
                              {/* ── La pastille de confiance ────────────────
                                  Ce que les voyageurs ont signalé sur cette
                                  ligne à cet arrêt, à cette tranche horaire :
                                  vert, on y va ; orange, ça se discute ; rouge,
                                  c'est plein, en retard, ou ça n'est pas venu.

                                  Un point, pas un texte : la carte porte déjà
                                  deux nombres et un bandeau, et l'information
                                  tient dans une couleur. Le détail est écrit
                                  une seule fois sous le carrousel, où il y a la
                                  place de le dire en toutes lettres. */}
                              {!empty && i === activeTransitIndex && confidence && (
                                <span
                                  className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full"
                                  style={{
                                    backgroundColor: CONFIDENCE_COLOR[confidence.level],
                                    // Un liseré de la couleur de la carte : sur
                                    // un aplat clair, un point vert seul se
                                    // confondait avec la ligne elle-même.
                                    boxShadow: '0 0 0 2px rgba(0,0,0,0.18)',
                                  }}
                                  aria-label={confidenceLabel(confidence, isFr)}
                                  title={confidenceLabel(confidence, isFr)}
                                />
                              )}
                              <span
                                className={`tabular font-black leading-none ${
                                  asClock ? 'text-[30px]' : 'text-[44px]'
                                }`}
                              >
                                {empty ? '–' : asClock ? clock : mins}
                              </span>
                              <span className="mt-1 text-xs opacity-80">
                                {empty
                                  ? ''
                                  : asClock
                                  ? isFr
                                    ? `dans ${mins} min`
                                    : `in ${mins} min`
                                  : mins! > 1
                                  ? 'minutes'
                                  : 'minute'}
                              </span>

                              {/* Le bandeau du bas dit une chose ou l'autre.
                                  L'affluence quand on la connaît — elle vient
                                  des avis de voyageurs, le réseau ne publiant
                                  aucun taux de charge, donc elle vaut pour la
                                  ligne et non pour ce passage-là. Sinon
                                  « PLANIFIÉ », qui prévient que l'horaire est
                                  théorique et non relevé en direct. Les deux
                                  ensemble encombreraient une carte de 56 px. */}
                              {/* « En direct » ne se dit que si quelqu'un est
                                  réellement à bord de cette ligne et nous l'a
                                  signalé. Le réseau marque ses horaires
                                  « temps réel » même quand ils sortent d'une
                                  prédiction : l'écrire sur cette foi-là serait
                                  promettre plus qu'on ne sait. À défaut,
                                  l'affluence si on la connaît, sinon
                                  « planifié ». */}
                              {!empty && run.level > 0 ? (
                                <span
                                  className="mt-2.5 flex items-center gap-1 rounded-lg px-2 py-1"
                                  style={{
                                    backgroundColor: picked
                                      ? 'rgba(0,0,0,0.08)'
                                      : 'rgba(255,255,255,0.15)',
                                  }}
                                >
                                  {[0, 1, 2].map((p) => (
                                    <UserIcon
                                      key={p}
                                      className="h-3.5 w-3.5"
                                      style={{ opacity: p < run.level ? 1 : 0.25 }}
                                    />
                                  ))}
                                </span>
                              ) : !empty && i === activeTransitIndex && lineDelay ? (
                                <span
                                  className="mt-2.5 rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-wide"
                                  style={{
                                    backgroundColor: picked
                                      ? 'rgba(0,0,0,0.08)'
                                      : 'rgba(255,255,255,0.15)',
                                  }}
                                >
                                  {isFr ? 'En direct' : 'Live'}
                                </span>
                              ) : (
                                !empty && (
                                  <span
                                    className="mt-2.5 rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-wide"
                                    style={{
                                      backgroundColor: picked
                                        ? 'rgba(0,0,0,0.12)'
                                        : 'rgba(255,255,255,0.15)',
                                    }}
                                  >
                                    {isFr ? 'Planifié' : 'Scheduled'}
                                  </span>
                                )
                              )}
                            </button>
                          );
                          });
                        })()}

                        {/* La piste d'élan.
                            Sans elle, trois cartes tiennent dans la largeur et
                            le carrousel ne défile pas du tout : la deuxième ne
                            pouvait pas venir se caler au-dessus du rail, faute
                            de place derrière elle. Ce vide donne à la dernière
                            carte de quoi remonter jusqu'à la première place. Il
                            est normal, alors, que les premières sortent de
                            l'écran — c'est le principe. */}
                        <span
                          aria-hidden
                          className="flex-shrink-0"
                          style={{ width: `calc(100% - ${RUN_CARD_WIDTH}px - 2.25rem)` }}
                        />
                      </div>
                    )}

                    {/* ── Ce que la pastille raconte ────────────────────────
                        La couleur seule ne se lit pas : on saurait que quelque
                        chose ne va pas sans savoir quoi, et l'on ne peut rien
                        décider avec ça. La phrase est écrite une fois, sous le
                        carrousel, et vaut pour toutes ses cartes — elles
                        parlent de la même ligne au même arrêt. */}
                    {i === activeTransitIndex && confidence && (
                      <div className="relative z-10 -mt-1 mb-1 flex items-center gap-2 pl-9 pr-4">
                        <span
                          aria-hidden
                          className="h-2 w-2 flex-shrink-0 rounded-full"
                          style={{ backgroundColor: CONFIDENCE_COLOR[confidence.level] }}
                        />
                        <span className="truncate text-[11px] font-semibold" style={{ color: ink }}>
                          {confidenceLabel(confidence, isFr)}
                        </span>
                      </div>
                    )}

                    <div className="relative mx-4 rounded-2xl px-3 pb-5" style={{ color: ink }}>

                    {lineChips(i === activeTransitIndex)}

                    {/* L'en-tête, posé au-dessus du rail : l'icône du mode
                        occupe exactement la colonne du rail, et la destination
                        s'écrit à sa droite — badge de ligne puis terminus, dans
                        la même forme que les favoris, pour qu'on reconnaisse la
                        ligne au même coup d'œil des deux côtés de l'app. */}
                    <div className="flex items-center gap-3">
                      <span className="flex w-7 justify-center">
                        <TransportModeIcon mode={item.mode} className="h-6 w-6 opacity-80" />
                      </span>
                      <ArrowRightCircleIcon className="h-5 w-5 flex-shrink-0 opacity-80" />
                      <span
                        className="flex h-7 min-w-[1.75rem] flex-shrink-0 items-center justify-center rounded-lg px-2 text-sm font-black"
                        style={{ backgroundColor: ink, color: stepColor(item) }}
                      >
                        {item.lineShortName}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-base font-black leading-tight">
                        {item.headsign || item.instruction}
                      </span>
                      {isCurrent && (
                        <span className="flex-shrink-0 rounded-full bg-black/20 px-2 py-1 text-[10px] font-bold uppercase tracking-wide">
                          {isFr ? 'À bord' : 'On board'}
                        </span>
                      )}
                    </div>

                    <div className="pt-2">
                      {/* Le rail. Même largeur que la colonne de marche, et les
                          pastilles de montée et de descente sont posées dedans
                          plutôt qu'à cheval : le fil garde une épaisseur
                          constante du haut en bas du trajet. */}
                      <div className="flex gap-3">
                        {/* Le rail nait d'un point et s'ouvre en bande.
                            A pied, le trajet n'est qu'une file de points ; y
                            monter est le moment ou il prend de l'epaisseur. La
                            bande pousse donc depuis sa largeur de point quand
                            le troncon devient le sien, ce qui donne au fait de
                            monter une consequence visible a l'ecran. */}
                        <motion.div
                          className="flex flex-col items-center justify-between self-stretch overflow-hidden rounded-full bg-black/20 py-1.5"
                          initial={false}
                          animate={{ width: isCurrent ? 28 : 22 }}
                          transition={{ type: 'spring', stiffness: 280, damping: 26 }}
                        >
                          <motion.span
                            className="rounded-full bg-current"
                            initial={false}
                            animate={{ width: isCurrent ? 12 : 8, height: isCurrent ? 12 : 8 }}
                            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                          />
                          <motion.span
                            className="rounded-full bg-current"
                            initial={false}
                            animate={{ width: isCurrent ? 12 : 8, height: isCurrent ? 12 : 8 }}
                            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                          />
                        </motion.div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="truncate text-sm font-semibold">{item.fromName}</span>
                            <span className="tabular flex-shrink-0 text-sm font-bold">
                              {shiftedClock(leg?.startTime, i)}
                            </span>
                          </div>

                          {stopsBefore > 0 && (
                            <>
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                  // Sans cela, déplier changerait aussi l'étape
                                  // en cours — on veut juste regarder.
                                  e.stopPropagation();
                                  const opening = !openLegs.has(i);
                                  setOpenLegs((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(i)) next.delete(i);
                                    else next.add(i);
                                    return next;
                                  });
                                  /*
                                   * Déplier ne déplace plus la sheet.
                                   *
                                   * On la tirait jusqu'en haut pour faire de la
                                   * place, mais la liste allonge le contenu et
                                   * repousse d'autant la borne haute : le geste
                                   * emportait la sheet bien au-delà de ce qu'on
                                   * voulait lire, et l'on se retrouvait au bas du
                                   * trajet. Elle grandit sur place, sous le
                                   * doigt, et cela suffit.
                                   */
                                  void opening;
                                }}
                                className="my-4 flex items-center gap-1 text-xs opacity-80"
                              >
                                <ChevronDownIcon
                                  className={`h-3.5 w-3.5 transition-transform ${
                                    expanded ? 'rotate-180' : ''
                                  }`}
                                />
                                {isFr
                                  ? `Encore ${stopsBefore} arrêt${stopsBefore > 1 ? 's' : ''} avant…`
                                  : `${stopsBefore} more stop${stopsBefore > 1 ? 's' : ''}…`}
                              </span>
                              {/* Le dépliage.
                                  `height: auto` laisse framer mesurer la liste
                                  et l'animer sans qu'on ait à connaître sa
                                  hauteur — un nombre d'arrêts qu'on ignore, sur
                                  des noms qui passent parfois à la ligne. Les
                                  arrêts arrivent ensuite un par un, décalés de
                                  trente millisecondes : la cascade dit dans quel
                                  sens on roule. */}
                              <AnimatePresence initial={false}>
                                {expanded && (
                                  <motion.ul
                                    className="overflow-hidden text-sm opacity-80"
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{
                                      height: { type: 'spring', stiffness: 320, damping: 34 },
                                      opacity: { duration: 0.18 },
                                    }}
                                  >
                                    {leg.intermediateStops.map((stop: any, s: number) => (
                                      <motion.li
                                        key={s}
                                        className="truncate pb-2.5"
                                        initial={{ opacity: 0, x: -8 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.06 + s * 0.03, duration: 0.2 }}
                                      >
                                        {stop?.name ?? ''}
                                      </motion.li>
                                    ))}
                                  </motion.ul>
                                )}
                              </AnimatePresence>
                            </>
                          )}
                          {/* Sans arrêts intermédiaires, les deux quais se
                              toucheraient : on garde l'espace pour que le rail
                              ait une longueur, et le tronçon une durée. */}
                          {/* L'espace ne dépend pas du nombre d'arrêts : un tronçon d'un
                              seul arrêt et un tronçon de neuf doivent se lire de la
                              même façon, et c'est la hauteur du rail qui dit qu'on
                              roule un moment. */}
                          <div className={stopsBefore === 0 ? 'h-16' : 'h-8'} />

                          <div className="flex items-baseline justify-between gap-3">
                            <span className="truncate text-sm font-semibold">
                              {leg?.to?.name ?? ''}
                            </span>
                            <span className="tabular flex-shrink-0 text-sm font-bold">
                              {shiftedClock(leg?.endTime, i)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Le retard mesuré par ceux qui y sont déjà. Sur un aplat
                          de ligne, l'ambre et le vert ne tiennent plus — la
                          couleur du fond change à chaque correspondance — donc
                          un jeton translucide, lisible sur bleu nuit comme sur
                          jaune. */}
                      {i === activeTransitIndex && showDelay && (
                        <span
                          className="tabular mt-2.5 inline-block rounded-full bg-black/20 px-2 py-0.5 text-[11px] font-bold"
                          title={
                            isFr
                              ? `D'après ${lineDelay!.sampleSize} observations de voyageurs`
                              : `Based on ${lineDelay!.sampleSize} traveller observations`
                          }
                        >
                          {delayMinutes > 0
                            ? isFr
                              ? `+${delayMinutes} min constatées`
                              : `+${delayMinutes} min observed`
                            : isFr
                            ? `${Math.abs(delayMinutes)} min d'avance`
                            : `${Math.abs(delayMinutes)} min early`}
                        </span>
                      )}
                    </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>

        {/* ── Les réglages du guidage ──────────────────────────────────────
            Une sheet posée par-dessus tout, vide pour l'instant. Elle existe
            pour que le bouton mène quelque part plutôt que nulle part, et pour
            que ce qui viendra s'y ajoute sans rien déplacer. */}
        <MapSheet
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          isLight={theme !== 'dark'}
          // Le guidage occupe déjà le dessus de la pile ; la feuille doit passer
          // par-dessus lui, qu'elle soit rendue ici ou portée à la racine.
          zIndex={10050}
        >
              <div className="flex-1 overflow-y-auto px-5 pb-6">
                <h2 className="mb-4 text-lg font-black" style={{ color: skin.ink }}>
                  {isFr ? 'Réglages du guidage' : 'Navigation settings'}
                </h2>
                {/* Passer l'étape, à la main.
                    Le guidage avance seul, d'après la position et l'allure. Il
                    se trompe parfois — un GPS qui décroche sous un tunnel, un
                    bus pris à l'arrêt d'après. Cette porte de sortie existe pour
                    ces fois-là, et elle est rangée dans les réglages parce
                    qu'elle ne doit pas devenir l'usage normal. */}
                {index < steps.length - 1 && (
                  <button
                    onClick={() => {
                      setIndex((i) => Math.min(i + 1, steps.length - 1));
                      setIsSettingsOpen(false);
                    }}
                    className="mb-6 flex w-full items-center justify-between rounded-2xl px-4 py-3.5 text-left"
                    style={{ backgroundColor: skin.chip, color: skin.ink }}
                  >
                    <span className="text-sm font-bold" style={{ color: skin.ink }}>
                      {isFr ? "Passer à l'étape suivante" : 'Skip to next step'}
                    </span>
                    <span className="truncate pl-3 text-xs text-slate-400">
                      {steps[index + 1]?.kind === 'transit'
                        ? steps[index + 1]?.lineShortName
                        : steps[index + 1]?.instruction}
                    </span>
                  </button>
                )}

                {/* Les avis de trajet.
                    L'autorisation se demande ici, sur un geste : une demande qui
                    surgit au chargement est refusée par les navigateurs, et iOS
                    retient ce refus pour de bon. */}
                <button
                  onClick={async () => {
                    if (notifyOn) {
                      setNotificationsEnabled(false);
                      setNotifyOn(false);
                      return;
                    }
                    const granted = await requestNotificationPermission();
                    setNotificationsEnabled(granted);
                    setNotifyOn(granted);
                  }}
                  className="mb-6 flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-left"
                    style={{ backgroundColor: skin.chip, color: skin.ink }}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-bold" style={{ color: skin.ink }}>
                      {isFr ? 'Avis pendant le trajet' : 'Trip alerts'}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-400">
                      {isFr
                        ? 'Partez maintenant, votre bus arrive, correspondance…'
                        : 'Leave now, your bus is arriving, transfer…'}
                    </span>
                  </span>
                  <span
                    className={`flex h-6 w-11 flex-shrink-0 items-center rounded-full px-0.5 transition-colors ${
                      notifyOn ? 'bg-emerald-500' : 'bg-slate-600'
                    }`}
                  >
                    <motion.span
                      className="h-5 w-5 rounded-full bg-white"
                      animate={{ x: notifyOn ? 20 : 0 }}
                      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                    />
                  </span>
                </button>

                {/* La voix.
                    Coupée par défaut : une application qui se met à parler sans
                    prévenir, dans un tram, se fait couper le son puis
                    désinstaller. Elle ne s'affiche pas du tout si le navigateur
                    n'a pas de synthèse vocale — proposer un réglage sans effet
                    est pire que de ne rien proposer. */}
                {voiceSupported() && (
                  <button
                    onClick={() => {
                      const next = !voiceOn;
                      setVoiceEnabled(next);
                      setVoiceOn(next);
                      // On dit la phrase tout de suite : c'est le seul moyen de
                      // savoir à quoi on vient de consentir, et le geste de
                      // l'usager débloque au passage la synthèse sur iOS.
                      if (next) {
                        speak(
                          isFr
                            ? 'Les consignes seront annoncées à voix haute.'
                            : 'Directions will be spoken aloud.',
                          language
                        );
                      }
                    }}
                    className="mb-6 flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-left"
                    style={{ backgroundColor: skin.chip, color: skin.ink }}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-bold" style={{ color: skin.ink }}>
                        {isFr ? 'Annonces à voix haute' : 'Spoken directions'}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-400">
                        {isFr
                          ? '« Prenez la C1 direction Grand’place »'
                          : '“Take the C1 toward Grand’place”'}
                      </span>
                    </span>
                    <span
                      className={`flex h-6 w-11 flex-shrink-0 items-center rounded-full px-0.5 transition-colors ${
                        voiceOn ? 'bg-emerald-500' : 'bg-slate-600'
                      }`}
                    >
                      <motion.span
                        className="h-5 w-5 rounded-full bg-white"
                        animate={{ x: voiceOn ? 20 : 0 }}
                        transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                      />
                    </span>
                  </button>
                )}

                <p className="signal-label mb-1 text-slate-500">
                  {isFr ? 'Priorité à la marche' : 'Walking priority'}
                </p>
                <StepSlider
                  count={WALK_PRIORITIES.length}
                  value={walkPrefs.priorityIndex}
                  emoji={WALK_PRIORITIES[walkPrefs.priorityIndex].emoji}
                  color="#3b82f6"
                  ariaLabel={isFr ? 'Priorité à la marche' : 'Walking priority'}
                  onChange={(priorityIndex) => updateWalkPrefs({ ...walkPrefs, priorityIndex })}
                />
                <p className="mt-2 text-center text-sm font-bold" style={{ color: skin.ink }}>
                  {WALK_PRIORITIES[walkPrefs.priorityIndex].label(isFr)}
                </p>
                <p className="mb-6 mt-0.5 text-center text-xs text-slate-400">
                  {WALK_PRIORITIES[walkPrefs.priorityIndex].hint(isFr)}
                </p>

                <p className="signal-label mb-1 text-slate-500">
                  {isFr ? 'Vitesse de marche' : 'Walking speed'}
                </p>
                <StepSlider
                  count={WALK_SPEEDS.length}
                  value={walkPrefs.speedIndex}
                  emoji={WALK_SPEEDS[walkPrefs.speedIndex].emoji}
                  color="#22c55e"
                  ariaLabel={isFr ? 'Vitesse de marche' : 'Walking speed'}
                  onChange={(speedIndex) => updateWalkPrefs({ ...walkPrefs, speedIndex })}
                />
                <p className="mt-2 text-center text-sm font-bold text-white">
                  {WALK_SPEEDS[walkPrefs.speedIndex].label(isFr)}
                </p>
                <p className="tabular mb-4 mt-0.5 text-center text-xs text-slate-400">
                  {WALK_SPEEDS[walkPrefs.speedIndex].kmh.toLocaleString('fr-FR', {
                    minimumFractionDigits: 1,
                  })}{' '}
                  km/h
                </p>

                <p className="pb-2 text-center text-[11px] leading-snug text-slate-500">
                  {isFr
                    ? 'Ces réglages sont conservés sur cet appareil et servent au calcul de vos prochains itinéraires.'
                    : 'These settings stay on this device and shape your next journeys.'}
                </p>
              </div>
        </MapSheet>

        <MapSheet
          isOpen={isHelpedSheetOpen}
          onClose={() => setIsHelpedSheetOpen(false)}
          isLight={theme !== 'dark'}
          zIndex={10050}
        >
          <div className="flex flex-1 flex-col items-center px-5 pb-8 pt-5 text-center" style={{ fontFamily: "Inter, 'Helvetica Neue', sans-serif" }}>
            <div className="relative mt-3 h-44 w-72" aria-hidden="true">
              {AVATARS.slice(0, Math.min(6, travellersHelpedNow)).map((avatar, index, faces) => {
                const angle = faces.length === 1 ? -90 : -155 + (130 * index) / (faces.length - 1);
                const radians = (angle * Math.PI) / 180;
                const x = Math.cos(radians) * 104;
                const y = Math.sin(radians) * 78;
                return (
                  <motion.span
                    key={`${avatar}-${index}`}
                    className="absolute left-1/2 top-[78%] flex h-12 w-12 items-center justify-center rounded-full border-4 border-white bg-white text-xl shadow-[0_5px_18px_rgba(0,0,0,0.22)]"
                    initial={{ opacity: 0, scale: 0.65, x: x * 0.7, y: y * 0.7 }}
                    animate={{ opacity: 1, scale: 1, x, y: [y, y - 5, y] }}
                    transition={{
                      opacity: { duration: 0.35, delay: index * 0.06 },
                      scale: { duration: 0.35, delay: index * 0.06 },
                      x: { duration: 0.35, delay: index * 0.06 },
                      y: { duration: 2.4 + index * 0.16, repeat: Infinity, ease: 'easeInOut', delay: index * 0.08 },
                    }}
                  >
                    {avatar}
                  </motion.span>
                );
              })}
            </div>

            <motion.p
              className="tabular-nums text-[56px] font-black leading-none"
              style={{ color: skin.ink }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <AnimatedCount value={travellersHelpedNow} />
            </motion.p>
            <p className="mt-5 max-w-sm text-[15px] leading-relaxed" style={{ color: skin.muted }}>
              {isFr
                ? "Voici les personnes que vous avez aidées durant votre trajet. Merci d'utiliser GreLines."
                : 'These are the travellers you have helped during your trip. Thank you for using GreLines.'}
            </p>
          </div>
        </MapSheet>

        <AnimatePresence>
          {false && isExitDialogOpen && (
            <motion.div
              className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/60 px-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsExitDialogOpen(false)}
            >
              <motion.div
                className="w-full max-w-sm rounded-[2rem] border border-white/10 bg-slate-950 p-5 text-white shadow-[0_30px_100px_rgba(0,0,0,0.45)]"
                initial={{ y: 18, scale: 0.98 }}
                animate={{ y: 0, scale: 1 }}
                exit={{ y: 18, scale: 0.98 }}
                transition={{ duration: 0.2 }}
                onClick={e => e.stopPropagation()}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">
                  {isFr ? 'Voyage en cours' : 'Trip in progress'}
                </p>
                <h3 className="mt-2 text-[22px] font-black leading-tight">
                  {isFr
                    ? 'Voulez-vous terminer le voyage ?'
                    : 'Do you want to end the trip?'}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-white/65">
                  {isFr
                    ? 'Le guidage sera arrete et vous reviendrez a la carte.'
                    : 'Guidance will stop and you will return to the map.'}
                </p>
                <div className="mt-5">
                  <button
                    type="button"
                    onClick={() => {
                      setIsExitDialogOpen(false);
                      handleClose();
                    }}
                    className="w-full rounded-2xl bg-red-500 px-4 py-3 text-sm font-black text-white shadow-[0_10px_30px_rgba(239,68,68,0.28)]"
                  >
                    {isFr ? 'Terminer le voyage' : 'End trip'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setIsExitDialogOpen(false)}
                  className="mt-3 w-full text-center text-xs font-semibold text-white/45"
                >
                  {isFr ? 'Annuler' : 'Cancel'}
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <AnimatePresence>
        {showCompact && (
          <motion.div
            className="fixed inset-x-3 z-[1105] pointer-events-none"
            style={{
              bottom: 'calc(max(env(safe-area-inset-bottom), 0.75rem) + 4.75rem)',
              fontFamily: "Inter, 'Helvetica Neue', sans-serif",
            }}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
          >
            <button
              type="button"
              onClick={onRestore}
              className="pointer-events-auto w-full rounded-3xl border border-slate-800 bg-slate-950 px-4 py-4 text-left text-white shadow-[0_18px_50px_rgba(0,0,0,0.28)]"
              aria-label={isFr ? 'Rouvrir le guidage' : 'Reopen navigation'}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
                    {isFr ? 'Voyage minimisé' : 'Navigation minimized'}
                  </p>
                  <h3 className="mt-1 truncate text-[18px] font-black leading-tight">
                    {compactTitle}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-sm leading-snug text-white/72">
                    {compactSubtitle}
                  </p>
                </div>
                <span className="rounded-full bg-white/8 px-3 py-1 text-[11px] font-bold text-white/80">
                  {isFr ? 'Touchez pour rouvrir' : 'Tap to reopen'}
                </span>
              </div>

              <div className="mt-4 rounded-2xl bg-slate-900 px-3 py-3">
                <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                  <span>{isFr ? 'Prochaines actions' : 'Next actions'}</span>
                  <span className="tabular-nums">
                    {isFr
                      ? `Étape ${Math.min(index + 1, steps.length)} / ${steps.length}`
                      : `Step ${Math.min(index + 1, steps.length)} / ${steps.length}`}
                  </span>
                </div>
                <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {steps.slice(index, Math.min(steps.length, index + 5)).map((miniStep, miniIndex) => {
                    const absoluteIndex = index + miniIndex;
                    const active = absoluteIndex === index;
                    const label =
                      miniStep.kind === 'transit'
                        ? (miniStep.lineShortName ?? 'Transit')
                        : miniStep.kind === 'walk'
                        ? (isFr ? 'Marche' : 'Walk')
                        : miniStep.kind === 'arrival'
                        ? (isFr ? 'Arrivée' : 'Arrival')
                        : miniStep.instruction;
                    const time =
                      miniStep.kind === 'transit'
                        ? shiftedClock((itinerary.allLegs as any[])?.[absoluteIndex]?.startTime, absoluteIndex)
                        : '';
                    return (
                      <div
                        key={`${absoluteIndex}-${label}`}
                        className={`flex flex-shrink-0 items-center gap-2 rounded-2xl px-3 py-2 ${
                          active ? 'bg-white text-slate-950' : 'bg-white/8 text-white/82'
                        }`}
                      >
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            active ? 'bg-emerald-500' : 'bg-white/35'
                          }`}
                        />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold">{label}</div>
                          <div className="text-[11px] text-white/55">
                            {time || compactActionLabel || (isFr ? 'À venir' : 'Upcoming')}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </AnimatePresence>
  );
}

function AnimatedCount({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  const previousRef = useRef(0);

  useEffect(() => {
    const start = previousRef.current;
    const startedAt = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min((now - startedAt) / 480, 1);
      setShown(Math.round(start + (value - start) * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(tick);
      else previousRef.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <span className="tabular-nums">{shown}</span>;
}
