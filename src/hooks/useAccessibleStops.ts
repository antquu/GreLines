/**
 * La liste des arrêts accessibles, mise à disposition d'un composant.
 *
 * Elle ne se charge qu'une fois par session — le service garde ce qu'il a lu —
 * et plusieurs écrans peuvent donc l'appeler sans se soucier des autres.
 */

import { useEffect, useState } from 'react';
import { loadAccessibleStops } from '../services/stopAccessibility';

export function useAccessibleStops(): Set<string> | null {
  const [stops, setStops] = useState<Set<string> | null>(null);

  useEffect(() => {
    let active = true;
    void loadAccessibleStops().then(list => {
      if (active) setStops(list);
    });
    return () => {
      active = false;
    };
  }, []);

  return stops;
}
