import { useEffect, useState } from 'react';
import {
  getFavoriteLines,
  subscribeFavoriteLines,
  type FavoriteLine,
} from '../services/favoriteLines';

export function useFavoriteLines(): FavoriteLine[] {
  const [favoriteLines, setFavoriteLinesState] = useState<FavoriteLine[]>(() => getFavoriteLines());

  useEffect(() => {
    const refresh = () => setFavoriteLinesState(getFavoriteLines());
    const unsub = subscribeFavoriteLines(refresh);
    return unsub;
  }, []);

  return favoriteLines;
}
