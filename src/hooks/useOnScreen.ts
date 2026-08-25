/**
 * L'élément est-il à l'écran.
 *
 * Sert à ne faire un travail coûteux — traduire, charger — que pour ce qu'on
 * regarde réellement. Une fois vu, l'élément reste « vu » : ce qui a été traduit
 * n'a pas à l'être de nouveau parce qu'on a fait défiler la page.
 *
 * Faute d'observateur dans le navigateur, tout est réputé visible : mieux vaut
 * travailler pour rien que de laisser un écran dans une langue qu'on ne lit pas.
 */

import { useEffect, useRef, useState } from 'react';

export function useOnScreen<T extends HTMLElement>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(() => typeof IntersectionObserver !== 'function');

  useEffect(() => {
    if (seen || typeof IntersectionObserver !== 'function') return;
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) setSeen(true);
      },
      { rootMargin: '200px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [seen]);

  return [ref, seen];
}
