import manifest from '../data/tclLogos.json';

const TAB_CODES = Object.values((manifest as { tabs: Record<string, string> }).tabs);

export const tclTabImageUrl = (code: string) => `/assets/lignes/${encodeURIComponent(code)}.svg`;

const BADGE_IMAGE_URLS = [
  '/assets/ter.png',
  '/assets/ouigo.svg',
  '/assets/sncf-reseau.svg',
  '/assets/bus_relais.svg',
  '/assets/flixbus.png',
  '/assets/blablabus.png',
  ...TAB_CODES.map(tclTabImageUrl),
];

const ready = new Map<string, string>();
const decoded: HTMLImageElement[] = [];
let started = false;

export function badgeImage(url: string): string {
  return ready.get(url) ?? url;
}

export function preloadBadgeImages(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  for (const url of BADGE_IMAGE_URLS) {
    void fetch(url)
      .then(response => (response.ok ? response.blob() : null))
      .then(async blob => {
        if (!blob) return;
        const local = URL.createObjectURL(blob);
        const image = new Image();
        image.src = local;
        try { await image.decode(); } catch { }
        decoded.push(image);
        ready.set(url, local);
      })
      .catch(() => { });
  }
}
