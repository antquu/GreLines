/**
 * La molette fait défiler une rangée de côté.
 *
 * Une barre de filtres plus large que son cadre se pousse du doigt sur un
 * téléphone. Avec une souris, il n'y a rien à pousser : la molette ne pousse
 * que vers le bas, et les derniers onglets restent hors de vue sans que rien ne
 * dise qu'ils existent.
 *
 * On traduit donc le geste vertical en déplacement horizontal, mais seulement
 * quand la rangée a de quoi défiler et que le geste n'était pas déjà horizontal
 * — un pavé tactile envoie un déplacement latéral quand on glisse deux doigts
 * de côté, et celui-là passe sans qu'on y touche.
 *
 * L'écouteur est posé par un rappel de référence, et non dans un effet monté
 * une fois : le panneau qui porte cette barre apparaît après le premier rendu,
 * et un effet à dépendances vides ne regardait qu'une fois, trop tôt — la
 * molette ne faisait alors rien du tout.
 */

import { useCallback, useRef } from 'react';

export function useWheelScroll<T extends HTMLElement>() {
  const detach = useRef<(() => void) | null>(null);

  return useCallback((node: T | null) => {
    detach.current?.();
    detach.current = null;
    if (!node) return;

    const onWheel = (event: WheelEvent) => {
      // Rien ne dépasse : la rangée n'a pas à intercepter quoi que ce soit.
      if (node.scrollWidth <= node.clientWidth) return;
      // Un geste déjà horizontal se passe de nous.
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;

      const max = node.scrollWidth - node.clientWidth;
      /*
       * On ne rend la molette à la page qu'une fois *arrivé* au bout, jamais
       * parce que le geste le dépasserait.
       *
       * La nuance compte : un cran de molette vaut souvent plus que la distance
       * qui reste, et refuser ces gestes-là interdisait de revenir au premier
       * onglet — on restait coincé à cent vingt pixels du bord.
       */
      const atStart = node.scrollLeft <= 0 && event.deltaY < 0;
      const atEnd = node.scrollLeft >= max && event.deltaY > 0;
      if (atStart || atEnd) return;

      event.preventDefault();
      node.scrollLeft = Math.max(0, Math.min(max, node.scrollLeft + event.deltaY));
    };

    node.addEventListener('wheel', onWheel, { passive: false });
    detach.current = () => node.removeEventListener('wheel', onWheel);
  }, []);
}
