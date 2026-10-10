import { useEffect, useMemo, useRef, useState } from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/solid';
import { TbBusStop } from 'react-icons/tb';
import type { Line, Stop } from '../types';
import { getCachedStopLines, getStopLines } from '../services/api';
import { isSncfStopId } from '../services/sncfNetwork';
import { appLanguage } from '../utils/appLanguage';
import { tx } from '../i18n';
import { ScreenTopBar } from './ScreenTopBar';
import { ScreenLineBadge } from './ScreenLineBadge';
import { loadScreenStops } from './screenData';
import type { ScreenLayout } from './screenUtils';

const MAX_RESULTS = 8;

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

export function ScreenSearch({ onSelect }: { onSelect: (stop: Stop, layout: ScreenLayout) => void }) {
  const text = tx(appLanguage() === 'fr').screenBoard;
  const [stops, setStops] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [linesByStop, setLinesByStop] = useState<Record<string, Line[]>>({});
  const [layout, setLayout] = useState<ScreenLayout>('cards');
  const inputRef = useRef<HTMLInputElement>(null);

  const layoutOptions: Array<{ id: ScreenLayout; label: string; hint: string }> = [
    { id: 'cards', label: text.layoutCards, hint: text.layoutCardsHint },
    { id: 'rows', label: text.layoutRows, hint: text.layoutRowsHint },
  ];

  useEffect(() => {
    let active = true;
    void loadScreenStops().then(list => {
      if (!active) return;
      setStops(list);
      setLoading(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    });
    return () => {
      active = false;
    };
  }, []);

  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return [];
    const matches = stops.filter(stop => {
      const name = normalize(stop.name);
      const city = stop.city ? normalize(stop.city) : '';
      return name.includes(q) || city.includes(q) || stop.id.toLowerCase().includes(q);
    });

    const rank = (stop: Stop) => {
      const name = normalize(stop.name);
      if (name === q) return 0;
      if (name.startsWith(q)) return 1;
      return 2;
    };
    matches.sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      if (a.name.length !== b.name.length) return a.name.length - b.name.length;
      return a.name.localeCompare(b.name, 'fr');
    });
    return matches.slice(0, MAX_RESULTS);
  }, [query, stops]);

  useEffect(() => setHighlight(0), [query]);

  useEffect(() => {
    let active = true;
    for (const stop of results) {
      if (linesByStop[stop.id]) continue;
      const cached = getCachedStopLines(stop.id);
      if (cached) {
        setLinesByStop(prev => ({ ...prev, [stop.id]: cached }));
        continue;
      }
      void getStopLines(stop.id).then(lines => {
        if (active) setLinesByStop(prev => ({ ...prev, [stop.id]: lines }));
      });
    }
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight(i => (i + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight(i => (i - 1 + results.length) % results.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      onSelect(results[highlight] ?? results[0], layout);
    }
  };

  return (
    <div className="gl-screen flex h-dvh w-full flex-col bg-white text-black">
      <ScreenTopBar />

      <main className="flex min-h-0 flex-1 flex-col items-center justify-center px-6">
        <div className="w-full max-w-3xl">
          <div className="mb-8 flex items-center justify-center gap-4">
            <img src="/assets/GreLinesWordmark.png" alt="GreLines" className="h-11 w-auto 2xl:h-14" style={{ filter: 'brightness(0)' }} />
            <span className="text-[2.75rem] font-semibold leading-none tracking-tight text-black 2xl:text-[3.5rem]">Screen</span>
          </div>

          <p className="mb-8 text-center text-xl text-neutral-500 2xl:text-2xl">{text.searchHint}</p>

          <div className="relative">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-6 top-1/2 h-6 w-6 -translate-y-1/2 text-neutral-500" />
            <input
              ref={inputRef}
              value={query}
              onChange={event => setQuery(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={loading ? text.loadingStops : text.searchPlaceholder}
              disabled={loading}
              className="w-full rounded-[22px] border border-black/10 bg-[#f5f5f7] py-5 pl-16 pr-6 text-xl font-medium text-black outline-none placeholder:text-neutral-400 focus:border-black/30 disabled:opacity-60"
            />
          </div>

          {results.length > 0 && (
            <ul className="mt-3 max-h-[45vh] overflow-y-auto rounded-[22px] border border-black/10 bg-[#f5f5f7] p-1.5">
              {results.map((stop, index) => {
                const isStation = isSncfStopId(stop.id);
                return (
                  <li key={stop.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(stop, layout)}
                      onMouseEnter={() => setHighlight(index)}
                      className={`flex w-full items-center gap-4 rounded-2xl px-4 py-3 text-left transition-colors ${
                        index === highlight ? 'bg-black/[0.05]' : 'bg-transparent'
                      }`}
                    >
                      {isStation ? (
                        <img src="/assets/sncf-reseau.svg" alt="SNCF" className="h-5 w-6 flex-shrink-0 object-contain" />
                      ) : (
                        <TbBusStop className="h-6 w-6 flex-shrink-0 text-neutral-400" aria-hidden="true" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-lg font-medium text-black">{stop.name}</span>
                        {(isStation || stop.city) && (
                          <span className="block truncate text-sm text-neutral-500">
                            {isStation ? [text.station, stop.city].filter(Boolean).join(' · ') : stop.city}
                          </span>
                        )}
                      </span>
                      <span className="flex flex-shrink-0 items-center gap-1">
                        {(linesByStop[stop.id] ?? []).slice(0, 5).map(line => (
                          <ScreenLineBadge
                            key={line.routeId || line.id}
                            size="sm"
                            lineId={line.routeId || line.id}
                            label={line.shortName || line.id}
                            color={line.color}
                            textColor={line.textColor}
                          />
                        ))}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-8 flex items-center justify-center gap-2">
            {layoutOptions.map(option => {
              const isActive = layout === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setLayout(option.id)}
                  title={option.hint}
                  className={`rounded-full px-5 py-2.5 text-base font-semibold transition-colors ${
                    isActive ? 'bg-black text-white' : 'bg-black/[0.05] text-neutral-500'
                  }`}
                  style={isActive ? { color: '#ffffff' } : undefined}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          {!loading && query.trim() !== '' && results.length === 0 && (
            <p className="mt-6 text-center text-lg text-neutral-500">{text.noMatch}</p>
          )}
        </div>
      </main>
    </div>
  );
}
