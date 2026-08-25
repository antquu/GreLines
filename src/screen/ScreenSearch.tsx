import { useEffect, useMemo, useRef, useState } from 'react';
import { MagnifyingGlassIcon, MapPinIcon, ArrowPathIcon } from '@heroicons/react/24/solid';
import type { Line, Stop } from '../types';
import { getActiveNetworks, getCachedStopLines, getStopLines, getStopsByPrefixes } from '../services/api';
import { getTclStops, TCL_NETWORK } from '../services/tclNetwork';
import { ScreenTopBar } from './ScreenTopBar';
import { ScreenLineBadge } from './ScreenLineBadge';
import type { ScreenLayout } from './screenUtils';

const MAX_RESULTS = 8;

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const LAYOUT_OPTIONS: Array<{ id: ScreenLayout; label: string; hint: string }> = [
  { id: 'cards', label: 'Cartes', hint: 'Grands chiffres, lisible de loin' },
  { id: 'rows', label: 'Lignes', hint: 'Tableau dense, tout tient à l\'écran' },
];

export function ScreenSearch({ onSelect }: { onSelect: (stop: Stop, layout: ScreenLayout) => void }) {
  const [stops, setStops] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [linesByStop, setLinesByStop] = useState<Record<string, Line[]>>({});
  const [layout, setLayout] = useState<ScreenLayout>('cards');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const networks = getActiveNetworks();
      const [mtag, tcl] = await Promise.all([
        getStopsByPrefixes(networks).catch(() => [] as Stop[]),
        networks.includes(TCL_NETWORK) ? getTclStops().catch(() => [] as Stop[]) : Promise.resolve([] as Stop[]),
      ]);
      if (!active) return;
      setStops([...mtag, ...tcl]);
      setLoading(false);
      inputRef.current?.focus();
    })();
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
    <div className="gl-screen flex h-dvh w-full flex-col bg-[#eef2f7] text-slate-900">
      <ScreenTopBar />

      <main className="flex min-h-0 flex-1 flex-col items-center justify-center px-4">
        <div className="w-full max-w-3xl">
          <div className="mb-10 flex items-baseline justify-center gap-4">
            {
}
            <img
              src="/assets/GreLinesWordmark.png"
              alt="GreLines"
              className="h-12 w-auto 2xl:h-16"
              style={{ filter: 'brightness(0)' }}
            />
            <span className="text-4xl font-bold leading-none text-slate-900 2xl:text-5xl">Screen</span>
          </div>

          <p className="mb-6 text-center text-lg text-slate-500 2xl:text-xl">
            Choisissez un arrêt : l'écran affichera ses prochains passages, en continu.
          </p>

          <div className="relative">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-5 top-1/2 h-6 w-6 -translate-y-1/2 text-slate-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={event => setQuery(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={loading ? 'Chargement des arrêts…' : 'Rechercher un arrêt…'}
              disabled={loading}
              className="w-full rounded-2xl border border-slate-200 bg-white py-5 pl-14 pr-5 text-xl font-medium text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 disabled:opacity-60"
            />
            {loading && (
              <ArrowPathIcon className="absolute right-5 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-slate-400" />
            )}
          </div>

          {results.length > 0 && (
            <ul className="mt-3 max-h-[45vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              {results.map((stop, index) => (
                <li key={stop.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(stop, layout)}
                    onMouseEnter={() => setHighlight(index)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                      index === highlight ? 'bg-blue-50' : 'bg-transparent'
                    }`}
                  >
                    <MapPinIcon className="h-5 w-5 flex-shrink-0 text-blue-600" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-lg font-semibold text-slate-900">
                        {stop.name}
                      </span>
                      {stop.city && (
                        <span className="block truncate text-sm text-slate-500">{stop.city}</span>
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
              ))}
            </ul>
          )}

          {/* Le choix se fait ici, avant d'ouvrir l'écran : une fois le
              téléviseur en place, plus personne n'a de clavier devant lui. */}
          <div className="mt-6 flex items-center justify-center gap-2">
            {LAYOUT_OPTIONS.map(option => {
              const isActive = layout === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setLayout(option.id)}
                  title={option.hint}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${

                    isActive
                      ? 'border-[#0f172a] bg-[#0f172a] text-white'
                      : 'border-slate-200 bg-white text-slate-500'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          {!loading && query.trim() !== '' && results.length === 0 && (
            <p className="mt-4 text-center text-slate-500">Aucun arrêt ne correspond à cette recherche.</p>
          )}
        </div>
      </main>

    </div>
  );
}
