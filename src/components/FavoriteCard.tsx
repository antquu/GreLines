import { memo, useMemo } from 'react';
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
  language: 'fr' | 'en';
  theme?: 'light' | 'dark';
}

function getText(language: 'fr' | 'en') {
  return {
    loading: language === 'fr' ? 'Chargement…' : 'Loading…',
    noDepartures: language === 'fr' ? 'Aucun passage prévu' : 'No upcoming departures',
    direction: language === 'fr' ? 'Direction' : 'To',
    next: language === 'fr' ? 'Prochains' : 'Next',
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
  // onRemove removed — favorite removal handled elsewhere
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
            <div className="flex min-w-0 items-baseline gap-2">
              <p className={`truncate text-base font-semibold ${titleClass}`}>
                {stopName}
              </p>

              {city && (
                <p className={`truncate text-sm ${mutedClass}`}>
                  {city}
                </p>
              )}
            </div>
          </div>
          {/* remove button — favorites removal handled elsewhere */}
        </div>

        <div className="px-4 pb-4 pt-3">
        <div className="space-y-2">
          {loading ? (
            <p className={`text-sm ${mutedClass}`}>{text.loading}</p>
          ) : grouped.length === 0 ? (
            <p className={`text-sm ${mutedClass}`}>{text.noDepartures}</p>
          ) : (
            <>

              {grouped.map(group => (
                <div key={`${group.lineId}|${group.destination}`} className="flex items-center gap-2.5">
                  <LineBadge
                    line={{ id: group.lineId, shortName: group.shortName, color: group.color || undefined, textColor: group.textColor || undefined }}
                    size="sm"
                  />
                  <p className={`min-w-0 flex-1 truncate text-sm ${titleClass}`}>{group.destination}</p>
                  <span className={`tabular flex-shrink-0 text-sm font-bold ${titleClass}`}>
                    {group.times[0] != null
                      ? formatDepartureTime({ departureTime: group.times[0] } as Departure, language)
                      : '—'}
                  </span>
                  <span className="tabular w-12 flex-shrink-0 text-right text-sm text-slate-500">
                    {group.times[1] != null
                      ? formatDepartureTime({ departureTime: group.times[1] } as Departure, language)
                      : '—'}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export const FavoriteCard = memo(FavoriteCardComponent);
