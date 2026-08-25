import { useEffect, useRef, useState } from 'react';
import type { StopDetail } from '../types';
import { getStopDetail, refreshStopDepartures } from '../services/api';
import type { Favorite } from '../services/favorites';

const REFRESH_MS = 30_000;

export interface FavoriteDetail {
  favorite: Favorite;
  detail: StopDetail | null;
  loading: boolean;
}

export function useFavoriteDetails(favorites: Favorite[], enabled: boolean = true): FavoriteDetail[] {
  const [details, setDetails] = useState<FavoriteDetail[]>(() =>
    favorites.map(fav => ({ favorite: fav, detail: null, loading: true }))
  );

  const detailsRef = useRef<FavoriteDetail[]>(details);
  detailsRef.current = details;

  useEffect(() => {
    if (!enabled) {
      setDetails(favorites.map(fav => ({ favorite: fav, detail: null, loading: false })));
      return;
    }

    let cancelled = false;

    setDetails(favorites.map(fav => ({ favorite: fav, detail: null, loading: true })));

    const loadInitial = async () => {
      if (favorites.length === 0) {
        if (!cancelled) setDetails([]);
        return;
      }

      try {
        const firstDetail = await getStopDetail(favorites[0].stopId);
        if (!cancelled) {
          setDetails(prev =>
            prev.map((entry, idx) =>
              idx === 0 ? { favorite: favorites[0], detail: firstDetail, loading: false } : entry
            )
          );
        }
      } catch {
        if (!cancelled) {
          setDetails(prev =>
            prev.map((entry, idx) =>
              idx === 0 ? { favorite: favorites[0], detail: null, loading: false } : entry
            )
          );
        }
      }

      const rest = await Promise.all(
        favorites.slice(1).map(async fav => {
          try {
            const detail = await getStopDetail(fav.stopId);
            return { favorite: fav, detail, loading: false };
          } catch {
            return { favorite: fav, detail: null, loading: false };
          }
        })
      );

      if (cancelled) return;
      setDetails(current => {
        const next = [...current];
        rest.forEach(entry => {
          const idx = next.findIndex(item => item.favorite.stopId === entry.favorite.stopId);
          if (idx >= 0) next[idx] = entry;
        });
        return next;
      });
    };

    loadInitial();

    const interval = setInterval(async () => {
      const current = detailsRef.current;
      const refreshed = await Promise.all(
        current.map(async entry => {
          if (!entry.detail) return entry;
          try {
            const updated = await refreshStopDepartures(entry.detail);
            return { favorite: entry.favorite, detail: updated, loading: false };
          } catch {
            return entry;
          }
        })
      );
      if (!cancelled) setDetails(refreshed);
    }, REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    
  }, [enabled, favorites.map(f => `${f.stopId}:${f.lines === 'all' ? 'all' : f.lines.join(',')}`).join('|')]);

  return details;
}
