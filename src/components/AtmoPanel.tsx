import { useEffect, useState } from 'react';
import { readableTextColor } from './LineBadge';
import { isValidPostalCode, type AtmoReport } from '../services/atmo';

const UNKNOWN_COLOR = '#64748b';

const getText = (language: 'fr' | 'en') => {
  const fr = language === 'fr';
  return {
    title: fr ? 'Indice Atmo air' : 'Air quality index',
    loading: fr ? 'Chargement…' : 'Loading…',
    unavailable: fr ? 'Indice indisponible' : 'Index unavailable',
    unknownCommune: fr ? 'Commune inconnue' : 'Unknown city',
    inseeLabel: fr ? 'Changer de commune' : 'Change city',
    inseePlaceholder: fr ? 'Code postal (ex. 38000)' : 'Postal code (e.g. 38000)',
    inseeInvalid: fr ? 'Code postal à 5 chiffres' : '5-digit postal code',
    apply: fr ? 'OK' : 'OK',
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
  postalCode,
  onPostalCodeChange,
  language,
}: {
  report: AtmoReport | null;
  loading: boolean;
  postalCode: string;
  onPostalCodeChange: (postalCode: string) => void;
  language: 'fr' | 'en';
}) {
  const text = getText(language);
  const [draft, setDraft] = useState(postalCode);
  const [invalid, setInvalid] = useState(false);

  // Le champ suit le code réellement appliqué : si la commune change ailleurs,
  // l'input ne doit pas rester sur une saisie abandonnée.
  useEffect(() => {
    setDraft(postalCode);
    setInvalid(false);
  }, [postalCode]);

  const color = atmoColor(report);
  const picto = atmoPicto(report);
  const foreground = readableTextColor(color);
  const soft = (alpha: number) =>
    foreground === '#000000' ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`;

  const submit = () => {
    const value = draft.trim();
    if (!isValidPostalCode(value)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onPostalCodeChange(value);
  };

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

      {/* On saisit un code postal — celui qu'on connaît — et le service le
          traduit en code INSEE, seule clé que l'API ATMO accepte. */}
      <form
        className="flex flex-shrink-0 items-center gap-2"
        onSubmit={event => {
          event.preventDefault();
          submit();
        }}
      >
        <input
          value={draft}
          onChange={event => { setDraft(event.target.value); setInvalid(false); }}
          placeholder={text.inseePlaceholder}
          aria-label={text.inseeLabel}
          maxLength={5}
          inputMode="numeric"
          className="min-w-0 flex-1 rounded-xl px-3 py-2 text-sm font-semibold outline-none placeholder:font-normal"
          style={{
            backgroundColor: soft(0.15),
            color: foreground,
            border: `1px solid ${invalid ? '#b91c1c' : soft(0.25)}`,
          }}
        />
        <button
          type="submit"
          className="flex-shrink-0 rounded-xl px-3 py-2 text-sm font-bold transition"
          style={{ backgroundColor: soft(0.2), color: foreground }}
        >
          {text.apply}
        </button>
      </form>
      {invalid && (
        <p className="mt-1 flex-shrink-0 text-[11px]" style={{ color: soft(0.75) }}>
          {text.inseeInvalid}
        </p>
      )}
    </div>
  );
}
