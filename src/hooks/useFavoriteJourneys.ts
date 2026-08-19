import { useEffect, useState } from 'react';
import {
  getFavoriteJourneys,
  subscribeFavoriteJourneys,
  type FavoriteJourney,
} from '../services/favoriteJourneys';

/** Les trajets favoris, tenus à jour au fil des ajouts et des retraits. */
export function useFavoriteJourneys(): FavoriteJourney[] {
  const [journeys, setJourneys] = useState<FavoriteJourney[]>(() => getFavoriteJourneys());

  useEffect(() => subscribeFavoriteJourneys(() => setJourneys(getFavoriteJourneys())), []);

  return journeys;
}
