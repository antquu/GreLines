const api = () => import('../../services/api');
import type { Departure, Stop } from '../../types';

export const COLS = 46;
export const ROWS = 17;
const REFRESH_MS = 30_000;
const MAX_RESULTS = 60;

type Copy = {
  prompt: string;
  searching: string;
  noStop: string;
  loading: string;
  noDeparture: string;
  line: string;
  destination: string;
  first: string;
  second: string;
  searchHint: string;
  boardHint: string;
};

const COPY: Record<'fr' | 'en', Copy> = {
  fr: {
    prompt: 'Tapez le nom d’un arrêt.',
    searching: 'Recherche...',
    noStop: 'Aucun arrêt trouvé.',
    loading: 'Chargement des passages...',
    noDeparture: 'Aucun passage pour le moment.',
    line: 'Ligne',
    destination: 'Destination',
    first: '1er',
    second: '2e',
    searchHint: 'Molette : choisir   Entrée : ouvrir',
    boardHint: 'Échap : nouvelle recherche',
  },
  en: {
    prompt: 'Type the name of a stop.',
    searching: 'Searching...',
    noStop: 'No stop found.',
    loading: 'Loading departures...',
    noDeparture: 'No departure right now.',
    line: 'Line',
    destination: 'Destination',
    first: '1st',
    second: '2nd',
    searchHint: 'Wheel: pick   Enter: open',
    boardHint: 'Esc: new search',
  },
};

type Row = { line: string; destination: string; first?: Departure; second?: Departure };

const fit = (text: string, width: number) =>
  text.length > width ? `${text.slice(0, width - 1)}…` : text.padEnd(width);

const center = (text: string, width: number) => {
  const cut = fit(text, width).trimEnd();
  const left = Math.floor((width - cut.length) / 2);
  return ' '.repeat(left) + cut.padEnd(width - left);
};

const clock = (date = new Date()) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

function groupRows(departures: Departure[]): Row[] {
  const rows = new Map<string, Row>();
  for (const departure of [...departures].sort((a, b) => a.departureTime - b.departureTime)) {
    if (departure.cancelled || departure.departureTime < 0) continue;
    const line = departure.lineShortName || departure.lineName || departure.lineId;
    const key = `${line}|${departure.destination}`;
    const row = rows.get(key);
    if (!row) rows.set(key, { line, destination: departure.destination, first: departure });
    else if (!row.second) row.second = departure;
  }
  return [...rows.values()];
}

export class CmdTerminal {
  private copy: Copy;
  private mode: 'search' | 'board' = 'search';
  private query = '';
  private results: Stop[] = [];
  private searching = false;
  private selected = 0;
  private stop: Stop | null = null;
  private rows: Row[] | null = null;
  private scroll = 0;
  private searchId = 0;
  private refreshTimer = 0;
  onChange: () => void = () => {};

  constructor(language: 'fr' | 'en') {
    this.copy = COPY[language];
  }

  dispose() {
    window.clearInterval(this.refreshTimer);
  }

  type(char: string) {
    if (this.mode !== 'search' || this.query.length >= 30) return;
    this.query += char;
    this.runSearch();
  }

  erase() {
    if (this.mode !== 'search' || !this.query) return;
    this.query = this.query.slice(0, -1);
    this.runSearch();
  }

  move(step: number) {
    if (this.mode === 'search') {
      if (!this.results.length) return;
      this.selected = Math.min(this.results.length - 1, Math.max(0, this.selected + step));
    } else {
      const max = Math.max(0, (this.rows?.length ?? 0) - this.boardRows());
      this.scroll = Math.min(max, Math.max(0, this.scroll + step));
    }
    this.onChange();
  }

  enter() {
    if (this.mode !== 'search' || !this.results[this.selected]) return;
    this.stop = this.results[this.selected];
    this.mode = 'board';
    this.rows = null;
    this.scroll = 0;
    void this.loadBoard();
    window.clearInterval(this.refreshTimer);
    this.refreshTimer = window.setInterval(() => void this.loadBoard(true), REFRESH_MS);
    this.onChange();
  }

  back() {
    if (this.mode !== 'board') return;
    window.clearInterval(this.refreshTimer);
    this.mode = 'search';
    this.onChange();
  }

  private runSearch() {
    const id = ++this.searchId;
    const query = this.query.trim();
    this.selected = 0;
    if (query.length < 2) {
      this.results = [];
      this.searching = false;
      this.onChange();
      return;
    }
    this.searching = true;
    this.onChange();
    window.setTimeout(async () => {
      if (id !== this.searchId) return;
      const found = await api().then(({ searchStops }) => searchStops(query)).catch(() => [] as Stop[]);
      if (id !== this.searchId) return;
      const seen = new Set<string>();
      const lower = query.toLowerCase();
      this.results = found
        .filter(stop => {
          const key = `${stop.name}|${stop.city ?? ''}`.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort((a, b) => Number(!a.name.toLowerCase().startsWith(lower)) - Number(!b.name.toLowerCase().startsWith(lower)))
        .slice(0, MAX_RESULTS);
      this.searching = false;
      this.onChange();
    }, 180);
  }

  private async loadBoard(skipCache = false) {
    const stop = this.stop;
    if (!stop) return;
    const departures = await api()
      .then(({ getDepartures }) => getDepartures(stop.id, skipCache))
      .catch(() => [] as Departure[]);
    if (stop !== this.stop || this.mode !== 'board') return;
    this.rows = groupRows(departures);
    this.onChange();
  }

  private boardRows() {
    return ROWS - 8;
  }

  private passage(departure: Departure | undefined, blink: boolean) {
    if (!departure) return '';
    if (departure.departureTime <= 0) return blink ? '0' : ' ';
    if (departure.departureTime > 30) return clock(new Date(Date.now() + departure.departureTime * 60_000));
    return `${departure.departureTime} min`;
  }

  hasImminent() {
    return this.mode === 'board' && !!this.rows?.some(row => (row.first?.departureTime ?? 1) <= 0);
  }

  lines(blink: boolean): { text: string; inverse?: boolean }[] {
    const inner = COLS - 2;
    const out: { text: string; inverse?: boolean }[] = [];
    const bar = (left: string, right: string) => `${left}${'═'.repeat(inner)}${right}`;
    const row = (text: string) => `║${fit(text, inner)}║`;

    const title = this.mode === 'board' && this.stop ? this.stop.name.toUpperCase() : 'GreLines v1.0';
    const now = clock();
    out.push({ text: bar('╔', '╗') });
    out.push({ text: row(` ${fit(title, inner - now.length - 3)} ${now} `) });

    if (this.mode === 'search') {
      out.push({ text: bar('╚', '╝') });
      out.push({ text: '' });
      out.push({ text: ` ${this.copy.prompt}` });
      out.push({ text: ` > ${this.query}${blink ? '█' : ' '}` });
      out.push({ text: '' });
      const room = ROWS - out.length - 2;
      if (this.searching) out.push({ text: `   ${this.copy.searching}` });
      else if (this.query.trim().length >= 2 && !this.results.length) out.push({ text: `   ${this.copy.noStop}` });
      else {
        const start = Math.min(Math.max(0, this.selected - room + 1), Math.max(0, this.results.length - room));
        this.results.slice(start, start + room).forEach((stop, index) => {
          const active = start + index === this.selected;
          const city = stop.city ? fit(stop.city, 14) : '';
          out.push({ text: ` ${active ? '>' : ' '} ${fit(stop.name, COLS - 22)} ${city}`, inverse: active });
        });
      }
      while (out.length < ROWS - 1) out.push({ text: '' });
      out.push({ text: center(this.copy.searchHint, COLS) });
      return out;
    }

    const widths = [6, inner - 6 - 9 - 9 - 3, 9, 9];
    const cells = (values: string[], centered = false) =>
      `║${values.map((value, i) => (centered && i > 1 ? center(value, widths[i]) : fit(` ${value}`, widths[i]))).join('│')}║`;
    out.push({ text: bar('╠', '╣') });
    out.push({ text: cells([this.copy.line, this.copy.destination, this.copy.first, this.copy.second], true) });
    out.push({ text: bar('╠', '╣') });

    const room = this.boardRows();
    if (!this.rows) out.push({ text: row(` ${this.copy.loading}`) });
    else if (!this.rows.length) out.push({ text: row(` ${this.copy.noDeparture}`) });
    else {
      this.rows.slice(this.scroll, this.scroll + room).forEach(entry => {
        out.push({
          text: cells([entry.line, entry.destination, this.passage(entry.first, blink), this.passage(entry.second, blink)], true),
        });
      });
    }
    while (out.length < 5 + room) out.push({ text: row('') });
    out.push({ text: bar('╚', '╝') });
    while (out.length < ROWS - 1) out.push({ text: '' });
    out.push({ text: center(this.copy.boardHint, COLS) });
    return out;
  }
}
