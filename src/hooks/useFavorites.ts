import { useEffect, useState } from 'react';
import {
  getFavorites,
  subscribeFavorites,
  type Favorite,
} from '../services/favorites';

/**
 * React hook that returns the current list of favorites and re-renders
 * automatically when any component mutates them via `setFavoriteAndNotify`
 * or `removeFavoriteAndNotify`. Uses the in-memory subscriber list (not a
 * cross-tab `storage` event) since we only need same-tab consistency.
 */
export function useFavorites(): Favorite[] {
  const [favorites, setFavoritesState] = useState<Favorite[]>(() => getFavorites());

  useEffect(() => {
    const refresh = () => setFavoritesState(getFavorites());
    const unsub = subscribeFavorites(refresh);
    return unsub;
  }, []);

  return favorites;
}