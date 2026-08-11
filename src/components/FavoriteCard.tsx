import { memo, useMemo } from 'react';
import { StarIcon } from '@heroicons/react/24/solid';
import { formatDepartureTime } from '../services/api';
import { LineBadge } from './LineBadge';
import type { Departure } from '../types';

export interface FavoriteCardProps {
  stopName: string;
  city?: string;
  
  lineFilter: 'all' | string[];
  
  detail: { lines?: any[]; departures?: Departure[] } | null;
  loading: boolean;
  onOpen: () => void;
  onRemove: () => void;
  language: 'fr' | 'en';
  theme?: 'light' | 'dark';
}

function getText(language: 'fr' | 'en') {
  return {
    loading: language === 'fr' ? 'Chargement…' : 'Loading…',
    noDepartures: language === 'fr' ? 'Aucun passage prévu' : 'No upcoming departures',
    direction: language === 'fr' ? 'Direction' : 'To',
    first: language === 'fr' ? '1er passage' : '1st departure',
    second: language === 'fr' ? '2e passage' : '2nd departure',
    remove: language === 'fr' ? 'Retirer' : 'Remove',
  };
}

type Group = {
  lineId: string;
  shortName: string;
  color?: string | null;
  textColor?: string | null;
  destination: string;
  times: number[];
};

function FavoriteCardComponent({
  stopName,
  city,
  lineFilter,
  detail,
  loading,
  onOpen,
  onRemove,
  language,
  theme = 'dark',
}: FavoriteCardProps) {
  const text = getText(language);
  const isLight = theme === 'light';
  const cardClass = isLight
    ? 'border-slate-200/80 bg-white shadow-[0_18px_50px_rgba(148,163,184,0.18)]'
    : 'border-slate-800/80 bg-slate-900/85 shadow-[0_18px_50px_rgba(2,6,23,0.35)]';
  const topBorderClass = isLight ? 'border-slate-100' : 'border-slate-800';
  const titleClass = isLight ? 'text-slate-900' : 'text-white';
  const mutedClass = isLight ? 'text-slate-500' : 'text-slate-400';
  const panelClass = isLight
    ? 'border-slate-200 bg-slate-50'
    : 'border-slate-800 bg-slate-950/60';

  const grouped = useMemo(() => {
    if (!detail?.departures || !detail.lines) return [];
    const filterAccepts = (lineId: string) => lineFilter === 'all' || lineFilter.includes(lineId);
    const map = new Map<string, Group>();

    for (const dep of detail.departures) {
      if (!filterAccepts(dep.lineId) || dep.departureTime < 0) continue;
      const key = `${dep.lineId}|${dep.destination}`;
      if (!map.has(key)) {
        const line = detail.lines.find((l: any) => l.id === dep.lineId);
        map.set(key, {
          lineId: dep.lineId,
          shortName: dep.lineShortName || line?.shortName || dep.lineId,
          color: line?.color,
          textColor: line?.textColor,
          destination: dep.destination,
          times: [],
        });
      }
      const bucket = map.get(key)!;
      if (bucket.times.length < 2) bucket.times.push(dep.departureTime);
    }

    return Array.from(map.values()).sort((a, b) => {
      const lc = a.shortName.localeCompare(b.shortName, undefined, { numeric: true });
      if (lc !== 0) return lc;
      return a.destination.localeCompare(b.destination);
    });
  }, [detail, lineFilter]);

  return (
    <div
      data-home-sheet-expand
      className={`overflow-hidden rounded-[30px] border ${cardClass}`}
    >
      <div className={`flex items-start justify-between gap-3 border-b px-4 pt-4 pb-3 ${topBorderClass}`}>
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
          className="min-w-0 flex-1 cursor-pointer text-left"
        >
          <p className={`truncate text-base font-semibold ${titleClass}`}>{stopName}</p>
          {city && <p className={`mt-1 truncate text-sm ${mutedClass}`}>{city}</p>}
        </div>
        <button
          onClick={onRemove}
          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border transition ${
            isLight
              ? 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-rose-50 hover:text-rose-600'
              : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-rose-300'
          }`}
          aria-label={text.remove}
        >
          <StarIcon className="w-4 h-4 text-amber-500" />
        </button>
      </div>

      <div className="space-y-2 px-4 py-4">
        {loading ? (
          <div className={`rounded-[24px] border px-3 py-4 text-center text-sm ${panelClass} ${mutedClass}`}>
            {text.loading}
          </div>
        ) : grouped.length === 0 ? (
          <div className={`rounded-[24px] border px-3 py-4 text-center text-sm ${panelClass} ${mutedClass}`}>
            {text.noDepartures}
          </div>
        ) : (
          grouped.map(group => (
            <div
              key={`${group.lineId}|${group.destination}`}
              className={`rounded-[26px] border px-3 py-3 shadow-[0_8px_18px_rgba(148,163,184,0.08)] ${panelClass}`}
            >
              <div className="flex items-center gap-3">
                <LineBadge
                  line={{ id: group.lineId, shortName: group.shortName, color: group.color || undefined, textColor: group.textColor || undefined }}
                  size="md"
                />

                <div className="min-w-0 flex-1">
                  <p className={`text-[11px] uppercase tracking-[0.18em] ${mutedClass}`}>{text.direction}</p>
                  <p className={`truncate text-sm font-semibold ${titleClass}`}>{group.destination}</p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="text-right">
                    <div className={`text-[10px] uppercase tracking-[0.16em] ${mutedClass}`}>{text.first}</div>
                    <div className={`mt-1 rounded-full px-2.5 py-1 text-sm font-semibold shadow-sm border ${
                      isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-950 border-slate-700 text-white'
                    }`}>
                      {group.times[0] != null
                        ? formatDepartureTime({ departureTime: group.times[0] } as Departure, language)
                        : '—'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-[10px] uppercase tracking-[0.16em] ${mutedClass}`}>{text.second}</div>
                    <div className={`mt-1 rounded-full px-2.5 py-1 text-sm font-semibold shadow-sm border ${
                      isLight ? 'bg-white border-slate-200 text-slate-500' : 'bg-slate-950 border-slate-700 text-slate-300'
                    }`}>
                      {group.times[1] != null
                        ? formatDepartureTime({ departureTime: group.times[1] } as Departure, language)
                        : '—'}
                    </div>
                  </div>
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
