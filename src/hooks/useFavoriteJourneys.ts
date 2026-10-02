import { useEffect, useState } from 'react';
import {
  getFavoriteJourneys,
  subscribeFavoriteJourneys,
  type FavoriteJourney,
} from '../services/favoriteJourneys';

export function useFavoriteJourneys(): FavoriteJourney[] {
  const [journeys, setJourneys] = useState<FavoriteJourney[]>(() => getFavoriteJourneys());

  useEffect(() => subscribeFavoriteJourneys(() => setJourneys(getFavoriteJourneys())), []);

  return journeys;
}
