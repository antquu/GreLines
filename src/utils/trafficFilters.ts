/**
 * Les onglets de l'infotrafic, partagés par le panneau de bureau et la feuille
 * du téléphone.
 *
 * Ils vivaient en double, et le second n'a pas suivi le premier : les
 * perturbations du Grésivaudan, du Pays Voironnais et des Cars Région ont
 * réapparu sur téléphone mais pas sur ordinateur. Une seule table, désormais.
 *
 * Le classement suit deux logiques qui n'en font qu'une : les lignes de la
 * Métropole se rangent par famille — c'est ainsi qu'on les nomme, un tram, une
 * Chrono, une Proximo —, et tout le reste se range par réseau, parce qu'un
 * voyageur du Voironnais pense à son réseau avant de penser au type de son bus.
 */

import type { AllLinesLine } from '../services/allLines';

/** Les familles de la Métropole, dans l'ordre où on les lit. */
export type MetroFamily = 'tram' | 'chrono' | 'proximo' | 'flexo';

/** Les réseaux qui deviennent chacun un onglet, s'ils ont des perturbations. */
export const NETWORK_FILTERS: Array<{ code: string; label: string }> = [
  { code: 'GSV', label: 'Grésivaudan' },
  { code: 'TPV', label: 'Pays Voironnais' },
  { code: 'BUL', label: 'Bulles' },
  { code: 'C38', label: 'Cars Région' },
  { code: 'SNC', label: 'TER' },
  { code: 'MCO', label: "M'Covoit" },
  { code: 'TRA', label: 'Transaltitude' },
  { code: 'FUN', label: 'Funiculaire' },
];

/**
 * La famille d'une ligne de la Métropole.
 *
 * Rend `null` pour ce qui n'en relève pas : cette ligne-là se rangera sous son
 * réseau.
 */
export function getMetroFamily(line: string): MetroFamily | null {
  const n = line.trim().toUpperCase();
  if (['A', 'B', 'C', 'D', 'E'].includes(n)) return 'tram';
  if (/^C\d+$/.test(n)) {
    const num = Number(n.substring(1));
    return num >= 1 && num <= 14 ? 'chrono' : null;
  }
  const asNum = Number(n);
  if (!isNaN(asNum)) {
    if (asNum >= 11 && asNum <= 29) return 'proximo';
    if (asNum >= 30 && asNum <= 99) return 'flexo';
  }
  return null;
}

/**
 * La catégorie d'une ligne : sa famille dans la Métropole, ou son réseau.
 *
 * `other` ne doit jamais servir à écarter une ligne de la liste — c'est
 * exactement ce que faisait l'ancien code, et des réseaux entiers de
 * perturbations n'apparaissaient nulle part, y compris sous « Tout ».
 */
export function trafficCategory(
  line: string,
  lineLookup?: Map<string, AllLinesLine> | null,
): string {
  const family = getMetroFamily(line);
  if (family) return family;
  const full = lineLookup?.get(line.toUpperCase().trim())?.id ?? '';
  const network = full.slice(0, 3).toUpperCase();
  return NETWORK_FILTERS.some(entry => entry.code === network) ? network : 'other';
}

/** Le rang d'une catégorie, pour trier la liste des perturbations. */
export function categoryRank(category: string): number {
  const rank: Record<string, number> = { tram: 0, chrono: 1, proximo: 2, flexo: 3 };
  return rank[category] ?? 90;
}

/**
 * Les onglets à afficher.
 *
 * Les quatre familles de la Métropole toujours ; un réseau seulement s'il a
 * quelque chose à montrer. Une rangée de filtres dont la moitié ne renvoie rien
 * fait douter que l'écran fonctionne.
 */
export function trafficFilters(
  present: Set<string>,
  language: 'fr' | 'en',
): Array<{ key: string; label: string }> {
  const isFr = language === 'fr';
  return [
    { key: 'all', label: isFr ? 'Tout' : 'All' },
    { key: 'tram', label: isFr ? 'Trams' : 'Trams' },
    { key: 'chrono', label: 'Chrono' },
    { key: 'proximo', label: 'Proximo' },
    { key: 'flexo', label: 'Flexo' },
    ...NETWORK_FILTERS.filter(entry => present.has(entry.code)).map(entry => ({
      key: entry.code,
      label: entry.label,
    })),
  ];
}
