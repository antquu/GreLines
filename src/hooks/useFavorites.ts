import { useEffect, useState } from 'react';
import {
  getFavorites,
  subscribeFavorites,
  type Favorite,
} from '../services/favorites';

export function useFavorites(): Favorite[] {
  const [favorites, setFavoritesState] = useState<Favorite[]>(() => getFavorites());

  useEffect(() => {
    const refresh = () => setFavoritesState(getFavorites());
    const unsub = subscribeFavorites(refresh);
    return unsub;
  }, []);

  return favorites;
}