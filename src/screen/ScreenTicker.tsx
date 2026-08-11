import { ExclamationTriangleIcon } from '@heroicons/react/24/solid';
import type { Line } from '../types';
import { MarqueeText } from '../components/MarqueeText';
import { stripHtml } from '../utils/stripHtml';











export function ScreenTicker({ lines }: { lines: Line[] }) {
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
    <footer className="flex h-11 flex-shrink-0 items-center gap-4 border-t border-[#1e293b] bg-[#0f172a] px-5 2xl:h-14 2xl:px-8">
      <ExclamationTriangleIcon
        className={`h-5 w-5 flex-shrink-0 2xl:h-6 2xl:w-6 ${hasTraffic ? 'text-amber-400' : 'text-slate-600'}`}
        aria-label="Info trafic"
      />

      <div className="min-w-0 flex-1">
        {hasTraffic ? (
          <MarqueeText
            text={messages.join('     •     ')}
            className="text-sm font-semibold text-amber-400 2xl:text-lg"
          />
        ) : (
          <p className="truncate text-sm font-medium text-slate-500 2xl:text-lg">
            Trafic normal sur les lignes desservies.
          </p>
        )}
      </div>
    </footer>
  );
}
