/**
 * Les adresses imprimées, et les arrêts qu'elles désignent encore.
 *
 * Un QR code collé en gare porte l'identifiant de l'arrêt :
 *
 *   grelines.fr/?utm_source=gare&utm_stops=SEM:GARES
 *
 * Le problème est que cet identifiant appartient au réseau, pas à nous. Le
 * soir où « SEM:GARES » est devenu « SEM:GAR », toutes les affiches déjà
 * posées ont cessé de fonctionner d'un coup, sans que rien de notre côté n'ait
 * bougé. Le papier, lui, ne se met pas à jour.
 *
 * D'où ce module. L'identifiant écrit sur une affiche devient un identifiant à
 * nous, choisi une fois et jamais rechangé, et l'on garde à côté ce qu'il
 * désignait le jour de l'impression : le nom de la station. Quand le réseau
 * renomme son code, on retrouve la station par son nom, qui lui ne bouge pas —
 * une station peut changer trois fois d'identifiant, elle s'appelle toujours
 * « Gares ».
 *
 * La correspondance est exacte, jamais approximative. « Gares » et « Echirolles
 * Gare » existent tous les deux sur la ligne A : un rapprochement « à peu près »
 * enverrait en banlieue quelqu'un qui scanne un QR code en gare de Grenoble.
 * Faute de correspondance certaine, on préfère ne rien ouvrir.
 */

import type { Stop } from '../types';

/** Ce qu'une adresse imprimée désignait, le jour où elle a été imprimée. */
export interface PrintedStop {
  /** Le nom de la station, tel que le réseau l'écrivait alors. */
  name: string;
  /** La commune, qui départage deux stations de même nom. */
  city?: string;
}

/**
 * Les identifiants gravés dans du papier.
 *
 * Une entrée ne se modifie jamais et ne se supprime jamais : elle correspond à
 * des affiches qui existent quelque part et qui, elles, ne seront pas
 * réimprimées. On n'ajoute ici que le jour où l'on imprime quelque chose de
 * nouveau, et l'on y écrit le nom que le réseau donne à la station ce jour-là.
 */
export const PRINTED_STOP_IDS: Record<string, PrintedStop> = {
  // Gare de Grenoble. Le réseau l'appelait « SEM:GARES », puis « SEM:GAR ».
  'SEM:GARES': { name: 'Gares', city: 'Grenoble' },
  // Chavant. « SEM:CHAVANT », puis « SEM:CHV ».
  'SEM:CHAVANT': { name: 'Chavant', city: 'Grenoble' },
};

/** L'identifiant sous la forme que le réseau emploie : préfixé, en capitales. */
export function normalizeStopId(id: string | null | undefined): string | null {
  if (!id) return null;
  const trimmed = id.trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  return /^SEM[:_]/.test(upper) ? upper.replace('SEM_', 'SEM:') : `SEM:${upper}`;
}

/**
 * Un nom de station réduit à ce qui le distingue.
 *
 * Accents, casse, espaces, traits d'union et apostrophes sautent : le réseau
 * écrit tantôt « Notre-Dame Musée », tantôt « Notre Dame-Musée », et ces
 * variations ne désignent pas deux endroits. Ce qui reste doit être identique
 * de part et d'autre, sinon il n'y a pas correspondance.
 */
export function normalizeStopName(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

/**
 * L'arrêt que désigne un identifiant venu d'une adresse.
 *
 * Trois tentatives, dans cet ordre :
 *
 *   1. L'identifiant existe tel quel dans le réseau d'aujourd'hui. C'est le cas
 *      courant, et le seul qui ne coûte rien.
 *   2. C'est un identifiant à nous, gravé sur une affiche : on cherche la
 *      station par le nom qu'on avait noté. Une seule correspondance exacte
 *      vaut réponse ; plusieurs, on départage par la commune.
 *   3. Rien de certain : on ne renvoie rien, et l'appelant ouvre la carte sans
 *      arrêt sélectionné plutôt qu'un mauvais arrêt.
 */
export function resolveStopFromUrlId(
  rawId: string | null | undefined,
  stops: Stop[],
): Stop | undefined {
  const id = normalizeStopId(rawId);
  if (!id || stops.length === 0) return undefined;

  const exact = stops.find(stop => normalizeStopId(stop.id) === id);
  if (exact) return exact;

  const printed = PRINTED_STOP_IDS[id];
  if (!printed) return undefined;

  const wanted = normalizeStopName(printed.name);
  const byName = stops.filter(stop => normalizeStopName(stop.name) === wanted);
  if (byName.length === 1) return byName[0];
  if (byName.length > 1 && printed.city) {
    const wantedCity = normalizeStopName(printed.city);
    const byCity = byName.filter(stop => normalizeStopName(stop.city) === wantedCity);
    if (byCity.length === 1) return byCity[0];
  }
  return undefined;
}

/**
 * L'identifiant à imprimer pour un arrêt.
 *
 * Si cet arrêt a déjà un identifiant à nous, c'est celui-là qu'il faut graver,
 * et non celui du réseau : les deux fonctionnent aujourd'hui, mais un seul
 * fonctionnera encore après le prochain renommage.
 */
export function printableStopId(stop: Stop): string {
  const wanted = normalizeStopName(stop.name);
  const wantedCity = normalizeStopName(stop.city);
  for (const [printedId, printed] of Object.entries(PRINTED_STOP_IDS)) {
    if (normalizeStopName(printed.name) !== wanted) continue;
    if (printed.city && normalizeStopName(printed.city) !== wantedCity) continue;
    return printedId;
  }
  return normalizeStopId(stop.id) ?? stop.id;
}
