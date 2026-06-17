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

/**
 * For every favorite, fetch the full `StopDetail` (lines + departures) once
 * on mount and then refresh just the departures every 30s. We never refetch
 * the static line list — that doesn't change between sessions and saves a
 * round-trip per favorite per refresh cycle.
 *
 * Returns a per-favorite descriptor preserving the input order so the UI
 * can render placeholders deterministically while data streams in.
 */
export function useFavoriteDetails(favorites: Favorite[], enabled: boolean = true): FavoriteDetail[] {
  const [details, setDetails] = useState<FavoriteDetail[]>(() =>
    favorites.map(fav => ({ favorite: fav, detail: null, loading: true }))
  );

  // Keep a stable ref to the current details for the interval callback to
  // read without re-creating the interval each time `details` updates.
  const detailsRef = useRef<FavoriteDetail[]>(details);
  detailsRef.current = details;

  useEffect(() => {
    if (!enabled) {
      setDetails(favorites.map(fav => ({ favorite: fav, detail: null, loading: false })));
      return;
    }

    let cancelled = false;

    // Reset when favorites change (added/removed/edited).
    setDetails(favorites.map(fav => ({ favorite: fav, detail: null, loading: true })));

    // Initial load — fetch each favorite's full detail in parallel.
    Promise.all(
      favorites.map(async fav => {
        try {
          const detail = await getStopDetail(fav.stopId);
          return { favorite: fav, detail, loading: false };
        } catch (err) {
          void 0 && console.warn(`Failed to load favorite ${fav.stopId}:`, err);
          return { favorite: fav, detail: null, loading: false };
        }
      })
    ).then(loaded => {
      if (cancelled) return;
      setDetails(loaded);
    });

    // Refresh every 30s — only the departures, since lines are static.
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
    // We deliberately re-key on the favorites' identity (ids+lines), not the
    // array reference, so a re-render with the same favorites doesn't reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, favorites.map(f => `${f.stopId}:${f.lines === 'all' ? 'all' : f.lines.join(',')}`).join('|')]);

  return details;
}