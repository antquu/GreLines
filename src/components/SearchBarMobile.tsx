import { MagnifyingGlassIcon, XMarkIcon, MapPinIcon, StopCircleIcon, ArrowsRightLeftIcon } from '@heroicons/react/24/solid';
import { useRef } from 'react';
import type { Line, SearchHistoryItem, Stop } from '../types';
import type { AddressResult } from '../services/geocoding';
import type { AllLinesLine } from '../services/allLines';
import { LineBadge } from './LineBadge';

interface SearchBarMobileProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  matchedStops: Stop[];
  matchedLines: AllLinesLine[];
  allLines: AllLinesLine[];
  matchedStopLines: Record<string, Line[]>;
  stops: Stop[];
  searchHistoryItems: SearchHistoryItem[];
  searchPlaceholder: string;
  unknownCityLabel: string;
  onStopClick: (stop: Stop) => void;
  onLineClick: (line: AllLinesLine) => void;
  isFocused: boolean;
  onFocus: (focused: boolean) => void;
  
  addressResults?: AddressResult[];
  
  onAddressClick?: (address: AddressResult) => void;
  language?: 'fr' | 'en';
  theme?: 'light' | 'dark';
  
  calculateItineraryWith?: string;
  /** Rend la barre dans le flux, pour l'en-tête de la feuille d'accueil. */
  inline?: boolean;
}

export const SearchBarMobile = ({
  searchQuery, onSearchChange, matchedStops, matchedLines, allLines, matchedStopLines, stops, searchHistoryItems,
  searchPlaceholder, unknownCityLabel, onStopClick, onLineClick, isFocused, onFocus,
  addressResults = [], onAddressClick, language = 'fr', theme = 'dark', inline = false,
}: SearchBarMobileProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const isLight = theme === 'light';

  const renderTerminusPair = (longName: string) => {
    const parts = longName.split('/').map(part => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return (
        <span className="inline-flex min-w-0 items-center gap-1 truncate">
          <span className="truncate">{parts[0]}</span>
          <ArrowsRightLeftIcon className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
          <span className="truncate">{parts[1]}</span>
        </span>
      );
    }
    return <span>{longName || 'Terminus inconnu'}</span>;
  };

  const hasResults = matchedStops.length > 0 || matchedLines.length > 0 || addressResults.length > 0;
  const showDropdown =
    isFocused &&
    (searchQuery.trim() !== ''
      ? true 
      : searchHistoryItems.length > 0);

  








  const closeAfterSelection = () => {
    inputRef.current?.blur();
    onSearchChange('');
    onFocus(false);
  };

  const handleSelectStop = (stop: Stop) => {
    closeAfterSelection();
    onStopClick(stop);
  };

  const handleSelectAddress = (address: AddressResult) => {
    closeAfterSelection();
    onAddressClick?.(address);
  };

  const renderStopLineBadges = (stopId: string) => {
    const lines = matchedStopLines[stopId] || [];
    if (lines.length === 0) return null;
    const visible = lines.slice(0, 4);
    const hiddenCount = lines.length - visible.length;
    return (
      <div className="flex shrink-0 items-center gap-1">
        {visible.map(line => (
          <LineBadge key={line.id} line={line} size="xs" />
        ))}
        {hiddenCount > 0 && (
          <span
            className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-1.5 text-[10px] font-extrabold ${
              isLight
                ? 'border-slate-200 bg-slate-50 text-slate-600'
                : 'border-white/10 bg-white/5 text-slate-300'
            }`}
            title={language === 'fr' ? `${hiddenCount} ligne${hiddenCount > 1 ? 's' : ''} supplémentaire${hiddenCount > 1 ? 's' : ''}` : `${hiddenCount} more line${hiddenCount > 1 ? 's' : ''}`}
          >
            +{hiddenCount}
          </span>
        )}
      </div>
    );
  };

  const handleSelectHistoryItem = (item: SearchHistoryItem) => {
    closeAfterSelection();
    if (item.kind === 'stop') {
      const stop = stops.find(candidate => candidate.id === item.id) || stops.find(candidate => candidate.name === item.name);
      if (stop) onStopClick(stop);
      return;
    }
    if (item.kind === 'line') {
      const line =
        allLines.find(candidate => candidate.id === item.id) ||
        allLines.find(candidate => candidate.shortName === item.shortName) ||
        matchedLines.find(candidate => candidate.id === item.id) ||
        matchedLines.find(candidate => candidate.shortName === item.shortName);
      if (line) onLineClick(line);
      return;
    }
    onAddressClick?.({
      id: item.id,
      label: item.name,
      name: item.name,
      context: item.context || '',
      lat: item.lat,
      lon: item.lon,
      score: 1,
    });
  };

  const stopsLabel = language === 'fr' ? 'Arrêts' : 'Stops';
  const addressesLabel = language === 'fr' ? 'Adresses' : 'Addresses';
  const noResultsLabel = language === 'fr' ? 'Aucun résultat' : 'No results';
  const clearLabel = language === 'fr' ? 'Effacer la recherche' : 'Clear search';
  const mobilePlaceholder = language === 'fr' ? 'On va où ?' : 'Where to?';

  return (
    // `inline` : la barre vit dans l'en-tête de la feuille d'accueil, où elle
    // remplace la barre d'onglets quand on tire la feuille vers le haut. Sinon
    // elle flotte en haut de la carte, comme avant.
    <div
      className={inline ? 'relative w-full' : 'fixed left-4 right-4 top-[max(0.75rem,env(safe-area-inset-top))]'}
      style={inline ? undefined : { zIndex: 5 }}
    >
      <div className="relative transition-all duration-300 ease-out">

        {/* Search input — wider on mobile, fixed at top */}
        <div
          className={`flex items-center gap-3 px-4 border backdrop-blur-xl shadow-2xl transition-all duration-300 rounded-[28px] ${
            isLight
              ? isFocused
                ? 'border-blue-300 bg-white shadow-blue-200/50'
                : 'border-slate-200 bg-white/95 shadow-slate-200/60'
              : isFocused
                ? 'border-emerald-300/50 bg-slate-950/95 shadow-emerald-950/30'
                : 'border-white/10 bg-slate-950/82 shadow-black/30'
          }`}
          style={{ height: '58px' }}
        >
          <MagnifyingGlassIcon className={`h-6 w-6 flex-shrink-0 ${isLight ? 'text-slate-500' : 'text-white/90'}`} />
          <input
            ref={inputRef}
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            onFocus={() => onFocus(true)}
            onBlur={() => { if (!searchQuery) onFocus(false); }}
            placeholder={isFocused ? searchPlaceholder : mobilePlaceholder}
            className={`min-w-0 flex-1 border-none bg-transparent text-[18px] font-semibold outline-none ${
              isLight ? 'text-slate-900 placeholder-slate-400' : 'text-white placeholder-slate-400'
            }`}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          {searchQuery && (
            <button
              onPointerDown={e => {
                e.preventDefault();
                onSearchChange('');
                inputRef.current?.focus();
              }}
              type="button"
              className={`w-7 h-7 flex items-center justify-center rounded-full flex-shrink-0 transition ${
                isLight ? 'bg-slate-200 active:bg-slate-300' : 'bg-slate-700 active:bg-slate-600'
              }`}
              aria-label={clearLabel}
            >
              <XMarkIcon className={`w-4 h-4 ${isLight ? 'text-slate-600' : 'text-slate-300'}`} />
            </button>
          )}
        </div>

        {/* Dropdown */}
        {showDropdown && (
          <div className={`absolute left-0 right-0 top-[66px] max-h-[68vh] overflow-y-auto rounded-[28px] border backdrop-blur-xl shadow-2xl ${
            isLight
              ? 'border-slate-200 bg-white/95 shadow-slate-300/50'
              : 'border-white/10 bg-[#15161a]/96 shadow-black/40'
          }`}>

            {searchQuery.trim() !== '' ? (
              <>
                {/* Lines first — when the user is searching for a line code */}
                {matchedLines.length > 0 && (
                  <>
                    <div className={`px-5 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      {language === 'fr' ? 'Lignes' : 'Lines'}
                    </div>
                    {matchedLines.map(line => (
                      <button
                        key={line.id}
                        type="button"
                        onPointerDown={e => {
                          e.preventDefault();
                          onLineClick(line);
                        }}
                        className={`flex w-full items-center gap-3 border-b px-5 py-4 text-left transition last:border-0 ${
                          isLight
                            ? 'border-slate-100 hover:bg-slate-50 active:bg-slate-100'
                            : 'border-white/10 hover:bg-white/5 active:bg-white/10'
                        }`}
                      >
                        <LineBadge line={line} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className={`truncate text-[17px] font-extrabold ${isLight ? 'text-slate-900' : 'text-white'}`}>{line.shortName}</div>
                          <div className={`mt-0.5 truncate text-sm ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                            {renderTerminusPair(line.longName)}
                          </div>
                        </div>
                      </button>
                    ))}
                  </>
                )}

                {/* Stops first — higher weight */}
                {matchedStops.length > 0 && (
                  <>
	                    <div className={`px-5 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      {stopsLabel}
                    </div>
                    {matchedStops.map(stop => (
                      <button
                        key={stop.id}
                        type="button"
                        onPointerDown={e => {
                          e.preventDefault();
                          handleSelectStop(stop);
                        }}
	                        className={`flex w-full items-center gap-3 border-b px-5 py-4 text-left transition last:border-0 ${
	                          isLight
	                            ? 'border-slate-100 hover:bg-slate-50 active:bg-slate-100'
	                            : 'border-white/10 hover:bg-white/5 active:bg-white/10'
	                        }`}
                      >
	                        <StopCircleIcon className={`h-6 w-6 flex-shrink-0 ${isLight ? 'text-slate-500' : 'text-white'}`} />
                        <div className="min-w-0 flex-1">
	                          <div className="flex min-w-0 items-center gap-2">
                              <div className={`min-w-0 truncate text-[17px] font-extrabold ${isLight ? 'text-slate-900' : 'text-white'}`}>{stop.name}</div>
                              {renderStopLineBadges(stop.id)}
                            </div>
	                          <div className={`mt-0.5 truncate text-sm ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{stop.city || unknownCityLabel}</div>
                        </div>
                      </button>
                    ))}
                  </>
                )}

                {/* Addresses below stops */}
                {addressResults.length > 0 && (
                  <>
	                    <div className={`border-t px-5 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider ${
	                      isLight ? 'border-slate-100 text-slate-500' : 'border-white/10 text-slate-400'
	                    }`}>
                      {addressesLabel}
                    </div>
                    {addressResults.map(addr => (
                      <button
                        key={addr.id}
                        type="button"
                        onPointerDown={e => {
                          e.preventDefault();
                          handleSelectAddress(addr);
                        }}
	                        className={`flex w-full items-center gap-3 border-b px-5 py-4 text-left transition last:border-0 ${
	                          isLight
	                            ? 'border-slate-100 hover:bg-slate-50 active:bg-slate-100'
	                            : 'border-white/10 hover:bg-white/5 active:bg-white/10'
	                        }`}
                      >
	                        <MapPinIcon className={`h-6 w-6 flex-shrink-0 ${isLight ? 'text-slate-500' : 'text-white'}`} />
                        <div className="min-w-0 flex-1">
	                          <div className={`truncate text-[17px] font-extrabold ${isLight ? 'text-slate-900' : 'text-white'}`}>{addr.name}</div>
	                          <div className={`mt-0.5 truncate text-sm ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{addr.context}</div>
                        </div>
                      </button>
                    ))}
                  </>
                )}

                {!hasResults && (
	                  <div className={`px-5 py-7 text-center text-sm ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    {noResultsLabel}
                  </div>
                )}
              </>
            ) : (
              <>
                      {searchHistoryItems.map((item, i) => {
                        return (
                    <button
                      key={`h-${i}`}
                      type="button"
                      onPointerDown={e => {
                        e.preventDefault();
                        handleSelectHistoryItem(item);
                      }}
	                      className={`w-full border-b px-5 py-4 text-left transition last:border-0 ${
	                        isLight
	                          ? 'border-slate-100 hover:bg-slate-50 active:bg-slate-100'
	                          : 'border-white/10 hover:bg-white/5 active:bg-white/10'
	                      }`}
                        >
                      <div className="flex items-start gap-3">
                        {item.kind === 'line' ? (
                          <LineBadge line={{ id: item.id, shortName: item.shortName }} size="sm" />
                        ) : item.kind === 'address' ? (
                          <MapPinIcon className={`h-5 w-5 flex-shrink-0 ${isLight ? 'text-amber-500' : 'text-amber-400'}`} />
                        ) : (
                          <StopCircleIcon className={`h-5 w-5 flex-shrink-0 ${isLight ? 'text-sky-500' : 'text-sky-400'}`} />
                        )}
                        <div className="min-w-0 flex-1">
	                          <div className="flex min-w-0 items-center gap-2">
                              <div className={`min-w-0 truncate text-[17px] font-extrabold ${isLight ? 'text-slate-900' : 'text-white'}`}>{item.kind === 'line' ? item.shortName : item.name}</div>
                              {item.kind === 'stop' && renderStopLineBadges(item.id)}
                            </div>
	                          <div className={`mt-0.5 truncate text-sm ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                            {item.kind === 'stop'
                              ? (stops.find(candidate => candidate.id === item.id)?.city || item.city || unknownCityLabel)
                              : item.kind === 'line'
                                ? item.longName
                                : item.context}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
