import { useEffect, useRef, useState } from 'react';
import { readableTextColor } from './LineBadge';
import { searchCommunes, type AtmoReport, type Commune } from '../services/atmo';

const UNKNOWN_COLOR = '#64748b';

const getText = (language: 'fr' | 'en') => {
  const fr = language === 'fr';
  return {
    title: fr ? 'Indice Atmo air' : 'Air quality index',
    loading: fr ? 'Chargement…' : 'Loading…',
    unavailable: fr ? 'Indice indisponible' : 'Index unavailable',
    unknownCommune: fr ? 'Commune inconnue' : 'Unknown city',
    searchLabel: fr ? 'Changer de commune' : 'Change city',
    searchPlaceholder: fr ? 'Chercher une commune…' : 'Search a city…',
    noMatch: fr ? 'Aucune commune trouvée' : 'No city found',
    forecastFor: (date: string) => (fr ? `Prévision du ${date}` : `Forecast for ${date}`),
  };
};

/** « 2026-08-11 » → « 11/08 ». */
function shortDate(iso: string, language: 'fr' | 'en'): string {
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  return language === 'fr' ? `${parts[2]}/${parts[1]}` : `${parts[1]}/${parts[2]}`;
}

/**
 * Couleur du niveau courant. C'est elle qui habille la carte entière — et le
 * bouton replié : l'indice se lit d'un coup d'œil, avant même d'ouvrir.
 */
export function atmoColor(report: AtmoReport | null): string {
  return report?.current?.couleur_html || report?.definition?.couleur || UNKNOWN_COLOR;
}

/** Pictogramme officiel du niveau courant, s'il est connu. */
export function atmoPicto(report: AtmoReport | null): string | null {
  return report?.definition?.picto_url ?? null;
}

/**
 * Carte « qualité de l'air ».
 *
 * Elle reprend la mécanique des cartes du bandeau (survol pour déplier), mais
 * son fond porte la couleur du niveau ATMO du jour : la couleur *est*
 * l'information, le texte ne fait que la nommer.
 */
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
  /**
   * L'indice suit la commune au centre de la carte : la recherche disparaît.
   *
   * Elle n'aurait aucun effet — le prochain déplacement de carte écraserait le
   * choix. Un champ qu'on remplit pour rien est pire que pas de champ.
   */
  followMap?: boolean;
}) {
  const text = getText(language);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Commune[]>([]);
  const [searching, setSearching] = useState(false);
  const requestRef = useRef(0);

  // Recherche différée : on tape « Saint-Martin-d'Hères » en vingt frappes, pas
  // en vingt requêtes.
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
        // Une réponse en retard ne doit pas écraser une saisie plus récente.
        if (requestRef.current !== ticket) return;
        setResults(communes);
        setSearching(false);
      });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [query]);

  // La commune affichée a changé : la recherche a abouti, on referme la liste.
  useEffect(() => {
    setQuery('');
    setResults([]);
  }, [report?.insee]);

  const color = atmoColor(report);
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
      <p className="mt-1 flex-shrink-0 truncate text-[22px] font-extrabold leading-tight tracking-tight">
        {report?.communeName || (loading ? text.loading : text.unknownCommune)}
      </p>

      {/* Le pictogramme officiel au centre : c'est lui qu'on retrouve sur les
          supports d'Atmo, il vaut mieux qu'une icône maison. */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 py-2">
        {picto ? (
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
          {report?.current?.qualificatif || (loading ? text.loading : text.unavailable)}
        </p>
        {report?.current && (
          <p className="text-center text-[11px]" style={{ color: soft(0.7) }}>
            {text.forecastFor(shortDate(report.current.date_echeance, language))}
            {report.current.polluants_majoritaires?.length
              ? ` · ${report.current.polluants_majoritaires.join(', ')}`
              : ''}
          </p>
        )}
      </div>

      {/* Recherche par nom de commune, avec la même mécanique de suggestions
          que la barre de recherche : on tape « Sassenage », pas « 38474 ». */}
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
                    <span className="tabular flex-shrink-0 text-[11px] text-slate-400">
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
