/**
 * L'ordre dans lequel les lignes se présentent.
 *
 * Celui du réseau, et non celui de l'alphabet : les tramways d'abord, de A à E,
 * puis les Chrono dans l'ordre de leur numéro, puis les Proximo, puis le reste.
 * C'est l'ordre des plans affichés aux arrêts, donc celui que les gens ont déjà
 * en tête ; « C1 » après « 12 » leur donnerait raison de croire à un bug.
 *
 * La règle vivait en double, recopiée à l'identique dans la fiche d'arrêt de
 * bureau et dans celle du téléphone. Elle vit ici, pour que la carte des
 * perturbations puisse s'en servir sans en faire une troisième copie.
 */

/** Le rang d'une ligne, et la clé qui départage à rang égal. */
export function getLineSortKey(lineShortName?: string | null, lineId?: string): [number, string] {
  const code = (lineShortName || lineId || '').toUpperCase().trim();
  if (code === 'A') return [0, ''];
  if (code === 'B') return [1, ''];
  if (code === 'C') return [2, ''];
  if (code === 'D') return [3, ''];
  if (code === 'E') return [4, ''];
  const cMatch = /^C(\d+)$/.exec(code);
  if (cMatch) {
    const n = parseInt(cMatch[1], 10);
    return n >= 1 && n <= 14 ? [5, n.toString().padStart(3, '0')] : [8, code];
  }
  const nMatch = /^(\d+)$/.exec(code);
  if (nMatch) {
    const n = parseInt(nMatch[1], 10);
    return n >= 15 && n <= 92
      ? [6, n.toString().padStart(3, '0')]
      : [7, n.toString().padStart(3, '0')];
  }
  return [9, code];
}

export function sortLinesByPriority(
  a: { shortName?: string | null; id: string },
  b: { shortName?: string | null; id: string },
): number {
  const [wa, ka] = getLineSortKey(a.shortName, a.id);
  const [wb, kb] = getLineSortKey(b.shortName, b.id);
  if (wa !== wb) return wa - wb;
  return ka.localeCompare(kb, undefined, { numeric: true, sensitivity: 'base' });
}
