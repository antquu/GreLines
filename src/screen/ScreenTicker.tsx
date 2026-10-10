import { ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import type { Line } from '../types';
import { MarqueeText } from '../components/MarqueeText';
import { stripHtml } from '../utils/stripHtml';
import { appLanguage } from '../utils/appLanguage';
import { tx } from '../i18n';

export function ScreenTicker({ lines }: { lines: Line[] }) {
  const text = tx(appLanguage() === 'fr').screenBoard;
  const messages: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    for (const detail of line.trafficDetails ?? []) {
      const title = stripHtml(detail.titre || '').replace(/\s+/g, ' ').trim();
      if (!title) continue;
      const label = `${line.shortName || line.id} · ${title}`;
      if (seen.has(label)) continue;
      seen.add(label);
      messages.push(label);
    }
  }

  const hasTraffic = messages.length > 0;

  return (
    <footer className="flex h-16 flex-shrink-0 items-center gap-5 border-t border-black/10 px-8 2xl:h-20 2xl:px-12">
      <img src="/assets/GreLinesWordmark.png" alt="GreLines" className="h-4 w-auto flex-shrink-0 opacity-60 2xl:h-5" style={{ filter: 'brightness(0)' }} />
      <span className="h-6 w-px flex-shrink-0 bg-black/10" aria-hidden="true" />
      <ExclamationTriangleIcon
        className={`h-6 w-6 flex-shrink-0 2xl:h-7 2xl:w-7 ${hasTraffic ? 'text-amber-600' : 'text-neutral-300'}`}
        aria-label={text.trafficInfo}
      />
      <div className="min-w-0 flex-1">
        {hasTraffic ? (
          <MarqueeText text={messages.join('     •     ')} className="text-lg font-medium text-amber-600 2xl:text-2xl" />
        ) : (
          <p className="truncate text-lg font-medium text-neutral-500 2xl:text-2xl">{text.trafficNormal}</p>
        )}
      </div>
    </footer>
  );
}
