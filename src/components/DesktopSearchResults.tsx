import type { ReactNode } from 'react';
import { ArrowsRightLeftIcon, MapPinIcon } from '@heroicons/react/24/solid';
import { TbBusStop } from 'react-icons/tb';
import type { Stop, SearchHistoryItem } from '../types';
import type { AddressResult } from '../services/geocoding';
import type { AllLinesLine } from '../services/allLines';
import { LineBadge } from './LineBadge';
import { PlaceIcon } from './PlaceIcon';
import { t } from '../i18n';

export function TerminusPair({ longName, language }: { longName: string; language: 'fr' | 'en' }) {
  const parts = longName.split('/').map(part => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1 truncate">
        <span className="truncate">{parts[0]}</span>
        <ArrowsRightLeftIcon className="w-3.5 h-3.5 shrink-0 text-slate-400" />
        <span className="truncate">{parts[1]}</span>
      </span>
    );
  }
  return <span>{longName || t(language).search.unknownTerminus}</span>;
}

const sectionClass = 'px-3 py-1.5 text-[0.625rem] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800';
const rowClass = 'w-full text-left px-3 py-2 hover:bg-slate-800 transition flex gap-2';

export function DesktopSearchResults({
  query,
  language,
  lines,
  stops,
  addresses,
  history,
  unknownCity,
  stopBadges,
  historyIcon,
  historySubtitle,
  onSelectLine,
  onSelectStop,
  onSelectAddress,
  onSelectHistory,
}: {
  query: string;
  language: 'fr' | 'en';
  lines: AllLinesLine[];
  stops: Stop[];
  addresses: AddressResult[];
  history: SearchHistoryItem[];
  unknownCity: string;
  stopBadges: (stopId: string) => ReactNode;
  historyIcon: (item: SearchHistoryItem) => ReactNode;
  historySubtitle: (item: SearchHistoryItem) => ReactNode;
  onSelectLine: (line: AllLinesLine) => void;
  onSelectStop: (stop: Stop) => void;
  onSelectAddress: (address: AddressResult) => void;
  onSelectHistory: (item: SearchHistoryItem) => void;
}) {
  const text = t(language).search;
  const searching = query.trim() !== '';

  if (!searching) {
    return (
      <>
        {history.map((item, index) => (
          <button
            key={`${item.kind}-${item.id}-${index}`}
            type="button"
            onMouseDown={event => { event.preventDefault(); onSelectHistory(item); }}
            className="w-full text-left px-3 py-2.5 hover:bg-slate-800 transition border-b border-slate-800 last:border-b-0"
          >
            <div className="flex items-start gap-2.5">
              {historyIcon(item)}
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="min-w-0 text-sm font-medium text-gray-100 truncate">
                    {item.kind === 'line' ? item.shortName : item.name}
                  </div>
                  {item.kind === 'stop' && stopBadges(item.id)}
                </div>
                <div className="text-xs text-gray-400 truncate">{historySubtitle(item)}</div>
              </div>
            </div>
          </button>
        ))}
      </>
    );
  }

  return (
    <>
      {lines.length > 0 && (
        <>
          <div className={sectionClass}>{text.lines}</div>
          {lines.map(line => (
            <button
              key={line.id}
              type="button"
              onMouseDown={event => { event.preventDefault(); onSelectLine(line); }}
              className={`${rowClass} items-center`}
            >
              <LineBadge line={line} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-gray-100 truncate">{line.shortName}</div>
                <div className="text-xs text-slate-400 truncate">
                  <TerminusPair longName={line.longName} language={language} />
                </div>
              </div>
            </button>
          ))}
        </>
      )}

      {stops.length > 0 && (
        <>
          <div className={sectionClass}>{text.stops}</div>
          {stops.map(stop => (
            <button
              key={stop.id}
              type="button"
              onMouseDown={event => { event.preventDefault(); onSelectStop(stop); }}
              className={`${rowClass} items-start`}
            >
              <TbBusStop className="w-4 h-4 text-blue-400 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="min-w-0 truncate text-sm font-medium text-gray-100">{stop.name}</div>
                  {stopBadges(stop.id)}
                </div>
                <div className="text-xs text-gray-400 truncate">{stop.city || unknownCity}</div>
              </div>
            </button>
          ))}
        </>
      )}

      {addresses.length > 0 && (
        <>
          <div className={`${sectionClass} border-t`}>{text.addresses}</div>
          {addresses.map(address => (
            <button
              key={address.id}
              type="button"
              onMouseDown={event => { event.preventDefault(); onSelectAddress(address); }}
              className={`${rowClass} items-center`}
            >
              <PlaceIcon
                category={address.category}
                className="w-4 h-4 flex-shrink-0"
                fallback={<MapPinIcon className="w-4 h-4 text-amber-400 flex-shrink-0" />}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-gray-100 truncate">{address.name}</div>
                <div className="text-xs text-gray-400 truncate">{address.context}</div>
              </div>
            </button>
          ))}
        </>
      )}

      {stops.length === 0 && addresses.length === 0 && (
        <div className="px-3 py-4 text-center text-xs text-gray-500">{text.noResults}</div>
      )}
    </>
  );
}
