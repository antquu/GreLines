import { COPY, STATUS_URL, type Lang } from './content';

const ASSETS = '/assets/homepage';

type Theme = 'light' | 'dark';
type ThemeChoice = 'auto' | Theme;

function Sun() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" className="h-3.5 w-3.5" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" />
    </svg>
  );
}

function Moon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

function Monitor() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

export function LandingFooter({
  lang,
  theme,
  choice,
  onChoose,
  onPickLang,
  local = false,
}: {
  lang: Lang;
  theme: Theme;
  choice: ThemeChoice;
  onChoose: (next: ThemeChoice) => void;
  onPickLang?: (next: Lang) => void;
  local?: boolean;
}) {
  const copy = COPY[lang];
  const href = (target: string) =>
    !local && target.startsWith('#') ? `/${lang}${target}` : target;

  return (
    <footer className="landing-surface-alt border-t border-[var(--line)]">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-x-8 gap-y-12 sm:grid-cols-3 lg:grid-cols-6">
          {copy.footer.columns.map(column => (
            <div key={column.title}>
              <p className="landing-footer-title">{column.title}</p>
              {column.links.map(link => (
                <a
                  key={link.label}
                  href={href(link.href)}
                  className="landing-footer-link"
                  {...(link.href.startsWith('http')
                    ? { target: '_blank', rel: 'noreferrer' }
                    : {})}
                  onClick={
                    (link.href === '/fr' || link.href === '/en') && onPickLang
                      ? () => onPickLang(link.href.slice(1) as Lang)
                      : undefined
                  }
                >
                  {link.label}
                </a>
              ))}
            </div>
          ))}
        </div>

        <div className="mt-24">
          <img
            src={`${ASSETS}/${theme === 'dark' ? 'logo_light.png' : 'logo.png'}`}
            alt="GreLines"
            className="h-7 w-7 rounded-full"
          />
        </div>

        <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <a href={STATUS_URL} target="_blank" rel="noreferrer" className="landing-status">
              <span className="landing-status-dot" aria-hidden />
              {copy.footer.status}
            </a>
            <span className="landing-body">
              © {new Date().getFullYear()} GreLines · {copy.footerLegal}
            </span>
          </div>

          <div className="landing-theme" role="group" aria-label={copy.footer.theme}>
            <button
              type="button"
              onClick={() => onChoose('auto')}
              aria-pressed={choice === 'auto'}
              aria-label={copy.footer.themeAuto}
              title={copy.footer.themeAuto}
            >
              <Monitor />
            </button>
            <button
              type="button"
              onClick={() => onChoose('light')}
              aria-pressed={choice === 'light'}
              aria-label={copy.footer.themeLight}
              title={copy.footer.themeLight}
            >
              <Sun />
            </button>
            <button
              type="button"
              onClick={() => onChoose('dark')}
              aria-pressed={choice === 'dark'}
              aria-label={copy.footer.themeDark}
              title={copy.footer.themeDark}
            >
              <Moon />
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
