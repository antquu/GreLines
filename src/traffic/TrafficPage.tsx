import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowPathIcon,
  ArrowUpRightIcon,
  CheckCircleIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  MegaphoneIcon,
} from '@heroicons/react/24/solid';
import { LineBadge } from '../components/LineBadge';
import { getActivePopups, type CmsPopup, type CmsPopupLine } from '../services/cms';
import { stripHtml } from '../utils/stripHtml';

const LineMapViewer = lazy(() =>
  import('../components/LineMapViewer').then(module => ({ default: module.LineMapViewer })),
);

function pageLanguage(): 'fr' | 'en' {
  try {
    const saved = localStorage.getItem('greLines_language');
    if (saved === 'en' || saved === 'fr') return saved;
  } catch {
  }
  const tags = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of tags) {
    const base = String(tag ?? '').toLowerCase().split('-')[0];
    if (base === 'fr') return 'fr';
    if (base === 'en') return 'en';
  }
  return 'fr';
}

const LANG = pageLanguage();
const EN = LANG === 'en';
const t = (fr: string, en: string) => (EN ? en : fr);

const EVENTS_URL = 'https://data.mobilites-m.fr/api/dyn/evtTC/json';
const ROUTES_URL = 'https://data.mobilites-m.fr/api/routers/default/index/routes';
const REFRESH_MS = 60_000;

const INK = '#ffffff';
const SOFT = '#a3a3a3';
const FAINT = '#737373';
const TINT = 'rgba(255,255,255,0.06)';
const LINE_SEP = 'rgba(255,255,255,0.08)';

const NETWORKS: Array<{ key: string; label: string; codes: string[] }> = [
  { key: 'tag', label: 'TAG', codes: ['SEM', 'SE2'] },
  { key: 'gsv', label: 'Grésivaudan', codes: ['GSV'] },
  { key: 'tpv', label: 'Pays Voironnais', codes: ['TPV'] },
  { key: 'scolaire', label: t('Scolaire', 'School'), codes: ['SACADO'] },
  { key: 'autres', label: t('Autres', 'Other'), codes: [] },
];

const MRESO_POPUP_NETWORKS = new Set(['SEM', 'SE2', 'GSV', 'TPV', 'BUL', 'FUN', 'TRA', 'MCO', 'SNC', 'C38']);

interface TrafficLine {
  id: string;
  network: string;
  code: string;
}

interface Disruption {
  id: string;
  title: string;
  description: string;
  start: Date | null;
  end: Date | null;
  plan: string | null;
  upcoming: boolean;
  lines: TrafficLine[];
  networkKey: string;
}

interface RouteStyle {
  shortName: string;
  color?: string;
  textColor?: string;
}

function parseFrDate(raw: unknown): Date | null {
  const match = String(raw ?? '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!match) return null;
  const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), Number(match[4] ?? 0), Number(match[5] ?? 0));
  return Number.isNaN(date.getTime()) ? null : date;
}

function networkKeyOf(code: string): string {
  return NETWORKS.find(network => network.codes.includes(code.toUpperCase()))?.key ?? 'autres';
}

function parseLines(raw: unknown): TrafficLine[] {
  const seen = new Set<string>();
  const lines: TrafficLine[] = [];
  for (const part of String(raw ?? '').split(',')) {
    const value = part.trim();
    const at = value.indexOf('_');
    if (at <= 0) continue;
    const network = value.slice(0, at).toUpperCase();
    const code = value.slice(at + 1).trim();
    const id = `${network}:${code}`;
    if (!code || seen.has(id)) continue;
    seen.add(id);
    lines.push({ id, network, code });
  }
  return lines.sort((a, b) => a.code.localeCompare(b.code, 'fr', { numeric: true }));
}

async function fetchDisruptions(): Promise<Disruption[]> {
  const response = await fetch(EVENTS_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = (await response.json()) as Record<string, Record<string, unknown>>;
  const list: Disruption[] = [];
  for (const [key, event] of Object.entries(data ?? {})) {
    if (!event || typeof event !== 'object' || event.visibleTC === false) continue;
    const lines = parseLines(event.listeLigne);
    const title = stripHtml(String(event.titre ?? '')).trim();
    let description = stripHtml(String(event.description ?? '')).trim();
    if (title && description.startsWith(title)) description = description.slice(title.length).trim();
    const start = parseFrDate(event.dateDebut);
    list.push({
      id: key,
      upcoming: start !== null && start.getTime() > Date.now(),
      title: title ? title.charAt(0).toUpperCase() + title.slice(1) : t('Perturbation', 'Disruption'),
      description,
      start,
      end: parseFrDate(event.dateFin),
      plan: typeof event.plan === 'string' && event.plan.startsWith('http') ? event.plan : null,
      lines,
      networkKey: lines[0]
        ? networkKeyOf(lines[0].network)
        : /sacado/i.test(String(event.listeLigne ?? ''))
          ? 'scolaire'
          : 'autres',
    });
  }
  return list.sort((a, b) => {
    const order = (d: Disruption) => NETWORKS.findIndex(network => network.key === d.networkKey);
    return (
      order(a) - order(b) ||
      (a.lines[0]?.code ?? '~').localeCompare(b.lines[0]?.code ?? '~', 'fr', { numeric: true }) ||
      a.title.localeCompare(b.title, 'fr')
    );
  });
}

async function fetchRouteStyles(): Promise<Map<string, RouteStyle>> {
  const response = await fetch(ROUTES_URL);
  if (!response.ok) return new Map();
  const routes = (await response.json()) as Array<{ id?: string; shortName?: string; color?: string; textColor?: string }>;
  const styles = new Map<string, RouteStyle>();
  for (const route of routes) {
    if (!route.id) continue;
    styles.set(route.id.toUpperCase(), {
      shortName: route.shortName || route.id.split(':')[1] || route.id,
      color: route.color ? `#${route.color.replace('#', '')}` : undefined,
      textColor: route.textColor ? `#${route.textColor.replace('#', '')}` : undefined,
    });
  }
  return styles;
}

const dateFormat = new Intl.DateTimeFormat(EN ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long' });
const timeFormat = new Intl.DateTimeFormat(EN ? 'en-GB' : 'fr-FR', { hour: '2-digit', minute: '2-digit' });

function periodLabel(start: Date | null, end: Date | null): string {
  const now = Date.now();
  const at = (date: Date) => {
    const time = timeFormat.format(date);
    return time === '00:00' ? dateFormat.format(date) : `${dateFormat.format(date)} ${t('à', 'at')} ${time}`;
  };
  const openEnded = !end || end.getFullYear() - new Date().getFullYear() > 3;
  if (openEnded) {
    if (start && start.getTime() > now) return t(`À partir du ${at(start)}`, `From ${at(start)}`);
    return start ? t(`Depuis le ${at(start)}, jusqu’à nouvel ordre`, `Since ${at(start)}, until further notice`) : t('Jusqu’à nouvel ordre', 'Until further notice');
  }
  if (start && start.getTime() > now) return t(`Du ${at(start)} au ${at(end)}`, `From ${at(start)} to ${at(end)}`);
  return t(`Jusqu’au ${at(end)}`, `Until ${at(end)}`);
}

function DisruptionCard({
  disruption,
  styles,
  onOpenPlan,
}: {
  disruption: Disruption;
  styles: Map<string, RouteStyle>;
  onOpenPlan: (url: string, title: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const long = disruption.description.length > 220;
  const upcoming = disruption.upcoming;
  return (
    <article className="rounded-3xl p-5" style={{ backgroundColor: TINT }}>
      {disruption.lines.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {disruption.lines.map(line => {
            const style = styles.get(line.id);
            return (
              <LineBadge
                key={line.id}
                line={{ id: line.id, routeId: line.id, shortName: style?.shortName ?? line.code, color: style?.color, textColor: style?.textColor }}
                size="sm"
              />
            );
          })}
        </div>
      )}
      <p className="text-[1.1875rem] font-medium leading-snug" style={{ color: INK }}>
        {disruption.title}
      </p>
      {disruption.description && (
        <>
          <p
            className={`whitespace-pre-line pt-2 text-[1rem] leading-snug ${open || !long ? '' : 'line-clamp-4'}`}
            style={{ color: SOFT }}
          >
            {disruption.description}
          </p>
          {long && (
            <button
              type="button"
              onClick={() => setOpen(value => !value)}
              className="pt-2 text-[0.875rem] font-semibold underline underline-offset-4"
              style={{ color: INK }}
            >
              {open ? t('Réduire', 'Show less') : t('Lire la suite', 'Read more')}
            </button>
          )}
        </>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-[0.8125rem]" style={{ color: upcoming ? '#fbbf24' : FAINT }}>
          {upcoming && <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[0.6875rem] font-semibold text-amber-400">{t('À venir', 'Upcoming')}</span>}
          {periodLabel(disruption.start, disruption.end)}
        </p>
        {disruption.plan && (
          <button
            type="button"
            onClick={() => onOpenPlan(disruption.plan!, disruption.title)}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.8125rem] font-semibold transition active:scale-95"
            style={{ backgroundColor: INK, color: '#000000' }}
          >
            <DocumentTextIcon className="h-4 w-4" aria-hidden="true" />
            {t('Plan de déviation', 'Diversion map')}
          </button>
        )}
      </div>
    </article>
  );
}

const GROUP_SHOWN = 4;
const TOOLTIP_WIDTH = 288;

function LineTrafficTooltip({
  line,
  disruptions,
  x,
  y,
}: {
  line: CmsPopupLine;
  disruptions: Disruption[];
  x: number;
  y: number;
}) {
  const first = disruptions[0];
  const left = Math.max(8, Math.min(x + 14, window.innerWidth - TOOLTIP_WIDTH - 8));
  const top = Math.min(y + 16, window.innerHeight - 170);
  return createPortal(
    <div
      className="pointer-events-none fixed z-50 rounded-xl border p-3 text-xs shadow-xl"
      style={{ left, top, width: TOOLTIP_WIDTH, backgroundColor: '#141414', borderColor: 'rgba(255,255,255,0.1)' }}
    >
      {first ? (
        <>
          <p className="mb-1 font-semibold text-amber-400">
            {t('Trafic perturbé · ligne', 'Disrupted · line')} {line.short}
            {disruptions.length > 1 && <span className="font-normal text-amber-400/70"> · {disruptions.length} {t('infos', 'alerts')}</span>}
          </p>
          <p style={{ color: INK }}>{first.title}</p>
          {first.description && (
            <p className="mt-1 line-clamp-5 whitespace-pre-line" style={{ color: SOFT }}>
              {first.description}
            </p>
          )}
          <p className="mt-1.5" style={{ color: FAINT }}>{periodLabel(first.start, first.end)}</p>
        </>
      ) : (
        <p className="flex items-center gap-1.5 font-semibold text-emerald-400">
          <CheckCircleIcon className="h-4 w-4" aria-hidden="true" />
          {t(`Ligne ${line.short} : aucune perturbation signalée`, `Line ${line.short}: no disruption reported`)}
        </p>
      )}
    </div>,
    document.body,
  );
}

function GroupedLineBadges({
  lines,
  open,
  onOpen,
  trafficFor,
}: {
  lines: CmsPopupLine[];
  open: boolean;
  onOpen: () => void;
  trafficFor: (lineId: string) => Disruption[];
}) {
  const [hovered, setHovered] = useState<{ line: CmsPopupLine; x: number; y: number } | null>(null);
  const extra = Math.max(0, lines.length - GROUP_SHOWN);
  const ease = 'cubic-bezier(0.32, 0.72, 0, 1)';

  return (
    <>
      {lines.map((line, index) => {
        const hidden = !open && index >= GROUP_SHOWN;
        const lastShown = index === Math.min(lines.length, GROUP_SHOWN) - 1;
        return (
          <span
            key={line.id}
            className="relative inline-block align-middle"
            onMouseEnter={() => !open && onOpen()}
            onMouseMove={event => open && setHovered({ line, x: event.clientX, y: event.clientY })}
            onMouseLeave={() => setHovered(null)}
            style={{
              marginLeft: index === 0 ? 12 : !open && !hidden ? -12 : 0,
              marginRight: open ? 6 : 0,
              maxWidth: hidden ? 0 : 80,
              opacity: hidden ? 0 : 1,
              transform: `translateY(-4px) scale(${hidden ? 0.6 : 1})`,
              zIndex: open ? 'auto' : GROUP_SHOWN - index,
              filter: open || hidden || (lastShown && extra === 0) ? 'none' : 'drop-shadow(3px 0 0 #0b0b0b)',
              transition: `margin 420ms ${ease}, max-width 420ms ${ease}, opacity 260ms ease, transform 420ms ${ease}`,
              transitionDelay: open ? `${Math.min(index, 40) * 12}ms` : '0ms',
            }}
          >
            <LineBadge line={{ id: line.id, shortName: line.short, color: line.color, textColor: line.textColor }} size="sm" />
          </span>
        );
      })}
      {extra > 0 && (
        <span
          className="relative inline-flex h-9 items-center justify-center overflow-hidden rounded-full align-middle text-[0.8125rem] font-bold"
          onMouseEnter={() => !open && onOpen()}
          style={{
            marginLeft: open ? 0 : -10,
            maxWidth: open ? 0 : 60,
            minWidth: open ? 0 : 36,
            padding: open ? 0 : '0 10px',
            opacity: open ? 0 : 1,
            transform: 'translateY(-4px)',
            backgroundColor: '#262626',
            color: '#f5f5f5',
            transition: `all 320ms ${ease}`,
          }}
        >
          +{extra}
        </span>
      )}
      {open && hovered && (
        <LineTrafficTooltip line={hovered.line} disruptions={trafficFor(hovered.line.id)} x={hovered.x} y={hovered.y} />
      )}
    </>
  );
}

function PopupHeader({ popup, trafficFor }: { popup: CmsPopup; trafficFor: (lineId: string) => Disruption[] }) {
  const Icon = popup.type === 'promo' ? MegaphoneIcon : ExclamationTriangleIcon;
  const lines = popup.target_lines ?? [];
  const [linesOpen, setLinesOpen] = useState(false);
  return (
    <header className="pb-10">
      {popup.image_url && (
        <img src={popup.image_url} alt="" className="mb-8 h-48 w-full rounded-3xl object-cover" />
      )}
      <Icon className="h-14 w-14" style={{ color: INK }} aria-hidden="true" />
      <h1
        className="pt-8 text-[2.125rem] font-medium leading-[1.1] sm:text-[2.625rem]"
        style={{ color: INK }}
        onMouseLeave={() => setLinesOpen(false)}
      >
        {popup.title}
        {lines.length > 0 && (
          <span className="hidden lg:inline">
            <GroupedLineBadges lines={lines} open={linesOpen} onOpen={() => setLinesOpen(true)} trafficFor={trafficFor} />
          </span>
        )}
      </h1>
      {lines.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-4 lg:hidden">
          {lines.map(line => (
            <LineBadge key={line.id} line={{ id: line.id, shortName: line.short, color: line.color, textColor: line.textColor }} size="sm" />
          ))}
        </div>
      )}
      {popup.message && (
        <p className="whitespace-pre-line pt-4 text-[1.1875rem] leading-snug" style={{ color: SOFT }}>
          {popup.message}
        </p>
      )}
      {popup.link_url && (
        <a
          href={popup.link_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex items-center gap-1.5 text-[1rem] font-semibold underline underline-offset-4"
          style={{ color: INK }}
        >
          {t('En savoir plus', 'Learn more')}
          <ArrowUpRightIcon className="h-4 w-4" aria-hidden="true" />
        </a>
      )}
    </header>
  );
}

export function TrafficPage() {
  const [disruptions, setDisruptions] = useState<Disruption[] | null>(null);
  const [styles, setStyles] = useState<Map<string, RouteStyle>>(new Map());
  const [popup, setPopup] = useState<CmsPopup | null>(null);
  const [error, setError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [plan, setPlan] = useState<{ url: string; title: string } | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [isMobile] = useState(() => window.innerWidth < 1024);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDisruptions(await fetchDisruptions());
      setError(false);
      setUpdatedAt(new Date());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = t('Info trafic M réso · GreLines', 'M réso traffic info · GreLines');
    document.documentElement.lang = LANG;
    document.documentElement.style.backgroundColor = '#0b0b0b';
    document.body.style.backgroundColor = '#0b0b0b';
    void Promise.resolve().then(load);
    void fetchRouteStyles().then(setStyles).catch(() => undefined);
    void getActivePopups().then(popups => {
      setPopup(popups.find(item => !item.target_network || MRESO_POPUP_NETWORKS.has(item.target_network)) ?? null);
    });
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const counts = useMemo(() => {
    const result = new Map<string, number>();
    for (const disruption of disruptions ?? []) result.set(disruption.networkKey, (result.get(disruption.networkKey) ?? 0) + 1);
    return result;
  }, [disruptions]);

  const groups = useMemo(
    () =>
      NETWORKS.filter(network => filter === 'all' || filter === network.key)
        .map(network => ({ ...network, items: (disruptions ?? []).filter(d => d.networkKey === network.key) }))
        .filter(group => group.items.length > 0),
    [disruptions, filter],
  );

  const total = disruptions?.length ?? 0;

  const trafficFor = useCallback(
    (lineId: string) => {
      const [network, code] = lineId.toUpperCase().split(':');
      const tag = network === 'SEM' || network === 'SE2';
      return (disruptions ?? []).filter(d =>
        d.lines.some(l => l.id.toUpperCase() === lineId.toUpperCase() || (tag && l.code.toUpperCase() === code && (l.network === 'SEM' || l.network === 'SE2'))),
      );
    },
    [disruptions],
  );

  return (
    <div className="min-h-screen font-sans antialiased" style={{ backgroundColor: '#0b0b0b', color: INK }}>
      <div className="mx-auto w-full max-w-2xl px-6 pb-16 pt-[calc(env(safe-area-inset-top)+28px)]">
        <nav className="mb-12 flex items-center justify-between">
          <a href="/app" aria-label="GreLines">
            <img src="/assets/homepage/logo_light.png" alt="GreLines" className="h-10 w-10 rounded-full" />
          </a>
          <a
            href="/app"
            className="rounded-full px-4 py-2 text-[0.875rem] font-semibold transition active:scale-95"
            style={{ backgroundColor: INK, color: '#000000' }}
          >
            {t('Ouvrir l’application', 'Open the app')}
          </a>
        </nav>

        {popup && <PopupHeader popup={popup} trafficFor={trafficFor} />}

        <section>
          {!popup && (
            <ExclamationTriangleIcon className="h-14 w-14" style={{ color: INK }} aria-hidden="true" />
          )}
          {popup ? (
            <h2 className="pt-2 text-[1.625rem] font-medium leading-tight" style={{ color: INK }}>
              {t('Info trafic', 'Traffic info')}
            </h2>
          ) : (
            <h1 className="pt-8 text-[2.125rem] font-medium leading-[1.1] sm:text-[2.625rem]" style={{ color: INK }}>
              {t('Info trafic', 'Traffic info')}
            </h1>
          )}
          <p className="flex flex-wrap items-center gap-x-2 pt-3 text-[1.0625rem]" style={{ color: SOFT }}>
            <span>
              {t('M réso, Grenoble et alentours', 'M réso, Grenoble area')}
              {disruptions && ` · ${total} ${t('perturbation', 'disruption')}${total > 1 ? 's' : ''}`}
            </span>
          </p>
          <div className="flex items-center gap-2 pt-2 text-[0.8125rem]" style={{ color: FAINT }}>
            {updatedAt && <span>{t('Mis à jour à', 'Updated at')} {timeFormat.format(updatedAt)}</span>}
            <button
              type="button"
              onClick={() => void load()}
              aria-label={t('Actualiser', 'Refresh')}
              className="rounded-full p-1 transition active:scale-90"
              style={{ color: FAINT }}
            >
              <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {disruptions && total > 0 && (
            <div className="flex flex-wrap gap-2 pt-6">
              {[{ key: 'all', label: t('Tout', 'All'), count: total }, ...NETWORKS.map(n => ({ key: n.key, label: n.label, count: counts.get(n.key) ?? 0 }))]
                .filter(chip => chip.count > 0)
                .map(chip => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => setFilter(chip.key)}
                    className="rounded-full px-4 py-2 text-[0.875rem] font-semibold transition active:scale-95"
                    style={filter === chip.key ? { backgroundColor: INK, color: '#000000' } : { backgroundColor: TINT, color: SOFT }}
                  >
                    {chip.label} <span className="opacity-60">{chip.count}</span>
                  </button>
                ))}
            </div>
          )}
        </section>

        <main className="pt-8">
          {!disruptions && !error && (
            <div className="space-y-3">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-32 animate-pulse rounded-3xl" style={{ backgroundColor: TINT }} />
              ))}
            </div>
          )}

          {error && !disruptions && (
            <div className="rounded-3xl p-6" style={{ backgroundColor: TINT }}>
              <p className="text-[1.1875rem] font-medium" style={{ color: INK }}>{t('Info trafic indisponible', 'Traffic info unavailable')}</p>
              <p className="pt-2 text-[1rem]" style={{ color: SOFT }}>
                {t('Le service de Mobilités M ne répond pas. Réessayez dans un instant.', 'The Mobilités M service is not responding. Try again in a moment.')}
              </p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-6 w-full rounded-2xl py-4 text-[1.0625rem] font-semibold transition active:scale-[0.98]"
                style={{ backgroundColor: INK, color: '#000000' }}
              >
                {t('Réessayer', 'Try again')}
              </button>
            </div>
          )}

          {disruptions && total === 0 && (
            <div className="rounded-3xl p-6" style={{ backgroundColor: TINT }}>
              <CheckCircleIcon className="h-10 w-10 text-emerald-400" aria-hidden="true" />
              <p className="pt-4 text-[1.1875rem] font-medium" style={{ color: INK }}>{t('Aucune perturbation', 'No disruption')}</p>
              <p className="pt-2 text-[1rem]" style={{ color: SOFT }}>{t('Tout le réseau M réso circule normalement.', 'The whole M réso network is running normally.')}</p>
            </div>
          )}

          {groups.map(group => (
            <section key={group.key} className="pb-8">
              <h3
                className="mb-3 flex items-center justify-between border-b pb-2 text-[0.8125rem] font-semibold uppercase tracking-wide"
                style={{ color: FAINT, borderColor: LINE_SEP }}
              >
                {group.label}
                <span>{group.items.length}</span>
              </h3>
              <div className="space-y-3">
                {group.items.map(disruption => (
                  <DisruptionCard
                    key={disruption.id}
                    disruption={disruption}
                    styles={styles}
                    onOpenPlan={(url, title) => {
                      setPlan({ url, title });
                      setPlanOpen(true);
                    }}
                  />
                ))}
              </div>
            </section>
          ))}
        </main>

        <footer className="border-t pt-6 text-[0.8125rem] leading-relaxed" style={{ color: FAINT, borderColor: LINE_SEP }}>
          {t(
            'Informations publiées par Mobilités M, actualisées chaque minute. GreLines est un projet indépendant : en cas de doute, vérifiez auprès de l’exploitant.',
            'Information published by Mobilités M, refreshed every minute. GreLines is an independent project: if in doubt, check with the operator.',
          )}
        </footer>
      </div>

      {plan && (
        <Suspense fallback={null}>
          <LineMapViewer
            isOpen={planOpen}
            onClose={() => setPlanOpen(false)}
            routeId={null}
            pdfSource={plan.url}
            title={plan.title}
            lineColor="#fbbf24"
            isMobile={isMobile}
            language={LANG}
          />
        </Suspense>
      )}
    </div>
  );
}
