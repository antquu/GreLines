import { useEffect, useState } from 'react';
import { loadAccessibleStops, onAccessibleStopsChange } from '../services/stopAccessibility';

export function useAccessibleStops(): Set<string> | null {
  const [stops, setStops] = useState<Set<string> | null>(null);

  useEffect(() => {
    let active = true;
    void loadAccessibleStops().then(list => {
      if (active) setStops(new Set(list));
    });
    const unsubscribe = onAccessibleStopsChange(list => {
      if (active) setStops(list);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return stops;
}
