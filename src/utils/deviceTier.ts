/**
 * Ce que la machine peut encaisser.
 *
 * La carte se dessinait partout à la même finesse : celle qui tenait sur le
 * plus lent des appareils sur lesquels on l'avait essayée. C'est le réglage le
 * plus prudent, et c'est aussi le plus injuste — un ordinateur récent y perd
 * une netteté qu'il rendrait sans effort, et son écran non-Retina, qui compte
 * un pixel là où un Mac en compte quatre, en souffre deux fois.
 *
 * On regarde donc de quoi l'appareil est fait, et l'on choisit en conséquence.
 * Trois indices, tous approximatifs, dont on ne tire qu'un ordre de grandeur :
 *
 *  — le nombre de cœurs (`hardwareConcurrency`), le plus fiable des trois et le
 *    seul que tous les navigateurs donnent ;
 *  — la mémoire annoncée (`deviceMemory`), que seul Chrome renseigne, arrondie
 *    par palier pour ne pas identifier la machine ;
 *  — la densité de l'écran, qui dit combien de pixels il y aura à peindre.
 *
 * Aucun ne mesure la carte graphique, qui est ce qui compte vraiment ici. On
 * s'en accommode : se tromper d'un cran coûte une carte un peu plus lisse ou un
 * peu plus nette, jamais une carte inutilisable.
 */

export type DeviceTier = 'low' | 'medium' | 'high';

/** Ce que le navigateur veut bien dire de la machine. */
function readSpecs(): { cores: number; memory: number | null; dpr: number } {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 0 : 0;
  const memory =
    typeof navigator !== 'undefined'
      ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null
      : null;
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return { cores, memory, dpr };
}

/**
 * Le rang de la machine.
 *
 * Les seuils sont ceux qu'on peut défendre sans mesure : quatre cœurs séparent
 * un appareil d'entrée de gamme d'un appareil courant, huit un appareil
 * courant d'une machine de travail. La mémoire ne sert qu'à rétrograder —
 * quatre gigaoctets annoncés sur huit cœurs, c'est une machine qui swappera
 * avant de saturer son processeur.
 *
 * Sans renseignement du tout — un navigateur qui ne dit rien —, on répond
 * « medium » : le milieu, qui ne gâche ni ne casse.
 */
export function detectDeviceTier(): DeviceTier {
  const { cores, memory } = readSpecs();
  if (!cores) return 'medium';

  if (cores >= 8 && (memory === null || memory >= 8)) return 'high';
  if (cores >= 4 && (memory === null || memory >= 4)) return 'medium';
  return 'low';
}

/**
 * À quelle finesse peindre la carte.
 *
 * MapLibre dessine par défaut à la densité de l'écran. C'est le bon choix sur
 * un téléphone Retina, et un mauvais choix des deux côtés du spectre : sur un
 * écran d'ordinateur ordinaire — un pixel par point —, le texte des rues et les
 * pastilles sortent crénelés alors que la machine pourrait peindre quatre fois
 * plus ; sur un vieux portable à écran fin, elle peine à suivre.
 *
 * On lui donne donc une consigne :
 *
 *  — `high` : au moins deux, quitte à suréchantillonner un écran qui n'en
 *    demande qu'un. C'est là que se gagne la netteté dont parle l'usager.
 *  — `medium` : la densité de l'écran, bornée à deux — au-delà, on peint des
 *    pixels que l'œil ne distingue plus.
 *  — `low` : un et demi au plus. La carte y perd un peu de son piqué et gagne
 *    de quoi rester fluide.
 *
 * Le plafond de trois n'est jamais atteint en pratique ; il est là pour qu'un
 * appareil qui annoncerait une densité aberrante ne demande pas une toile de
 * neuf fois la surface de son écran.
 */
export function mapPixelRatio(tier: DeviceTier = detectDeviceTier()): number {
  const { dpr } = readSpecs();
  if (tier === 'high') return Math.min(Math.max(dpr, 2), 3);
  if (tier === 'medium') return Math.min(dpr, 2);
  return Math.min(dpr, 1.5);
}
