import { useEffect, useRef, useState } from 'react';
import { readableTextColor } from './LineBadge';
import { searchCommunes, type AtmoReport, type Commune } from '../services/atmo';
import { IoWifi } from 'react-icons/io5';
import { useIsOffline } from '../hooks/useIsOffline';
import { tx } from '../i18n';

const UNKNOWN_COLOR = '#64748b';

const getText = (language: 'fr' | 'en') => {
  const fr = language === 'fr';
  return {
    title: tx(fr).atmoPanel.airQualityIndex,
    loading: tx(fr).atmoPanel.loading,
    unavailable: tx(fr).atmoPanel.indexUnavailable,
    offline: tx(fr).atmoPanel.noConnection,
    unknownCommune: tx(fr).atmoPanel.unknownCity,
    searchLabel: tx(fr).atmoPanel.changeCity,
    searchPlaceholder: tx(fr).atmoPanel.searchACity,
    noMatch: tx(fr).atmoPanel.noCityFound,
    forecastFor: (date: string) => (tx(fr).atmoPanel.forecastForDate(date)),
  };
};

function shortDate(iso: string, language: 'fr' | 'en'): string {
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  return tx(language === 'fr').atmoPanel.item2Item(parts[2], parts[1]);
}

export function atmoColor(report: AtmoReport | null): string {
  return report?.current?.couleur_html || report?.definition?.couleur || UNKNOWN_COLOR;
}

export function atmoPicto(report: AtmoReport | null): string | null {
  return report?.definition?.picto_url ?? null;
}

export function AtmoPanel({
  report,
  loading,
  onCommuneChange,
  language,
  followMap = false,
}: {
  report: AtmoReport | null;
  loading: boolean;
  onCommuneChange: (commune: Commune) => void;
  language: 'fr' | 'en';
  followMap?: boolean;
}) {
  const text = getText(language);
  const offline = useIsOffline();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Commune[]>([]);
  const [searching, setSearching] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const ticket = ++requestRef.current;
    const timer = window.setTimeout(() => {
      void searchCommunes(term).then(communes => {
        if (requestRef.current !== ticket) return;
        setResults(communes);
        setSearching(false);
      });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setQuery('');
    setResults([]);
  }, [report?.insee]);

  const color = atmoColor(offline ? null : report);
  const picto = atmoPicto(report);
  const foreground = readableTextColor(color);
  const soft = (alpha: number) =>
    foreground === '#000000' ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`;

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden rounded-2xl p-4 shadow-2xl"
      style={{ backgroundColor: color, color: foreground }}
    >
      <p className="signal-label flex-shrink-0" style={{ color: soft(0.65) }}>
        {text.title}
      </p>
      <p className="mt-1 flex-shrink-0 truncate text-[1.375rem] font-extrabold leading-tight tracking-tight">
        {report?.communeName || (loading ? text.loading : text.unknownCommune)}
      </p>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 py-2">
        {offline ? (
          <IoWifi className="h-28 w-28 flex-shrink-0" style={{ color: soft(0.35) }} aria-hidden="true" />
        ) : picto ? (
          <img
            src={picto}
            alt={report?.current?.qualificatif || text.title}
            className="h-28 w-28 flex-shrink-0"
          />
        ) : (
          <div
            className="flex h-28 w-28 flex-shrink-0 items-center justify-center rounded-full text-4xl font-extrabold"
            style={{ backgroundColor: soft(0.15) }}
          >
            ?
          </div>
        )}
        <p className="text-center text-lg font-bold leading-tight">
          {offline ? text.offline : report?.current?.qualificatif || (loading ? text.loading : text.unavailable)}
        </p>
        {!offline && report?.current && (
          <p className="text-center text-[0.6875rem]" style={{ color: soft(0.7) }}>
            {text.forecastFor(shortDate(report.current.date_echeance, language))}
            {report.current.polluants_majoritaires?.length
              ? ` · ${report.current.polluants_majoritaires.join(', ')}`
              : ''}
          </p>
        )}
      </div>

      {!followMap && (
      <div className="relative flex-shrink-0">
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder={text.searchPlaceholder}
          aria-label={text.searchLabel}
          autoComplete="off"
          className="w-full rounded-xl px-3 py-2 text-sm font-semibold outline-none placeholder:font-normal"
          style={{
            backgroundColor: soft(0.15),
            color: foreground,
            border: `1px solid ${soft(0.25)}`,
          }}
        />

        {query.trim().length >= 2 && (
          <ul
            className="absolute bottom-full left-0 z-10 mb-2 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
          >
            {results.length === 0 ? (
              <li className="px-3 py-2.5 text-xs text-slate-400">
                {searching ? text.loading : text.noMatch}
              </li>
            ) : (
              results.map(commune => (
                <li key={commune.code}>
                  <button
                    type="button"
                    onClick={() => onCommuneChange(commune)}
                    className="flex w-full items-baseline justify-between gap-2 px-3 py-2.5 text-left transition hover:bg-slate-800"
                  >
                    <span className="min-w-0 truncate text-sm font-semibold text-white">{commune.nom}</span>
                    <span className="tabular flex-shrink-0 text-[0.6875rem] text-slate-400">
                      {commune.postalCode ?? commune.code}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
      )}
    </div>
  );
}
