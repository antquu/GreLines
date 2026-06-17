import { memo, useMemo } from 'react';
import { resolveLineBackgroundColor } from '../utils/lineColors';
import { StarIcon } from '@heroicons/react/24/solid';
import type { Departure } from '../types';
import { formatDepartureTime } from '../services/api';

export interface FavoriteCardProps {
  stopName: string;
  city?: string;
  /** "all" → no filter; string[] → only these line ids. */
  lineFilter: 'all' | string[];
  /** StopDetail-ish: lines + live departures. Null while loading. */
  detail: { lines?: any[]; departures?: Departure[] } | null;
  loading: boolean;
  onOpen: () => void;
  onRemove: () => void;
  language: 'fr' | 'en';
}

function getText(language: 'fr' | 'en') {
  return {
    loading: language === 'fr' ? 'Chargement…' : 'Loading…',
    noDepartures: language === 'fr' ? 'Aucun passage prévu' : 'No upcoming departures',
    direction: language === 'fr' ? 'Direction' : 'To',
    remove: language === 'fr' ? 'Retirer' : 'Remove',
  };
}

/**
 * Visual card for a favourite stop. Shows the stop name + city, a remove-star
 * button, and a per-(line, direction) row with up to 2 next departure times.
 *
 * Same look on mobile (inside HomeSheet) and on desktop (inside the favorites
 * hover panel) — that's why this lives in its own file.
 */
function FavoriteCardComponent({
  stopName,
  city,
  lineFilter,
  detail,
  loading,
  onOpen,
  onRemove,
  language,
}: FavoriteCardProps) {
  const text = getText(language);

  // Group departures by (lineId, destination), keep the next 2 per group,
  // honour the user's line filter. Computed inside the card so callers don't
  // have to know the wire format.
  const grouped = useMemo(() => {
    if (!detail?.departures || !detail.lines) return [];
    const filterAccepts = (lineId: string) =>
      lineFilter === 'all' || lineFilter.includes(lineId);

    type Bucket = {
      lineId: string;
      lineColor: string;
      lineLabel: string;
      destination: string;
      times: number[];
    };
    const map = new Map<string, Bucket>();

    for (const dep of detail.departures) {
      if (!filterAccepts(dep.lineId)) continue;
      if (dep.departureTime < 0) continue;
      const key = `${dep.lineId}|${dep.destination}`;
      if (!map.has(key)) {
        const line = detail.lines.find((l: any) => l.id === dep.lineId);
        const rawColor = line?.color || null;
        const lineColor = resolveLineBackgroundColor(rawColor, dep.lineId);
        map.set(key, {
          lineId: dep.lineId,
          lineColor,
          lineLabel: dep.lineShortName || dep.lineId,
          destination: dep.destination,
          times: [],
        });
      }
      const bucket = map.get(key)!;
      if (bucket.times.length < 2) bucket.times.push(dep.departureTime);
    }

    return Array.from(map.values()).sort((a, b) => {
      const lc = a.lineLabel.localeCompare(b.lineLabel, undefined, { numeric: true });
      if (lc !== 0) return lc;
      return a.destination.localeCompare(b.destination);
    });
  }, [detail, lineFilter]);

  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-700/70 bg-slate-950/95 shadow-[0_24px_60px_rgba(15,23,42,0.35)]">
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
        <div
          role="button"
          tabIndex={0}
          onClick={onOpen}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onOpen();
            }
          }}
          className="flex-1 min-w-0 text-left cursor-pointer"
        >
          <p className="text-base font-semibold text-white truncate">{stopName}</p>
          {city && <p className="text-sm text-slate-400 truncate mt-1">{city}</p>}
        </div>
        <button
          onClick={onRemove}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800/90 text-slate-100 shadow-sm transition hover:bg-slate-700"
          aria-label={text.remove}
        >
          <StarIcon className="w-4 h-4 text-amber-300" />
        </button>
      </div>

      <div className="space-y-3 px-4 pb-4">
        {loading ? (
          <div className="rounded-[24px] bg-slate-900/80 px-3 py-3 text-center text-sm text-slate-400">
            {text.loading}
          </div>
        ) : grouped.length === 0 ? (
          <div className="rounded-[24px] bg-slate-900/80 px-3 py-3 text-center text-sm text-slate-400">
            {text.noDepartures}
          </div>
        ) : (
          grouped.map(g => (
            <div
              key={`${g.lineId}|${g.destination}`}
              className="rounded-[24px] border border-slate-800/80 bg-slate-900/80 p-3 shadow-inner"
            >
              <div className="flex items-start gap-3">
                <span
                  className="flex-shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white"
                  style={{ backgroundColor: g.lineColor }}
                >
                  {g.lineLabel}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    {text.direction}
                  </p>
                  <p className="truncate text-sm font-semibold text-white">
                    {g.destination}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 text-right">
                  {g.times.length === 0 ? (
                    <span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-500">—</span>
                  ) : (
                    g.times.map((t, i) => (
                      <span
                        key={i}
                        className={`rounded-full px-2 py-1 font-mono text-sm font-semibold ${
                          i === 0 ? 'bg-slate-800 text-white' : 'bg-slate-900 text-slate-400'
                        }`}
                      >
                        {formatDepartureTime({ departureTime: t } as Departure, language)}
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export const FavoriteCard = memo(FavoriteCardComponent);
