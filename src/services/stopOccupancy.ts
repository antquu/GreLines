/**
 * L'affluence réelle, par arrêt, par ligne et par quart d'heure.
 *
 * L'application affichait jusqu'ici une affluence tirée au sort — un
 * `Math.random()` mis en cache par ligne, dans `api.ts`. Sur un écran où l'on
 * décide de monter ou d'attendre le suivant, c'est pire que rien.
 *
 * Le réseau publie pourtant la vraie mesure : capacité du véhicule, nombre de
 * voyageurs à bord et pourcentage de remplissage, relevés à chaque arrêt, pour
 * chaque ligne, chaque direction et chaque tranche de quinze minutes de la
 * journée. C'est une moyenne établie, pas un relevé de l'instant — mais elle est
 * mesurée, et un tram bondé à 8 h 15 l'est tous les jours à 8 h 15.
 *
 * Le fichier fait douze mégaoctets, et le serveur refuse de le filtrer : ni par
 * arrêt, ni par ligne. Il descend donc en une fois, compressé à quatre cent
 * trente kilooctets par le serveur, et l'on garde le résultat pour la journée.
 */

const OCCUPANCY_URL = 'https://data.mobilites-m.fr/api/stops/occupancy';

/** Une mesure, pour un arrêt, une ligne, une direction et un quart d'heure. */
export interface OccupancyReading {
  /** Places offertes par le véhicule. */
  capacity: number;
  /** Voyageurs à bord. */
  occupancy: number;
  /** Remplissage, de 0 à 100. */
  percent: number;
  /** Le mot du réseau : « Faible », « Modérée », « Forte ». */
  label: string;
  /** Le rang que le réseau associe à ce mot : 1, 2 ou 3. */
  rank: number;
}

interface OccupancyDataset {
  /** Durée d'une tranche, en minutes. Quinze aujourd'hui. */
  step: number;
  stops: Record<string, Record<string, Record<string, { times: Record<string, any> }>>>;
}

let dataset: OccupancyDataset | null = null;
let loadedAt = 0;
let inflight: Promise<OccupancyDataset | null> | null = null;

/** Une journée : la mesure est un profil horaire, elle ne change pas d'une heure à l'autre. */
const TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Charge le jeu de données, une fois.
 *
 * Les appels concurrents partagent la même promesse : au lancement du guidage,
 * plusieurs tronçons le demandent en même temps, et douze mégaoctets téléchargés
 * trois fois seraient trois fois trop.
 */
export async function loadOccupancy(): Promise<OccupancyDataset | null> {
  if (dataset && Date.now() - loadedAt < TTL_MS) return dataset;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const response = await fetch(OCCUPANCY_URL);
      if (!response.ok) return null;
      const json = (await response.json()) as OccupancyDataset;
      if (!json?.stops) return null;
      dataset = json;
      loadedAt = Date.now();
      return dataset;
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/**
 * L'affluence attendue à un arrêt, sur une ligne, à une heure donnée.
 *
 * `stopId` est l'identifiant de poteau — « SEM:2060 » — celui-là même que rend
 * le calculateur d'itinéraires. Aucun rapprochement à faire.
 *
 * La direction est facultative : beaucoup d'arrêts n'en ont qu'une d'enregistrée,
 * et se tromper de sens vaut mieux que de ne rien montrer — les deux sens d'une
 * même ligne se remplissent rarement à l'opposé l'un de l'autre au même moment.
 */
export function getOccupancyAt(
  stopId: string | undefined,
  routeId: string | undefined,
  when: Date,
  direction?: number
): OccupancyReading | null {
  if (!dataset || !stopId || !routeId) return null;

  const byRoute = dataset.stops[stopId];
  if (!byRoute) return null;

  const byDirection = byRoute[routeId];
  if (!byDirection) return null;

  const directions = Object.keys(byDirection);
  if (directions.length === 0) return null;
  const key =
    direction != null && byDirection[String(direction)] ? String(direction) : directions[0];

  const times = byDirection[key]?.times;
  if (!times) return null;

  // Les tranches sont indexées en secondes depuis minuit, par pas de `step`.
  const stepSeconds = Math.max(1, (dataset.step || 15) * 60);
  const seconds = when.getHours() * 3600 + when.getMinutes() * 60;
  const bucket = Math.floor(seconds / stepSeconds) * stepSeconds;

  const entry = times[String(bucket)];
  if (!entry) return null;

  const percent = Number(entry.percent);
  if (!Number.isFinite(percent)) return null;

  return {
    capacity: Number(entry.capacity) || 0,
    occupancy: Number(entry.occupancy) || 0,
    percent,
    label: String(entry.label ?? ''),
    rank: Number(entry.id) || 0,
  };
}

/**
 * Trois paliers, pour trois bonshommes.
 *
 * Le réseau classe lui-même chaque mesure — « Faible », « Modérée », « Forte » —
 * et porte le rang dans le champ `id`. On le reprend tel quel plutôt que de
 * refaire les seuils : relevés sur l'ensemble du jeu de données, ils tombent à
 * 20 % et 50 %, et non aux tiers qu'on aurait supposés. Un tram à moitié plein
 * est déjà un tram où l'on reste debout, et c'est le réseau qui sait à partir de
 * quand.
 *
 * Le calcul de repli ne sert que si un jour le champ disparaît.
 */
export function occupancyLevel(reading: OccupancyReading | null): 0 | 1 | 2 | 3 {
  if (!reading) return 0;
  if (reading.rank === 1 || reading.rank === 2 || reading.rank === 3) return reading.rank;
  if (reading.percent >= 50) return 3;
  if (reading.percent >= 20) return 2;
  return 1;
}
